import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
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

        this.cameras.main.setBackgroundColor(0x07111f);
        container.add(this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1));
        container.add(this.add.circle(width * 0.22, height * 0.24, 360, 0x0ea5e9, 0.13));
        container.add(this.add.circle(width * 0.78, height * 0.72, 420, 0x22c55e, 0.11));

        container.add(this.add.text(width / 2, 78, this.worldMap.title, {
            fontFamily: 'Arial Black',
            fontSize: '50px',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 132, this.worldMap.subtitle, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#bfdbfe',
        }).setOrigin(0.5));

        const panelWidth = Math.min(1580, width - 220);
        const panelHeight = Math.min(800, height - 240);
        const panelX = width / 2;
        const panelY = height / 2 + 70;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelLeft + 60;
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x38bdf8, 0.82);
        container.add(panel);

        container.add(this.add.text(contentX, panelTop + 54, '可前往地点', {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#fef3c7',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(contentX, panelTop + 104, this.worldMap.description, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#dbeafe',
            lineSpacing: 8,
            wordWrap: { width: panelWidth - 120 },
        }));

        this.statusText = this.add.text(contentX, panelTop + 182, WORLD_MAP_FALLBACK_STATUS_TEXT, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#fde68a',
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
            0x020617,
            1,
        );
        viewportBackground.setStrokeStyle(2, 0x0ea5e9, 0.4);
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
        maskShape.fillStyle(0xffffff, 1);
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
            0x000000,
            0,
        );
        frame.setStrokeStyle(4, 0x38bdf8, 0.74);
        container.add(frame);

        const hint = this.add.text(viewport.left + 24, viewport.top + 18, '拖拽地图查看周边 · 点击标记进入', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#bae6fd',
            backgroundColor: '#0f172acc',
            padding: { x: 12, y: 7 },
        });
        container.add(hint);
    }

    private createMapSurfaceBackdrop(): Phaser.GameObjects.Rectangle {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const backdrop = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x0b1220, 1);
        backdrop.setOrigin(0, 0);
        backdrop.setStrokeStyle(6, 0x1e293b, 1);

        return backdrop;
    }

    private createMapTerrainArtwork(): Phaser.GameObjects.Graphics {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const graphics = this.add.graphics();

        graphics.fillStyle(0x0f2f2f, 0.42);
        graphics.fillEllipse(mapWidth * 0.32, mapHeight * 0.68, 720, 330);
        graphics.fillStyle(0x164e63, 0.34);
        graphics.fillEllipse(mapWidth * 0.62, mapHeight * 0.42, 760, 390);
        graphics.fillStyle(0x3f2d20, 0.35);
        graphics.fillEllipse(mapWidth * 0.76, mapHeight * 0.74, 480, 260);

        graphics.lineStyle(5, 0x94a3b8, 0.2);
        graphics.beginPath();
        graphics.moveTo(mapWidth * 0.18, mapHeight * 0.74);
        graphics.lineTo(mapWidth * 0.35, mapHeight * 0.62);
        graphics.lineTo(mapWidth * 0.52, mapHeight * 0.38);
        graphics.lineTo(mapWidth * 0.68, mapHeight * 0.52);
        graphics.lineTo(mapWidth * 0.8, mapHeight * 0.74);
        graphics.strokePath();

        graphics.lineStyle(2, 0x7dd3fc, 0.11);
        for (let x = 120; x < mapWidth; x += 160) {
            graphics.lineBetween(x, 0, x, mapHeight);
        }
        for (let y = 100; y < mapHeight; y += 140) {
            graphics.lineBetween(0, y, mapWidth, y);
        }

        return graphics;
    }

    private createDestinationMarker(destination: WorldMapDestination): Phaser.GameObjects.Container {
        const position = getWorldMapDestinationSurfacePosition(this.worldMap, destination);
        const marker = this.add.container(position.x, position.y);
        const palette = this.getDestinationMarkerPalette(destination);
        const markerLabel = destination.kind === 'hub' ? 'Hub' : '秘境';

        const aura = this.add.circle(0, 0, 56, palette.fill, 0.18);
        const pin = this.add.circle(0, 0, 34, palette.fill, 0.98);
        pin.setStrokeStyle(4, palette.stroke, 0.95);
        pin.setInteractive({ useHandCursor: true });

        const glyph = this.add.text(0, -1, this.getDestinationMarkerGlyph(destination), {
            fontFamily: 'Arial Black',
            fontSize: '24px',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const labelPanelWidth = Math.max(148, destination.label.length * 25);
        const labelPanel = this.add.rectangle(0, 62, labelPanelWidth, 62, 0x020617, 0.82);
        labelPanel.setStrokeStyle(2, palette.stroke, 0.48);
        const label = this.add.text(0, 47, destination.label, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const region = this.add.text(0, 72, `${destination.presentation.regionLabel} · ${markerLabel}`, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#bae6fd',
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
            pin.setFillStyle(palette.fill, 0.98);
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
                fill: 0x2563eb,
                hoverFill: 0x38bdf8,
                stroke: 0xbfdbfe,
            };
        }

        return {
            fill: 0x16a34a,
            hoverFill: 0x22c55e,
            stroke: 0xdcfce7,
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
