import { Scene } from 'phaser';
import { EventBus, EXPEDITION_BATTLE_COMPLETE_EVENT, STORY_BATTLE_COMPLETE_EVENT } from '../../EventBus';
import { CardSprite } from '../../objects/CardSprite';
import { ArtifactSprite } from '../../objects/ArtifactSprite';
import { TalismanSprite } from '../../objects/TalismanSprite';
import { FieldSprite } from '../../objects/FieldSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { CombatBaselineConfig } from '@data/types/combat-baseline';
import type { ArtifactGradeConfig } from '@data/types/artifact-grade';
import { CardListView } from '../../ui/common/CardListView';
import { getUnitStar, installRuntimeRealmConfig, resetRuntimeRealmConfig } from '../../utils/RealmHelper';
import { installRuntimeArtifactGradeConfig, resetRuntimeArtifactGradeConfig } from '../../utils/ArtifactHelper';
import { ArtifactManager } from '../../managers/battle/ArtifactManager';
import { TalismanManager } from '../../managers/battle/TalismanManager';
import { PillManager } from '../../managers/battle/PillManager';
import { BattleEventManager } from '../../managers/battle/BattleEventManager';
import { SacrificeManager } from '../../managers/battle/SacrificeManager';
import { PillSlotUI } from '../../ui/battle/PillSlotUI';
import { SacrificeSelectionUI } from '../../ui/battle/SacrificeSelectionUI';
import { SkillManager } from '../../managers/battle/SkillManager';
import { SkillUI } from '../../ui/battle/SkillUI';
import { DeckSelectionUI } from '../../ui/common/DeckSelectionUI';
// CardSpriteFactory 已移到 CardPreviewManager 中使用
import { SkillEffectHandler } from '../../handlers/battle/SkillEffectHandler';
import { UnitEffectManager } from '../../managers/battle/UnitEffectManager';
// CardPreviewPanel 已被 CardPreviewManager 替代
import { createDefaultLayout, type BattleLayoutConfig } from '../../config/LayoutConfig';
import { ManagerFactory } from '../../managers/battle/ManagerFactory';
import { UsageManager } from '../../managers/battle/UsageManager';
import { BattleContext } from '../../context/BattleContext';
import type { PillCard } from '@data/types/cards/pill';
import type { SkillCard } from '@data/types/cards/skill';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import { BattleState } from '../../state/BattleState';
import { BattleUIManager } from '../../ui/battle/BattleUIManager';
import { CardPreviewManager } from '../../managers/common/CardPreviewManager';
import { PillTooltipUI } from '../../ui/common/PillTooltipUI';
import type { Gongfa } from '@data/types/gongfa';
import type { AnyCard } from '@types/cards/all';
import type { BattleLaunchPayload } from '../../types/expedition';
import type { StoryBattleSceneLaunchPayload } from '../../types/story';
import { createExpeditionBattleCompleteEvent } from './battleCompletion';
import { createStoryBattleCompleteEvent } from '../story/storyBattleRoundTrip';
import {
    BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY,
    BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY,
    BATTLE_STATUS_DEFINITIONS_CACHE_KEY,
    getBattleDeckCacheKey,
    getBattleDeckFile,
    getBattleDeckStacks,
    getEncounterCacheKey,
    getEncounterFile,
    getEncounterUnits,
    normalizeBattleLaunchPayload,
    normalizeStoryBattleLaunchPayload,
    resolveBattleSharedRuntimeResources,
    resolveDefaultBattleRuntimeResources,
    resolveExpeditionBattleRuntimeResources,
    resolveStoryBattleRuntimeResources,
    type BattleOptionalSharedRuntimeResourceCacheKey,
    type BattleSharedRuntimeResourceCacheKey,
    type BattleSharedRuntimeResources,
    type DefaultBattleRuntimeResources,
    type ExpeditionBattleRuntimeResources,
    type StoryBattleRuntimeResources,
} from './battleSceneLaunch';

export class BattleScene extends Scene {
    // 游戏状态（使用 BattleState 管理）
    private battleState!: BattleState;
    
    // 战斗上下文 - 集中管理通用管理器
    public battleContext!: BattleContext;
    
    // 场地区域
    private playerFieldZone!: Phaser.GameObjects.Zone;
    private enemyFieldZone!: Phaser.GameObjects.Zone;
    private fieldZone!: Phaser.GameObjects.Zone;  // 场地卡放置区域

    private cardScale: number = 1;
    
    // UI 管理器
    private uiManager!: BattleUIManager;
    private cardPreviewManager!: CardPreviewManager;
    private pillTooltipUI!: PillTooltipUI;
    
    // 管理器（通过 battleContext 访问的核心管理器）
    private get battleLog() { return this.battleContext.battleLog; }
    private get animationManager() { return this.battleContext.animationManager; }
    private get combatManager() { return this.battleContext.combatManager; }
    private get cardManager() { return this.battleContext.cardManager; }
    private get turnManager() { return this.battleContext.turnManager; }
    private get battleStatusController() { return this.battleContext.battleStatusController; }
    private get battleStateChecker() { return this.battleContext.battleStateChecker; }
    public get battleTickManager() { return this.battleContext.battleTickManager; }
    
