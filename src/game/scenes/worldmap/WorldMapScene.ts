import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { ensureBackdrop } from '../../art/backdrop';
import { bakeTerrain } from '../../art/terrain';
import { PANEL_INK, pixelPanel } from '../../art/ui';
import { isPortraitGameViewport } from '../../layout/gameViewport';
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
    createSceneButton,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from '../shared/sceneTheme';
import { QuestJournalOverlay, savedQuestJournalEntries } from '../shared/questJournalOverlay';

export const WORLD_MAP_CACHE_KEY = 'worldMapShell';
const WORLD_MAP_SUPPORT_COPY = '云阶城镇与试炼入口都已标在图上。拖拽舆图，选定下一段路。';

export class WorldMapScene extends Scene {
    private worldMap!: WorldMapDefinition;
    private worldMapPublicPath?: string;
    private statusText!: Phaser.GameObjects.Text;
    private shellContainer?: Phaser.GameObjects.Container;
    private mapSurfaceContainer?: Phaser.GameObjects.Container;
    private mapViewport?: WorldMapViewport;
    private questJournal!: QuestJournalOverlay;
    private mapDragState?: {
        startPointerX: number;
        startPointerY: number;
        startSurfaceX: number;
        startSurfaceY: number;
    };
    private returnStatusText?: string;
    private portraitPage = 0;
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
        this.questJournal = new QuestJournalOverlay(this);
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
        this.questJournal.close();
        this.shellContainer?.destroy();
        this.mapSurfaceContainer = undefined;
        this.mapViewport = undefined;
        this.mapDragState = undefined;
        if (isPortraitGameViewport(this.scale.width, this.scale.height)) {
            this.renderPortraitShell();
            return;
        }

        const { width, height } = this.scale;
        const container = this.add.container(0, 0);

        this.cameras.main.setBackgroundColor(0x0b0714);
        ensureBackdrop(this, 'mountain', 'dusk');

        const margin = 28;
        const panelX = width / 2;
        const panelY = height / 2;
        const panelWidth = width - margin * 2;
        const panelHeight = height - margin * 2;
        container.add(pixelPanel(this, panelX, panelY, panelWidth, panelHeight, { ...PANEL_INK, alpha: 0.93 }));

        const left = margin + 28;
        container.add(this.add.text(left, margin + 20, this.worldMap.title, getSceneTextStyle('sceneTitle', { fontSize: '48px' })));
        container.add(this.add.text(left + 8, margin + 78, `${this.worldMap.subtitle} · ${WORLD_MAP_SUPPORT_COPY}`, getSceneTextStyle('support', {
            wordWrap: { width: panelWidth - 420 },
        })));
        if (savedQuestJournalEntries().length) {
            container.add(createSceneButton(this, { x: width - margin - 28 - 110, y: margin + 52,
                width: 220, height: 52, label: '任务日志', variant: 'secondary',
                onClick: () => { this.mapDragState = undefined; this.questJournal.open(); } }).objects);
        }

        const mapViewport = {
            left: margin + 20,
            top: margin + 116,
            width: panelWidth - 40,
            height: panelHeight - 116 - 72,
        };
        const statusLine = createStatusLine(this, {
            x: panelX,
            y: height - margin - 38,
            width: panelWidth - 56,
            text: this.getDefaultStatusText(),
        });
        this.statusText = statusLine.text;
        container.add(statusLine.objects);
        this.mapViewport = mapViewport;
        this.renderMapSurface(container, mapViewport);
        this.registerMapInputHandlers();

