import { GameObjects, type Scene } from 'phaser';

import { INK, PX } from '../../../art/palette';
import { bake, snap } from '../../../art/pix';
import { paintCardBack } from '../../../art/cardArt';
import { addIcon } from '../../../art/icons';
import { clip, numberFont, panel, pbutton, piconButton, ptext, type PButton } from '../../../art/kit';
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


/**
 * Landscape battle HUD. Everything that is not the diorama or the hand lives on the edges:
 * health top-left, turn ribbon top-centre, tools top-right, piles flanking the hand,
 * a single seal-shaped "end turn" on the right. Nothing sits in the middle of the fight.
 */
export class BattleHud {
    private readonly objs: GameObjects.GameObject[] = [];
    private cb: HudCallbacks = {};
    private hpBar!: GameObjects.Graphics;
    private hpNumber!: GameObjects.BitmapText;
    private turnText!: GameObjects.Text;
    private turnPanel!: GameObjects.Container;
    private turnWasPlayer: boolean | null = null;
    private speedButton!: PButton;
    private endButton!: PButton;
    private endGlow!: GameObjects.Rectangle;
    private endState = '';
    private deckCount!: GameObjects.BitmapText;
    private discardCount!: GameObjects.BitmapText;
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

    // ------------------------------------------------------------------ player plate
    private createPlayerPlate() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        this.track(panel(s, PX * 90, PX * 18, PX * 172, PX * 28, 'ink').setDepth(d));
        const heart = this.track(addIcon(s, PX * 18, PX * 18, 'heart', 2).setDepth(d + 1));
        s.tweens.add({ targets: heart, scale: PX * 2.4, duration: 620, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.hpBar = this.track(s.add.graphics().setPosition(PX * 34, PX * 12).setDepth(d + 1));
        this.hpNumber = this.track(s.add.bitmapText(PX * 170, PX * 18, numberFont(s, INK.paper), '').setOrigin(1, 0.5).setScale(PX * 2).setDepth(d + 2));
        this.hpNumber.setLetterSpacing(-1);
    }

    private drawHp(dt: number) {
        const hp = this.battleState.playerHealth;
        this.hpMax = Math.max(this.hpMax, hp);
        if (this.hpShown < 0) { this.hpShown = hp; this.hpGhost = hp; }
        if (hp < this.hpShown) { this.hpShake = 0.35; this.hpShown = hp; }
        else if (hp > this.hpShown) this.hpShown = Math.min(hp, this.hpShown + this.hpMax * dt * 0.6);
        this.hpGhost = this.hpGhost > this.hpShown ? Math.max(this.hpShown, this.hpGhost - this.hpMax * dt * 0.35) : this.hpShown;
        this.hpShake = Math.max(0, this.hpShake - dt);
        const w = PX * 90, h = PX * 12;
        const g = this.hpBar;
        g.clear();
        g.fillStyle(INK.void, 1).fillRect(0, 0, w, h);
        g.fillStyle(INK.ink, 1).fillRect(PX, PX, w - PX * 2, h - PX * 2);
        const inner = w - PX * 2;
        const ghost = snap(inner * Math.min(1, this.hpGhost / this.hpMax));
        const real = snap(inner * Math.min(1, this.hpShown / this.hpMax));
        g.fillStyle(INK.gold, 1).fillRect(PX, PX, ghost, h - PX * 2);
        g.fillStyle(hp / this.hpMax < 0.3 ? INK.vermilion : INK.cinnabar, 1).fillRect(PX, PX, real, h - PX * 2);
        g.fillStyle(INK.paper, 0.55).fillRect(PX, PX, real, PX);
        for (let x = PX * 12; x < w - PX; x += PX * 12) g.fillStyle(INK.void, 0.5).fillRect(x, PX, PX, h - PX * 2);
        this.hpBar.setX(PX * 34 + (this.hpShake > 0 ? snap((Math.random() - 0.5) * 12) : 0));
        this.hpNumber.setText(`${Math.ceil(this.hpShown)}`);
        this.hpNumber.setFont(numberFont(this.scene, hp / this.hpMax < 0.3 ? INK.vermilion : INK.paper));
    }

    // ------------------------------------------------------------------ turn ribbon
    private createTurnRibbon() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        const w = this.scene.scale.width;
        this.turnPanel = this.track(s.add.container(snap(w / 2), PX * 16).setDepth(d));
        this.turnText = ptext(s, 0, -PX, '', { color: INK.paper, origin: [0.5, 0.5] });
        this.drawTurnPanel(true);
    }

