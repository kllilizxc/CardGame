import { GameObjects, type Scene } from 'phaser';

import { C, FONT, PX, hex } from '../../../art/palette';
import { iconTexture } from '../../../art/sprites';
import { drawPixelBar, drawPixelFrame, pixelPanel, PANEL_BLOOD, PANEL_INK, PANEL_JADE, type PanelStyle } from '../../../art/ui';
import { getWenxinBattleStage } from '../../../art/wenxin/WenxinBattleStage';
import type { BattleLayoutConfig } from '../../../config/LayoutConfig';
import type { BattleState } from '../../../state/BattleState';
import type { BattleLog } from '../BattleLog';

interface HudCallbacks {
    onDrawCard?: () => void;
    onEndTurn?: () => void;
    onToggleSpeed?: () => void;
    onShowDeck?: () => void;
    onShowDiscardPile?: () => void;
}

interface HudButton {
    container: GameObjects.Container;
    setEnabled(on: boolean): void;
    setLabel(text: string): void;
    setStyle(style: PanelStyle): void;
}

const txt = (scene: Scene, x: number, y: number, s: string, size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) =>
    scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra });

/**
 * Landscape battle HUD. Everything that is not the diorama or the hand lives on the edges:
 * health top-left, turn ribbon top-centre, tools top-right, piles flanking the hand,
 * a single seal-shaped "end turn" on the right. Nothing sits in the middle of the fight.
 */
export class BattleHud {
    private readonly objs: GameObjects.GameObject[] = [];
    private cb: HudCallbacks = {};
    private hpBar!: GameObjects.Graphics;
    private hpNumber!: GameObjects.Text;
    private chips!: GameObjects.Text;
    private turnText!: GameObjects.Text;
    private turnSub!: GameObjects.Text;
    private turnPanel!: GameObjects.Graphics;
    private turnWasPlayer: boolean | null = null;
    private speedButton!: HudButton;
    private endButton!: HudButton;
    private endGlow!: GameObjects.Rectangle;
    private deckCount!: GameObjects.Text;
    private discardCount!: GameObjects.Text;
    private deckPile!: GameObjects.Container;
    private discardPile!: GameObjects.Container;
    private toasts: Array<{ box: GameObjects.Container; born: number }> = [];
    private dropHint!: GameObjects.Graphics;
    private dropActive = false;
    private hpShown = -1;
    private hpGhost = -1;
    private hpMax = 100;
    private hpShake = 0;
    private updateHandler?: (t: number, d: number) => void;
    private logToggle?: () => void;
    private destroyed = false;
    private readonly shutdownHandler = () => this.destroy();

    constructor(
        private readonly scene: Scene,
        private readonly layout: BattleLayoutConfig,
        private readonly battleState: BattleState,
    ) {}

    setCallbacks(cb: HudCallbacks) { this.cb = cb; }
    /** Wire the log drawer and the toast feed. */
    attachLog(log: BattleLog) {
        this.logToggle = () => log.toggle();
        log.setToggleVisible?.(false);
        log.onLine?.((line: string) => this.toast(line));
    }

    createAll() {
        if (this.destroyed || this.updateHandler) return;
        this.scene.events.once('shutdown', this.shutdownHandler);
        this.scene.events.once('destroy', this.shutdownHandler);
        this.createPlayerPlate();
        this.createTurnRibbon();
        this.createToolbar();
        this.createPiles();
        this.createActions();
        this.createDropHint();
        this.updateHandler = (_t, delta) => this.tick(Math.min(delta, 100) / 1000);
        this.scene.events.on('update', this.updateHandler);
        this.scene.input.on('dragstart', this.onDragStart, this);
        this.scene.input.on('dragend', this.onDragEnd, this);
        this.tick(0);
    }

    // ------------------------------------------------------------------ building blocks
    private track<T extends GameObjects.GameObject>(o: T): T { this.objs.push(o); return o; }

