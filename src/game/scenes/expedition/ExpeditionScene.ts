import { Scene } from 'phaser';
import { INK, PX } from '../../art/palette';
import { bake, hashStr, pixelateImage, snap } from '../../art/pix';
import { addBackdrop, addMotes } from '../../art/scenery';
import { paintPerson } from '../../art/hubArt';
import { clip, panel, pbutton, piconButton, ptext, ptitle, type FrameStyle, type PButton } from '../../art/kit';
import { addIcon } from '../../art/icons';

import { EventBus } from '../../EventBus';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    ExpeditionState,
    type ExpeditionBootstrapSources,
    type ExpeditionWorldStateSeed,
} from '../../state/ExpeditionState';
import { selectDeckInStash } from '../../state/PersistentStashDecks';
import { mergeItemStacks } from '../../state/GameWorldStateStashOperations';
import { canDropInventoryItem, indexItemActionPolicies, type ItemActionPolicy } from '../../state/ItemActionRules';
import { indexCraftingRecipes, previewCraftingRecipe, type CraftingRecipe } from '../../state/Crafting';
import { countOccupiedItemSlots, resolveItemSlotCapacity } from '../../state/ItemCapacity';
import {
    resolveBattleDefeat,
    resolveBattleVictory,
    resolveBossClear,
    resolveExtract,
} from '../../services/RunResolution';
import type {
    ExpeditionBattleCompleteEvent,
    ExpeditionItemType,
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
    type EntryPanelFrame,
    type EntryPanelFrameProvider,
} from '../../ui/expedition/EntryPanelFrame';
import { RunHud } from '../../ui/expedition/RunHud';
import { getRunPlayerHealth, MAX_RUN_PLAYER_HEALTH } from '../../state/RunHealth';
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
import { CardPreviewManager } from '../../managers/common/CardPreviewManager';
import {
    buildDeckManagementCardPreviewResolver,
    type DeckManagementCardPreviewResolver,
} from '../../ui/deckbuilder/DeckManagementCardPreview';
import type { CardPreviewMetadata, PreviewCardData } from '../../managers/common/cardPreviewProtocol';

type StarterDeckCacheEntry = ExpeditionBootstrapSources['starterDeck'];

type NonCombatMapNode = EventMapNode | ShopMapNode | ExtractMapNode;
type EntryPanel = (PreparationPanel | DeckManagementPanel) & EntryPanelFrameProvider;
type EntryShellMode = 'preparation' | 'deckManager';

interface EntryShellVisuals {
    container: Phaser.GameObjects.Container;
    supportText: Phaser.GameObjects.Text;
}

interface ModalFrame {
    container: Phaser.GameObjects.Container;
    contentX: number;
    contentTop: number;
    contentWidth: number;
    panelY: number;
    panelHeight: number;
    panelBottom: number;
}

