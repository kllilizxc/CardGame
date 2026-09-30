import Phaser from 'phaser';
import { INK, PX } from './palette';
import { Pix, bake, bayer, peaks, ridge, rng, snap } from './pix';

/**
 * Layered parallax landscapes painted procedurally on the art grid. Every layer is a
 * horizontally tiling strip, displayed as a TileSprite so clouds and mist can drift forever.
 */

export const ART_H = 360;
const PERIOD = 960; // tile width in art px (wider than any screen)

export type SkyMood = 'night' | 'dusk' | 'dawn' | 'storm' | 'day';

const SKIES: Record<SkyMood, number[]> = {
    night: [INK.void, INK.ink, INK.ink, INK.indigo, INK.indigo, INK.slate],
    dusk: [INK.ink, INK.plum, INK.plum, INK.wine, INK.cinnabar, INK.vermilion, INK.amber],
    dawn: [INK.indigo, INK.slate, INK.dusk, INK.mist, INK.haze, INK.bone],
    storm: [INK.void, INK.ink, INK.indigo, INK.grey, INK.slate],
    day: [INK.dusk, INK.mist, INK.mist, INK.haze, INK.haze, INK.bone],
};

/* ---------------------------------------------------------------- layer painters */

export function paintSky(mood: SkyMood, seed = 1, stars = true): Pix {
    const p = new Pix(PERIOD, ART_H);
    p.bands(0, ART_H, SKIES[mood]);
    if (stars && (mood === 'night' || mood === 'storm' || mood === 'dusk')) {
        const r = rng(seed);
        const n = mood === 'dusk' ? 50 : 220;
        for (let i = 0; i < n; i++) {
            const x = Math.floor(r() * PERIOD), y = Math.floor(r() * r() * ART_H * 0.7);
            const big = r() < 0.08;
            const c = r() < 0.2 ? INK.gold : r() < 0.5 ? INK.haze : INK.mist;
            p.px(x, y, c);
            if (big) { p.px(x - 1, y, INK.dusk).px(x + 1, y, INK.dusk).px(x, y - 1, INK.dusk).px(x, y + 1, INK.dusk); p.px(x, y, INK.paper); }
        }
    }
    return p;
}

/** A big round moon (or sun) with a dithered halo. */
export function paintOrb(r: number, body: number, shade: number, halo: number): Pix {
    const size = r * 4 + 2;
    const p = new Pix(size, size);
    const c = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c + 0.5, y - c + 0.5);
        if (d < r * 2 && d > r + 1) {
            const t = 1 - (d - r) / r;
            if (bayer(x, y) < t * t * 0.55) p.px(x, y, halo);
        }
    }
    p.disc(c, c, r, body);
    // craters / cloud streak
    const rr = rng(r * 13);
    for (let i = 0; i < 5; i++) {
        const a = rr() * Math.PI * 2, d = rr() * r * 0.6;
        p.disc(Math.round(c + Math.cos(a) * d), Math.round(c + Math.sin(a) * d), 1 + Math.floor(rr() * (r / 5)), shade);
    }
    // lit rim
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d <= r && d > r - 1.6 && x + y > 0) p.px(c + x, c + y, shade);
    }
    return p;
}

export interface RangeSpec {
    base: number;          // y of the valley floor line (art px)
    height: number;        // tallest peak height
    count: number;         // peaks per period
    fill: number;
    lit: number;           // slope facing the light
    rim?: number;          // top edge highlight
    snow?: number;         // snow cap colour (tall peaks only)
    seed: number;
    strata?: number;       // darker rock streaks
}

