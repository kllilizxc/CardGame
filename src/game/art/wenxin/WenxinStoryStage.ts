import { type Textures, type Scene, type GameObjects } from 'phaser';
import { NEAREST, getWenxinMaterials, pixelSurface } from './WenxinArt';

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
    constructor(private readonly scene: Scene) {
        for (const [kind, x] of [['deacon', 420], ['girl', 1490]] as const) {
            const surface = pixelSurface(192, 264);
            const texture = scene.textures.addCanvas(`wenxin:portrait:${++serial}`, surface.o)!;
            texture.setFilter(NEAREST);
            const image = scene.add.image(x, 225, texture.key).setOrigin(.5, 0).setScale(2.65).setDepth(-5).setVisible(false);
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
        const { width, height } = this.scene.scale;
        const portrait = height > width;
        const source = this.scene.textures.get(key).getSourceImage();
        // The portrait viewport has a shallow header above the dialogue panel.
        // Keep the NPC visible there instead of placing it behind the panel.
        const scale = Math.min((portrait ? 150 : 730) / source.height, (portrait ? width * .28 : 540) / source.width);
        this.customPortrait ??= this.scene.add.image(0, 0, key).setOrigin(.5, 0).setDepth(-5);
        this.customPortrait.setTexture(key).setPosition(portrait ? width - 68 : 410, portrait ? 2 : 170)
            .setScale(scale).setVisible(true);
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