    // 其他管理器（不在 context 中的）
    private artifactManager!: ArtifactManager;
    private talismanManager!: TalismanManager;
    private pillManager!: PillManager;
    private pillSlotUI!: PillSlotUI;
    private eventManager!: BattleEventManager;
    private sacrificeManager!: SacrificeManager;
    private sacrificeUI!: SacrificeSelectionUI;
    private skillManager!: SkillManager;
    private skillUI!: SkillUI;
    private deckSelectionUI!: DeckSelectionUI;
    private skillEffectHandler!: SkillEffectHandler;
    private unitEffectManager!: UnitEffectManager;
    // pillTooltip 已移到 PillTooltipUI
    private usageManager: UsageManager = new UsageManager();
    private static readonly USAGE_CATEGORY_WEAPON = 'weapon';
    
    // 布局配置
    private layout!: BattleLayoutConfig;
    private launchPayload: BattleLaunchPayload | null = null;
    private storyLaunchPayload: StoryBattleSceneLaunchPayload | null = null;
    private sharedRuntimeResources: BattleSharedRuntimeResources | null = null;
    private defaultRuntimeResources: DefaultBattleRuntimeResources | null = null;
    private storyRuntimeResources: StoryBattleRuntimeResources | null = null;
    private expeditionRuntimeResources: ExpeditionBattleRuntimeResources | null = null;
    private encounterCacheKey = 'currentEncounter';
    private deckCacheKey = 'starterDeck';
    private battleEndHandled = false;

    constructor() {
        super('BattleScene');
    }

    init(data?: unknown): void {
        resetRuntimeRealmConfig();
        resetRuntimeArtifactGradeConfig();
        this.launchPayload = normalizeBattleLaunchPayload(data);
        this.storyLaunchPayload = this.launchPayload ? null : normalizeStoryBattleLaunchPayload(data);
        this.sharedRuntimeResources = null;
        this.defaultRuntimeResources = null;
        this.storyRuntimeResources = null;
        this.expeditionRuntimeResources = null;
        this.encounterCacheKey = getEncounterCacheKey(this.launchPayload, this.storyLaunchPayload);
        this.deckCacheKey = getBattleDeckCacheKey(this.storyLaunchPayload);
        this.battleEndHandled = false;
    }

    // ===== Getter 方法，用于兼容现有代码 =====
    private get deck() { return this.battleState.deck; }
    private set deck(value) { this.battleState.deck = value; }
    
    private get discardPile() { return this.battleState.discardPile; }
    private set discardPile(value) { this.battleState.discardPile = value; }
    
    private get hand() { return this.battleState.hand; }
    private set hand(value) { this.battleState.hand = value; }
    
    private get playerField() { return this.battleState.playerField; }
    private set playerField(value) { this.battleState.playerField = value; }
    
    private get enemyField() { return this.battleState.enemyField; }
    private set enemyField(value) { this.battleState.enemyField = value; }
    
    private get playerHealth() { return this.battleState.playerHealth; }
    private set playerHealth(value) { this.battleState.playerHealth = value; }
    
    private get isPlayerTurn() { return this.battleState.isPlayerTurn; }
    private set isPlayerTurn(value) { this.battleState.isPlayerTurn = value; }
    
    private get turnNumber() { return this.battleState.turnNumber; }
    private set turnNumber(value) { this.battleState.turnNumber = value; }
    
    private get gameSpeed() { return this.battleState.gameSpeed; }
    private set gameSpeed(value) { this.battleState.gameSpeed = value; }
    
    private get isProcessingTurn() { return this.battleState.isProcessingTurn; }
    private set isProcessingTurn(value) { this.battleState.isProcessingTurn = value; }

    private calculateCardScale(): number {
        // 响应式缩放系数，会与 CardSprite 的默认 scale 相乘
        // 例如：1080p 屏幕返回 1.0，720p 返回 0.67
        const { height } = this.scale;
        return height / 1080;
    }

    private getRequiredSharedRuntimeJson(cacheKey: BattleSharedRuntimeResourceCacheKey): unknown {
        const resource = this.sharedRuntimeResources?.[cacheKey];

        if (!resource) {
            throw new Error(`BattleScene shared runtime cache key ${cacheKey} was not resolved before create().`);
        }

        const data = this.cache.json.get(resource.cacheKey);

        if (data === undefined) {
            throw new Error(
                `BattleScene failed to load catalog resource ${resource.resourceId} from public/${resource.publicPath}: JSON cache key ${resource.cacheKey} is missing after preload.`,
            );
        }

        return data;
    }

    private getOptionalSharedRuntimeJson(cacheKey: BattleOptionalSharedRuntimeResourceCacheKey): unknown | undefined {
        const resource = this.sharedRuntimeResources?.[cacheKey];

        if (!resource) {
            return undefined;
        }

        const data = this.cache.json.get(resource.cacheKey);

        if (data === undefined) {
            throw new Error(
                `BattleScene failed to load catalog resource ${resource.resourceId} from public/${resource.publicPath}: JSON cache key ${resource.cacheKey} is missing after preload.`,
            );
        }

        return data;
    }

