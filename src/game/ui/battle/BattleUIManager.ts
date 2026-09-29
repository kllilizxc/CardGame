import type { Scene } from 'phaser';

import type { BattleLayoutConfig } from '../../config/LayoutConfig';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import type { BattleState } from '../../state/BattleState';
import { createSceneButton, createStatusLine, getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import { battleColorToHex, battleTheme, createBattleCounterButton, createBattleZoneFrame } from './battleTheme';

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
    private speedText?: Phaser.GameObjects.Text;
    private statsText?: Phaser.GameObjects.Text;
    private turnText?: Phaser.GameObjects.Text;
    private hudObjects: Phaser.GameObjects.GameObject[] = [];
    private updateHandler?: () => void;

    // 回调函数
    private onDrawCard?: () => void;
    private onEndTurn?: () => void;
    private onToggleSpeed?: () => void;
    private onShowDeck?: () => void;
    private onShowDiscardPile?: () => void;

    private get isPortrait(): boolean {
        return isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height);
    }

    constructor(
        scene: Scene,
        layout: BattleLayoutConfig,
        battleState: BattleState,
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
        this.updateStats();
        this.updateDeckCount();
        this.updateDiscardPileCount();
    }

    /**
     * 创建标题
     */
    private createTitle(): void {
        const { width } = this.scene.scale;
        const title = this.scene.add.text(width / 2, this.isPortrait ? 35 : 36, '斗法', getSceneTextStyle('sceneTitle', {
            fontSize: '32px',
        })).setOrigin(0.5);
        const subtitle = this.scene.add.text(
            this.isPortrait ? width / 2 : 460,
            this.isPortrait ? 69 : 143,
            this.isPortrait ? '拖动手牌到我阵，使用技能与丹药。' : '拖拽手牌布阵，再催动法器、符箓与丹药。',
            getSceneTextStyle('sceneSubtitle', {
                fontSize: this.isPortrait ? '18px' : '20px',
                color: battleTheme.colors.textSupport,
            }),
        ).setOrigin(0.5);

        this.setDepth(title, this.layout.depth.uiText);
        this.setDepth(subtitle, this.layout.depth.uiText);
        this.trackObjects(title, subtitle);
    }

    /**
     * 创建场地区域的视觉元素（边框和标签）
     */
    private createFieldZoneVisuals(): void {
        if (this.isPortrait) {
            const field = this.layout.fieldCardZone;
            const frame = this.scene.add.rectangle(field.x, field.y, field.width, field.height, sceneTheme.colors.banner, 0.78)
                .setStrokeStyle(2, sceneTheme.colors.goldSoft, 0.5);
            const label = this.scene.add.text(field.x, field.y, '天时', getSceneTextStyle('panelEyebrow', {
                fontSize: '20px',
            })).setOrigin(0.5);
            const zoneLabels = [
                { text: '敌阵', y: 292 },
                { text: '我阵', y: 483 },
                { text: '手牌', y: 866 },
            ].map(({ text, y }) => this.scene.add.text(28, y, text, getSceneTextStyle('panelEyebrow', {
                fontSize: '18px',
            })).setOrigin(0, 0.5));
            this.trackObjects(frame, label, ...zoneLabels);
            return;
        }
        const zones = [
            {
                config: this.layout.enemyFieldZone,
                label: '敌阵',
                accent: battleTheme.colors.dangerSoft,
            },
            {
                config: this.layout.fieldCardZone,
                label: '天时',
                accent: sceneTheme.colors.goldSoft,
            },
            {
                config: this.layout.playerFieldZone,
                label: '我阵',
                accent: sceneTheme.colors.jadeBright,
            },
            {
                config: this.layout.handZone,
                label: '手牌',
                accent: sceneTheme.colors.parchmentSoft,
            },
        ] as const;

        zones.filter(zone => zone.label !== '敌阵' && zone.label !== '我阵').forEach(({ config, label, accent }) => {
            const zone = createBattleZoneFrame(this.scene, {
                x: config.x,
                y: config.y,
                width: config.width,
                height: config.height,
                label,
                accent,
            });
            zone.objects.forEach((object) => this.setDepth(object, this.layout.depth.fieldZoneVisuals));
            this.trackObjects(...zone.objects);
        });
    }

    /**
     * 创建操作按钮（抽卡、结束回合、速度切换）
     */
    private createActionButtons(): void {
        const { width } = this.scene.scale;
        const buttonWidth = this.isPortrait ? 138 : 188;
        const buttonHeight = this.isPortrait ? 54 : 62;
        const buttonX = width - 154;

        const draw = createSceneButton(this.scene, {
            x: this.isPortrait ? 92 : buttonX,
            y: this.isPortrait ? 189 : 84,
            width: buttonWidth,
            height: buttonHeight,
            label: '抽卡',
            variant: 'secondary',
            onClick: () => {
                if (this.onDrawCard) {
                    this.onDrawCard();
                }
            },
        });
        if (this.isPortrait) draw.label.setFontSize(22).setWordWrapWidth(buttonWidth - 20);
        this.registerButton(draw.objects, draw.label, draw.description);

        const endTurn = createSceneButton(this.scene, {
            x: this.isPortrait ? width / 2 : buttonX,
            y: this.isPortrait ? 189 : 158,
            width: buttonWidth,
            height: buttonHeight,
            label: '结束回合',
            variant: 'primary',
            onClick: () => {
                if (this.onEndTurn) {
                    this.onEndTurn();
                }
            },
        });
        if (this.isPortrait) endTurn.label.setFontSize(22).setWordWrapWidth(buttonWidth - 20);
        this.registerButton(endTurn.objects, endTurn.label, endTurn.description);

        const speed = createSceneButton(this.scene, {
            x: this.isPortrait ? width - 92 : buttonX,
            y: this.isPortrait ? 189 : 232,
            width: buttonWidth,
            height: buttonHeight,
            label: `速度 x${this.battleState.gameSpeed}`,
            variant: 'option',
            onClick: () => {
                if (this.onToggleSpeed) {
                    this.onToggleSpeed();
                    this.updateSpeedText();
                }
            },
        });
        if (this.isPortrait) speed.label.setFontSize(20).setWordWrapWidth(buttonWidth - 20);
        this.speedText = speed.label;
        this.registerButton(speed.objects, speed.label, speed.description);
    }

    /**
     * 创建统计信息显示
     */
    private createStatsDisplay(): void {
        const { width, height } = this.scene.scale;
        const statusLine = createStatusLine(this.scene, {
            x: this.isPortrait ? width / 2 : 450,
            y: this.isPortrait ? 121 : 80,
            width: this.isPortrait ? width - 32 : 740,
            text: '',
            align: 'center',
        });
        statusLine.objects.forEach((object) => this.setDepth(object, this.layout.depth.uiText));
        this.statsText = statusLine.text;
        if (this.isPortrait) this.statsText.setFontSize(20);
        this.trackObjects(...statusLine.objects);

        const turnBanner = this.scene.add.rectangle(
            width / 2,
            this.isPortrait ? 246 : height * 0.30,
            this.isPortrait ? 188 : 330,
            this.isPortrait ? 54 : 50,
            sceneTheme.colors.banner,
            0.84,
        );
        turnBanner.setStrokeStyle(2, sceneTheme.colors.gold, 0.38);

        this.turnText = this.scene.add.text(width / 2, this.isPortrait ? 246 : height * 0.30, '', getSceneTextStyle('panelTitle', {
            fontSize: this.isPortrait ? '18px' : '24px',
            color: battleColorToHex(sceneTheme.colors.goldSoft),
        })).setOrigin(0.5);

        this.setDepth(turnBanner, this.layout.depth.uiButtons);
        this.setDepth(this.turnText, this.layout.depth.uiText);
        this.trackObjects(turnBanner, this.turnText);
    }

    /**
     * 创建卡组按钮
     */
    private createDeckButton(): void {
        const deckConfig = this.layout.deckButton;
        const deck = createBattleCounterButton(this.scene, {
            x: deckConfig.x,
            y: deckConfig.y,
            width: deckConfig.width,
            height: deckConfig.height,
            title: '牌库',
            count: '0',
            accent: sceneTheme.colors.jadeBright,
            onClick: () => {
                if (this.onShowDeck) {
                    this.onShowDeck();
                }
            },
        });
        this.deckButton = deck.background;
        if (this.isPortrait) {
            deck.title.setFontSize(18).setY(deckConfig.y - 11);
            deck.count.setFontSize(20).setY(deckConfig.y + 14);
        }
        this.deckButton.setData('countText', deck.count);
        deck.background.setData('countText', deck.count);
        this.registerCounterButton(deck);
    }

    /**
     * 创建弃牌堆按钮
     */
    private createDiscardPileButton(): void {
        const discardConfig = this.layout.discardPileButton;
        const discard = createBattleCounterButton(this.scene, {
            x: discardConfig.x,
            y: discardConfig.y,
            width: discardConfig.width,
            height: discardConfig.height,
            title: '弃堆',
            count: '0',
            accent: battleTheme.colors.dangerSoft,
            onClick: () => {
                if (this.onShowDiscardPile) {
                    this.onShowDiscardPile();
                }
            },
        });
        this.discardPileButton = discard.background;
        if (this.isPortrait) {
            discard.title.setFontSize(18).setY(discardConfig.y - 11);
            discard.count.setFontSize(20).setY(discardConfig.y + 14);
        }
        this.discardPileButton.setData('countText', discard.count);
        discard.background.setData('countText', discard.count);
        this.registerCounterButton(discard);
    }

    /**
     * 设置更新循环
     */
    private setupUpdateLoop(): void {
        this.updateHandler = () => {
            this.updateStats();
            this.updateDeckCount();
            this.updateDiscardPileCount();
        };
        this.scene.events.on('update', this.updateHandler);
    }

    /**
     * 更新统计信息显示
     */
    private updateStats(): void {
        if (this.statsText && this.statsText.active) {
            this.statsText.setText(
                this.isPortrait
                    ? `命元 ${this.battleState.playerHealth} · 手牌 ${this.battleState.getHandCount()} · 牌库 ${this.battleState.getDeckCount()}\n我阵 ${this.battleState.playerField.length}/3 · 敌阵 ${this.battleState.enemyField.length}`
                    : `命元 ${this.battleState.playerHealth} · 手牌 ${this.battleState.getHandCount()} · 牌库 ${this.battleState.getDeckCount()} · 我阵 ${this.battleState.playerField.length}/3 · 敌阵 ${this.battleState.enemyField.length}`,
            );
        }

        if (this.turnText && this.turnText.active) {
            this.turnText.setText(
                `第 ${this.battleState.turnNumber} 回合 · ${this.battleState.isPlayerTurn ? '我方执手' : '敌方行动'}`,
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
            const countText = this.deckButton.getData('countText') as Phaser.GameObjects.Text | undefined;
            countText?.setText(this.battleState.getDeckCount().toString());
        }
    }

    /**
     * 更新弃牌堆数量显示
     */
    public updateDiscardPileCount(): void {
        if (this.discardPileButton) {
            const countText = this.discardPileButton.getData('countText') as Phaser.GameObjects.Text | undefined;
            countText?.setText(this.battleState.getDiscardPileCount().toString());
        }
    }

    /**
     * 销毁所有 UI 元素
     */
    public destroy(): void {
        if (this.updateHandler) {
            this.scene.events.off('update', this.updateHandler);
            this.updateHandler = undefined;
        }

        this.hudObjects.forEach((object) => object.destroy());
        this.hudObjects = [];
    }

    private registerButton(
        objects: Phaser.GameObjects.GameObject[],
        label: Phaser.GameObjects.Text,
        description?: Phaser.GameObjects.Text,
    ): void {
        objects.forEach((object) => this.setDepth(object, this.layout.depth.uiButtons));
        this.setDepth(label, this.layout.depth.uiText);
        if (description) {
            this.setDepth(description, this.layout.depth.uiText);
        }
        this.trackObjects(...objects);
    }

    private registerCounterButton(button: {
        objects: Phaser.GameObjects.GameObject[];
        background: Phaser.GameObjects.Rectangle;
        title: Phaser.GameObjects.Text;
        count: Phaser.GameObjects.Text;
    }): void {
        button.objects.forEach((object) => this.setDepth(object, this.layout.depth.uiButtons));
        this.setDepth(button.title, this.layout.depth.uiText);
        this.setDepth(button.count, this.layout.depth.uiText);
        this.trackObjects(...button.objects);
    }

    private trackObjects(...objects: Phaser.GameObjects.GameObject[]): void {
        this.hudObjects.push(...objects);
    }

    private setDepth(object: Phaser.GameObjects.GameObject, depth: number): void {
        (object as Phaser.GameObjects.GameObject & { setDepth: (value: number) => Phaser.GameObjects.GameObject }).setDepth(depth);
    }
}
