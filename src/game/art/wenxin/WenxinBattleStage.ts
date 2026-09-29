import { type Textures, type Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import { NEAREST, getWenxinMaterials, pixelSurface } from './WenxinArt';
import { BATTLE_SLOTS, slotPosition, type BattleSide } from './presentation';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import { wenxinCardTexture } from './WenxinArt';
import { C } from '../palette';
import { BattleFx } from '../battleFx';

const stages = new WeakMap<Scene, WenxinBattleStage>();
export function getWenxinBattleStage(scene: Scene) { return stages.get(scene); }
type Tween = (config: Phaser.Types.Tweens.TweenBuilderConfig) => Phaser.Tweens.Tween;
let serial = 0;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * The battle diorama and its virtual camera.
 *
 * The camera is a small rig, not a single number: an authored layer (cinematic focus, driven by the
 * fight), a player layer (wheel zoom / drag pan) and ambient layers (pointer parallax, idle sway,
 * impact punch, shake). They are summed every frame, so a player nudging the view never fights a
 * cinematic move — they simply add.
 */
export class WenxinBattleStage {
    /** Effective camera in art units (640×360 space). Read by the floor painter and the unit views. */
    readonly camera = { x: 0, z: 0 };
    readonly fx: BattleFx;

    private readonly rig = {
        // authored (cinematic)
        ax: 0, az: 0, aTx: 0, aTz: 0,
        // player
        ux: 0, uz: 0, uTx: 0, uTz: 0,
        // ambient
        px: 0, sway: 0, punch: 0, shakeX: 0, shakeY: 0, shakeMag: 0, shakeUntil: 0,
        flash: 0, flashColor: '#eee4d3',
    };
    private readonly surface = pixelSurface(640, 360);
    private readonly art = getWenxinMaterials()!;
    private readonly floor = this.art.floor(BATTLE_SLOTS);
    private readonly sky = this.art.background('sky', 640, 120);
    private readonly sea = this.art.sea(1280, 100);
    private readonly bell = this.art.prop('bell', 96, 88);
    private readonly island = this.art.prop('island', 110, 72);
    private readonly cloud = this.art.prop('cloud', 150, 50);
    private readonly texture: Textures.CanvasTexture;
    private units = new Map<CardSprite, { side: BattleSide; slot: number }>();
    private elapsed = 0;
    private frame = -1;
    private activeAttacks = 0;
    private summonedAt = new WeakMap<CardSprite, number>();
    private focusTween?: Phaser.Tweens.Tween;
    private slowmoTimer?: number;
    private readonly scale: number;
    private readonly portrait: boolean;
    private dragging?: { x: number; ux: number };

    constructor(private readonly scene: Scene) {
        stages.set(scene, this);
        this.portrait = isPortraitGameViewport(scene.scale.width, scene.scale.height);
        this.scale = scene.scale.width / 640;
        this.texture = scene.textures.addCanvas(`wenxin:arena:${++serial}`, this.surface.o)!;
        this.texture.setFilter(NEAREST);
        scene.add.image(0, 0, this.texture.key).setOrigin(0).setDisplaySize(scene.scale.width, scene.scale.height).setDepth(-10);
        this.fx = new BattleFx(scene, this);
        scene.events.on('update', this.update, this);
        this.bindPlayerCamera();
        const cleanup = () => {
            scene.events.off('shutdown', cleanup);
            scene.events.off('destroy', cleanup);
            scene.events.off('update', this.update, this);
            scene.input.off('wheel', this.onWheel, this);
            scene.input.off('pointerdown', this.onPointerDown, this);
            scene.input.off('pointermove', this.onPointerMove, this);
            scene.input.off('pointerup', this.onPointerUp, this);
            scene.input.keyboard?.off('keydown-SPACE', this.resetPlayerCamera, this);
            scene.tweens.killTweensOf(this.rig);
            if (this.slowmoTimer) window.clearTimeout(this.slowmoTimer);
            this.fx.destroy();
            this.units.clear(); stages.delete(scene); scene.textures.remove(this.texture.key);
        };
        scene.events.once('shutdown', cleanup);
        scene.events.once('destroy', cleanup);
        this.update(0, 0);
    }

    // ------------------------------------------------------------------ projection helpers
    /** Screen-space position of a slot for the *current* camera (canvas px). */
    slotScreen(side: BattleSide, slot: number, lift = 0) {
        const p = slotPosition(side, slot, this.camera);
        return { x: p.x * this.scale, y: (p.y - lift * 0) * this.scale };
    }

    /** Current on-screen anchor (feet) of a unit. */
    unitScreen(card: CardSprite) {
        const view = card.battleView;
        return { x: card.x + (view?.x ?? 0), y: card.y + (view?.y ?? 0) };
    }

    private slotOf(card: CardSprite) { return this.units.get(card); }

    // ------------------------------------------------------------------ player camera
    private bindPlayerCamera() {
        const s = this.scene;
        s.input.on('wheel', this.onWheel, this);
        s.input.on('pointerdown', this.onPointerDown, this);
        s.input.on('pointermove', this.onPointerMove, this);
        s.input.on('pointerup', this.onPointerUp, this);
        s.input.keyboard?.on('keydown-SPACE', this.resetPlayerCamera, this);
    }
    private onWheel(_p: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number) {
        // Only when nothing draggable is under the pointer: wheel over the log panel etc. is theirs.
        if (_over && _over.length) return;
        this.rig.uTz = clamp(this.rig.uTz - Math.sign(dy) * 4, 0, 16);
    }
    private onPointerDown(p: Phaser.Input.Pointer, over: unknown[]) {
        if ((p.rightButtonDown() || p.middleButtonDown()) && !over.length) this.dragging = { x: p.x, ux: this.rig.uTx };
    }
    private onPointerMove(p: Phaser.Input.Pointer) {
        if (!this.dragging) return;
        if (!p.isDown) { this.dragging = undefined; return; }
        this.rig.uTx = clamp(this.dragging.ux - (p.x - this.dragging.x) / this.scale / 3, -22, 22);
    }
    private onPointerUp() { this.dragging = undefined; }
    resetPlayerCamera() { this.rig.uTx = 0; this.rig.uTz = 0; }
    /** Small manual nudge for keyboard / touch buttons. */
    nudgeZoom(direction: 1 | -1) { this.rig.uTz = clamp(this.rig.uTz + direction * 4, 0, 16); }
    get playerZoomed() { return Math.abs(this.rig.uTz) > 0.5 || Math.abs(this.rig.uTx) > 0.5; }

    // ------------------------------------------------------------------ director
    /** Pan/dolly toward a set of units. Cancelled by `release`. */
    focus(cards: CardSprite[], opts: { dolly?: number; pan?: number; ms?: number; ease?: string } = {}) {
        const pts = cards.map(c => this.slotOf(c)).filter(Boolean) as { side: BattleSide; slot: number }[];
        if (!pts.length) return;
        const x = pts.reduce((sum, p) => sum + BATTLE_SLOTS[p.side][clamp(p.slot, 0, 2)][0], 0) / pts.length;
        const { dolly = 5, pan = 0.55, ms = 260, ease = 'Cubic.easeOut' } = opts;
        this.focusTween?.stop();
        this.focusTween = this.scene.tweens.add({ targets: this.rig, aTx: x * pan, aTz: dolly, duration: ms, ease });
    }
    release(ms = 420) {
        this.focusTween?.stop();
        this.focusTween = this.scene.tweens.add({ targets: this.rig, aTx: 0, aTz: 0, duration: ms, ease: 'Sine.easeInOut' });
    }
    /** Quick zoom-in punch: impacts, summons. */
    punch(power = 3, ms = 150) {
        this.scene.tweens.add({ targets: this.rig, punch: power, duration: ms * 0.35, yoyo: true, ease: 'Quad.easeOut', hold: 20, onComplete: () => { this.rig.punch = 0; } });
    }
    shake(mag = 4, ms = 260) {
        this.rig.shakeMag = Math.max(this.rig.shakeMag, mag);
        this.rig.shakeUntil = this.scene.time.now + ms;
        this.scene.tweens.add({ targets: this.rig, shakeMag: 0, duration: ms, ease: 'Quad.easeOut' });
    }
    /** White (or coloured) impact frame flashed over the diorama. */
    flash(color = '#eee4d3', alpha = 0.6) { this.rig.flash = alpha; this.rig.flashColor = color; }
    /** Time dilation for kills. Restores to whatever speed the player had chosen. */
    slowmo(scale = 0.3, ms = 520) {
        const battle = this.scene as Scene & { battleState?: { gameSpeed: number } };
        const base = battle.battleState?.gameSpeed ?? 1;
        this.scene.tweens.timeScale = base * scale;
        this.scene.time.timeScale = base * scale;
        if (this.slowmoTimer) window.clearTimeout(this.slowmoTimer);
        this.slowmoTimer = window.setTimeout(() => {
            if (!this.scene.sys.isActive()) return;
            this.scene.tweens.add({ targets: this.scene.tweens, timeScale: base, duration: 200 });
            this.scene.time.timeScale = base;
        }, ms);
    }

    // ------------------------------------------------------------------ arranging
    arrange(cards: CardSprite[], side: BattleSide) {
        for (const [card, entry] of this.units) if (entry.side === side && !cards.includes(card)) this.units.delete(card);
        cards.forEach((card, slot) => {
            const fresh = !this.units.has(card);
            const from = { x: card.x, y: card.y };
            const fromScale = card.scale;
            this.units.set(card, { side, slot });
            const p = slotPosition(side, slot);
            const x = this.portrait ? 90 + slot * 150 : p.x * this.scale;
            const y = this.portrait ? (side === 'foe' ? 398 : 575) : p.y * this.scale;
            card.setBaseScale(1);
            card.setBattlePresentation(side);
            card.setAngle(0);
            card.setScale(card.getCardBaseScale()).setPosition(x, y).setOriginalPosition(x, y);
            card.setDepth(40 + (2 - slot) * 10);
            if (side === 'foe') card.disableDragging();
            if (fresh && side === 'me') this.summon(card, from, fromScale);
            else if (fresh && side === 'foe') this.enter(card);
        });
    }

    private update(_time: number, delta: number) {
        const dt = Math.min(delta, 100) / 1000;
        const ts = this.scene.tweens.timeScale;
        this.elapsed += dt * ts;
        const r = this.rig;
        // player layer eases toward its target; authored layer is tweened by the director
        r.ux = damp(r.ux, r.uTx, 9, dt); r.uz = damp(r.uz, r.uTz, 9, dt);
        r.ax = damp(r.ax, r.aTx, 14, dt); r.az = damp(r.az, r.aTz, 14, dt);
        const pointer = this.scene.input.activePointer;
        const width = this.scene.scale.width;
        const parallax = this.portrait ? 0 : clamp((pointer.x / width - 0.5) * 2, -1, 1) * 2.4;
        r.px = damp(r.px, parallax, 5, dt);
        r.sway = Math.sin(this.elapsed * 0.35) * 0.9;
        this.camera.x = r.ax + r.ux + r.px + r.sway;
        this.camera.z = r.az + r.uz + r.punch;
        const shaking = this.scene.time.now < r.shakeUntil;
        r.shakeX = shaking ? (Math.random() - 0.5) * 2 * r.shakeMag : 0;
        r.shakeY = shaking ? (Math.random() - 0.5) * 2 * r.shakeMag : 0;

        const projectionScale = this.portrait ? 1 : this.scale;
        for (const [card, entry] of this.units) {
            if (!card.active) { this.units.delete(card); continue; }
            const view = card.battleView; if (!view) continue;
            const base = slotPosition(entry.side, entry.slot), next = slotPosition(entry.side, entry.slot, this.camera);
            view.pose.cameraX = (next.x - base.x) * projectionScale + Math.round(r.shakeX * projectionScale);
            view.pose.cameraY = (next.y - base.y) * projectionScale + Math.round(r.shakeY * projectionScale);
            if (!this.portrait) {
                const kBase = 240 / Math.max(2, BATTLE_SLOTS[entry.side][clamp(entry.slot, 0, 2)][1]);
                const kNow = 240 / Math.max(2, BATTLE_SLOTS[entry.side][clamp(entry.slot, 0, 2)][1] - this.camera.z);
                view.setZoom(clamp(kNow / kBase, 0.8, 2.2));
            }
        }
        this.fx.update(dt * ts);

        const frame = Math.floor(this.elapsed * 30); if (frame === this.frame && r.flash <= 0) return; this.frame = frame;
        const x = this.surface.ox, t = this.elapsed, camera = this.camera;
        x.save();
        x.translate(Math.round(r.shakeX), Math.round(r.shakeY));
        x.fillStyle = '#849a8d'; x.fillRect(-8, -8, 656, 376); x.drawImage(this.sky, 0, 0);
        x.drawImage(this.sea, -(t * 10 + camera.x * 1.2) % 640, 76, 1280, 284);
        // slow far clouds for depth
        x.globalAlpha = 0.5;
        x.drawImage(this.cloud, (((t * 6 + 90) % 900) - 200) - camera.x * 0.5, 40);
        x.drawImage(this.cloud, (((t * 4 + 500) % 900) - 200) - camera.x * 0.5, 62);
        x.globalAlpha = 1;
        x.drawImage(this.island, 65 - camera.x * .4, 55 + Math.sin(t) * 2);
        x.drawImage(this.island, 475 - camera.x * .4, 50 + Math.sin(t + 2) * 2);
        for (let y = 81; y < 360; y++) {
            const dz = 40 * 240 / (y - 80), z = camera.z + dz;
            if (z < 30 || z > 230) continue;
            const hw = 320 * dz / 240;
            x.drawImage(this.floor, (camera.x - hw + 100) * 4, (z - 30) * 4, hw * 8, 1, 0, y, 640, 1);
        }
        x.drawImage(this.bell, 272 - camera.x * .3, 4 + Math.sin(t * .8) * 3);
        // the arena floats in cloud: dissolve the near edge into mist so the hand reads cleanly
        const mist = x.createLinearGradient(0, 292, 0, 364);
        mist.addColorStop(0, 'rgba(132,154,141,0)');
        mist.addColorStop(0.55, 'rgba(146,166,152,0.7)');
        mist.addColorStop(1, 'rgba(160,178,166,0.92)');
        x.fillStyle = mist; x.fillRect(-8, 292, 656, 76);
        x.restore();
        if (r.flash > 0) {
            x.globalAlpha = r.flash; x.fillStyle = r.flashColor; x.fillRect(0, 0, 640, 360); x.globalAlpha = 1;
            r.flash = Math.max(0, r.flash - dt * 5.5);
        }
        this.texture.refresh();
    }

    // ------------------------------------------------------------------ entrances
    summon(card: CardSprite, from?: { x: number; y: number }, fromScale = 1) {
        const view = card.battleView; if (!view) return;
        const now = this.scene.time.now;
        if (now - (this.summonedAt.get(card) ?? -Infinity) < 350) return;
        this.summonedAt.set(card, now);
        this.scene.tweens.killTweensOf(view);
        view.setAlpha(0);
        const key = wenxinCardTexture(this.scene, card.getCardData());
        const at = this.unitScreen(card);
        const delay = from ? 220 : 0;
        if (key && from) {
            // the card itself streaks to the slot, folds, and becomes a pillar of light
            const cardArt = this.scene.add.image(from.x, from.y, key).setDisplaySize(180 * fromScale, 260 * fromScale).setDepth(98);
            this.scene.tweens.add({
                targets: cardArt, x: at.x, y: at.y - 130, angle: 8, alpha: 0.2,
                scaleX: cardArt.scaleX * 0.35, scaleY: cardArt.scaleY * 0.7, duration: 320, ease: 'Cubic.easeIn',
                onComplete: () => cardArt.destroy(),
            });
        }
        this.scene.time.delayedCall(delay, () => {
            if (!card.active) return;
            const pos = this.unitScreen(card);
            this.fx.summonBurst(pos.x, pos.y, card.getCardData().kind === 'unit');
            this.punch(2.2, 220);
            this.shake(2.2, 220);
            this.flash('#f1cead', 0.35);
            this.focus([card], { dolly: 2.5, pan: 0.35, ms: 220 });
            this.scene.time.delayedCall(420, () => this.release(520));
            view.setAlpha(0);
            this.scene.tweens.add({ targets: view, alpha: 1, duration: 360, ease: 'Stepped', easeParams: [10] });
            view.dropIn();
        });
    }

    private enter(card: CardSprite) {
        const view = card.battleView; if (!view) return;
        view.setAlpha(0);
        this.scene.tweens.add({ targets: view, alpha: 1, duration: 500, delay: 120 + Math.random() * 200, ease: 'Stepped', easeParams: [8] });
        view.dropIn(true);
    }

    // ------------------------------------------------------------------ combat
    /** One real damage callback per attack, inside the existing animation accounting. */
    attack(attacker: CardSprite, target: CardSprite, damage: number, delay: number, onDamage: (target: CardSprite, damage: number) => void, tween: Tween) {
        const view = attacker.battleView; if (!view) return false;
        const bird = view.artKey === 'eagle', sage = view.artKey === 'sage' || view.artKey === 'disc';
        const pose = view.pose, oldDepth = attacker.depth;
        // Include delay and return motion in the manager's pending animation count.
        tween({ targets: { value: 0 }, value: 1, duration: Math.max(1, delay), onComplete: () => {
            if (!attacker.active || !target.active) return;
            this.activeAttacks++;
            attacker.setDepth(90);
            view.setFocused(true);
            this.focus([attacker, target], { dolly: bird ? 7 : 5.5, pan: 0.5, ms: 300 });
            const dirX = Math.sign((target.x - attacker.x) || 1);
            const finish = () => {
                pose.run = 0; pose.fast = false; pose.raise = 0;
                view.setFocused(false);
                if (attacker.active) attacker.setDepth(oldDepth);
                this.activeAttacks--;
                if (!this.activeAttacks) this.release(480);
            };
            const strike = () => {
                if (!target.active) { tween({ targets: pose, ox: 0, oy: 0, duration: 260, onComplete: finish }); return; }
                const before = target.getCardData().health;
                const at = this.unitScreen(target);
                const hue = bird ? C.ice : sage ? C.glow : C.paper;
                this.impact(target, hue, sage, damage);
                onDamage(target, damage);
                const dealt = Math.max(0, before - target.getCardData().health);
                this.fx.damageNumber(at.x, at.y - 200, dealt, dealt === 0);
                const lethal = target.getCardData().health <= 0;
                if (lethal) {
                    this.slowmo(0.28, 620);
                    this.focus([target], { dolly: 9, pan: 0.9, ms: 180, ease: 'Expo.easeOut' });
                    this.shake(6, 420);
                    this.punch(6, 320);
                    this.flash('#f3ead3', 0.85);
                }
                // recoil for the target, then the attacker's return
                const tp = target.battleView?.pose;
                if (tp) {
                    this.scene.tweens.add({ targets: tp, ox: dirX * 34, duration: 70, yoyo: true, ease: 'Quad.easeOut', hold: 30 });
                }
                tween({ targets: pose, ox: 0, oy: 0, duration: bird ? 460 : 340, delay: lethal ? 260 : 90, ease: 'Sine.easeInOut', onComplete: finish });
            };
            if (sage) {
                // gather qi, lift, and call a rain of flying swords
                const start = this.unitScreen(attacker);
                this.fx.qiGather(start.x, start.y - 120, C.glow);
                tween({ targets: pose, raise: 1, duration: 520, onComplete: strike });
            } else {
                pose.run = 1; pose.fast = bird;
                const anticipate = bird ? { oy: -204, duration: 360 } : { ox: -dirX * 34, oy: -14, duration: 200 };
                tween({ targets: pose, ...anticipate, ease: 'Sine.easeOut', onComplete: () => {
                    // dash with afterimages and speed lines
                    const trail = this.scene.time.addEvent({ delay: 38, loop: true, callback: () => {
                        if (view.active) this.fx.afterimage(view, this.unitScreen(attacker));
                    } });
                    const start = this.unitScreen(attacker);
                    this.fx.speedLines(start.x, start.y - 110, dirX);
                    tween({ targets: pose, ox: (target.x - attacker.x) * .82, oy: target.y - attacker.y - (bird ? 30 : 0), duration: bird ? 170 : 210, ease: 'Expo.easeIn', onComplete: () => {
                        trail.remove();
                        strike();
                    } });
                } });
            }
        } });
        return true;
    }

    impact(target: CardSprite, color: number = C.paper, swords = false, damage = 1) {
        const at = this.unitScreen(target);
        const x = at.x, y = at.y - 130;
        const power = clamp(damage / 8, 0.4, 1.6);
        this.fx.impact(x, y, color, power, swords);
        this.punch(2 + power * 2.2, 160);
        this.shake(2.5 + power * 3, 260);
        this.flash('#eee4d3', 0.28 + power * 0.18);
        this.fx.hitStop(60 + power * 40);
        target.battleView?.hitFlash();
    }

    shatter(target: CardSprite) {
        const at = this.unitScreen(target);
        this.fx.deathBurst(at.x, at.y - 110);
    }
}
