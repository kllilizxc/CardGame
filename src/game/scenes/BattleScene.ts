import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import type { UnitCard } from '../../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import type { TalismanCard } from '../../../public/data/types/cards/talisman';
import type { FieldCard } from '../../../public/data/types/cards/field';
import { BattleLog } from '../ui/BattleLog';
import { CardListView } from '../ui/CardListView';
import { BattleAnimationManager } from '../managers/BattleAnimationManager';
import { CombatManager } from '../managers/CombatManager';
import { CardManager } from '../managers/CardManager';
import { TurnManager } from '../managers/TurnManager';
import { ArtifactManager } from '../managers/ArtifactManager';
import { TalismanManager } from '../managers/TalismanManager';
import { FieldManager } from '../managers/FieldManager';
import { PillManager } from '../managers/PillManager';
import { BattleEventManager } from '../managers/BattleEventManager';
import { SacrificeManager } from '../managers/SacrificeManager';
import { PillSlotUI } from '../ui/PillSlotUI';
import { SacrificeSelectionUI } from '../ui/SacrificeSelectionUI';
import { SkillManager } from '../managers/SkillManager';
import { SkillUI } from '../ui/SkillUI';
import { DeckSelectionUI } from '../ui/DeckSelectionUI';
import { CardSpriteFactory } from '../factories/CardSpriteFactory';
import { SkillEffectHandler } from '../handlers/SkillEffectHandler';
import type { PillCard } from '../../../public/data/types/cards/pill';
import type { SkillCard } from '../../../public/data/types/cards/skill';

export class BattleScene extends Scene {
    // 游戏状态
    private deck: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[] = [];
    private discardPile: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[] = []; // 弃牌堆
    private hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    private playerField: CardSprite[] = [];
    private enemyField: CardSprite[] = [];
    
    private handZone!: Phaser.GameObjects.Zone;
    private playerFieldZone!: Phaser.GameObjects.Zone;
    private enemyFieldZone!: Phaser.GameObjects.Zone;
    private fieldZone!: Phaser.GameObjects.Zone;  // 场地卡放置区域

    private playerHealth: number = 100;
    private isPlayerTurn: boolean = true;
    private turnNumber: number = 1;
    private cardScale: number = 1;
    private cardPreview: Phaser.GameObjects.Container | null = null;
    
    // UI元素引用
    private deckButton?: Phaser.GameObjects.Rectangle;
    private discardPileButton?: Phaser.GameObjects.Rectangle;
    
    // 管理器
    private battleLog!: BattleLog;
    private animationManager!: BattleAnimationManager;
    private combatManager!: CombatManager;
    private cardManager!: CardManager;
    private turnManager!: TurnManager;
    private artifactManager!: ArtifactManager;
    private talismanManager!: TalismanManager;
    private fieldManager!: FieldManager;
    private pillManager!: PillManager;
    private pillSlotUI!: PillSlotUI;
    private eventManager!: BattleEventManager;
    private sacrificeManager!: SacrificeManager;
    private sacrificeUI!: SacrificeSelectionUI;
    private skillManager!: SkillManager;
    private skillUI!: SkillUI;
    private deckSelectionUI!: DeckSelectionUI;
    private skillEffectHandler!: SkillEffectHandler;
    private pillTooltip: Phaser.GameObjects.Container | null = null;

    constructor() {
        super('BattleScene');
    }

    private calculateCardScale(): number {
        const { height } = this.scale;
        return (height / 1080) * 0.7;
    }

    preload() {
        this.load.json('unitCards', 'data/cards/units.json');
        this.load.json('artifactCards', 'data/cards/artifacts.json');
        this.load.json('talismanCards', 'data/cards/talismans.json');
        this.load.json('pillCards', 'data/cards/pills.json');
        this.load.json('fieldCards', 'data/cards/fields.json');
        this.load.json('skillCards', 'data/cards/skills.json');
        this.load.json('starterDeck', 'data/decks/starter-deck.json');
        this.load.json('currentEncounter', 'data/encounters/medium-enemy.json');
    }

