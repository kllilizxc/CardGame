import type Phaser from 'phaser';
import { INK, PX } from './palette';

/**
 * Tiny software rasteriser for authoring art directly on the 640x360 grid.
 * Colours are 0xRRGGBB; -1 means transparent. Output is a nearest-filtered canvas texture
 * that scenes display at `PX` scale.
 */
export const NEAREST = 1;

export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number): number => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export class Pix {
    readonly buf: Int32Array;

    constructor(readonly w: number, readonly h: number) {
        this.buf = new Int32Array(w * h).fill(-1);
    }

    get(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
        return this.buf[y * this.w + x];
    }

    px(x: number, y: number, c: number): this {
        x |= 0; y |= 0;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
        this.buf[y * this.w + x] = c;
        return this;
    }

    rect(x: number, y: number, w: number, h: number, c: number): this {
        const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
        const x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
        for (let yy = y0; yy < y1; yy++) this.buf.fill(c, yy * this.w + x0, yy * this.w + x1);
        return this;
    }

    frame(x: number, y: number, w: number, h: number, c: number): this {
        this.rect(x, y, w, 1, c).rect(x, y + h - 1, w, 1, c).rect(x, y, 1, h, c).rect(x + w - 1, y, 1, h, c);
        return this;
    }

    /** Two-colour ordered dither: t=0 → a, t=1 → b. */
    dither(x: number, y: number, w: number, h: number, a: number, b: number, t: number | ((xx: number, yy: number) => number)): this {
        for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
            for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
                const k = typeof t === 'number' ? t : t(xx, yy);
                this.buf[yy * this.w + xx] = bayer(xx, yy) < k ? b : a;
            }
        }
        return this;
    }

    /** Vertical sky made of palette bands with a dithered seam between neighbours. */
    bands(y: number, h: number, colors: number[], seam = 0): this {
        const n = colors.length;
        const band = h / n;
        const sw = seam || Math.min(8, band * 0.35);
        for (let yy = 0; yy < h; yy++) {
            const i = Math.min(n - 1, Math.floor(yy / band));
            const within = yy - i * band;
            for (let xx = 0; xx < this.w; xx++) {
                let c = colors[i];
                if (i < n - 1 && within > band - sw) {
                    const t = (within - (band - sw)) / sw;
                    if (bayer(xx, yy + y) < t) c = colors[i + 1];
                }
                this.px(xx, y + yy, c);
            }
        }
        return this;
    }

    line(x0: number, y0: number, x1: number, y1: number, c: number): this {
        x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (;;) {
            this.px(x0, y0, c);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
        return this;
    }

    disc(cx: number, cy: number, r: number, c: number): this {
        const r2 = r * r + r * 0.8;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r2) this.px(cx + x, cy + y, c);
        return this;
    }

    ellipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
        for (let y = -ry; y <= ry; y++) {
            const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
            this.rect(cx - span, cy + y, span * 2 + 1, 1, c);
        }
        return this;
    }

    ring(cx: number, cy: number, r: number, c: number): this {
        const r2o = r * r + r * 0.8, r2i = (r - 1) * (r - 1) + (r - 1) * 0.8;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
            const d = x * x + y * y;
            if (d <= r2o && d > r2i) this.px(cx + x, cy + y, c);
        }
        return this;
    }

    /** Fill a closed polygon (even-odd scanline). */
    poly(pts: Array<[number, number]>, c: number): this {
        let minY = Infinity, maxY = -Infinity;
        for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
            const xs: number[] = [];
            for (let i = 0; i < pts.length; i++) {
                const [ax, ay] = pts[i];
                const [bx, by] = pts[(i + 1) % pts.length];
                if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) {
                    xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax));
                }
            }
            xs.sort((a, b) => a - b);
            for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.round(xs[i]), y, Math.round(xs[i + 1]) - Math.round(xs[i]), 1, c);
        }
        return this;
    }

    /** Fill everything below a height profile (profile[x] = top y). */
    fillBelow(profile: ArrayLike<number>, c: number, toY = this.h): this {
        for (let x = 0; x < this.w; x++) {
            const top = Math.max(0, Math.round(profile[x % profile.length]));
            for (let y = top; y < toY; y++) this.px(x, y, c);
        }
        return this;
    }

    /** Draw a 1px outline around every opaque pixel (outside only). */
    outline(c: number = INK.void, diagonal = false): this {
        const src = this.buf.slice();
        const at = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : src[y * this.w + x]);
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (src[y * this.w + x] !== -1) continue;
            const n = at(x - 1, y) !== -1 || at(x + 1, y) !== -1 || at(x, y - 1) !== -1 || at(x, y + 1) !== -1
                || (diagonal && (at(x - 1, y - 1) !== -1 || at(x + 1, y - 1) !== -1 || at(x - 1, y + 1) !== -1 || at(x + 1, y + 1) !== -1));
            if (n) this.buf[y * this.w + x] = c;
        }
        return this;
    }

    /** Recolour opaque pixels whose upper neighbour is transparent (a rim light). */
    rim(c: number, depth = 1, from: 'top' | 'left' = 'top'): this {
        const src = this.buf.slice();
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            if (src[y * this.w + x] === -1) continue;
            for (let d = 1; d <= depth; d++) {
                const nx = from === 'left' ? x - d : x, ny = from === 'top' ? y - d : y;
                if (nx < 0 || ny < 0 || src[ny * this.w + nx] === -1) { this.buf[y * this.w + x] = c; break; }
            }
        }
        return this;
    }

    /** First row (from the top) that has any opaque pixel. */
    opaqueTop(): number {
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.buf[y * this.w + x] !== -1) return y;
        return this.h;
    }

    replace(from: number, to: number): this {
        for (let i = 0; i < this.buf.length; i++) if (this.buf[i] === from) this.buf[i] = to;
        return this;
    }

    /** Stamp another Pix (transparent pixels skipped). */
    blit(src: Pix, dx: number, dy: number, flipX = false): this {
        for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
            const c = src.buf[y * src.w + x];
            if (c !== -1) this.px(dx + (flipX ? src.w - 1 - x : x), dy + y, c);
        }
        return this;
    }

    /** Paint a string-map sprite: each char maps to a colour via `key` ('.' / ' ' = clear). */
    sprite(rows: string[], dx: number, dy: number, key: Record<string, number>, flipX = false): this {
        rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const ch = row[x];
                if (ch === '.' || ch === ' ') continue;
                const c = key[ch];
                if (c !== undefined) this.px(dx + (flipX ? row.length - 1 - x : x), dy + y, c);
            }
        });
        return this;
    }

    toCanvas(): HTMLCanvasElement {
        const cv = document.createElement('canvas');
        cv.width = this.w; cv.height = this.h;
        const ctx = cv.getContext('2d')!;
        const img = ctx.createImageData(this.w, this.h);
        const d = img.data;
        for (let i = 0; i < this.buf.length; i++) {
            const c = this.buf[i];
            if (c === -1) continue;
            d[i * 4] = (c >> 16) & 0xff; d[i * 4 + 1] = (c >> 8) & 0xff; d[i * 4 + 2] = c & 0xff; d[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return cv;
    }

    /** Register as a texture (replacing any previous one under `key`). */
    texture(scene: Phaser.Scene, key: string): string {
        if (scene.textures.exists(key)) scene.textures.remove(key);
        scene.textures.addCanvas(key, this.toCanvas())!.setFilter(NEAREST);
        return key;
    }
}

/** Build-once texture cache: `make` only runs when the key is missing. */
export function bake(scene: Phaser.Scene, key: string, make: () => Pix): string {
    if (!scene.textures.exists(key)) make().texture(scene, key);
    return key;
}

/** Add an art-grid image at logical coordinates, scaled to the 3x canvas. */
export function pimg(scene: Phaser.Scene, x: number, y: number, key: string, frame?: string | number): Phaser.GameObjects.Image {
    return scene.add.image(snap(x), snap(y), key, frame).setScale(PX);
}

export const snap = (v: number, u = PX): number => Math.round(v / u) * u;

/** Smooth periodic 1D noise built from integer-frequency sines (tiles across `period`). */
export function ridge(period: number, seed: number, octaves: Array<[number, number]>): Float32Array {
    const r = rng(seed);
    const out = new Float32Array(period);
    const phases = octaves.map(() => r() * Math.PI * 2);
    for (let x = 0; x < period; x++) {
        let v = 0;
        octaves.forEach(([freq, amp], i) => { v += Math.sin((x / period) * Math.PI * 2 * freq + phases[i]) * amp; });
        out[x] = v;
    }
    return out;
}

/** Jagged mountain profile: asymmetric peaks with midpoint-displaced ridges, periodic over `period`. */
export function peaks(period: number, seed: number, base: number, height: number, count: number): Float32Array {
    const r = rng(seed);
    const out = new Float32Array(period).fill(base);
    for (let i = 0; i < count; i++) {
        const cx = (i + 0.2 + r() * 0.6) * (period / count);
        const hgt = height * (0.4 + r() * 0.6);
        const wl = (period / count) * (0.5 + r() * 0.7);
        const wr = (period / count) * (0.5 + r() * 0.7);
        // midpoint displacement noise for this mountain's ridge
        const n = 65;
        const noise = new Float32Array(n);
        let step = 32, amp = hgt * 0.45;
        noise[0] = 0; noise[n - 1] = 0;
        while (step >= 1) {
            for (let k = step; k < n - 1; k += step * 2) noise[k] = (noise[k - step] + noise[k + step]) / 2 + (r() - 0.5) * amp;
            step >>= 1; amp *= 0.55;
        }
        for (let x = Math.floor(cx - wl); x <= Math.ceil(cx + wr); x++) {
            const d = x < cx ? (cx - x) / wl : (x - cx) / wr;
            if (d >= 1) continue;
            const u = (x - (cx - wl)) / (wl + wr);
            const shape = Math.pow(1 - d, x < cx ? 1.1 : 1.45);
            const top = base - hgt * shape - noise[Math.min(n - 1, Math.max(0, Math.round(u * (n - 1))))] * shape;
            const xi = ((x % period) + period) % period;
            out[xi] = Math.min(out[xi], top);
        }
    }
    return out;
}

/**
 * Re-sample a loaded (high-res) image onto the art grid: area-averaged downscale to `w`x`h`
 * art pixels (cover or contain), hard alpha edges, nearest filtering. Displayed at PX scale it
 * sits on the same pixel grid as everything else.
 */
export function pixelateImage(scene: Phaser.Scene, srcKey: string, dstKey: string, w: number, h: number, mode: 'cover' | 'contain' = 'cover'): string {
    if (scene.textures.exists(dstKey)) return dstKey;
    const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const sw = src.width, sh = src.height;
    const k = mode === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = Math.round(sw * k), dh = Math.round(sh * k);
    const cw = mode === 'cover' ? w : dw, ch = mode === 'cover' ? h : dh;
    // step down in halves for a clean area average
    let cur: HTMLCanvasElement | HTMLImageElement = src;
    let curW = sw, curH = sh;
    while (curW / 2 > dw && curH / 2 > dh) {
        const c = document.createElement('canvas');
        c.width = Math.round(curW / 2); c.height = Math.round(curH / 2);
        const x = c.getContext('2d')!;
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.drawImage(cur, 0, 0, c.width, c.height);
        cur = c; curW = c.width; curH = c.height;
    }
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    const ctx = out.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, Math.round((cw - dw) / 2), Math.round((ch - dh) / 2), dw, dh);
    const img = ctx.getImageData(0, 0, cw, ch);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 120 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(dstKey, out)!.setFilter(NEAREST);
    return dstKey;
}

/** Stamp 12px pixel-font glyphs 1:1 into a Pix (for text baked into art: seals, plaques). */
export function stampText(p: Pix, str: string, x: number, y: number, color: number): void {
    const chars = [...str];
    const cv = document.createElement('canvas');
    cv.width = chars.length * 12 + 4; cv.height = 16;
    const ctx = cv.getContext('2d')!;
    ctx.font = '12px Zpix';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.fillText(str, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    for (let yy = 0; yy < cv.height; yy++) for (let xx = 0; xx < cv.width; xx++) {
        if (data[(yy * cv.width + xx) * 4 + 3] > 110) p.px(x + xx, y + yy, color);
    }
}
