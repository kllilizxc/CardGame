import { ensureBackdrop } from '../../art/backdrop';
import { bakeTerrain } from '../../art/terrain';
import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
} from '../../services/StoryHubSessionPersistence';
import { writeGameWorldStateHubSessionSnapshotWithFallbackStorage } from '../../state/GameWorldStateStoryHubSessionWrite';
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
    type HubTownNavigateAction,
    type HubTownStartStoryAction,
    type HubTownDefinition,
    type HubTownLocation,
    type HubTownSurfacePosition,
    type HubTownViewport,
} from './hubTown';

function isHubTownNavigateAction(action: HubTownAction): action is HubTownNavigateAction {
    return action.kind === 'navigate';
}

function isHubTownStartStoryAction(action: HubTownAction): action is HubTownStartStoryAction {
    return action.kind === 'startStory';
}

function unsupportedHubActionIntent(intent: never): never {
    throw new Error(`Hub action intent has unsupported kind: ${JSON.stringify(intent)}`);
}

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

        this.cameras.main.setBackgroundColor(0x0b0714);
        ensureBackdrop(this, 'hall');

        container.add(this.add.text(width / 2, 74, this.town.title, {
            fontFamily: 'Arial Black',
            fontSize: '48px',
            color: '#f4ecd8',
            stroke: '#0b0714',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 126, this.town.subtitle, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#a0e8f8',
        }).setOrigin(0.5));

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
            top: panelTop + 150,
            width: mapWidth,
            height: panelHeight - 220,
        };
        const detailLeft = mapViewport.left + mapViewport.width + 54;
        const detailWidth = panelRight - detailLeft - 54;

        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x160f26, 0.96);
        panel.setStrokeStyle(3, 0xffc040, 0.82);
        container.add(panel);

        container.add(this.add.text(contentX, panelTop + 48, '地点子地图', {
            fontFamily: 'Arial',
            fontSize: '31px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(contentX, panelTop + 94, '拖拽平移地图，点击标记选择 Hub 小地点。', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#a0e8f8',
            wordWrap: { width: mapViewport.width },
        }));

        this.renderHubMapSurface(container, mapViewport, currentLocation.id);

        container.add(this.add.text(detailLeft, panelTop + 48, currentLocation.title, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(detailLeft, panelTop + 102, currentLocation.summary, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#cfc6dd',
            fontStyle: 'bold',
            wordWrap: { width: detailWidth },
        }));

        container.add(this.add.text(detailLeft, panelTop + 162, currentLocation.detail, {
            fontFamily: 'Arial',
            fontSize: '21px',
            color: '#cfc6dd',
            lineSpacing: 10,
            wordWrap: { width: detailWidth },
        }));

        container.add(this.add.text(detailLeft, panelTop + 300, this.town.description, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#f8a8c8',
            wordWrap: { width: detailWidth },
        }));

        const statusLine = this.navigationState.statusText ?? '当前 Hub 位置会保存到本地 Story/Hub session。';
        this.statusText = this.add.text(detailLeft, panelTop + 368, statusLine, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#f4ecd8',
            wordWrap: { width: detailWidth },
        });
        container.add(this.statusText);

        currentLocation.actions.forEach((action, index) => {
            container.add(this.createActionButton(
                action,
                detailLeft + detailWidth / 2,
                panelTop + 462 + index * 92,
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
            0x0b0714,
            1,
        );
        viewportBackground.setStrokeStyle(2, 0xffc040, 0.4);
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

        const hint = this.add.text(viewport.left + 22, viewport.top + 18, '拖拽查看周边 · 点击地点标记', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#a0e8f8',
            backgroundColor: '#160f26cc',
            padding: { x: 12, y: 7 },
        });
        container.add(hint);

        this.registerHubMapInputHandlers();
    }

    private createHubMapSurfaceBackdrop(): Phaser.GameObjects.Rectangle {
        const { mapWidth, mapHeight } = this.town.presentation;
        const backdrop = this.add.rectangle(0, 0, mapWidth, mapHeight, 0x160f26, 1);
        backdrop.setOrigin(0, 0);
        backdrop.setStrokeStyle(6, 0x221a3d, 1);

        return backdrop;
    }

    private createHubMapTerrainArtwork(): Phaser.GameObjects.Image {
        const { mapWidth, mapHeight } = this.town.presentation;
        const key = bakeTerrain(this, `hubterrain_${mapWidth}x${mapHeight}`, mapWidth, mapHeight, [], 21);
        return this.add.image(0, 0, key).setOrigin(0, 0).setScale(4);
    }

    private createHubMapRouteArtwork(): Phaser.GameObjects.Graphics {
        const graphics = this.add.graphics();

        graphics.lineStyle(5, 0x9a8fbf, 0.26);
        this.town.locations.forEach((location) => {
            const sourcePosition = getHubLocationSurfacePosition(this.town, location);

            location.actions.forEach((action) => {
                if (!isHubTownNavigateAction(action)) {
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

        const aura = this.add.rectangle(0, 0, selected ? 124 : 104, selected ? 124 : 104, palette.fill, selected ? 0.28 : 0.18);
        this.tweens.add({ targets: aura, scale: 1.25, alpha: 0.04, duration: 1200, repeat: -1, ease: 'Stepped', easeParams: [4] });
        const pin = this.add.rectangle(0, 0, selected ? 76 : 64, selected ? 76 : 64, palette.fill, 1);
        (pin as unknown as { deco: boolean }).deco = true;
        pin.setStrokeStyle(selected ? 6 : 4, palette.stroke, 1);
        pin.setInteractive({ useHandCursor: true });

        const glyph = this.add.text(0, -1, this.getHubLocationMarkerGlyph(location), {
            fontFamily: 'Arial Black',
            fontSize: selected ? '25px' : '23px',
            color: '#f4ecd8',
            stroke: '#0b0714',
            strokeThickness: 4,
        }).setOrigin(0.5);

        const labelPanelWidth = Math.max(156, location.title.length * 25);
        const labelPanel = this.add.rectangle(0, 60, labelPanelWidth, 60, 0x0b0714, 0.84);
        labelPanel.setStrokeStyle(2, palette.stroke, selected ? 0.72 : 0.48);
        const label = this.add.text(0, 45, location.title, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: selected ? '#f4ecd8' : '#f4ecd8',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const region = this.add.text(0, 70, location.presentation.regionLabel, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#a0e8f8',
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
            pin.setFillStyle(palette.fill, 1);
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
                fill: 0xf28a2e,
                hoverFill: 0xffc040,
                stroke: 0xfef3c7,
            };
        }

        const iconPalette: Record<string, { fill: number; hoverFill: number; stroke: number }> = {
            'gate-market': {
                fill: 0x1f7a5a,
                hoverFill: 0xffc040,
                stroke: 0xbfdbfe,
            },
            teahouse: {
                fill: 0x1f7a5a,
                hoverFill: 0x3fbf7a,
                stroke: 0xdcfce7,
            },
            'sect-gate': {
                fill: 0x9a4cd0,
                hoverFill: 0xa78bfa,
                stroke: 0xddd6fe,
            },
        };

        return iconPalette[location.presentation.icon] ?? {
            fill: 0x4a3c7a,
            hoverFill: 0x6c5f9c,
            stroke: 0xe2e8f0,
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
        this.statusText?.setText(this.navigationState.statusText ?? '当前 Hub 位置会保存到本地 Story/Hub session。');
    }

    private handleHubMarkerSelected(locationId: string): void {
        const location = resolveHubLocation(this.town, locationId);

        this.navigationState = applyHubNavigationIntent(
            this.town,
            createHubLocationSelectionIntent(
                location.id,
                `已在 Hub 子地图选择：${location.title}。`,
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
        const button = this.add.rectangle(x, y, 220, 52, 0x32285a, 0.94);
        button.setStrokeStyle(2, 0xf4ecd8, 0.78);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setFillStyle(0x4a3c7a, 1));
        button.on('pointerout', () => button.setFillStyle(0x32285a, 0.94));
        button.on('pointerdown', () => this.returnToWorldMap());

        const label = this.add.text(x, y, '返回大地图', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        return [button, label];
    }

    private createActionButton(action: HubTownAction, x: number, y: number, width: number): Phaser.GameObjects.GameObject[] {
        const button = this.add.rectangle(x, y, width, 76, 0x12403a, 0.94);
        button.setStrokeStyle(3, 0xf4ecd8, 0.82);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setFillStyle(0x1f7a5a, 1));
        button.on('pointerout', () => button.setFillStyle(0x12403a, 0.94));
        button.on('pointerdown', () => this.handleAction(action));

        const textX = x - width / 2 + 30;
        const label = this.add.text(textX, y - 23, action.label, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#f4ecd8',
            fontStyle: 'bold',
        });

        const description = this.add.text(textX, y + 10, action.description, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#a0e8f8',
            wordWrap: { width: width - 60 },
        });

        return [button, label, description];
    }

    private handleAction(action: HubTownAction): void {
        const intent = this.createActionIntent(action);

        switch (intent.kind) {
            case 'navigateLocation':
                this.navigationState = applyHubNavigationIntent(this.town, intent);
                this.persistHubNavigationState();
                this.renderShell();
                break;
            case 'startScene':
                this.scene.start(intent.sceneKey, intent.payload);
                break;
            default:
                unsupportedHubActionIntent(intent);
        }
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
        if (!isHubTownStartStoryAction(action)) {
            return createHubActionIntent(action);
        }

        return createHubActionIntent(action, this.loadStorySession(action));
    }

    private loadStorySession(action: HubTownStartStoryAction) {
        return loadStoryRuntimeSession(createStoryHubSessionKeyFromAction(action));
    }

    private persistHubNavigationState(): void {
        writeGameWorldStateHubSessionSnapshotWithFallbackStorage({
            snapshot: {
                hubId: this.launchData.hubId,
                currentLocationId: this.navigationState.currentLocationId,
                ...(this.navigationState.statusText ? { statusText: this.navigationState.statusText } : {}),
                updatedAt: new Date().toISOString(),
            },
        });
    }
}