    create() {
        console.log('BattleScene create() 开始');
        const { width, height } = this.scale;

        this.cardScale = this.calculateCardScale();
        this.cameras.main.setBackgroundColor(0x1a1a2e);

        // 创建标题
        const titleFontSize = Math.floor(height * 0.03) + 'px';
        this.add.text(width / 2, height * 0.04, '修仙卡牌 - 战斗场景', {
            fontSize: titleFontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 初始化管理器
        this.battleLog = new BattleLog(this);
        this.animationManager = new BattleAnimationManager(this);
        this.combatManager = new CombatManager(this, this.animationManager, this.battleLog);
        this.cardManager = new CardManager(this, this.battleLog, this.cardScale);
        this.turnManager = new TurnManager(this);
        this.artifactManager = new ArtifactManager(this, this.battleLog);
        this.talismanManager = new TalismanManager(this, this.battleLog);
        this.fieldManager = new FieldManager(this, this.battleLog);
        this.pillManager = new PillManager(this, this.battleLog, 3); // 默认3个丹药槽位
        this.sacrificeManager = new SacrificeManager(this, this.battleLog);
        
        // 初始化事件管理器
        this.eventManager = new BattleEventManager(
            this,
            this.combatManager,
            this.cardManager,
            this.fieldManager,
            this.battleLog
        );
        
        // 初始化献祭UI
        this.sacrificeUI = new SacrificeSelectionUI(this);

        // 加载所有卡牌数据
        const unitCardsData = this.cache.json.get('unitCards') as { units: UnitCard[] };
        const artifactCardsData = this.cache.json.get('artifactCards') as { artifacts: any[] };
        const talismanCardsData = this.cache.json.get('talismanCards') as { talismans: any[] };
        const fieldCardsData = this.cache.json.get('fieldCards') as { fields: any[] };
        const pillCardsData = this.cache.json.get('pillCards') as { pills: any[] };
        const skillCardsData = this.cache.json.get('skillCards') as { skills: SkillCard[] };
        const starterDeckData = this.cache.json.get('starterDeck') as { cards: Array<{ id: string; count: number }> };

        // 创建卡牌索引
        const allCards = new Map<string, any>();
        unitCardsData.units.forEach(card => allCards.set(card.id, card));
        artifactCardsData.artifacts.forEach(card => allCards.set(card.id, card));
        talismanCardsData.talismans.forEach(card => allCards.set(card.id, card));
        fieldCardsData.fields.forEach(card => allCards.set(card.id, card));
        pillCardsData.pills.forEach(card => allCards.set(card.id, card));

        // 根据初始卡组配置构建牌库（支持 UnitCard 和 ArtifactCard）
        this.deck = [];
        starterDeckData.cards.forEach(({ id, count }) => {
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

        // 创建 UI
        this.createUI();

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

        // 补充战斗结束检查逻辑
        this.events.on('checkDeadUnits', () => {
            // 检查战斗是否结束
            this.combatManager.checkBattleEnd(
                this.playerHealth,
                this.enemyField.length,
                () => this.turnManager.showVictory(() => this.scene.restart()),
                () => this.turnManager.showDefeat(() => this.scene.restart())
            );
        });

        this.battleLog.addLog('战斗开始！');
        
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
        const { width, height } = this.scale;
        
        // 创建丹药槽位UI（放在屏幕下方手牌区上方）
        this.pillSlotUI = new PillSlotUI(
            this,
            width / 2,
            height * 0.75,
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
        const { width, height } = this.scale;
        
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
            updateDeckCount: () => this.updateDeckCount(),
            drawCard: () => this.drawCard(),
            playerField: this.playerField,
            enemyField: this.enemyField
        });
        
        // 将 GameActionHandler 注入到 TalismanManager
        this.talismanManager.setGameActionHandler(this.skillEffectHandler.getGameActionHandler());
        
        // 创建技能UI（放在屏幕上方）
        this.skillUI = new SkillUI(
            this,
            width / 2,
            height * 0.1,
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
        this.skillManager.useSkill(skillIndex, (skill) => {
            // 使用技能效果处理器执行技能效果
            this.skillEffectHandler.applySkillEffect(skill);
        });
    }


    private createFieldZones() {
        const { width, height } = this.scale;
        const fieldWidth = width * 0.7;
        const fieldHeight = height * 0.2;
        const fontSize = Math.floor(height * 0.02) + 'px';

        // 敌方场地
        const enemyFieldY = height * 0.2;
        this.enemyFieldZone = this.add.zone(width / 2, enemyFieldY, fieldWidth, fieldHeight);
        const enemyFieldGraphics = this.add.graphics();
        enemyFieldGraphics.lineStyle(3, 0xe74c3c, 0.8);
        enemyFieldGraphics.strokeRect(
            this.enemyFieldZone.x - this.enemyFieldZone.width / 2,
            this.enemyFieldZone.y - this.enemyFieldZone.height / 2,
            this.enemyFieldZone.width,
            this.enemyFieldZone.height
        );
        this.add.text(width / 2, height * 0.08, '敌方场地', {
            fontSize: fontSize,
            color: '#e74c3c'
        }).setOrigin(0.5);

        // 场地卡区域（左侧）
        const fieldZoneWidth = width * 0.15;
        const fieldZoneHeight = height * 0.35;
        const fieldZoneX = width * 0.1;
        const fieldZoneY = height * 0.35;
        this.fieldZone = this.add.zone(fieldZoneX, fieldZoneY, fieldZoneWidth, fieldZoneHeight).setInteractive();
        const fieldZoneGraphics = this.add.graphics();
        fieldZoneGraphics.lineStyle(3, 0xf39c12, 0.8);
        fieldZoneGraphics.strokeRect(
            this.fieldZone.x - this.fieldZone.width / 2,
            this.fieldZone.y - this.fieldZone.height / 2,
            this.fieldZone.width,
            this.fieldZone.height
        );
        this.add.text(fieldZoneX, fieldZoneY - fieldZoneHeight / 2 - 20, '场地', {
            fontSize: fontSize,
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 我方场地
        const playerFieldY = height * 0.45;
        this.playerFieldZone = this.add.zone(width / 2, playerFieldY, fieldWidth, fieldHeight).setInteractive();
        const playerFieldGraphics = this.add.graphics();
        playerFieldGraphics.lineStyle(3, 0x2ecc71, 0.8);
        playerFieldGraphics.strokeRect(
            this.playerFieldZone.x - this.playerFieldZone.width / 2,
            this.playerFieldZone.y - this.playerFieldZone.height / 2,
            this.playerFieldZone.width,
            this.playerFieldZone.height
        );
        this.add.text(width / 2, height * 0.33, '我方场地（拖拽卡牌到这里）', {
            fontSize: fontSize,
            color: '#2ecc71'
        }).setOrigin(0.5);

        // 手牌区域
        const handY = height * 0.8;
        const handHeight = height * 0.25;
        this.handZone = this.add.zone(width / 2, handY, width * 0.9, handHeight);
        const handGraphics = this.add.graphics();
        handGraphics.lineStyle(2, 0xf39c12, 0.6);
        handGraphics.strokeRect(
            this.handZone.x - this.handZone.width / 2,
            this.handZone.y - this.handZone.height / 2,
            this.handZone.width,
            this.handZone.height
        );
        this.add.text(width / 2, height * 0.63, '手牌', {
            fontSize: fontSize,
            color: '#f39c12'
        }).setOrigin(0.5);

        // 卡组按钮（左下角）
        this.createDeckButton();
        
        // 弃牌堆按钮（右下角）
        this.createDiscardPileButton();

        this.setupDropZones();
        this.setupCardPreview();
    }

    private setupDropZones() {
        // 卡牌拖拽在 CardSprite 中处理
    }

    private setupCardPreview() {
        this.events.on('showCardPreview', (card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite) => {
            this.showCardPreview(card);
        });

        this.events.on('showCardPreviewFromData', (cardData: any) => {
            this.showCardPreviewFromData(cardData);
        });

        this.events.on('hideCardPreview', () => {
            this.hideCardPreview();
        });

        // 丹药 tooltip 事件
        this.events.on('showPillTooltip', (pill: any, x: number, y: number) => {
            this.showPillTooltip(pill, x, y);
        });

        this.events.on('hidePillTooltip', () => {
            this.hidePillTooltip();
        });
    }

    private showCardPreview(card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite) {
        const cardData = card.getCardData();
        this.showCardPreviewFromData(cardData);
    }

    private showCardPreviewFromData(cardData: any) {
        // 先隐藏旧的预览
        this.hideCardPreview();

        const { width, height } = this.scale;
        
        const previewX = width * 0.15;
        const previewY = height * 0.5;
        const previewScale = 1.8;

        // 使用工厂创建预览卡片
        const previewCard = CardSpriteFactory.createSprite(this, cardData, 0, 0, 1);
        if (!previewCard) {
            return; // 不支持的卡牌类型
        }

        // 设置为hover模式，显示完整信息包括描述
        previewCard.setDisplayMode('hover');

        // 创建预览容器
        this.cardPreview = this.add.container(previewX, previewY);
        this.cardPreview.setDepth(6000);

        // 添加背景遮罩
        const bgMask = this.add.rectangle(0, 0, 220, 300, 0x000000, 0.8);
        bgMask.setStrokeStyle(4, 0xffd700);
        this.cardPreview.add(bgMask);

        // 添加克隆的卡片
        this.cardPreview.add(previewCard);

        this.cardPreview.setScale(previewScale);
        this.cardPreview.setAlpha(0);
        this.tweens.add({
            targets: this.cardPreview,
            alpha: 1,
            duration: 150,
            ease: 'Power2'
        });
    }

    private hideCardPreview() {
        if (this.cardPreview) {
            // 保存当前预览的引用
            const previewToHide = this.cardPreview;
            // 立即清空引用，避免竞态条件
            this.cardPreview = null;
            
            // 停止该容器上的所有动画
            this.tweens.killTweensOf(previewToHide);
            
            // 淡出并销毁
            this.tweens.add({
                targets: previewToHide,
                alpha: 0,
                duration: 100,
                onComplete: () => {
                    previewToHide.destroy();
                }
            });
        }
    }

    private showPillTooltip(pill: any, x: number, y: number) {
        // 先隐藏旧的tooltip
        this.hidePillTooltip();

        // 创建tooltip容器
        this.pillTooltip = this.add.container(x, y);
        this.pillTooltip.setDepth(7000);

        // 背景
        const bgWidth = 250;
        const bgHeight = 180;
        const bg = this.add.rectangle(0, 0, bgWidth, bgHeight, 0x1a1a2e, 0.95);
        bg.setStrokeStyle(3, 0x2ecc71);
        this.pillTooltip.add(bg);

        // 丹药图标
        const icon = this.add.text(0, -60, '💊', {
            fontSize: '40px'
        }).setOrigin(0.5);
        this.pillTooltip.add(icon);

        // 丹药名称
        const nameText = this.add.text(0, -25, pill.name, {
            fontSize: '18px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.pillTooltip.add(nameText);

        // 品级
        const gradeColors: { [key: string]: string } = {
            '下品': '#95a5a6',
            '中品': '#3498db',
            '上品': '#9b59b6',
            '极品': '#f39c12'
        };
        const gradeText = this.add.text(0, 0, `品级：${pill.grade}`, {
            fontSize: '14px',
            color: gradeColors[pill.grade] || '#95a5a6'
        }).setOrigin(0.5);
        this.pillTooltip.add(gradeText);

        // 效果描述（短）
        const descText = this.add.text(0, 25, pill.shortDescription || pill.description, {
            fontSize: '12px',
            color: '#ecf0f1',
            align: 'center',
            wordWrap: { width: bgWidth - 20 }
        }).setOrigin(0.5);
        this.pillTooltip.add(descText);

        // 目标说明
        if (pill.target) {
            const targetLabels: { [key: string]: string } = {
                'self': '自身',
                'singleAlly': '单个友方',
                'allAllies': '全体友方'
            };
            const targetText = this.add.text(0, 60, `目标：${targetLabels[pill.target] || pill.target}`, {
                fontSize: '11px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.pillTooltip.add(targetText);
        }

        // 淡入动画
        this.pillTooltip.setAlpha(0);
        this.tweens.add({
            targets: this.pillTooltip,
            alpha: 1,
            duration: 150,
            ease: 'Power2'
        });
    }

    private hidePillTooltip() {
        if (this.pillTooltip) {
            const tooltipToHide = this.pillTooltip;
            this.pillTooltip = null;

            this.tweens.killTweensOf(tooltipToHide);
            this.tweens.add({
                targets: tooltipToHide,
                alpha: 0,
                duration: 100,
                onComplete: () => {
                    tooltipToHide.destroy();
                }
            });
        }
    }

    public isCardInPlayerField(x: number, y: number): boolean {
        const bounds = this.playerFieldZone.getBounds();
        return Phaser.Geom.Rectangle.Contains(bounds, x, y);
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
                    
                    // 播放史诗召唤动画（交由动画管理器处理，异常不影响逻辑）
                    const cardData = card.getCardData();
                    this.animationManager.playSummonAnimation(card, cardData.star || 0);
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
                return true;
            }
        }

        return false;
    }

    private drawInitialHand() {
        for (let i = 0; i < Math.min(5, this.deck.length); i++) {
            this.drawCard();
        }
    }

    private spawnEnemies() {
        const encounterData = this.cache.json.get('currentEncounter') as any;
        if (!encounterData) {
            console.error('遭遇配置加载失败！');
            return;
        }

        const cardsDataObj = this.cache.json.get('unitCards') as { units: UnitCard[] };
        const allCards = cardsDataObj.units;

        const spawnedEnemies: CardSprite[] = [];
        encounterData.enemies.forEach((enemyConfig: any) => {
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
        
        // 更新卡组数量显示
        this.updateDeckCount();
    }

    private createUI() {
        const { width, height } = this.scale;
        const buttonWidth = width * 0.08;
        const buttonHeight = height * 0.05;
        const buttonX = width * 0.95;
        const fontSize = Math.floor(height * 0.018) + 'px';
        const titleFontSize = Math.floor(height * 0.022) + 'px';

        // 抽卡按钮
        const drawButton = this.add.rectangle(buttonX, height * 0.08, buttonWidth, buttonHeight, 0xf39c12)
            .setInteractive({ useHandCursor: true });
        
        this.add.text(buttonX, height * 0.08, '抽一张卡', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        drawButton.on('pointerover', () => drawButton.setFillStyle(0xffd700));
        drawButton.on('pointerout', () => drawButton.setFillStyle(0xf39c12));
        drawButton.on('pointerdown', () => this.drawCard());

        // 结束回合按钮
        const endTurnButton = this.add.rectangle(buttonX, height * 0.15, buttonWidth, buttonHeight, 0xe74c3c)
            .setInteractive({ useHandCursor: true });
        
        this.add.text(buttonX, height * 0.15, '结束回合', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        endTurnButton.on('pointerover', () => endTurnButton.setFillStyle(0xff6b6b));
        endTurnButton.on('pointerout', () => endTurnButton.setFillStyle(0xe74c3c));
        endTurnButton.on('pointerdown', () => this.endTurn());

        // 统计信息
        const statsText = this.add.text(buttonX, height * 0.25, '', {
            fontSize: fontSize,
            color: '#ffffff'
        }).setOrigin(0.5);

        // 回合提示
        const turnText = this.add.text(width / 2, height * 0.95, '', {
            fontSize: titleFontSize,
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // 使用场景的 update 方法而不是事件，避免内存泄漏
        const updateStats = () => {
            if (statsText.active && turnText.active) {
                statsText.setText(`手牌: ${this.hand.length}\n牌库: ${this.deck.length}\n场地: ${this.playerField.length}/3\n敌人: ${this.enemyField.length}\n\n你的生命: ${this.playerHealth}`);
                turnText.setText(`回合 ${this.turnNumber} - ${this.isPlayerTurn ? '你的回合' : '敌人回合'}`);
            }
        };
        
        this.events.on('update', updateStats);
    }

    private endTurn() {
        if (!this.isPlayerTurn) return;

        this.battleLog.addLog('═══ 战斗阶段 ═══');
        
        this.playerTurn();
    }

    private playerTurn() {
        this.combatManager.resolveCombat(
            this.isPlayerTurn,
            this.playerField,
            this.enemyField,
            (damage: number) => {
                this.playerHealth -= damage;
            },
            () => {
                // 攻击完成后触发通用效果检查
                this.events.emit('effectApplied');

                this.isPlayerTurn = false;
                
                // 等待死亡动画完成后切换回合
                this.time.delayedCall(600, () => {
                    this.turnManager.showTurnAnimation('敌人回合', 0xe74c3c, () => {
                        this.enemyTurn();
                    });
                });
            }
        );
    }

    private enemyTurn() {
        this.combatManager.resolveCombat(
            this.isPlayerTurn,
            this.playerField,
            this.enemyField,
            (damage: number) => {
                this.playerHealth -= damage;
            },
            () => {
                // 攻击完成后触发通用效果检查
                this.events.emit('effectApplied');

                this.isPlayerTurn = true;
                this.turnNumber++;
                
                // 等待死亡动画完成后切换回合
                this.time.delayedCall(600, () => {
                    this.turnManager.showTurnAnimation(`回合 ${this.turnNumber}`, 0x2ecc71, () => {
                        this.battleLog.addLog(`═══ 回合 ${this.turnNumber} 开始 ═══`);
                        this.drawCard();
                    });
                });
            }
        );
    }

    // 创建卡组按钮
    private createDeckButton() {
        const { width, height } = this.scale;
        const buttonX = 80;
        const buttonY = height - 80;

        // 按钮背景
        const button = this.add.rectangle(buttonX, buttonY, 120, 100, 0x34495e);
        button.setStrokeStyle(3, 0x3498db);
        button.setInteractive({ useHandCursor: true });

        // 卡堆图标（简单的堆叠矩形）
        for (let i = 0; i < 3; i++) {
            const offset = i * 3;
            this.add.rectangle(buttonX + offset, buttonY - 10 + offset, 50, 70, 0x3498db, 0.8)
                .setStrokeStyle(2, 0xffffff);
        }

        // 卡组数量文本
        const deckCountText = this.add.text(buttonX, buttonY + 30, `${this.deck.length}`, {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const labelText = this.add.text(buttonX, buttonY + 50, '卡组', {
            fontSize: '14px',
            color: '#ecf0f1'
        }).setOrigin(0.5);

        // hover效果
        button.on('pointerover', () => button.setFillStyle(0x415f7a));
        button.on('pointerout', () => button.setFillStyle(0x34495e));

        // 点击打开卡组视图
        button.on('pointerdown', () => {
            new CardListView(this, '卡组', [...this.deck]);
        });

        // 保存引用以便更新数量
        button.setData('countText', deckCountText);
        this.deckButton = button;
    }

    // 创建弃牌堆按钮
    private createDiscardPileButton() {
        const { width, height } = this.scale;
        const buttonX = width - 80;
        const buttonY = height - 80;

        // 按钮背景
        const button = this.add.rectangle(buttonX, buttonY, 120, 100, 0x34495e);
        button.setStrokeStyle(3, 0x95a5a6);
        button.setInteractive({ useHandCursor: true });

        // 废弃卡堆图标（散乱的矩形）
        const positions = [
            { x: -5, y: -10, angle: -15 },
            { x: 5, y: -5, angle: 10 },
            { x: 0, y: 0, angle: -5 }
        ];
        positions.forEach(pos => {
            this.add.rectangle(buttonX + pos.x, buttonY + pos.y, 50, 70, 0x95a5a6, 0.8)
                .setStrokeStyle(2, 0xffffff)
                .setAngle(pos.angle);
        });

        // 弃牌堆数量文本
        const discardCountText = this.add.text(buttonX, buttonY + 30, `${this.discardPile.length}`, {
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const labelText = this.add.text(buttonX, buttonY + 50, '弃牌堆', {
            fontSize: '14px',
            color: '#ecf0f1'
        }).setOrigin(0.5);

        // hover效果
        button.on('pointerover', () => button.setFillStyle(0x415f7a));
        button.on('pointerout', () => button.setFillStyle(0x34495e));

        // 点击打开弃牌堆视图
        button.on('pointerdown', () => {
            new CardListView(this, '弃牌堆', [...this.discardPile]);
        });

        // 保存引用以便更新数量
        button.setData('countText', discardCountText);
        this.discardPileButton = button;
    }

    // 添加卡牌到弃牌堆
    /**
     * 播放史诗召唤动画
     */

    public addToDiscardPile(cardData: UnitCard | ArtifactCard | TalismanCard) {
        this.discardPile.push(cardData);
        
        // 更新弃牌堆按钮数量显示
        if (this.discardPileButton) {
            const countText = this.discardPileButton.getData('countText') as Phaser.GameObjects.Text;
            if (countText) {
                countText.setText(`${this.discardPile.length}`);
            }
        }
    }

    // 从卡组抽牌时更新卡组按钮
    private updateDeckCount() {
        if (this.deckButton) {
            const countText = this.deckButton.getData('countText') as Phaser.GameObjects.Text;
            if (countText) {
                countText.setText(`${this.deck.length}`);
            }
        }
    }

    // 播放卡牌飞向弃牌堆的动画
    public playCardToDiscardPileAnimation(card: CardSprite | ArtifactSprite | TalismanSprite, onComplete?: () => void) {
        if (!this.discardPileButton) {
            if (onComplete) onComplete();
            return;
        }

        const targetX = this.discardPileButton.x;
        const targetY = this.discardPileButton.y;

        // 设置较高的深度，确保动画在最上层
        card.setDepth(2000);

        // 飞向弃牌堆的动画
        this.tweens.add({
            targets: card,
            x: targetX,
            y: targetY,
            scale: 0.2,
            alpha: 0.7,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                card.destroy();
                if (onComplete) onComplete();
            }
        });
    }
}
