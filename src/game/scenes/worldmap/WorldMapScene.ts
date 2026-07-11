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
import {
    createSceneBackdrop,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from '../shared/sceneTheme';

export const WORLD_MAP_CACHE_KEY = 'worldMapShell';
const WORLD_MAP_SUPPORT_COPY = '云阶城镇与试炼入口都已标在图上。拖拽舆图，选定下一段路。';

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

        this.cameras.main.setBackgroundColor(sceneTheme.colors.night);
        container.add(createSceneBackdrop(this));

        container.add(this.add.text(width / 2, 82, this.worldMap.title, getSceneTextStyle('sceneTitle')).setOrigin(0.5));
        container.add(this.add.text(width / 2, 138, this.worldMap.subtitle, getSceneTextStyle('sceneSubtitle')).setOrigin(0.5));

        const panelWidth = Math.min(1560, width - 220);
        const panelHeight = Math.min(812, height - 220);
        const panelX = width / 2;
        const panelY = height / 2 + 70;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelLeft + 64;
        container.add(createScenePanel(this, {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
        }));

        container.add(this.add.text(contentX, panelTop + 56, '山麓舆图', getSceneTextStyle('panelTitle')));
        container.add(this.add.text(contentX, panelTop + 108, WORLD_MAP_SUPPORT_COPY, getSceneTextStyle('body', {
            wordWrap: { width: panelWidth - 128 },
        })));

        const statusLine = createStatusLine(this, {
            x: panelX,
            y: panelTop + 224,
            width: panelWidth - 140,
            text: this.getDefaultStatusText(),
        });
        this.statusText = statusLine.text;
        container.add(statusLine.objects);

        const mapViewport = {
            left: panelLeft + 54,
            top: panelTop + 286,
            width: panelWidth - 108,
            height: panelHeight - 340,
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
            sceneTheme.colors.ink,
            0.92,
        );
        viewportBackground.setStrokeStyle(2, sceneTheme.colors.gold, 0.28);
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
        frame.setStrokeStyle(4, sceneTheme.colors.gold, 0.54);
        container.add(frame);

        const hint = this.add.text(viewport.left + 22, viewport.top + 18, '拖拽舆图查看远近 · 点击地标启程', getSceneTextStyle('support', {
            color: '#f3ead3',
            backgroundColor: '#493824cc',
            padding: { x: 12, y: 7 },
        }));
        container.add(hint);
    }

    private createMapSurfaceBackdrop(): Phaser.GameObjects.Rectangle {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const backdrop = this.add.rectangle(0, 0, mapWidth, mapHeight, sceneTheme.colors.panel, 1);
        backdrop.setOrigin(0, 0);
        backdrop.setStrokeStyle(6, sceneTheme.colors.slate, 1);

        return backdrop;
    }

    private createMapTerrainArtwork(): Phaser.GameObjects.Graphics {
        const { mapWidth, mapHeight } = this.worldMap.presentation;
        const graphics = this.add.graphics();

        graphics.fillStyle(sceneTheme.colors.jade, 0.24);
        graphics.fillEllipse(mapWidth * 0.28, mapHeight * 0.66, 760, 340);
        graphics.fillStyle(sceneTheme.colors.gold, 0.16);
        graphics.fillEllipse(mapWidth * 0.58, mapHeight * 0.4, 780, 360);
        graphics.fillStyle(sceneTheme.colors.ember, 0.18);
        graphics.fillEllipse(mapWidth * 0.74, mapHeight * 0.74, 460, 250);

        graphics.lineStyle(5, sceneTheme.colors.parchmentSoft, 0.18);
        graphics.beginPath();
        graphics.moveTo(mapWidth * 0.18, mapHeight * 0.74);
        graphics.lineTo(mapWidth * 0.35, mapHeight * 0.62);
        graphics.lineTo(mapWidth * 0.52, mapHeight * 0.38);
        graphics.lineTo(mapWidth * 0.68, mapHeight * 0.52);
        graphics.lineTo(mapWidth * 0.8, mapHeight * 0.74);
        graphics.strokePath();

        graphics.lineStyle(2, sceneTheme.colors.gold, 0.1);
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
        const markerLabel = destination.kind === 'hub' ? '驻地' : '秘境';

        const aura = this.add.circle(0, 0, 56, palette.fill, 0.18);
        const pin = this.add.circle(0, 0, 34, palette.fill, 0.98);
        pin.setStrokeStyle(4, palette.stroke, 0.95);
        pin.setInteractive({ useHandCursor: true });

        const glyph = this.add.text(0, -1, this.getDestinationMarkerGlyph(destination), {
            fontFamily: sceneTheme.fonts.display,
            fontSize: '24px',
            color: '#f3ead3',
            stroke: '#140f0a',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const labelPanelWidth = Math.max(148, destination.label.length * 25);
        const labelPanel = this.add.rectangle(0, 64, labelPanelWidth, 66, sceneTheme.colors.panelInner, 0.86);
        labelPanel.setStrokeStyle(2, palette.stroke, 0.48);
        const label = this.add.text(0, 46, destination.label, {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '20px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const region = this.add.text(0, 72, `${destination.presentation.regionLabel} · ${markerLabel}`, {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: '#d9c6a2',
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
                fill: sceneTheme.colors.jade,
                hoverFill: sceneTheme.colors.jadeBright,
                stroke: sceneTheme.colors.goldSoft,
            };
        }

        return {
            fill: sceneTheme.colors.ember,
            hoverFill: sceneTheme.colors.emberBright,
            stroke: sceneTheme.colors.goldSoft,
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
        const travelSummary = destination.kind === 'hub'
            ? '可在此落脚整备。'
            : '可在此深入试炼。';

        this.statusText.setText(
            `${destination.presentation.regionLabel} · ${destination.label}\n${travelSummary} ${destination.description}`,
        );
    }

    private restoreDefaultStatusText(): void {
        this.statusText.setText(this.getDefaultStatusText());
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

        this.statusText.setText(destination?.statusText ?? '已启程，正在赶往选中的地点。');
        this.scene.start(intent.sceneKey, intent.payload);
    }

    private getDefaultStatusText(): string {
        return this.returnStatusText ?? '拖拽舆图查看山势，指向地标听闻动向，选定后即可启程。';
    }
}
