import type { Scene } from 'phaser';
import type { BattleLayoutConfig } from '../config/LayoutConfig';
import type { BattleState } from '../state/BattleState';

/**
 * 战斗 UI 管理器
 * 负责创建和管理所有战斗界面的 UI 元素
 */
export class BattleUIManager {
    private scene: Scene;
    private layout: BattleLayoutConfig;
    private battleState: BattleState;

    // UI 元素引用
    private deckButton?: Phaser.GameObjects.Rectangle;
    private discardPileButton?: Phaser.GameObjects.Rectangle;
    private drawButton?: Phaser.GameObjects.Rectangle;
    private endTurnButton?: Phaser.GameObjects.Rectangle;
    private speedButton?: Phaser.GameObjects.Rectangle;
    private speedText?: Phaser.GameObjects.Text;
    private statsText?: Phaser.GameObjects.Text;
    private turnText?: Phaser.GameObjects.Text;

    // 回调函数
    private onDrawCard?: () => void;
    private onEndTurn?: () => void;
    private onToggleSpeed?: () => void;
    private onShowDeck?: () => void;
    private onShowDiscardPile?: () => void;

    constructor(
        scene: Scene,
        layout: BattleLayoutConfig,
        battleState: BattleState
    ) {
        this.scene = scene;
        this.layout = layout;
        this.battleState = battleState;
    }

    /**
     * 设置回调函数
     */
    public setCallbacks(callbacks: {
        onDrawCard?: () => void;
        onEndTurn?: () => void;
        onToggleSpeed?: () => void;
        onShowDeck?: () => void;
        onShowDiscardPile?: () => void;
    }): void {
        this.onDrawCard = callbacks.onDrawCard;
        this.onEndTurn = callbacks.onEndTurn;
        this.onToggleSpeed = callbacks.onToggleSpeed;
        this.onShowDeck = callbacks.onShowDeck;
        this.onShowDiscardPile = callbacks.onShowDiscardPile;
    }

    /**
     * 创建所有 UI 元素
     */
    public createAll(): void {
        this.createTitle();
        this.createFieldZoneVisuals();
        this.createActionButtons();
        this.createStatsDisplay();
        this.createDeckButton();
        this.createDiscardPileButton();
        this.setupUpdateLoop();
    }