export function paintRange(s: RangeSpec): Pix {
    const p = new Pix(PERIOD, ART_H);
    const prof = peaks(PERIOD, s.seed, s.base, s.height, s.count);
    const r = rng(s.seed + 3);
    for (let x = 0; x < PERIOD; x++) {
        const top = Math.round(prof[x]);
        const prev = Math.round(prof[(x - 1 + PERIOD) % PERIOD]);
        const next = Math.round(prof[(x + 1) % PERIOD]);
        const litSide = next > top || prev > top + 0 && next >= top; // descending to the right = facing left light
        for (let y = Math.max(0, top); y < ART_H; y++) {
            let c = s.fill;
            const depth = y - top;
            if (litSide && depth < 26 && bayer(x, y) < 1 - depth / 26) c = s.lit;
            p.px(x, y, c);
        }
        if (s.rim !== undefined) p.px(x, top, s.rim);
        if (s.snow !== undefined && top < s.base - s.height * 0.62) {
            const cap = Math.round((s.base - s.height * 0.62 - top) * 0.5) + 1;
            for (let y = top; y < top + cap; y++) if (bayer(x, y) < 0.85 - (y - top) / (cap + 1) * 0.6) p.px(x, y, litSide ? s.snow : s.lit);
        }
    }
    if (s.strata !== undefined) {
        for (let i = 0; i < PERIOD / 6; i++) {
            const x = Math.floor(r() * PERIOD);
            const top = Math.round(prof[x]) + 3 + Math.floor(r() * 10);
            const len = 4 + Math.floor(r() * 16);
            let xx = x;
            for (let y = top; y < top + len; y++) { p.px(xx, y, s.strata); if (r() < 0.3) xx += r() < 0.5 ? -1 : 1; }
        }
    }
    return p;
}

/** Rolling cloud bank: puffy tops, flat bottom, one highlight row, optional underside. */
export function paintClouds(y: number, thickness: number, body: number, light: number, seed: number, under?: number): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(seed);
    const puffs: Array<[number, number, number]> = [];
    for (let x = 0; x < PERIOD; x += 10 + Math.floor(r() * 18)) puffs.push([x, y - Math.floor(r() * thickness * 0.8), 6 + Math.floor(r() * thickness * 0.7)]);
    for (const [cx, cy, rad] of puffs) for (const off of [-PERIOD, 0, PERIOD]) p.disc(cx + off, cy, rad, body);
    p.rect(0, y, PERIOD, thickness, body);
    p.rim(light, 1);
    if (under !== undefined) for (let x = 0; x < PERIOD; x++) p.px(x, y + thickness - 1, under);
    // clip to tile width
    return p;
}

/** Scattered cloud clusters: flat-bottomed, lit tops, a thin streak underneath. */
export function paintCloudPuffs(y: number, spread: number, body: number, light: number, seed: number, count = 7): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
        const cx = Math.floor((i + r() * 0.7) * (PERIOD / count));
        const cy = y + Math.floor((r() - 0.5) * spread);
        const w = 30 + Math.floor(r() * 70);
        const c = new Pix(w + 40, 40);
        const base = 30;
        for (let k = 0; k < 4 + Math.floor(w / 14); k++) {
            const px = 20 + Math.floor(r() * w), rad = 3 + Math.floor(r() * 7);
            c.ellipse(px, base - rad + 2, Math.round(rad * 1.9), rad, body);
        }
        c.rect(0, base + 1, w + 40, 40, -1);
        c.rim(light, 1);
        // streak
        c.rect(8, base + 2, w + 24, 1, body);
        c.rect(24, base + 4, w - 10, 1, body);
        p.blit(c, cx, cy - base);
        if (cx + w + 40 > PERIOD) p.blit(c, cx - PERIOD, cy - base);
    }
    return p;
}

/** Framing silhouettes: dark crags at both screen edges with overhanging pine boughs. */
export function paintFrame(color: number, seed: number): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(seed);
    const edge = ridge(PERIOD, seed, [[2, 30], [5, 12], [13, 4]]);
    for (let x = 0; x < PERIOD; x++) {
        const t = Math.round(330 + edge[x] * 0.6);
        p.rect(x, t, 1, ART_H - t, color);
    }
    for (let i = 0; i < 5; i++) {
        const x = Math.floor(r() * PERIOD);
        const h = 40 + Math.floor(r() * 70);
        const w = 10 + Math.floor(r() * 20);
        p.poly([[x - w, 360], [x - Math.floor(w / 3), 360 - h], [x + Math.floor(w / 4), 360 - h + 8], [x + w, 360]], color);
    }
    return p;
}

