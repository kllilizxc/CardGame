import Phaser from 'phaser';
import { C } from './palette';

/**
 * Procedurally baked pixel sprites: icons, card frames and per-card "spirit avatars".
 * Everything is drawn on tiny canvases and displayed with nearest-neighbour scaling.
 */

const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

export const mix = (a: number, b: number, t: number): number => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
};

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function rand(seed: number) {
    let s = seed || 1;
    return () => {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

class Pix {
    ctx: CanvasRenderingContext2D;
    w: number; h: number;
    constructor(public tex: Phaser.Textures.CanvasTexture) {
        this.ctx = tex.getContext();
        this.w = tex.width; this.h = tex.height;
    }
    px(x: number, y: number, c: number) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        this.ctx.fillStyle = css(c);
        this.ctx.fillRect(x | 0, y | 0, 1, 1);
    }
    rect(x: number, y: number, w: number, h: number, c: number) {
        this.ctx.fillStyle = css(c);
        this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    }
    line(x0: number, y0: number, x1: number, y1: number, c: number) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        for (;;) {
            this.px(x0, y0, c);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }
    disc(cx: number, cy: number, r: number, c: number) {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c);
    }
    get(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
        return this.ctx.getImageData(x, y, 1, 1).data[3];
    }
    /** 1px dark outline around every opaque pixel. */
    outline(color = C.void) {
        const img = this.ctx.getImageData(0, 0, this.w, this.h);
        const a = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : img.data[(y * this.w + x) * 4 + 3]);
        const todo: [number, number][] = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (a(x, y) === 0 && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) todo.push([x, y]);
        }
        todo.forEach(([x, y]) => this.px(x, y, color));
    }
    done() { this.tex.refresh(); }
}

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (p: Pix) => void): string {
    if (scene.textures.exists(key)) return key;
    const tex = scene.textures.createCanvas(key, w, h)!;
    const p = new Pix(tex);
    draw(p);
    p.done();
    return key;
}

function grid(p: Pix, rows: string[], map: Record<string, number>, ox = 0, oy = 0) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (map[ch] !== undefined) p.px(ox + x, oy + y, map[ch]); }));
}

// ------------------------------------------------------------------ icons
export type IconName = 'sword' | 'heart' | 'star' | 'pill' | 'talisman' | 'mountain' | 'artifact' | 'drop' | 'skull'
    | 'shield' | 'plus' | 'flame' | 'crack' | 'down' | 'snow' | 'ban' | 'bolt' | 'target' | 'ghost' | 'blood' | 'thorn';

/** Status effect id → icon. */
export const STATUS_ICON: Record<string, IconName> = {
    armor: 'shield', defense_boost: 'shield', attack_boost: 'sword', regeneration: 'plus', immunity_poison: 'pill',
    poison: 'skull', burn: 'flame', vulnerable: 'crack', weak: 'down', frozen: 'snow', sealed: 'ban',
    sword_mark: 'bolt', taunt: 'target', stealth: 'ghost', bleed: 'blood', thorns: 'thorn',
};