    private installRuntimeHelperConfigs(): void {
        resetRuntimeRealmConfig();
        resetRuntimeArtifactGradeConfig();

        const combatBaselineConfig = this.getOptionalSharedRuntimeJson(BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY);
        const artifactGradeConfig = this.getOptionalSharedRuntimeJson(BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY);

        if (combatBaselineConfig !== undefined) {
            installRuntimeRealmConfig(combatBaselineConfig as CombatBaselineConfig);
        }

        if (artifactGradeConfig !== undefined) {
            installRuntimeArtifactGradeConfig(artifactGradeConfig as ArtifactGradeConfig);
        }
    }

    preload() {
        this.sharedRuntimeResources = resolveBattleSharedRuntimeResources(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
        );

        Object.values(this.sharedRuntimeResources).forEach((resource) => {
            this.load.json(resource.cacheKey, resource.publicPath);
        });

        this.defaultRuntimeResources = resolveDefaultBattleRuntimeResources(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.launchPayload,
            this.storyLaunchPayload,
        );
        this.storyRuntimeResources = resolveStoryBattleRuntimeResources(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.storyLaunchPayload,
        );
        this.expeditionRuntimeResources = resolveExpeditionBattleRuntimeResources(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.launchPayload,
        );
        this.load.json(this.deckCacheKey, getBattleDeckFile(
            this.storyLaunchPayload,
            this.storyRuntimeResources,
            this.defaultRuntimeResources,
        ));
        this.load.json(this.encounterCacheKey, getEncounterFile(
            this.launchPayload,
            this.storyLaunchPayload,
            this.storyRuntimeResources,
            this.expeditionRuntimeResources,
            this.defaultRuntimeResources,
        ));
    }

    async create() {
        console.log('BattleScene create() 开始');
        const { width, height } = this.scale;

        this.cardScale = this.calculateCardScale();
        this.cameras.main.setBackgroundColor(0x1a1a2e);
        
        // 初始化游戏状态
        this.battleState = new BattleState();
        
        // 初始化布局配置
        this.layout = createDefaultLayout(width, height);

        // 初始化战斗上下文
        this.battleContext = new BattleContext(this);

        // 注入运行时目录加载的境界 / 法器品级配置；缺省时 helper 保持 static fallback。
        this.installRuntimeHelperConfigs();

        // 使用 ManagerFactory 统一初始化所有管理器
        const gongfaData = this.getRequiredSharedRuntimeJson('gongfaList') as { gongfa: readonly Gongfa[] };
        const statusDefinitionsData = this.getRequiredSharedRuntimeJson(BATTLE_STATUS_DEFINITIONS_CACHE_KEY);
        const managers = await ManagerFactory.createManagers(this, this.battleContext, {
            layout: this.layout,
            cardScale: this.cardScale,
            gongfaData: gongfaData?.gongfa || [],
            statusDefinitionsData,
            fieldAccessors: {
                getPlayerField: () => this.playerField,
                getEnemyField: () => this.enemyField,
                setPlayerField: (field: CardSprite[]) => { this.playerField = field; },
                setEnemyField: (field: CardSprite[]) => { this.enemyField = field; }
            }
        });

        // 保存管理器引用
        this.unitEffectManager = managers.unitEffectManager;
        this.artifactManager = managers.artifactManager;
        this.talismanManager = managers.talismanManager;
        this.pillManager = managers.pillManager;
        this.sacrificeManager = managers.sacrificeManager;
        this.eventManager = managers.eventManager;
        
        // 初始化献祭UI
        this.sacrificeUI = new SacrificeSelectionUI(this);

        // 加载所有卡牌数据
        const unitCardsData = this.getRequiredSharedRuntimeJson('unitCards') as { units: UnitCard[] };
        const artifactCardsData = this.getRequiredSharedRuntimeJson('artifactCards') as { artifacts: ArtifactCard[] };
        const talismanCardsData = this.getRequiredSharedRuntimeJson('talismanCards') as { talismans: TalismanCard[] };
        const fieldCardsData = this.getRequiredSharedRuntimeJson('fieldCards') as { fields: FieldCard[] };
        const pillCardsData = this.getRequiredSharedRuntimeJson('pillCards') as { pills: PillCard[] };
        const skillCardsData = this.getRequiredSharedRuntimeJson('skillCards') as { skills: SkillCard[] };
        const starterDeckData = this.cache.json.get(this.deckCacheKey) as { cards: Array<{ id: string; count: number }> };

        // 创建卡牌索引
        const allCards = new Map<string, UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard>();
        unitCardsData.units.forEach(card => allCards.set(card.id, card));
        artifactCardsData.artifacts.forEach(card => allCards.set(card.id, card));
        talismanCardsData.talismans.forEach(card => allCards.set(card.id, card));
        fieldCardsData.fields.forEach(card => allCards.set(card.id, card));
        pillCardsData.pills.forEach(card => allCards.set(card.id, card));

        // 根据初始卡组配置构建牌库（支持 UnitCard 和 ArtifactCard）
        this.deck = [];
        getBattleDeckStacks(this.launchPayload, starterDeckData).forEach(({ id, count }) => {
            const cardDataTemplate = allCards.get(id);
            if (cardDataTemplate) {
                for (let i = 0; i < count; i++) {
                    // 深拷贝卡牌数据，确保每张卡都有独立的数据对象
                    const cardData = JSON.parse(JSON.stringify(cardDataTemplate));
                    this.deck.push(cardData);
                }
            }  else {
                console.warn(`找不到卡牌 ${id}`);
            }
        });
        
        console.log(`初始卡组加载完成，共 ${this.deck.length} 张卡牌`);
        Phaser.Utils.Array.Shuffle(this.deck);

        // 创建场地区域
        this.createFieldZones();

        // 生成敌人
        this.spawnEnemies();

        // 抽取初始手牌
        this.drawInitialHand();

        // 创建 UI（使用 UIManager）
        this.uiManager = new BattleUIManager(this, this.layout, this.battleState);
        this.uiManager.setCallbacks({
            onDrawCard: () => this.drawCard(),
            onEndTurn: () => this.endTurn(),
            onToggleSpeed: () => this.toggleGameSpeed(),
            onShowDeck: () => new CardListView(this, '卡组', [...this.deck]),
            onShowDiscardPile: () => new CardListView(this, '弃牌堆', [...this.discardPile])
        });
        this.uiManager.createAll();

        // 初始化卡牌预览和丹药提示框
        this.cardPreviewManager = new CardPreviewManager(this);
        this.pillTooltipUI = new PillTooltipUI(this);

        // 初始化丹药系统
        this.setupPillSystem(pillCardsData.pills);

        // 初始化技能系统
        this.setupSkillSystem(skillCardsData.skills);

        // 设置事件管理器的场地区域引用
        this.eventManager.setFieldZones(this.playerFieldZone, this.enemyFieldZone);

        // 设置事件管理器引用
        this.eventManager.setReferences(
            this.playerField,
            this.enemyField,
            this.hand,
            this.fieldZone
        );

        // 设置所有战斗事件
        this.eventManager.setupAllEvents();
        
        // 设置符箓使用逻辑
        this.setupTalismanUsageLogic();

        this.battleLog.addLog('战斗开始！');
        
        // 开始第一回合
        this.time.delayedCall(500, () => {
            this.turnManager.showTurnAnimation(`回合 ${this.turnNumber}`, 0x2ecc71, () => {
                this.turnManager.startPlayerTurn(this.getTurnContext());
            });
        });
        
        EventBus.emit('current-scene-ready', this);
    }

