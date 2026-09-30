import { Scene } from 'phaser';
import { ensureWenxinArt } from '../art/wenxin/WenxinArt';

import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
} from '../content/contentCatalog';
import { INK, PX } from '../art/palette';
import { snap } from '../art/pix';
import { ptext, ptitle } from '../art/kit';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(INK.void);
        ptitle(this, width / 2, height / 2 - 90, '青云', 4);
        const label = ptext(this, width / 2, height / 2 + 84, '研 墨 …', { color: INK.mist, origin: [0.5, 0.5] });

        // a row of ink blocks that fill with cinnabar
        const blocks = 24;
        const size = PX * 6;
        const gap = PX * 2;
        const x0 = snap(width / 2 - (blocks * (size + gap)) / 2);
        const y0 = snap(height / 2 + 24);
        const graphics = this.add.graphics();
        const drawProgress = (progress: number) => {
            graphics.clear();
            const lit = Math.round(blocks * progress);
            for (let i = 0; i < blocks; i++) {
                graphics.fillStyle(INK.void, 1);
                graphics.fillRect(x0 + i * (size + gap) - PX, y0 - PX, size + PX * 2, size + PX * 2);
                graphics.fillStyle(i < lit ? INK.cinnabar : INK.indigo, 1);
                graphics.fillRect(x0 + i * (size + gap), y0, size, size);
                if (i < lit) { graphics.fillStyle(INK.vermilion, 1); graphics.fillRect(x0 + i * (size + gap), y0, size, PX); }
            }
        };
        drawProgress(0);
        this.load.on('progress', (progress: number) => {
            drawProgress(progress);
            label.setText(`研 墨 … ${Math.floor(progress * 100)}%`);
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
        const label = ptext(this, this.scale.width / 2, this.scale.height / 2 + 150, '展 开 画 卷 …', { color: INK.bone, origin: [0.5, 0.5] });
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