/** Horizontal mist band made of sparse dithered pixels (transparent between). */
export function paintMist(y: number, h: number, color: number, density = 0.5, seed = 5): Pix {
    const p = new Pix(PERIOD, ART_H);
    const wave = ridge(PERIOD, seed, [[3, 4], [7, 2], [13, 1]]);
    for (let yy = 0; yy < h; yy++) for (let x = 0; x < PERIOD; x++) {
        const mid = h / 2 + wave[x];
        const t = Math.max(0, 1 - Math.abs(yy - mid) / (h / 2)) * density;
        if (bayer(x, y + yy) < t) p.px(x, y + yy, color);
    }
    return p;
}

/** Pine / cypress silhouettes along a ground line, with a ground fill below. */
export function paintForest(ground: number, treeH: number, fill: number, rimC: number | undefined, seed: number, spacing = 9, groundFill = true): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(seed);
    const hills = ridge(PERIOD, seed + 1, [[4, 5], [9, 2]]);
    if (groundFill) for (let x = 0; x < PERIOD; x++) p.rect(x, Math.round(ground + hills[x]), 1, ART_H, fill);
    for (let x = 0; x < PERIOD; x += spacing + Math.floor(r() * spacing)) {
        const gh = Math.round(ground + hills[x]);
        const h = Math.round(treeH * (0.55 + r() * 0.6));
        pine(p, x, gh, h, fill);
        if (x + PERIOD - 20 < PERIOD + 20) pine(p, x + PERIOD, gh, h, fill);
    }
    if (rimC !== undefined) p.rim(rimC, 1);
    return p;
}

function pine(p: Pix, x: number, ground: number, h: number, c: number): void {
    const tiers = Math.max(2, Math.round(h / 10));
    const trunk = Math.max(2, Math.round(h * 0.12));
    const crown = h - trunk;
    for (let i = 0; i < tiers; i++) {
        const top = ground - h + Math.round((i / tiers) * crown * 0.7);
        const th = Math.round(crown / tiers) + 4;
        const hw = 2 + Math.round(((i + 1) / tiers) * h * 0.26);
        p.poly([[x + 0.5, top], [x + hw + 1, top + th], [x - hw, top + th]], c);
    }
    p.rect(x, ground - trunk, 1, trunk + 1, c);
}

/* ---------------------------------------------------------------- props */

/** Multi-roof pagoda silhouette with lit windows. */
export function paintPagoda(floors: number, body: number, roof: number, lamp: number): Pix {
    const w = 30, h = floors * 11 + 14;
    const p = new Pix(w, h);
    const cx = 15;
    p.rect(cx, 0, 1, 5, roof);
    p.px(cx, 0, lamp);
    for (let f = 0; f < floors; f++) {
        const y = 5 + f * 11;
        const half = 4 + f * 2;
        // roof with upturned eaves
        p.rect(cx - half - 3, y + 3, half * 2 + 7, 2, roof);
        p.rect(cx - half - 1, y + 1, half * 2 + 3, 2, roof);
        p.rect(cx - half + 1, y, half * 2 - 1, 1, roof);
        p.px(cx - half - 4, y + 2, roof).px(cx + half + 4, y + 2, roof);
        // wall
        p.rect(cx - half + 1, y + 5, half * 2 - 1, 6, body);
        for (let wx = cx - half + 3; wx < cx + half - 1; wx += 3) p.rect(wx, y + 7, 1, 2, lamp);
    }
    p.rect(cx - 4 - floors * 2, h - 3, (4 + floors * 2) * 2 + 1, 3, roof);
    return p.outline(INK.void);
}