    /**
     * 处理符箓使用逻辑（补充BattleEventManager）
     */
    private setupTalismanUsageLogic(): void {
        this.events.on('useTalisman', (
            talisman: TalismanSprite,
            target: CardSprite,
            targetSide: 'ally' | 'enemy'
        ) => {
            // 先启动符箓选择状态
            this.talismanManager.startUseTalisman(talisman);
            
            // 尝试使用符箓
            const success = this.talismanManager.useTalismanOnTarget(target, targetSide);
            
            if (success) {
                // 从手牌中移除
                const index = this.hand.indexOf(talisman);
                if (index > -1) {
                    this.hand.splice(index, 1);
                }
                
                // 加入弃牌堆数据
                const talismanData = talisman.getCardData();
                this.addToDiscardPile(talismanData);
                
                // 重新排列手牌
                this.cardManager.arrangeHand(this.hand);
                
                // 等待动画和死亡处理完成后，播放符箓飞向弃牌堆的动画
                this.time.delayedCall(900, () => {
                    if (talisman.active) {
                        this.playCardToDiscardPileAnimation(talisman);
                    }
                });
            } else {
                // 使用失败，返回原位
                talisman.returnToOriginalPosition();
                talisman.setScale(talisman.scale / 1.2);
                talisman.setDepth(0);
            }
        });
    }

    /**
     * 初始化丹药系统
     */
    private setupPillSystem(pillsData: PillCard[]): void {
        const pillConfig = this.layout.pillSlots;
        
        // 创建丹药槽位UI
        this.pillSlotUI = new PillSlotUI(
            this,
            pillConfig.x,
            pillConfig.y,
            (slotIndex: number) => {
                // 点击槽位使用丹药
                this.usePillFromSlot(slotIndex);
            }
        );

        // 初始化槽位显示
        this.pillSlotUI.createSlots(this.pillManager.getSlots());

        // 给玩家添加初始丹药（测试：添加2个丹药）
        if (pillsData.length > 0) {
            // 添加第一个丹药
            this.pillManager.addPill(pillsData[0]);
            
            // 添加第二个丹药（如果有）
            if (pillsData.length > 1) {
                this.pillManager.addPill(pillsData[1]);
            }
        }
    }

