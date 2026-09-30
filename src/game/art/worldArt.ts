import { INK } from './palette';
import { Pix, bayer, rng } from './pix';

/* ------------------------------------------------------------------------------------------ *
 * 2D value noise
 * ------------------------------------------------------------------------------------------ */

export function noise2(seed: number): (x: number, y: number) => number {
    const r = rng(seed);
    const perm = new Uint8Array(512);
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const v = (x: number, y: number) => vals[perm[(x & 255) + perm[y & 255]]];
    const sm = (t: number) => t * t * (3 - 2 * t);
    return (x: number, y: number) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const tx = sm(x - xi), ty = sm(y - yi);
        const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
        return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
}

export function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; norm += a; a *= 0.5; f *= 2; }
    return s / norm;
}

/* ------------------------------------------------------------------------------------------ *
 * World map terrain
 * ------------------------------------------------------------------------------------------ */

export interface MapSite { x: number; y: number }   // art px on the map

/**
 * Paint a top-down island region: sea with wave ticks, outlined coast, grass, forests,
 * snow-capped mountains with shading from the north-west, a river and dotted roads.
 */
export function paintWorldMap(w: number, h: number, sites: MapSite[], roads: Array<[number, number]>, seed = 7): Pix {
    const p = new Pix(w, h);
    const n = noise2(seed);
    const n2 = noise2(seed + 1);
    const height = new Float32Array(w * h);
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = (x - cx) / (w * 0.5), dy = (y - cy) / (h * 0.5);
        const fall = 1 - Math.pow(dx * dx * 0.9 + dy * dy, 0.9);
        let e = fbm(n, x / 70, y / 70, 5) * 0.7 + fall * 0.6 - 0.36;
        // keep every site on dry land
        for (const s of sites) {
            const d = Math.hypot(x - s.x, y - s.y);
            if (d < 40) e = Math.max(e, 0.12 + (1 - d / 40) * 0.1);
        }
        height[y * w + x] = e;
    }
    // mountain spine: raise terrain around the north-centre ridge
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ridgeY = h * 0.42 + Math.sin(x / 60) * 18;
        const d = Math.abs(y - ridgeY) / (h * 0.22);
        const along = 1 - Math.abs(x - w * 0.55) / (w * 0.42);
        if (d < 1 && along > 0) height[y * w + x] += Math.pow(1 - d, 1.6) * along * 0.34 * (0.5 + fbm(n2, x / 18, y / 18, 3) * 0.9);
    }
    const H = (x: number, y: number) => height[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];

    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const e = H(x, y);
        let c: number;
        if (e < -0.02) c = bayer(x, y) < (-e * 2.2) ? INK.ink : INK.indigo;
        else if (e < 0.05) c = INK.indigo;
        else if (e < 0.085) c = INK.bone;             // shore sand
        else if (e < 0.26) c = INK.jade;               // grass
        else if (e < 0.5) c = INK.pine;                // forest floor
        else c = INK.indigo;                           // highland rock (mountains stamped below)
        if (e >= 0.085 && e < 0.26 && H(x, y) - H(x - 1, y - 1) > 0.008 && bayer(x, y) < 0.5) c = INK.teal;
        if (e >= 0.46 && e < 0.5 && bayer(x, y) < (e - 0.46) * 25) c = INK.indigo;
        p.px(x, y, c);
    }
    // mountains: stamped peak glyphs, painted back-to-front
    const rm = rng(seed + 21);
    const peaksAt: Array<[number, number, number]> = [];
    const hills: Array<[number, number]> = [];
    for (let y = 6; y < h; y += 10) for (let x = 4; x < w; x += 15) {
        const jx = x + Math.floor((rm() - 0.5) * 12), jy = y + Math.floor((rm() - 0.5) * 8);
        const e = H(jx, jy);
        if (sites.some((s) => Math.abs(s.x - jx) < 30 && jy > s.y - 34 && jy < s.y + 14)) continue;
        if (e >= 0.52) peaksAt.push([jx, jy, 9 + Math.round(Math.min(1, (e - 0.5) / 0.25) * 16 + rm() * 4)]);
        else if (e > 0.3 && e < 0.46 && rm() < 0.14) hills.push([jx, jy]);
    }
    for (const [x, y] of hills) {
        p.ellipse(x, y, 6, 3, INK.teal).rect(x - 6, y + 1, 13, 3, -1);
        p.rect(x - 5, y + 1, 11, 1, INK.jade).px(x - 3, y - 2, INK.spirit).px(x - 2, y - 2, INK.spirit);
    }
    peaksAt.sort((a, b) => a[1] - b[1]);
    for (const [x, y, hgt] of peaksAt) mountainGlyph(p, x, y, hgt, rm);

    // forests: little tree tufts on mid ground
    const r = rng(seed + 9);
    for (let i = 0; i < (w * h) / 55; i++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * h);
        const e = H(x, y);
        if (e > 0.2 && e < 0.5 && fbm(n2, x / 30, y / 30, 2) > 0.46) {
            p.px(x, y - 2, INK.teal).rect(x - 1, y - 1, 3, 1, INK.teal).rect(x - 1, y, 3, 1, INK.jade).px(x, y + 1, INK.void);
        }
    }
    // coastline ink + foam
    const land = (x: number, y: number) => H(x, y) >= 0.05;
    const src = p.buf.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (land(x, y)) {
            if (!land(x, y - 1) || !land(x - 1, y) || !land(x + 1, y) || !land(x, y + 1)) p.px(x, y, INK.void);
        } else if (land(x, y - 1) || land(x - 1, y) || land(x + 1, y) || land(x, y + 1)) {
            // no-op: keep water
        } else if ((land(x, y - 2) || land(x, y + 2) || land(x - 2, y) || land(x + 2, y)) && src[y * w + x] !== INK.bone) {
            p.px(x, y, INK.slate);
        }
    }
    // wave ticks
    for (let i = 0; i < (w * h) / 260; i++) {
        const x = Math.floor(r() * w), y = Math.floor(r() * h);
        if (H(x, y) < -0.04 && H(x + 3, y) < -0.04) p.px(x, y, INK.slate).px(x + 1, y - 1, INK.slate).px(x + 2, y, INK.slate);
    }
    // river from the ridge to the sea (steepest descent)
    let rx = Math.round(w * 0.47), ry = Math.round(h * 0.4);
    for (let step = 0; step < 900; step++) {
        if (H(rx, ry) < 0.05) break;
        p.px(rx, ry, INK.mist).px(rx + 1, ry, INK.dusk);
        let best = H(rx, ry + 1), nx = rx, ny = ry + 1;
        for (const [dx, dy] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) {
            const v = H(rx + dx, ry + dy) + (r() - 0.5) * 0.02;
            if (v < best) { best = v; nx = rx + dx; ny = ry + dy; }
        }
        rx = nx; ry = ny;
    }
    // roads: dotted, gently curved
    for (const [a, b] of roads) {
        const A = sites[a], B = sites[b];
        const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.18, my = (A.y + B.y) / 2 - (B.x - A.x) * 0.18;
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        const steps = Math.ceil(len * 1.2);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.round((1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * mx + t * t * B.x);
            const y = Math.round((1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * my + t * t * B.y);
            if (i % 5 < 3) { p.rect(x, y, 2, 1, INK.bone); p.rect(x, y + 1, 2, 1, INK.umber); }
        }
    }
    return p;
}

