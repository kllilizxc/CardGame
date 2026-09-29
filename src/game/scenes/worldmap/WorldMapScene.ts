import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { ensureBackdrop } from '../../art/backdrop';
import { pixelPanel, PANEL_INK } from '../../art/ui';
import { bakeTerrain } from '../../art/terrain';
import { C } from '../../art/palette';
import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
    QINGYUN_WORLD_MAP_RESOURCE_ID,
    createContentCatalogResolver,
} from '../../content/contentCatalog';
import {
    clampWorldMapSurfacePosition,
    createWorldMapInitialSurfacePosition,
    createWorldMapDestinationIntent,
    getWorldMapDestinationSurfacePosition,
    shouldActivateWorldMapMarker,
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapDestination,
    type WorldMapReturnPayload,
    type WorldMapSurfacePosition,
    type WorldMapViewport,
} from './worldMap';

export const WORLD_MAP_CACHE_KEY = 'worldMapShell';
const WORLD_MAP_FALLBACK_STATUS_TEXT = '拖拽地图平移，点击标记前往目的地。';
const WORLD_MAP_NAVIGATION_STATUS_TEXT = '正在前往目标地。';

export class WorldMapScene extends Scene {
    private worldMap!: WorldMapDefinition;
    private worldMapPublicPath?: string;
    private statusText!: Phaser.GameObjects.Text;
    private shellContainer?: Phaser.GameObjects.Container;
    private mapSurfaceContainer?: Phaser.GameObjects.Container;
    private mapViewport?: WorldMapViewport;
    private mapDragState?: {
        startPointerX: number;
        startPointerY: number;
        startSurfaceX: number;
        startSurfaceY: number;
    };
    private returnStatusText?: string;
    private readonly dragDistanceThreshold = 8;

    constructor() {
        super('WorldMapScene');
    }

    init(data?: WorldMapReturnPayload): void {
        this.returnStatusText = data?.statusText;
    }

    preload(): void {
        const catalogResolver = createContentCatalogResolver(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            {
                context: 'WorldMapScene',
                sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
            },
        );
        const worldMapResource = catalogResolver.resolveJsonResource({
            resourceId: QINGYUN_WORLD_MAP_RESOURCE_ID,
            expectedKind: 'worldMap',
        });
        this.worldMapPublicPath = worldMapResource.publicPath;

        this.load.json(WORLD_MAP_CACHE_KEY, worldMapResource.publicPath);
    }

    create(): void {
        this.worldMap = this.readValidatedWorldMapResource();
        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private readValidatedWorldMapResource(): WorldMapDefinition {
        const rawWorldMap = this.cache.json.get(WORLD_MAP_CACHE_KEY);
        const publicPath = this.worldMapPublicPath ?? 'unresolved public path';

        if (rawWorldMap === undefined) {
            throw new Error(
                `WorldMapScene failed to load catalog resource ${QINGYUN_WORLD_MAP_RESOURCE_ID} from public/${publicPath}: JSON cache key ${WORLD_MAP_CACHE_KEY} is missing after preload.`,
            );
        }

        try {
            return validateWorldMapDefinition(rawWorldMap);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `WorldMapScene failed to validate catalog resource ${QINGYUN_WORLD_MAP_RESOURCE_ID} from public/${publicPath}: ${message}`,
            );
        }
    }

    private renderShell(): void {
        this.shellContainer?.destroy();
        this.mapSurfaceContainer = undefined;
        this.mapViewport = undefined;
        this.mapDragState = undefined;

        const { width, height } = this.scale;
        const container = this.add.container(0, 0);

        this.cameras.main.setBackgroundColor(0x0b0714);
        ensureBackdrop(this, 'mountain', 'dusk');

        container.add(this.add.text(width / 2, 78, this.worldMap.title, {
            fontFamily: 'Arial Black',
            fontSize: '50px',
            color: '#f4ecd8',
            stroke: '#0b0714',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 132, this.worldMap.subtitle, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#a0e8f8',
        }).setOrigin(0.5));

        const panelWidth = Math.min(1580, width - 220);
        const panelHeight = Math.min(800, height - 240);
        const panelX = width / 2;
        const panelY = height / 2 + 70;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelLeft + 60;
        container.add(pixelPanel(this, panelX, panelY, panelWidth, panelHeight, { ...PANEL_INK, alpha: 0.93 }));

        container.add(this.add.text(contentX, panelTop + 54, '可前往地点', {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(contentX, panelTop + 104, this.worldMap.description, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#cfc6dd',
            lineSpacing: 8,
            wordWrap: { width: panelWidth - 120 },
        }));

        this.statusText = this.add.text(contentX, panelTop + 182, WORLD_MAP_FALLBACK_STATUS_TEXT, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#fff07a',
            wordWrap: { width: panelWidth - 120 },
        });
        this.statusText.setText(this.returnStatusText ?? WORLD_MAP_FALLBACK_STATUS_TEXT);
        container.add(this.statusText);

        const mapViewport = {
            left: panelLeft + 50,
            top: panelTop + 248,
            width: panelWidth - 100,
            height: panelHeight - 302,
        };
        this.mapViewport = mapViewport;
        this.renderMapSurface(container, mapViewport);
        this.registerMapInputHandlers();

        this.shellContainer = container;
    }

