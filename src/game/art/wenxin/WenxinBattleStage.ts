import { type Textures, type Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import { NEAREST, getWenxinMaterials, pixelSurface, wenxinCardTexture } from './WenxinArt';
import { BATTLE_SLOTS, slotPosition, type BattleSide } from './presentation';
import { isPortraitGameViewport } from '../../layout/gameViewport';

const stages = new WeakMap<Scene, WenxinBattleStage>();
export function getWenxinBattleStage(scene: Scene) { return stages.get(scene); }
type Tween = (config: Phaser.Types.Tweens.TweenBuilderConfig) => Phaser.Tweens.Tween;
let serial = 0;
export class WenxinBattleStage {
    readonly camera = { x: 0, z: 0 };
    private readonly surface = pixelSurface(640, 360);
    private readonly art = getWenxinMaterials()!;
    private readonly floor = this.art.floor(BATTLE_SLOTS);
    private readonly sky = this.art.background('sky', 640, 120);
    private readonly sea = this.art.sea(1280, 100);
    private readonly bell = this.art.prop('bell', 96, 88);
    private readonly island = this.art.prop('island', 110, 72);
    private readonly texture: Textures.CanvasTexture;
    private units = new Map<CardSprite, { side: BattleSide; slot: number }>();
    private elapsed = 0;
    private frame = -1;
    private activeAttacks = 0;
    private summonedAt = new WeakMap<CardSprite, number>();
    constructor(private readonly scene: Scene) {
        stages.set(scene, this);
        this.texture = scene.textures.addCanvas(`wenxin:arena:${++serial}`, this.surface.o)!;
        this.texture.setFilter(NEAREST);
        scene.add.image(0, 0, this.texture.key).setOrigin(0).setDisplaySize(scene.scale.width, scene.scale.height).setDepth(-10);
        scene.events.on('update', this.update, this);
        const cleanup = () => {
            scene.events.off('shutdown', cleanup);
            scene.events.off('destroy', cleanup);
            scene.events.off('update', this.update, this);
            scene.tweens.killTweensOf(this.camera);
            this.units.clear(); stages.delete(scene); scene.textures.remove(this.texture.key);
        };
        scene.events.once('shutdown', cleanup);
        scene.events.once('destroy', cleanup);
        this.update(0, 0);
    }
    arrange(cards: CardSprite[], side: BattleSide) {
        const portrait = isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height);
        for (const [card, entry] of this.units) if (entry.side === side && !cards.includes(card)) this.units.delete(card);
        cards.forEach((card, slot) => {
            const fresh = !this.units.has(card);
            const from = { x: card.x, y: card.y };
            this.units.set(card, { side, slot });
            const p = slotPosition(side, slot);
            const x = portrait ? 90 + slot * 150 : p.x * 3;
            const y = portrait ? (side === 'foe' ? 398 : 575) : p.y * 3;
            card.setBattlePresentation(side);
            card.setScale(card.getCardBaseScale()).setPosition(x, y).setOriginalPosition(x, y);
            card.setDepth(40 + (2 - slot) * 10);
            if (side === 'foe') card.disableDragging();
            if (fresh && side === 'me') this.summon(card, from);
        });
    }
    private update(_time: number, delta: number) {
        this.elapsed += Math.min(delta, 100) / 1000 * this.scene.tweens.timeScale;
        for (const [card, entry] of this.units) {
            if (!card.active) { this.units.delete(card); continue; }
            const view = card.battleView; if (!view) continue;
            const base = slotPosition(entry.side, entry.slot), next = slotPosition(entry.side, entry.slot, this.camera);
            const projectionScale = isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height) ? 1 : 3;
            view.pose.cameraX = (next.x - base.x) * projectionScale;
            view.pose.cameraY = (next.y - base.y) * projectionScale;
        }
        const frame = Math.floor(this.elapsed * 30); if (frame === this.frame) return; this.frame = frame;
        const x = this.surface.ox, t = this.elapsed, camera = this.camera;
        x.fillStyle = '#849a8d'; x.fillRect(0, 0, 640, 360); x.drawImage(this.sky, 0, 0);
        x.drawImage(this.sea, -(t * 10 + camera.x * 1.2) % 640, 76, 1280, 284);
        x.drawImage(this.island, 65 - camera.x * .4, 55 + Math.sin(t) * 2);
        x.drawImage(this.island, 475 - camera.x * .4, 50 + Math.sin(t + 2) * 2);
        for (let y = 81; y < 360; y++) {
            const dz = 40 * 240 / (y - 80), z = camera.z + dz;
            if (z < 30 || z > 230) continue;
            const hw = 320 * dz / 240;
            x.drawImage(this.floor, (camera.x - hw + 100) * 4, (z - 30) * 4, hw * 8, 1, 0, y, 640, 1);
        }
        x.drawImage(this.bell, 272 - camera.x * .3, 4 + Math.sin(t * .8) * 3);
        this.texture.refresh();
    }
    summon(card: CardSprite, from?: { x: number; y: number }) {
        const view = card.battleView; if (!view) return;
        const now = this.scene.time.now;
        if (now - (this.summonedAt.get(card) ?? -Infinity) < 350) return;
        this.summonedAt.set(card, now);
        this.scene.tweens.killTweensOf(view);
        view.setAlpha(0);
        const key = wenxinCardTexture(this.scene, card.getCardData());
        if (key && from) {
            const cardArt = this.scene.add.image(from.x, from.y, key).setDisplaySize(180, 260).setDepth(98);
            this.scene.tweens.add({ targets: cardArt, x: card.x, y: card.y - 150, alpha: 0, scaleX: cardArt.scaleX * .55, scaleY: cardArt.scaleY * .55, duration: 450, ease: 'Cubic.easeOut', onComplete: () => cardArt.destroy() });
        }
        this.scene.tweens.add({ targets: view, alpha: 1, delay: from ? 180 : 0, duration: 720, ease: 'Stepped', easeParams: [12] });
        const ring = this.scene.add.ellipse(card.x, card.y, 170, 45, 0xc6aa7a, .15).setStrokeStyle(3, 0xdfc99f).setDepth(card.depth - 1);
        this.scene.tweens.add({ targets: ring, scaleX: 1.5, scaleY: 1.5, alpha: 0, duration: 850, onComplete: () => ring.destroy() });
        this.pixels(card.x, card.y - 70, 0xdfc99f, 16, true);
    }
    /** One real damage callback per attack, inside the existing animation accounting. */
    attack(attacker: CardSprite, target: CardSprite, damage: number, delay: number, onDamage: (target: CardSprite, damage: number) => void, tween: Tween) {
        const view = attacker.battleView; if (!view) return false;
        const bird = view.artKey === 'eagle', sage = view.artKey === 'sage' || view.artKey === 'disc';
        const pose = view.pose, oldDepth = attacker.depth;
        // Include delay and return motion in the manager's pending animation count.
        tween({ targets: { value: 0 }, value: 1, duration: Math.max(1, delay), onComplete: () => {
            if (!attacker.active || !target.active) return;
            this.activeAttacks++;
            attacker.setDepth(90); pose.run = 1; pose.fast = bird; pose.raise = sage ? 1 : 0;
            this.scene.tweens.killTweensOf(this.camera);
            this.scene.tweens.add({ targets: this.camera, x: (attacker.x + target.x - this.scene.scale.width) / 45, z: 6, duration: 220 });
            const finish = () => {
                pose.run = 0; pose.fast = false; pose.raise = 0;
                if (attacker.active) attacker.setDepth(oldDepth);
                this.activeAttacks--;
                if (!this.activeAttacks) {
                    this.scene.tweens.killTweensOf(this.camera);
                    this.scene.tweens.add({ targets: this.camera, x: 0, z: 0, duration: 300 });
                }
            };
            const strike = () => {
                if (target.active) {
                    this.impact(target, bird ? 0xd2d6cd : sage ? 0xdfc99f : 0xeee4d3, sage);
                    onDamage(target, damage);
                }
                tween({ targets: pose, ox: 0, oy: 0, duration: bird ? 400 : 300, ease: 'Sine.easeInOut', onComplete: finish });
            };
            if (sage) {
                tween({ targets: pose, raise: 1, duration: 500, onComplete: strike });
            } else {
                tween({ targets: pose, oy: bird ? -204 : -36, duration: bird ? 350 : 120, ease: 'Sine.easeOut', onComplete: () => {
                    tween({ targets: pose, ox: (target.x - attacker.x) * .8, oy: target.y - attacker.y - (bird ? 30 : 0), duration: bird ? 180 : 220, ease: 'Quad.easeIn', onComplete: strike });
                } });
            }
        } });
        return true;
    }
    impact(target: CardSprite, color = 0xeee4d3, swords = false) {
        const x = target.x, y = target.y - 140;
        this.pixels(x, y, color, 18);
        target.battleView?.image.setTintFill(0xeee4d3);
        this.scene.time.delayedCall(90, () => { if (target.active) target.battleView?.image.clearTint(); });
        if (swords) for (let i = 0; i < 8; i++) {
            const sword = this.scene.add.rectangle(x + (i - 4) * 24 - 80, y - 230 - i * 12, 6, 66, 0xdfc99f).setAngle(-25).setDepth(95);
            this.scene.tweens.add({ targets: sword, x: sword.x + 90, y: y + 40, alpha: 0, duration: 250 + i * 25, onComplete: () => sword.destroy() });
        } else for (let i = 0; i < 3; i++) {
            const slash = this.scene.add.rectangle(x + i * 26 - 26, y, 6, 86, color).setAngle(35).setDepth(95);
            this.scene.tweens.add({ targets: slash, alpha: 0, scaleY: .1, duration: 180 + i * 40, onComplete: () => slash.destroy() });
        }
    }
    shatter(target: CardSprite) { this.pixels(target.x, target.y - 110, 0xc8c4b5, 32); }
    private pixels(x: number, y: number, color: number, count: number, rising = false) {
        for (let i = 0; i < count; i++) {
            const particle = this.scene.add.rectangle(x + (Math.random() - .5) * 90, y + (Math.random() - .5) * 90, 6, 6, color).setDepth(96);
            this.scene.tweens.add({ targets: particle, x: particle.x + (Math.random() - .5) * 170, y: particle.y + (rising ? -180 : 100), alpha: 0, duration: 350 + Math.random() * 350, onComplete: () => particle.destroy() });
        }
    }
}