function mountainGlyph(p: Pix, x: number, base: number, hgt: number, r: () => number): void {
    const wl = Math.round(hgt * (0.8 + r() * 0.3)), wr = Math.round(hgt * (0.8 + r() * 0.3));
    const px = x + Math.round((r() - 0.5) * 3);
    const snowLine = hgt > 15 ? Math.round(hgt * 0.35) : hgt > 11 ? Math.round(hgt * 0.22) : 0;
    for (let yy = 0; yy <= hgt; yy++) {
        const t = yy / hgt;
        const l = Math.round(px - wl * t), rr = Math.round(px + wr * t);
        const y = base - hgt + yy;
        for (let xx = l; xx <= rr; xx++) {
            const lit = xx < px - (yy > 2 ? Math.round((r() - 0.5) * 1.5) : 0);
            let c: number = lit ? INK.mist : INK.slate;
            if (yy < snowLine) c = lit ? INK.paper : INK.haze;
            else if (yy < snowLine + 2 && r() < 0.5) c = lit ? INK.bone : INK.mist;
            if (!lit && xx > rr - 1) c = INK.indigo;
            p.px(xx, y, c);
        }
        p.px(l - 1, y, INK.void).px(rr + 1, y, INK.void);
    }
    p.px(px, base - hgt - 1, INK.void);
    // ridge line down the middle
    for (let yy = 2; yy < hgt; yy++) if (r() < 0.6) p.px(px + Math.round((yy / hgt) * (r() - 0.3) * 3), base - hgt + yy, INK.dusk);
}

