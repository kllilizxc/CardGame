import { Scene } from 'phaser';
import { ensureWenxinArt } from '../art/wenxin/WenxinArt';

import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
} from '../content/contentCatalog';
import { C, FONT, T } from '../art/palette';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(C.void);
        this.add.text(width / 2, height / 2 - 90, '青 云', {
            fontFamily: FONT, fontSize: '72px', color: T.gold, stroke: T.void, strokeThickness: 8,
        }).setOrigin(0.5);
        const label = this.add.text(width / 2, height / 2 + 70, '点燃灵火…', {
            fontFamily: FONT, fontSize: '24px', color: T.dim,
        }).setOrigin(0.5);

        const barWidth = 600;
        const x0 = width / 2 - barWidth / 2;
        const y0 = height / 2;
        const graphics = this.add.graphics();
        const drawProgress = (progress: number) => {
            graphics.clear();
            graphics.fillStyle(C.umber, 1);
            graphics.fillRect(x0 - 8, y0 - 8, barWidth + 16, 40);
            graphics.fillStyle(C.void, 1);
            graphics.fillRect(x0 - 4, y0 - 4, barWidth + 8, 32);
            const filled = Math.floor((barWidth * progress) / 8) * 8;
            for (let x = 0; x < filled; x += 8) {
                graphics.fillStyle(x % 16 === 0 ? C.ember : C.gold, 1);
                graphics.fillRect(x0 + x, y0, 8, 24);
                graphics.fillStyle(C.glow, 1);
                graphics.fillRect(x0 + x, y0, 8, 4);
            }
        };
        drawProgress(0);
        this.load.on('progress', (progress: number) => {
            drawProgress(progress);
            label.setText(`点燃灵火… ${Math.floor(progress * 100)}%`);
        });
    }

    preload ()
    {
        //  Load runtime metadata before any gameplay scene needs catalog-backed resource resolution.
        this.load.json(CONTENT_CATALOG_CACHE_KEY, CONTENT_CATALOG_PUBLIC_PATH);

        this.load.setPath('assets');

        this.load.image('logo', 'logo.png');
        this.load.image('star', 'star.png');
    }

    async create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        const label = this.add.text(this.scale.width / 2, this.scale.height / 2 + 60, '展开画卷……', { fontSize: '24px', color: '#dfc99f' }).setOrigin(.5);
        try {
            await ensureWenxinArt(this);
            if (this.sys.isActive()) this.scene.start('MainMenu');
        } catch (error) {
            label.setText('素材未能载入，点击重试').setInteractive({ useHandCursor: true });
            label.once('pointerdown', () => this.scene.restart());
            console.error(error);
        }
    }
}