/** Paifang (memorial archway) — the sect gate. */
export function paintArch(w: number, h: number, pillar: number, roof: number, plaque: number): Pix {
    const p = new Pix(w + 8, h + 4);
    const x0 = 4;
    const pw = Math.max(2, Math.round(w / 12));
    for (const px of [x0 + 2, x0 + w - 2 - pw, x0 + Math.round(w * 0.28), x0 + Math.round(w * 0.72) - pw]) p.rect(px, 8, pw, h - 4, pillar);
    p.rect(x0 - 3, 4, w + 6, 3, roof);
    p.rect(x0 - 1, 2, w + 2, 2, roof);
    p.px(x0 - 4, 3, roof).px(x0 + w + 3, 3, roof);
    p.rect(x0 + 2, 9, w - 4, 2, pillar);
    p.rect(x0 + Math.round(w * 0.36), 12, Math.round(w * 0.28), 6, plaque);
    p.rect(x0 + Math.round(w * 0.36) + 1, 13, Math.round(w * 0.28) - 2, 4, INK.umber);
    p.rect(x0 + 2, 19, w - 4, 1, roof);
    return p.outline(INK.void);
}

/** Red-crowned crane in flight (2 wing frames). */
export function paintCrane(frame: 0 | 1): Pix {
    const up = [
        '..........##.......',
        '.........###.......',
        '........####.......',
        '.......####........',
        '..rw..####.........',
        '.wwwwwwwwwwwwkkk...',
        '..kk.wwwwwww....k..',
        '.......k...k.......',
    ];
    const down = [
        '...................',
        '...................',
        '..rw...............',
        '.wwwwwwwwwwwwkkk...',
        '..kk.wwwwwww....k..',
        '......####k.k......',
        '.......####........',
        '........###........',
    ];
    const p = new Pix(19, 8);
    p.sprite(frame === 0 ? up : down, 0, 0, { '#': INK.bone, w: INK.paper, k: INK.void, r: INK.cinnabar });
    return p;
}

/* ---------------------------------------------------------------- composed backdrops */

export type BackdropKind = 'peaks' | 'forest' | 'cave' | 'hall' | 'sect' | 'arena' | 'river' | 'town';

export interface ParallaxLayer { key: string; drift: number; depth: number; parallax: number; y?: number }

export interface PBackdrop {
    layers: Phaser.GameObjects.TileSprite[];
    extras: Phaser.GameObjects.GameObject[];
    destroy(): void;
}

