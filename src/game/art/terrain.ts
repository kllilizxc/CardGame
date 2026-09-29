import Phaser from 'phaser';
import { C } from './palette';

/**
 * Bakes a hand-inked-looking pixel terrain map (water, meadows, hills, snow peaks, pines).
 * Rendered at 1/4 resolution and shown with nearest scaling so every art pixel is a 4px block.
 */
const h6 = (n: number) => '#' + n.toString(16).padStart(6, '0');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16;

function hash2(x: number, y: number, seed: number): number {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm2 = (x: number, y: number, seed: number) =>
    vnoise(x, y, seed) * 0.5 + vnoise(x * 2, y * 2, seed + 1) * 0.28 + vnoise(x * 4, y * 4, seed + 2) * 0.16 + vnoise(x * 8, y * 8, seed + 3) * 0.06;

export function bakeTerrain(
    scene: Phaser.Scene,
    key: string,
    mapWidth: number,
    mapHeight: number,
    route: Array<[number, number]> = [],
    seed = 7
): string {
    if (scene.textures.exists(key)) return key;
    const cw = Math.ceil(mapWidth / 4);
    const ch = Math.ceil(mapHeight / 4);
    const tex = scene.textures.createCanvas(key, cw, ch)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(cw, ch);
    const buf = new Uint32Array(img.data.buffer);
    const put = (x: number, y: number, c: number) => {
        if (x < 0 || y < 0 || x >= cw || y >= ch) return;
        buf[y * cw + x] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    };
    const H = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const nx = x / cw, ny = y / ch;
        const edge = Math.min(nx, 1 - nx, ny, 1 - ny) * 3.2;
        const island = Math.min(1, edge);
        H[y * cw + x] = fbm2(x * 0.03, y * 0.03, seed) * 0.85 + island * 0.25 - 0.06;
    }
    const at = (x: number, y: number) => H[Math.min(ch - 1, Math.max(0, y)) * cw + Math.min(cw - 1, Math.max(0, x))];

    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const h = at(x, y);
        const shade = (at(x - 1, y - 1) - at(x + 1, y + 1)) * 6; // light from top-left
        const th = bayer(x, y);
        let c: number;
        if (h < 0.34) {
            const depth = (0.34 - h) / 0.34;
            c = depth > 0.55 ? C.deep : depth > 0.25 ? (th < 0.5 ? C.deep : C.azure) : (th < depth * 2 ? C.azure : C.sky);
            if (((x + y * 2) % 11 === 0) && th > 0.6) c = C.ice; // sparkles
        } else if (h < 0.37) {
            c = C.parchment; // shore
        } else if (h < 0.5) {
            c = th < (h - 0.37) * 6 ? C.jade : C.moss;
            if (shade > 0.08 && th > 0.5) c = C.lime;
            else if (shade < -0.08) c = C.pine;
        } else if (h < 0.62) {
            c = th < (h - 0.5) * 8 ? C.olive : C.moss;
            if (shade > 0.06) c = C.olive;
            else if (shade < -0.06) c = C.pine;
        } else if (h < 0.72) {
            c = shade > 0.02 ? C.haze : C.twilight;
            if (shade < -0.06) c = C.dusk;
        } else {
            c = shade > -0.03 ? C.paper : C.fog;
            if (shade < -0.08) c = C.mist;
        }
        // heavy vignette toward the frame so the sheet feels like aged paper
        const nx = x / cw, ny = y / ch;
        const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
        if (edge < 0.06 && th > edge / 0.06) c = C.ink;
        put(x, y, c);
    }
    ctx.putImageData(img, 0, 0);

    // pine forests on lowlands
    ctx.fillStyle = '#000';
    const tree = (x: number, y: number) => {
        const px = (dx: number, dy: number, col: number) => { ctx.fillStyle = h6(col); ctx.fillRect(x + dx, y + dy, 1, 1); };
        px(0, 3, C.umber);
        px(0, 0, C.moss); px(-1, 1, C.pine); px(0, 1, C.moss); px(1, 1, C.pine); px(-1, 2, C.pine); px(0, 2, C.moss); px(1, 2, C.pine);
        px(0, -1, C.lime);
    };
    for (let y = 4; y < ch - 4; y += 3) for (let x = 4; x < cw - 4; x += 3) {
        const h = at(x, y);
        if (h > 0.4 && h < 0.56 && vnoise(x * 0.09, y * 0.09, 91) > 0.62 && hash2(x, y, 5) > 0.35) tree(x + Math.round(hash2(x, y, 6) * 2 - 1), y);
    }

    // pixel clouds drifting on the sheet (static art, gives depth)
    for (let i = 0; i < 9; i++) {
        const cx = Math.floor(hash2(i, 1, 33) * cw), cy = Math.floor(hash2(i, 2, 33) * ch);
        ctx.fillStyle = h6(C.fog);
        for (let k = 0; k < 4; k++) ctx.fillRect(cx + k * 3, cy - (k % 2), 4 + (k % 2), 2);
        ctx.fillStyle = h6(C.paper);
        for (let k = 0; k < 4; k++) ctx.fillRect(cx + k * 3, cy - (k % 2) - 1, 3, 1);
    }

    // dashed golden pilgrim route (outline pass first, gold pass on top)
    if (route.length > 1) {
        const pts: Array<[number, number, boolean]> = [];
        let n = 0;
        for (let i = 0; i < route.length - 1; i++) {
            const [x0, y0] = route[i].map((v) => Math.round(v / 4)) as [number, number];
            const [x1, y1] = route[i + 1].map((v) => Math.round(v / 4)) as [number, number];
            const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
            for (let s2 = 0; s2 <= steps; s2++, n++) {
                pts.push([Math.round(x0 + ((x1 - x0) * s2) / steps), Math.round(y0 + ((y1 - y0) * s2) / steps), n % 8 < 5]);
            }
        }
        ctx.fillStyle = h6(C.void);
        pts.forEach(([x, y, on]) => { if (on) ctx.fillRect(x - 1, y - 1, 3, 3); });
        ctx.fillStyle = h6(C.gold);
        pts.forEach(([x, y, on]) => { if (on) ctx.fillRect(x, y, 2, 2); });
        ctx.fillStyle = h6(C.glow);
        pts.forEach(([x, y, on]) => { if (on) ctx.fillRect(x, y, 1, 1); });
    }

    // compass rose
    const rx = cw - 26, ry = ch - 26;
    const p = (dx: number, dy: number, col: number) => { ctx.fillStyle = h6(col); ctx.fillRect(rx + dx, ry + dy, 1, 1); };
    for (let i = -9; i <= 9; i++) { p(i, 0, C.paper); p(0, i, C.paper); }
    for (let i = -4; i <= 4; i++) { p(i, i, C.mist); p(i, -i, C.mist); }
    for (let k = 1; k <= 5; k++) for (let j = -(6 - k); j <= 6 - k; j++) p(j, -9 - k + 6, C.cinnabar);
    p(0, 0, C.gold);

    tex.refresh();
    return key;
}
