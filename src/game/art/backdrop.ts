import Phaser from 'phaser';
import { C, PX } from './palette';

/**
 * Procedural pixel-art backdrops. Each scene is painted on a 480x270 canvas
 * (every art pixel = 4 screen pixels) and animated with parallax mist, twinkling stars,
 * drifting embers and swaying lanterns.
 */
export type BackdropTheme = 'mountain' | 'hall' | 'cave' | 'arena';

const W = 480;
const H = 270;
const SCALE = 4;

// ---------- tiny deterministic helpers ----------
function rng(seed: number) {
    let s = seed >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return (s >>> 0) / 4294967296;
    };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

function noise1(seed: number, x: number): number {
    const a = rng(seed + Math.floor(x) * 7919)();
    const b = rng(seed + (Math.floor(x) + 1) * 7919)();
    const f = x - Math.floor(x);
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
}
const fbm = (seed: number, x: number) =>
    noise1(seed, x) * 0.55 + noise1(seed + 11, x * 2.1) * 0.3 + noise1(seed + 23, x * 4.3) * 0.15;

class Canvas2 {
    ctx: CanvasRenderingContext2D;
    constructor(public tex: Phaser.Textures.CanvasTexture) {
        this.ctx = tex.getContext();
        this.ctx.imageSmoothingEnabled = false;
    }
    px(x: number, y: number, c: number) {
        if (x < 0 || y < 0 || x >= this.tex.width || y >= this.tex.height) return;
        this.ctx.fillStyle = css(c);
        this.ctx.fillRect(x | 0, y | 0, 1, 1);
    }
    rect(x: number, y: number, w: number, h: number, c: number) {
        this.ctx.fillStyle = css(c);
        this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    }
    /** vertical dithered ramp fill */
    ramp(y0: number, y1: number, colors: number[]) {
        const n = colors.length - 1;
        for (let y = y0; y < y1; y++) {
            const t = ((y - y0) / Math.max(1, y1 - y0)) * n;
            const i = Math.min(n - 1, Math.floor(t));
            const f = t - i;
            for (let x = 0; x < this.tex.width; x++) {
                this.px(x, y, f > bayer(x, y) ? colors[i + 1] : colors[i]);
            }
        }
    }
    disc(cx: number, cy: number, r: number, c: number) {
        for (let y = -r; y <= r; y++)
            for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c);
    }
    done() { this.tex.refresh(); }
}

function make(scene: Phaser.Scene, key: string, w = W, h = H): Canvas2 | null {
    if (scene.textures.exists(key)) return null;
    return new Canvas2(scene.textures.createCanvas(key, w, h)!);
}

// ---------- reusable scenery ----------
function ridge(c: Canvas2, base: number, amp: number, freq: number, seed: number, body: number, rim: number, shade: number, fade: number) {
    for (let x = 0; x < W; x++) {
        const y = Math.floor(base - amp * fbm(seed, x * freq));
        c.px(x, y, rim);
        for (let yy = y + 1; yy < H; yy++) {
            const d = yy - y;
            let col = body;
            if (d > 3 && d < 26 && bayer(x, yy) < (d - 3) / 34 && ((x + yy) & 1) === 0) col = shade;
            if (yy > H - 46 && bayer(x, yy) < (yy - (H - 46)) / 46) col = fade;
            c.px(x, yy, col);
        }
    }
}

function pine(c: Canvas2, x: number, y: number, h: number, dark: number, light: number) {
    c.rect(x, y - 3, 1, 3, C.umber);
    for (let i = 0; i < h; i++) {
        const half = Math.floor((i * 0.42) + 1);
        const yy = y - 3 - h + i + 1;
        for (let dx = -half; dx <= half; dx++) c.px(x + dx, yy, dx < 0 || i % 3 === 0 ? dark : light);
    }
}

function pagoda(c: Canvas2, cx: number, by: number, tiers: number, wall: number, roof: number, glow: number) {
    let y = by;
    let w = 5 + tiers * 2;
    for (let t = 0; t < tiers; t++) {
        c.rect(cx - w / 2 + 1, y - 5, w - 2, 5, wall);
        c.rect(cx - 1, y - 4, 2, 3, glow);
        const rw = w + 6;
        c.rect(cx - rw / 2, y - 7, rw, 2, roof);
        c.px(cx - rw / 2 - 1, y - 8, roof); c.px(cx + rw / 2, y - 8, roof);
        c.rect(cx - rw / 2 + 2, y - 8, rw - 4, 1, roof);
        y -= 8;
        w -= 2;
    }
    c.rect(cx, y - 6, 1, 6, roof);
    c.px(cx, y - 7, C.gold);
}