function layerSet(scene: Phaser.Scene, kind: BackdropKind, mood: SkyMood): ParallaxLayer[] {
    const k = (name: string) => `pxbg:${kind}:${mood}:${name}`;
    const out: ParallaxLayer[] = [];
    const add = (name: string, make: () => Pix, drift: number, parallax: number) => {
        out.push({ key: bake(scene, k(name), make), drift, depth: out.length, parallax });
    };
    const dusk = mood === 'dusk';
    const day = mood === 'day' || mood === 'dawn';
    const far = dusk ? INK.plum : day ? INK.mist : INK.slate;
    const farLit = dusk ? INK.wine : day ? INK.haze : INK.dusk;
    const mid = dusk ? INK.umber : day ? INK.dusk : INK.indigo;
    const midLit = dusk ? INK.plum : day ? INK.mist : INK.slate;
    const near = dusk ? INK.void : INK.ink;
    const cloud = dusk ? INK.wine : day ? INK.bone : INK.slate;
    const cloudLit = dusk ? INK.vermilion : day ? INK.paper : INK.dusk;

    switch (kind) {
        case 'town':
            add('sky', () => paintSky(mood, 13), 0.6, 0.01);
            add('clouds-far', () => paintCloudPuffs(70, 50, cloud, cloudLit, 23, 7), 3, 0.02);
            add('range-far', () => paintRange({ base: 200, height: 120, count: 6, fill: far, lit: farLit, rim: farLit, snow: day ? INK.paper : INK.haze, seed: 37, strata: mid }), 0, 0.03);
            add('range-mid', () => paintRange({ base: 230, height: 70, count: 8, fill: mid, lit: midLit, rim: midLit, seed: 57 }), 0, 0.06);
            break;
        case 'peaks':
        case 'sect':
        case 'river':
        default:
            add('sky', () => paintSky(mood, 11), 0.6, 0.01);
            add('clouds-far', () => paintCloudPuffs(110, 60, cloud, cloudLit, 21, 8), 3, 0.02);
            add('range-far', () => paintRange({ base: 250, height: 150, count: 7, fill: far, lit: farLit, rim: farLit, snow: day ? INK.paper : INK.haze, seed: 31, strata: mid }), 0, 0.03);
            add('mist-1', () => paintMist(215, 30, cloud, 0.35, 41), 6, 0.04);
            add('range-mid', () => paintRange({ base: 300, height: 110, count: 9, fill: mid, lit: midLit, rim: midLit, seed: 51, strata: near }), 0, 0.06);
            add('mist-2', () => paintMist(272, 26, cloud, 0.4, 61), 10, 0.08);
            add('forest', () => paintForest(318, 30, near, mid, 71, 7), 0, 0.12);
            add('frame', () => paintFrame(INK.void, 81), 0, 0.2);
            break;
        case 'forest':
            add('sky', () => paintSky(mood, 12, mood !== 'day'), 0.4, 0.01);
            add('range-far', () => paintRange({ base: 220, height: 80, count: 6, fill: far, lit: farLit, rim: farLit, seed: 33 }), 0, 0.02);
            add('trees-far', () => paintForest(230, 70, mid, midLit, 43, 5), 0, 0.04);
            add('mist-1', () => paintMist(205, 40, cloud, 0.3, 44), 8, 0.05);
            add('trees-mid', () => paintForest(290, 100, dusk ? INK.plum : INK.pine, dusk ? INK.wine : INK.jade, 53, 8), 0, 0.08);
            add('mist-2', () => paintMist(275, 30, cloud, 0.25, 64), 12, 0.1);
            add('trees-near', () => paintForest(345, 170, near, undefined, 73, 22), 0, 0.16);
            break;
        case 'cave':
            add('back', () => paintCave(mood), 0, 0.02);
            add('mist', () => paintMist(250, 70, INK.jade, 0.35, 47), 6, 0.05);
            add('front', () => paintCaveFront(), 0, 0.1);
            break;
        case 'hall':
            add('sky', () => paintSky('night', 14), 0.5, 0.01);
            add('hall', () => paintHall(), 0, 0.03);
            break;
        case 'arena':
            add('sky', () => paintSky(mood, 15), 0.5, 0.01);
            add('clouds-far', () => paintCloudPuffs(80, 50, cloud, cloudLit, 25, 7), 4, 0.02);
            add('range-far', () => paintRange({ base: 200, height: 120, count: 6, fill: far, lit: farLit, rim: farLit, snow: INK.haze, seed: 35, strata: mid }), 0, 0.03);
            add('sea', () => paintClouds(186, 180, cloud, cloudLit, 45, cloud), 8, 0.05);
            add('isles', () => paintIsles(mid, midLit), 5, 0.07);
            break;
    }
    return out;
}

function paintCave(mood: SkyMood): Pix {
    const p = new Pix(PERIOD, ART_H);
    p.bands(0, ART_H, mood === 'dusk' ? [INK.void, INK.umber, INK.plum] : [INK.void, INK.ink, INK.pine, INK.jade], 12);
    const r = rng(9);
    // crystal clusters
    for (let i = 0; i < 26; i++) {
        const x = Math.floor(r() * PERIOD), y = 120 + Math.floor(r() * 200), h = 6 + Math.floor(r() * 18);
        for (let k = 0; k < h; k++) p.rect(x - Math.floor((h - k) / 4), y - k, Math.floor((h - k) / 2) + 1, 1, k > h - 3 ? INK.frost : INK.teal);
        p.px(x, y - h, INK.frost);
    }
    const top = ridge(PERIOD, 91, [[6, 14], [15, 6], [37, 3]]);
    const bot = ridge(PERIOD, 92, [[5, 10], [11, 5]]);
    for (let x = 0; x < PERIOD; x++) {
        p.rect(x, 0, 1, Math.max(0, Math.round(50 + top[x])), INK.void);
        p.rect(x, Math.round(320 + bot[x]), 1, 60, INK.void);
    }
    // stalactites
    for (let i = 0; i < 60; i++) {
        const x = Math.floor(r() * PERIOD), len = 6 + Math.floor(r() * 40), y = Math.round(50 + top[x]);
        for (let k = 0; k < len; k++) p.rect(x - Math.max(0, Math.floor((len - k) / 8)), y + k, Math.max(1, Math.floor((len - k) / 4)), 1, INK.void);
    }
    return p;
}

