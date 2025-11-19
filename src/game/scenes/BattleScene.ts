import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import type { UnitCard } from '../../../data/types/cards/unit';
import type { ArtifactCard } from '../../../data/types/cards/artifact';
import { BattleLog } from '../ui/BattleLog';
import { CardListView } from '../ui/CardListView';
import { BattleAnimationManager } from '../managers/BattleAnimationManager';
import { CombatManager } from '../managers/CombatManager';
import { CardManager } from '../managers/CardManager';
import { TurnManager } from '../managers/TurnManager';
import { ArtifactManager } from '../managers/ArtifactManager';

export class BattleScene extends Scene {
    // 游戏状态
    private deck: (UnitCard | ArtifactCard)[] = [];
    private discardPile: (UnitCard | ArtifactCard)[] = []; // 弃牌堆
    private hand: (CardSprite | ArtifactSprite)[] = [];
    private playerField: CardSprite[] = [];
    private enemyField: CardSprite[] = [];
    
    private handZone!: Phaser.GameObjects.Zone;
    private playerFieldZone!: Phaser.GameObjects.Zone;
    private enemyFieldZone!: Phaser.GameObjects.Zone;

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

        // 加载所有卡牌数据
        const unitCardsData = this.cache.json.get('unitCards') as { units: UnitCard[] };
        const artifactCardsData = this.cache.json.get('artifactCards') as { artifacts: any[] };
        const talismanCardsData = this.cache.json.get('talismanCards') as { talismans: any[] };
        const pillCardsData = this.cache.json.get('pillCards') as { pills: any[] };
        const fieldCardsData = this.cache.json.get('fieldCards') as { fields: any[] };
        const starterDeckData = this.cache.json.get('starterDeck') as { cards: Array<{ id: string; count: number }> };

        // 创建卡牌索引
        const allCards = new Map<string, any>();
        unitCardsData.units.forEach(card => allCards.set(card.id, card));
        artifactCardsData.artifacts.forEach(card => allCards.set(card.id, card));
        talismanCardsData.talismans.forEach(card => allCards.set(card.id, card));
        pillCardsData.pills.forEach(card => allCards.set(card.id, card));
        fieldCardsData.fields.forEach(card => allCards.set(card.id, card));