function stars(c: Canvas2, n: number, seed: number, maxY: number, palette: number[]) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
        c.px(Math.floor(r() * W), Math.floor(r() * maxY), palette[i % palette.length]);
    }
}

// ---------- theme painters ----------
function paintMountain(scene: Phaser.Scene, variant: 'night' | 'dusk' | 'ember') {
    const sky = make(scene, `bd_mtn_sky_${variant}`);
    if (sky) {
        const ramps: Record<string, number[]> = {
            night: [C.void, C.ink, C.night, C.dusk, C.twilight, C.haze],
            dusk: [C.ink, C.night, C.violet, C.blood, C.crimson, C.ember],
            ember: [C.void, C.umber, C.blood, C.crimson, C.ember, C.gold],
        };
        sky.ramp(0, 190, ramps[variant]);
        stars(sky, 140, 5, 110, [C.paper, C.fog, C.mist, C.ice]);
        const mx = 350; const my = 62;
        for (let y = -42; y <= 42; y++) for (let x = -42; x <= 42; x++) {
            const d = Math.hypot(x, y);
            if (d > 15 && d < 42 && bayer(mx + x, my + y) < (1 - (d - 15) / 27) * 0.55 && ((x + y) & 1) === 0)
                sky.px(mx + x, my + y, variant === 'night' ? C.mist : C.petal);
        }
        // full moon with craters
        sky.disc(mx, my, 15, C.paper);
        sky.disc(mx - 5, my - 4, 3, C.fog); sky.disc(mx + 6, my + 5, 4, C.fog); sky.disc(mx + 3, my - 8, 2, C.fog);
        sky.px(mx - 9, my + 3, C.fog); sky.px(mx + 9, my - 3, C.fog);
        sky.done();
    }
    const far = make(scene, `bd_mtn_far_${variant}`);
    if (far) {
        const body = variant === 'night' ? C.twilight : variant === 'dusk' ? C.violet : C.blood;
        ridge(far, 130, 60, 0.018, 3, body, C.mist, C.dusk, C.haze);
        far.done();
    }
    const mid = make(scene, `bd_mtn_mid_${variant}`);
    if (mid) {
        ridge(mid, 168, 58, 0.03, 9, C.dusk, C.haze, C.night, C.twilight);
        pagoda(mid, 118, 137, 4, C.night, C.blood, C.gold);
        pagoda(mid, 96, 150, 2, C.night, C.umber, C.glow);
        mid.done();
    }
    const near = make(scene, `bd_mtn_near_${variant}`);
    if (near) {
        ridge(near, 205, 46, 0.045, 17, C.night, C.twilight, C.ink, C.dusk);
        const r = rng(4);
        for (let i = 0; i < 22; i++) {
            const x = Math.floor(r() * W);
            const y = Math.floor(205 - 46 * fbm(17, x * 0.045)) + 2;
            pine(near, x, y, 8 + Math.floor(r() * 10), C.pine, C.moss);
        }
        near.done();
    }
    const front = make(scene, `bd_mtn_front_${variant}`);
    if (front) {
        ridge(front, 250, 26, 0.07, 31, C.ink, C.dusk, C.void, C.night);
        const r = rng(8);
        for (let i = 0; i < 9; i++) {
            const x = Math.floor(r() * W);
            const y = Math.floor(250 - 26 * fbm(31, x * 0.07)) + 3;
            pine(front, x, y, 16 + Math.floor(r() * 12), C.void, C.pine);
        }
        front.done();
    }
    return [`bd_mtn_sky_${variant}`, `bd_mtn_far_${variant}`, `bd_mtn_mid_${variant}`, `bd_mtn_near_${variant}`, `bd_mtn_front_${variant}`];
}

