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
import {
    getEntryPanelTop,
    getEntryShellCenterY,
    type EntryPanelFrame,
    type EntryPanelFrameProvider,
} from '../../ui/expedition/EntryPanelFrame';
import { RunHud } from '../../ui/expedition/RunHud';
import { expeditionUiTheme } from '../../ui/common/expeditionUiTheme';
import { createWorldMapReturnIntent } from '../worldmap/worldMap';
import {
    createExpeditionArrivalCueSummary,
    createExpeditionDepartureHandoffSummary,
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
import {
    confirmExpeditionLoadout,
    getInitialExpeditionEntryView,
    validateExpeditionLoadout,
} from './expeditionEntryFlow';
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
type EntryPanel = (PreparationPanel | DeckManagementPanel) & EntryPanelFrameProvider;
type EntryShellMode = 'preparation' | 'deckManager';

interface EntryShellVisuals {
    container: Phaser.GameObjects.Container;
    plate: Phaser.GameObjects.Rectangle;
    accent: Phaser.GameObjects.Rectangle;
    supportText: Phaser.GameObjects.Text;
}

interface EntryShellModeVisualConfig {
    plateFillColor: number;
    plateFillAlpha: number;
    plateHoverFillAlpha: number;
    plateBorderColor: number;
    plateBorderAlpha: number;
    accentColor: number;
    textColor: string;
    hoverTextColor: string;
}

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
    private statusPlate!: Phaser.GameObjects.Rectangle;
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
    private currentEntryShellMode: EntryShellMode = 'preparation';
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

        this.runHud = new RunHud(this);
        this.runHud.setVisible(false);
        const statusPlateWidth = Math.max(360, Math.min(width - 360, 720));
        const statusTextWidth = Math.max(280, statusPlateWidth - 52);
        this.statusPlate = this.add.rectangle(width / 2, height - 58, statusPlateWidth, 64, expeditionUiTheme.colors.overlay, 0.44);
        this.statusPlate.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.4);
        this.statusPlate.setDepth(60);
        this.statusText = this.add.text(width / 2, height - 58, '', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: '#bca785',
            align: 'center',
            wordWrap: { width: statusTextWidth },
        }).setOrigin(0.5);
        this.statusText.setDepth(61);
        this.setStatusPlateVisible(false);

        if (this.pendingBattleResult) {
            this.handleBattleResult(this.pendingBattleResult);
        } else {
            const initialView = getInitialExpeditionEntryView(this.expeditionState);

            if (initialView.mode === 'activeRun' && initialView.activeRun) {
                this.showActiveRun(initialView.activeRun, 'resumed');
            } else {
                this.showPreparationPanel();
                this.updateStatusPlate(this.launchData.statusText ?? initialView.statusText, false);
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
        const topGlow = this.add.ellipse(width / 2, 0, width * 1.2, height * 0.78, expeditionUiTheme.colors.jade, 0.26).setOrigin(0.5, 0);
        const leftGlow = this.add.circle(width * 0.18, height * 0.34, 260, expeditionUiTheme.colors.jadeBright, 0.16);
        const rightGlow = this.add.circle(width * 0.82, height * 0.28, 230, expeditionUiTheme.colors.gold, 0.14);
        const floorGlow = this.add.ellipse(width / 2, height * 0.88, width * 0.94, height * 0.28, expeditionUiTheme.colors.jade, 0.1);
        const vignetteFrame = this.add.rectangle(width / 2, height / 2, width - 54, height - 54, 0x000000, 0);
        vignetteFrame.setStrokeStyle(2, expeditionUiTheme.colors.slate, 0.44);
        const innerFrame = this.add.rectangle(width / 2, height / 2 + 8, width - 134, height - 142, 0x000000, 0);
        innerFrame.setStrokeStyle(1, expeditionUiTheme.colors.goldSoft, 0.16);

        const pathLines = this.add.graphics();
        pathLines.lineStyle(2, expeditionUiTheme.colors.jadeBright, 0.11);
        pathLines.beginPath();
        pathLines.moveTo(120, height * 0.22);
        pathLines.lineTo(width * 0.36, height * 0.22);
        pathLines.lineTo(width * 0.5, height * 0.12);
        pathLines.lineTo(width - 180, height * 0.12);
        pathLines.strokePath();
        pathLines.lineStyle(2, expeditionUiTheme.colors.goldSoft, 0.09);
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

    private setStatusPlateVisible(visible: boolean): void {
        this.statusPlate.setVisible(visible);
        this.statusText.setVisible(visible);
    }

    private updateStatusPlate(text: string, visible: boolean): void {
        this.statusText.setText(text);
        this.setStatusPlateVisible(visible);
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
        const container = this.add.container(0, 0);
        const routeBriefing = this.getEntryRouteBriefing('preparation');
        const plate = this.add.rectangle(0, 0, 540, 48, 0x08101b, 0.42);
        plate.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.32);
        plate.setInteractive({ useHandCursor: true });
        const accent = this.add.rectangle(0, 0, 4, 26, expeditionUiTheme.colors.goldSoft, 0.62);
        const supportText = this.add.text(0, 0, routeBriefing.shellSupportLabel, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
        }).setOrigin(0, 0.5);
        plate.on('pointerover', () => this.setEntryShellHoverState(true));
        plate.on('pointerout', () => this.setEntryShellHoverState(false));
        plate.on('pointerdown', () => this.returnToWorldMap());

        container.add([
            plate,
            accent,
            supportText,
        ]);
        container.setDepth(1300);
        container.setVisible(false);
        container.setAlpha(0);

        this.entryShell = {
            container,
            plate,
            accent,
            supportText,
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

    private getEntryShellModeVisualConfig(mode: EntryShellMode): EntryShellModeVisualConfig {
        if (mode === 'deckManager') {
            return {
                plateFillColor: 0x08101b,
                plateFillAlpha: 0.4,
                plateHoverFillAlpha: 0.58,
                plateBorderColor: expeditionUiTheme.colors.slate,
                plateBorderAlpha: 0.34,
                accentColor: expeditionUiTheme.colors.goldSoft,
                textColor: '#d9c6a2',
                hoverTextColor: '#f3ead3',
            };
        }

        return {
            plateFillColor: 0x08101b,
            plateFillAlpha: 0.38,
            plateHoverFillAlpha: 0.56,
            plateBorderColor: expeditionUiTheme.colors.slate,
            plateBorderAlpha: 0.32,
            accentColor: expeditionUiTheme.colors.goldSoft,
            textColor: '#d9c6a2',
            hoverTextColor: '#f3ead3',
        };
    }

    private setEntryShellHoverState(hovered: boolean): void {
        if (!this.entryShell) {
            return;
        }

        const modeConfig = this.getEntryShellModeVisualConfig(this.currentEntryShellMode);
        this.entryShell.plate.setFillStyle(
            modeConfig.plateFillColor,
            hovered ? modeConfig.plateHoverFillAlpha : modeConfig.plateFillAlpha,
        );
        this.entryShell.plate.setStrokeStyle(1, modeConfig.plateBorderColor, modeConfig.plateBorderAlpha);
        this.entryShell.accent.setFillStyle(modeConfig.accentColor, hovered ? 0.84 : 0.62);
        this.entryShell.supportText.setColor(hovered ? modeConfig.hoverTextColor : modeConfig.textColor);
        this.entryShell.supportText.setAlpha(hovered ? 0.96 : 0.82);
    }

    private updateEntryShellMode(mode: EntryShellMode): void {
        if (!this.entryShell) {
            return;
        }

        this.currentEntryShellMode = mode;
        const routeBriefing = this.getEntryRouteBriefing(mode);
        this.entryShell.supportText.setText(routeBriefing.shellSupportLabel);
        this.entryShell.supportText.setStyle({
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: 520 },
        });
        this.setEntryShellHoverState(false);
    }

    private getFallbackEntryPanelFrame(mode: EntryShellMode): EntryPanelFrame {
        const { width, height } = this.scale;

        if (mode === 'deckManager') {
            return {
                panelX: width / 2,
                panelY: height / 2 + 12,
                panelWidth: Math.min(1460, width * 0.984),
                panelHeight: Math.min(920, height * 0.96),
            };
        }

        return {
            panelX: width / 2,
            panelY: height / 2 + 24,
            panelWidth: Math.min(980, width * 0.82),
            panelHeight: Math.min(820, height * 0.88),
        };
    }

    private updateEntryShellLayout(
        mode: EntryShellMode,
        animate: boolean,
        panelFrame: EntryPanelFrame | null = this.getCurrentEntryPanel()?.getEntryPanelFrame() ?? null,
    ): void {
        if (!this.entryShell) {
            return;
        }

        const resolvedFrame = panelFrame ?? this.getFallbackEntryPanelFrame(mode);
        const panelTop = getEntryPanelTop(resolvedFrame);
        const horizontalInset = mode === 'deckManager' ? 72 : 36;
        const breadcrumbWidth = Math.max(
            360,
            Math.min(mode === 'deckManager' ? 720 : 640, resolvedFrame.panelWidth - horizontalInset),
        );
        const breadcrumbX = resolvedFrame.panelX;
        const supportPaddingX = 16;
        const supportPaddingY = 10;
        const accentWidth = 3;
        const accentGap = 8;
        const supportWrapWidth = Math.max(220, breadcrumbWidth - supportPaddingX * 2 - accentWidth - accentGap);

        this.entryShell.supportText.setWordWrapWidth(supportWrapWidth);

        const plateWidth = Math.min(
            breadcrumbWidth,
            Math.max(320, this.entryShell.supportText.width + supportPaddingX * 2 + accentWidth + accentGap),
        );
        const plateHeight = Math.max(46, this.entryShell.supportText.height + supportPaddingY * 2);
        const breadcrumbY = getEntryShellCenterY(resolvedFrame, plateHeight, {
            gap: mode === 'deckManager' ? 18 : 12,
            minTopMargin: mode === 'deckManager' ? 10 : 32,
        });
        const breadcrumbLeft = breadcrumbX - plateWidth / 2;
        const accentX = breadcrumbLeft + supportPaddingX;
        const supportTextX = accentX + accentWidth + accentGap;

        this.entryShell.plate.setSize(plateWidth, plateHeight);
        this.entryShell.accent.setSize(accentWidth, Math.max(10, plateHeight - 12));
        const targets: Array<[Phaser.GameObjects.GameObject, number, number]> = [
            [this.entryShell.plate, breadcrumbX, breadcrumbY],
            [this.entryShell.accent, accentX, breadcrumbY],
            [this.entryShell.supportText, supportTextX, breadcrumbY],
        ];

        if (!animate) {
            targets.forEach(([target, x, y]) => target.setPosition(x, y));
            return;
        }

        targets.forEach(([target, x, y]) => {
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

    private isEntryTransitionActive(): boolean {
        return this.entryTransitionBlocker?.visible ?? false;
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

    private createDepartureHandoffSupportLine(summary: ExpeditionDepartureHandoffSummary): string {
        return `${summary.detail} · ${summary.routeLine}`;
    }

    private playDepartureHandoff(
        summary: ExpeditionDepartureHandoffSummary,
        onAcknowledge: () => void,
    ): void {
        this.destroyDepartureHandoffOverlay();

        const { width, height } = this.scale;
        const panelWidth = Math.min(width - 80, Math.max(340, Math.min(460, width * 0.42)));
        const panelX = width / 2;
        const panelY = height / 2;
        const panelLeft = panelX - panelWidth / 2 + 22;
        const contentWidth = panelWidth - 44;
        const footerCopy = '点按任意处或按 Enter / Space 继续。';
        const headlineLine = `${summary.badgeLabel} · ${summary.headline}`;
        const supportLine = this.createDepartureHandoffSupportLine(summary);
        const headlineHeight = this.measureSceneTextHeight(headlineLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '22px',
            fontStyle: 'bold',
            wordWrap: { width: contentWidth },
        });
        const supportHeight = this.measureSceneTextHeight(supportLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: contentWidth },
        });
        const loadoutHeight = this.measureSceneTextHeight(summary.loadoutLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: contentWidth },
        });
        const footerHeight = this.measureSceneTextHeight(footerCopy, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: contentWidth },
        });
        const panelHeight = Math.max(
            152,
            18
            + 8
            + headlineHeight
            + 8
            + supportHeight
            + 4
            + loadoutHeight
            + 14
            + 56
            + 10
            + footerHeight
            + 16,
        );
        const panelTop = panelY - panelHeight / 2;
        const container = this.add.container(0, 0);
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, expeditionUiTheme.colors.overlay, 0.48);
        overlay.setInteractive({ useHandCursor: true });
        const shadow = this.add.rectangle(panelX, panelY + 4, panelWidth, panelHeight, 0x01040a, 0.1);
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x07111f, 0.88);
        panel.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.42);
        const accent = this.add.rectangle(panelX - panelWidth / 2 + 3, panelY, 3, panelHeight - 16, expeditionUiTheme.colors.jadeBright, 0.28);
        const headline = this.add.text(panelLeft, panelTop + 18, headlineLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '22px',
            color: '#f3ead3',
            fontStyle: 'bold',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);
        const supportText = this.add.text(panelLeft, headline.y + headline.height + 8, supportLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);
        const loadoutText = this.add.text(panelLeft, supportText.y + supportText.height + 4, summary.loadoutLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#e6f3ea',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);
        let acknowledge: () => void = () => undefined;
        const continueButton = this.createButton({
            x: panelX,
            y: loadoutText.y + loadoutText.height + 28,
            width: 192,
            height: 56,
            label: '进入秘境',
            fillColor: expeditionUiTheme.colors.jade,
            onClick: () => acknowledge(),
        });
        const footer = this.add.text(panelX, continueButton[0].y + 30, footerCopy, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            align: 'center',
            wordWrap: { width: contentWidth },
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
            accent,
            headline,
            supportText,
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

    private measureSceneTextHeight(
        text: string,
        style: Phaser.Types.GameObjects.Text.TextStyle,
    ): number {
        const probe = this.add.text(-10000, -10000, text, style);
        const height = probe.height;
        probe.destroy();
        return height;
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
        this.updateEntryShellLayout(mode, animate, nextPanel.getEntryPanelFrame());
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
        this.setStatusPlateVisible(false);
        this.clearMapViews();
        this.destroyNodeMenu();
        this.destroyActiveNodePanel();
        const nextPanel = new PreparationPanel(this, {
            stash: this.expeditionState.persistentStash,
            metadata: this.deckbuilderCardMetadata,
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
            this.updateEntryShellLayout('preparation', false, this.preparationPanel.getEntryPanelFrame());
            return;
        }

        this.showPreparationPanel();
    }

    private showDeckManagementPanel(): void {
        this.deckManagerEntryContext = createPreparationDeckContext(this.expeditionState.persistentStash);
        const currentPanel = this.getCurrentEntryPanel();
        this.setStatusPlateVisible(false);
        const nextPanel = new DeckManagementPanel(this, {
            stash: this.expeditionState.persistentStash,
            metadata: this.deckbuilderCardMetadata,
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
        if (this.isEntryTransitionActive()) {
            return;
        }

        if (!validateExpeditionLoadout(this.expeditionState.persistentStash).valid) {
            return;
        }

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
            this.updateStatusPlate(options.statusTextOverride ?? summary.statusText, false);
        } else {
            this.runHud.hideArrivalCue();
            this.updateStatusPlate(options?.statusTextOverride ?? summary.statusText, true);
        }
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
                const lineColor = isReachableEdge ? 0xfacc15 : targetNode.visibility === 'cleared' ? expeditionUiTheme.colors.jadeBright : expeditionUiTheme.colors.slate;
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
        this.setStatusPlateVisible(true);
        const activeRun = this.expeditionState.activeRun;
        const node = this.mapDefinition.nodes.find((candidate) => candidate.id === nodeId);
        const canReopenNode = !!node && this.canReopenNonCombatNode(activeRun, node);

        if (!activeRun || (!isReachableNode(this.mapDefinition, activeRun, nodeId) && !canReopenNode)) {
            this.updateStatusPlate('该节点尚未连通；只能前往当前节点直接连接的下一层节点。', true);
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
            this.updateStatusPlate('该节点尚未连通；路线保持不变。', true);
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
            this.updateStatusPlate(`已进入 ${nodeLabel}，正在启动战斗场景。`, true);
            this.scene.start('BattleScene', createBattleSceneStartPayload(nextRun.pendingEncounter));
            return;
        }

        this.updateStatusPlate(`已进入 ${nodeLabel}。事件、商店、撤离结算 UI 尚未在本任务中解析。`, true);
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
        const panelY = 246;
        const panelWidth = Math.min(1080, width - 240);
        const panelHeight = 178;
        const background = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, expeditionUiTheme.colors.panelInner, 0.94);
        background.setStrokeStyle(2, expeditionUiTheme.colors.goldSoft, 0.72);

        const title = this.add.text(panelX - panelWidth / 2 + 32, panelY - 54, '秘境非战斗节点', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#e8d5ab',
            fontStyle: 'bold',
        });

        const subtitle = this.add.text(panelX - panelWidth / 2 + 32, panelY - 16, '事件、商店、撤离均在 ExpeditionScene 内处理；战斗和 BOSS 节点会切换到 BattleScene。', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            wordWrap: { width: panelWidth - 64 },
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
                y: panelY + 50,
                width: 250,
                height: 56,
                label: `${this.getNodeTypeLabel(node)} · ${node.label}`,
                fillColor: this.getNodeColor(node),
                onClick: () => this.handleNonCombatNodeSelected(node),
            });
            const stateLabel = this.add.text(x, panelY + 90, stateText, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f6e2b1',
            }).setOrigin(0.5);

            menu.add([...button, stateLabel]);
        });

        menu.setDepth(500);
        this.nodeMenu = menu;
    }

    private handleNonCombatNodeSelected(node: NonCombatMapNode): void {
        this.runHud.hideArrivalCue(true);
        this.setStatusPlateVisible(true);
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            this.updateStatusPlate('没有进行中的秘境探索。', true);
            return;
        }

        if (!isReachableNode(this.mapDefinition, activeRun, node.id) && !this.canReopenNonCombatNode(activeRun, node)) {
            this.updateStatusPlate('该节点尚未连通；只能前往当前节点直接连接的下一层节点。', true);
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
            this.updateStatusPlate('该节点尚未连通；路线保持不变。', true);
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
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: '#d9c6a2',
            wordWrap: { width: 860 },
        });
        const outcomeLabel = this.add.text(contentX, description.y + 84, view.outcome.label, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#e9d5ff',
            fontStyle: 'bold',
        });
        const outcomeDescription = this.add.text(contentX, outcomeLabel.y + 42, view.outcome.description, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: '#f3ead3',
            wordWrap: { width: 860 },
        });
        const rewardText = this.add.text(contentX, outcomeDescription.y + 76, `奖励：${view.rewardSummary}`, {
            fontFamily: expeditionUiTheme.fonts.mono,
            fontSize: '20px',
            color: '#f6e2b1',
        });
        const messageText = this.add.text(contentX, rewardText.y + 44, message ?? (view.claimed ? '该事件奖励已经领取，无法重复获得。' : '领取后会立即写入 active run。'), {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: view.claimed ? '#fca5a5' : '#e8d5ab',
        });
        const claimButton = this.createButton({
            x: this.scale.width / 2,
            y: panelY + panelHeight / 2 - 68,
            width: 260,
            height: 56,
            label: view.claimed ? '已领取' : '领取事件奖励',
            fillColor: view.claimed ? expeditionUiTheme.colors.slate : expeditionUiTheme.colors.gold,
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
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: '#d9c6a2',
            wordWrap: { width: 860 },
            lineSpacing: 8,
        });
        const messageText = this.add.text(contentX, description.y + 78, message ?? '选择一个可支付的商品；每个 offer 只能购买一次。', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: message ? '#f6e2b1' : '#e8d5ab',
        });

        container.add([description, messageText]);
        view.offers.forEach((offerView, index) => {
            const offerY = messageText.y + 64 + index * 124;
            const offerText = this.add.text(contentX, offerY, this.formatShopOfferLine(offerView), {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '19px',
                color: offerView.state === 'available' ? '#f3ead3' : '#bca785',
                wordWrap: { width: 660 },
                lineSpacing: 5,
            });
            const button = this.createButton({
                x: contentX + 760,
                y: offerY + 28,
                width: 204,
                height: 56,
                label: this.getShopOfferButtonLabel(offerView),
                fillColor: offerView.state === 'available' ? expeditionUiTheme.colors.ember : expeditionUiTheme.colors.slate,
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
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '21px',
            color: '#d9c6a2',
            wordWrap: { width: 860 },
            lineSpacing: 8,
        });
        const messageText = this.add.text(contentX, description.y + 108, message ?? (view.recorded ? '撤离已在本次探索中登记。' : '是否确认从该撤离点离开？'), {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: view.recorded ? '#e6f3ea' : '#f6e2b1',
        });
        const confirmButton = this.createButton({
            x: this.scale.width / 2,
            y: panelY + panelHeight / 2 - 68,
            width: 280,
            height: 56,
            label: '确认撤离并结算',
            fillColor: expeditionUiTheme.colors.jade,
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
        this.updateStatusPlate(createRunSummary(activeRun, { currentNodeLabel }).statusText, true);
    }

    private handleBattleResult(result: ExpeditionBattleCompleteEvent): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun || activeRun.runId !== result.runId) {
            this.showPreparationPanel();
            this.updateStatusPlate(`收到战斗结果 ${result.outcome}，但没有匹配的 active run。`, false);
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
        this.updateStatusPlate(`战斗节点 ${this.getNodeLabel(result.nodeId)} 返回：${result.outcome}。路线继续。`, true);
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
        this.updateStatusPlate(
            summary
                ? createPostRunEntranceStatus(this.expeditionState.persistentStash, summary)
                : createPreparationSummary(this.expeditionState.persistentStash).statusText,
            false,
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
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, expeditionUiTheme.colors.overlay, 0.5);
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, expeditionUiTheme.colors.panelInner, 0.98);
        panel.setStrokeStyle(3, expeditionUiTheme.colors.jadeBright, 0.9);

        const title = this.add.text(contentX, panelY - panelHeight / 2 + 42, titleText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '34px',
            color: '#f3ead3',
            fontStyle: 'bold',
        });
        const subtitle = this.add.text(contentX, title.y + 44, subtitleText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#e8d5ab',
        });
        const closeButton = this.createButton({
            x: panelX + panelWidth / 2 - 52,
            y: panelY - panelHeight / 2 + 48,
            width: 64,
            height: 44,
            label: '×',
            fillColor: expeditionUiTheme.colors.slate,
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
        button.setStrokeStyle(2, expeditionUiTheme.colors.goldSoft, config.disabled ? 0.35 : 0.86);

        if (!config.disabled) {
            button.setInteractive({ useHandCursor: true });
            button.on('pointerover', () => button.setAlpha(0.86));
            button.on('pointerout', () => button.setAlpha(1));
            button.on('pointerdown', config.onClick);
        } else {
            button.setAlpha(0.72);
        }

        const label = this.add.text(config.x, config.y, config.label, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: config.height >= 56 ? '20px' : '18px',
            color: '#f3ead3',
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
                return expeditionUiTheme.colors.gold;
            case 'shop':
                return expeditionUiTheme.colors.ember;
            case 'extract':
                return expeditionUiTheme.colors.jade;
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
