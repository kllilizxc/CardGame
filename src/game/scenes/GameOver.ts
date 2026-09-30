import { EventBus } from '../EventBus';
import { Scene } from 'phaser';
import { INK, PX } from '../art/palette';
import { addBackdrop, addMotes } from '../art/scenery';
import { pbutton, ptitle } from '../art/kit';

export class GameOver extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    constructor ()
    {
        super('GameOver');
    }

    create ()
    {
        const { width, height } = this.scale;
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(INK.void);
        addBackdrop(this, 'peaks', 'dusk');
        addMotes(this, 'ash', 10, 200);

        const title = ptitle(this, width / 2, height * 0.38, '游戏结束', 5, { face: INK.haze, lower: INK.mist, extrude: INK.wine, extrudeDepth: 4 }).setDepth(100);
        this.tweens.add({ targets: title, y: title.y - PX * 3, duration: 1400, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [3] });

        pbutton(this, {
            x: width / 2, y: height * 0.68, width: PX * 110, height: PX * 26, label: '回到主菜单', style: 'seal', depth: 100, cursor: true,
            onClick: () => this.changeScene(),
        });

        EventBus.emit('current-scene-ready', this);
    }

    changeScene ()
    {
        this.scene.start('MainMenu');
    }
}