function paintHall(scene: Phaser.Scene) {
    const k = 'bd_hall';
    const c = make(scene, k);
    if (c) {
        c.ramp(0, H, [C.ink, C.night, C.umber, C.bark]);
        c.rect(0, 40, W, 130, C.night);
        for (let x = 0; x < W; x += 60) {
            c.rect(x + 8, 62, 44, 84, C.bark);
            c.rect(x + 11, 65, 38, 78, C.gold);
            for (let yy = 65; yy < 143; yy++) for (let xx = 11; xx < 49; xx++)
                if (bayer(xx, yy) < (yy - 65) / 110 && ((xx + yy) & 1) === 0) c.px(x + xx, yy, C.ember);
            for (let i = 0; i < 4; i++) c.rect(x + 11 + i * 10, 65, 1, 78, C.bark);
            for (let j = 0; j < 5; j++) c.rect(x + 11, 65 + j * 16, 38, 1, C.bark);
        }
        c.rect(0, 30, W, 12, C.bark); c.rect(0, 42, W, 2, C.void);
        c.rect(0, 170, W, 5, C.bark); c.rect(0, 175, W, 2, C.void);
        for (let x = 0; x < W; x += 120) { c.rect(x, 0, 10, 176, C.umber); c.rect(x, 0, 2, 176, C.bark); c.rect(x + 8, 0, 2, 176, C.void); }
        for (let y = 177; y < H; y++) {
            const t = (y - 177) / (H - 177);
            for (let x = 0; x < W; x++) c.px(x, y, (Math.floor(y / 4) % 2 === 0) ? C.umber : C.bark);
            const gap = Math.floor(14 + t * 40);
            for (let x = 0; x < W; x += gap) c.px(x + (Math.floor(y / 6) % 2) * Math.floor(gap / 2), y, C.void);
            for (let x = 0; x < W; x += 2) if (bayer(x, y) > 0.86 - t * 0.2) c.px(x, y, C.ink);
        }
        c.done();
    }
    return [k];
}

function paintCave(scene: Phaser.Scene) {
    const bg = make(scene, 'bd_cave_bg');
    if (bg) {
        bg.ramp(0, H, [C.void, C.ink, C.pine, C.deep, C.ink]);
        const r = rng(77);
        for (let i = 0; i < 18; i++) {
            const x = Math.floor(r() * W); const y = 100 + Math.floor(r() * 150);
            const h = 5 + Math.floor(r() * 9);
            for (let j = 0; j < h; j++) { bg.px(x, y - j, j > h - 3 ? C.jade : C.moss); bg.px(x + 1, y - j, C.pine); }
        }
        bg.done();
    }
    const top = make(scene, 'bd_cave_top');
    if (top) {
        const r = rng(19);
        for (let x = 0; x < W; x++) {
            const h = Math.floor(18 + 26 * fbm(5, x * 0.05) + (r() < 0.03 ? r() * 40 : 0));
            for (let y = 0; y < h; y++) top.px(x, y, y > h - 3 ? C.deep : y > h - 8 && ((x + y) & 1) ? C.pine : C.void);
            if (h > 40) top.px(x, h, C.jade);
        }
        top.done();
    }
    const bot = make(scene, 'bd_cave_bot');
    if (bot) {
        for (let x = 0; x < W; x++) {
            const y = Math.floor(232 - 22 * fbm(9, x * 0.04));
            bot.px(x, y, C.moss);
            for (let yy = y + 1; yy < H; yy++) bot.px(x, yy, yy < y + 3 ? C.pine : (bayer(x, yy) < 0.3 ? C.ink : C.void));
        }
        const r = rng(3);
        for (let i = 0; i < 14; i++) {
            const x = Math.floor(r() * W); const y = Math.floor(232 - 22 * fbm(9, x * 0.04));
            const h = 8 + Math.floor(r() * 16);
            for (let j = 0; j < h; j++) {
                const wd = Math.max(0, 3 - Math.floor(j / 5));
                for (let dx = -wd; dx <= wd; dx++) bot.px(x + dx, y - j, dx <= 0 ? C.jade : C.moss);
            }
            bot.px(x, y - h, C.lime);
        }
        bot.done();
    }
    return ['bd_cave_bg', 'bd_cave_top', 'bd_cave_bot'];
}

