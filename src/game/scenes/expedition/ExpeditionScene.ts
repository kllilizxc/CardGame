import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    ExpeditionState,
    type ExpeditionBootstrapSources,
    type ExpeditionWorldStateSeed,
} from '../../state/ExpeditionState';
import { selectDeckInStash } from '../../state/PersistentStashDecks';
import {
    resolveBattleDefeat,
    resolveBattleVictory,
    resolveBossClear,
    resolveExtract,
} from '../../services/RunResolution';
import type {
    ExpeditionBattleCompleteEvent,
    EventMapNode,
    ExpeditionMapDefinition,
    ExpeditionMapNode,
    ExtractMapNode,
    PrototypeEventCollection,
    PrototypeEventDefinition,
    PrototypeShopCollection,
    PrototypeShopDefinition,
    RunResolutionSummary,
    RunSnapshot,
    ShopMapNode,
} from '../../types/expedition';
import { MapNodeView } from '../../ui/expedition/MapNodeView';
import { DeckManagementPanel } from '../../ui/deckbuilder/DeckManagementPanel';
import { PreparationPanel } from '../../ui/expedition/PreparationPanel';
import { RunHud } from '../../ui/expedition/RunHud';
import {
    createRouteTelemetryChipRow,
    type RouteTelemetryChipLayoutOptions,
    type RouteTelemetryChipView,
} from '../../ui/expedition/routeTelemetryChips';
import { createWorldMapReturnIntent } from '../worldmap/worldMap';
import {
    createExpeditionArrivalCueSummary,
    createExpeditionDepartureHandoffSummary,
    createExpeditionPreflightStatusSummary,
    createExpeditionRouteBriefingSummary,
    createPreparationDeckContext,
    createPreparationDeckHandoffSummary,
    createPostRunEntranceStatus,
    createPreparationSummary,
    createRunSummary,
    type ExpeditionDepartureHandoffSummary,
    type ExpeditionArrivalCueSummary,
    type PreparationDeckContext,
    type PreparationDeckHandoffSummary,
    type RunSummaryMode,
} from './entryFlowModel';
import { createBattleSceneStartPayload } from './battleLaunchFlow';
import { confirmExpeditionLoadout, getInitialExpeditionEntryView } from './expeditionEntryFlow';
import {
    createExpeditionTargetConfig,
    normalizeExpeditionSceneLaunchData,
    resolveExpeditionSceneCatalogResources,
    type ExpeditionSceneLaunchData,
    type NormalizedExpeditionSceneLaunchData,
    type ResolvedExpeditionSceneCatalogResources,
} from './expeditionSceneLaunch';
import { getVisibleNodes, isReachableNode } from './mapTraversal';
import { createRunAfterBattleVictory, getTerminalBattleOutcome } from './runResultFlow';
import {
    createEventNodeView,
    createExtractNodeView,
    createShopNodeView,
    type ShopOfferView,
} from './nonCombatNodeFlow';
import {
    buildDeckbuilderCardMetadataMap,
    resolveDeckbuilderCardMetadataResources,
    resolveDeckbuilderWorldItemMetadataResource,
    type DeckbuilderCardMetadataResources,
} from './deckbuilderCardMetadata';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';

type StarterDeckCacheEntry = ExpeditionBootstrapSources['starterDeck'];

type NonCombatMapNode = EventMapNode | ShopMapNode | ExtractMapNode;
type EntryPanel = PreparationPanel | DeckManagementPanel;
type EntryShellMode = 'preparation' | 'deckManager';

interface EntryShellCorners {
    topLeftHorizontal: Phaser.GameObjects.Rectangle;
    topLeftVertical: Phaser.GameObjects.Rectangle;
    topRightHorizontal: Phaser.GameObjects.Rectangle;
    topRightVertical: Phaser.GameObjects.Rectangle;
    bottomLeftHorizontal: Phaser.GameObjects.Rectangle;
    bottomLeftVertical: Phaser.GameObjects.Rectangle;
    bottomRightHorizontal: Phaser.GameObjects.Rectangle;
    bottomRightVertical: Phaser.GameObjects.Rectangle;
}

interface EntryShellRouteSlate {
    plate: Phaser.GameObjects.Rectangle;
    accent: Phaser.GameObjects.Rectangle;
    chips: RouteTelemetryChipView[];
}

interface EntryShellVisuals {
    container: Phaser.GameObjects.Container;
    frameOuter: Phaser.GameObjects.Rectangle;
    frameInner: Phaser.GameObjects.Rectangle;
    headerPlate: Phaser.GameObjects.Rectangle;
    headerAccent: Phaser.GameObjects.Rectangle;
    headerDivider: Phaser.GameObjects.Rectangle;
    titleText: Phaser.GameObjects.Text;
    subtitleText: Phaser.GameObjects.Text;
    modeBadgeText: Phaser.GameObjects.Text;
    routeSlate: EntryShellRouteSlate;
    topRail: Phaser.GameObjects.Rectangle;
    topRailProgress: Phaser.GameObjects.Rectangle;
    stepOnePill: Phaser.GameObjects.Rectangle;
    stepOneText: Phaser.GameObjects.Text;
    stepTwoPill: Phaser.GameObjects.Rectangle;
    stepTwoText: Phaser.GameObjects.Text;
    statusStrip: Phaser.GameObjects.Rectangle;
    statusStripAccent: Phaser.GameObjects.Rectangle;
    statusStripBadgeText: Phaser.GameObjects.Text;
    statusStripHeadlineText: Phaser.GameObjects.Text;
    statusStripDetailText: Phaser.GameObjects.Text;
    leftAccentBar: Phaser.GameObjects.Rectangle;
    rightAccentBar: Phaser.GameObjects.Rectangle;
    corners: EntryShellCorners;
}

interface EntryShellModeVisualConfig {
    badgeBackgroundColor: string;
    badgeColor: string;
    headerFillColor: number;
    headerDividerColor: number;
    subtitleColor: string;
    borderColor: number;
    accentColor: number;
    routePlateFillColor: number;
    routePlateBorderColor: number;
    routePlateAccentColor: number;
    routeChipFillColor: number;
    routeChipBorderColor: number;
    routeLabelColor: string;
    routeValueColor: string;
    cornerTopColor: number;
    cornerBottomColor: number;
    railTrackColor: number;
    railProgressColor: number;
    frameOuterColor: number;
    frameOuterAlpha: number;
    frameInnerColor: number;
    frameInnerAlpha: number;
    stepCurrentFillColor: number;
    stepCurrentStrokeColor: number;
    stepCurrentTextColor: string;
    stepCompleteFillColor: number;
    stepCompleteStrokeColor: number;
    stepCompleteTextColor: string;
    stepStandbyFillColor: number;
    stepStandbyStrokeColor: number;
    stepStandbyTextColor: string;
}

const ENTRY_SHELL_ROUTE_TELEMETRY_CHIP_OPTIONS: RouteTelemetryChipLayoutOptions = {
    chipHeight: 22,
    gapX: 6,
    gapY: 4,
    paddingX: 8,
    labelValueGap: 8,
    labelTextStyle: {
        fontFamily: 'Arial',
        fontSize: '9px',
        fontStyle: 'bold',
    },
    valueTextStyle: {
        fontFamily: 'Arial',
        fontSize: '10px',
        fontStyle: 'bold',
    },
};

export class ExpeditionScene extends Scene {
    private launchData: NormalizedExpeditionSceneLaunchData = normalizeExpeditionSceneLaunchData();
    private expeditionResources?: ResolvedExpeditionSceneCatalogResources;
    private expeditionState!: ExpeditionState;
    private mapDefinition!: ExpeditionMapDefinition;
    private eventCollection!: PrototypeEventCollection;
    private shopCollection!: PrototypeShopCollection;
    private preparationPanel?: PreparationPanel;
    private deckManagementPanel?: DeckManagementPanel;
    private runHud!: RunHud;
    private statusText!: Phaser.GameObjects.Text;
    private nodeMenu?: Phaser.GameObjects.Container;
    private activeNodePanel?: Phaser.GameObjects.Container;
    private mapGraphics?: Phaser.GameObjects.Graphics;
    private mapNodeViews: MapNodeView[] = [];
    private pendingBattleResult: ExpeditionBattleCompleteEvent | null = null;
    private deckManagerEntryContext?: PreparationDeckContext;
    private pendingPreparationDeckHandoff?: PreparationDeckHandoffSummary;
    private deckbuilderCardMetadataResources?: DeckbuilderCardMetadataResources;
    private deckbuilderCardMetadata: CardMetadataMap = {};
    private entryShell?: EntryShellVisuals;
    private entryTransitionBlocker?: Phaser.GameObjects.Rectangle;
    private departureHandoffOverlay?: Phaser.GameObjects.Container;
    private departureHandoffKeydownHandler?: (event: KeyboardEvent) => void;

    constructor() {
        super('ExpeditionScene');
    }

    init(data?: ExpeditionSceneLaunchData): void {
        this.destroyDepartureHandoffOverlay();
        this.launchData = normalizeExpeditionSceneLaunchData(data);
        this.expeditionResources = undefined;
        this.pendingBattleResult = this.launchData.battleResult ?? null;
        this.deckbuilderCardMetadataResources = undefined;
        this.deckbuilderCardMetadata = {};
    }