    private button(x: number, y: number, w: number, h: number, label: string, style: PanelStyle, size: number, onClick: () => void, depth = 200): HudButton {
        const scene = this.scene;
        const c = this.track(scene.add.container(x, y).setDepth(depth));
        const g = scene.add.graphics().setPosition(-w / 2, -h / 2);
        let current = style;
        let enabled = true;
        const draw = (hot = false) => {
            g.clear();
            const s = enabled ? current : { ...current, fill: C.night, border: C.haze, hi: C.mist, lo: C.ink, stud: null };
            drawPixelFrame(g, w, h, hot && enabled ? { ...s, border: C.gold, hi: C.glow } : s);
        };
        const text = txt(scene, 0, 0, label, size, C.paper, { align: 'center', stroke: hex(C.void), strokeThickness: 4 }).setOrigin(0.5);
        c.add([g, text]);
        draw();
        c.setSize(w, h);
        c.setInteractive({ useHandCursor: true });
        c.on('pointerover', () => { if (!enabled) return; draw(true); scene.tweens.add({ targets: c, y: y - 3, duration: 90 }); });
        c.on('pointerout', () => { draw(); scene.tweens.add({ targets: c, y, duration: 90 }); });
        c.on('pointerdown', () => { if (!enabled) return; scene.tweens.add({ targets: c, y: y + 3, duration: 50, yoyo: true }); onClick(); });
        return {
            container: c,
            setEnabled(on) { enabled = on; text.setAlpha(on ? 1 : 0.55); draw(); (c.input as Phaser.Types.Input.InteractiveObject).cursor = on ? 'pointer' : 'default'; },
            setLabel(t) { text.setText(t); },
            setStyle(s) { current = s; draw(); },
        };
    }

    // ------------------------------------------------------------------ player plate
    private createPlayerPlate() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        this.track(pixelPanel(s, 250, 66, 452, 100, PANEL_INK).setDepth(d));
        const heart = this.track(s.add.image(66, 62, iconTexture(s, 'heart')).setScale(4).setDepth(d + 1));
        s.tweens.add({ targets: heart, scale: 4.5, duration: 620, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.track(txt(s, 106, 36, '命元', 12, C.mist).setDepth(d + 1));
        this.hpNumber = this.track(txt(s, 106, 62, '', 36, C.paper, { stroke: hex(C.void), strokeThickness: 6 }).setOrigin(0, 0.5).setDepth(d + 2));
        this.hpBar = this.track(s.add.graphics().setPosition(196, 42).setDepth(d + 1));
        this.chips = this.track(txt(s, 106, 90, '', 12, C.fog).setOrigin(0, 0.5).setDepth(d + 1));
    }

    private drawHp(dt: number) {
        const hp = this.battleState.playerHealth;
        this.hpMax = Math.max(this.hpMax, hp);
        if (this.hpShown < 0) { this.hpShown = hp; this.hpGhost = hp; }
        if (hp < this.hpShown) { this.hpShake = 0.35; this.hpShown = hp; }
        else if (hp > this.hpShown) this.hpShown = Math.min(hp, this.hpShown + this.hpMax * dt * 0.6);
        this.hpGhost = this.hpGhost > this.hpShown ? Math.max(this.hpShown, this.hpGhost - this.hpMax * dt * 0.35) : this.hpShown;
        this.hpShake = Math.max(0, this.hpShake - dt);
        const w = 236, h = 30;
        drawPixelBar(this.hpBar, w, h, this.hpGhost / this.hpMax, C.gold, C.pine, 20);
        const inner = w - PX * 2;
        const real = Math.round(inner * Math.min(1, this.hpShown / this.hpMax) / 4) * 4;
        this.hpBar.fillStyle(hp / this.hpMax < 0.3 ? C.cinnabar : C.celadon, 1).fillRect(PX, PX, real, h - PX * 2);
        this.hpBar.fillStyle(C.paper, 0.32).fillRect(PX, PX, real, PX / 2);
        this.hpBar.setX(196 + (this.hpShake > 0 ? Math.round((Math.random() - 0.5) * 8) : 0));
        this.hpNumber.setText(`${Math.ceil(this.hpShown)}`);
        this.hpNumber.setColor(hp / this.hpMax < 0.3 ? hex(C.cinnabar) : hex(C.paper));
    }

    // ------------------------------------------------------------------ turn ribbon
    private createTurnRibbon() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        const w = this.scene.scale.width;
        this.turnPanel = this.track(s.add.graphics().setPosition(w / 2 - 220, 14).setDepth(d));
        this.turnText = this.track(txt(s, w / 2, 38, '', 24, C.gold, { stroke: hex(C.void), strokeThickness: 5 }).setOrigin(0.5).setDepth(d + 1));
        this.turnSub = this.track(txt(s, w / 2, 62, '', 12, C.fog).setOrigin(0.5).setDepth(d + 1));
        this.drawTurnPanel(true);
    }

    private drawTurnPanel(player: boolean) {
        this.turnPanel.clear();
        drawPixelFrame(this.turnPanel, 440, 72, { ...(player ? PANEL_JADE : PANEL_BLOOD) });
    }