    /**
     * 创建标题
     */
    private createTitle(): void {
        const { width, height } = this.scene.scale;
        const titleFontSize = Math.floor(height * 0.03) + 'px';
        const titleText = this.scene.add.text(width / 2, height * 0.04, '修仙卡牌 - 战斗场景', {
            fontSize: titleFontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        titleText.setDepth(this.layout.depth.uiText);
    }

    /**
     * 创建场地区域的视觉元素（边框和标签）
     */
    private createFieldZoneVisuals(): void {
        const { height } = this.scene.scale;
        const fontSize = Math.floor(height * 0.018) + 'px';

        // 敌方场地边框和标签
        const enemyConfig = this.layout.enemyFieldZone;
        const enemyFieldGraphics = this.scene.add.graphics();
        enemyFieldGraphics.lineStyle(2, 0xe74c3c, 0.7);
        enemyFieldGraphics.strokeRect(
            enemyConfig.x - enemyConfig.width / 2,
            enemyConfig.y - enemyConfig.height / 2,
            enemyConfig.width,
            enemyConfig.height
        );
        const enemyLabel = this.scene.add.text(enemyConfig.x, enemyConfig.y - enemyConfig.height / 2 - 20, '敌方场地', {
            fontSize: fontSize,
            color: '#e74c3c',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        enemyFieldGraphics.setDepth(this.layout.depth.fieldZoneVisuals);
        enemyLabel.setDepth(this.layout.depth.fieldZoneVisuals);

        // 场地卡区域边框和标签
        const fieldConfig = this.layout.fieldCardZone;
        const fieldZoneGraphics = this.scene.add.graphics();
        fieldZoneGraphics.lineStyle(2, 0xf39c12, 0.7);
        fieldZoneGraphics.strokeRect(
            fieldConfig.x - fieldConfig.width / 2,
            fieldConfig.y - fieldConfig.height / 2,
            fieldConfig.width,
            fieldConfig.height
        );
        const fieldLabel = this.scene.add.text(fieldConfig.x, fieldConfig.y - fieldConfig.height / 2 - 15, '场地', {
            fontSize: fontSize,
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        fieldZoneGraphics.setDepth(this.layout.depth.fieldZoneVisuals);
        fieldLabel.setDepth(this.layout.depth.fieldZoneVisuals);

        // 我方场地边框和标签
        const playerConfig = this.layout.playerFieldZone;
        const playerFieldGraphics = this.scene.add.graphics();
        playerFieldGraphics.lineStyle(2, 0x2ecc71, 0.7);
        playerFieldGraphics.strokeRect(
            playerConfig.x - playerConfig.width / 2,
            playerConfig.y - playerConfig.height / 2,
            playerConfig.width,
            playerConfig.height
        );
        const playerLabel = this.scene.add.text(playerConfig.x, playerConfig.y - playerConfig.height / 2 - 20, '我方场地（拖拽卡牌到这里）', {
            fontSize: fontSize,
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        playerFieldGraphics.setDepth(this.layout.depth.fieldZoneVisuals);
        playerLabel.setDepth(this.layout.depth.fieldZoneVisuals);

        // 手牌区域边框和标签
        const handConfig = this.layout.handZone;
        const handGraphics = this.scene.add.graphics();
        handGraphics.lineStyle(2, 0xf39c12, 0.5);
        handGraphics.strokeRect(
            handConfig.x - handConfig.width / 2,
            handConfig.y - handConfig.height / 2,
            handConfig.width,
            handConfig.height
        );
        const handLabel = this.scene.add.text(handConfig.x, handConfig.y - handConfig.height / 2 - 20, '手牌', {
            fontSize: fontSize,
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        handGraphics.setDepth(this.layout.depth.fieldZoneVisuals);
        handLabel.setDepth(this.layout.depth.fieldZoneVisuals);
    }

    /**
     * 创建操作按钮（抽卡、结束回合、速度切换）
     */
    private createActionButtons(): void {
        const { width, height } = this.scene.scale;
        const buttonWidth = width * 0.075;
        const buttonHeight = height * 0.045;
        const buttonX = width * 0.93;
        const fontSize = Math.floor(height * 0.016) + 'px';

        // 抽卡按钮
        this.drawButton = this.scene.add.rectangle(
            buttonX,
            height * 0.03,
            buttonWidth,
            buttonHeight,
            0xf39c12
        ).setInteractive({ useHandCursor: true });
        this.drawButton.setDepth(this.layout.depth.uiButtons);

        const drawText = this.scene.add.text(buttonX, height * 0.03, '抽一张卡', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        drawText.setDepth(this.layout.depth.uiText);

        this.drawButton.on('pointerover', () => this.drawButton!.setFillStyle(0xffd700));
        this.drawButton.on('pointerout', () => this.drawButton!.setFillStyle(0xf39c12));
        this.drawButton.on('pointerdown', () => {
            if (this.onDrawCard) this.onDrawCard();
        });

        // 结束回合按钮
        this.endTurnButton = this.scene.add.rectangle(
            buttonX,
            height * 0.09,
            buttonWidth,
            buttonHeight,
            0xe74c3c
        ).setInteractive({ useHandCursor: true });
        this.endTurnButton.setDepth(this.layout.depth.uiButtons);

        const endTurnText = this.scene.add.text(buttonX, height * 0.09, '结束回合', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        endTurnText.setDepth(this.layout.depth.uiText);

        this.endTurnButton.on('pointerover', () => this.endTurnButton!.setFillStyle(0xff6b6b));
        this.endTurnButton.on('pointerout', () => this.endTurnButton!.setFillStyle(0xe74c3c));
        this.endTurnButton.on('pointerdown', () => {
            if (this.onEndTurn) this.onEndTurn();
        });

        // 速度切换按钮
        this.speedButton = this.scene.add.rectangle(
            buttonX,
            height * 0.15,
            buttonWidth,
            buttonHeight,
            0x3498db
        ).setInteractive({ useHandCursor: true });
        this.speedButton.setDepth(this.layout.depth.uiButtons);

        this.speedText = this.scene.add.text(buttonX, height * 0.15, '速度 x1', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.speedText.setDepth(this.layout.depth.uiText);

        this.speedButton.on('pointerover', () => this.speedButton!.setFillStyle(0x5dade2));
        this.speedButton.on('pointerout', () => this.speedButton!.setFillStyle(0x3498db));
        this.speedButton.on('pointerdown', () => {
            if (this.onToggleSpeed) {
                this.onToggleSpeed();
                this.updateSpeedText();
            }
        });
    }

    /**
     * 创建统计信息显示
     */
    private createStatsDisplay(): void {
        const { width, height } = this.scene.scale;
        const buttonX = width * 0.93;
        const fontSize = Math.floor(height * 0.016) + 'px';
        const titleFontSize = Math.floor(height * 0.02) + 'px';

        // 统计信息
        this.statsText = this.scene.add.text(buttonX, height * 0.64, '', {
            fontSize: fontSize,
            color: '#ffffff'
        }).setOrigin(0.5);
        this.statsText.setDepth(this.layout.depth.uiText);

        // 回合提示
        this.turnText = this.scene.add.text(width / 2, height * 0.45, '', {
            fontSize: titleFontSize,
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.turnText.setDepth(this.layout.depth.uiText);
    }

    /**
     * 创建卡组按钮
     */
    private createDeckButton(): void {
        const deckConfig = this.layout.deckButton;
        const buttonX = deckConfig.x;
        const buttonY = deckConfig.y;
        const buttonWidth = deckConfig.width;
        const buttonHeight = deckConfig.height;
        const fontSize = '14px';

        // 创建按钮背景
        this.deckButton = this.scene.add.rectangle(
            buttonX,
            buttonY,
            buttonWidth,
            buttonHeight,
            0x2c3e50,
            0.8
        ).setInteractive({ useHandCursor: true });
        this.deckButton.setDepth(this.layout.depth.uiButtons);

        // 创建标题文本
        const titleText = this.scene.add.text(buttonX, buttonY - 15, '牌库', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        titleText.setDepth(this.layout.depth.uiText);

        // 创建数量文本
        const countText = this.scene.add.text(buttonX, buttonY + 10, '0', {
            fontSize: (parseInt(fontSize) * 1.5) + 'px',
            color: '#3498db',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        countText.setDepth(this.layout.depth.uiText);

        // 保存文本引用到按钮的 data 中
        this.deckButton.setData('titleText', titleText);
        this.deckButton.setData('countText', countText);

        // 添加交互效果
        this.deckButton.on('pointerover', () => {
            this.deckButton!.setFillStyle(0x34495e, 0.9);
            titleText.setColor('#3498db');
        });

        this.deckButton.on('pointerout', () => {
            this.deckButton!.setFillStyle(0x2c3e50, 0.8);
            titleText.setColor('#ffffff');
        });

        this.deckButton.on('pointerdown', () => {
            if (this.onShowDeck) this.onShowDeck();
        });
    }

    /**
     * 创建弃牌堆按钮
     */
    private createDiscardPileButton(): void {
        const discardConfig = this.layout.discardPileButton;
        const buttonX = discardConfig.x;
        const buttonY = discardConfig.y;
        const buttonWidth = discardConfig.width;
        const buttonHeight = discardConfig.height;
        const fontSize = '14px';

        // 创建按钮背景
        this.discardPileButton = this.scene.add.rectangle(
            buttonX,
            buttonY,
            buttonWidth,
            buttonHeight,
            0x8e44ad,
            0.8
        ).setInteractive({ useHandCursor: true });
        this.discardPileButton.setDepth(this.layout.depth.uiButtons);

        // 创建标题文本
        const titleText = this.scene.add.text(buttonX, buttonY - 15, '弃牌堆', {
            fontSize: fontSize,
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        titleText.setDepth(this.layout.depth.uiText);

        // 创建数量文本
        const countText = this.scene.add.text(buttonX, buttonY + 10, '0', {
            fontSize: (parseInt(fontSize) * 1.5) + 'px',
            color: '#e74c3c',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        countText.setDepth(this.layout.depth.uiText);

        // 保存文本引用到按钮的 data 中
        this.discardPileButton.setData('titleText', titleText);
        this.discardPileButton.setData('countText', countText);

        // 添加交互效果
        this.discardPileButton.on('pointerover', () => {
            this.discardPileButton!.setFillStyle(0x9b59b6, 0.9);
            titleText.setColor('#e74c3c');
        });

        this.discardPileButton.on('pointerout', () => {
            this.discardPileButton!.setFillStyle(0x8e44ad, 0.8);
            titleText.setColor('#ffffff');
        });

        this.discardPileButton.on('pointerdown', () => {
            if (this.onShowDiscardPile) this.onShowDiscardPile();
        });
    }

    /**
     * 设置更新循环
     */
    private setupUpdateLoop(): void {
        this.scene.events.on('update', () => {
            this.updateStats();
            this.updateDeckCount();
            this.updateDiscardPileCount();
        });
    }

    /**
     * 更新统计信息显示
     */
    private updateStats(): void {
        if (this.statsText && this.statsText.active && this.turnText && this.turnText.active) {
            this.statsText.setText(
                `手牌: ${this.battleState.getHandCount()}\n` +
                `牌库: ${this.battleState.getDeckCount()}\n` +
                `场地: ${this.battleState.playerField.length}/3\n` +
                `敌人: ${this.battleState.enemyField.length}\n\n` +
                `你的生命: ${this.battleState.playerHealth}`
            );

            this.turnText.setText(
                `回合 ${this.battleState.turnNumber} - ${this.battleState.isPlayerTurn ? '你的回合' : '敌人回合'}`
            );
        }
    }

    /**
     * 更新速度文本
     */
    private updateSpeedText(): void {
        if (this.speedText) {
            this.speedText.setText(`速度 x${this.battleState.gameSpeed}`);
        }
    }

    /**
     * 更新卡组数量显示
     */
    public updateDeckCount(): void {
        if (this.deckButton) {
            const countText = this.deckButton.getData('countText') as Phaser.GameObjects.Text;
            if (countText) {
                countText.setText(this.battleState.getDeckCount().toString());
            }
        }
    }

    /**
     * 更新弃牌堆数量显示
     */
    public updateDiscardPileCount(): void {
        if (this.discardPileButton) {
            const countText = this.discardPileButton.getData('countText') as Phaser.GameObjects.Text;
            if (countText) {
                countText.setText(this.battleState.getDiscardPileCount().toString());
            }
        }
    }

    /**
     * 销毁所有 UI 元素
     */
    public destroy(): void {
        this.deckButton?.destroy();
        this.discardPileButton?.destroy();
        this.drawButton?.destroy();
        this.endTurnButton?.destroy();
        this.speedButton?.destroy();
        this.speedText?.destroy();
        this.statsText?.destroy();
        this.turnText?.destroy();
    }
}