        // 根据初始卡组配置构建牌库（支持 UnitCard 和 ArtifactCard）
        this.deck = [];
        starterDeckData.cards.forEach(({ id, count }) => {
            const cardDataTemplate = allCards.get(id);
            if (cardDataTemplate && cardDataTemplate.kind === 'unit') {
                for (let i = 0; i < count; i++) {
                    // 深拷贝卡牌数据，确保每张卡都有独立的数据对象
                    const cardData = JSON.parse(JSON.stringify(cardDataTemplate));
                    this.deck.push(cardData as UnitCard);
                }
            } else if (cardDataTemplate && cardDataTemplate.kind === 'artifact') {
                for (let i = 0; i < count; i++) {
                    // 深拷贝卡牌数据，确保每张卡都有独立的数据对象
                    const cardData = JSON.parse(JSON.stringify(cardDataTemplate));
                    this.deck.push(cardData as ArtifactCard);
                }
            } else if (cardDataTemplate) {
                console.warn(`卡牌 ${id} (${cardDataTemplate.kind}) 暂不支持，跳过`);
            } else {
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

        this.battleLog.addLog('战斗开始！');
        
        EventBus.emit('current-scene-ready', this);
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
        this.events.on('showCardPreview', (card: CardSprite | ArtifactSprite) => {
            this.showCardPreview(card);
        });

        this.events.on('hideCardPreview', () => {
            this.hideCardPreview();
        });
    }

    private showCardPreview(card: CardSprite | ArtifactSprite) {
        // 先隐藏旧的预览
        this.hideCardPreview();

        const { width, height } = this.scale;
        const cardData = card.getCardData();
        
        const previewX = width * 0.15;
        const previewY = height * 0.5;
        const previewScale = 1.5;

        // 创建新预览
        this.cardPreview = this.add.container(previewX, previewY);
        this.cardPreview.setDepth(6000); // 高于CardListView(5000)，确保预览不被遮挡

        const cardWidth = 180;
        const cardHeight = 260;

        const bgMask = this.add.rectangle(0, 0, cardWidth + 40, cardHeight + 40, 0x000000, 0.7);
        bgMask.setStrokeStyle(4, 0xffd700);
        this.cardPreview.add(bgMask);

        const borderColor = cardData.kind === 'artifact' ? 0xdaa520 : 0xffd700;
        const background = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x2d2d2d);
        background.setStrokeStyle(3, borderColor);
        this.cardPreview.add(background);

        const nameText = this.add.text(0, -110, cardData.name, {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.cardPreview.add(nameText);

        // 星级（如果有）
        if ('star' in cardData && cardData.star) {
            const stars = '★'.repeat(cardData.star);
            const starsText = this.add.text(0, -85, stars, {
                fontSize: '16px',
                color: '#f1c40f'
            }).setOrigin(0.5);
            this.cardPreview.add(starsText);
        }

        // 只有单位卡才有 realm、race、attack、health
        if (cardData.kind === 'unit') {
            const realmInfo = `${cardData.realm?.stage || ''} ${cardData.realm?.phase || ''}`;
            const realmText = this.add.text(0, -60, realmInfo, {
                fontSize: '14px',
                color: '#9b59b6'
            }).setOrigin(0.5);
            this.cardPreview.add(realmText);

            const raceBox = this.add.rectangle(0, -10, 150, 60, 0x34495e);
            this.cardPreview.add(raceBox);
            const raceText = this.add.text(0, -10, cardData.race, {
                fontSize: '16px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.cardPreview.add(raceText);

            const descriptionText = this.add.text(0, 60, cardData.description, {
                fontSize: '13px',
                color: '#bdc3c7',
                wordWrap: { width: 160 },
                align: 'center'
            }).setOrigin(0.5);
            this.cardPreview.add(descriptionText);

            const attackBg = this.add.rectangle(-50, 110, 60, 30, 0x4d1a1a);
            this.cardPreview.add(attackBg);
            const attackText = this.add.text(-50, 110, `⚔${cardData.attack}`, {
                fontSize: '16px',
                color: '#e74c3c',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.cardPreview.add(attackText);

            const healthBg = this.add.rectangle(50, 110, 60, 30, 0x1a4d2e);
            this.cardPreview.add(healthBg);
            const healthText = this.add.text(50, 110, `❤${cardData.health}`, {
                fontSize: '16px',
                color: cardData.health <= 0 ? '#666666' : (cardData.health <= 3 ? '#e74c3c' : '#2ecc71'),
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.cardPreview.add(healthText);
        } else if (cardData.kind === 'artifact') {
            // 法器卡显示类型、加成、耐久度
            const typeLabel = cardData.labels?.join(' ') || '法器';
            const typeText = this.add.text(0, -60, typeLabel, {
                fontSize: '14px',
                color: '#daa520'
            }).setOrigin(0.5);
            this.cardPreview.add(typeText);

            const descriptionText = this.add.text(0, 20, cardData.description, {
                fontSize: '13px',
                color: '#bdc3c7',
                wordWrap: { width: 160 },
                align: 'center'
            }).setOrigin(0.5);
            this.cardPreview.add(descriptionText);

            // 显示加成
            let yPos = 90;
            if (cardData.attackBonus) {
                const bonusText = this.add.text(0, yPos, `⚔ +${cardData.attackBonus} 攻击`, {
                    fontSize: '14px',
                    color: '#e74c3c'
                }).setOrigin(0.5);
                this.cardPreview.add(bonusText);
                yPos += 25;
            }
            if (cardData.healthBonus) {
                const bonusText = this.add.text(0, yPos, `❤ +${cardData.healthBonus} 生命`, {
                    fontSize: '14px',
                    color: '#2ecc71'
                }).setOrigin(0.5);
                this.cardPreview.add(bonusText);
                yPos += 25;
            }
            if (cardData.durability) {
                const durText = this.add.text(0, yPos, `耐久: ${cardData.durability}`, {
                    fontSize: '14px',
                    color: '#95a5a6'
                }).setOrigin(0.5);
                this.cardPreview.add(durText);
            }
        }

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

    public isCardInPlayerField(x: number, y: number): boolean {
        const bounds = this.playerFieldZone.getBounds();
        return Phaser.Geom.Rectangle.Contains(bounds, x, y);
    }

    public playCardToField(card: CardSprite): boolean {
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

        this.events.on('update', () => {
            statsText.setText(`手牌: ${this.hand.length}\n牌库: ${this.deck.length}\n场地: ${this.playerField.length}/3\n敌人: ${this.enemyField.length}\n\n你的生命: ${this.playerHealth}`);
            turnText.setText(`回合 ${this.turnNumber} - ${this.isPlayerTurn ? '你的回合' : '敌人回合'}`);
        });
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
                // 攻击完成后立即检查死亡
                const result = this.combatManager.removeDeadUnits(
                    this.playerField,
                    this.enemyField,
                    () => {
                        this.cardManager.arrangePlayerField(this.playerField);
                        this.cardManager.arrangeEnemyField(this.enemyField);
                    }
                );
                this.playerField = result.playerField;
                this.enemyField = result.enemyField;

                if (this.combatManager.checkBattleEnd(
                    this.playerHealth,
                    this.enemyField.length,
                    () => this.turnManager.showVictory(() => this.scene.restart()),
                    () => this.turnManager.showDefeat(() => this.scene.restart())
                )) {
                    return;
                }

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
                // 攻击完成后立即检查死亡
                const result = this.combatManager.removeDeadUnits(
                    this.playerField,
                    this.enemyField,
                    () => {
                        this.cardManager.arrangePlayerField(this.playerField);
                        this.cardManager.arrangeEnemyField(this.enemyField);
                    }
                );
                this.playerField = result.playerField;
                this.enemyField = result.enemyField;

                if (this.combatManager.checkBattleEnd(
                    this.playerHealth,
                    this.enemyField.length,
                    () => this.turnManager.showVictory(() => this.scene.restart()),
                    () => this.turnManager.showDefeat(() => this.scene.restart())
                )) {
                    return;
                }

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
    public addToDiscardPile(cardData: UnitCard | ArtifactCard) {
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
    public playCardToDiscardPileAnimation(card: CardSprite | ArtifactSprite, onComplete?: () => void) {
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