    // ------------------------------------------------------------------ toolbar
    private createToolbar() {
        const w = this.scene.scale.width;
        const y = 54;
        const log = this.button(w - 60, y, 84, 72, '日志', PANEL_INK, 24, () => this.logToggle?.());
        this.speedButton = this.button(w - 156, y, 84, 72, `x${this.battleState.gameSpeed}`, PANEL_INK, 36, () => {
            this.cb.onToggleSpeed?.();
            this.speedButton.setLabel(`x${this.battleState.gameSpeed}`);
        });
        this.button(w - 252, y, 84, 72, '视角', PANEL_INK, 24, () => getWenxinBattleStage(this.scene)?.resetPlayerCamera());
        void log;
    }

    // ------------------------------------------------------------------ piles
    private createPiles() {
        const make = (cfg: { x: number; y: number; width: number; height: number }, title: string, accent: number, onClick: () => void) => {
            const s = this.scene;
            const d = this.layout.depth.uiButtons;
            const c = this.track(s.add.container(cfg.x, cfg.y).setDepth(d));
            const backKey = s.textures.exists('wenxin:back') ? 'wenxin:back' : undefined;
            for (let i = 2; i >= 0; i--) {
                if (backKey) c.add(s.add.image(i * -3, i * 3, backKey).setDisplaySize(cfg.width - 14, cfg.height - 34).setAngle(i === 0 ? 0 : (i % 2 ? -2 : 2)));
                else c.add(s.add.rectangle(i * -3, i * 3, cfg.width - 14, cfg.height - 34, C.olive).setStrokeStyle(3, accent));
            }
            const badge = s.add.graphics().setPosition(-cfg.width / 2 - 4, cfg.height / 2 - 40);
            drawPixelFrame(badge, cfg.width + 8, 40, { fill: C.void, edge: C.void, border: accent, hi: accent, lo: C.ink, stud: null, shadow: false });
            const label = txt(s, -cfg.width / 2 + 16, cfg.height / 2 - 20, title, 12, C.fog).setOrigin(0, 0.5);
            const count = txt(s, cfg.width / 2 - 10, cfg.height / 2 - 20, '0', 24, accent, { stroke: hex(C.void), strokeThickness: 4 }).setOrigin(1, 0.5);
            c.add([badge, label, count]);
            c.setSize(cfg.width, cfg.height);
            c.setInteractive({ useHandCursor: true });
            c.on('pointerover', () => s.tweens.add({ targets: c, y: cfg.y - 6, duration: 100 }));
            c.on('pointerout', () => s.tweens.add({ targets: c, y: cfg.y, duration: 100 }));
            c.on('pointerdown', onClick);
            return { c, count };
        };
        const deck = make(this.layout.deckButton, '牌库', C.celadon, () => this.cb.onShowDeck?.());
        const discard = make(this.layout.discardPileButton, '弃堆', C.petal, () => this.cb.onShowDiscardPile?.());
        this.deckPile = deck.c; this.deckCount = deck.count;
        this.discardPile = discard.c; this.discardCount = discard.count;
    }