        this.shellContainer = container;
    }

    private renderPortraitShell(): void {
        const { width } = this.scale;
        const container = this.add.container(0, 0);
        this.cameras.main.setBackgroundColor(sceneTheme.colors.night);
        ensureBackdrop(this, 'mountain', 'dusk');
        container.add(this.add.text(width / 2, 78, this.worldMap.title, getSceneTextStyle('sceneTitle', {
            fontSize: '43px', wordWrap: { width: width - 36 }, align: 'center',
        })).setOrigin(0.5));
        container.add(this.add.text(width / 2, 138, this.worldMap.subtitle, getSceneTextStyle('sceneSubtitle', {
            fontSize: '19px', wordWrap: { width: width - 52 }, align: 'center',
        })).setOrigin(0.5));
        container.add(createScenePanel(this, { x: width / 2, y: 560, width: width - 32, height: 790 }));
        container.add(this.add.text(48, 216, '山麓舆图', getSceneTextStyle('panelTitle', { fontSize: '29px' })));
        if (savedQuestJournalEntries().length) {
            container.add(createSceneButton(this, { x: width - 110, y: 216, width: 170, height: 52,
                label: '任务日志', variant: 'secondary', onClick: () => this.questJournal.open() }).objects);
        }
        container.add(this.add.text(48, 270, '选择目的地，启程前往。', getSceneTextStyle('support', {
            fontSize: '18px', wordWrap: { width: width - 90 },
        })));

        const pageSize = 5;
        const pageCount = Math.max(1, Math.ceil(this.worldMap.destinations.length / pageSize));
        this.portraitPage = Math.min(this.portraitPage, pageCount - 1);
        this.worldMap.destinations.slice(this.portraitPage * pageSize, (this.portraitPage + 1) * pageSize)
            .forEach((destination, index) => {
                container.add(createSceneButton(this, { x: width / 2, y: 354 + index * 99,
                    width: width - 82, height: 84, label: destination.label,
                    description: `${destination.presentation.regionLabel} · ${destination.kind === 'hub' ? '驻地' : '秘境'}`,
                    variant: 'option', onClick: () => this.handleDestinationSelected(destination.id),
                }).objects);
            });
        if (pageCount > 1) {
            container.add(createSceneButton(this, { x: 112, y: 831, width: 152, height: 46,
                label: '上一页', variant: 'secondary', onClick: () => {
                    this.portraitPage = (this.portraitPage - 1 + pageCount) % pageCount; this.renderShell();
                } }).objects);
            container.add(createSceneButton(this, { x: width - 112, y: 831, width: 152, height: 46,
                label: '下一页', variant: 'secondary', onClick: () => {
                    this.portraitPage = (this.portraitPage + 1) % pageCount; this.renderShell();
                } }).objects);
        }
        const status = createStatusLine(this, { x: width / 2, y: 903, width: width - 80,
            text: this.returnStatusText ?? '点选目的地，前往城镇、山门或秘境。', align: 'center' });
        this.statusText = status.text;
        container.add(status.objects);
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
        const markerLabel = destination.kind === 'hub' ? '驻地' : '秘境';

        const aura = this.add.rectangle(0, 0, 112, 112, palette.fill, 0.22);
        this.tweens.add({ targets: aura, scale: 1.25, alpha: 0.05, duration: 1200, repeat: -1, ease: 'Stepped', easeParams: [4] });
        const pin = this.add.rectangle(0, 0, 68, 68, palette.fill, 1);
        (pin as unknown as { deco: boolean }).deco = true;
        pin.setStrokeStyle(4, palette.stroke, 1);
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
        labelPanel.setInteractive({ useHandCursor: true });
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
        const onPointerDown = (pointer: Phaser.Input.Pointer) => {
            if (!this.isPointerInsideMapViewport(pointer)) {
                return;
            }

            pointerDownPosition = { x: pointer.x, y: pointer.y };
            pin.setFillStyle(palette.hoverFill, 1);
            this.previewDestination(destination);
        };
        const onPointerUp = (pointer: Phaser.Input.Pointer) => {
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
        };
        const onPointerOver = (pointer: Phaser.Input.Pointer) => {
            if (this.isPointerInsideMapViewport(pointer)) {
                pin.setFillStyle(palette.hoverFill, 1);
                this.previewDestination(destination);
            }
        };
        const onPointerOut = () => {
            pin.setFillStyle(palette.fill, 0.98);
            this.restoreDefaultStatusText();
        };
        for (const target of [pin, labelPanel]) {
            target.on('pointerdown', onPointerDown);
            target.on('pointerup', onPointerUp);
            target.on('pointerover', onPointerOver);
            target.on('pointerout', onPointerOut);
        }

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
        if (this.questJournal.isOpen() || !this.mapSurfaceContainer || !this.isPointerInsideMapViewport(pointer)) {
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
        if (this.questJournal.isOpen() || !this.mapDragState || !this.mapSurfaceContainer || !this.mapViewport || !pointer.isDown) {
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
