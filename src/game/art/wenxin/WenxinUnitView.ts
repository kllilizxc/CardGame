import { GameObjects, type Textures, type Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import { NEAREST, getWenxinMaterials, pixelSurface } from './WenxinArt';
import { UNIT_ART, type UnitArt, type BattleSide } from './presentation';
import { isPortraitGameViewport } from '../../layout/gameViewport';

let serial = 0;
export class WenxinUnitView extends GameObjects.Container {
    readonly pose = { ox: 0, oy: 0, cameraX: 0, cameraY: 0, run: 0, raise: 0, reach: 0, fast: false };
    readonly image: GameObjects.Image;
    readonly artKey: UnitArt;
    private readonly surface;
    private readonly texture: Textures.CanvasTexture;
    private readonly stats: GameObjects.Text;
    private readonly bar: GameObjects.Rectangle;
    private readonly maxHealth: number;
    private lastFrame = -1;
    private elapsed = Math.random() * 3;
    constructor(scene: Scene, readonly card: CardSprite, key: UnitArt, readonly side: BattleSide) {
        super(scene, 0, 0); this.artKey = key;
        const portrait = isPortraitGameViewport(scene.scale.width, scene.scale.height);
        const m = UNIT_ART[key]; this.surface = pixelSurface(m.w, m.h);
        this.texture = scene.textures.addCanvas(`wenxin:unit:${++serial}`, this.surface.o)!;
        this.texture.setFilter(NEAREST);
        const shadow = scene.add.ellipse(0, 0, 145, 24, 0x20282e, .3);
        this.image = scene.add.image(0, 0, this.texture.key).setOrigin(side === 'me' ? 1 - m.ax / m.w : m.ax / m.w, m.ay / m.h).setScale(portrait ? 1.6 : 3).setFlipX(side === 'me');
        const data = card.getCardData(); this.maxHealth = Math.max(1, data.health);
        // Outside the diagonals, labels remain readable with all six slots occupied.
        const labelX = portrait ? 0 : side === 'me' ? 220 : -220;
        const plate = scene.add.rectangle(labelX, portrait ? 50 : 12, 196, portrait ? 60 : 70, 0x20282e, .78).setStrokeStyle(1, 0xc6aa7a, .5);
        const name = scene.add.text(labelX, portrait ? 34 : -9, data.name, { fontFamily: '"Noto Serif SC", serif', fontSize: portrait ? '28px' : '18px', color: '#eee4d3' }).setOrigin(.5);
        if (name.width > 182) name.setScale(182 / name.width);
        const track = scene.add.rectangle(labelX, portrait ? 52 : 12, 160, 8, 0x20282e);
        this.bar = scene.add.rectangle(labelX - 79, portrait ? 52 : 12, 158, 6, side === 'me' ? 0x849a8d : 0xb98e82).setOrigin(0, .5);
        this.stats = scene.add.text(labelX, portrait ? 67 : 32, '', { fontSize: portrait ? '24px' : '18px', color: '#eee4d3' }).setOrigin(.5);
        this.add([shadow, this.image, plate, name, track, this.bar, this.stats]);
        this.refreshStats();
        scene.events.on('update', this.updateArt, this);
        this.updateArt(0, 0);
        this.once('destroy', () => {
            scene.events.off('update', this.updateArt, this);
            // Attack completion still owns this plain pose object after the sprite dies.
            // Killing its tween here would strand the battle manager's pending counter.
            scene.textures.remove(this.texture.key);
        });
    }
    refreshStats() {
        const data = this.card.getCardData();
        this.stats.setText(`攻 ${data.attack}  ·  命 ${data.health}`);
        this.bar.width = 158 * Math.max(0, Math.min(1, data.health / this.maxHealth));
    }
    private updateArt(_time: number, delta: number) {
        // A scene emitter may already have copied this listener before a death callback removes it.
        if (!this.active || !this.scene) return;
        this.elapsed += Math.min(delta, 100) / 1000 * this.scene.tweens.timeScale;
        this.setPosition(Math.round(this.pose.ox + this.pose.cameraX), Math.round(this.pose.oy + this.pose.cameraY));
        const frame = Math.floor(this.elapsed * 30);
        if (frame === this.lastFrame) return;
        this.lastFrame = frame;
        getWenxinMaterials()!.monster(this.surface, this.artKey, { ...this.pose, t: this.elapsed });
        this.texture.refresh();
    }
}
