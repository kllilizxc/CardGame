import { type Textures, type Scene, type GameObjects } from 'phaser';
import { NEAREST, getWenxinMaterials, pixelSurface } from './WenxinArt';
import { pixelateImage } from '../pix';

let serial = 0;
/** Presentation only. Dialogue IDs, branching, rewards and persistence belong to StoryScene. */
export class WenxinStoryStage {
    private readonly portraits: { kind: string; image: GameObjects.Image; texture: Textures.CanvasTexture; surface: ReturnType<typeof pixelSurface> }[] = [];
    private readonly loadingPortraits = new Set<string>();
    private customPortrait?: GameObjects.Image;
    private requestedPortrait?: string;
    private elapsed = 0;
    private frame = -1;
    private speaking = 'deacon';
    private emotion = '';
    constructor(private readonly scene: Scene, private readonly bottom = scene.scale.height - 240) {
        const { width } = scene.scale;
        for (const [kind, x] of [['deacon', Math.round(width * 0.2 / 3) * 3], ['girl', Math.round(width * 0.8 / 3) * 3]] as const) {
            const surface = pixelSurface(192, 264);
            const texture = scene.textures.addCanvas(`wenxin:portrait:${++serial}`, surface.o)!;
            texture.setFilter(NEAREST);
            const image = scene.add.image(x, this.bottom, texture.key).setOrigin(.5, 1).setScale(3).setDepth(-5).setVisible(false);
            this.portraits.push({ kind, image, texture, surface });
        }
        scene.events.on('update', this.update, this);
        const cleanup = () => {
            scene.events.off('shutdown', cleanup);
            scene.events.off('destroy', cleanup);
            scene.events.off('update', this.update, this);
            for (const p of this.portraits) scene.textures.remove(p.texture.key);
            this.loadingPortraits.clear();
            this.customPortrait = undefined;
        };
        scene.events.once('shutdown', cleanup);
        scene.events.once('destroy', cleanup);
    }
    setNode(text: string, speakerId?: string, emotion = '', portraitAsset?: string) {
        if (portraitAsset && /^assets\/story\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/.test(portraitAsset)) {
            this.requestedPortrait = portraitAsset;
            for (const p of this.portraits) p.image.setVisible(false);
            this.showCustomPortrait(portraitAsset);
            return;
        }
        this.requestedPortrait = undefined;
        this.customPortrait?.setVisible(false);
        const inferFromText = speakerId === undefined;
        const girl = inferFromText && /少女|青玉铃|体弱|姑娘/.test(text);
        const elder = speakerId === 'npc_qingyun_elder_1'
            || inferFromText && /长老|执事|宗门|青云|问心|山门/.test(text);
        this.speaking = girl && speakerId !== 'npc_qingyun_elder_1' ? 'girl' : 'deacon';
        this.emotion = emotion;
        for (const p of this.portraits) {
            p.image.setVisible(p.kind === 'girl' ? girl : elder);
            p.image.setAlpha(p.kind === this.speaking ? 1 : .65);
        }
    }
    private showCustomPortrait(path: string) {
        const key = `story-portrait:${path}`;
        if (!this.scene.textures.exists(key)) {
            this.customPortrait?.setVisible(false);
            if (this.loadingPortraits.has(key)) return;
            this.loadingPortraits.add(key);
            this.scene.load.image(key, `/${path}`);
            this.scene.load.once(`filecomplete-image-${key}`, () => {
                this.loadingPortraits.delete(key);
                this.scene.textures.get(key).setFilter(NEAREST);
                if (this.requestedPortrait === path) this.showCustomPortrait(path);
            });
            this.scene.load.once('complete', () => this.loadingPortraits.delete(key));
            this.scene.load.start();
            return;
        }
        const { width } = this.scene.scale;
        const pixKey = pixelateImage(this.scene, key, `${key}:px`, 200, 250, 'contain');
        this.customPortrait ??= this.scene.add.image(0, 0, pixKey).setOrigin(.5, 1).setDepth(-5);
        this.customPortrait.setTexture(pixKey).setPosition(Math.round(width * 0.2 / 3) * 3, this.bottom)
            .setScale(3).setVisible(true);
    }
    /** Is a portrait on screen for the current page? */
    hasPortrait(): boolean {
        return Boolean(this.customPortrait?.visible) || this.portraits.some(p => p.image.visible);
    }
    private update(_time: number, delta: number) {
        this.elapsed += Math.min(delta, 100) / 1000;
        const frame = Math.floor(this.elapsed * 24); if (frame === this.frame) return; this.frame = frame;
        for (const p of this.portraits) if (p.image.active && p.image.visible) {
            const t = this.elapsed + (p.kind === 'girl' ? 1.2 : 0);
            getWenxinMaterials()!.portrait(p.surface, p.kind, {
                t, br: Math.sin(t * 1.8) * 1.4, sw: Math.sin(t * 1.3), bell: p.kind === 'girl' ? Math.sin(t * 1.6) * .1 : 0,
                blink: t % 4.3 < .13,
                mouth: p.kind === this.speaking && t % 1.8 < 1.1 ? (Math.sin(t * 13) > 0 ? 'a' : 'o') : '',
                expr: { eyes: /笑|喜/.test(this.emotion) ? 'smile' : 'open', brow: /忧|怕|惊/.test(this.emotion) ? 'worried' : 'neutral' },
            });
            p.texture.refresh();
        }
    }
}