    preload(): void {
        const expeditionResources = this.getResolvedExpeditionResources();

        this.load.json(expeditionResources.worldState.cacheKey, expeditionResources.worldState.publicPath);
        this.load.json(expeditionResources.starterDeck.cacheKey, expeditionResources.starterDeck.publicPath);
        this.load.json(expeditionResources.map.cacheKey, expeditionResources.map.publicPath);
        this.load.json(expeditionResources.events.cacheKey, expeditionResources.events.publicPath);
        this.load.json(expeditionResources.shop.cacheKey, expeditionResources.shop.publicPath);

        Object.values(this.getDeckbuilderCardMetadataResources()).forEach((resource) => {
            this.load.json(resource.cacheKey, resource.publicPath);
        });
        const worldItemMetadataResource = resolveDeckbuilderWorldItemMetadataResource(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
        );
        this.load.json(worldItemMetadataResource.cacheKey, worldItemMetadataResource.publicPath);
    }

    create(): void {
        const { width, height } = this.scale;
        const expeditionResources = this.getResolvedExpeditionResources();
        const worldState = this.cache.json.get(expeditionResources.worldState.cacheKey) as ExpeditionWorldStateSeed;
        const starterDeck = this.cache.json.get(expeditionResources.starterDeck.cacheKey) as StarterDeckCacheEntry;
        this.mapDefinition = this.cache.json.get(expeditionResources.map.cacheKey) as ExpeditionMapDefinition;
        this.eventCollection = this.cache.json.get(expeditionResources.events.cacheKey) as PrototypeEventCollection;
        this.shopCollection = this.cache.json.get(expeditionResources.shop.cacheKey) as PrototypeShopCollection;
        this.deckbuilderCardMetadata = buildDeckbuilderCardMetadataMap(
            this.getDeckbuilderCardMetadataResources(),
            (cacheKey) => this.cache.json.get(cacheKey),
            {
                worldItemSource: this.cache.json.get(
                    resolveDeckbuilderWorldItemMetadataResource(
                        this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
                    ).cacheKey,
                ),
            },
        );
        this.assertLaunchTargetMatchesMapDefinition();
        this.expeditionState = ExpeditionState.bootstrap({
            worldState,
            starterDeck,
            activeRunRouteKey: this.launchData.routeKey,
            activeRunIdentity: {
                expeditionId: this.launchData.expeditionId,
                mapId: this.launchData.mapId,
            },
        });

        this.createSceneBackdrop();
        this.createEntryShell();
        this.createWorldMapReturnButton();

        this.runHud = new RunHud(this);
        this.runHud.setVisible(false);
        const statusPlate = this.add.rectangle(width / 2, height - 92, Math.min(width - 220, 980), 74, 0x07111f, 0.72);
        statusPlate.setStrokeStyle(1, 0x334155, 0.82);
        statusPlate.setDepth(60);
        this.statusText = this.add.text(width / 2, height - 92, '', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            align: 'center',
            wordWrap: { width: width - 220 },
        }).setOrigin(0.5);
        this.statusText.setDepth(61);

        if (this.pendingBattleResult) {
            this.handleBattleResult(this.pendingBattleResult);
        } else {
            const initialView = getInitialExpeditionEntryView(this.expeditionState);

            if (initialView.mode === 'activeRun' && initialView.activeRun) {
                this.showActiveRun(initialView.activeRun, 'resumed');
            } else {
                this.showPreparationPanel();
                this.statusText.setText(this.launchData.statusText ?? initialView.statusText);
            }
        }