    private renderMapSurface(container: Phaser.GameObjects.Container, viewport: WorldMapViewport): void {
        const viewportCenterX = viewport.left + viewport.width / 2;
        const viewportCenterY = viewport.top + viewport.height / 2;
        const viewportBackground = this.add.rectangle(
            viewportCenterX,
            viewportCenterY,
            viewport.width,
            viewport.height,
            0x0b0714,
            1,
        );
        viewportBackground.setStrokeStyle(2, 0xffc040, 0.4);
        container.add(viewportBackground);

        const initialSurfacePosition = createWorldMapInitialSurfacePosition(this.worldMap.presentation, viewport);
        const surface = this.add.container(initialSurfacePosition.x, initialSurfacePosition.y);
        this.mapSurfaceContainer = surface;

        surface.add(this.createMapSurfaceBackdrop());
        surface.add(this.createMapTerrainArtwork());
        this.worldMap.destinations.forEach((destination) => {
            surface.add(this.createDestinationMarker(destination));
        });

        const maskShape = this.add.graphics();
        maskShape.fillStyle(0xf4ecd8, 1);
        maskShape.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
        maskShape.setVisible(false);
        surface.setMask(maskShape.createGeometryMask());

        container.add(surface);
        container.add(maskShape);

        const frame = this.add.rectangle(
            viewportCenterX,
            viewportCenterY,
            viewport.width,
            viewport.height,
            0x0b0714,
            0,
        );
        frame.setStrokeStyle(4, 0xffc040, 0.74);
        container.add(frame);

        const hint = this.add.text(viewport.left + 24, viewport.top + 18, '拖拽地图查看周边 · 点击标记进入', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#a0e8f8',
            backgroundColor: '#160f26cc',
            padding: { x: 12, y: 7 },
        });
        container.add(hint);
    }

    private createMapSurfaceBackdrop(): Phaser.GameObjects.Rectangle {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const backdrop = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x160f26, 1);
        backdrop.setOrigin(0, 0);
        backdrop.setStrokeStyle(6, 0x221a3d, 1);

        return backdrop;
    }

    private createMapTerrainArtwork(): Phaser.GameObjects.Image {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const route: Array<[number, number]> = [
            [mapWidth * 0.18, mapHeight * 0.74],
            [mapWidth * 0.35, mapHeight * 0.62],
            [mapWidth * 0.52, mapHeight * 0.38],
            [mapWidth * 0.68, mapHeight * 0.52],
            [mapWidth * 0.8, mapHeight * 0.74],
        ];
        const key = bakeTerrain(this, `terrain_${mapWidth}x${mapHeight}`, mapWidth, mapHeight, route);
        return this.add.image(0, 0, key).setOrigin(0, 0).setScale(4);
    }

    private createDestinationMarker(destination: WorldMapDestination): Phaser.GameObjects.Container {
        const position = getWorldMapDestinationSurfacePosition(this.worldMap, destination);
        const marker = this.add.container(position.x, position.y);
        const palette = this.getDestinationMarkerPalette(destination);
        const markerLabel = destination.kind === 'hub' ? 'Hub' : '秘境';

        const aura = this.add.rectangle(0, 0, 112, 112, palette.fill, 0.22);
        this.tweens.add({ targets: aura, scale: 1.25, alpha: 0.05, duration: 1200, repeat: -1, ease: 'Stepped', easeParams: [4] });
        const pin = this.add.rectangle(0, 0, 68, 68, palette.fill, 1);
        (pin as unknown as { deco: boolean }).deco = true;
        pin.setStrokeStyle(4, palette.stroke, 1);
        pin.setInteractive({ useHandCursor: true });

        const glyph = this.add.text(0, -1, this.getDestinationMarkerGlyph(destination), {
            fontFamily: 'Arial Black',
            fontSize: '24px',
            color: '#f4ecd8',
            stroke: '#0b0714',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const labelPanelWidth = Math.max(148, destination.label.length * 25);
        const labelPanel = this.add.rectangle(0, 62, labelPanelWidth, 62, 0x0b0714, 0.82);
        labelPanel.setStrokeStyle(2, palette.stroke, 0.48);
        const label = this.add.text(0, 47, destination.label, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const region = this.add.text(0, 72, `${destination.presentation.regionLabel} · ${markerLabel}`, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#a0e8f8',
        }).setOrigin(0.5);

        let pointerDownPosition: WorldMapSurfacePosition | undefined;
        pin.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (!this.isPointerInsideMapViewport(pointer)) {
                return;
            }

            pointerDownPosition = { x: pointer.x, y: pointer.y };
            pin.setFillStyle(palette.hoverFill, 1);
            this.previewDestination(destination);
        });
        pin.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (!pointerDownPosition || !this.isPointerInsideMapViewport(pointer)) {
                pointerDownPosition = undefined;
                return;
            }

            const shouldActivate = shouldActivateWorldMapMarker(
                pointerDownPosition,
                { x: pointer.x, y: pointer.y },
                this.dragDistanceThreshold,
            );
            pointerDownPosition = undefined;

            if (shouldActivate) {
                this.handleDestinationSelected(destination.id);
                return;
            }

            this.restoreDefaultStatusText();
        });
        pin.on('pointerover', (pointer: Phaser.Input.Pointer) => {
            if (this.isPointerInsideMapViewport(pointer)) {
                pin.setFillStyle(palette.hoverFill, 1);
                this.previewDestination(destination);
            }
        });
        pin.on('pointerout', () => {
            pin.setFillStyle(palette.fill, 1);
            this.restoreDefaultStatusText();
        });

        marker.add([aura, pin, glyph, labelPanel, label, region]);

        return marker;
    }

    private getDestinationMarkerPalette(destination: WorldMapDestination): {
        fill: number;
        hoverFill: number;
        stroke: number;
    } {
        if (destination.kind === 'hub') {
            return {
                fill: C.crimson,
                hoverFill: C.cinnabar,
                stroke: C.gold,
            };
        }

        return {
            fill: C.moss,
            hoverFill: C.jade,
            stroke: C.lime,
        };
    }

    private getDestinationMarkerGlyph(destination: WorldMapDestination): string {
        const markerGlyphs: Record<string, string> = {
            town: '镇',
            'sect-gate': '宗',
            teahouse: '茶',
            trial: '试',
            cave: '洞',
        };

        return markerGlyphs[destination.presentation.icon] ?? (destination.kind === 'hub' ? '驿' : '境');
    }

    private previewDestination(destination: WorldMapDestination): void {
        const sceneLabel = destination.kind === 'hub' ? 'HubScene' : 'ExpeditionScene';

        this.statusText.setText(
            `${destination.presentation.regionLabel} · ${destination.label}（${sceneLabel}）\n${destination.description}`,
        );
    }

    private restoreDefaultStatusText(): void {
        this.statusText.setText(this.returnStatusText ?? WORLD_MAP_FALLBACK_STATUS_TEXT);
    }

    private registerMapInputHandlers(): void {
        this.input.off('pointerdown', this.handleMapPointerDown, this);
        this.input.off('pointermove', this.handleMapPointerMove, this);
        this.input.off('pointerup', this.handleMapPointerUp, this);
        this.input.on('pointerdown', this.handleMapPointerDown, this);
        this.input.on('pointermove', this.handleMapPointerMove, this);
        this.input.on('pointerup', this.handleMapPointerUp, this);
    }

    private handleMapPointerDown(pointer: Phaser.Input.Pointer): void {
        if (!this.mapSurfaceContainer || !this.isPointerInsideMapViewport(pointer)) {
            return;
        }

        this.mapDragState = {
            startPointerX: pointer.x,
            startPointerY: pointer.y,
            startSurfaceX: this.mapSurfaceContainer.x,
            startSurfaceY: this.mapSurfaceContainer.y,
        };
    }

    private handleMapPointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.mapDragState || !this.mapSurfaceContainer || !this.mapViewport || !pointer.isDown) {
            return;
        }

        const deltaX = pointer.x - this.mapDragState.startPointerX;
        const deltaY = pointer.y - this.mapDragState.startPointerY;
        const clampedPosition = clampWorldMapSurfacePosition(this.worldMap.presentation, this.mapViewport, {
            x: this.mapDragState.startSurfaceX + deltaX,
            y: this.mapDragState.startSurfaceY + deltaY,
        });

        this.mapSurfaceContainer.setPosition(clampedPosition.x, clampedPosition.y);
    }

    private handleMapPointerUp(): void {
        this.mapDragState = undefined;
    }

    private isPointerInsideMapViewport(pointer: Phaser.Input.Pointer): boolean {
        if (!this.mapViewport) {
            return false;
        }

        return pointer.x >= this.mapViewport.left
            && pointer.x <= this.mapViewport.left + this.mapViewport.width
            && pointer.y >= this.mapViewport.top
            && pointer.y <= this.mapViewport.top + this.mapViewport.height;
    }

    private handleDestinationSelected(destinationId: string): void {
        const intent = createWorldMapDestinationIntent(this.worldMap, destinationId);
        const destination = this.worldMap.destinations.find((candidate) => candidate.id === destinationId);

        this.statusText.setText(
            destination?.statusText ?? `${destination?.label ? `正在前往 ${destination.label}。` : WORLD_MAP_NAVIGATION_STATUS_TEXT}`,
        );
        this.scene.start(intent.sceneKey, intent.payload);
    }
}
