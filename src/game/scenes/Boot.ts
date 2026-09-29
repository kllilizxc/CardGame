import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        this.load.image('background', 'assets/bg.png');
    }

    create ()
    {
        // The pixel font must be ready before any Text is rendered, or glyphs bake in a fallback face.
        const start = () => this.scene.start('Preloader');
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (!fonts) {
            start();
            return;
        }
        Promise.race([
            fonts.load('12px Zpix', '青云卡牌0123456789'),
            new Promise((resolve) => window.setTimeout(resolve, 6000)),
        ]).then(start, start);
    }
}
