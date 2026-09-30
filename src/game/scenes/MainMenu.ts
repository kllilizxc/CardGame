import { GameObjects, Scene } from 'phaser';

import { EventBus } from '../EventBus';
import { INK, PX } from '../art/palette';
import { Pix, bake, snap } from '../art/pix';
import { addBackdrop, addMotes, paintCrane, paintOrb, paintPagoda } from '../art/scenery';
import { ptext, ptitle, stampText } from '../art/kit';
import { pxBurst } from '../art/fx';

interface MenuItem { label: string; hint: string; run: () => void }

/**
 * Title screen: a moonlit mountain range in parallax, cranes crossing the sky,
 * a chunky ink-and-cinnabar logo and a two-line menu with a JRPG cursor.
 */
export class MainMenu extends Scene {
    logo!: GameObjects.Image;
    logoTween: Phaser.Tweens.Tween | null = null;
    private items: Array<{ text: GameObjects.Text; item: MenuItem }> = [];
    private cursor!: GameObjects.Text;
    private hint!: GameObjects.Text;
    private selected = 0;

    constructor() {
        super('MainMenu');
    }

    create() {
        const { width, height } = this.scale;
        this.items = [];
        this.selected = 0;
        this.cameras.main.setBackgroundColor(INK.void);

        const bd = addBackdrop(this, 'peaks', 'night');
        // moon + pagoda sit between the far and mid ranges
        const moon = this.add.image(snap(width * 0.74), snap(height * 0.25), bake(this, 'px:moon', () => paintOrb(26, INK.bone, INK.haze, INK.slate)))
            .setScale(PX).setDepth(bd.layers[1].depth + 0.5);
        this.tweens.add({ targets: moon, y: moon.y - PX * 2, duration: 4000, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.add.image(snap(width * 0.16), snap(height * 0.78), bake(this, 'px:pagoda5', () => paintPagoda(5, INK.ink, INK.void, INK.amber)))
            .setOrigin(0.5, 1).setScale(PX).setDepth(bd.layers[5].depth + 0.5);
        this.add.image(snap(width * 0.88), snap(height * 0.8), bake(this, 'px:pagoda3', () => paintPagoda(3, INK.ink, INK.void, INK.amber)))
            .setOrigin(0.5, 1).setScale(PX).setDepth(bd.layers[5].depth + 0.5);
        this.spawnCranes();
        addMotes(this, 'firefly', 5, 320);

        // logo
        const logoY = snap(height * 0.34);
        this.logo = ptitle(this, width / 2, logoY, '青云问道', 4, { face: INK.paper, lower: INK.bone, extrude: INK.cinnabar, extrudeDepth: 3 }).setDepth(20);
        const seal = this.drawSeal(snap(width / 2 + this.logo.displayWidth / 2 - PX * 2), snap(logoY + this.logo.displayHeight / 2 - PX * 4)).setDepth(21);
        const tag = ptext(this, width / 2, logoY + this.logo.displayHeight / 2 + PX * 10, '— 一 匣 卡 牌 · 一 条 仙 路 —', { color: INK.mist, origin: [0.5, 0.5], fx: 'outline' }).setDepth(20);

        this.logo.setY(-200);
        this.tweens.add({ targets: this.logo, y: logoY, duration: 700, ease: 'Bounce.easeOut', delay: 250 });
        seal.setScale(0).setAngle(-20);
        this.tweens.add({ targets: seal, scale: PX, angle: -8, duration: 260, delay: 950, ease: 'Back.easeOut', onComplete: () => {
            pxBurst(this, seal.x, seal.y, { colors: [INK.cinnabar, INK.vermilion, INK.gold], count: 12, speed: 180, size: 6, depth: 30 });
            this.cameras.main.shake(90, 0.003);
        } });
        this.logoTween = this.tweens.add({ targets: this.logo, y: logoY - PX * 2, duration: 1800, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [3], delay: 1200 });
        tag.setAlpha(0);
        this.tweens.add({ targets: tag, alpha: 1, duration: 400, delay: 1100, ease: 'Stepped', easeParams: [4] });

        // menu
        const menu: MenuItem[] = [
            { label: '启 程', hint: '进入大地图', run: () => this.startWorldMapScene() },
            { label: '全 屏', hint: '切换全屏显示', run: () => this.toggleFullscreen() },
        ];
        const menuY = snap(height * 0.62);
        menu.forEach((item, i) => {
            const t = ptext(this, width / 2, menuY + i * PX * 22, item.label, { size: 2, color: INK.bone, fx: 'outline', origin: [0.5, 0.5] })
                .setDepth(20).setInteractive({ useHandCursor: true });
            t.on('pointerover', () => this.select(i));
            t.on('pointerup', () => { this.select(i); this.activate(); });
            t.setAlpha(0);
            this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 1300 + i * 120, ease: 'Stepped', easeParams: [3] });
            this.items.push({ text: t, item });
        });
        this.cursor = ptext(this, 0, 0, '▶', { size: 1, color: INK.vermilion, fx: 'outline', origin: [0.5, 0.5] }).setDepth(20);
        this.tweens.add({ targets: this.cursor, x: '+=' + PX * 2, duration: 300, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.hint = ptext(this, width / 2, menuY + menu.length * PX * 22 + PX * 2, '', { color: INK.mist, origin: [0.5, 0.5], fx: 'outline' }).setDepth(20);
        this.select(0);
        this.cursor.setAlpha(0);
        this.hint.setAlpha(0);
        this.tweens.add({ targets: [this.cursor, this.hint], alpha: 1, duration: 200, delay: 1500 });

        ptext(this, width - PX * 6, height - PX * 6, 'v1.1 墨砂', { color: INK.slate, origin: [1, 1], fx: 'none' }).setDepth(20);

        const kb = this.input.keyboard;
        kb?.on('keydown-UP', () => this.select((this.selected + this.items.length - 1) % this.items.length));
        kb?.on('keydown-DOWN', () => this.select((this.selected + 1) % this.items.length));
        kb?.on('keydown-ENTER', () => this.activate());
        kb?.on('keydown-SPACE', () => this.activate());

        EventBus.emit('current-scene-ready', this);
    }

    private select(i: number): void {
        this.selected = i;
        this.items.forEach(({ text }, k) => text.setColor(k === i ? '#f5cf6a' : '#e6dcc2'));
        const t = this.items[i].text;
        this.cursor.setPosition(snap(t.x - t.width / 2 - PX * 10), t.y);
        this.hint.setText(this.items[i].item.hint);
    }

    private activate(): void {
        const t = this.items[this.selected];
        if (!t) return;
        this.tweens.add({ targets: t.text, scale: { from: 1.15, to: 1 }, duration: 160, ease: 'Stepped', easeParams: [3] });
        pxBurst(this, t.text.x, t.text.y, { colors: [INK.gold, INK.vermilion], count: 10, speed: 160, size: 6, depth: 30 });
        t.item.run();
    }

    private toggleFullscreen(): void {
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        else this.scale.startFullscreen();
    }

    private drawSeal(x: number, y: number): GameObjects.Image {
        const key = bake(this, 'px:seal-wendao', () => {
            const p = new Pix(30, 30);
            p.rect(1, 0, 28, 30, INK.void).rect(0, 1, 30, 28, INK.void);
            p.rect(1, 1, 28, 28, INK.cinnabar);
            p.frame(2, 2, 26, 26, INK.bone);
            stampText(p, '问', 3, 3, INK.paper);
            stampText(p, '道', 15, 15, INK.paper);
            p.px(4, 26, INK.wine).px(25, 5, INK.wine).px(12, 20, INK.wine);
            return p;
        });
        return this.add.image(x, y, key).setScale(PX);
    }

    changeScene() {
        this.startWorldMapScene();
    }

    private startWorldMapScene() {
        if (this.logoTween) {
            this.logoTween.stop();
            this.logoTween = null;
        }

        this.scene.start('WorldMapScene');
    }

    private spawnCranes(): void {
        const { width, height } = this.scale;
        const k0 = bake(this, 'px:crane0', () => paintCrane(0));
        const k1 = bake(this, 'px:crane1', () => paintCrane(1));
        const fly = () => {
            const y = snap(height * (0.12 + Math.random() * 0.25));
            const flock = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < flock; i++) {
                const c = this.add.image(-60 - i * 70, y + i * PX * 6 - (i % 2) * PX * 10, k0).setScale(PX).setDepth(-993.5);
                let f = 0;
                const flap = this.time.addEvent({ delay: 260 + i * 20, loop: true, callback: () => { f ^= 1; c.setTexture(f ? k1 : k0); } });
                this.tweens.add({
                    targets: c, x: width + 100, y: c.y - PX * 20, duration: 16000 + i * 400, ease: 'Linear',
                    onComplete: () => { flap.remove(); c.destroy(); },
                });
            }
        };
        fly();
        this.time.addEvent({ delay: 14000, loop: true, callback: fly });
    }

    moveLogo(vueCallback: ({ x, y }: { x: number, y: number }) => void) {
        vueCallback({ x: Math.floor(this.logo.x), y: Math.floor(this.logo.y) });
    }
}
