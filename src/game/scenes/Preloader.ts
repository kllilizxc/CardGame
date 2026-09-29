import { Scene } from 'phaser';

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

        // A pixel flame that fills as loading progresses.
        this.add.text(width / 2, height / 2 - 90, '青 云', {
            fontFamily: FONT, fontSize: '72px', color: T.gold, stroke: T.void, strokeThickness: 8,
        }).setOrigin(0.5);
        const label = this.add.text(width / 2, height / 2 + 70, '点燃灵火…', {
            fontFamily: FONT, fontSize: '24px', color: T.dim,
        }).setOrigin(0.5);

        const barW = 600;
        const x0 = width / 2 - barW / 2;
        const y0 = height / 2;
        const g = this.add.graphics();
        const draw = (p: number) => {
            g.clear();
            g.fillStyle(C.umber, 1); g.fillRect(x0 - 8, y0 - 8, barW + 16, 40);
            g.fillStyle(C.void, 1); g.fillRect(x0 - 4, y0 - 4, barW + 8, 32);
            const filled = Math.floor((barW * p) / 8) * 8;
            for (let x = 0; x < filled; x += 8) {
                g.fillStyle(x % 16 === 0 ? C.ember : C.gold, 1);
                g.fillRect(x0 + x, y0, 8, 24);
                g.fillStyle(C.glow, 1); g.fillRect(x0 + x, y0, 8, 4);
            }
        };
        draw(0);
        this.load.on('progress', (p: number) => {
            draw(p);
            label.setText(`点燃灵火… ${Math.floor(p * 100)}%`);
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

    create ()
    {
        this.scene.start('MainMenu');
    }
}