export function iconTexture(scene: Phaser.Scene, name: IconName): string {
    return bake(scene, `ico_${name}`, 16, 16, (p) => {
        switch (name) {
            case 'sword':
                p.line(13, 2, 5, 10, C.paper); p.line(14, 3, 6, 11, C.fog); p.line(12, 2, 4, 10, C.fog);
                p.line(4, 7, 9, 12, C.gold); p.line(5, 7, 10, 12, C.ember);
                p.line(5, 11, 3, 13, C.bark); p.line(6, 12, 4, 14, C.umber);
                p.px(2, 14, C.gold); p.px(3, 14, C.gold);
                p.px(13, 3, C.paper);
                break;
            case 'heart':
                grid(p, ['.rr.rr.', 'rhrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: C.cinnabar, h: C.petal }, 4, 4);
                for (const [x, y] of [[4, 5], [10, 5]]) p.px(x, y, C.cinnabar);
                p.px(9, 8, C.crimson); p.px(8, 9, C.crimson); p.px(9, 7, C.crimson); p.px(10, 6, C.crimson);
                break;
            case 'star':
                grid(p, ['...y...', '..yyy..', 'yyyyyyy', '.yyhyy.', '.yy.yy.', 'yy...yy'], { y: C.gold, h: C.glow }, 4, 4);
                break;
            case 'pill': {
                for (let i = 0; i <= 14; i++) {
                    const x = 3 + i * 0.62, y = 12 - i * 0.62;
                    p.disc(Math.round(x), Math.round(y), 2, i < 7 ? C.paper : C.cinnabar);
                }
                p.line(5, 9, 8, 6, C.fog);
                p.px(11, 4, C.petal); p.px(10, 5, C.petal);
                break;
            }
            case 'talisman':
                p.rect(4, 1, 8, 13, C.parchment); p.rect(4, 1, 8, 2, C.cinnabar);
                p.rect(7, 4, 2, 8, C.cinnabar); p.rect(5, 6, 6, 1, C.cinnabar); p.rect(5, 9, 6, 1, C.cinnabar);
                p.px(6, 11, C.cinnabar); p.px(9, 11, C.cinnabar);
                p.px(4, 13, C.wood); p.px(11, 13, C.wood);
                p.px(8, 14, C.gold); p.px(8, 15, C.gold);
                break;
            case 'mountain':
                p.disc(11, 5, 2, C.gold);
                for (let x = 0; x < 16; x++) {
                    const h = Math.max(0, 9 - Math.abs(x - 5) * 1.3);
                    const h2 = Math.max(0, 7 - Math.abs(x - 11) * 1.4);
                    const t = Math.max(h, h2);
                    for (let y = 0; y < t; y++) p.px(x, 12 - y, y > t - 2 && t > 6 ? C.paper : x < 6 ? C.mist : C.haze);
                }
                p.rect(0, 13, 16, 2, C.azure);
                p.px(3, 14, C.sky); p.px(9, 14, C.sky);
                break;
            case 'artifact':
                p.disc(8, 8, 6, C.jade);
                p.ctx.clearRect(7, 7, 3, 3);
                p.px(4, 4, C.lime); p.px(5, 3, C.lime); p.px(4, 5, C.lime); p.px(3, 6, C.lime);
                for (let a = 0; a < 6.3; a += 0.3) p.px(Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), C.gold);
                break;
            case 'drop':
                grid(p, ['...s...', '..sss..', '.ssiss.', 'ssiisss', 'sssssss', '.sssss.', '..sss..'], { s: C.sky, i: C.ice }, 4, 4);
                break;
            case 'skull':
                grid(p, ['.wwwww.', 'wwwwwww', 'wkwwwkw', 'wwwkwww', '.wwwww.', '.w.w.w.'], { w: C.paper, k: C.void }, 4, 5);
                break;
            case 'shield':
                for (let y = 2; y <= 13; y++) {
                    const half = y < 9 ? 5 : Math.max(0, 5 - (y - 8));
                    for (let x = -half; x <= half; x++) p.px(8 + x, y, Math.abs(x) >= half - 0 ? C.fog : x < 0 ? C.sky : C.azure);
                }
                p.rect(7, 4, 2, 6, C.ice);
                break;
            case 'plus':
                p.rect(6, 2, 4, 12, C.jade); p.rect(2, 6, 12, 4, C.jade);
                p.rect(6, 2, 2, 12, C.lime); p.rect(2, 6, 12, 2, C.lime);
                break;
            case 'flame':
                for (let y = 2; y <= 14; y++) {
                    const t = (y - 2) / 12;
                    const half = Math.round(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62) * 5);
                    for (let x = -half; x <= half; x++) p.px(8 + x, y, t > 0.65 ? C.gold : t > 0.35 ? C.ember : C.cinnabar);
                }
                p.disc(8, 11, 2, C.glow);
                break;
            case 'crack':
                grid(p, ['.rr.rr.', 'rhrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], { r: C.crimson, h: C.petal }, 4, 4);
                p.line(8, 5, 7, 8, C.void); p.line(7, 8, 9, 10, C.void);
                break;
            case 'down':
                for (let y = 3; y <= 9; y++) for (let x = -(9 - y); x <= 9 - y; x++) p.px(8 + x, y + 2, y < 6 ? C.cinnabar : C.crimson);
                p.rect(6, 2, 4, 5, C.cinnabar);
                break;
            case 'snow':
                p.line(8, 1, 8, 14, C.ice); p.line(2, 4, 14, 11, C.ice); p.line(2, 11, 14, 4, C.ice);
                p.px(8, 1, C.paper); p.px(8, 14, C.paper); p.disc(8, 8, 1, C.paper);
                break;
            case 'ban':
                for (let a = 0; a < 6.3; a += 0.12) for (const r of [6, 5]) p.px(Math.round(8 + Math.cos(a) * r), Math.round(8 + Math.sin(a) * r), C.cinnabar);
                p.line(4, 12, 12, 4, C.cinnabar); p.line(4, 11, 11, 4, C.crimson);
                break;
            case 'bolt':
                p.line(10, 1, 5, 8, C.gold); p.line(11, 1, 6, 8, C.gold); p.line(5, 8, 10, 8, C.gold); p.line(10, 8, 6, 15, C.gold); p.line(11, 8, 7, 15, C.ember);
                p.px(10, 2, C.glow); p.px(9, 4, C.glow);
                break;
            case 'target':
                p.disc(8, 8, 6, C.cinnabar); p.disc(8, 8, 4, C.paper); p.disc(8, 8, 3, C.cinnabar); p.disc(8, 8, 1, C.paper);
                break;
            case 'ghost':
                p.rect(4, 3, 8, 10, C.paper); p.rect(5, 2, 6, 1, C.paper); p.rect(3, 6, 10, 6, C.paper);
                for (let x = 3; x < 13; x += 2) p.rect(x, 13, 1, 2, C.paper);
                p.rect(5, 6, 2, 2, C.void); p.rect(9, 6, 2, 2, C.void);
                break;
            case 'blood':
                grid(p, ['...s...', '..sss..', '.ssiss.', 'ssiisss', 'sssssss', '.sssss.', '..sss..'], { s: C.cinnabar, i: C.petal }, 4, 4);
                break;
            case 'thorn':
                p.rect(7, 4, 3, 10, C.jade); p.rect(7, 4, 1, 10, C.lime);
                p.line(7, 8, 3, 5, C.jade); p.line(9, 10, 13, 7, C.jade); p.line(7, 12, 3, 10, C.jade);
                p.px(3, 4, C.paper); p.px(13, 6, C.paper); p.px(3, 9, C.paper); p.px(8, 3, C.paper);
                break;

        }
        p.outline();
    });
}

// ------------------------------------------------------------------ avatars
const FAMILIES: [number, number, number, number][] = [
    [C.lime, C.jade, C.moss, C.glow],       // wood / jade spirits
    [C.gold, C.ember, C.cinnabar, C.paper], // fire
    [C.ice, C.sky, C.azure, C.paper],       // water / ice
    [C.petal, C.magenta, C.orchid, C.glow], // demon / spirit
    [C.paper, C.fog, C.mist, C.cinnabar],   // bone / ghost
    [C.parchment, C.wood, C.bark, C.glow],  // earth
    [C.glow, C.gold, C.ember, C.cinnabar],  // metal / lightning
];

export function avatarTexture(scene: Phaser.Scene, seedStr: string, race = ''): string {
    const key = `av_${hashStr(seedStr + '|' + race)}`;
    return bake(scene, key, 14, 16, (p) => {
        const r = rand(hashStr(seedStr) ^ 0x9e3779b9);
        const fam = FAMILIES[hashStr(race || seedStr) % FAMILIES.length];
        const W = 12, H = 14, half = 6;
        const m: boolean[][] = Array.from({ length: H }, () => Array(W).fill(false));
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < half; x++) {
                const cx = half - 1 - x; // distance from centre line
                const rowShape = y < 5 ? 0.86 - cx * 0.16 : y < 11 ? 0.92 - cx * 0.1 : 0.7 - cx * 0.13;
                if (r() < rowShape && y > 0 && !(y < 2 && cx > 2)) { m[y][x] = true; m[y][W - 1 - x] = true; }
            }
        }
        // keep the eyes region solid, add a horn/crest sometimes
        for (let y = 3; y <= 6; y++) for (let x = 2; x <= 5; x++) { m[y][x] = true; m[y][W - 1 - x] = true; }
        if (r() < 0.6) { m[0][2] = m[0][W - 3] = true; m[1][2] = m[1][W - 3] = true; }
        if (r() < 0.5) { m[0][half - 1] = m[0][half] = true; }
        // drop pixels not connected to the centre column body
        const seen = m.map((row) => row.map(() => false));
        const stack: [number, number][] = [[half, 4]];
        while (stack.length) {
            const [x, y] = stack.pop()!;
            if (x < 0 || y < 0 || x >= W || y >= H || seen[y][x] || !m[y][x]) continue;
            seen[y][x] = true;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!seen[y][x]) continue;
            const above = y > 0 && seen[y - 1][x];
            const below = y < H - 1 && seen[y + 1][x];
            let c = fam[1];
            if (!above) c = fam[0];
            else if (!below) c = fam[2];
            else if (((x + y) & 1) === 0 && r() < 0.3) c = fam[2];
            else if (x === 2 || x === W - 3) c = fam[0] === c ? c : fam[1];
            p.px(x + 1, y + 1, c);
        }
        // glowing eyes
        for (const ex of [3, W - 4]) { p.px(ex + 1, 5 + 1, fam[3]); p.px(ex + 1, 4 + 1, fam[3]); }
        p.px(half + 1, 8 + 1, fam[3]); // core
        p.px(half + 2, 8 + 1, fam[3]);
        p.outline();
    });
}