    private drawTurnPanel(player: boolean) {
        this.turnPanel.removeAll(false);
        const bg = panel(this.scene, 0, 0, PX * 84, PX * 22, player ? 'jade' : 'seal');
        this.turnPanel.add([bg, this.turnText]);
    }

    // ------------------------------------------------------------------ toolbar
    private createToolbar() {
        const w = this.scene.scale.width;
        const y = PX * 16;
        const d = this.layout.depth.uiButtons;
        this.track(piconButton(this.scene, w - PX * 16, y, 'book', () => this.logToggle?.(), 'slate').setDepth(d));
        this.speedButton = pbutton(this.scene, { x: w - PX * 52, y, width: PX * 40, height: PX * 24, icon: 'fast', label: `${this.battleState.gameSpeed}`, style: 'slate', onClick: () => {
            this.cb.onToggleSpeed?.();
            this.speedButton.setLabel(`${this.battleState.gameSpeed}`);
        } }).setDepth(d);
        this.track(this.speedButton);
        this.track(piconButton(this.scene, w - PX * 88, y, 'eye', () => getWenxinBattleStage(this.scene)?.resetPlayerCamera(), 'slate').setDepth(d));
    }

    // ------------------------------------------------------------------ piles
    private createPiles() {
        const make = (cfg: { x: number; y: number; width: number; height: number }, title: string, accent: number, onClick: () => void) => {
            const s = this.scene;
            const d = this.layout.depth.uiButtons;
            const c = this.track(s.add.container(snap(cfg.x), snap(cfg.y)).setDepth(d));
            const back = bake(s, 'px:cardback-mini', () => paintCardBack(34, 48));
            for (let i = 2; i >= 0; i--) c.add(s.add.image(-i * PX, i * PX - PX * 4, back).setScale(PX));
            const badge = panel(s, 0, PX * 28, PX * 38, PX * 16, 'ink');
            const label = ptext(s, -PX * 8, PX * 27, title, { color: accent, origin: [0.5, 0.5] });
            const count = s.add.bitmapText(PX * 11, PX * 27, numberFont(s, INK.paper), '0').setOrigin(0.5).setScale(PX);
            count.setLetterSpacing(-1);
            c.add([badge, label, count]);
            c.setSize(PX * 44, PX * 70);
            c.setInteractive({ useHandCursor: true });
            c.on('pointerover', () => s.tweens.add({ targets: c, y: snap(cfg.y) - PX * 2, duration: 80, ease: 'Stepped', easeParams: [2] }));
            c.on('pointerout', () => s.tweens.add({ targets: c, y: snap(cfg.y), duration: 80, ease: 'Stepped', easeParams: [2] }));
            c.on('pointerdown', onClick);
            return { c, count };
        };
        const deck = make(this.layout.deckButton, '库', INK.spirit, () => this.cb.onShowDeck?.());
        const discard = make(this.layout.discardPileButton, '弃', INK.vermilion, () => this.cb.onShowDiscardPile?.());
        this.deckPile = deck.c; this.deckCount = deck.count;
        this.discardPile = discard.c; this.discardCount = discard.count;
    }

