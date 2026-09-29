import type { Scene } from 'phaser';
import type { BattleLayoutConfig } from '../../config/LayoutConfig';
import type { BattleState } from '../../state/BattleState';
import { C, T, hex, PX } from '../../art/palette';
import { iconTexture } from '../../art/sprites';
import { drawPixelBar, pixelButton, pixelPanel, PANEL_BLOOD, PANEL_INK, type PanelStyle } from '../../art/ui';

const PANEL_PAPER_BTN: PanelStyle = { fill: C.bark, edge: C.void, border: C.gold, hi: C.glow, lo: C.umber, stud: C.paper };
const PANEL_AZURE_BTN: PanelStyle = { fill: C.deep, edge: C.void, border: C.sky, hi: C.ice, lo: C.night, stud: C.paper };

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
    private drawButton?: Phaser.GameObjects.Container;
    private endTurnButton?: Phaser.GameObjects.Container;
    private speedButton?: Phaser.GameObjects.Container;
    private decor: Phaser.GameObjects.GameObject[] = [];
    private hpBar?: Phaser.GameObjects.Graphics;
    private hpText?: Phaser.GameObjects.Text;
    private hpShown = -1;
    private hpMax = 100;
    private hpGhost = -1;
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
        const plate = pixelPanel(this.scene, width / 2, height * 0.04, 520, 56, PANEL_INK);
        plate.setDepth(this.layout.depth.uiText - 1);
        void height;
        this.decor.push(plate);
    }

    /** Dashed pixel zone frame with bracketed corners and a name plate. */
    private drawZone(zone: { x: number; y: number; width: number; height: number }, color: number, label: string, labelDy: number, alpha = 0.16): void {
        const x0 = Math.round(zone.x - zone.width / 2);
        const y0 = Math.round(zone.y - zone.height / 2);
        const w = Math.round(zone.width);
        const h = Math.round(zone.height);
        const g = this.scene.add.graphics().setDepth(this.layout.depth.fieldZoneVisuals);
        g.fillStyle(C.void, alpha);
        g.fillRect(x0, y0, w, h);
        g.fillStyle(color, 0.55);
        for (let x = 0; x < w; x += 16) {
            g.fillRect(x0 + x, y0, 8, 4);
            g.fillRect(x0 + x, y0 + h - 4, 8, 4);
        }
        for (let y = 0; y < h; y += 16) {
            g.fillRect(x0, y0 + y, 4, 8);
            g.fillRect(x0 + w - 4, y0 + y, 4, 8);
        }
        // solid corner brackets
        g.fillStyle(color, 1);
        const L = 28;
        for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]]) {
            g.fillRect(sx > 0 ? cx : cx - L, sy > 0 ? cy : cy - 8, L, 8);
            g.fillRect(sx > 0 ? cx : cx - 8, sy > 0 ? cy : cy - L, 8, L);
        }
        const tw = Math.max(120, label.length * 24 + 40);
        const plate = pixelPanel(this.scene, zone.x, y0 + labelDy, tw, 36, { fill: C.void, edge: C.void, border: color, hi: color, lo: C.ink, stud: null, shadow: false });
        plate.setDepth(this.layout.depth.fieldZoneVisuals);
        const t = this.scene.add.text(zone.x, y0 + labelDy, label, {
            fontSize: '12px',
            color: hex(color),
        }).setOrigin(0.5).setDepth(this.layout.depth.fieldZoneVisuals);
        this.decor.push(g, plate, t);
    }

    /**
     * 创建场地区域的视觉元素（边框和标签）
     */
    private createFieldZoneVisuals(): void {
        this.drawZone(this.layout.enemyFieldZone, C.cinnabar, '敌方场地', -2);
        this.drawZone(this.layout.fieldCardZone, C.gold, '场地', -2);
        this.drawZone(this.layout.playerFieldZone, C.jade, '我方场地（拖拽卡牌到这里）', -2);
        this.drawZone(this.layout.handZone, C.mist, '手牌', -2, 0.28);
    }

    private makeButton(x: number, y: number, w: number, h: number, label: string, style: PanelStyle, onClick: () => void): Phaser.GameObjects.Container {
        return pixelButton(this.scene, {
            x, y, width: w, height: h, label, labelSize: 24, style,
            depth: this.layout.depth.uiButtons, onClick,
        });
    }

    /**
     * 创建操作按钮（抽卡、结束回合、速度切换）
     */
    private createActionButtons(): void {
        const { width, height } = this.scene.scale;
        const buttonWidth = Math.max(150, width * 0.08);
        const buttonHeight = Math.max(56, height * 0.055);
        const buttonX = width * 0.93;

        this.drawButton = this.makeButton(buttonX, height * 0.03 + 12, buttonWidth, buttonHeight, '抽一张卡', PANEL_PAPER_BTN, () => {
            if (this.onDrawCard) this.onDrawCard();
        });
        this.endTurnButton = this.makeButton(buttonX, height * 0.09 + 12, buttonWidth, buttonHeight, '结束回合', PANEL_BLOOD, () => {
            if (this.onEndTurn) this.onEndTurn();
        });
        this.speedButton = this.makeButton(buttonX, height * 0.15 + 12, buttonWidth, buttonHeight, '速度 x1', PANEL_AZURE_BTN, () => {
            if (this.onToggleSpeed) {
                this.onToggleSpeed();
                this.updateSpeedText();
            }
        });
        this.speedText = this.speedButton.getAt(1) as Phaser.GameObjects.Text;
    }

    /**
     * 创建统计信息显示
     */
    private createStatsDisplay(): void {
        const { width, height } = this.scene.scale;
        const buttonX = width * 0.93;

        // 统计信息
        this.statsText = this.scene.add.text(buttonX, height * 0.64, '', {
            fontSize: '12px',
            color: T.fog,
            lineSpacing: 6,
            align: 'center',
        }).setOrigin(0.5);
        this.statsText.setDepth(this.layout.depth.uiText);

        this.createHpHud();

        // 回合提示
        this.turnText = this.scene.add.text(width / 2, height * 0.04, '', {
            fontSize: '24px',
            color: T.gold,
            stroke: T.void,
            strokeThickness: 6,
        }).setOrigin(0.5);
        this.turnText.setDepth(this.layout.depth.uiText);
    }

    /** Player health HUD: heart medallion, chunky segmented bar with a trailing damage ghost. */
    private createHpHud(): void {
        const depth = this.layout.depth.uiText;
        const x = 40; const y = 30;
        const frame = pixelPanel(this.scene, x + 200, y + 34, 400, 68, PANEL_INK).setDepth(depth - 1);
        const heart = this.scene.add.image(x + 34, y + 34, iconTexture(this.scene, 'heart')).setScale(4).setDepth(depth);
        this.scene.tweens.add({ targets: heart, scale: 4.6, duration: 500, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.hpBar = this.scene.add.graphics().setDepth(depth).setPosition(x + 76, y + 22);
        this.hpText = this.scene.add.text(x + 76 + 150, y + 34, '', {
            fontSize: '24px', color: T.paper, stroke: T.void, strokeThickness: 6,
        }).setOrigin(0.5).setDepth(depth + 1);
        this.decor.push(frame, heart, this.hpBar, this.hpText);
    }

    private updateHpHud(): void {
        if (!this.hpBar || !this.hpText || !this.hpBar.active) return;
        const hp = this.battleState.playerHealth;
        this.hpMax = Math.max(this.hpMax, hp);
        if (this.hpShown < 0) { this.hpShown = hp; this.hpGhost = hp; }
        if (hp < this.hpShown) { this.hpShown = hp; }
        else if (hp > this.hpShown) this.hpShown = Math.min(hp, this.hpShown + Math.max(1, this.hpMax * 0.02));
        if (this.hpGhost > this.hpShown) this.hpGhost = Math.max(this.hpShown, this.hpGhost - Math.max(0.4, this.hpMax * 0.006));
        else this.hpGhost = this.hpShown;
        const w = 300; const h = 24;
        drawPixelBar(this.hpBar, w, h, this.hpGhost / this.hpMax, C.gold, C.blood, 20);
        // overdraw the real value on top of the ghost trail
        const inner = w - PX * 2;
        this.hpBar.fillStyle(hp / this.hpMax < 0.3 ? C.cinnabar : C.jade, 1);
        this.hpBar.fillRect(PX, PX, Math.round(inner * Math.min(1, this.hpShown / this.hpMax) / 4) * 4, h - PX * 2);
        this.hpBar.fillStyle(C.paper, 0.35);
        this.hpBar.fillRect(PX, PX, Math.round(inner * Math.min(1, this.hpShown / this.hpMax) / 4) * 4, PX / 2);
        this.hpText.setText(`${Math.ceil(this.hpShown)} / ${this.hpMax}`);
    }

    /** A pile button: three fanned card backs with a count medallion. */
    private createPile(cfg: { x: number; y: number; width: number; height: number }, title: string, tint: number, countColor: number, onClick: () => void): Phaser.GameObjects.Rectangle {
        const depth = this.layout.depth.uiButtons;
        const hit = this.scene.add.rectangle(cfg.x, cfg.y, cfg.width, cfg.height, C.void, 0.001).setInteractive({ useHandCursor: true });
        hit.setDepth(depth + 2);
        const g = this.scene.add.graphics().setDepth(depth);
        const cw = cfg.width * 0.62;
        const ch = cfg.height * 0.72;
        const back = (ox: number, oy: number, hot: boolean) => {
            g.fillStyle(C.void, 1);
            g.fillRect(cfg.x - cw / 2 + ox - 4, cfg.y - ch / 2 + oy - 4, cw + 8, ch + 8);
            g.fillStyle(hot ? C.gold : tint, 1);
            g.fillRect(cfg.x - cw / 2 + ox, cfg.y - ch / 2 + oy, cw, ch);
            g.fillStyle(C.ink, 1);
            g.fillRect(cfg.x - cw / 2 + ox + 8, cfg.y - ch / 2 + oy + 8, cw - 16, ch - 16);
            g.fillStyle(hot ? C.gold : tint, 1);
            g.fillRect(cfg.x + ox - 8, cfg.y + oy - 8, 16, 16);
        };
        const draw = (hot: boolean) => {
            g.clear();
            back(-8, 8, hot); back(4, 4, hot); back(0, 0, hot);
        };
        draw(false);
        const by = cfg.y + cfg.height / 2 + 6;
        const badge = pixelPanel(this.scene, cfg.x, by, 148, 40, { fill: C.void, edge: C.void, border: countColor, hi: countColor, lo: C.ink, stud: null, shadow: false });
        badge.setDepth(depth + 3);
        const titleText = this.scene.add.text(cfg.x - 30, by, title, {
            fontSize: '12px', color: T.paper,
        }).setOrigin(1, 0.5).setDepth(depth + 4);
        const countText = this.scene.add.text(cfg.x + 12, by, '0', {
            fontSize: '24px', color: hex(countColor),
        }).setOrigin(0, 0.5).setDepth(depth + 4);
        hit.setData('titleText', titleText);
        hit.setData('countText', countText);
        hit.setData('parts', [g, badge]);
        hit.on('pointerover', () => { draw(true); titleText.setColor(T.gold); });
        hit.on('pointerout', () => { draw(false); titleText.setColor(T.paper); });
        hit.on('pointerdown', onClick);
        return hit;
    }

    /**
     * 创建卡组按钮
     */
    private createDeckButton(): void {
        this.deckButton = this.createPile(this.layout.deckButton, '牌库', C.azure, C.sky, () => { if (this.onShowDeck) this.onShowDeck(); });
    }

    /**
     * 创建弃牌堆按钮
     */
    private createDiscardPileButton(): void {
        this.discardPileButton = this.createPile(this.layout.discardPileButton, '弃牌堆', C.orchid, C.petal, () => { if (this.onShowDiscardPile) this.onShowDiscardPile(); });
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
        this.updateHpHud();
        if (this.statsText && this.statsText.active && this.turnText && this.turnText.active) {
            this.statsText.setText(
                `手牌: ${this.battleState.getHandCount()}\n` +
                `牌库: ${this.battleState.getDeckCount()}\n` +
                `场地: ${this.battleState.playerField.length}/3\n` +
                `敌人: ${this.battleState.enemyField.length}`
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
        for (const pile of [this.deckButton, this.discardPileButton]) {
            if (!pile) continue;
            (pile.getData('parts') as Phaser.GameObjects.GameObject[] | undefined)?.forEach((o) => o.destroy());
            (pile.getData('titleText') as Phaser.GameObjects.Text | undefined)?.destroy();
            (pile.getData('countText') as Phaser.GameObjects.Text | undefined)?.destroy();
            pile.destroy();
        }
        this.decor.forEach((o) => o.destroy());
        this.decor = [];
        this.drawButton?.destroy();
        this.endTurnButton?.destroy();
        this.speedButton?.destroy();
        this.statsText?.destroy();
        this.turnText?.destroy();
    }
}
