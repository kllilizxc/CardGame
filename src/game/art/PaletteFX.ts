import Phaser from 'phaser';
import { PALETTE, PX } from './palette';

const N = 32;

/**
 * The final look of every frame:
 *  1. pixelate — the canvas is sampled once per 3x3 block, so anything (rotated cards, scaled
 *     tweens, text) lands on the same 640x360 art grid as the hand-authored sprites;
 *  2. soft vignette to pull the eye to the centre;
 *  3. snap to the 墨砂 palette.
 */
const frag = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec3 uPal[${N}];
uniform vec2 uRes;
uniform float uPx;
uniform float uVig;
varying vec2 outTexCoord;

void main() {
    vec2 cell = floor(gl_FragCoord.xy / uPx) * uPx + uPx * 0.5;
    vec2 uv = cell / uRes;
    vec4 tex = texture2D(uMainSampler, uv);
    vec3 c = tex.rgb;

    vec2 d = uv - 0.5;
    c *= clamp(1.0 - dot(d, d) * uVig, 0.0, 1.0);

    float best = 1e9;
    vec3 pick = uPal[0];
    for (int i = 0; i < ${N}; i++) {
        vec3 p = uPal[i];
        vec3 df = (c - p) * vec3(0.95, 1.2, 0.75);
        float dist = dot(df, df);
        if (dist < best) { best = dist; pick = p; }
    }
    gl_FragColor = vec4(pick, 1.0);
}
`;

export class PaletteFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    private palette: Float32Array;
    vignette = 0;

    constructor(game: Phaser.Game) {
        super({ game, name: 'PaletteFX', fragShader: frag });
        this.palette = new Float32Array(N * 3);
        const padded = Array.from({ length: N }, (_, i) => PALETTE[Math.min(i, PALETTE.length - 1)]);
        padded.forEach((c, i) => {
            this.palette[i * 3] = ((c >> 16) & 0xff) / 255;
            this.palette[i * 3 + 1] = ((c >> 8) & 0xff) / 255;
            this.palette[i * 3 + 2] = (c & 0xff) / 255;
        });
    }

    onPreRender(): void {
        this.set3fv('uPal', this.palette);
        this.set2f('uRes', this.renderer.width, this.renderer.height);
        this.set1f('uPx', PX);
        this.set1f('uVig', this.vignette);
    }
}

/** Attach the palette shader to a scene's main camera (no-op on Canvas renderer). */
export function applyPaletteFX(scene: Phaser.Scene): void {
    if (scene.game.renderer.type !== Phaser.WEBGL) return;
    if (typeof location !== 'undefined' && location.search.includes('nofx')) return; // dev: skip the palette pass
    scene.cameras.main.setPostPipeline(PaletteFX);
}
