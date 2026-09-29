import Phaser from 'phaser';
import { PALETTE } from './palette';

const frag = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec3 uPal[32];
uniform vec2 uRes;
uniform float uTime;
varying vec2 outTexCoord;

float bayer(vec2 p) {
    vec2 q = mod(floor(p / 2.0), 4.0);
    float x0 = mod(q.x, 2.0); float x1 = floor(q.x / 2.0);
    float y0 = mod(q.y, 2.0); float y1 = floor(q.y / 2.0);
    float a0 = mod(x0 + y0, 2.0); float a1 = mod(x1 + y1, 2.0);
    return (a0 * 8.0 + y0 * 4.0 + a1 * 2.0 + y1) / 16.0;
}

void main() {
    vec2 uv = outTexCoord;
    vec4 tex = texture2D(uMainSampler, uv);
    vec3 c = tex.rgb;

    // vignette + slow candle-flicker breathing
    vec2 d = uv - 0.5;
    float vig = 1.0 - dot(d, d) * (0.95 + 0.03 * sin(uTime * 1.7));
    c *= clamp(vig, 0.0, 1.0);

    // ordered dither so smooth gradients become pixel-art bands
    float t = bayer(gl_FragCoord.xy) - 0.5;
    c += t * 0.075;

    // snap to nearest palette colour
    float best = 1e9;
    vec3 pick = uPal[0];
    for (int i = 0; i < 32; i++) {
        vec3 p = uPal[i];
        vec3 df = (c - p) * vec3(0.9, 1.15, 0.8);
        float dist = dot(df, df);
        if (dist < best) { best = dist; pick = p; }
    }
    gl_FragColor = vec4(pick, tex.a);
}
`;

export class PaletteFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    private palette: Float32Array;

    constructor(game: Phaser.Game) {
        super({ game, name: 'PaletteFX', fragShader: frag });
        this.palette = new Float32Array(PALETTE.length * 3);
        PALETTE.forEach((c, i) => {
            this.palette[i * 3] = ((c >> 16) & 0xff) / 255;
            this.palette[i * 3 + 1] = ((c >> 8) & 0xff) / 255;
            this.palette[i * 3 + 2] = (c & 0xff) / 255;
        });
    }

    onPreRender(): void {
        this.set3fv('uPal', this.palette);
        this.set2f('uRes', this.renderer.width, this.renderer.height);
        this.set1f('uTime', this.game.loop.time / 1000);
    }
}

/** Attach the palette shader to a scene's main camera (no-op on Canvas renderer). */
export function applyPaletteFX(scene: Phaser.Scene): void {
    if (scene.game.renderer.type !== Phaser.WEBGL) return;
    scene.cameras.main.setPostPipeline(PaletteFX);
}
