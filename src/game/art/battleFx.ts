import Phaser from 'phaser';
import type { WenxinBattleStage } from './wenxin/WenxinBattleStage';
import type { WenxinUnitView } from './wenxin/WenxinUnitView';
import { C, FONT, hex, PX } from './palette';
import { pxBurst, pxRing } from './fx';

const snap = (v: number, u = PX) => Math.round(v / u) * u;
let snapSerial = 0;

/**
 * Battle-only effects: everything that makes a hit feel heavy, a summon feel earned and a kill feel final.
 * All shapes are hard-edged squares/rings so they stay inside the pixel language.
 */
export class BattleFx {
    private motes: Array<{ o: Phaser.GameObjects.Rectangle; vx: number; vy: number; life: number; max: number }> = [];
    private moteTimer = 0;
    private shafts?: Phaser.GameObjects.Graphics;
    private hitStopUntil = 0;

    constructor(private readonly scene: Phaser.Scene, _stage: WenxinBattleStage) {
        this.buildLightShafts();
    }

    // ---------------------------------------------------------------- ambience
    private buildLightShafts() {
        const { width, height } = this.scene.scale;
        const g = this.scene.add.graphics().setDepth(-8).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
        for (let i = 0; i < 5; i++) {
            const x = width * (0.12 + i * 0.2);
            g.fillStyle(C.glow, 0.05 + (i % 2) * 0.02);
            g.beginPath();
            g.moveTo(x, 0); g.lineTo(x + 90, 0); g.lineTo(x + 420, height * 0.78); g.lineTo(x + 250, height * 0.78);
            g.closePath(); g.fillPath();
        }
        this.shafts = g;
        this.scene.tweens.add({ targets: g, alpha: 0.28, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    update(dt: number) {
        const { width, height } = this.scene.scale;
        this.moteTimer -= dt;
        if (this.moteTimer <= 0 && this.motes.length < 40) {
            this.moteTimer = 0.28 + Math.random() * 0.3;
            const size = Math.random() < 0.25 ? 8 : 4;
            const o = this.scene.add.rectangle(snap(Math.random() * width), snap(height * (0.45 + Math.random() * 0.5)), size, size,
                [C.glow, C.parchment, C.celadon][Math.floor(Math.random() * 3)], 0.9).setDepth(-7).setBlendMode(Phaser.BlendModes.ADD);
            this.motes.push({ o, vx: (Math.random() - 0.5) * 12, vy: -(10 + Math.random() * 18), life: 0, max: 5 + Math.random() * 4 });
        }
        for (let i = this.motes.length - 1; i >= 0; i--) {
            const m = this.motes[i];
            m.life += dt;
            m.o.x = snap(m.o.x + m.vx * dt, 2); m.o.y = snap(m.o.y + m.vy * dt, 2);
            m.o.setAlpha(Math.sin((m.life / m.max) * Math.PI) * 0.8);
            if (m.life >= m.max) { m.o.destroy(); this.motes.splice(i, 1); }
        }
    }

    destroy() {
        this.motes.forEach(m => m.o.destroy()); this.motes = [];
        this.shafts?.destroy();
    }

    // ---------------------------------------------------------------- summon
    summonBurst(x: number, y: number, unit: boolean) {
        const s = this.scene;
        // ground seal: two counter-rotating squashed rings
        const seal = s.add.graphics().setDepth(38).setPosition(x, y).setScale(1, 0.32).setBlendMode(Phaser.BlendModes.ADD);
        const drawSeal = (r: number, rot: number, a: number) => {
            seal.clear();
            seal.lineStyle(PX, C.glow, a);
            seal.strokeCircle(0, 0, r);
            seal.lineStyle(PX, C.parchment, a * 0.8);
            seal.strokeCircle(0, 0, r * 0.68);
            seal.fillStyle(C.glow, a);
            for (let i = 0; i < 8; i++) {
                const ang = rot + (i / 8) * Math.PI * 2;
                seal.fillRect(snap(Math.cos(ang) * r) - 4, snap(Math.sin(ang) * r) - 4, 8, 8);
            }
        };
        const st = { r: 40, a: 1, rot: 0 };
        s.tweens.add({ targets: st, r: 180, a: 0, rot: 1.6, duration: 800, ease: 'Cubic.easeOut', onUpdate: () => drawSeal(st.r, st.rot, st.a), onComplete: () => seal.destroy() });
        // pillar of light
        const pillar = s.add.rectangle(x, y - 210, 96, 420, C.glow, 0.0).setDepth(39).setBlendMode(Phaser.BlendModes.ADD);
        s.tweens.add({ targets: pillar, fillAlpha: { from: 0.55, to: 0 }, scaleX: { from: 1, to: 0.15 }, duration: 620, ease: 'Cubic.easeOut', onComplete: () => pillar.destroy() });
        pxBurst(s, x, y - 60, { colors: [C.glow, C.paper, C.celadon], count: unit ? 22 : 12, speed: 300, size: 10, gravity: -60, life: 700, depth: 100, spread: Math.PI });
        pxRing(s, x, y - 6, C.parchment, 200, 99);
    }

    // ---------------------------------------------------------------- combat
    damageNumber(x: number, y: number, dmg: number, blocked: boolean) {
        const s = this.scene;
        const text = blocked ? '挡' : `-${dmg}`;
        const color = blocked ? C.mist : dmg >= 8 ? C.glow : C.paper;
        const t = s.add.text(snap(x), snap(y), text, {
            fontFamily: FONT, fontSize: blocked ? '48px' : dmg >= 8 ? '96px' : '72px', color: hex(color), stroke: hex(C.void), strokeThickness: 10,
        }).setOrigin(0.5).setDepth(3100).setScale(2.2).setAngle((Math.random() - 0.5) * 10);
        s.tweens.add({
            targets: t, scale: 1, duration: 130, ease: 'Back.easeOut',
            onComplete: () => s.tweens.add({ targets: t, y: t.y - 70, alpha: 0, duration: 520, delay: 320, ease: 'Quad.easeIn', onComplete: () => t.destroy() }),
        });
        if (!blocked && dmg > 0) {
            // cinnabar blood-ink drops under the number
            pxBurst(s, x, y + 20, { colors: [C.cinnabar, C.crimson, C.blood], count: 8, speed: 140, size: 8, gravity: 420, life: 520, depth: 3090, spread: Math.PI * 0.9, angle: -Math.PI / 2 });
        }
    }

    impact(x: number, y: number, color: number, power: number, swords: boolean) {
        const s = this.scene;
        // starburst: 8 hard rays
        const star = s.add.graphics().setDepth(3050).setPosition(x, y).setBlendMode(Phaser.BlendModes.ADD);
        const st = { len: 30, a: 1 };
        const drawStar = () => {
            star.clear();
            star.fillStyle(color, st.a);
            for (let i = 0; i < 8; i++) {
                const ang = (i / 8) * Math.PI * 2 + 0.2;
                const len = st.len * (i % 2 ? 0.55 : 1);
                star.beginPath();
                star.moveTo(0, 0);
                star.lineTo(Math.cos(ang - 0.14) * len, Math.sin(ang - 0.14) * len);
                star.lineTo(Math.cos(ang + 0.14) * len, Math.sin(ang + 0.14) * len);
                star.closePath(); star.fillPath();
            }
        };
        drawStar();
        s.tweens.add({ targets: st, len: 150 * power + 60, a: 0, duration: 260, ease: 'Expo.easeOut', onUpdate: drawStar, onComplete: () => star.destroy() });
        pxRing(s, x, y, C.paper, 120 * power + 60, 3049);
        pxBurst(s, x, y, { colors: [color, C.paper, C.glow, C.cinnabar], count: Math.round(14 + power * 10), speed: 320 * power + 120, size: 10, life: 480, depth: 3048 });
        // crescent slash (or sword rain for the sage)
        if (swords) {
            for (let i = 0; i < 9; i++) {
                const sw = s.add.rectangle(x + (i - 4) * 26 - 90, y - 320 - i * 14, 6, 84, C.glow).setAngle(-24).setDepth(3040).setBlendMode(Phaser.BlendModes.ADD);
                const tail = s.add.rectangle(sw.x - 10, sw.y - 40, 4, 60, C.paper, 0.5).setAngle(-24).setDepth(3039);
                s.tweens.add({
                    targets: [sw, tail], x: `+=${100}`, y: y + 44, alpha: 0, duration: 230 + i * 26, delay: i * 10, ease: 'Quad.easeIn',
                    onComplete: () => { sw.destroy(); tail.destroy(); },
                });
            }
        } else {
            const g = s.add.graphics().setDepth(3047).setPosition(x, y).setRotation(-0.5 + Math.random() * 0.3).setBlendMode(Phaser.BlendModes.ADD);
            const c = { t: 0, a: 1 };
            const drawCrescent = () => {
                g.clear();
                const R = 130 + power * 40;
                for (let k = 0; k < 14; k++) {
                    const u = k / 13;
                    if (u > c.t) break;
                    const ang = -1.15 + u * 2.3;
                    const width = Math.sin(u * Math.PI) * 26 + 4;
                    g.fillStyle(u > 0.85 ? color : C.paper, c.a);
                    g.fillRect(snap(Math.cos(ang) * R) - width / 2, snap(Math.sin(ang) * R) - 6, snap(width, 2) || 4, 12);
                }
            };
            s.tweens.add({ targets: c, t: 1, duration: 90, ease: 'Quad.easeOut', onUpdate: drawCrescent, onComplete: () => {
                s.tweens.add({ targets: c, a: 0, duration: 200, onUpdate: drawCrescent, onComplete: () => g.destroy() });
            } });
        }
    }

    deathBurst(x: number, y: number) {
        const s = this.scene;
        pxBurst(s, x, y, { colors: [C.paper, C.mist, C.haze, C.dusk, C.void], count: 42, speed: 420, size: 14, gravity: 140, life: 900, depth: 3040 });
        pxRing(s, x, y, C.paper, 260, 3041);
        // ink splash on the ground
        const ink = s.add.ellipse(x, y + 100, 20, 8, C.void, 0.6).setDepth(37);
        s.tweens.add({ targets: ink, scaleX: 9, scaleY: 6, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => ink.destroy() });
    }

    qiGather(x: number, y: number, color: number) {
        const s = this.scene;
        for (let i = 0; i < 18; i++) {
            const ang = Math.random() * Math.PI * 2;
            const r = 160 + Math.random() * 120;
            const p = s.add.rectangle(snap(x + Math.cos(ang) * r), snap(y + Math.sin(ang) * r * 0.7), 8, 8, color, 0.95).setDepth(3030).setBlendMode(Phaser.BlendModes.ADD);
            s.tweens.add({ targets: p, x: snap(x), y: snap(y), scale: 0.3, alpha: 0.2, duration: 420 + Math.random() * 160, delay: i * 14, ease: 'Cubic.easeIn', onComplete: () => p.destroy() });
        }
    }

    speedLines(x: number, y: number, dir: number) {
        const s = this.scene;
        for (let i = 0; i < 10; i++) {
            const len = 120 + Math.random() * 180;
            const l = s.add.rectangle(snap(x - dir * (20 + Math.random() * 80)), snap(y + (Math.random() - 0.5) * 180), len, 4, C.paper, 0.85)
                .setOrigin(dir > 0 ? 1 : 0, 0.5).setDepth(3020).setBlendMode(Phaser.BlendModes.ADD);
            s.tweens.add({ targets: l, scaleX: 0.1, alpha: 0, x: l.x - dir * 90, duration: 240 + Math.random() * 120, ease: 'Quad.easeOut', onComplete: () => l.destroy() });
        }
    }

    afterimage(view: WenxinUnitView, at: { x: number; y: number }) {
        const snapshot = view.snapshot();
        if (!snapshot) return;
        const key = `afterimage:${++snapSerial}`;
        this.scene.textures.addCanvas(key, snapshot.canvas);
        const img = this.scene.add.image(at.x, at.y, key).setOrigin(snapshot.ox, snapshot.oy).setScale(snapshot.scale).setFlipX(snapshot.flip)
            .setDepth(view.parentContainer ? (view.parentContainer as Phaser.GameObjects.Container).depth - 1 : 80).setAlpha(0.55).setTintFill(C.glow);
        this.scene.tweens.add({
            targets: img, alpha: 0, duration: 300, ease: 'Quad.easeOut',
            onComplete: () => { img.destroy(); this.scene.textures.remove(key); },
        });
    }

    /** Freeze-frame: only tweens are slowed so HUD input stays responsive. */
    hitStop(ms: number) {
        const scene = this.scene as Phaser.Scene & { battleState?: { gameSpeed: number } };
        const base = scene.battleState?.gameSpeed ?? 1;
        if (scene.tweens.timeScale < base * 0.9) return; // already in slow motion
        if (scene.time.now < this.hitStopUntil) return;
        this.hitStopUntil = scene.time.now + ms + 120;
        scene.tweens.timeScale = base * 0.02;
        window.setTimeout(() => {
            if (scene.sys.isActive()) scene.tweens.timeScale = base;
        }, ms);
    }
}
