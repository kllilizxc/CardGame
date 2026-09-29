import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { createBackdrop, Backdrop } from '../art/backdrop';
import { C, FONT, T } from '../art/palette';
import { pixelButton, PANEL_BLOOD } from '../art/ui';
import { pxBurst } from '../art/fx';

export class GameOver extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Backdrop | null = null;
    gameOverText : Phaser.GameObjects.Text;

    constructor ()
    {
        super('GameOver');
    }

    create ()
    {
        const { width, height } = this.scale;
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(C.void);

        this.background = createBackdrop(this, 'mountain', 'ember');
        this.events.once('shutdown', () => { this.background?.destroy(); this.background = null; });

        this.add.rectangle(width / 2, height / 2, width, height, C.void, 0.55).setDepth(50);

        this.add.text(width / 2 + 10, height * 0.38 + 10, '游戏结束', {
            fontFamily: FONT, fontSize: '144px', color: '#7a1d2e',
        }).setOrigin(0.5).setDepth(99);
        this.gameOverText = this.add.text(width / 2, height * 0.38, '游戏结束', {
            fontFamily: FONT, fontSize: '144px', color: T.cinnabar,
            stroke: T.void, strokeThickness: 12,
            align: 'center'
        }).setOrigin(0.5).setDepth(100);
        this.tweens.add({ targets: this.gameOverText, y: this.gameOverText.y - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [3] });

        pixelButton(this, {
            x: width / 2, y: height * 0.68, width: 420, height: 96, label: '回到主菜单', labelSize: 36,
            style: PANEL_BLOOD, depth: 100, onClick: () => this.changeScene(),
        });

        this.time.addEvent({
            delay: 500, loop: true,
            callback: () => pxBurst(this, Math.random() * width, height, { colors: [C.ember, C.cinnabar, C.gold], count: 2, speed: 90, size: 6, gravity: -80, life: 1600, spread: 0.5, depth: 80 }),
        });

        EventBus.emit('current-scene-ready', this);
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }
}