function paintArena(scene: Phaser.Scene) {
    const bg = make(scene, 'bd_arena');
    if (bg) {
        bg.ramp(0, 118, [C.void, C.ink, C.night, C.dusk, C.twilight]);
        stars(bg, 90, 12, 70, [C.paper, C.fog, C.mist]);
        const mx = 240; const my = 96;
        for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) {
            const d = Math.hypot(x, y);
            if (d > 26 && d < 60 && bayer(mx + x, my + y) < (1 - (d - 26) / 34) * 0.5 && ((x + y) & 1) === 0 && my + y < 118)
                bg.px(mx + x, my + y, C.haze);
        }
        for (let y = -26; y <= 26; y++) for (let x = -26; x <= 26; x++)
            if (x * x + y * y <= 676 && my + y < 118) bg.px(mx + x, my + y, (x * 3 + y) % 11 === 0 ? C.fog : C.paper);
        for (let x = 0; x < W; x++) {
            const y = Math.floor(112 - 34 * fbm(41, x * 0.025));
            for (let yy = y; yy < 122; yy++) bg.px(x, yy, yy === y ? C.mist : C.dusk);
        }
        for (let x = 0; x < W; x++) {
            const y = Math.floor(118 - 22 * fbm(43, x * 0.045));
            for (let yy = y; yy < 124; yy++) bg.px(x, yy, yy === y ? C.haze : C.night);
        }
        // stone arena floor
        for (let y = 122; y < H; y++) {
            const t = (y - 122) / (H - 122);
            const rowH = 6 + Math.floor(t * 12);
            const rowIdx = Math.floor((y - 122) / rowH) + Math.floor(t * 10);
            const tileW = 40 + Math.floor(t * 80);
            for (let x = 0; x < W; x++) {
                const off = (rowIdx % 2) * (tileW / 2);
                const seam = ((x + off) % tileW) === 0 || (y - 122) % rowH === 0;
                let col: number = ((Math.floor((x + off) / tileW) + rowIdx) & 1) ? C.night : C.ink;
                if (seam) col = C.void;
                else if (bayer(x, y) < 0.07 * (1 - t) && ((x + y) & 1) === 0) col = C.dusk;
                bg.px(x, y, col);
            }
        }
        // glowing formation ring
        const cx = 240; const cy = 190; const rx = 150; const ry = 44;
        for (let a = 0; a < Math.PI * 2; a += 0.004) {
            bg.px(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), C.moss);
            if (Math.floor(a * 40) % 5 !== 0) bg.px(Math.round(cx + Math.cos(a) * (rx - 5)), Math.round(cy + Math.sin(a) * (ry - 2)), C.pine);
        }
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            bg.rect(Math.round(cx + Math.cos(a) * (rx + 6)) - 1, Math.round(cy + Math.sin(a) * (ry + 2)) - 1, 3, 2, C.jade);
        }
        for (let x = 40; x < W - 40; x++) if (x % 3 !== 0) bg.px(x, 190, C.moss);
        for (const px of [14, W - 30]) {
            bg.rect(px, 58, 16, 190, C.night); bg.rect(px, 58, 3, 190, C.twilight); bg.rect(px + 13, 58, 3, 190, C.ink);
            bg.rect(px - 3, 52, 22, 8, C.dusk); bg.rect(px - 3, 240, 22, 10, C.dusk);
            bg.rect(px - 3, 52, 22, 2, C.haze);
            for (let y = 70; y < 236; y += 16) bg.rect(px + 4, y, 8, 1, C.ink);
        }
        bg.done();
    }
    return ['bd_arena'];
}

// ---------- assembly + life ----------
export interface Backdrop { destroy(): void }

/** Create the backdrop once per scene run (safe to call from re-rendering shells). */
export function ensureBackdrop(scene: Phaser.Scene, theme: BackdropTheme, variant: 'night' | 'dusk' | 'ember' = 'night'): void {
    if (scene.data.get('__backdrop')) return;
    const bd = createBackdrop(scene, theme, variant);
    scene.data.set('__backdrop', bd);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        bd.destroy();
        scene.data.remove('__backdrop');
    });
}