        EventBus.emit('current-scene-ready', this);
    }

    private getResolvedExpeditionResources(): ResolvedExpeditionSceneCatalogResources {
        if (!this.expeditionResources) {
            this.expeditionResources = resolveExpeditionSceneCatalogResources(
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
                this.launchData,
            );
        }

        return this.expeditionResources;
    }

    private createSceneBackdrop(): void {
        const { width, height } = this.scale;

        this.cameras.main.setBackgroundColor(0x050b16);

        const base = this.add.rectangle(width / 2, height / 2, width, height, 0x0b1220, 1);
        const topGlow = this.add.ellipse(width / 2, 0, width * 1.2, height * 0.78, 0x12315b, 0.34).setOrigin(0.5, 0);
        const leftGlow = this.add.circle(width * 0.18, height * 0.34, 260, 0x2563eb, 0.16);
        const rightGlow = this.add.circle(width * 0.82, height * 0.28, 230, 0x7c3aed, 0.14);
        const floorGlow = this.add.ellipse(width / 2, height * 0.88, width * 0.94, height * 0.28, 0x0f766e, 0.1);
        const vignetteFrame = this.add.rectangle(width / 2, height / 2, width - 54, height - 54, 0x000000, 0);
        vignetteFrame.setStrokeStyle(2, 0x334155, 0.44);
        const innerFrame = this.add.rectangle(width / 2, height / 2 + 8, width - 134, height - 142, 0x000000, 0);
        innerFrame.setStrokeStyle(1, 0x60a5fa, 0.16);

        const pathLines = this.add.graphics();
        pathLines.lineStyle(2, 0x38bdf8, 0.11);
        pathLines.beginPath();
        pathLines.moveTo(120, height * 0.22);
        pathLines.lineTo(width * 0.36, height * 0.22);
        pathLines.lineTo(width * 0.5, height * 0.12);
        pathLines.lineTo(width - 180, height * 0.12);
        pathLines.strokePath();
        pathLines.lineStyle(2, 0xa855f7, 0.09);
        pathLines.beginPath();
        pathLines.moveTo(160, height - 170);
        pathLines.lineTo(width * 0.28, height - 170);
        pathLines.lineTo(width * 0.42, height - 108);
        pathLines.lineTo(width - 140, height - 108);
        pathLines.strokePath();

        [
            base,
            topGlow,
            leftGlow,
            rightGlow,
            floorGlow,
            vignetteFrame,
            innerFrame,
            pathLines,
        ].forEach((gameObject) => gameObject.setDepth(-20));
    }

    private getDeckbuilderCardMetadataResources(): DeckbuilderCardMetadataResources {
        if (!this.deckbuilderCardMetadataResources) {
            this.deckbuilderCardMetadataResources = resolveDeckbuilderCardMetadataResources(
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            );
        }

        return this.deckbuilderCardMetadataResources;
    }

    private assertLaunchTargetMatchesMapDefinition(): void {
        if (this.mapDefinition.id !== this.launchData.mapId) {
            throw new Error(
                `ExpeditionScene launch expected map ${this.launchData.mapId}, but ${this.launchData.mapFile} declares ${this.mapDefinition.id}.`,
            );
        }
    }

    private createEntryShell(): void {
        const { width } = this.scale;
        const container = this.add.container(0, 0);
        const routeBriefing = this.getEntryRouteBriefing('preparation');
        const headerWidth = 712;
        const headerHeight = 86;
        const headerX = width / 2;
        const headerY = 50;
        const headerLeft = headerX - headerWidth / 2;
        const headerRight = headerX + headerWidth / 2;

        const frameOuter = this.add.rectangle(width / 2, 0, 0, 0, 0x000000, 0);
        frameOuter.setStrokeStyle(2, 0x38bdf8, 0.22);
        const frameInner = this.add.rectangle(width / 2, 0, 0, 0, 0x000000, 0);
        frameInner.setStrokeStyle(1, 0x60a5fa, 0.34);
        const headerPlate = this.add.rectangle(headerX, headerY, headerWidth, headerHeight, 0x091423, 0.94);
        headerPlate.setStrokeStyle(2, 0x3b82f6, 0.72);
        const headerAccent = this.add.rectangle(headerX, 12, headerWidth - 72, 5, 0x38bdf8, 1).setOrigin(0.5, 0);
        const headerDivider = this.add.rectangle(headerRight - 254, headerY, 2, 54, 0x60a5fa, 0.24);
        const titleText = this.add.text(headerLeft + 22, 44, this.mapDefinition.name, {
            fontFamily: 'Arial',
            fontSize: '30px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        const subtitleText = this.add.text(headerLeft + 22, 72, routeBriefing.shellSubtitle, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#bfdbfe',
        }).setOrigin(0, 0.5);
        const modeBadgeText = this.add.text(headerLeft + 22, 20, routeBriefing.shellBadgeLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#dbeafe',
            fontStyle: 'bold',
            backgroundColor: '#1d4ed8',
            padding: { left: 12, right: 12, top: 6, bottom: 6 },
        }).setOrigin(0, 0);
        const routeSlateLeft = headerRight - 238;
        const routeSlateTop = headerY - 30;
        const routeSlateTelemetry = createRouteTelemetryChipRow(
            this,
            routeSlateLeft + 22,
            routeSlateTop + 7,
            190,
            routeBriefing.telemetryChips,
            {
                fillColor: 0x0f2847,
                borderColor: 0x2563eb,
                labelColor: '#7dd3fc',
                valueColor: '#e0f2fe',
            },
            ENTRY_SHELL_ROUTE_TELEMETRY_CHIP_OPTIONS,
        );
        const routeSlate = {
            plate: this.add.rectangle(headerRight - 119, headerY, 238, 60, 0x0d1b31, 0.98),
            accent: this.add.rectangle(headerRight - 119, headerY - 27, 206, 3, 0x38bdf8, 1),
            chips: routeSlateTelemetry.chips,
        } satisfies EntryShellRouteSlate;
        routeSlate.plate.setStrokeStyle(1, 0x2563eb, 0.82);
        const statusStrip = this.add.rectangle(width / 2, 114, 752, 56, 0x112131, 0.96);
        statusStrip.setStrokeStyle(1, 0x34d399, 0.82);
        const statusStripAccent = this.add.rectangle(width / 2 - 370, 114, 4, 40, 0x34d399, 1);
        const statusStripBadgeText = this.add.text(width / 2 - 344, 99, '', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#d1fae5',
            fontStyle: 'bold',
            backgroundColor: '#065f46',
            padding: { left: 10, right: 10, top: 5, bottom: 5 },
        }).setOrigin(0, 0);
        const statusStripHeadlineText = this.add.text(width / 2 - 232, 97, '', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0, 0);
        const statusStripDetailText = this.add.text(width / 2 - 232, 119, '', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#a7f3d0',
        }).setOrigin(0, 0);
        const topRail = this.add.rectangle(width / 2, 152, 420, 6, 0x1e293b, 0.94);
        const topRailProgress = this.add.rectangle(width / 2 - 210, 152, 0, 6, 0x38bdf8, 1).setOrigin(0, 0.5);
        const stepOnePill = this.add.rectangle(width / 2 - 146, 152, 210, 34, 0x1d4ed8, 0.96);
        stepOnePill.setStrokeStyle(1, 0x60a5fa, 0.92);
        const stepOneText = this.add.text(width / 2 - 146, 152, '1 确认路线与带入', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#dbeafe',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const stepTwoPill = this.add.rectangle(width / 2 + 146, 152, 188, 34, 0x0f172a, 0.96);
        stepTwoPill.setStrokeStyle(1, 0x334155, 0.68);
        const stepTwoText = this.add.text(width / 2 + 146, 152, '2 卡组管理', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#94a3b8',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const leftAccentBar = this.add.rectangle(0, 0, 4, 92, 0x38bdf8, 0.82);
        const rightAccentBar = this.add.rectangle(0, 0, 4, 92, 0x8b5cf6, 0.82);
        const corners: EntryShellCorners = {
            topLeftHorizontal: this.add.rectangle(0, 0, 54, 4, 0x38bdf8, 0.98),
            topLeftVertical: this.add.rectangle(0, 0, 4, 54, 0x38bdf8, 0.98),
            topRightHorizontal: this.add.rectangle(0, 0, 54, 4, 0x38bdf8, 0.98),
            topRightVertical: this.add.rectangle(0, 0, 4, 54, 0x38bdf8, 0.98),
            bottomLeftHorizontal: this.add.rectangle(0, 0, 54, 4, 0x8b5cf6, 0.98),
            bottomLeftVertical: this.add.rectangle(0, 0, 4, 54, 0x8b5cf6, 0.98),
            bottomRightHorizontal: this.add.rectangle(0, 0, 54, 4, 0x8b5cf6, 0.98),
            bottomRightVertical: this.add.rectangle(0, 0, 4, 54, 0x8b5cf6, 0.98),
        };

        container.add([
            frameOuter,
            frameInner,
            headerPlate,
            headerAccent,
            headerDivider,
            titleText,
            subtitleText,
            modeBadgeText,
            routeSlate.plate,
            routeSlate.accent,
            ...routeSlateTelemetry.elements,
            statusStrip,
            statusStripAccent,
            statusStripBadgeText,
            statusStripHeadlineText,
            statusStripDetailText,
            topRail,
            topRailProgress,
            stepOnePill,
            stepOneText,
            stepTwoPill,
            stepTwoText,
            leftAccentBar,
            rightAccentBar,
            corners.topLeftHorizontal,
            corners.topLeftVertical,
            corners.topRightHorizontal,
            corners.topRightVertical,
            corners.bottomLeftHorizontal,
            corners.bottomLeftVertical,
            corners.bottomRightHorizontal,
            corners.bottomRightVertical,
        ]);
        container.setDepth(1300);
        container.setVisible(false);
        container.setAlpha(0);

        this.entryShell = {
            container,
            frameOuter,
            frameInner,
            headerPlate,
            headerAccent,
            headerDivider,
            titleText,
            subtitleText,
            modeBadgeText,
            routeSlate,
            topRail,
            topRailProgress,
            stepOnePill,
            stepOneText,
            stepTwoPill,
            stepTwoText,
            statusStrip,
            statusStripAccent,
            statusStripBadgeText,
            statusStripHeadlineText,
            statusStripDetailText,
            leftAccentBar,
            rightAccentBar,
            corners,
        };

        this.entryTransitionBlocker = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.001);
        this.entryTransitionBlocker.setDepth(1450);
        this.entryTransitionBlocker.setVisible(false);
        this.entryTransitionBlocker.disableInteractive();

        this.updateEntryShellMode('preparation');
        this.updateEntryShellLayout('preparation', false);
    }

    private getEntryRouteBriefing(mode: EntryShellMode) {
        return createExpeditionRouteBriefingSummary(this.mapDefinition, mode);
    }

    private getEntryShellStatusToneColors(tone: PreparationDeckHandoffSummary['tone']) {
        switch (tone) {
            case 'positive':
                return {
                    fillColor: 0x10241f,
                    borderColor: 0x34d399,
                    accentColor: 0x34d399,
                    badgeColor: '#d1fae5',
                    badgeBackgroundColor: '#065f46',
                    headlineColor: '#ecfdf5',
                    detailColor: '#a7f3d0',
                };
            case 'warning':
                return {
                    fillColor: 0x2b190d,
                    borderColor: 0xf59e0b,
                    accentColor: 0xfbbf24,
                    badgeColor: '#fef3c7',
                    badgeBackgroundColor: '#92400e',
                    headlineColor: '#fffbeb',
                    detailColor: '#fcd34d',
                };
            case 'neutral':
                return {
                    fillColor: 0x111c2f,
                    borderColor: 0x60a5fa,
                    accentColor: 0x60a5fa,
                    badgeColor: '#dbeafe',
                    badgeBackgroundColor: '#1d4ed8',
                    headlineColor: '#eff6ff',
                    detailColor: '#bfdbfe',
                };
        }
    }

    private getEntryShellModeVisualConfig(mode: EntryShellMode): EntryShellModeVisualConfig {
        if (mode === 'deckManager') {
            return {
                badgeBackgroundColor: '#4c1d95',
                badgeColor: '#ede9fe',
                headerFillColor: 0x140f23,
                headerDividerColor: 0xc084fc,
                subtitleColor: '#ddd6fe',
                borderColor: 0xa855f7,
                accentColor: 0xc084fc,
                routePlateFillColor: 0x1a1234,
                routePlateBorderColor: 0xa855f7,
                routePlateAccentColor: 0xc084fc,
                routeChipFillColor: 0x24123f,
                routeChipBorderColor: 0x7c3aed,
                routeLabelColor: '#c4b5fd',
                routeValueColor: '#ede9fe',
                cornerTopColor: 0xc084fc,
                cornerBottomColor: 0x60a5fa,
                railTrackColor: 0x1f1a43,
                railProgressColor: 0xc084fc,
                frameOuterColor: 0xc084fc,
                frameOuterAlpha: 0.26,
                frameInnerColor: 0xddd6fe,
                frameInnerAlpha: 0.34,
                stepCurrentFillColor: 0x4c1d95,
                stepCurrentStrokeColor: 0xc084fc,
                stepCurrentTextColor: '#ede9fe',
                stepCompleteFillColor: 0x12315b,
                stepCompleteStrokeColor: 0x60a5fa,
                stepCompleteTextColor: '#dbeafe',
                stepStandbyFillColor: 0x0f172a,
                stepStandbyStrokeColor: 0x334155,
                stepStandbyTextColor: '#94a3b8',
            };
        }

        return {
            badgeBackgroundColor: '#1d4ed8',
            badgeColor: '#dbeafe',
            headerFillColor: 0x091423,
            headerDividerColor: 0x60a5fa,
            subtitleColor: '#bfdbfe',
            borderColor: 0x3b82f6,
            accentColor: 0x38bdf8,
            routePlateFillColor: 0x0d1b31,
            routePlateBorderColor: 0x2563eb,
            routePlateAccentColor: 0x38bdf8,
            routeChipFillColor: 0x0f2847,
            routeChipBorderColor: 0x2563eb,
            routeLabelColor: '#7dd3fc',
            routeValueColor: '#e0f2fe',
            cornerTopColor: 0x38bdf8,
            cornerBottomColor: 0x8b5cf6,
            railTrackColor: 0x132235,
            railProgressColor: 0x38bdf8,
            frameOuterColor: 0x38bdf8,
            frameOuterAlpha: 0.22,
            frameInnerColor: 0x60a5fa,
            frameInnerAlpha: 0.34,
            stepCurrentFillColor: 0x1d4ed8,
            stepCurrentStrokeColor: 0x60a5fa,
            stepCurrentTextColor: '#dbeafe',
            stepCompleteFillColor: 0x14532d,
            stepCompleteStrokeColor: 0x34d399,
            stepCompleteTextColor: '#d1fae5',
            stepStandbyFillColor: 0x0f172a,
            stepStandbyStrokeColor: 0x334155,
            stepStandbyTextColor: '#94a3b8',
        };
    }

    private getEntryShellStepColors(
        state: 'current' | 'complete' | 'upcoming',
        modeConfig: EntryShellModeVisualConfig,
    ) {
        if (state === 'current') {
            return {
                fillColor: modeConfig.stepCurrentFillColor,
                strokeColor: modeConfig.stepCurrentStrokeColor,
                textColor: modeConfig.stepCurrentTextColor,
                strokeAlpha: 0.92,
            };
        }

        if (state === 'complete') {
            return {
                fillColor: modeConfig.stepCompleteFillColor,
                strokeColor: modeConfig.stepCompleteStrokeColor,
                textColor: modeConfig.stepCompleteTextColor,
                strokeAlpha: 0.9,
            };
        }

        return {
            fillColor: modeConfig.stepStandbyFillColor,
            strokeColor: modeConfig.stepStandbyStrokeColor,
            textColor: modeConfig.stepStandbyTextColor,
            strokeAlpha: 0.68,
        };
    }

    private formatEntryShellStepLabel(
        index: 1 | 2,
        label: string,
        state: 'current' | 'complete' | 'upcoming',
    ): string {
        return state === 'complete' ? `✓ ${label}` : `${index} ${label}`;
    }

    private createWorldMapReturnButton(): void {
        const { width } = this.scale;
        const x = width - 150;
        const y = 48;
        const container = this.add.container(0, 0);
        const shadow = this.add.rectangle(x, y + 5, 184, 46, 0x020617, 0.4);
        const background = this.add.rectangle(x, y, 184, 46, 0x162338, 0.96);
        background.setStrokeStyle(2, 0x93c5fd, 0.78);
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => background.setFillStyle(0x233551, 1));
        background.on('pointerout', () => background.setFillStyle(0x162338, 0.96));
        background.on('pointerdown', () => this.returnToWorldMap());

        const label = this.add.text(x, y, '返回大地图', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add([shadow, background, label]);
        container.setDepth(1310);
    }

    private updateEntryShellMode(mode: EntryShellMode): void {
        if (!this.entryShell) {
            return;
        }

        const routeBriefing = this.getEntryRouteBriefing(mode);
        const preflightStatus = createExpeditionPreflightStatusSummary(this.expeditionState.persistentStash, mode);
        const modeConfig = this.getEntryShellModeVisualConfig(mode);
        const statusToneConfig = this.getEntryShellStatusToneColors(preflightStatus.tone);
        const [firstStep, secondStep] = preflightStatus.steps;
        const firstStepColors = this.getEntryShellStepColors(firstStep.state, modeConfig);
        const secondStepColors = this.getEntryShellStepColors(secondStep.state, modeConfig);

        this.entryShell.frameOuter.setStrokeStyle(2, modeConfig.frameOuterColor, modeConfig.frameOuterAlpha);
        this.entryShell.frameInner.setStrokeStyle(1, modeConfig.frameInnerColor, modeConfig.frameInnerAlpha);
        this.entryShell.headerPlate.setFillStyle(modeConfig.headerFillColor, 0.94);
        this.entryShell.headerPlate.setStrokeStyle(2, modeConfig.borderColor, 0.72);
        this.entryShell.headerAccent.setFillStyle(modeConfig.accentColor, 1);
        this.entryShell.headerDivider.setFillStyle(modeConfig.headerDividerColor, 0.24);
        this.entryShell.modeBadgeText.setText(routeBriefing.shellBadgeLabel);
        this.entryShell.modeBadgeText.setStyle({
            color: modeConfig.badgeColor,
            backgroundColor: modeConfig.badgeBackgroundColor,
        });
        this.entryShell.subtitleText.setText(routeBriefing.shellSubtitle);
        this.entryShell.subtitleText.setColor(modeConfig.subtitleColor);
        this.entryShell.routeSlate.plate.setFillStyle(modeConfig.routePlateFillColor, 0.98);
        this.entryShell.routeSlate.plate.setStrokeStyle(1, modeConfig.routePlateBorderColor, 0.82);
        this.entryShell.routeSlate.accent.setFillStyle(modeConfig.routePlateAccentColor, 1);
        this.entryShell.routeSlate.chips.forEach((chip) => {
            chip.background.setFillStyle(modeConfig.routeChipFillColor, 0.96);
            chip.background.setStrokeStyle(1, modeConfig.routeChipBorderColor, 0.92);
            chip.labelText.setColor(modeConfig.routeLabelColor);
            chip.valueText.setColor(modeConfig.routeValueColor);
        });
        this.entryShell.statusStrip.setFillStyle(statusToneConfig.fillColor, 0.96);
        this.entryShell.statusStrip.setStrokeStyle(1, statusToneConfig.borderColor, 0.86);
        this.entryShell.statusStripAccent.setFillStyle(statusToneConfig.accentColor, 1);
        this.entryShell.statusStripBadgeText.setText(preflightStatus.badgeLabel);
        this.entryShell.statusStripBadgeText.setStyle({
            color: statusToneConfig.badgeColor,
            backgroundColor: statusToneConfig.badgeBackgroundColor,
        });
        this.entryShell.statusStripHeadlineText.setText(preflightStatus.headline);
        this.entryShell.statusStripHeadlineText.setColor(statusToneConfig.headlineColor);
        this.entryShell.statusStripDetailText.setText(preflightStatus.detail);
        this.entryShell.statusStripDetailText.setColor(statusToneConfig.detailColor);
        this.entryShell.topRail.setFillStyle(modeConfig.railTrackColor, 0.94);
        this.entryShell.topRailProgress.setFillStyle(modeConfig.railProgressColor, 1);
        this.entryShell.stepOnePill.setFillStyle(firstStepColors.fillColor, 0.96);
        this.entryShell.stepOnePill.setStrokeStyle(1, firstStepColors.strokeColor, firstStepColors.strokeAlpha);
        this.entryShell.stepOneText.setText(this.formatEntryShellStepLabel(firstStep.index, firstStep.label, firstStep.state));
        this.entryShell.stepOneText.setColor(firstStepColors.textColor);
        this.entryShell.stepTwoPill.setFillStyle(secondStepColors.fillColor, 0.96);
        this.entryShell.stepTwoPill.setStrokeStyle(1, secondStepColors.strokeColor, secondStepColors.strokeAlpha);
        this.entryShell.stepTwoText.setText(this.formatEntryShellStepLabel(secondStep.index, secondStep.label, secondStep.state));
        this.entryShell.stepTwoText.setColor(secondStepColors.textColor);
        this.entryShell.leftAccentBar.setFillStyle(modeConfig.cornerTopColor, 0.82);
        this.entryShell.rightAccentBar.setFillStyle(modeConfig.cornerBottomColor, 0.82);
        this.entryShell.corners.topLeftHorizontal.setFillStyle(modeConfig.cornerTopColor, 0.98);
        this.entryShell.corners.topLeftVertical.setFillStyle(modeConfig.cornerTopColor, 0.98);
        this.entryShell.corners.topRightHorizontal.setFillStyle(modeConfig.cornerTopColor, 0.98);
        this.entryShell.corners.topRightVertical.setFillStyle(modeConfig.cornerTopColor, 0.98);
        this.entryShell.corners.bottomLeftHorizontal.setFillStyle(modeConfig.cornerBottomColor, 0.98);
        this.entryShell.corners.bottomLeftVertical.setFillStyle(modeConfig.cornerBottomColor, 0.98);
        this.entryShell.corners.bottomRightHorizontal.setFillStyle(modeConfig.cornerBottomColor, 0.98);
        this.entryShell.corners.bottomRightVertical.setFillStyle(modeConfig.cornerBottomColor, 0.98);
    }

    private updateEntryShellLayout(mode: EntryShellMode, animate: boolean): void {
        if (!this.entryShell) {
            return;
        }

        const { width, height } = this.scale;
        const panelWidth = mode === 'deckManager'
            ? Math.min(1120, width * 0.9)
            : Math.min(980, width * 0.82);
        const panelHeight = mode === 'deckManager'
            ? Math.min(760, height * 0.86)
            : Math.min(820, height * 0.88);
        const panelX = width / 2;
        const panelY = mode === 'deckManager' ? (height / 2 + 18) : (height / 2 + 24);
        const padding = 22;
        const left = panelX - panelWidth / 2 - padding;
        const right = panelX + panelWidth / 2 + padding;
        const top = panelY - panelHeight / 2 - padding;
        const bottom = panelY + panelHeight / 2 + padding;
        const centerY = panelY;
        const cornerLength = 54;
        const sideBarWidth = mode === 'deckManager' ? 6 : 4;
        const sideBarHeight = mode === 'deckManager' ? 82 : 92;
        const frameOuterInset = mode === 'deckManager' ? 28 : 24;
        const frameInnerInset = mode === 'deckManager' ? 10 : 8;
        const topRailY = top + 22;
        const topRailWidth = Math.max(340, Math.min(panelWidth - 260, 470));
        const statusWidth = Math.max(640, Math.min(panelWidth - 80, 820));
        const statusLeft = panelX - statusWidth / 2;
        const statusY = top - 18;
        const statusTextX = statusLeft + 132;
        const progressWidth = mode === 'deckManager'
            ? topRailWidth
            : Math.max(86, Math.round(topRailWidth * 0.34));
        const stepOneWidth = 214;
        const stepTwoWidth = 188;
        const firstStepX = panelX - topRailWidth / 2;
        const secondStepX = panelX + topRailWidth / 2;
        const shellTargets: Array<[Phaser.GameObjects.Rectangle, number, number, number, number]> = [
            [this.entryShell.frameOuter, panelX, panelY, panelWidth + frameOuterInset * 2, panelHeight + frameOuterInset * 2],
            [this.entryShell.frameInner, panelX, panelY, panelWidth + frameInnerInset * 2, panelHeight + frameInnerInset * 2],
            [this.entryShell.statusStrip, panelX, statusY, statusWidth, 56],
            [this.entryShell.statusStripAccent, statusLeft + 18, statusY, 4, 40],
            [this.entryShell.topRail, panelX, topRailY, topRailWidth, 6],
            [this.entryShell.topRailProgress, firstStepX, topRailY, progressWidth, 6],
            [this.entryShell.stepOnePill, firstStepX, topRailY, stepOneWidth, 34],
            [this.entryShell.stepTwoPill, secondStepX, topRailY, stepTwoWidth, 34],
            [this.entryShell.leftAccentBar, left - 10, centerY, sideBarWidth, sideBarHeight],
            [this.entryShell.rightAccentBar, right + 10, centerY, sideBarWidth, sideBarHeight],
            [this.entryShell.corners.topLeftHorizontal, left + cornerLength / 2, top, cornerLength, 4],
            [this.entryShell.corners.topLeftVertical, left, top + cornerLength / 2, 4, cornerLength],
            [this.entryShell.corners.topRightHorizontal, right - cornerLength / 2, top, cornerLength, 4],
            [this.entryShell.corners.topRightVertical, right, top + cornerLength / 2, 4, cornerLength],
            [this.entryShell.corners.bottomLeftHorizontal, left + cornerLength / 2, bottom, cornerLength, 4],
            [this.entryShell.corners.bottomLeftVertical, left, bottom - cornerLength / 2, 4, cornerLength],
            [this.entryShell.corners.bottomRightHorizontal, right - cornerLength / 2, bottom, cornerLength, 4],
            [this.entryShell.corners.bottomRightVertical, right, bottom - cornerLength / 2, 4, cornerLength],
        ];
        const textTargets: Array<[Phaser.GameObjects.Text, number, number]> = [
            [this.entryShell.statusStripBadgeText, statusLeft + 28, statusY - 14],
            [this.entryShell.statusStripHeadlineText, statusTextX, statusY - 18],
            [this.entryShell.statusStripDetailText, statusTextX, statusY + 4],
            [this.entryShell.stepOneText, firstStepX, topRailY],
            [this.entryShell.stepTwoText, secondStepX, topRailY],
        ];

        this.entryShell.statusStripHeadlineText.setWordWrapWidth(statusWidth - 154);
        this.entryShell.statusStripDetailText.setWordWrapWidth(statusWidth - 154);

        if (!animate) {
            shellTargets.forEach(([target, x, y, displayWidth, displayHeight]) => {
                target.setPosition(x, y);
                target.setDisplaySize(displayWidth, displayHeight);
            });
            textTargets.forEach(([target, x, y]) => target.setPosition(x, y));
            return;
        }

        shellTargets.forEach(([target, x, y, displayWidth, displayHeight]) => {
            this.tweens.killTweensOf(target);
            this.tweens.add({
                targets: target,
                x,
                y,
                displayWidth,
                displayHeight,
                duration: 240,
                ease: 'Cubic.easeOut',
            });
        });
        textTargets.forEach(([target, x, y]) => {
            this.tweens.killTweensOf(target);
            this.tweens.add({
                targets: target,
                x,
                y,
                duration: 240,
                ease: 'Cubic.easeOut',
            });
        });
    }

    private setEntryShellVisible(visible: boolean, animate: boolean): void {
        if (!this.entryShell) {
            return;
        }

        this.tweens.killTweensOf(this.entryShell.container);

        if (visible) {
            this.entryShell.container.setVisible(true);

            if (!animate) {
                this.entryShell.container.setAlpha(1);
                this.entryShell.container.setY(0);
                return;
            }

            if (this.entryShell.container.alpha <= 0.02) {
                this.entryShell.container.setY(-8);
            }

            this.tweens.add({
                targets: this.entryShell.container,
                alpha: 1,
                y: 0,
                duration: 220,
                ease: 'Cubic.easeOut',
            });
            return;
        }

        if (!animate) {
            this.entryShell.container.setVisible(false);
            this.entryShell.container.setAlpha(0);
            this.entryShell.container.setY(-8);
            return;
        }

        this.tweens.add({
            targets: this.entryShell.container,
            alpha: 0,
            y: -8,
            duration: 180,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.entryShell?.container.setVisible(false);
            },
        });
    }

    private setEntryTransitionBlocker(active: boolean): void {
        if (!this.entryTransitionBlocker) {
            return;
        }

        this.entryTransitionBlocker.setVisible(active);

        if (active) {
            this.entryTransitionBlocker.setInteractive({ useHandCursor: false });
        } else {
            this.entryTransitionBlocker.disableInteractive();
        }
    }

    private destroyDepartureHandoffOverlay(): void {
        if (this.departureHandoffKeydownHandler) {
            this.input.keyboard?.off('keydown', this.departureHandoffKeydownHandler);
            this.departureHandoffKeydownHandler = undefined;
        }

        if (this.departureHandoffOverlay) {
            this.tweens.killTweensOf(this.departureHandoffOverlay);
            this.departureHandoffOverlay.destroy();
            this.departureHandoffOverlay = undefined;
        }

        this.setEntryTransitionBlocker(false);
    }

    private isDepartureHandoffConfirmInput(event: KeyboardEvent): boolean {
        return event.key === 'Enter'
            || event.key === ' '
            || event.key === 'Spacebar'
            || event.code === 'Space';
    }

    private playDepartureHandoff(
        summary: ExpeditionDepartureHandoffSummary,
        onAcknowledge: () => void,
    ): void {
        this.destroyDepartureHandoffOverlay();

        const { width, height } = this.scale;
        const panelWidth = Math.min(820, width * 0.72);
        const panelHeight = 352;
        const panelX = width / 2;
        const panelY = height / 2 + 26;
        const panelLeft = panelX - panelWidth / 2 + 42;
        const container = this.add.container(0, 0);
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.76);
        overlay.setInteractive({ useHandCursor: true });
        const shadow = this.add.rectangle(panelX, panelY + 10, panelWidth, panelHeight, 0x01040a, 0.42);
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x07111f, 0.97);
        panel.setStrokeStyle(2, 0x38bdf8, 0.9);
        const accentTop = this.add.rectangle(panelX, panelY - panelHeight / 2 + 10, panelWidth - 56, 4, 0x38bdf8, 1);
        const accentBottom = this.add.rectangle(panelX, panelY + panelHeight / 2 - 14, panelWidth - 128, 2, 0x8b5cf6, 0.92);
        const badge = this.add.text(panelLeft, panelY - panelHeight / 2 + 26, summary.badgeLabel, {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#dbeafe',
            fontStyle: 'bold',
            backgroundColor: '#1d4ed8',
            padding: { left: 12, right: 12, top: 6, bottom: 6 },
        }).setOrigin(0, 0);
        const headline = this.add.text(panelLeft, badge.y + 38, summary.headline, {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#f8fafc',
            fontStyle: 'bold',
            wordWrap: { width: panelWidth - 84 },
        }).setOrigin(0, 0);
        const detail = this.add.text(panelLeft, headline.y + headline.height + 10, summary.detail, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#bfdbfe',
            wordWrap: { width: panelWidth - 84 },
        }).setOrigin(0, 0);
        const routePlate = this.add.rectangle(panelX, detail.y + detail.height + 32, panelWidth - 80, 54, 0x0d1b31, 0.98);
        routePlate.setStrokeStyle(1, 0x2563eb, 0.88);
        const routeText = this.add.text(panelLeft + 14, routePlate.y, summary.routeLine, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#e0f2fe',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        const loadoutPlate = this.add.rectangle(panelX, routePlate.y + 62, panelWidth - 80, 46, 0x10241f, 0.98);
        loadoutPlate.setStrokeStyle(1, 0x34d399, 0.88);
        const loadoutText = this.add.text(panelLeft + 14, loadoutPlate.y, summary.loadoutLine, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#d1fae5',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        let acknowledge: () => void = () => undefined;
        const continueButton = this.createButton({
            x: panelX,
            y: loadoutPlate.y + 58,
            width: 286,
            height: 52,
            label: '进入秘境',
            fillColor: 0x1d4ed8,
            onClick: () => acknowledge(),
        });
        const footer = this.add.text(panelX, continueButton[0].y + 44, '点按任意处或按 Enter / Space 继续。首层提示会保留。', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#cbd5e1',
            align: 'center',
            wordWrap: { width: panelWidth - 88 },
        }).setOrigin(0.5);

        let acknowledged = false;
        acknowledge = () => {
            if (acknowledged) {
                return;
            }

            acknowledged = true;
            overlay.disableInteractive();
            continueButton[0].disableInteractive();

            if (this.departureHandoffKeydownHandler) {
                this.input.keyboard?.off('keydown', this.departureHandoffKeydownHandler);
                this.departureHandoffKeydownHandler = undefined;
            }

            this.tweens.killTweensOf(container);
            this.tweens.add({
                targets: container,
                alpha: 0,
                y: -18,
                duration: 220,
                ease: 'Cubic.easeIn',
                onComplete: () => {
                    if (this.departureHandoffOverlay === container) {
                        this.departureHandoffOverlay.destroy();
                        this.departureHandoffOverlay = undefined;
                    }

                    this.setEntryTransitionBlocker(false);
                    onAcknowledge();
                },
            });
        };

        overlay.on('pointerdown', () => acknowledge());
        this.departureHandoffKeydownHandler = (event: KeyboardEvent) => {
            if (event.repeat || !this.isDepartureHandoffConfirmInput(event)) {
                return;
            }

            event.preventDefault();
            acknowledge();
        };
        this.input.keyboard?.on('keydown', this.departureHandoffKeydownHandler);

        container.add([
            overlay,
            shadow,
            panel,
            accentTop,
            accentBottom,
            badge,
            headline,
            detail,
            routePlate,
            routeText,
            loadoutPlate,
            loadoutText,
            ...continueButton,
            footer,
        ]);
        container.setDepth(1460);
        container.setAlpha(0);
        container.setY(18);
        this.departureHandoffOverlay = container;
        this.setEntryTransitionBlocker(true);

        this.tweens.add({
            targets: container,
            alpha: 1,
            y: 0,
            duration: 220,
            ease: 'Cubic.easeOut',
        });
    }

    private getCurrentEntryPanel(): EntryPanel | undefined {
        return this.deckManagementPanel ?? this.preparationPanel;
    }

    private swapEntryPanel(
        currentPanel: EntryPanel | undefined,
        nextPanel: EntryPanel,
        mode: EntryShellMode,
        direction: 'forward' | 'backward' | 'refresh',
        animate = true,
    ): void {
        const offsets = direction === 'forward'
            ? { enterY: 34, exitY: -20 }
            : direction === 'backward'
                ? { enterY: -28, exitY: 22 }
                : { enterY: 14, exitY: -10 };

        this.updateEntryShellMode(mode);
        this.updateEntryShellLayout(mode, animate);
        this.setEntryShellVisible(true, animate);
        this.tweens.killTweensOf(nextPanel);

        if (currentPanel) {
            this.tweens.killTweensOf(currentPanel);
        }

        if (!animate) {
            currentPanel?.destroy();
            nextPanel.setAlpha(1);
            nextPanel.setY(0);
            this.setEntryTransitionBlocker(false);
            return;
        }

        this.setEntryTransitionBlocker(true);
        nextPanel.setAlpha(0);
        nextPanel.setY(offsets.enterY);

        if (!currentPanel) {
            this.tweens.add({
                targets: nextPanel,
                alpha: 1,
                y: 0,
                duration: 240,
                ease: 'Cubic.easeOut',
                onComplete: () => this.setEntryTransitionBlocker(false),
            });
            return;
        }

        currentPanel.setAlpha(1);
        currentPanel.setY(0);
        let completedTweens = 0;
        const completeTransition = () => {
            completedTweens += 1;

            if (completedTweens < 2) {
                return;
            }

            currentPanel.destroy();
            this.setEntryTransitionBlocker(false);
        };

        this.tweens.add({
            targets: currentPanel,
            alpha: 0,
            y: offsets.exitY,
            duration: 180,
            ease: 'Cubic.easeIn',
            onComplete: completeTransition,
        });
        this.tweens.add({
            targets: nextPanel,
            alpha: 1,
            y: 0,
            duration: 240,
            ease: 'Cubic.easeOut',
            onComplete: completeTransition,
        });
    }

    private dismissEntryPanels(onComplete: () => void, animate = true): void {
        const currentPanel = this.getCurrentEntryPanel();

        this.preparationPanel = undefined;
        this.deckManagementPanel = undefined;
        this.setEntryShellVisible(false, animate);

        if (!currentPanel) {
            this.setEntryTransitionBlocker(false);
            onComplete();
            return;
        }

        this.tweens.killTweensOf(currentPanel);

        if (!animate) {
            currentPanel.destroy();
            this.setEntryTransitionBlocker(false);
            onComplete();
            return;
        }

        this.setEntryTransitionBlocker(true);
        currentPanel.setAlpha(1);
        currentPanel.setY(0);
        this.tweens.add({
            targets: currentPanel,
            alpha: 0,
            y: -16,
            duration: 180,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                currentPanel.destroy();
                this.setEntryTransitionBlocker(false);
                onComplete();
            },
        });
    }

    private returnToWorldMap(): void {
        this.destroyDepartureHandoffOverlay();
        const intent = createWorldMapReturnIntent({
            source: 'expedition',
            statusText: `已从${this.mapDefinition.name}返回大地图；再次进入秘境会继续当前探索。`,
        });

        this.scene.start(intent.sceneKey, intent.payload);
    }

    private showPreparationPanel(): void {
        const currentPanel = this.getCurrentEntryPanel();
        this.destroyDepartureHandoffOverlay();
        this.runHud.hideArrivalCue();
        this.runHud.setVisible(false);
        this.clearMapViews();
        this.destroyNodeMenu();
        this.destroyActiveNodePanel();
        const nextPanel = new PreparationPanel(this, {
            stash: this.expeditionState.persistentStash,
            metadata: this.deckbuilderCardMetadata,
            routeBriefing: this.getEntryRouteBriefing('preparation'),
            onConfirm: () => this.startFreshRun(),
            onDeckSelect: (deckId) => this.handleDeckSelect(deckId),
            onOpenDeckManager: () => this.showDeckManagementPanel(),
            deckHandoffSummary: this.pendingPreparationDeckHandoff,
        });
        this.preparationPanel = nextPanel;
        this.deckManagementPanel = undefined;
        this.pendingPreparationDeckHandoff = undefined;
        this.swapEntryPanel(
            currentPanel,
            nextPanel,
            'preparation',
            currentPanel instanceof DeckManagementPanel ? 'backward' : 'refresh',
        );
    }

    private handleDeckSelect(deckId: string): void {
        const beforeContext = createPreparationDeckContext(this.expeditionState.persistentStash);

        if (beforeContext.selectedDeckId === deckId) {
            return;
        }

        this.expeditionState.persistentStash = selectDeckInStash(this.expeditionState.persistentStash, deckId);
        this.expeditionState.persistCurrentStash();
        const afterContext = createPreparationDeckContext(this.expeditionState.persistentStash);

        if (this.preparationPanel) {
            this.preparationPanel.updateStash(this.expeditionState.persistentStash, {
                before: beforeContext,
                after: afterContext,
            });
            return;
        }

        this.showPreparationPanel();
    }

    private showDeckManagementPanel(): void {
        this.deckManagerEntryContext = createPreparationDeckContext(this.expeditionState.persistentStash);
        const currentPanel = this.getCurrentEntryPanel();
        const nextPanel = new DeckManagementPanel(this, {
            stash: this.expeditionState.persistentStash,
            metadata: this.deckbuilderCardMetadata,
            routeBriefing: this.getEntryRouteBriefing('deckManager'),
            onStashChange: (newStash) => {
                this.expeditionState.persistentStash = newStash;
                this.expeditionState.persistCurrentStash();
                this.updateEntryShellMode('deckManager');
            },
            onClose: () => {
                if (this.deckManagerEntryContext) {
                    this.pendingPreparationDeckHandoff = createPreparationDeckHandoffSummary(
                        this.deckManagerEntryContext,
                        createPreparationDeckContext(this.expeditionState.persistentStash),
                    );
                }

                this.deckManagerEntryContext = undefined;
                this.showPreparationPanel();
            },
        });
        this.preparationPanel = undefined;
        this.deckManagementPanel = nextPanel;
        this.swapEntryPanel(currentPanel, nextPanel, 'deckManager', 'forward');
    }

    private startFreshRun(): void {
        this.confirmLoadout();
    }

    private confirmLoadout(): void {
        const confirmedView = confirmExpeditionLoadout(this.expeditionState, {
            expeditionId: this.launchData.expeditionId,
            mapId: this.launchData.mapId,
            entryNodeId: this.mapDefinition.entryNodeId,
        });
        const currentNodeLabel = this.getNodeLabel(confirmedView.activeRun.currentNodeId);
        const departureHandoff = createExpeditionDepartureHandoffSummary(
            this.mapDefinition,
            this.expeditionState.persistentStash,
            confirmedView.activeRun,
            { currentNodeLabel },
        );
        const arrivalCue = createExpeditionArrivalCueSummary(
            this.mapDefinition,
            this.expeditionState.persistentStash,
            confirmedView.activeRun,
            { currentNodeLabel },
        );

        this.dismissEntryPanels(() => {
            this.playDepartureHandoff(departureHandoff, () => {
                this.showActiveRun(confirmedView.activeRun, 'started', {
                    statusTextOverride: departureHandoff.revealStatusText,
                    arrivalCueSummary: arrivalCue,
                });
            });
        });
    }

    private showActiveRun(
        activeRun: RunSnapshot,
        mode: RunSummaryMode,
        options?: {
            statusTextOverride?: string;
            arrivalCueSummary?: ExpeditionArrivalCueSummary;
        },
    ): void {
        const currentNodeLabel = this.getNodeLabel(activeRun.currentNodeId);
        const summary = createRunSummary(activeRun, {
            mode,
            currentNodeLabel,
        });

        if (!this.getCurrentEntryPanel()) {
            this.setEntryShellVisible(false, false);
        }

        this.runHud.setVisible(true);
        this.runHud.updateFromRun(activeRun, currentNodeLabel);
        if (options?.arrivalCueSummary) {
            this.runHud.showArrivalCue(options.arrivalCueSummary);
        } else {
            this.runHud.hideArrivalCue();
        }
        this.statusText.setText(options?.statusTextOverride ?? summary.statusText);
        this.renderMap(activeRun);
        this.renderNodeMenu(activeRun);
    }

    private getNodeLabel(nodeId: string): string {
        return this.mapDefinition.nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
    }

    private clearMapViews(): void {
        this.mapGraphics?.destroy();
        this.mapGraphics = undefined;

        for (const mapNodeView of this.mapNodeViews) {
            mapNodeView.destroy();
        }

        this.mapNodeViews = [];
    }

    private renderMap(activeRun: RunSnapshot): void {
        this.clearMapViews();

        const visibleNodes = getVisibleNodes(this.mapDefinition, activeRun);
        const nodePositions = this.createNodePositions(this.mapDefinition.nodes);

        this.mapGraphics = this.add.graphics();
        this.mapGraphics.setDepth(40);

        for (const node of this.mapDefinition.nodes) {
            const fromPosition = nodePositions.get(node.id);

            if (!fromPosition) {
                continue;
            }

            for (const outgoingNodeId of node.outgoingNodeIds) {
                const toPosition = nodePositions.get(outgoingNodeId);
                const targetNode = visibleNodes.find((visibleNode) => visibleNode.id === outgoingNodeId);

                if (!toPosition || !targetNode) {
                    continue;
                }

                const isReachableEdge = isReachableNode(this.mapDefinition, activeRun, outgoingNodeId);
                const lineColor = isReachableEdge ? 0xfacc15 : targetNode.visibility === 'cleared' ? 0x38bdf8 : 0x475569;
                const lineAlpha = isReachableEdge ? 0.95 : targetNode.visibility === 'silhouette' ? 0.3 : 0.72;

                this.mapGraphics.lineStyle(isReachableEdge ? 4 : 3, lineColor, lineAlpha);
                this.mapGraphics.beginPath();
                this.mapGraphics.moveTo(fromPosition.x, fromPosition.y);
                this.mapGraphics.lineTo(toPosition.x, toPosition.y);
                this.mapGraphics.strokePath();
            }
        }

        for (const node of visibleNodes) {
            const position = nodePositions.get(node.id);

            if (!position) {
                continue;
            }

            this.mapNodeViews.push(new MapNodeView(this, {
                node,
                x: position.x,
                y: position.y,
                onSelect: (nodeId) => this.handleMapNodeSelected(nodeId),
            }));
        }
    }

    private createNodePositions(nodes: ExpeditionMapNode[]): Map<string, { x: number; y: number }> {
        const { width, height } = this.scale;
        const minLayer = Math.min(...nodes.map((node) => node.layer));
        const maxLayer = Math.max(...nodes.map((node) => node.layer));
        const mapLeft = 220;
        const mapRight = width - 220;
        const mapTop = 430;
        const mapBottom = height - 190;
        const layerSpan = Math.max(1, maxLayer - minLayer);
        const nodesByLayer = new Map<number, ExpeditionMapNode[]>();
        const nodePositions = new Map<string, { x: number; y: number }>();

        for (const node of nodes) {
            const layerNodes = nodesByLayer.get(node.layer) ?? [];
            layerNodes.push(node);
            nodesByLayer.set(node.layer, layerNodes);
        }

        for (const [layer, layerNodes] of nodesByLayer) {
            const x = mapLeft + ((layer - minLayer) / layerSpan) * (mapRight - mapLeft);
            const verticalSpacing = (mapBottom - mapTop) / Math.max(1, layerNodes.length);

            layerNodes.forEach((node, index) => {
                const y = layerNodes.length === 1
                    ? (mapTop + mapBottom) / 2
                    : mapTop + verticalSpacing * (index + 0.5);

                nodePositions.set(node.id, { x, y });
            });
        }

        return nodePositions;
    }

    private handleMapNodeSelected(nodeId: string): void {
        this.runHud.hideArrivalCue(true);
        const activeRun = this.expeditionState.activeRun;
        const node = this.mapDefinition.nodes.find((candidate) => candidate.id === nodeId);
        const canReopenNode = !!node && this.canReopenNonCombatNode(activeRun, node);

        if (!activeRun || (!isReachableNode(this.mapDefinition, activeRun, nodeId) && !canReopenNode)) {
            this.statusText.setText('该节点尚未连通；只能前往当前节点直接连接的下一层节点。');
            return;
        }

        if (node && canReopenNode && this.isNonCombatNode(node)) {
            this.openNonCombatNodePanel(node, activeRun);
            return;
        }

        const nextRun = this.expeditionState.enterReachableNode(
            this.mapDefinition,
            nodeId,
            createExpeditionTargetConfig(this.launchData),
        );

        if (!nextRun) {
            this.statusText.setText('该节点尚未连通；路线保持不变。');
            return;
        }

        const nodeLabel = this.getNodeLabel(nodeId);

        this.runHud.updateFromRun(nextRun, nodeLabel);
        this.renderMap(nextRun);
        this.renderNodeMenu(nextRun);

        if (node && this.isNonCombatNode(node)) {
            this.openNonCombatNodePanel(node, nextRun);
            return;
        }

        if (nextRun.pendingEncounter) {
            this.statusText.setText(`已进入 ${nodeLabel}，正在启动战斗场景。`);
            this.scene.start('BattleScene', createBattleSceneStartPayload(nextRun.pendingEncounter));
            return;
        }

        this.statusText.setText(`已进入 ${nodeLabel}。事件、商店、撤离结算 UI 尚未在本任务中解析。`);
    }

    private renderNodeMenu(activeRun: RunSnapshot): void {
        this.destroyNodeMenu();

        const nonCombatNodes = this.mapDefinition.nodes.filter((node): node is NonCombatMapNode =>
            this.isNonCombatNode(node)
            && (isReachableNode(this.mapDefinition, activeRun, node.id) || this.canReopenNonCombatNode(activeRun, node)),
        );
        const { width } = this.scale;
        const menu = this.add.container(0, 0);
        const panelX = width / 2;
        const panelY = 238;
        const panelWidth = Math.min(1080, width - 240);
        const panelHeight = 156;
        const background = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x020617, 0.82);
        background.setStrokeStyle(2, 0x38bdf8, 0.72);

        const title = this.add.text(panelX - panelWidth / 2 + 32, panelY - 54, '秘境非战斗节点', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#e0f2fe',
            fontStyle: 'bold',
        });

        const subtitle = this.add.text(panelX - panelWidth / 2 + 32, panelY - 20, '事件、商店、撤离均在 ExpeditionScene 内处理；战斗和 BOSS 节点会切换到 BattleScene。', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#cbd5e1',
        });

        menu.add([background, title, subtitle]);

        nonCombatNodes.forEach((node, index) => {
            const x = panelX - 310 + index * 310;
            const state = activeRun.nodeStates[node.id];
            const stateText = node.type === 'event' && state?.rewardClaimed
                ? '已领取'
                : node.type === 'extract' && activeRun.pendingTerminalResolution?.nodeId === node.id
                    ? '已记录撤离'
                    : node.type === 'shop' && (state?.purchasedOfferIds?.length ?? 0) > 0
                        ? `已购 ${state?.purchasedOfferIds?.length ?? 0}`
                        : '可进入';
            const button = this.createButton({
                x,
                y: panelY + 42,
                width: 250,
                height: 54,
                label: `${this.getNodeTypeLabel(node)} · ${node.label}`,
                fillColor: this.getNodeColor(node),
                onClick: () => this.handleNonCombatNodeSelected(node),
            });
            const stateLabel = this.add.text(x, panelY + 78, stateText, {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#fde68a',
            }).setOrigin(0.5);

            menu.add([...button, stateLabel]);
        });

        menu.setDepth(500);
        this.nodeMenu = menu;
    }

    private handleNonCombatNodeSelected(node: NonCombatMapNode): void {
        this.runHud.hideArrivalCue(true);
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            this.statusText.setText('没有进行中的秘境探索。');
            return;
        }

        if (!isReachableNode(this.mapDefinition, activeRun, node.id) && !this.canReopenNonCombatNode(activeRun, node)) {
            this.statusText.setText('该节点尚未连通；只能前往当前节点直接连接的下一层节点。');
            return;
        }

        if (this.canReopenNonCombatNode(activeRun, node)) {
            this.openNonCombatNodePanel(node, activeRun);
            return;
        }

        const enteredRun = this.expeditionState.enterReachableNode(
            this.mapDefinition,
            node.id,
            createExpeditionTargetConfig(this.launchData),
        );

        if (!enteredRun) {
            this.statusText.setText('该节点尚未连通；路线保持不变。');
            return;
        }

        this.openNonCombatNodePanel(node, enteredRun);
    }

    private openNonCombatNodePanel(node: NonCombatMapNode, activeRun: RunSnapshot): void {
        this.refreshActiveRunDisplay(activeRun);

        switch (node.type) {
            case 'event':
                this.showEventPanel(this.resolveEventDefinition(node));
                break;
            case 'shop':
                this.showShopPanel(this.resolveShopDefinition(node));
                break;
            case 'extract':
                this.showExtractPanel(node);
                break;
        }
    }

    private resolveEventDefinition(node: EventMapNode): PrototypeEventDefinition {
        const eventDefinition = this.eventCollection.eventsByNodeId[node.payloadRef.ref];

        if (!eventDefinition) {
            throw new Error(`Missing prototype event content for ${node.payloadRef.ref}.`);
        }

        return eventDefinition;
    }

    private resolveShopDefinition(node: ShopMapNode): PrototypeShopDefinition {
        const shopDefinition = this.shopCollection.shopsByNodeId[node.payloadRef.ref];

        if (!shopDefinition) {
            throw new Error(`Missing prototype shop content for ${node.payloadRef.ref}.`);
        }

        return shopDefinition;
    }

    private showEventPanel(eventDefinition: PrototypeEventDefinition, message?: string): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            return;
        }

        this.destroyActiveNodePanel();

        const view = createEventNodeView(eventDefinition, activeRun, () => 0);
        const { container, contentX, panelY, panelHeight } = this.createModalPanel(view.title, eventDefinition.nodeId);
        const description = this.add.text(contentX, panelY - panelHeight / 2 + 120, view.description, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: 860 },
        });
        const outcomeLabel = this.add.text(contentX, description.y + 84, view.outcome.label, {
            fontFamily: 'Arial',
            fontSize: '26px',
            color: '#e9d5ff',
            fontStyle: 'bold',
        });
        const outcomeDescription = this.add.text(contentX, outcomeLabel.y + 42, view.outcome.description, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            wordWrap: { width: 860 },
        });
        const rewardText = this.add.text(contentX, outcomeDescription.y + 76, `奖励：${view.rewardSummary}`, {
            fontFamily: 'Courier New',
            fontSize: '20px',
            color: '#fde68a',
        });
        const messageText = this.add.text(contentX, rewardText.y + 44, message ?? (view.claimed ? '该事件奖励已经领取，无法重复获得。' : '领取后会立即写入 active run。'), {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: view.claimed ? '#fca5a5' : '#93c5fd',
        });
        const claimButton = this.createButton({
            x: this.scale.width / 2,
            y: panelY + panelHeight / 2 - 68,
            width: 260,
            height: 56,
            label: view.claimed ? '已领取' : '领取事件奖励',
            fillColor: view.claimed ? 0x475569 : 0x7c3aed,
            disabled: view.claimed,
            onClick: () => {
                const result = this.expeditionState.claimEventNodeReward(eventDefinition.nodeId, view.outcome.rewards);

                if (result.activeRun) {
                    this.refreshActiveRunDisplay(result.activeRun);
                }

                this.showEventPanel(
                    eventDefinition,
                    result.status === 'claimed' ? `已领取奖励：${view.rewardSummary}` : '该事件奖励已经领取，无法重复获得。',
                );
            },
        });

        container.add([description, outcomeLabel, outcomeDescription, rewardText, messageText, ...claimButton]);
        this.activeNodePanel = container;
    }

    private showShopPanel(shopDefinition: PrototypeShopDefinition, message?: string): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            return;
        }

        this.destroyActiveNodePanel();

        const view = createShopNodeView(shopDefinition, activeRun);
        const { container, contentX, panelY, panelHeight } = this.createModalPanel(view.title, shopDefinition.nodeId);
        const description = this.add.text(contentX, panelY - panelHeight / 2 + 116, `${view.description}\n当前 run spiritStones：${view.spiritStones}`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: 860 },
            lineSpacing: 8,
        });
        const messageText = this.add.text(contentX, description.y + 78, message ?? '选择一个可支付的商品；每个 offer 只能购买一次。', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: message ? '#fde68a' : '#93c5fd',
        });

        container.add([description, messageText]);
        view.offers.forEach((offerView, index) => {
            const offerY = messageText.y + 64 + index * 118;
            const offerText = this.add.text(contentX, offerY, this.formatShopOfferLine(offerView), {
                fontFamily: 'Arial',
                fontSize: '19px',
                color: offerView.state === 'available' ? '#f8fafc' : '#94a3b8',
                wordWrap: { width: 660 },
                lineSpacing: 5,
            });
            const button = this.createButton({
                x: contentX + 760,
                y: offerY + 26,
                width: 190,
                height: 48,
                label: this.getShopOfferButtonLabel(offerView),
                fillColor: offerView.state === 'available' ? 0xd97706 : 0x475569,
                disabled: offerView.state !== 'available',
                onClick: () => {
                    const result = this.expeditionState.purchaseShopOffer(
                        shopDefinition.nodeId,
                        offerView.id,
                        offerView.offer.cost,
                        offerView.offer.rewards,
                    );

                    if (result.activeRun) {
                        this.refreshActiveRunDisplay(result.activeRun);
                    }

                    const nextMessage = result.status === 'purchased'
                        ? `已购买 ${offerView.label}：${offerView.rewardSummary}`
                        : result.status === 'alreadyPurchased'
                            ? `${offerView.label} 已经购买过。`
                            : `spiritStones 不足，无法购买 ${offerView.label}。`;

                    this.showShopPanel(shopDefinition, nextMessage);
                },
            });

            container.add([offerText, ...button]);
        });

        this.activeNodePanel = container;
    }

    private showExtractPanel(node: ExtractMapNode, message?: string): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            return;
        }

        this.destroyActiveNodePanel();

        const view = createExtractNodeView(node.id, activeRun);
        const { container, contentX, panelY, panelHeight } = this.createModalPanel(node.label, node.id);
        const description = this.add.text(contentX, panelY - panelHeight / 2 + 126, '确认后会立刻结束本次秘境探索，并将当前携带的卡牌、道具与 spiritStones 存入永久仓库。', {
            fontFamily: 'Arial',
            fontSize: '21px',
            color: '#cbd5e1',
            wordWrap: { width: 860 },
            lineSpacing: 8,
        });
        const messageText = this.add.text(contentX, description.y + 108, message ?? (view.recorded ? '撤离已在本次探索中登记。' : '是否确认从该撤离点离开？'), {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: view.recorded ? '#86efac' : '#fde68a',
        });
        const confirmButton = this.createButton({
            x: this.scale.width / 2,
            y: panelY + panelHeight / 2 - 68,
            width: 280,
            height: 56,
            label: '确认撤离并结算',
            fillColor: 0x16a34a,
            onClick: () => {
                const summary = resolveExtract({ finalNodeId: node.id, run: activeRun });
                this.showTerminalSummary(summary);
            },
        });

        container.add([description, messageText, ...confirmButton]);
        this.activeNodePanel = container;
    }

    private refreshActiveRunDisplay(activeRun: RunSnapshot): void {
        const currentNodeLabel = this.getNodeLabel(activeRun.currentNodeId);

        this.runHud.updateFromRun(activeRun, currentNodeLabel);
        this.renderMap(activeRun);
        this.renderNodeMenu(activeRun);
        this.statusText.setText(createRunSummary(activeRun, { currentNodeLabel }).statusText);
    }

    private handleBattleResult(result: ExpeditionBattleCompleteEvent): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun || activeRun.runId !== result.runId) {
            this.showPreparationPanel();
            this.statusText.setText(`收到战斗结果 ${result.outcome}，但没有匹配的 active run。`);
            return;
        }

        const terminalOutcome = getTerminalBattleOutcome(result);

        if (terminalOutcome === 'defeat') {
            const summary = resolveBattleDefeat({
                finalNodeId: result.nodeId,
                endedAt: result.completedAt,
                run: activeRun,
            });
            this.showTerminalSummary(summary);
            return;
        }

        const continuedRun = createRunAfterBattleVictory(activeRun, result);

        if (terminalOutcome === 'boss-clear') {
            const summary = resolveBossClear({
                finalNodeId: result.nodeId,
                endedAt: result.completedAt,
                run: continuedRun,
            });
            this.showTerminalSummary(summary);
            return;
        }

        const victoryResolution = resolveBattleVictory({
            finalNodeId: result.nodeId,
            endedAt: result.completedAt,
            run: continuedRun,
        });

        this.expeditionState.activeRun = victoryResolution.run;
        this.showActiveRun(victoryResolution.run, 'resumed');
        this.statusText.setText(`战斗节点 ${this.getNodeLabel(result.nodeId)} 返回：${result.outcome}。路线继续。`);
    }

    private showTerminalSummary(summary: RunResolutionSummary): void {
        this.returnToEntrance(summary);
        this.runHud.showPostRunSummary(summary, () => {
            this.runHud.hidePostRunSummary();
            this.returnToEntrance(summary);
        });
    }

    private returnToEntrance(summary?: RunResolutionSummary): void {
        this.expeditionState.resetToEntranceState();
        this.showPreparationPanel();
        this.statusText.setText(
            summary
                ? createPostRunEntranceStatus(this.expeditionState.persistentStash, summary)
                : createPreparationSummary(this.expeditionState.persistentStash).statusText,
        );
    }

    private createModalPanel(titleText: string, subtitleText: string): {
        container: Phaser.GameObjects.Container;
        contentX: number;
        panelY: number;
        panelHeight: number;
    } {
        const { width, height } = this.scale;
        const container = this.add.container(0, 0);
        const panelWidth = Math.min(980, width * 0.78);
        const panelHeight = Math.min(680, height * 0.72);
        const panelX = width / 2;
        const panelY = height / 2 + 68;
        const contentX = panelX - panelWidth / 2 + 56;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.5);
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.98);
        panel.setStrokeStyle(3, 0x38bdf8, 0.9);

        const title = this.add.text(contentX, panelY - panelHeight / 2 + 42, titleText, {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const subtitle = this.add.text(contentX, title.y + 44, subtitleText, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#93c5fd',
        });
        const closeButton = this.createButton({
            x: panelX + panelWidth / 2 - 52,
            y: panelY - panelHeight / 2 + 48,
            width: 64,
            height: 42,
            label: '×',
            fillColor: 0x334155,
            onClick: () => this.destroyActiveNodePanel(),
        });

        container.add([overlay, panel, title, subtitle, ...closeButton]);
        container.setDepth(1200);

        return { container, contentX, panelY, panelHeight };
    }

    private createButton(config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        fillColor: number;
        onClick: () => void;
        disabled?: boolean;
    }): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text] {
        const button = this.add.rectangle(config.x, config.y, config.width, config.height, config.fillColor, 1);
        button.setStrokeStyle(2, 0xffffff, config.disabled ? 0.35 : 0.86);

        if (!config.disabled) {
            button.setInteractive({ useHandCursor: true });
            button.on('pointerover', () => button.setAlpha(0.86));
            button.on('pointerout', () => button.setAlpha(1));
            button.on('pointerdown', config.onClick);
        } else {
            button.setAlpha(0.72);
        }

        const label = this.add.text(config.x, config.y, config.label, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        return [button, label];
    }

    private formatShopOfferLine(offerView: ShopOfferView): string {
        return `${offerView.label}（${offerView.costText}）\n${offerView.description}\n奖励：${offerView.rewardSummary}`;
    }

    private getShopOfferButtonLabel(offerView: ShopOfferView): string {
        switch (offerView.state) {
            case 'available':
                return '购买';
            case 'purchased':
                return '已购买';
            case 'unaffordable':
                return '灵石不足';
        }
    }

    private isNonCombatNode(node: ExpeditionMapNode): node is NonCombatMapNode {
        return node.type === 'event' || node.type === 'shop' || node.type === 'extract';
    }

    private canReopenNonCombatNode(activeRun: RunSnapshot | null, node: ExpeditionMapNode): boolean {
        return !!activeRun && this.isNonCombatNode(node) && activeRun.nodeStates[node.id]?.visited === true;
    }

    private getNodeTypeLabel(node: NonCombatMapNode): string {
        switch (node.type) {
            case 'event':
                return '事件';
            case 'shop':
                return '商店';
            case 'extract':
                return '撤离';
        }
    }

    private getNodeColor(node: NonCombatMapNode): number {
        switch (node.type) {
            case 'event':
                return 0x7c3aed;
            case 'shop':
                return 0xd97706;
            case 'extract':
                return 0x16a34a;
        }
    }

    private destroyNodeMenu(): void {
        this.nodeMenu?.destroy();
        this.nodeMenu = undefined;
    }

    private destroyActiveNodePanel(): void {
        this.activeNodePanel?.destroy();
        this.activeNodePanel = undefined;
    }
}
