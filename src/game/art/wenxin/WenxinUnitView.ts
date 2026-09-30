import { GameObjects, type Textures, type Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import { NEAREST, getWenxinMaterials, pixelSurface } from './WenxinArt';
import { UNIT_ART, type UnitArt, type BattleSide } from './presentation';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import { C, INK, PX } from '../palette';
import { addIcon } from '../icons';
import { clip, numberFont, panel, ptext } from '../kit';

let serial = 0;
const BAR_W = PX * 58;

/**
 * A fighter on the diorama: the procedural sprite plus its nameplate.
 * The sprite zooms with the battle camera; the plate never does, so text stays crisp and readable.
 */
export class WenxinUnitView extends GameObjects.Container {
    readonly pose = { ox: 0, oy: 0, cameraX: 0, cameraY: 0, run: 0, raise: 0, reach: 0, fast: false };
    readonly image: GameObjects.Image;
    readonly artKey: UnitArt;
    private readonly surface;
    private readonly texture: Textures.CanvasTexture;
    private readonly shadow: GameObjects.Ellipse;
    private readonly ring: GameObjects.Ellipse;
    private readonly plate: GameObjects.Container;
    private readonly nameText: GameObjects.Text;
    private readonly bar: GameObjects.Graphics;
    private readonly atkText: GameObjects.BitmapText;
    private readonly hpText: GameObjects.BitmapText;
    private readonly maxHealth: number;
    private readonly baseScale: number;
    private hpShown: number;
    private hpGhost: number;
    private zoom = 1;
    private focused = false;
    private hovered = false;
    private lastFrame = -1;
    private elapsed = Math.random() * 3;
    private tintUntil = 0;

    constructor(scene: Scene, readonly card: CardSprite, key: UnitArt, readonly side: BattleSide) {
        super(scene, 0, 0); this.artKey = key;
        const portrait = isPortraitGameViewport(scene.scale.width, scene.scale.height);
        const m = UNIT_ART[key]; this.surface = pixelSurface(m.w, m.h);
        this.texture = scene.textures.addCanvas(`wenxin:unit:${++serial}`, this.surface.o)!;
        this.texture.setFilter(NEAREST);
        this.baseScale = portrait ? 1.6 : scene.scale.width / 640;
        this.shadow = scene.add.ellipse(0, 0, 150, 27, C.void, 0.5);
        this.ring = scene.add.ellipse(0, 0, 192, 39).setStrokeStyle(PX, INK.gold, 1).setVisible(false);
        this.image = scene.add.image(0, 0, this.texture.key).setOrigin(side === 'me' ? 1 - m.ax / m.w : m.ax / m.w, m.ay / m.h).setScale(this.baseScale).setFlipX(side === 'me');
        const data = card.getCardData(); this.maxHealth = Math.max(1, data.health);
        this.hpShown = data.health; this.hpGhost = data.health;

        // ---- nameplate (outside the diagonals so all six fighters stay readable)
        const labelX = portrait ? 0 : side === 'me' ? PX * 74 : -PX * 74;
        const labelY = portrait ? 50 : PX * 2;
        this.plate = scene.add.container(labelX, labelY);
        const w = PX * 66, h = PX * 30;
        const body = panel(scene, 0, 0, w, h, 'ink');
        const edge = scene.add.rectangle(side === 'me' ? -w / 2 + PX * 2 : w / 2 - PX * 2, 0, PX * 2, h - PX * 6, side === 'me' ? INK.spirit : INK.vermilion);
        this.nameText = ptext(scene, 0, -PX * 7, clip(data.name, 5), { color: INK.paper, origin: [0.5, 0.5] });
        this.bar = scene.add.graphics().setPosition(-BAR_W / 2, PX * 1);
        const sword = addIcon(scene, -PX * 26, PX * 9, 'sword');
        const heart = addIcon(scene, PX * 4, PX * 9, 'heart');
        this.atkText = scene.add.bitmapText(-PX * 19, PX * 9, numberFont(scene, INK.amber), '').setOrigin(0, 0.5).setScale(PX);
        this.hpText = scene.add.bitmapText(PX * 11, PX * 9, numberFont(scene, INK.spirit), '').setOrigin(0, 0.5).setScale(PX);
        this.atkText.setLetterSpacing(-1); this.hpText.setLetterSpacing(-1);
        this.plate.add([body, edge, this.nameText, this.bar, sword, heart, this.atkText, this.hpText]);

        this.add([this.shadow, this.ring, this.image, this.plate]);
        this.refreshStats(true);
        scene.events.on('update', this.updateArt, this);
        this.updateArt(0, 0);
        this.once('destroy', () => {
            scene.events.off('update', this.updateArt, this);
            // Attack completion still owns this plain pose object after the sprite dies.
            // Killing its tween here would strand the battle manager's pending counter.
            scene.textures.remove(this.texture.key);
        });
        const over = () => { this.hovered = true; this.syncRing(); };
        const out = () => { this.hovered = false; this.syncRing(); };
        card.on('pointerover', over);
        card.on('pointerout', out);
        this.once('destroy', () => { card.off('pointerover', over); card.off('pointerout', out); });
    }

    // ---------------------------------------------------------------- state
    /** Sprite zoom follows the battle camera; the plate keeps a constant on-screen size. */
    setZoom(z: number) {
        this.zoom = z;
        this.image.setScale(this.baseScale * z);
        this.shadow.setScale(z);
        this.ring.setScale(z);
    }
    setFocused(on: boolean) { this.focused = on; this.syncRing(); }
    private syncRing() {
        if (!this.active) return;
        const on = this.focused || this.hovered;
        this.ring.setVisible(on);
        this.plate.setAlpha(on ? 1 : 0.9);
    }
    hitFlash() {
        this.image.setTintFill(C.paper);
        this.tintUntil = this.scene.time.now + 90;
        this.scene.time.delayedCall(90, () => { if (this.active && this.scene.time.now >= this.tintUntil - 5) this.image.clearTint(); });
        this.plate.setAlpha(1);
    }
    /** Falls from above and lands with dust. */
    dropIn(quiet = false) {
        const scene = this.scene;
        this.pose.oy = -280;
        scene.tweens.add({
            targets: this.pose, oy: 0, duration: quiet ? 520 : 420, ease: 'Bounce.easeOut', delay: quiet ? 40 : 0,
            onComplete: () => {
                if (!this.active) return;
                this.pose.oy = 0;
            },
        });
    }
    /** Frozen copy of the current frame for afterimages. */
    snapshot() {
        if (!this.active) return null;
        const c = document.createElement('canvas');
        c.width = this.surface.w; c.height = this.surface.h;
        c.getContext('2d')!.drawImage(this.surface.o, 0, 0);
        return { canvas: c, ox: this.image.originX, oy: this.image.originY, scale: this.image.scaleX, flip: this.image.flipX };
    }

    refreshStats(instant = false) {
        const data = this.card.getCardData();
        this.atkText.setText(`${data.attack}`);
        this.hpText.setText(`${Math.max(0, data.health)}`);
        this.hpText.setFont(numberFont(this.scene, data.health <= this.maxHealth * 0.3 ? INK.vermilion : INK.spirit));
        if (instant) { this.hpShown = this.hpGhost = data.health; this.drawBar(); return; }
        if (data.health < this.hpShown) { this.plate.setAlpha(1); this.plate.x += this.side === 'me' ? 6 : -6; this.scene.tweens.add({ targets: this.plate, x: this.plate.x + (this.side === 'me' ? -6 : 6), duration: 120, ease: 'Bounce.easeOut' }); }
        this.hpShown = Math.max(0, data.health);
    }

    private drawBar() {
        const g = this.bar;
        g.clear();
        const h = PX * 3;
        g.fillStyle(C.void, 1); g.fillRect(0, 0, BAR_W, h);
        const ghostW = Math.round((BAR_W * Math.max(0, Math.min(1, this.hpGhost / this.maxHealth))) / PX) * PX;
        const realW = Math.round((BAR_W * Math.max(0, Math.min(1, this.hpShown / this.maxHealth))) / PX) * PX;
        g.fillStyle(INK.gold, 1); g.fillRect(0, 0, ghostW, h);
        const low = this.hpShown <= this.maxHealth * 0.3;
        g.fillStyle(low ? INK.vermilion : this.side === 'me' ? INK.teal : INK.cinnabar, 1); g.fillRect(0, 0, realW, h);
        g.fillStyle(INK.paper, 0.6); g.fillRect(0, 0, realW, PX);
    }

    private updateArt(_time: number, delta: number) {
        // A scene emitter may already have copied this listener before a death callback removes it.
        if (!this.active || !this.scene) return;
        const dt = Math.min(delta, 100) / 1000 * this.scene.tweens.timeScale;
        this.elapsed += dt;
        if (this.hpGhost > this.hpShown) { this.hpGhost = Math.max(this.hpShown, this.hpGhost - this.maxHealth * dt * 0.5); this.drawBar(); }
        else if (this.hpGhost < this.hpShown) { this.hpGhost = this.hpShown; this.drawBar(); }
        this.setPosition(Math.round(this.pose.ox + this.pose.cameraX), Math.round(this.pose.oy + this.pose.cameraY));
        this.ring.setScale(this.zoom * (1 + Math.sin(this.elapsed * 6) * 0.03));
        const frame = Math.floor(this.elapsed * 30);
        if (frame === this.lastFrame) return;
        this.lastFrame = frame;
        getWenxinMaterials()!.monster(this.surface, this.artKey, { ...this.pose, t: this.elapsed });
        this.texture.refresh();
    }
}