export function createBackdrop(scene: Phaser.Scene, theme: BackdropTheme, variant: 'night' | 'dusk' | 'ember' = 'night'): Backdrop {
    const { width, height } = scene.scale;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const timers: Phaser.Time.TimerEvent[] = [];
    const D = -10000;

    const place = (key: string, depth: number, alpha = 1) => {
        const im = scene.add.image(width / 2, height / 2, key).setScale(SCALE).setDepth(depth).setAlpha(alpha);
        objs.push(im);
        return im;
    };
    const mist = (y: number, depth: number, key: string, speed: number, color: number, alpha = 1) => {
        if (!scene.textures.exists(key)) {
            const m = make(scene, key, W, 56)!;
            for (let x = 0; x < W; x++) for (let yy = 0; yy < 56; yy++) {
                const ph = (x / W) * Math.PI * 2;
                const n = 0.5 + 0.28 * Math.sin(ph * 3 + yy * 0.05) + 0.2 * Math.sin(ph * 7 - yy * 0.03) + 0.12 * Math.sin(ph * 13);
                const fall = 1 - Math.abs(yy - 28) / 28;
                if (n * fall * 1.05 > bayer(x, yy) + 0.35 && ((x + yy) & 1) === 0) m.px(x, yy, color);
            }
            m.done();
        }
        const ts = scene.add.tileSprite(width / 2, y, width, 56 * SCALE, key).setTileScale(SCALE, SCALE).setDepth(depth).setAlpha(alpha);
        objs.push(ts);
        timers.push(scene.time.addEvent({ delay: 60, loop: true, callback: () => { ts.tilePositionX += speed; } }));
    };
    const twinkle = (n: number, maxY: number, colors: number[]) => {
        const r = rng(99);
        for (let i = 0; i < n; i++) {
            const s = scene.add.rectangle(Math.floor(r() * W) * SCALE, Math.floor(r() * maxY) * SCALE, SCALE, SCALE, colors[i % colors.length]).setOrigin(0).setDepth(D + 1);
            objs.push(s);
            scene.tweens.add({ targets: s, alpha: { from: 1, to: 0 }, duration: 700 + r() * 1400, yoyo: true, repeat: -1, delay: r() * 1500, ease: 'Stepped', easeParams: [3] });
        }
    };
    const embers = (colors: number[], rate: number) => {
        const r = rng(Date.now() & 0xffff);
        timers.push(scene.time.addEvent({
            delay: rate, loop: true, callback: () => {
                const x = Math.floor(r() * width / PX) * PX;
                const s = r() < 0.3 ? 8 : 4;
                const p = scene.add.rectangle(x, height + 8, s, s, colors[Math.floor(r() * colors.length)]).setDepth(D + 50);
                scene.tweens.add({
                    targets: p, y: height - 300 - r() * 500, x: x + (r() - 0.5) * 240, alpha: { from: 1, to: 0 },
                    duration: 3000 + r() * 3000, ease: 'Sine.easeOut', onComplete: () => p.destroy(),
                });
            },
        }));
    };
    const lantern = (x: number, y: number, len: number) => {
        const g = scene.add.container(x, y).setDepth(D + 40);
        const cord = scene.add.rectangle(0, len / 2, 4, len, C.umber);
        const body = scene.add.rectangle(0, len + 24, 44, 52, C.cinnabar);
        const cap1 = scene.add.rectangle(0, len - 2, 32, 8, C.void);
        const cap2 = scene.add.rectangle(0, len + 50, 32, 8, C.void);
        const band = scene.add.rectangle(0, len + 24, 44, 8, C.crimson);
        const glow = scene.add.rectangle(0, len + 24, 16, 24, C.glow);
        const hi = scene.add.rectangle(-14, len + 16, 6, 20, C.ember);
        g.add([cord, body, band, hi, glow, cap1, cap2]);
        g.setAngle(-3);
        scene.tweens.add({ targets: g, angle: 3, duration: 1800 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        scene.tweens.add({ targets: glow, alpha: 0.4, duration: 220, yoyo: true, repeat: -1 });
        objs.push(g);
    };

    if (theme === 'mountain') {
        const [sky, far, mid, near, front] = paintMountain(scene, variant);
        place(sky, D); place(far, D + 2);
        mist(height * 0.5, D + 3, 'bd_mist_a', 0.5, C.haze, 0.55);
        place(mid, D + 4);
        mist(height * 0.68, D + 5, 'bd_mist_b', -0.8, C.mist, 0.5);
        place(near, D + 6);
        mist(height * 0.82, D + 7, 'bd_mist_c', 1.1, C.twilight, 0.65);
        place(front, D + 8);
        twinkle(40, 100, [C.paper, C.ice, C.fog]);
        embers([C.gold, C.ember, C.glow], 380);
    } else if (theme === 'hall') {
        place(paintHall(scene)[0], D);
        for (let i = 0; i < 5; i++) lantern(240 + i * 360, 0, 90 + (i % 2) * 40);
        embers([C.gold, C.ember, C.glow], 520);
    } else if (theme === 'cave') {
        const [bg, top, bot] = paintCave(scene);
        place(bg, D); mist(height * 0.7, D + 2, 'bd_mist_cave', 0.6, C.deep, 0.5);
        place(top, D + 3); place(bot, D + 4);
        embers([C.jade, C.lime, C.ice, C.sky], 260);
    } else {
        place(paintArena(scene)[0], D);
        mist(height * 0.5, D + 2, 'bd_mist_arena', 0.4, C.haze, 0.35);
        twinkle(30, 60, [C.paper, C.fog]);
        for (const x of [90, width - 90]) lantern(x, 0, 200);
        embers([C.jade, C.lime, C.gold], 700);
    }

    return {
        destroy() {
            timers.forEach((t) => t.remove());
            objs.forEach((o) => o.destroy());
        },
    };
}
