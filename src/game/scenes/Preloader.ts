import { Scene } from 'phaser';
import { ensureWenxinArt } from '../art/wenxin/WenxinArt';
import { resolvePreviewHubActionLaunch } from '../services/PreviewEntry';

import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
} from '../content/contentCatalog';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor('#20282e');
        this.add.text(width / 2, height / 2 - 100, '青云问道', { fontFamily: 'serif', fontSize: '48px', color: '#dfc99f' }).setOrigin(.5);
        this.add.rectangle(width / 2, height / 2, 604, 20).setStrokeStyle(2, 0xc6aa7a);
        const bar = this.add.rectangle(width / 2 - 296, height / 2, 4, 12, 0x849a8d).setOrigin(0, .5);
        this.load.on('progress', (progress: number) => { bar.width = 4 + 588 * progress; });
    }

    preload ()
    {
        //  Load runtime metadata before any gameplay scene needs catalog-backed resource resolution.
        this.load.json(CONTENT_CATALOG_CACHE_KEY, CONTENT_CATALOG_PUBLIC_PATH);

        //  Load the assets for the game - Replace with your own assets
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
            if (!this.sys.isActive()) return;
            const previewLaunch = resolvePreviewHubActionLaunch(
                typeof location === 'undefined' ? '' : location.search,
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            );
            if (previewLaunch) this.scene.start('HubScene', previewLaunch);
            else this.scene.start('MainMenu');
        } catch (error) {
            label.setText('素材未能载入，点击重试').setInteractive({ useHandCursor: true });
            label.once('pointerdown', () => this.scene.restart());
            console.error(error);
        }
    }
}