/** Dithered radial glow behind a portrait, tinted by the card's rarity colour (36x16 art px). */
export function auraTexture(scene: Phaser.Scene, color: number): string {
    return bake(scene, `aura_${color.toString(16)}`, 36, 16, (p) => {
        const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 36; x++) {
            const dx = (x - 17.5) / 18, dy = (y - 7.5) / 8;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d >= 1) continue;
            const t = (1 - d) * 1.05;
            const th = B[(y & 3) * 4 + (x & 3)] / 16;
            if (t > th) p.px(x, y, t > 0.55 ? mix(color, C.void, 0.55) : mix(color, C.void, 0.75));
            else if (t > 0.9) p.px(x, y, mix(color, C.void, 0.4));
        }
    });
}

// ------------------------------------------------------------------ card frames
export const CARD_ART_W = 45;
export const CARD_ART_H = 65;

/**
 * Baked card frame. 45x65 art pixels → scaled x4 = 180x260, the card's native size.
 * `window` adds a portrait window (unit / artifact / pill / talisman cards).
 */
export function cardFrameTexture(scene: Phaser.Scene, border: number, face: number, portrait = true): string {
    const key = `cf_${border.toString(16)}_${face.toString(16)}_${portrait ? 1 : 0}`;
    return bake(scene, key, CARD_ART_W, CARD_ART_H, (p) => {
        const W = CARD_ART_W, H = CARD_ART_H;
        const hi = mix(border, C.paper, 0.45);
        const lo = mix(border, C.void, 0.55);
        const faceHi = mix(face, C.paper, 0.10);
        const faceLo = mix(face, C.void, 0.45);
        // outline w/ stepped corners
        p.rect(1, 0, W - 2, H, C.void); p.rect(0, 1, W, H - 2, C.void);
        // border ring (2px)
        p.rect(2, 1, W - 4, H - 2, border); p.rect(1, 2, W - 2, H - 4, border);
        p.rect(2, 1, W - 4, 1, hi); p.rect(1, 2, 1, H - 4, hi);
        p.rect(2, H - 2, W - 4, 1, lo); p.rect(W - 2, 2, 1, H - 4, lo);
        // face
        for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
            const t = (y - 3) / (H - 6);
            let c = t < 0.2 ? faceHi : face;
            if (t > 0.7 && ((x + y) & 1) === 0) c = faceLo;
            if (t > 0.85) c = faceLo;
            p.px(x, y, c);
        }
        p.rect(3, 3, W - 6, 1, mix(face, C.void, 0.3));
        p.rect(3, H - 4, W - 6, 1, mix(face, C.void, 0.6));
        // name ribbon
        p.rect(4, 4, W - 8, 6, mix(face, C.void, 0.6));
        p.rect(4, 4, W - 8, 1, mix(border, C.void, 0.3));
        p.rect(4, 9, W - 8, 1, mix(border, C.void, 0.3));
        p.px(4, 4, C.void); p.px(W - 5, 4, C.void); p.px(4, 9, C.void); p.px(W - 5, 9, C.void);
        // gold studs in the corners
        for (const [x, y] of [[1, 1], [W - 3, 1], [1, H - 3], [W - 3, H - 3]]) { p.rect(x, y, 2, 2, C.gold); p.px(x, y, C.glow); }
        // portrait window
        if (portrait) {
            p.rect(4, 21, W - 8, 18, C.void);
            p.rect(5, 22, W - 10, 16, mix(face, C.void, 0.35));
            for (let y = 22; y < 38; y++) for (let x = 5; x < W - 5; x++) if (((x + y) & 1) === 0 && y > 30) p.px(x, y, mix(face, C.void, 0.5));
            p.rect(4, 21, W - 8, 1, lo); p.rect(4, 38, W - 8, 1, hi);
        }
        // stat well
        p.rect(3, H - 12, W - 6, 1, mix(border, C.void, 0.4));
    });
}