function paintCaveFront(): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(19);
    const edge = ridge(PERIOD, 93, [[3, 30], [8, 12], [19, 5]]);
    for (let x = 0; x < PERIOD; x++) {
        const w = Math.max(0, Math.round(40 + edge[x]));
        if (x % PERIOD < 200 || x % PERIOD > PERIOD - 200) p.rect(x, 0, 1, ART_H, INK.void);
        else p.rect(x, 0, 1, Math.max(0, w - 20), INK.void);
    }
    for (let i = 0; i < 12; i++) {
        const x = Math.floor(r() * PERIOD);
        p.disc(x, 350, 10 + Math.floor(r() * 20), INK.void);
    }
    return p;
}

function paintHall(): Pix {
    const p = new Pix(PERIOD, ART_H);
    p.rect(0, 0, PERIOD, ART_H, INK.umber);
    // beams + pillars + lattice windows
    for (let x = 0; x < PERIOD; x += 160) {
        p.rect(x + 10, 0, 16, ART_H, INK.wine).rect(x + 10, 0, 2, ART_H, INK.cinnabar).rect(x + 24, 0, 2, ART_H, INK.plum);
        const wx = x + 50;
        p.rect(wx, 90, 80, 150, INK.bark).rect(wx + 3, 93, 74, 144, INK.amber);
        for (let gx = wx + 3; gx < wx + 77; gx += 10) p.rect(gx, 93, 2, 144, INK.bark);
        for (let gy = 93; gy < 237; gy += 12) p.rect(wx + 3, gy, 74, 2, INK.bark);
        // lantern
        p.rect(x + 88, 0, 1, 40, INK.void);
        p.ellipse(x + 88, 48, 8, 10, INK.cinnabar);
        p.rect(x + 82, 46, 13, 1, INK.vermilion).rect(x + 84, 38, 9, 2, INK.void).rect(x + 84, 58, 9, 2, INK.void);
    }
    p.rect(0, 0, PERIOD, 24, INK.void).rect(0, 22, PERIOD, 4, INK.wine).rect(0, 26, PERIOD, 1, INK.cinnabar);
    p.rect(0, 270, PERIOD, 90, INK.bark).rect(0, 270, PERIOD, 2, INK.clay);
    for (let y = 280; y < ART_H; y += 10) p.rect(0, y, PERIOD, 1, INK.umber);
    return p;
}

function paintIsles(fill: number, lit: number): Pix {
    const p = new Pix(PERIOD, ART_H);
    const r = rng(77);
    for (let i = 0; i < 6; i++) {
        const cx = 60 + i * 160 + Math.floor(r() * 60), cy = 150 + Math.floor(r() * 40), w = 18 + Math.floor(r() * 26);
        const isle = new Pix(w * 2 + 6, w * 2);
        isle.ellipse(w + 3, 6, w, 5, lit);
        for (let k = 0; k < w; k++) isle.rect(w + 3 - (w - k), 8 + Math.floor(k * 0.8), (w - k) * 2, 1, fill);
        isle.poly([[w + 3 - w, 6], [w + 3 + w, 6], [w + 3, 6 + w * 1.4]], fill);
        isle.rect(0, 0, w * 2 + 6, 5, -1);
        for (let t = 0; t < 4; t++) pine(isle, w + 3 - w + 6 + t * Math.floor(w / 2), 6, 7 + Math.floor(r() * 6), lit === INK.slate ? INK.indigo : INK.pine);
        isle.outline(INK.void);
        p.blit(isle, cx - w, cy - 10);
    }
    return p;
}

const opaqueTops = new Map<string, number>();
function opaqueTopOf(scene: Phaser.Scene, key: string): number {
    const cached = opaqueTops.get(key);
    if (cached !== undefined) return cached;
    const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
    let top = 0;
    const ctx = src.getContext?.('2d');
    if (ctx) {
        const d = ctx.getImageData(0, 0, src.width, src.height).data;
        top = src.height;
        outer: for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x += 2) if (d[(y * src.width + x) * 4 + 3] > 0) { top = y; break outer; }
        top = Math.max(0, Math.min(src.height - 1, top));
    }
    opaqueTops.set(key, top);
    return top;
}