/** Sample the same curved road the painter used (for walking the player token). */
export function roadPoint(A: MapSite, B: MapSite, t: number): MapSite {
    const mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.18, my = (A.y + B.y) / 2 - (B.x - A.x) * 0.18;
    return {
        x: (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * mx + t * t * B.x,
        y: (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * my + t * t * B.y,
    };
}

/** Minimum spanning tree over sites → road list. */
export function spanningRoads(sites: MapSite[]): Array<[number, number]> {
    if (sites.length < 2) return [];
    const inTree = new Set([0]);
    const out: Array<[number, number]> = [];
    while (inTree.size < sites.length) {
        let best: [number, number] | null = null, bd = Infinity;
        for (const a of inTree) for (let b = 0; b < sites.length; b++) {
            if (inTree.has(b)) continue;
            const d = Math.hypot(sites[a].x - sites[b].x, sites[a].y - sites[b].y);
            if (d < bd) { bd = d; best = [a, b]; }
        }
        if (!best) break;
        out.push(best); inTree.add(best[1]);
    }
    return out;
}

/** Soft cloud fringe that hides the map's edges. */
export function paintCloudFringe(w: number, h: number, seed = 3): Pix {
    const p = new Pix(w, h);
    const n = noise2(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        const v = edge / 38 + fbm(n, x / 22, y / 22, 3) * 0.7 - 0.35;
        if (v < 0.35) p.px(x, y, v < 0.2 ? INK.haze : INK.bone);
        else if (v < 0.45 && bayer(x, y) < (0.45 - v) * 8) p.px(x, y, INK.bone);
    }
    // outline the cloud mass edge
    const src = p.buf.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        if (src[y * w + x] === -1 && (src[y * w + x - 1] === INK.haze || src[(y - 1) * w + x] === INK.haze)) p.px(x, y, INK.mist);
    }
    return p;
}

/* ------------------------------------------------------------------------------------------ *
 * Landmarks & characters (string sprites)
 * ------------------------------------------------------------------------------------------ */

const LM_KEY: Record<string, number> = {
    o: INK.void, r: INK.cinnabar, R: INK.vermilion, w: INK.paper, b: INK.bone, c: INK.clay, k: INK.bark,
    s: INK.slate, d: INK.dusk, m: INK.mist, g: INK.jade, t: INK.teal, y: INK.gold, u: INK.umber, i: INK.ink, a: INK.amber,
};

const LANDMARKS: Record<string, string[]> = {
    town: [
        '..........oo..........',
        '.........orro.........',
        '..oo....orrrro....oo..',
        '.orro..oRRRRRRo..orro.',
        'orrrro.oooooooo.orrrro',
        'oRRRRo.obbbbbbo.oRRRRo',
        'oooooo.obaobaao.oooooo',
        'obbbbo.obaobaao.obbbbo',
        'obaobo.obbbbbbo.obaobo',
        'obbbbo.obbkkbbo.obbbbo',
        'obbkbo.obbkkbbo.obbkbo',
        'oooooooooooooooooooooo',
        '.uuuuuuuuuuuuuuuuuuuu.',
    ],
    'sect-gate': [
        '..........yy..........',
        '.oooooooooooooooooooo.',
        'orrrrrrrrrrrrrrrrrrrro',
        '.oooooooooooooooooooo.',
        '..okko..oyyyyo..okko..',
        '..okkoooouuuuoooookko.',
        '..orro..oyyyyo..orro..',
        '..orro..........orro..',
        '..orro..........orro..',
        '..orro...oooo...orro..',
        '..orro..obbbbo..orro..',
        '.oooooooobbbboooooooo.',
        '.omsmsmsmsmsmsmsmsmso.',
        'oooooooooooooooooooooo',
    ],
    teahouse: [
        '...............o......',
        '....oooooooo..oyo.....',
        '...ogggggggggoorro....',
        '..ogttttttttttgoRro...',
        '.oooooooooooooooorro..',
        '..obbbbbbbbbbbbo.oo...',
        '..obkkkkbbaaabbo......',
        '..obkkkkbbaaabbo......',
        '..obkkkkbbbbbbbo......',
        '..obkkkkbbbbbbbo......',
        '.oooooooooooooooo.....',
        '..uuuuuuuuuuuuuu......',
    ],
    trial: [
        '.......oo....oo.......',
        '......oddo..oddo......',
        '.....oddmo..odmdo.....',
        '....odmmdo..odmmdo....',
        '...oddmmdoooodmmddo...',
        '...odmsmoorroomsmdo...',
        '..oddsmsorRRrosmsddo..',
        '..odssmsorRRrosmssdo..',
        '.odsssssoriiroosssdso.',
        '.osssssoriiiiiosssso..',
        'ossssssoiiiiiiosssssso',
        'oooooooooooooooooooooo',
    ],
    cave: [
        '........oooooo........',
        '......oodmmmmdoo......',
        '....oodmmmddmmmdoo....',
        '...odmmddsssddmmmdo...',
        '..odmdsssoooosssdmdo..',
        '.odmdssooiiiioossddo..',
        '.odmssoiiiiiiiiosssdo.',
        'odmssoiiitiiitiiossddo',
        'odsssoiiiiiiiiiiosssdo',
        'odsssoiiiiiiiiiiossssо',
        'oooooooooooooooooooooo',
    ],
};

export function landmarkPix(icon: string): Pix {
    const rows = LANDMARKS[icon] ?? LANDMARKS.town;
    const p = new Pix(24, 16);
    p.sprite(rows.map((r) => r.replace(/о/g, 'o')), 1, 16 - rows.length, LM_KEY);
    return p;
}

/** Tiny traveller token: a disciple in cinnabar robe with a straw hat (2 bob frames). */
export function travellerPix(frame: 0 | 1): Pix {
    const rows = [
        '..oooo..',
        '.obbbbo.',
        'oyyyyyyo',
        '.oskkso.',
        '..owwo..',
        '.orrrro.',
        'orRrrrro',
        'orRrrrro',
        '.orrrro.',
        frame ? '.oo.oo..' : '..oooo..',
        frame ? '.o...o..' : '..o..o..',
    ];
    const p = new Pix(8, 12);
    p.sprite(rows, 0, frame, { ...LM_KEY, s: INK.skin });
    return p;
}