    /**
     * 使用指定槽位的丹药
     */
    private usePillFromSlot(slotIndex: number): void {
        const pill = this.pillManager.getPillAt(slotIndex);
        if (!pill) {
            return;
        }

        // 根据丹药目标类型决定使用方式
        if (pill.target === 'player') {
            // 直接使用（作用于玩家）
            this.pillManager.usePillFromSlot(slotIndex, 'player');
        } else if (pill.target === 'unit') {
            // 需要选择目标单位（暂时简化：对第一个友方单位生效）
            if (this.playerField.length > 0) {
                this.pillManager.usePillFromSlot(slotIndex, this.playerField[0]);
            } else {
                this.battleLog.addLog('没有可用的目标单位');
            }
        } else {
            // 群体效果（allUnits, all），直接使用
            this.pillManager.usePillFromSlot(slotIndex);
        }
    }

    /**
     * 初始化技能系统
     */
    private setupSkillSystem(skillsData: SkillCard[]): void {
        // 初始化技能管理器
        this.skillManager = new SkillManager(this, this.battleLog);
        
        // 初始化卡组选择UI
        this.deckSelectionUI = new DeckSelectionUI(this);
        
        // 初始化技能效果处理器
        this.skillEffectHandler = new SkillEffectHandler({
            scene: this,
            deck: this.deck,
            hand: this.hand,
            cardScale: this.cardScale,
            battleLog: this.battleLog,
            cardManager: this.cardManager,
            deckSelectionUI: this.deckSelectionUI,
            animationManager: this.animationManager,
            updateDeckCount: () => {}, // UI 自动更新，无需手动调用
            drawCard: () => this.drawCard(),
            playerField: this.playerField,
            enemyField: this.enemyField,
            discardPile: this.discardPile
        });
        
        // 将 GameActionHandler 注入到 TalismanManager
        this.talismanManager.setGameActionHandler(this.skillEffectHandler.getGameActionHandler());
        
        // 创建技能UI（使用布局配置）
        const skillConfig = this.layout.skillUI;
        this.skillUI = new SkillUI(
            this,
            skillConfig.x,
            skillConfig.y,
            (skillIndex: number) => {
                // 点击技能按钮
                this.useSkill(skillIndex);
            }
        );

        // 给玩家装备初始技能（只装备第一个技能：注定一抽）
        const playerSkills = skillsData.slice(0, 1);
        this.skillManager.initializeSkills(playerSkills);
        this.skillUI.createSkills(this.skillManager.getSkills());
    }

    /**
     * 使用技能
     */
    private useSkill(skillIndex: number): void {
        this.skillManager.useSkill(skillIndex, (skill, onCancel) => {
            // 使用技能效果处理器执行技能效果，传入取消回调
            this.skillEffectHandler.applySkillEffect(skill, onCancel);
        });
    }


    /**
     * 创建场地区域（仅创建游戏逻辑需要的 Zone，视觉元素由 UIManager 创建）
     */
    private createFieldZones() {
        // 敌方场地 Zone
        const enemyConfig = this.layout.enemyFieldZone;
        this.enemyFieldZone = this.add.zone(enemyConfig.x, enemyConfig.y, enemyConfig.width, enemyConfig.height);

        // 场地卡 Zone
        const fieldConfig = this.layout.fieldCardZone;
        this.fieldZone = this.add.zone(fieldConfig.x, fieldConfig.y, fieldConfig.width, fieldConfig.height).setInteractive();

        // 我方场地 Zone
        const playerConfig = this.layout.playerFieldZone;
        this.playerFieldZone = this.add.zone(playerConfig.x, playerConfig.y, playerConfig.width, playerConfig.height).setInteractive();

        this.setupDropZones();
        this.setupCardPreview();
    }

    private setupDropZones() {
        // 卡牌拖拽在 CardSprite 中处理
    }

    private setupCardPreview() {
        // 使用新的 CardPreviewManager
        this.events.on('showCardPreview', (card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite) => {
            this.cardPreviewManager.showFromSprite(card);
        });

        this.events.on('showCardPreviewFromData', (cardData: AnyCard) => {
            this.cardPreviewManager.showFromData(cardData);
        });

        this.events.on('hideCardPreview', () => {
            // 不再自动隐藏，保持显示直到下一张卡片
            // this.cardPreviewManager.hide();
        });

        // 使用新的 PillTooltipUI
        this.events.on('showPillTooltip', (pill: PillCard, x: number, y: number) => {
            this.pillTooltipUI.show(pill, x, y);
        });

        this.events.on('hidePillTooltip', () => {
            this.pillTooltipUI.hide();
        });
    }

    // 已移除：卡牌预览和丹药提示框逻辑已迁移到独立的 UI 组件

    public isCardInPlayerField(x: number, y: number): boolean {
        const bounds = this.playerFieldZone.getBounds();
        return Phaser.Geom.Rectangle.Contains(bounds, x, y);
    }