/**
 * Add a full-screen parallax backdrop. Layers tile horizontally, drift slowly, and follow the
 * pointer a touch for depth. Returns a handle for teardown.
 */
export function addBackdrop(scene: Phaser.Scene, kind: BackdropKind, mood: SkyMood = 'night', opts: { depth?: number; pointer?: boolean } = {}): PBackdrop {
    const { width, height } = scene.scale;
    const aw = Math.ceil(width / PX) + 2;
    const baseDepth = opts.depth ?? -1000;
    const specs = layerSet(scene, kind, mood);
    const artOffsetY = Math.round((height / PX - ART_H) / 2);
    const layers = specs.map((s, i) => {
        // Only cover the rows that hold pixels: far less overdraw for mostly-empty layers.
        const top = i === 0 ? 0 : opaqueTopOf(scene, s.key);
        return scene.add.tileSprite(-PX, (artOffsetY + top) * PX, aw, ART_H - top, s.key)
            .setOrigin(0, 0).setScale(PX).setDepth(baseDepth + i).setTilePosition(i * 97, top);
    });
    const extras: Phaser.GameObjects.GameObject[] = [];

    let px = 0;
    const onMove = (p: Phaser.Input.Pointer) => { px = (p.x / width - 0.5) * 2; };
    if (opts.pointer !== false) scene.input.on('pointermove', onMove);
    const onUpdate = (_t: number, dt: number) => {
        specs.forEach((s, i) => {
            const L = layers[i];
            if (!L.active) return;
            (L as unknown as { _drift?: number })._drift = ((L as unknown as { _drift?: number })._drift ?? i * 97) + (s.drift * dt) / 1000;
            const drift = (L as unknown as { _drift: number })._drift;
            L.tilePositionX = Math.round(drift + px * s.parallax * 200);
        });
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    const destroy = () => {
        scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
        scene.input?.off('pointermove', onMove);
        layers.forEach((l) => l.destroy());
        extras.forEach((e) => e.destroy());
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
    return { layers, extras, destroy };
}

/** Drifting motes: fireflies / embers / snow / petals, pure pixels. */
export function addMotes(scene: Phaser.Scene, kind: 'firefly' | 'ember' | 'snow' | 'spirit' | 'ash', depth = -10, rate = 260): Phaser.Time.TimerEvent {
    const { width, height } = scene.scale;
    const colors = { firefly: [INK.gold, INK.spirit], ember: [INK.amber, INK.vermilion, INK.gold], snow: [INK.paper, INK.haze], spirit: [INK.spirit, INK.frost], ash: [INK.ash, INK.mist] }[kind];
    return scene.time.addEvent({
        delay: rate, loop: true,
        callback: () => {
            const up = kind === 'ember' || kind === 'spirit' || kind === 'firefly';
            const x = Math.random() * width;
            const y = kind === 'firefly' ? height * (0.45 + Math.random() * 0.5) : up ? height + 6 : -6;
            const s = Math.random() < 0.25 ? PX * 2 : PX;
            const m = scene.add.rectangle(snap(x), snap(y), s, s, colors[Math.floor(Math.random() * colors.length)]).setDepth(depth);
            const dur = kind === 'firefly' ? 2600 + Math.random() * 2400 : 5000 + Math.random() * 5000;
            scene.tweens.add({
                targets: m,
                x: snap(x + (Math.random() - 0.5) * 240),
                y: kind === 'firefly' ? snap(y - 60 - Math.random() * 120) : up ? -10 : height + 10,
                alpha: kind === 'firefly' ? { from: 0, to: 1 } : { from: 1, to: 0.3 },
                yoyo: kind === 'firefly',
                duration: dur,
                ease: 'Sine.easeInOut',
                onComplete: () => m.destroy(),
            });
        },
    });
}