    // ------------------------------------------------------------------ actions
    private createActions() {
        const s = this.scene;
        const d = this.layout.depth.uiButtons;
        const draw = this.layout.drawButton;
        this.track(pbutton(s, { x: draw.x, y: draw.y, width: PX * 48, height: PX * 20, icon: 'card', label: '抽卡', style: 'slate', onClick: () => this.cb.onDrawCard?.() }).setDepth(d));
        const end = this.layout.endTurnButton;
        this.endGlow = this.track(s.add.rectangle(snap(end.x), snap(end.y) - PX, PX * 62, PX * 34).setStrokeStyle(PX, INK.gold, 1).setDepth(d - 1));
        s.tweens.add({ targets: this.endGlow, scale: { from: 1, to: 1.12 }, alpha: { from: 1, to: 0 }, duration: 900, repeat: -1, ease: 'Stepped', easeParams: [4] });
        this.endButton = pbutton(s, { x: end.x, y: end.y, width: PX * 58, height: PX * 30, label: '结束回合', style: 'seal', cursor: true, onClick: () => this.cb.onEndTurn?.() }).setDepth(d + 1);
        this.track(this.endButton);
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
        const pulse = Math.floor(time / 200) % 2;
        for (let i = 0; i < 3; i++) {
            const p = stage.slotScreen('me', i);
            const next = i === used;
            const taken = i < used;
            g.lineStyle(PX, next ? INK.gold : taken ? INK.ash : INK.spirit, 1);
            g.strokeEllipse(p.x, p.y, next ? 228 + pulse * 12 : 192, next ? 60 + pulse * 3 : 48);
            if (next) {
                g.fillStyle(INK.gold, 1);
                const ay = snap(p.y - 210 - pulse * 9);
                g.fillTriangle(p.x - 18, ay, p.x + 18, ay, p.x, ay + 24);
            }
        }
    }

    // ------------------------------------------------------------------ toasts
    private toast(line: string) {
        if (this.destroyed) return;
        const clean = line.replace(/<\/?GONGFA>/g, '').replace(/^═+\s*|\s*═+$/g, '');
        if (!clean.trim()) return;
        const s = this.scene;
        const box = s.add.container(0, PX * 44).setDepth(this.layout.depth.uiText);
        const t = ptext(s, PX * 6, 0, clip(clean, 16), { color: INK.bone, origin: [0, 0.5], fx: 'outline' });
        const bar = s.add.rectangle(PX, 0, PX, PX * 12, INK.gold).setOrigin(0, 0.5);
        box.add([bar, t]);
        box.setAlpha(0).setX(-PX * 10);
        this.toasts.forEach(o => s.tweens.add({ targets: o.box, y: o.box.y + PX * 14, duration: 120, ease: 'Stepped', easeParams: [2] }));
        s.tweens.add({ targets: box, alpha: 1, x: PX * 6, duration: 160, ease: 'Stepped', easeParams: [3] });
        this.toasts.unshift({ box, born: s.time.now });
        while (this.toasts.length > 3) this.toasts.pop()!.box.destroy();
    }

    // ------------------------------------------------------------------ frame update
    private tick(dt: number) {
        if (this.destroyed || !this.hpNumber?.active) return;
        const st = this.battleState;
        this.drawHp(dt);
        this.deckCount.setText(`${st.getDeckCount()}`);
        this.discardCount.setText(`${st.getDiscardPileCount()}`);

        const player = st.isPlayerTurn;
        this.turnText.setText(`${player ? '我方' : '敌方'} · 第${st.turnNumber}回合`);
        if (this.turnWasPlayer !== player) {
            this.turnWasPlayer = player;
            this.drawTurnPanel(player);
            this.scene.tweens.add({ targets: this.turnPanel, scale: { from: 1.3, to: 1 }, duration: 220, ease: 'Stepped', easeParams: [4] });
        }
        const canEnd = player && !st.isProcessingTurn;
        const state = canEnd ? 'end' : player ? 'busy' : 'foe';
        if (state !== this.endState) {
            this.endState = state;
            this.endButton.setEnabled(canEnd);
            this.endButton.setLabel(canEnd ? '结束回合' : player ? '结算中…' : '敌方行动');
            this.endGlow.setVisible(canEnd);
        }

        this.drawDropHint(this.scene.time.now);
        const now = this.scene.time.now;
        for (let i = this.toasts.length - 1; i >= 0; i--) {
            const o = this.toasts[i];
            if (now - o.born > 3600) { this.scene.tweens.add({ targets: o.box, alpha: 0, duration: 200, onComplete: () => o.box.destroy() }); this.toasts.splice(i, 1); }
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