    /**
     * 交换己方场地上的两张卡片位置
     */
    public swapPlayerFieldCards(draggedCard: CardSprite, x: number, y: number): boolean {
        // 检查拖拽的卡是否在己方场地中
        const draggedIndex = this.playerField.indexOf(draggedCard);
        if (draggedIndex === -1) {
            // 不在场地中，不是换位操作
            return false;
        }

        // 检查是否在己方场地区域内
        if (!this.isCardInPlayerField(x, y)) {
            return false;
        }

        // 找到最近的己方单位（而不是精确命中）
        let targetCard: CardSprite | null = null;
        let targetIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < this.playerField.length; i++) {
            if (i === draggedIndex) continue; // 跳过自己
            
            const card = this.playerField[i];
            const cardX = card.x;
            const cardY = card.y;
            
            // 计算到卡片中心的距离
            const distance = Phaser.Math.Distance.Between(x, y, cardX, cardY);
            
            // 找到最近的卡片
            if (distance < minDistance) {
                minDistance = distance;
                targetCard = card;
                targetIndex = i;
            }
        }

        // 如果找到目标卡片且距离合理（不是太远），交换位置
        const maxDistance = 200; // 最大检测距离
        if (targetCard && targetIndex !== -1 && minDistance < maxDistance) {
            // 交换数组中的位置
            [this.playerField[draggedIndex], this.playerField[targetIndex]] = 
            [this.playerField[targetIndex], this.playerField[draggedIndex]];

            // 重新排列场地
            this.cardManager.arrangePlayerField(this.playerField);
            
            this.battleLog.addLog(`交换了【${draggedCard.getCardData().name}】和【${targetCard.getCardData().name}】的位置`);
            
            return true;
        }

