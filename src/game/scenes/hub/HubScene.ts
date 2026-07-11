import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    saveHubSessionSnapshot,
} from '../../services/StoryHubSessionPersistence';
import { createWorldMapReturnIntent } from '../worldmap/worldMap';
import {
    assertHubSceneCatalogResourceMatchesLoadedHub,
    normalizeHubSceneLaunchData,
    resolveHubSceneCatalogResource,
    type HubSceneLaunchData,
    type NormalizedHubSceneLaunchData,
    type ResolvedHubSceneCatalogResource,
} from './hubSceneLaunch';
import {
    applyHubNavigationIntent,
    clampHubMapSurfacePosition,
    createHubActionIntent,
    createHubLocationSelectionIntent,
    createHubMapInitialSurfacePosition,
    createInitialHubNavigationState,
    createStoryHubSessionKeyFromAction,
    getHubLocationSurfacePosition,
    resolveHubLocation,
    shouldActivateHubMarker,
    validateHubTownDefinition,
    type HubNavigationState,
    type HubTownAction,
    type HubTownStartStoryAction,
    type HubTownDefinition,
    type HubTownLocation,
    type HubTownSurfacePosition,
    type HubTownViewport,
} from './hubTown';
import {
    createSceneBackdrop,
    createSceneButton,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from '../shared/sceneTheme';

const HUB_MAP_TITLE = '城镇地图';
const HUB_MAP_INSTRUCTION = '拖拽查看地图，点击标记切换想去的地点。';
const HUB_DEFAULT_STATUS_TEXT = '选好落脚点后安心四处看看；离开城镇后，下次回来仍会从这里继续。';

export class HubScene extends Scene {
    private launchData: NormalizedHubSceneLaunchData = normalizeHubSceneLaunchData();
    private hubResource?: ResolvedHubSceneCatalogResource;
    private town!: HubTownDefinition;
    private navigationState!: HubNavigationState;
    private shellContainer?: Phaser.GameObjects.Container;
    private mapSurfaceContainer?: Phaser.GameObjects.Container;
    private mapViewport?: HubTownViewport;
    private mapDragState?: {
        startPointerX: number;
        startPointerY: number;
        startSurfaceX: number;
        startSurfaceY: number;
    };
    private statusText?: Phaser.GameObjects.Text;
    private readonly dragDistanceThreshold = 8;

    constructor() {
        super('HubScene');
    }

    init(data?: HubSceneLaunchData): void {
        this.launchData = normalizeHubSceneLaunchData(data);
    }

    preload(): void {
        const hubResource = resolveHubSceneCatalogResource(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.launchData,
        );
        this.hubResource = hubResource;

        this.load.json(this.launchData.hubCacheKey, hubResource.publicPath);
    }

    create(): void {
        this.town = this.readValidatedHubTownDefinition();
        assertHubSceneCatalogResourceMatchesLoadedHub(
            this.town,
            this.launchData,
            this.getResolvedHubResource(),
        );
        const savedSession = loadHubSessionSnapshot(this.launchData.hubId);
        this.navigationState = createInitialHubNavigationState(
            this.town,
            savedSession,
            {
                ...(this.launchData.targetLocationId ? { targetLocationId: this.launchData.targetLocationId } : {}),
                ...(this.launchData.statusText ? { statusText: this.launchData.statusText } : {}),
            },
        );
        if (!this.launchData.targetLocationId && !savedSession?.statusText && this.launchData.statusText) {
            this.navigationState = {
                ...this.navigationState,
                statusText: this.launchData.statusText,
            };
        }
        this.persistHubNavigationState();

        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private readValidatedHubTownDefinition(): HubTownDefinition {
        const rawHub = this.cache.json.get(this.launchData.hubCacheKey);
        const hubResource = this.getResolvedHubResource();

        if (rawHub === undefined) {
            throw new Error(
                `HubScene failed to load catalog resource ${hubResource.resourceId} from public/${hubResource.publicPath} for launch hubFile ${this.launchData.hubFile}: JSON cache key ${this.launchData.hubCacheKey} is missing after preload.`,
            );
        }

        try {
            return validateHubTownDefinition(rawHub);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `HubScene failed to validate catalog resource ${hubResource.resourceId} from public/${hubResource.publicPath}: ${message}`,
            );
        }
    }

    private getResolvedHubResource(): ResolvedHubSceneCatalogResource {
        if (!this.hubResource) {
            this.hubResource = resolveHubSceneCatalogResource(
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
                this.launchData,
            );
        }

        return this.hubResource;
    }

    private renderShell(): void {
        this.shellContainer?.destroy();
        this.mapSurfaceContainer = undefined;
        this.mapViewport = undefined;
        this.mapDragState = undefined;
        this.statusText = undefined;

        const currentLocation = resolveHubLocation(this.town, this.navigationState.currentLocationId);
        const { width, height } = this.scale;
        const container = this.add.container(0, 0);

        this.cameras.main.setBackgroundColor(sceneTheme.colors.night);
        container.add(createSceneBackdrop(this));

        container.add(this.add.text(width / 2, 78, this.town.title, getSceneTextStyle('sceneTitle')).setOrigin(0.5));
        container.add(this.add.text(width / 2, 134, this.town.subtitle, getSceneTextStyle('sceneSubtitle')).setOrigin(0.5));

        const panelWidth = Math.min(1520, width - 220);
        const panelHeight = Math.min(760, height - 245);
        const panelX = width / 2;
        const panelY = height / 2 + 48;
        const panelLeft = panelX - panelWidth / 2;
        const panelRight = panelX + panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelLeft + 54;
        const mapWidth = Math.min(660, panelWidth * 0.46);
        const mapViewport = {
            left: contentX,
            top: panelTop + 164,
            width: mapWidth,
            height: panelHeight - 234,
        };
        const detailLeft = mapViewport.left + mapViewport.width + 54;
        const detailWidth = panelRight - detailLeft - 54;

        container.add(createScenePanel(this, {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
        }));

        container.add(this.add.text(contentX, panelTop + 50, HUB_MAP_TITLE, getSceneTextStyle('panelTitle')));

        this.renderHubMapSurface(container, mapViewport, currentLocation.id);

        container.add(this.add.text(detailLeft, panelTop + 50, currentLocation.presentation.regionLabel, getSceneTextStyle('panelEyebrow')));
        container.add(this.add.text(detailLeft, panelTop + 88, currentLocation.title, getSceneTextStyle('panelTitle', {
            fontSize: '36px',
        })));
        container.add(this.add.text(
            detailLeft,
            panelTop + 150,
            `${currentLocation.summary}\n${currentLocation.detail}`,
            getSceneTextStyle('body', {
                fontSize: '20px',
                wordWrap: { width: detailWidth },
            }),
        ));

        const statusLine = this.navigationState.statusText ?? HUB_DEFAULT_STATUS_TEXT;
        const status = createStatusLine(this, {
            x: detailLeft + detailWidth / 2,
            y: panelTop + 372,
            width: detailWidth,
            text: statusLine,
        });
        this.statusText = status.text;
        container.add(status.objects);

        currentLocation.actions.forEach((action, index) => {
            container.add(this.createActionButton(
                action,
                detailLeft + detailWidth / 2,
                panelTop + 472 + index * 102,
                detailWidth,
            ));
        });
        container.add(this.createWorldMapReturnButton(panelX + panelWidth / 2 - 150, panelTop + 48));

        this.shellContainer = container;
    }

    private renderHubMapSurface(
        container: Phaser.GameObjects.Container,
        viewport: HubTownViewport,
        selectedLocationId: string,
    ): void {
        this.mapViewport = viewport;

        const viewportCenterX = viewport.left + viewport.width / 2;
        const viewportCenterY = viewport.top + viewport.height / 2;
        const viewportBackground = this.add.rectangle(
            viewportCenterX,
            viewportCenterY,
            viewport.width,
            viewport.height,
            sceneTheme.colors.ink,
            0.94,
        );
        viewportBackground.setStrokeStyle(2, sceneTheme.colors.gold, 0.28);
        container.add(viewportBackground);

        const initialSurfacePosition = createHubMapInitialSurfacePosition(this.town.presentation, viewport);
        const surface = this.add.container(initialSurfacePosition.x, initialSurfacePosition.y);
        this.mapSurfaceContainer = surface;

        surface.add(this.createHubMapSurfaceBackdrop());
        surface.add(this.createHubMapTerrainArtwork());
        surface.add(this.createHubMapRouteArtwork());
        this.town.locations.forEach((location) => {
            surface.add(this.createHubLocationMarker(location, location.id === selectedLocationId));
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

        const hint = this.add.text(viewport.left + 22, viewport.top + 18, HUB_MAP_INSTRUCTION, getSceneTextStyle('support', {
            color: '#f3ead3',
            backgroundColor: '#493824cc',
            padding: { x: 12, y: 7 },
            wordWrap: { width: viewport.width - 44 },
        }));
        container.add(hint);

        this.registerHubMapInputHandlers();
    }

    private createHubMapSurfaceBackdrop(): Phaser.GameObjects.Rectangle {
        const { mapWidth, mapHeight } = this.town.presentation;
        const backdrop = this.add.rectangle(0, 0, mapWidth, mapHeight, sceneTheme.colors.panel, 1);
        backdrop.setOrigin(0, 0);
        backdrop.setStrokeStyle(6, sceneTheme.colors.slate, 1);

        return backdrop;
    }

    private createHubMapTerrainArtwork(): Phaser.GameObjects.Graphics {
        const { mapWidth, mapHeight } = this.town.presentation;
        const graphics = this.add.graphics();

        graphics.fillStyle(sceneTheme.colors.jade, 0.28);
        graphics.fillEllipse(mapWidth * 0.36, mapHeight * 0.68, mapWidth * 0.48, mapHeight * 0.34);
        graphics.fillStyle(sceneTheme.colors.gold, 0.16);
        graphics.fillEllipse(mapWidth * 0.62, mapHeight * 0.42, mapWidth * 0.52, mapHeight * 0.36);
        graphics.fillStyle(sceneTheme.colors.ember, 0.18);
        graphics.fillEllipse(mapWidth * 0.5, mapHeight * 0.54, mapWidth * 0.32, mapHeight * 0.24);

        graphics.lineStyle(2, sceneTheme.colors.gold, 0.1);
        for (let x = 100; x < mapWidth; x += 140) {
            graphics.lineBetween(x, 0, x, mapHeight);
        }
        for (let y = 90; y < mapHeight; y += 120) {
            graphics.lineBetween(0, y, mapWidth, y);
        }

        return graphics;
    }

    private createHubMapRouteArtwork(): Phaser.GameObjects.Graphics {
        const graphics = this.add.graphics();

        graphics.lineStyle(5, sceneTheme.colors.parchmentSoft, 0.18);
        this.town.locations.forEach((location) => {
            const sourcePosition = getHubLocationSurfacePosition(this.town, location);

            location.actions.forEach((action) => {
                if (action.kind !== 'navigate') {
                    return;
                }

                const targetLocation = resolveHubLocation(this.town, action.targetLocationId);
                const targetPosition = getHubLocationSurfacePosition(this.town, targetLocation);

                graphics.lineBetween(
                    sourcePosition.x,
                    sourcePosition.y,
                    targetPosition.x,
                    targetPosition.y,
                );
            });
        });

        return graphics;
    }

    private createHubLocationMarker(location: HubTownLocation, selected: boolean): Phaser.GameObjects.Container {
        const position = getHubLocationSurfacePosition(this.town, location);
        const marker = this.add.container(position.x, position.y);
        const palette = this.getHubLocationMarkerPalette(location, selected);

        const aura = this.add.circle(0, 0, selected ? 62 : 52, palette.fill, selected ? 0.24 : 0.16);
        const pin = this.add.circle(0, 0, selected ? 36 : 31, palette.fill, 0.98);
        pin.setStrokeStyle(selected ? 5 : 4, palette.stroke, 0.95);
        pin.setInteractive({ useHandCursor: true });

        const glyph = this.add.text(0, -1, this.getHubLocationMarkerGlyph(location), {
            fontFamily: sceneTheme.fonts.display,
            fontSize: selected ? '25px' : '23px',
            color: '#f3ead3',
            stroke: '#140f0a',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const labelPanelWidth = Math.max(156, location.title.length * 25);
        const labelPanel = this.add.rectangle(0, 60, labelPanelWidth, 66, sceneTheme.colors.panelInner, 0.86);
        labelPanel.setStrokeStyle(2, palette.stroke, selected ? 0.72 : 0.48);
        const label = this.add.text(0, 45, location.title, {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '19px',
            color: selected ? '#e8d5ab' : '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const region = this.add.text(0, 70, location.presentation.regionLabel, {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: '#d9c6a2',
        }).setOrigin(0.5);

        let pointerDownPosition: HubTownSurfacePosition | undefined;
        pin.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (!this.isPointerInsideHubMapViewport(pointer)) {
                return;
            }

            pointerDownPosition = { x: pointer.x, y: pointer.y };
            pin.setFillStyle(palette.hoverFill, 1);
            this.previewHubLocation(location);
        });
        pin.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (!pointerDownPosition || !this.isPointerInsideHubMapViewport(pointer)) {
                pointerDownPosition = undefined;
                return;
            }

            const shouldActivate = shouldActivateHubMarker(
                pointerDownPosition,
                { x: pointer.x, y: pointer.y },
                this.dragDistanceThreshold,
            );
            pointerDownPosition = undefined;

            if (shouldActivate) {
                this.handleHubMarkerSelected(location.id);
                return;
            }

            this.restoreDefaultStatusText();
        });
        pin.on('pointerover', (pointer: Phaser.Input.Pointer) => {
            if (this.isPointerInsideHubMapViewport(pointer)) {
                pin.setFillStyle(palette.hoverFill, 1);
                this.previewHubLocation(location);
            }
        });
        pin.on('pointerout', () => {
            pin.setFillStyle(palette.fill, 0.98);
            this.restoreDefaultStatusText();
        });

        marker.add([aura, pin, glyph, labelPanel, label, region]);

        return marker;
    }

    private getHubLocationMarkerPalette(location: HubTownLocation, selected: boolean): {
        fill: number;
        hoverFill: number;
        stroke: number;
    } {
        if (selected) {
            return {
                fill: sceneTheme.colors.gold,
                hoverFill: sceneTheme.colors.goldSoft,
                stroke: sceneTheme.colors.parchment,
            };
        }

        const iconPalette: Record<string, { fill: number; hoverFill: number; stroke: number }> = {
            'gate-market': {
                fill: sceneTheme.colors.jade,
                hoverFill: sceneTheme.colors.jadeBright,
                stroke: sceneTheme.colors.goldSoft,
            },
            teahouse: {
                fill: sceneTheme.colors.ember,
                hoverFill: sceneTheme.colors.emberBright,
                stroke: sceneTheme.colors.goldSoft,
            },
            'sect-gate': {
                fill: sceneTheme.colors.slate,
                hoverFill: 0x6b6257,
                stroke: sceneTheme.colors.parchmentSoft,
            },
        };

        return iconPalette[location.presentation.icon] ?? {
            fill: sceneTheme.colors.slate,
            hoverFill: 0x6b6257,
            stroke: sceneTheme.colors.parchmentSoft,
        };
    }

    private getHubLocationMarkerGlyph(location: HubTownLocation): string {
        const markerGlyphs: Record<string, string> = {
            'gate-market': '市',
            teahouse: '茶',
            'sect-gate': '宗',
            archway: '门',
            town: '镇',
        };

        return markerGlyphs[location.presentation.icon] ?? '点';
    }

    private previewHubLocation(location: HubTownLocation): void {
        this.statusText?.setText(
            `${location.presentation.regionLabel} · ${location.title}\n${location.summary}`,
        );
    }

    private restoreDefaultStatusText(): void {
        this.statusText?.setText(this.navigationState.statusText ?? HUB_DEFAULT_STATUS_TEXT);
    }

    private handleHubMarkerSelected(locationId: string): void {
        const location = resolveHubLocation(this.town, locationId);

        this.navigationState = applyHubNavigationIntent(
            this.town,
            this.navigationState,
            createHubLocationSelectionIntent(
                location.id,
                `已选定前往：${location.title}。`,
            ),
        );
        this.persistHubNavigationState();
        this.renderShell();
    }

    private registerHubMapInputHandlers(): void {
        this.input.off('pointerdown', this.handleHubMapPointerDown, this);
        this.input.off('pointermove', this.handleHubMapPointerMove, this);
        this.input.off('pointerup', this.handleHubMapPointerUp, this);
        this.input.on('pointerdown', this.handleHubMapPointerDown, this);
        this.input.on('pointermove', this.handleHubMapPointerMove, this);
        this.input.on('pointerup', this.handleHubMapPointerUp, this);
    }

    private handleHubMapPointerDown(pointer: Phaser.Input.Pointer): void {
        if (!this.mapSurfaceContainer || !this.isPointerInsideHubMapViewport(pointer)) {
            return;
        }

        this.mapDragState = {
            startPointerX: pointer.x,
            startPointerY: pointer.y,
            startSurfaceX: this.mapSurfaceContainer.x,
            startSurfaceY: this.mapSurfaceContainer.y,
        };
    }

    private handleHubMapPointerMove(pointer: Phaser.Input.Pointer): void {
        if (!this.mapDragState || !this.mapSurfaceContainer || !this.mapViewport || !pointer.isDown) {
            return;
        }

        const deltaX = pointer.x - this.mapDragState.startPointerX;
        const deltaY = pointer.y - this.mapDragState.startPointerY;
        const clampedPosition = clampHubMapSurfacePosition(this.town.presentation, this.mapViewport, {
            x: this.mapDragState.startSurfaceX + deltaX,
            y: this.mapDragState.startSurfaceY + deltaY,
        });

        this.mapSurfaceContainer.setPosition(clampedPosition.x, clampedPosition.y);
    }

    private handleHubMapPointerUp(): void {
        this.mapDragState = undefined;
    }

    private isPointerInsideHubMapViewport(pointer: Phaser.Input.Pointer): boolean {
        if (!this.mapViewport) {
            return false;
        }

        return pointer.x >= this.mapViewport.left
            && pointer.x <= this.mapViewport.left + this.mapViewport.width
            && pointer.y >= this.mapViewport.top
            && pointer.y <= this.mapViewport.top + this.mapViewport.height;
    }

    private createWorldMapReturnButton(x: number, y: number): Phaser.GameObjects.GameObject[] {
        return createSceneButton(this, {
            x,
            y,
            width: 220,
            height: 52,
            label: '返回大地图',
            onClick: () => this.returnToWorldMap(),
            variant: 'secondary',
        }).objects;
    }

    private createActionButton(action: HubTownAction, x: number, y: number, width: number): Phaser.GameObjects.GameObject[] {
        const variant = action.kind === 'startStory' ? 'primary' : 'option';
        return createSceneButton(this, {
            x,
            y,
            width,
            height: 86,
            label: action.label,
            description: action.description,
            onClick: () => this.handleAction(action),
            variant,
            align: 'left',
        }).objects;
    }

    private handleAction(action: HubTownAction): void {
        const intent = this.createActionIntent(action);

        if (intent.kind === 'navigateLocation') {
            this.navigationState = applyHubNavigationIntent(this.town, this.navigationState, intent);
            this.persistHubNavigationState();
            this.renderShell();
            return;
        }

        this.scene.start(intent.sceneKey, intent.payload);
    }

    private returnToWorldMap(): void {
        this.persistHubNavigationState();

        const intent = createWorldMapReturnIntent({
            source: 'hub',
            statusText: `已从${this.town.title}返回大地图；再次进入城镇会恢复保存位置。`,
        });

        this.scene.start(intent.sceneKey, intent.payload);
    }

    private createActionIntent(action: HubTownAction) {
        if (action.kind !== 'startStory') {
            return createHubActionIntent(action);
        }

        return createHubActionIntent(action, this.loadStorySession(action));
    }

    private loadStorySession(action: HubTownStartStoryAction) {
        return loadStoryRuntimeSession(createStoryHubSessionKeyFromAction(action));
    }

    private persistHubNavigationState(): void {
        saveHubSessionSnapshot({
            hubId: this.launchData.hubId,
            currentLocationId: this.navigationState.currentLocationId,
            ...(this.navigationState.statusText ? { statusText: this.navigationState.statusText } : {}),
            updatedAt: new Date().toISOString(),
        });
    }
}