type ButtonTone = 'seal' | 'jade' | 'slate' | 'gold';


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
    private inventoryPage = 0;
    private readonly loadingItemIcons = new Set<string>();
    private mapGraphics?: Phaser.GameObjects.Graphics;
    private mapNodeViews: MapNodeView[] = [];
    private mapTraveller?: Phaser.GameObjects.Image;
    private mapPathTick?: () => void;
    private pendingBattleResult: ExpeditionBattleCompleteEvent | null = null;
    private deckManagerEntryContext?: PreparationDeckContext;
    private pendingPreparationDeckHandoff?: PreparationDeckHandoffSummary;
    private deckbuilderCardMetadataResources?: DeckbuilderCardMetadataResources;
    private deckbuilderCardMetadata: CardMetadataMap = {};
    private itemActionPolicies: Readonly<Record<string, ItemActionPolicy>> = {};
    private craftingRecipes: readonly CraftingRecipe[] = [];
    private craftingPage = 0;
    private deckManagementCardPreviewResolver?: DeckManagementCardPreviewResolver;
    private cardPreviewManager?: CardPreviewManager;
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
        this.itemActionPolicies = {};
        this.craftingRecipes = [];
        this.craftingPage = 0;
        this.deckManagementCardPreviewResolver = undefined;
        this.cardPreviewManager = undefined;
        this.inventoryPage = 0;
        this.loadingItemIcons.clear();
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
        const worldItemSource = this.cache.json.get(
            resolveDeckbuilderWorldItemMetadataResource(this.cache.json.get(CONTENT_CATALOG_CACHE_KEY)).cacheKey,
        );
        this.deckbuilderCardMetadata = buildDeckbuilderCardMetadataMap(
            this.getDeckbuilderCardMetadataResources(),
            (cacheKey) => this.cache.json.get(cacheKey),
            { worldItemSource },
        );
        this.itemActionPolicies = indexItemActionPolicies(worldItemSource);
        this.craftingRecipes = indexCraftingRecipes(worldItemSource, this.itemActionPolicies);
        this.deckManagementCardPreviewResolver = buildDeckManagementCardPreviewResolver(
            this.getDeckbuilderCardMetadataResources(),
            (cacheKey) => this.cache.json.get(cacheKey),
        );
        this.assertLaunchTargetMatchesMapDefinition();
        this.expeditionState = ExpeditionState.bootstrap({
            worldState,
            starterDeck,
            itemPolicies: this.itemActionPolicies,
            activeRunRouteKey: this.launchData.routeKey,
            activeRunIdentity: {
                expeditionId: this.launchData.expeditionId,
                mapId: this.launchData.mapId,
            },
        });

        this.createSceneBackdrop();
        this.createEntryShell();
        this.setupCardPreview();

        this.runHud = new RunHud(this);
        this.runHud.setInventoryOpenHandler(() => {
            this.inventoryPage = 0;
            this.showInventoryPanel();
        });
        this.runHud.setVisible(false);
        const statusPlateWidth = Math.max(360, width - PX * 80);
        const statusTextWidth = Math.max(280, statusPlateWidth - 52);
        this.statusPlate = this.add.rectangle(width / 2, height - PX * 14, statusPlateWidth, PX * 16, INK.void, 0.001);
        this.statusPlate.setDepth(60);
        this.statusText = ptext(this, width / 2, height - PX * 14, '', {
            color: INK.bone, fx: 'outline', align: 'center', origin: [0.5, 0.5], wrap: statusTextWidth,
        });
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
        const cave = /cave|洞/.test(`${this.mapDefinition.id} ${this.mapDefinition.name}`);
        this.cameras.main.setBackgroundColor(INK.ink);
        addBackdrop(this, cave ? 'cave' : 'forest', cave ? 'night' : 'dusk', { depth: -1000 });
        addMotes(this, cave ? 'spirit' : 'firefly', -30, 420);
    }

    private setStatusPlateVisible(visible: boolean): void {
        this.statusPlate.setVisible(visible);
        this.statusText.setVisible(visible);
    }

    private updateStatusPlate(text: string, visible: boolean): void {
        this.statusText.setText(text);
        this.setStatusPlateVisible(visible && Boolean(text));
        // Status lines are feedback, not furniture: they fade away after a moment.
        this.tweens.killTweensOf(this.statusText);
        if (visible && text) {
            this.statusText.setAlpha(1);
            this.tweens.add({ targets: this.statusText, alpha: 0, delay: 3200, duration: 400, ease: 'Stepped', easeParams: [4] });
        }
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
        const back = piconButton(this, PX * 16, PX * 16, 'map', () => this.returnToWorldMap(), 'slate');
        const title = ptext(this, PX * 32, PX * 8, this.mapDefinition.name, { size: 2, color: INK.paper, fx: 'outline' });
        const crumb = ptext(this, PX * 32, PX * 36, '', { color: INK.bone, fx: 'outline' });
        container.add([back, title, crumb]);
        container.setDepth(1300);
        container.setVisible(false);
        container.setAlpha(0);
        this.entryShell = { container, supportText: crumb };

        this.entryTransitionBlocker = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.001);
        this.entryTransitionBlocker.setDepth(1450);
        this.entryTransitionBlocker.setVisible(false);
        this.entryTransitionBlocker.disableInteractive();

        this.updateEntryShellMode('preparation');
    }

    private getEntryRouteBriefing(mode: EntryShellMode) {
        return createExpeditionRouteBriefingSummary(this.mapDefinition, mode);
    }

    private updateEntryShellMode(mode: EntryShellMode): void {
        if (!this.entryShell) {
            return;
        }

        const routeBriefing = this.getEntryRouteBriefing(mode);
        this.entryShell.supportText.setText(clip(routeBriefing.shellSupportLabel, 30));
    }

    private updateEntryShellLayout(
        _mode: EntryShellMode,
        _animate: boolean,
        _panelFrame: EntryPanelFrame | null = null,
    ): void {
        // The header is pinned to the top-left corner; nothing to lay out.
    }

    private setEntryShellVisible(visible: boolean, animate: boolean): void {
        if (!this.entryShell) {
            return;
        }
        const c = this.entryShell.container;
        this.tweens.killTweensOf(c);
        if (visible) {
            c.setVisible(true);
            if (!animate) { c.setAlpha(1); return; }
            this.tweens.add({ targets: c, alpha: 1, duration: 200, ease: 'Stepped', easeParams: [3] });
            return;
        }
        if (!animate) { c.setVisible(false).setAlpha(0); return; }
        this.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.setVisible(false) });
    }

    private isSceneGameObjectAlive(gameObject?: Phaser.GameObjects.GameObject): boolean {
        if (!gameObject) {
            return false;
        }

        const sceneBoundObject = gameObject as Phaser.GameObjects.GameObject & { scene?: Phaser.Scene };
        if ('scene' in sceneBoundObject) {
            return !!sceneBoundObject.scene?.sys;
        }

        return true;
    }

    private setEntryTransitionBlocker(active: boolean): void {
        if (!this.entryTransitionBlocker) {
            return;
        }

        if (!this.isSceneGameObjectAlive(this.entryTransitionBlocker)) {
            this.entryTransitionBlocker = undefined;
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

    private destroyTrackedDepartureHandoffOverlay(
        overlay: Phaser.GameObjects.Container | undefined = this.departureHandoffOverlay,
    ): void {
        if (!overlay) {
            return;
        }

        if (this.isSceneGameObjectAlive(overlay)) {
            this.tweens.killTweensOf(overlay);
            overlay.destroy();
        }

        if (this.departureHandoffOverlay === overlay) {
            this.departureHandoffOverlay = undefined;
        }
    }

    private destroyDepartureHandoffOverlay(): void {
        if (this.departureHandoffKeydownHandler) {
            this.input.keyboard?.off('keydown', this.departureHandoffKeydownHandler);
            this.departureHandoffKeydownHandler = undefined;
        }

        this.destroyTrackedDepartureHandoffOverlay();
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

        // Cinematic: an ink band sweeps across with the place name; click / Enter / Space continues.
        const { width, height } = this.scale;
        const container = this.add.container(0, 0);
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, INK.void, 0.6).setInteractive({ useHandCursor: true });
        const band = this.add.rectangle(width / 2, height / 2, width, PX * 90, INK.void, 1).setScale(1, 0);
        const lineTop = this.add.rectangle(width / 2, height / 2 - PX * 45, width, PX, INK.cinnabar).setScale(0, 1);
        const lineBot = this.add.rectangle(width / 2, height / 2 + PX * 45, width, PX, INK.cinnabar).setScale(0, 1);
        const badge = ptext(this, width / 2, height / 2 - PX * 30, summary.badgeLabel, { color: INK.vermilion, origin: [0.5, 0.5], fx: 'none' });
        const [headMain, headSub] = summary.headline.split(' · ');
        const title = ptitle(this, width / 2, height / 2 - PX * 4, clip(headMain, 10), 3);
        if (headSub) badge.setText(`${summary.badgeLabel} · ${headSub}`);
        const loadout = ptext(this, width / 2, height / 2 + PX * 24, clip(summary.loadoutLine, 40), { color: INK.bone, origin: [0.5, 0.5], fx: 'none' });
        const footer = ptext(this, width / 2, height / 2 + PX * 62, '点按任意处或按 Enter / Space 继续。', { color: INK.mist, origin: [0.5, 0.5], fx: 'outline' });
        const enter = pbutton(this, { x: width / 2, y: height / 2 + PX * 82, width: PX * 80, height: PX * 22, label: '进入秘境', style: 'seal', onClick: () => acknowledge() });
        [badge, title, loadout, footer, enter].forEach((o) => o.setAlpha(0));
        container.add([overlay, band, lineTop, lineBot, badge, title, loadout, footer, enter]);
        this.tweens.add({ targets: band, scaleY: 1, duration: 220, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: [lineTop, lineBot], scaleX: 1, duration: 360, delay: 120, ease: 'Cubic.easeOut' });
        this.tweens.add({ targets: [badge, title, loadout], alpha: 1, duration: 200, delay: 260, ease: 'Stepped', easeParams: [3] });
        this.tweens.add({ targets: [footer, enter], alpha: 1, duration: 200, delay: 600 });
        title.setX(width / 2 + PX * 40);
        this.tweens.add({ targets: title, x: width / 2, duration: 360, delay: 260, ease: 'Cubic.easeOut' });

        let acknowledged = false;
        const acknowledge = () => {
            if (acknowledged) return;
            acknowledged = true;
            overlay.disableInteractive();
            if (this.departureHandoffKeydownHandler) {
                this.input.keyboard?.off('keydown', this.departureHandoffKeydownHandler);
                this.departureHandoffKeydownHandler = undefined;
            }
            this.tweens.killTweensOf(container);
            this.tweens.add({
                targets: container, alpha: 0, duration: 220, ease: 'Stepped', easeParams: [4],
                onComplete: () => {
                    if (this.departureHandoffOverlay === container) this.destroyTrackedDepartureHandoffOverlay(container);
                    this.setEntryTransitionBlocker(false);
                    onAcknowledge();
                },
            });
        };
        overlay.on('pointerdown', () => acknowledge());
        this.departureHandoffKeydownHandler = (event: KeyboardEvent) => {
            if (event.repeat || !this.isDepartureHandoffConfirmInput(event)) return;
            event.preventDefault();
            acknowledge();
        };
        this.input.keyboard?.on('keydown', this.departureHandoffKeydownHandler);
        container.setDepth(1460);
        this.departureHandoffOverlay = container;
        this.setEntryTransitionBlocker(true);
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
            onOpenInventory: () => { this.inventoryPage = 0; this.showInventoryPanel(); },
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
            starterCards: this.cache.json.get(this.getResolvedExpeditionResources().starterDeck.cacheKey)?.cards,
            previewResolver: this.deckManagementCardPreviewResolver ?? (() => null),
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

    private setupCardPreview(): void {
        this.cardPreviewManager?.destroy();
        this.events.removeAllListeners('showCardPreviewFromData');
        this.events.removeAllListeners('showCardPreviewFallback');
        this.events.removeAllListeners('hideCardPreview');
        this.events.removeAllListeners('clearCardPreviewContext');

        this.cardPreviewManager = new CardPreviewManager(this, {
            layout: {
                x: snap(Math.max(PX * 90, this.scale.width * 0.16)),
                y: snap(this.scale.height * 0.5),
                width: PX * 136,
                height: PX * 200,
                depth: 1400,
            },
        });

        this.events.on('showCardPreviewFromData', (cardData: PreviewCardData, metadata?: CardPreviewMetadata) => {
            this.cardPreviewManager?.showFromData(cardData, metadata);
        });
        this.events.on('showCardPreviewFallback', (metadata: CardPreviewMetadata) => {
            this.cardPreviewManager?.showFallback(metadata);
        });
        this.events.on('hideCardPreview', () => {
            this.cardPreviewManager?.clear();
        });
        this.events.on('clearCardPreviewContext', (contextId: string) => {
            this.cardPreviewManager?.clearContext(contextId);
        });
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
        this.mapTraveller?.destroy();
        this.mapTraveller = undefined;
        if (this.mapPathTick) { this.events.off('update', this.mapPathTick); this.mapPathTick = undefined; }

        for (const mapNodeView of this.mapNodeViews) {
            mapNodeView.destroy();
        }

        this.mapNodeViews = [];
    }

    private renderMap(activeRun: RunSnapshot): void {
        this.clearMapViews();

        const visibleNodes = getVisibleNodes(this.mapDefinition, activeRun);
        const nodePositions = this.createNodePositions(this.mapDefinition.nodes);

        type Edge = { a: { x: number; y: number }; b: { x: number; y: number }; color: number; live: boolean };
        const edges: Edge[] = [];
        for (const node of this.mapDefinition.nodes) {
            const from = nodePositions.get(node.id);
            if (!from) continue;
            for (const outgoingNodeId of node.outgoingNodeIds) {
                const to = nodePositions.get(outgoingNodeId);
                const target = visibleNodes.find((visibleNode) => visibleNode.id === outgoingNodeId);
                if (!to || !target) continue;
                const live = isReachableNode(this.mapDefinition, activeRun, outgoingNodeId) && node.id === activeRun.currentNodeId;
                const color = live ? INK.gold : target.visibility === "cleared" ? INK.teal : target.visibility === "silhouette" ? INK.slate : INK.mist;
                edges.push({ a: from, b: to, color, live });
            }
        }
        const g = this.add.graphics().setDepth(40);
        this.mapGraphics = g;
        let phase = 0;
        const draw = () => {
            g.clear();
            for (const e of edges) {
                const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y);
                const step = PX * 6;
                const n = Math.floor(len / step);
                for (let i = 1; i < n; i++) {
                    if (e.live ? (i + phase) % 3 === 0 : i % 2 === 0) continue;
                    const t = i / n;
                    const x = snap(e.a.x + (e.b.x - e.a.x) * t), y = snap(e.a.y + (e.b.y - e.a.y) * t);
                    g.fillStyle(INK.void, 1).fillRect(x - PX, y - PX + PX, PX * 3, PX * 3);
                    g.fillStyle(e.color, 1).fillRect(x - PX, y - PX, PX * 2 + PX, PX * 2);
                }
            }
        };
        draw();
        this.mapPathTick = () => {
            const k = Math.floor(this.time.now / 180) % 3;
            if (k !== phase) { phase = (3 - k) % 3; draw(); }
        };
        this.events.on('update', this.mapPathTick);

        for (const node of visibleNodes) {
            const position = nodePositions.get(node.id);
            if (!position) continue;
            this.mapNodeViews.push(new MapNodeView(this, {
                node,
                x: position.x,
                y: position.y,
                current: node.id === activeRun.currentNodeId,
                onSelect: (nodeId) => this.handleMapNodeSelected(nodeId),
            }));
        }

        // the disciple stands beside the current node
        const here = nodePositions.get(activeRun.currentNodeId);
        if (here) {
            const k0 = bake(this, 'px:player0', () => paintPerson(0, 0));
            this.mapTraveller = this.add.image(here.x - PX * 20, here.y + PX * 6, k0).setOrigin(0.5, 1).setScale(PX).setDepth(46);
            this.tweens.add({ targets: this.mapTraveller, y: this.mapTraveller.y - PX, duration: 400, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [1] });
        }
    }

    private createNodePositions(nodes: ExpeditionMapNode[]): Map<string, { x: number; y: number }> {
        const { width, height } = this.scale;
        const minLayer = Math.min(...nodes.map((node) => node.layer));
        const maxLayer = Math.max(...nodes.map((node) => node.layer));
        const mapLeft = PX * 60;
        const mapRight = width - PX * 60;
        const mapTop = PX * 70;
        const mapBottom = height - PX * 60;
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
                const jitter = ((hashStr(node.id) % 7) - 3) * PX * 4;
                const y = layerNodes.length === 1
                    ? (mapTop + mapBottom) / 2 + jitter
                    : mapTop + verticalSpacing * (index + 0.5) + jitter;
                nodePositions.set(node.id, { x: snap(x + jitter / 2), y: snap(y) });
            });
        }

        return nodePositions;
    }

    private handleMapNodeSelected(nodeId: string): void {
        this.runHud.hideArrivalCue(true);
        this.setStatusPlateVisible(true);
        const activeRun = this.expeditionState.activeRun;
        const node = this.mapDefinition.nodes.find((candidate) => candidate.id === nodeId);
        if (activeRun?.pendingEncounter) {
            if (activeRun.pendingEncounter.nodeId === nodeId) {
                this.scene.start('BattleScene', createBattleSceneStartPayload(activeRun.pendingEncounter));
            } else {
                this.updateStatusPlate('先完成当前战斗，再前往下一处。', true);
            }
            return;
        }
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

    private renderNodeMenu(_activeRun: RunSnapshot): void {
        // Non-combat nodes are opened straight from the map; no separate menu.
        this.destroyNodeMenu();
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

    private addInventoryItemIcon(
        container: Phaser.GameObjects.Container,
        path: string | undefined,
        x: number,
        y: number,
        size: number,
        message?: string,
    ): boolean {
        if (!path || !/^assets\/items\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/.test(path)) return false;
        const key = `item-icon:${path}`;
        if (!this.textures.exists(key)) {
            if (!this.loadingItemIcons.has(key)) {
                this.loadingItemIcons.add(key);
                this.load.image(key, `/${path}`);
                this.load.once(`filecomplete-image-${key}`, () => {
                    this.loadingItemIcons.delete(key);
                    if (this.activeNodePanel === container) this.showInventoryPanel(message);
                });
                this.load.once('complete', () => this.loadingItemIcons.delete(key));
                this.load.start();
            }
            return true;
        }
        const art = Math.round(size / PX);
        const pixKey = pixelateImage(this, key, `${key}:px${art}`, art, art, 'contain');
        container.add(this.add.image(snap(x), snap(y), pixKey).setScale(PX));
        return true;
    }

    private showInventoryPanel(message?: string): void {
        const run = this.expeditionState.activeRun;
        const stash = this.expeditionState.persistentStash;
        this.destroyActiveNodePanel();

        const items = mergeItemStacks(run?.carriedItems ?? stash.items, []);
        const pageSize = 5;
        const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
        this.inventoryPage = Math.min(this.inventoryPage, pageCount - 1);
        const occupied = countOccupiedItemSlots(items);
        const capacity = resolveItemSlotCapacity(run?.itemSlotCapacity ?? stash.itemSlotCapacity);
        const frame = this.createModalPanel(
            '行 囊', `${occupied}/${capacity} 格 · 共 ${items.reduce((sum, item) => sum + item.count, 0)} 件道具${run ? ` · 生命 ${getRunPlayerHealth(run.playerHealth)}/${MAX_RUN_PLAYER_HEALTH}` : ''}`,
        );
        const { container } = frame;
        let y = frame.contentTop;
        if (message) y = this.addModalMessage(frame, message, INK.gold);
        if (this.craftingRecipes.length > 0) container.add(this.createButton({
            x: frame.contentX + frame.contentWidth - PX * 60, y: frame.contentTop - PX * 36, width: PX * 40, height: PX * 20,
            label: '制作', tone: 'jade', onClick: () => { this.craftingPage = 0; this.showCraftingPanel(); },
        }));
        if (items.length === 0) container.add(ptext(this, frame.contentX, y + PX * 10, '背包里没有道具。', { color: INK.mist }));

        const rowH = PX * 40;
        items.slice(this.inventoryPage * pageSize, (this.inventoryPage + 1) * pageSize).forEach((item, index) => {
            const metadata = this.deckbuilderCardMetadata[item.id];
            const name = metadata?.name ?? item.id;
            const policy = this.itemActionPolicies[item.id];
            const droppable = canDropInventoryItem(item, policy);
            const equippedItems = run?.equippedItems ?? stash.equippedItems;
            const equipped = policy?.equipSlot !== undefined && equippedItems?.[policy.equipSlot] === item.id;
            const modifiers = Object.entries(policy?.attributeModifiers ?? {}).map(([attribute, delta]) =>
                `${attribute}${delta >= 0 ? '+' : ''}${delta}`).join('、');
            const detail = [metadata?.description ?? '', modifiers].filter(Boolean).join(' · ');
            const buttons: Array<{ label: string; tone?: ButtonTone; disabled?: boolean; onClick: () => void }> = [];
            if (policy?.equipSlot) buttons.push({ label: equipped ? '卸下' : '装备', onClick: () => this.changeInventoryEquipment(item.itemType, item.id, policy.equipSlot!, equipped) });
            if (run && item.itemType === 'consumable' && policy?.useEffect?.kind === 'heal') {
                const fullHealth = getRunPlayerHealth(run.playerHealth) >= MAX_RUN_PLAYER_HEALTH;
                buttons.push({ label: fullHealth ? '生命已满' : '使用', tone: 'jade', disabled: fullHealth, onClick: () => this.useInventoryItem(item.itemType, item.id) });
            }
            let note: string | undefined;
            if (run) {
                if (!droppable) note = '不可丢弃';
                else if (equipped && item.count === 1) note = '先卸下再丢弃';
                else {
                    buttons.push({ label: '丢弃 1', onClick: () => this.dropInventoryItem(item.itemType, item.id, 1) });
                    if (item.count > 1 && !equipped) buttons.push({ label: '丢弃全部', tone: 'seal', onClick: () => this.dropInventoryItem(item.itemType, item.id, item.count) });
                }
            }
            this.createModalRow(frame, y + index * (rowH + PX * 4), rowH, {
                title: `${name} ×${item.count}${equipped ? ' · 已装备' : ''}`, detail, iconPath: metadata?.iconAsset, glyph: 'pill', buttons, note,
            });
        });
        this.addModalPager(frame, this.inventoryPage, pageCount, (page) => { this.inventoryPage = page; this.showInventoryPanel(); });
        this.activeNodePanel = container;
    }

    private dropInventoryItem(itemType: ExpeditionItemType, itemId: string, count: number): void {
        const result = this.expeditionState.dropCarriedItem(itemType, itemId, count);
        if (result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        const name = this.deckbuilderCardMetadata[itemId]?.name ?? itemId;
        const message = result.status === 'dropped'
            ? `已丢弃 ${name} ×${count}。`
            : result.status === 'restricted' ? `${name} 不可丢弃。`
                : result.status === 'notOwned' ? `${name} 数量不足，未丢弃。`
                    : '本次丢弃未完成，背包保持不变。';
        this.showInventoryPanel(message);
    }

    private useInventoryItem(itemType: ExpeditionItemType, itemId: string): void {
        const result = this.expeditionState.useCarriedItem(itemType, itemId);
        if (result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        const name = this.deckbuilderCardMetadata[itemId]?.name ?? itemId;
        const message = result.status === 'used' ? `使用 ${name}，恢复 ${result.healed} 点生命。`
            : result.status === 'fullHealth' ? '生命已满，道具未消耗。'
                : result.status === 'notOwned' ? `${name} 数量不足。` : `${name} 当前无法使用。`;
        this.showInventoryPanel(message);
    }

    private changeInventoryEquipment(itemType: ExpeditionItemType, itemId: string, slot: string, equipped: boolean): void {
        const run = this.expeditionState.activeRun;
        const result = run
            ? equipped ? this.expeditionState.unequipCarriedSlot(slot) : this.expeditionState.equipCarriedItem(itemType, itemId)
            : equipped ? this.expeditionState.unequipStashSlot(slot) : this.expeditionState.equipStashItem(itemType, itemId);
        if ('activeRun' in result && result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        if ('stash' in result) this.preparationPanel?.updateStash(result.stash);
        const name = this.deckbuilderCardMetadata[itemId]?.name ?? itemId;
        const message = result.status === 'equipped' ? `已装备 ${name}。`
            : result.status === 'unequipped' ? `已卸下 ${name}，属性修正已撤销。`
                : result.status === 'notOwned' ? `${name} 不在背包中。`
                    : result.status === 'notEquippable' ? `${name} 不能装备。`
                        : '装备状态未变化。';
        this.showInventoryPanel(message);
    }

    private showCraftingPanel(message?: string): void {
        const run = this.expeditionState.activeRun;
        const stash = this.expeditionState.persistentStash;
        const source = run ?? {
            carriedDeck: stash.cards, carriedItems: stash.items, equippedItems: stash.equippedItems,
            itemSlotCapacity: stash.itemSlotCapacity, spiritStones: stash.spiritStones,
        };
        this.destroyActiveNodePanel();
        const pageSize = 4;
        const pageCount = Math.max(1, Math.ceil(this.craftingRecipes.length / pageSize));
        this.craftingPage = Math.max(0, Math.min(this.craftingPage, pageCount - 1));
        const frame = this.createModalPanel(
            '制 作', `灵石 ${source.spiritStones} · 背包 ${countOccupiedItemSlots(source.carriedItems)}/${resolveItemSlotCapacity(source.itemSlotCapacity)} 格`,
        );
        const { container } = frame;
        container.add(this.createButton({
            x: frame.contentX + frame.contentWidth - PX * 70, y: frame.contentTop - PX * 36, width: PX * 50, height: PX * 20,
            label: '返回背包', onClick: () => this.showInventoryPanel(),
        }));
        let y = frame.contentTop;
        if (message) y = this.addModalMessage(frame, message, INK.gold);
        const rowH = PX * 40;
        const name = (id: string) => this.deckbuilderCardMetadata[id]?.name ?? id;
        this.craftingRecipes.slice(this.craftingPage * pageSize, (this.craftingPage + 1) * pageSize).forEach((recipe, index) => {
            const exchange = previewCraftingRecipe(source, recipe);
            const costs = [
                ...(recipe.cost.spiritStones ? [`灵石 ×${recipe.cost.spiritStones}`] : []),
                ...recipe.cost.items.map(item => `${name(item.id)} ×${item.count}`),
            ].join(' · ');
            const outputs = recipe.rewards.items.map(item => `${name(item.id)} ×${item.count}`).join(' · ');
            const label = exchange.status === 'available' ? '制作'
                : exchange.status === 'insufficientFunds' ? '灵石不足'
                    : exchange.status === 'insufficientItems' ? '材料不足'
                        : exchange.status === 'equippedItem' ? '先卸装备' : '背包已满';
            this.createModalRow(frame, y + index * (rowH + PX * 4), rowH, {
                title: `${recipe.name} → ${outputs}`, detail: `材料：${costs}`, glyph: 'fire', dim: exchange.status !== 'available',
                buttons: [{ label, tone: exchange.status === 'available' ? 'jade' : 'slate', disabled: exchange.status !== 'available', onClick: () => this.craftInventoryRecipe(recipe) }],
            });
        });
        this.addModalPager(frame, this.craftingPage, pageCount, (page) => { this.craftingPage = page; this.showCraftingPanel(); });
        this.activeNodePanel = container;
    }

    private craftInventoryRecipe(recipe: CraftingRecipe): void {
        const result = this.expeditionState.craftRecipe(recipe);
        if (result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        else this.preparationPanel?.updateStash(result.stash);
        const message = result.status === 'crafted' ? `已制作 ${recipe.name}，材料与产物已保存。`
            : result.status === 'insufficientFunds' ? `${recipe.name}：灵石不足，未扣除材料。`
                : result.status === 'insufficientItems' ? `${recipe.name}：材料不足，未扣除灵石。`
                    : result.status === 'equippedItem' ? `${recipe.name}：请先卸下作为材料的装备。`
                        : `${recipe.name}：背包空间不足，材料保持不变。`;
        this.showCraftingPanel(message);
    }

    private showEventPanel(eventDefinition: PrototypeEventDefinition, message?: string): void {
        const activeRun = this.expeditionState.activeRun;
        if (!activeRun) {
            return;
        }
        this.destroyActiveNodePanel();
        const view = createEventNodeView(eventDefinition, activeRun, () => 0, {
            rewardName: id => this.deckbuilderCardMetadata[id]?.name ?? id,
        });
        const frame = this.createModalPanel(view.title, '秘境事件');
        const { container, contentX, contentWidth } = frame;
        const cx = contentX + contentWidth / 2;
        container.add(addIcon(this, cx, frame.contentTop + PX * 22, 'scroll', 4));
        const desc = ptext(this, contentX, frame.contentTop + PX * 50, view.description, { color: INK.bone, wrap: contentWidth });
        const outcomeLabel = ptext(this, contentX, desc.y + desc.height + PX * 10, view.outcome.label, { color: INK.gold });
        const outcome = ptext(this, contentX, outcomeLabel.y + PX * 18, view.outcome.description, { color: INK.paper, wrap: contentWidth });
        const reward = ptext(this, contentX, outcome.y + outcome.height + PX * 10, `奖励：${view.rewardSummary}`, { color: INK.spirit, wrap: contentWidth });
        const note = message ?? (view.claimed ? '该事件奖励已经领取，无法重复获得。' : view.inventoryFull ? '背包已满，暂无法领取此奖励。' : '');
        container.add([desc, outcomeLabel, outcome, reward]);
        if (note) container.add(ptext(this, cx, frame.panelBottom - PX * 44, note, { color: view.claimed ? INK.mist : INK.amber, origin: [0.5, 0.5] }));
        container.add(this.createButton({
            x: cx, y: frame.panelBottom - PX * 20, width: PX * 90, height: PX * 22,
            label: view.claimed ? '已领取' : view.inventoryFull ? '背包已满' : '领取奖励',
            tone: 'gold', disabled: view.claimed || view.inventoryFull,
            onClick: () => this.claimEventReward(eventDefinition, view),
        }));
        this.activeNodePanel = container;
    }

    private showShopPanel(shopDefinition: PrototypeShopDefinition, message?: string, page = 0): void {
        const activeRun = this.expeditionState.activeRun;
        if (!activeRun) {
            return;
        }
        this.destroyActiveNodePanel();
        const view = createShopNodeView(shopDefinition, activeRun,
            id => this.deckbuilderCardMetadata[id]?.name ?? id);
        const frame = this.createModalPanel(view.title, `灵石 ${view.spiritStones} · 背包 ${view.occupiedItemSlots}/${view.itemSlotCapacity}`);
        const { container } = frame;
        let y = this.addModalMessage(frame, message ?? view.description, message ? INK.gold : INK.bone);
        const pageSize = 4;
        const pageCount = Math.max(1, Math.ceil(view.offers.length / pageSize));
        const currentPage = Math.max(0, Math.min(page, pageCount - 1));
        const rowH = PX * 40;
        view.offers.slice(currentPage * pageSize, (currentPage + 1) * pageSize).forEach((offerView, index) => {
            this.createModalRow(frame, y + index * (rowH + PX * 4), rowH, {
                title: `${offerView.label} · ${offerView.costText}`,
                detail: `${offerView.rewardSummary}${offerView.description ? ` · ${offerView.description}` : ''}`,
                glyph: 'stone', dim: offerView.state !== 'available',
                buttons: [{ label: this.getShopOfferButtonLabel(offerView), tone: offerView.state === 'available' ? 'seal' : 'slate',
                    disabled: offerView.state !== 'available', onClick: () => this.purchaseShopOffer(shopDefinition, offerView, currentPage) }],
            });
        });
        this.addModalPager(frame, currentPage, pageCount, (next) => this.showShopPanel(shopDefinition, undefined, next));
        this.activeNodePanel = container;
    }

    private claimEventReward(
        eventDefinition: PrototypeEventDefinition,
        view: ReturnType<typeof createEventNodeView>,
    ): void {
        const result = this.expeditionState.claimEventNodeReward(eventDefinition.nodeId, view.outcome.rewards);
        if (result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        this.showEventPanel(eventDefinition,
            result.status === 'claimed' ? `已领取奖励：${view.rewardSummary}`
                : result.status === 'inventoryFull' ? '背包已满，奖励未领取。'
                    : '该事件奖励已经领取，无法重复获得。');
    }

    private purchaseShopOffer(
        shopDefinition: PrototypeShopDefinition,
        offerView: ShopOfferView,
        page: number,
    ): void {
        const result = this.expeditionState.purchaseShopOffer(
            shopDefinition.nodeId, offerView.id, offerView.offer.cost, offerView.offer.rewards,
        );
        if (result.activeRun) this.refreshActiveRunDisplay(result.activeRun);
        const nextMessage = result.status === 'purchased'
            ? `已购买 ${offerView.label}：${offerView.rewardSummary}`
            : result.status === 'alreadyPurchased' ? `${offerView.label} 已经购买过。`
                : result.status === 'inventoryFull' ? `背包已满，未购买 ${offerView.label}。`
                    : result.status === 'insufficientItems' ? `材料不足，未购买 ${offerView.label}。`
                        : result.status === 'equippedItem' ? `请先卸下作为材料的装备，再购买 ${offerView.label}。`
                            : `灵石不足，无法购买 ${offerView.label}。`;
        this.showShopPanel(shopDefinition, nextMessage, page);
    }

    private showExtractPanel(node: ExtractMapNode, message?: string): void {
        const activeRun = this.expeditionState.activeRun;

        if (!activeRun) {
            return;
        }

        this.destroyActiveNodePanel();

        const view = createExtractNodeView(node.id, activeRun);
        const frame = this.createModalPanel(node.label, '撤离点');
        const { container, contentX, contentWidth } = frame;
        const cx = contentX + contentWidth / 2;
        const confirm = () => {
            const summary = resolveExtract({ finalNodeId: node.id, run: activeRun });
            this.showTerminalSummary(summary);
        };
        container.add(addIcon(this, cx, frame.contentTop + PX * 30, 'map', 5));
        container.add(ptext(this, cx, frame.contentTop + PX * 70, '确认后结束本次探索，携带的卡牌、道具与灵石存入永久仓库。', { color: INK.bone, wrap: contentWidth, align: 'center', origin: [0.5, 0] }));
        container.add(ptext(this, cx, frame.contentTop + PX * 110, message ?? (view.recorded ? '撤离已在本次探索中登记。' : '是否确认从该撤离点离开？'), { color: view.recorded ? INK.spirit : INK.gold, origin: [0.5, 0.5] }));
        container.add(this.createButton({ x: cx, y: frame.panelBottom - PX * 20, width: PX * 100, height: PX * 22, label: '确认撤离并结算', tone: 'jade', onClick: confirm }));
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
            this.updateStatusPlate('战斗结果与当前探索不一致，请从入口重新出发。', false);
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
        this.updateStatusPlate(`战斗胜利：${this.getNodeLabel(result.nodeId)}。路线继续。`, true);
    }

    private showTerminalSummary(summary: RunResolutionSummary): void {
        this.returnToEntrance(summary);
        this.runHud.showPostRunSummary(summary, () => {
            this.runHud.hidePostRunSummary();
            this.returnToEntrance(summary);
        }, {
            displayName: id => this.deckbuilderCardMetadata[id]?.name ?? id,
            finalNodeLabel: this.getNodeLabel(summary.finalNodeId),
        });
    }

    private returnToEntrance(summary?: RunResolutionSummary): void {
        this.expeditionState.resetToEntranceState();
        this.showPreparationPanel();
        this.updateStatusPlate(
            summary
                ? createPostRunEntranceStatus(this.expeditionState.persistentStash, summary,
                    this.getNodeLabel(summary.finalNodeId))
                : createPreparationSummary(this.expeditionState.persistentStash).statusText,
            false,
        );
    }

    private createModalPanel(titleText: string, subtitleText: string): ModalFrame {
        const { width, height } = this.scale;
        const container = this.add.container(0, 0);
        const panelWidth = snap(Math.min(1380, width - PX * 40));
        const panelHeight = snap(Math.min(930, height - PX * 24));
        const panelX = snap(width / 2);
        const panelY = snap(height / 2 + PX * 4);
        const left = panelX - panelWidth / 2;
        const top = panelY - panelHeight / 2;
        const overlay = this.add.rectangle(width / 2, height / 2, width, height, INK.void, 0.7).setInteractive();
        const frame = panel(this, panelX, panelY, panelWidth, panelHeight, 'ink');
        const title = ptext(this, left + PX * 14, top + PX * 8, clip(titleText, 18), { size: 2, color: INK.paper });
        const subtitle = ptext(this, left + PX * 14, top + PX * 34, clip(subtitleText, Math.floor((panelWidth - PX * 60) / 36)), { color: INK.mist });
        const close = piconButton(this, left + panelWidth - PX * 16, top + PX * 16, 'close', () => this.destroyActiveNodePanel(), 'slate', 16);
        container.add([overlay, frame, title, subtitle, close]);
        container.setDepth(1400);
        container.setAlpha(0);
        this.tweens.add({ targets: container, alpha: 1, duration: 140, ease: 'Stepped', easeParams: [3] });
        return {
            container,
            contentX: left + PX * 14,
            contentTop: top + PX * 54,
            contentWidth: panelWidth - PX * 28,
            panelY,
            panelHeight,
            panelBottom: top + panelHeight,
        };
    }

    private createButton(config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        tone?: ButtonTone;
        onClick: () => void;
        disabled?: boolean;
    }): PButton {
        return pbutton(this, {
            x: config.x, y: config.y, width: Math.max(config.width, [...config.label].length * 36 + PX * 12), height: Math.max(config.height, PX * 20),
            label: config.label, style: (config.tone ?? 'slate') as FrameStyle, disabled: config.disabled, onClick: config.onClick,
        });
    }

    /** A list row inside a modal: slate strip with optional icon, two text lines and right-side buttons. */
    private createModalRow(frame: ModalFrame, y: number, h: number, config: {
        title: string;
        detail?: string;
        dim?: boolean;
        iconPath?: string;
        glyph?: Parameters<typeof addIcon>[3];
        buttons: Array<{ label: string; tone?: ButtonTone; disabled?: boolean; onClick: () => void }>;
        note?: string;
    }): void {
        const { container, contentX, contentWidth } = frame;
        const cy = snap(y + h / 2);
        container.add(panel(this, contentX + contentWidth / 2, cy, contentWidth, h, 'slate'));
        let textX = contentX + PX * 10;
        if (config.iconPath && this.addInventoryItemIcon(container, config.iconPath, contentX + PX * 22, cy, PX * 30)) textX = contentX + PX * 42;
        else if (config.glyph) { container.add(addIcon(this, contentX + PX * 18, cy, config.glyph, 2)); textX = contentX + PX * 36; }
        let bx = contentX + contentWidth - PX * 8;
        const buttonsW: number[] = [];
        [...config.buttons].reverse().forEach((b) => {
            const w = [...b.label].length * 36 + PX * 14;
            const btn = this.createButton({ x: bx - w / 2, y: cy, width: w, height: PX * 20, label: b.label, tone: b.tone, disabled: b.disabled, onClick: b.onClick });
            container.add(btn);
            buttonsW.push(w);
            bx -= w + PX * 4;
        });
        if (config.note) {
            const note = ptext(this, bx, cy, config.note, { color: INK.ash, origin: [1, 0.5] });
            container.add(note);
            bx -= note.width + PX * 6;
        }
        const maxChars = Math.max(6, Math.floor((bx - textX - PX * 4) / 36));
        container.add(ptext(this, textX, cy - (config.detail ? PX * 7 : 0), clip(config.title, maxChars), { color: config.dim ? INK.ash : INK.paper, origin: [0, 0.5] }));
        if (config.detail) container.add(ptext(this, textX, cy + PX * 8, clip(config.detail, maxChars), { color: config.dim ? INK.grey : INK.mist, origin: [0, 0.5] }));
    }

    private addModalPager(frame: ModalFrame, page: number, pageCount: number, go: (page: number) => void): void {
        if (pageCount <= 1) return;
        const y = frame.panelBottom - PX * 16;
        const cx = frame.contentX + frame.contentWidth / 2;
        frame.container.add(ptext(this, cx, y, `${page + 1} / ${pageCount}`, { color: INK.bone, origin: [0.5, 0.5] }));
        if (page > 0) frame.container.add(this.createButton({ x: cx - PX * 50, y, width: PX * 40, height: PX * 18, label: '上一页', onClick: () => go(page - 1) }));
        if (page < pageCount - 1) frame.container.add(this.createButton({ x: cx + PX * 50, y, width: PX * 40, height: PX * 18, label: '下一页', onClick: () => go(page + 1) }));
    }

    private addModalMessage(frame: ModalFrame, text: string, color: number = INK.bone): number {
        const t = ptext(this, frame.contentX, frame.contentTop, text, { color, wrap: frame.contentWidth });
        frame.container.add(t);
        return frame.contentTop + t.height + PX * 8;
    }

    private getShopOfferButtonLabel(offerView: ShopOfferView): string {
        switch (offerView.state) {
            case 'available':
                return '购买';
            case 'purchased':
                return '已购买';
            case 'unaffordable':
                return '灵石不足';
            case 'insufficientItems':
                return '材料不足';
            case 'equippedItem':
                return '先卸装备';
            case 'inventoryFull':
                return '背包已满';
        }
    }

    private isNonCombatNode(node: ExpeditionMapNode): node is NonCombatMapNode {
        return node.type === 'event' || node.type === 'shop' || node.type === 'extract';
    }

    private canReopenNonCombatNode(activeRun: RunSnapshot | null, node: ExpeditionMapNode): boolean {
        return !!activeRun && this.isNonCombatNode(node) && activeRun.nodeStates[node.id]?.visited === true;
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