        return false;
    }

    public playCardToField(card: CardSprite): boolean {
        // 检查卡片是否在手牌中（只有手牌中的卡才能打出）
        if (!this.hand.includes(card)) {
            // 卡片不在手牌中（可能是场上的单位），不允许打出
            return false;
        }

        const cardData = card.getCardData();
        
        // 检查是否需要献祭
        const sacrificeRequired = this.sacrificeManager.getSacrificeRequired(cardData);
        
        if (sacrificeRequired > 0) {
            // 需要献祭
            if (!this.sacrificeManager.canSacrifice(this.playerField, sacrificeRequired)) {
                // 场上单位不足，无法召唤
                this.battleLog.addLog(`需要${sacrificeRequired}只场上单位进行献祭，但场上单位不足！`);
                return false;
            }
            
            // 显示献祭选择UI
            this.sacrificeUI.show(
                this.playerField,
                sacrificeRequired,
                (selectedUnits: CardSprite[]) => {
                    // 献祭完成，执行召唤
                    this.performSacrificeAndSummon(card, selectedUnits);
                },
                () => {
                    // 取消献祭，卡牌返回原位
                    card.returnToOriginalPosition();
                }
            );
            
            return false; // 暂时返回false，等待献祭完成
        }
        
        // 不需要献祭，直接召唤
        const result = this.cardManager.playCardToField(card, this.hand.filter(c => c instanceof CardSprite) as CardSprite[], this.playerField);
        if (result.success) {
            // 过滤并更新手牌
            const cardIndex = this.hand.indexOf(card);
            if (cardIndex > -1) {
                this.hand.splice(cardIndex, 1);
            }
            this.playerField = result.playerField;
            this.cardManager.arrangePlayerField(this.playerField);
            this.cardManager.arrangeHand(this.hand);
            
            // 触发召唤效果
            this.unitEffectManager.applyOnSummonEffects(card, {
                playerField: this.playerField,
                enemyField: this.enemyField,
                discardPile: this.discardPile,
                deck: this.deck,
                hand: this.hand,
                discardPileButton: undefined,
                cardScale: this.cardScale,
                artifactUsage: {},
                gameActionHandler: this.skillEffectHandler.getGameActionHandler(),
                combatManager: this.combatManager,
                battleStatusController: this.battleStatusController,
                battleTickManager: this.battleTickManager
            });
        }
        return result.success;
    }
    
    /**
     * 执行献祭并召唤单位
     */
    private performSacrificeAndSummon(card: CardSprite, sacrificeTargets: CardSprite[]): void {
        // 先将被献祭的单位加入弃牌堆
        sacrificeTargets.forEach(unit => {
            const unitData = unit.getCardData();
            this.addToDiscardPile(unitData);
        });
        
        // 执行献祭
        this.sacrificeManager.performSacrifice(
            sacrificeTargets,
            this.playerField,
            (remainingField: CardSprite[]) => {
                // 献祭完成，更新场上单位
                this.playerField = remainingField;
                
                // 重新排列场上单位
                this.cardManager.arrangePlayerField(this.playerField);
                
                // 现在召唤新单位
                const result = this.cardManager.playCardToField(
                    card,
                    this.hand.filter(c => c instanceof CardSprite) as CardSprite[],
                    this.playerField
                );
                
                if (result.success) {
                    // 从手牌中移除
                    const cardIndex = this.hand.indexOf(card);
                    if (cardIndex > -1) {
                        this.hand.splice(cardIndex, 1);
                    }
                    
                    // 更新场上单位
                    this.playerField = result.playerField;
                    this.cardManager.arrangePlayerField(this.playerField);
                    this.cardManager.arrangeHand(this.hand);
                    
                    // 触发召唤效果
                    this.unitEffectManager.applyOnSummonEffects(card, {
                        playerField: this.playerField,
                        enemyField: this.enemyField,
                        discardPile: this.discardPile,
                        deck: this.deck,
                        hand: this.hand,
                        discardPileButton: undefined,
                        cardScale: this.cardScale,
                        artifactUsage: {},
                        gameActionHandler: this.skillEffectHandler.getGameActionHandler(),
                        combatManager: this.combatManager,
                        battleStatusController: this.battleStatusController,
                        battleTickManager: this.battleTickManager
                    });
                    
                    // 播放史诗召唤动画（交由动画管理器处理，异常不影响逻辑）
                    const cardData = card.getCardData();
                    const star = cardData.kind === 'unit' ? getUnitStar(cardData) : 0;
                    this.animationManager.playSummonAnimation(card, star);
                }
            }
        );
    }

    public tryEquipArtifact(artifact: ArtifactSprite): boolean {
        // 检查是否拖到某个场上单位附近
        let targetUnit: CardSprite | null = null;
        let minDistance = 150; // 最大装备距离

        for (const unit of this.playerField) {
            const distance = Phaser.Math.Distance.Between(artifact.x, artifact.y, unit.x, unit.y);
            if (distance < minDistance) {
                minDistance = distance;
                targetUnit = unit;
            }
        }

        if (targetUnit) {
            // 尝试装备
            const success = this.artifactManager.equipArtifact(artifact, targetUnit);
            if (success) {
                // 从手牌移除
                const index = this.hand.indexOf(artifact);
                if (index > -1) {
                    this.hand.splice(index, 1);
                    this.cardManager.arrangeHand(this.hand);
                }

                const artifactData = artifact.getCardData() as ArtifactCard;
                this.recordArtifactUsage(artifactData.weaponType);
                return true;
            }
        }

        return false;
    }

    private recordArtifactUsage(weaponType?: ArtifactWeaponType) {
        if (!weaponType) {
            return;
        }
        this.usageManager.recordUsage(BattleScene.USAGE_CATEGORY_WEAPON, weaponType);
    }

    private resetArtifactUsage() {
        this.usageManager.resetCategory(BattleScene.USAGE_CATEGORY_WEAPON);
    }

    private applyPlayerTurnEndEffects() {
        if (!this.unitEffectManager) {
            return;
        }

        const context = {
            playerField: this.playerField,
            discardPile: this.discardPile,
            hand: this.hand,
            discardPileButton: undefined, // 不再需要，保留兼容性
            cardScale: this.cardScale,
            artifactUsage: this.usageManager.getCategoryUsage(BattleScene.USAGE_CATEGORY_WEAPON),
            gameActionHandler: this.skillEffectHandler.getGameActionHandler()
        };

        this.unitEffectManager.applyTurnEndEffectsForPlayerUnits(this.playerField, context);
        this.resetArtifactUsage();
    }

    private drawInitialHand() {
        for (let i = 0; i < Math.min(5, this.deck.length); i++) {
            this.drawCard();
        }
    }

    private spawnEnemies() {
        const encounterData = this.getRequiredSharedRuntimeJson(this.encounterCacheKey);
        if (!encounterData) {
            console.error('遭遇配置加载失败！');
            return;
        }

        const cardsDataObj = this.cache.json.get('unitCards') as { units: UnitCard[] };
        const allCards = cardsDataObj.units;

        const spawnedEnemies: CardSprite[] = [];
        getEncounterUnits(encounterData).forEach((enemyConfig) => {
            const cardDataTemplate = allCards.find(c => c.id === enemyConfig.cardId);
            if (cardDataTemplate) {
                // 深拷贝卡牌数据，避免多个卡牌共享同一个数据对象
                const cardData = JSON.parse(JSON.stringify(cardDataTemplate));
                const enemyCard = new CardSprite(this, 0, 0, cardData, this.cardScale);
                this.enemyField.push(enemyCard);
                spawnedEnemies.push(enemyCard);
            }
        });

        this.cardManager.arrangeEnemyField(this.enemyField);
        
        if (spawnedEnemies.length > 0) {
            const names = spawnedEnemies.map(e => `【${e.getCardData().name}】`).join('、');
            this.battleLog.addLog(`敌方出现：${names}`, spawnedEnemies);
        }
    }

    private drawCard() {
        const result = this.cardManager.drawCard(this.deck, this.hand);
        this.deck = result.deck;
        this.hand = result.hand;
        this.cardManager.arrangeHand(this.hand);
        
        // UI 会自动更新，无需手动调用
    }

    // 已移除：UI 创建逻辑已迁移到 BattleUIManager

    /**
     * 切换游戏速度（1x 和 2x 之间切换）
     */
    private toggleGameSpeed() {
        // 切换速度
        this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
        
        // 设置 Phaser 时间缩放
        this.time.timeScale = this.gameSpeed;
        this.tweens.timeScale = this.gameSpeed;
        
        // 记录日志
        this.battleLog.addLog(`游戏速度调整为 ${this.gameSpeed}x`);
    }

    /**
     * 启用玩家交互（玩家回合）
     */
    private enablePlayerInteraction() {
        // 启用手牌交互
        this.hand.forEach(card => {
            if (card.input) {
                card.input.enabled = true;
            }
        });
        
        // 启用场上单位交互
        this.playerField.forEach(unit => {
            if (unit.input) {
                unit.input.enabled = true;
            }
        });
    }

    /**
     * 禁用玩家交互（敌人回合）
     */
    private disablePlayerInteraction() {
        // 禁用手牌交互
        this.hand.forEach(card => {
            if (card.input) {
                card.input.enabled = false;
            }
        });
        
        // 禁用场上单位交互
        this.playerField.forEach(unit => {
            if (unit.input) {
                unit.input.enabled = false;
            }
        });
    }

    /**
     * 获取回合上下文
     */
    private getTurnContext() {
        return {
            playerField: this.playerField,
            enemyField: this.enemyField,
            playerHealth: this.playerHealth,
            isPlayerTurn: this.isPlayerTurn,
            turnNumber: this.turnNumber,
            isProcessingTurn: this.isProcessingTurn,
            battleLog: this.battleLog,
            combatManager: this.combatManager,
            battleStatusController: this.battleStatusController,
            battleStateChecker: this.battleStateChecker,
            onPlayerDamaged: (damage: number) => { this.playerHealth -= damage; },
            onRemoveUnit: (unit: CardSprite, isPlayer: boolean) => this.removeUnitFromField(unit, isPlayer),
            onDrawCard: () => this.drawCard(),
            onArrangeField: () => {
                this.cardManager.arrangePlayerField(this.playerField);
                this.cardManager.arrangeEnemyField(this.enemyField);
            },
            onEnablePlayerInteraction: () => this.enablePlayerInteraction(),
            onDisablePlayerInteraction: () => this.disablePlayerInteraction(),
            onApplyPlayerTurnEndEffects: () => this.applyPlayerTurnEndEffects(),
            onSetIsPlayerTurn: (value: boolean) => { this.isPlayerTurn = value; },
            onSetTurnNumber: (value: number) => { this.turnNumber = value; },
            onSetIsProcessingTurn: (value: boolean) => { this.isProcessingTurn = value; }
        };
    }

    private endTurn() {
        console.log('endTurn 被调用', {
            isPlayerTurn: this.isPlayerTurn,
            isProcessingTurn: this.isProcessingTurn
        });
        
        // 委托给 TurnManager（TurnManager 会设置 isProcessingTurn）
        this.turnManager.endTurn(this.getTurnContext());
    }

    // 已移除：playerTurn、enemyTurn、startPlayerTurn、startEnemyTurn
    // 这些方法已重构到 TurnManager 中

    // 已移除：卡组和弃牌堆按钮创建逻辑已迁移到 BattleUIManager

    /**
     * 添加卡牌到弃牌堆
     */
    public addToDiscardPile(cardData: UnitCard | ArtifactCard | TalismanCard) {
        this.discardPile.push(cardData);
        // UI 会自动更新，无需手动调用
    }

    // 已移除：updateDeckCount 方法，UI 自动更新

    /**
     * 播放卡牌飞向弃牌堆的动画（委托给 AnimationManager）
     */
    public playCardToDiscardPileAnimation(card: CardSprite | ArtifactSprite | TalismanSprite, onComplete?: () => void) {
        // 使用布局配置获取弃牌堆位置
        const discardConfig = this.layout.discardPileButton;
        const targetX = discardConfig.x;
        const targetY = discardConfig.y;

        // 委托给动画管理器
        this.animationManager.playCardToDiscardPileAnimation(card, targetX, targetY, onComplete);
    }

    /**
     * 从战场移除单位（由 BattleStateChecker 调用）
     */
    private removeUnitFromField(unit: CardSprite, isPlayer: boolean): void {
        // 清理状态
        const unitData = unit.getCardData();
        this.battleStatusController.cleanupUnitStatuses(unitData.id);
        
        // 从场上移除
        if (isPlayer) {
            const index = this.playerField.indexOf(unit);
            if (index > -1) {
                this.playerField.splice(index, 1);
            }
        } else {
            const index = this.enemyField.indexOf(unit);
            if (index > -1) {
                this.enemyField.splice(index, 1);
            }
        }
    }

    public handleBattleEnd(victory: boolean): void {
        if (this.battleEndHandled) {
            return;
        }

        this.battleEndHandled = true;

        if (this.storyLaunchPayload) {
            const result = createStoryBattleCompleteEvent(this.storyLaunchPayload, victory);
            EventBus.emit(STORY_BATTLE_COMPLETE_EVENT, result);
            this.scene.start('StoryScene', { storyBattleResult: result });
            return;
        }

        if (!this.launchPayload) {
            this.scene.restart();
            return;
        }

        const result = createExpeditionBattleCompleteEvent(this.launchPayload, victory);
        EventBus.emit(EXPEDITION_BATTLE_COMPLETE_EVENT, result);
        this.scene.start('ExpeditionScene', { battleResult: result });
    }
}