    // ------------------------------------------------------------------ actions
    private createActions() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        const draw = this.layout.drawButton;
        this.button(draw.x, draw.y, draw.width, draw.height, '抽卡', PANEL_INK, 24, () => this.cb.onDrawCard?.(), d);
        const end = this.layout.endTurnButton;
        this.endGlow = this.track(s.add.rectangle(end.x, end.y, end.width + 28, end.height + 28, C.glow, 0.0).setDepth(d - 1).setBlendMode(Phaser.BlendModes.ADD));
        s.tweens.add({ targets: this.endGlow, fillAlpha: { from: 0.05, to: 0.28 }, scale: { from: 0.96, to: 1.08 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.endButton = this.button(end.x, end.y, end.width, end.height, '结束\n回合', PANEL_BLOOD, 36, () => this.cb.onEndTurn?.(), d + 1);
    }

    // ------------------------------------------------------------------ drop hints
    private createDropHint() {
        this.dropHint = this.track(this.scene.add.graphics().setDepth(45));
    }
    private onDragStart(_p: Phaser.Input.Pointer, obj: GameObjects.GameObject) {
        const card = obj as GameObjects.GameObject & { getCardData?: () => { kind?: string } };
        if (card.getCardData?.().kind === 'unit') this.dropActive = true;
    }
    private onDragEnd() { this.dropActive = false; this.dropHint.clear(); }

    private drawDropHint(time: number) {
        const g = this.dropHint;
        g.clear();
        if (!this.dropActive) return;
        const stage = getWenxinBattleStage(this.scene);
        if (!stage) return;
        const used = this.battleState.playerField.length;
        const pulse = 0.55 + Math.sin(time / 180) * 0.25;
        for (let i = 0; i < 3; i++) {
            const p = stage.slotScreen('me', i);
            const next = i === used;
            const taken = i < used;
            g.lineStyle(next ? 6 : 4, next ? C.glow : taken ? C.mist : C.celadon, next ? 0.55 + pulse * 0.45 : taken ? 0.35 : 0.55);
            g.strokeEllipse(p.x, p.y, next ? 230 : 190, next ? 62 : 50);
            if (next) {
                g.fillStyle(C.glow, 0.14 * pulse);
                g.fillEllipse(p.x, p.y, 230, 62);
                g.fillStyle(C.glow, 0.9);
                const ay = p.y - 200 - Math.sin(time / 140) * 8;
                g.fillTriangle(p.x - 20, ay, p.x + 20, ay, p.x, ay + 26);
            }
        }
    }

    // ------------------------------------------------------------------ toasts
    private toast(line: string) {
        if (this.destroyed) return;
        const clean = line.replace(/<\/?GONGFA>/g, '').replace(/^═+\s*|\s*═+$/g, '');
        if (!clean.trim()) return;
        const s = this.scene;
        const box = s.add.container(24, 150).setDepth(this.layout.depth.uiText);
        const t = txt(s, 12, 0, clean.length > 30 ? clean.slice(0, 29) + '…' : clean, 12, C.paper).setOrigin(0, 0.5);
        const bg = s.add.rectangle(0, 0, t.width + 24, 28, C.void, 0.62).setOrigin(0, 0.5);
        const bar = s.add.rectangle(0, 0, 4, 28, C.gold).setOrigin(0, 0.5);
        box.add([bg, bar, t]);
        box.setAlpha(0).setX(0);
        this.toasts.forEach(o => s.tweens.add({ targets: o.box, y: o.box.y + 34, duration: 160 }));
        s.tweens.add({ targets: box, alpha: 1, x: 24, duration: 200, ease: 'Cubic.easeOut' });
        this.toasts.unshift({ box, born: s.time.now });
        while (this.toasts.length > 4) this.toasts.pop()!.box.destroy();
    }

    // ------------------------------------------------------------------ frame update
    private tick(dt: number) {
        if (this.destroyed || !this.hpNumber?.active) return;
        const st = this.battleState;
        this.drawHp(dt);
        this.chips.setText(`手牌 ${st.getHandCount()}  ·  牌库 ${st.getDeckCount()}  ·  我阵 ${st.playerField.length}/3  ·  敌阵 ${st.enemyField.length}`);
        this.deckCount.setText(`${st.getDeckCount()}`);
        this.discardCount.setText(`${st.getDiscardPileCount()}`);

        const player = st.isPlayerTurn;
        this.turnText.setText(`第 ${st.turnNumber} 回合`);
        this.turnSub.setText(player ? '我方执手 · 布阵、催动、结束回合' : '敌方行动 · 静观其变');
        this.turnText.setColor(player ? hex(C.gold) : hex(C.ember));
        if (this.turnWasPlayer !== player) {
            this.turnWasPlayer = player;
            this.drawTurnPanel(player);
            this.scene.tweens.add({ targets: [this.turnText, this.turnSub], scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        }
        const canEnd = player && !st.isProcessingTurn;
        this.endButton.setEnabled(canEnd);
        this.endGlow.setVisible(canEnd);
        this.endButton.setLabel(canEnd ? '结束\n回合' : player ? '结算\n中…' : '敌方\n行动');

        this.drawDropHint(this.scene.time.now);
        const now = this.scene.time.now;
        for (let i = this.toasts.length - 1; i >= 0; i--) {
            const o = this.toasts[i];
            if (now - o.born > 4200) { this.scene.tweens.add({ targets: o.box, alpha: 0, duration: 260, onComplete: () => o.box.destroy() }); this.toasts.splice(i, 1); }
        }
    }

    /** Pile centres, for card fly animations. */
    getDeckAnchor() { return { x: this.deckPile.x, y: this.deckPile.y }; }
    getDiscardAnchor() { return { x: this.discardPile.x, y: this.discardPile.y }; }

    // compat with the legacy manager
    updateDeckCount() {}
    updateDiscardPileCount() {}

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        if (this.updateHandler) this.scene.events.off('update', this.updateHandler);
        this.updateHandler = undefined;
        this.scene.events.off('shutdown', this.shutdownHandler);
        this.scene.events.off('destroy', this.shutdownHandler);
        this.scene.input.off('dragstart', this.onDragStart, this);
        this.scene.input.off('dragend', this.onDragEnd, this);
        for (const object of [...this.toasts.map(t => t.box), ...this.objs]) {
            this.scene.tweens.killTweensOf(object);
            object.destroy();
        }
        this.toasts = [];
        this.objs.length = 0;
        this.cb = {};
        this.logToggle = undefined;
    }
}
