import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { CardSprite } from '../objects/CardSprite';
import type { UnitCard } from '../../../types/cards';
import { BattleLog } from '../ui/BattleLog';
import { BattleAnimationManager } from '../managers/BattleAnimationManager';
import { CombatManager } from '../managers/CombatManager';
import { CardManager } from '../managers/CardManager';
import { TurnManager } from '../managers/TurnManager';

export class BattleScene extends Scene {
    // 游戏状态
    private deck: UnitCard[] = [];
    private hand: CardSprite[] = [];
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
    
    // 管理器
    private battleLog!: BattleLog;
    private animationManager!: BattleAnimationManager;
    private combatManager!: CombatManager;
    private cardManager!: CardManager;
    private turnManager!: TurnManager;

    constructor() {
        super('BattleScene');
    }

    private calculateCardScale(): number {
        const { height } = this.scale;
        return (height / 1080) * 0.7;
    }

    preload() {
        this.load.json('unitCards', 'data/cards/units.json');
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

        // 加载卡牌数据
        const cardsDataObj = this.cache.json.get('unitCards') as { units: UnitCard[] };
        if (!cardsDataObj || !cardsDataObj.units) {
            console.error('卡牌数据加载失败！');
            return;
        }

        // 初始化牌库
        this.deck = [...cardsDataObj.units];
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

        this.setupDropZones();
        this.setupCardPreview();
    }

    private setupDropZones() {
        // 卡牌拖拽在 CardSprite 中处理
    }

    private setupCardPreview() {
        this.events.on('showCardPreview', (card: CardSprite) => {
            this.showCardPreview(card);
        });

        this.events.on('hideCardPreview', () => {
            this.hideCardPreview();
        });
    }

    private showCardPreview(card: CardSprite) {
        // 先隐藏旧的预览
        this.hideCardPreview();

        const { width, height } = this.scale;
        const cardData = card.getCardData();
        
        const previewX = width * 0.15;
        const previewY = height * 0.5;
        const previewScale = 1.5;

        // 创建新预览
        this.cardPreview = this.add.container(previewX, previewY);
        this.cardPreview.setDepth(3000);

        const cardWidth = 180;
        const cardHeight = 260;

        const bgMask = this.add.rectangle(0, 0, cardWidth + 40, cardHeight + 40, 0x000000, 0.7);
        bgMask.setStrokeStyle(4, 0xffd700);
        this.cardPreview.add(bgMask);

        const background = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x2d2d2d);
        background.setStrokeStyle(3, 0xffd700);
        this.cardPreview.add(background);

        const nameText = this.add.text(0, -110, cardData.name, {
            fontSize: '18px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.cardPreview.add(nameText);

        const stars = '★'.repeat(cardData.star);
        const starsText = this.add.text(0, -85, stars, {
            fontSize: '16px',
            color: '#f1c40f'
        }).setOrigin(0.5);
        this.cardPreview.add(starsText);

        const realmInfo = `${cardData.realm.stage} ${cardData.realm.phase}`;
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
        const result = this.cardManager.playCardToField(card, this.hand, this.playerField);
        if (result.success) {
            this.hand = result.hand;
            this.playerField = result.playerField;
            this.cardManager.arrangePlayerField(this.playerField);
            this.cardManager.arrangeHand(this.hand);
        }
        return result.success;
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
            const cardData = allCards.find(c => c.id === enemyConfig.cardId);
            if (cardData) {
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
        
        this.combatManager.resolveCombat(
            this.isPlayerTurn,
            this.playerField,
            this.enemyField,
            (damage: number) => {
                this.playerHealth -= damage;
            }
        );

        if (this.combatManager.checkBattleEnd(
            this.playerHealth,
            this.enemyField.length,
            () => this.turnManager.showVictory(() => this.scene.restart()),
            () => this.turnManager.showDefeat(() => this.scene.restart())
        )) {
            return;
        }

        this.isPlayerTurn = false;
        
        this.time.delayedCall(800, () => {
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

            this.turnManager.showTurnAnimation('敌人回合', 0xe74c3c, () => {
                this.enemyTurn();
            });
        });
    }

    private enemyTurn() {
        this.combatManager.resolveCombat(
            this.isPlayerTurn,
            this.playerField,
            this.enemyField,
            (damage: number) => {
                this.playerHealth -= damage;
            }
        );

        if (this.combatManager.checkBattleEnd(
            this.playerHealth,
            this.enemyField.length,
            () => this.turnManager.showVictory(() => this.scene.restart()),
            () => this.turnManager.showDefeat(() => this.scene.restart())
        )) {
            return;
        }

        this.time.delayedCall(800, () => {
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

            this.isPlayerTurn = true;
            this.turnNumber++;
            
            this.turnManager.showTurnAnimation(`回合 ${this.turnNumber}`, 0x2ecc71, () => {
                this.battleLog.addLog(`═══ 回合 ${this.turnNumber} 开始 ═══`);
                this.drawCard();
            });
        });
    }
}
