import { INK } from './palette';
import { Pix, bayer, rng } from './pix';
import { paintClouds, paintPagoda, paintSky } from './scenery';
import { paintPine } from './buildings';

/**
 * Canvases for the battle diorama (WenxinBattleStage draws them into its own 640x360 frame).
 * Dusk over a sea of cloud; the fight happens on a round stone platform inlaid with cinnabar.
 */

const toCanvas = (p: Pix) => p.toCanvas();

/** 640x120 sky strip. */
export function arenaSky(): HTMLCanvasElement {
    const sky = paintSky('dusk', 91, true);
    const out = new Pix(640, 120);
    // re-band into the short strip: take the upper sky rows compressed
    for (let y = 0; y < 120; y++) for (let x = 0; x < 640; x++) out.px(x, y, sky.get(x, Math.floor(y * 2.2)));
    // setting sun low on the horizon
    const cx = 470, cy = 104;
    for (let y = -26; y <= 26; y++) for (let x = -40; x <= 40; x++) {
        const d = Math.hypot(x, y * 1.4);
        if (d < 18) out.px(cx + x, cy + y, d < 15 ? INK.gold : INK.amber);
        else if (d < 38 && bayer(cx + x, cy + y) < (1 - (d - 18) / 20) * 0.5) out.px(cx + x, cy + y, INK.vermilion);
    }
    return toCanvas(out);
}

/** 1280x284 sea of cloud (tiles horizontally; drawn from y=76 downward). */
export function arenaSea(): HTMLCanvasElement {
    const W = 1280, H = 284;
    const p = new Pix(W, H);
    p.bands(0, H, [INK.plum, INK.wine, INK.plum, INK.umber], 10);
    const layers: Array<[number, number, number, number]> = [
        [30, INK.wine, INK.vermilion, 11],
        [70, INK.plum, INK.cinnabar, 23],
        [120, INK.umber, INK.wine, 37],
        [180, INK.void, INK.plum, 53],
    ];
    for (const [y, body, lit, seed] of layers) {
        const c = paintClouds(y, H - y, body, lit, seed);
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
            const v = c.get(xx % 960, yy);
            if (v !== -1) p.px(xx, yy, v);
        }
    }
    return toCanvas(p);
}

export function arenaCloud(): HTMLCanvasElement {
    const p = new Pix(150, 50);
    const r = rng(5);
    for (let k = 0; k < 9; k++) p.ellipse(20 + Math.floor(r() * 110), 34 - Math.floor(r() * 12), 10 + Math.floor(r() * 12), 5 + Math.floor(r() * 5), INK.wine);
    p.rect(0, 40, 150, 10, -1);
    p.rim(INK.vermilion, 1);
    return toCanvas(p);
}

export function arenaIsland(): HTMLCanvasElement {
    const p = new Pix(110, 72);
    const cx = 55;
    p.ellipse(cx, 26, 44, 7, INK.plum);
    for (let k = 0; k < 40; k++) p.rect(cx - Math.round(44 * (1 - k / 40)), 30 + k, Math.round(88 * (1 - k / 40)) + 1, 1, k % 7 === 0 ? INK.void : INK.umber);
    p.rect(cx - 44, 24, 89, 3, INK.wine);
    paintPine(p, cx - 20, 24, 20, INK.void, INK.plum);
    paintPine(p, cx + 6, 24, 26, INK.void, INK.plum);
    paintPine(p, cx + 26, 24, 16, INK.void, INK.plum);
    return toCanvas(p.outline(INK.void));
}

/** The floating landmark behind the arena: a lit pagoda on a rock. */
export function arenaBell(): HTMLCanvasElement {
    const p = new Pix(96, 88);
    const pag = paintPagoda(5, INK.umber, INK.void, INK.gold);
    p.blit(pag, 48 - Math.floor(pag.w / 2), 88 - pag.h - 10);
    p.ellipse(48, 82, 26, 6, INK.void);
    for (let k = 0; k < 8; k++) p.rect(48 - (20 - k * 2), 82 + k, (20 - k * 2) * 2, 1, INK.void);
    return toCanvas(p);
}

/**
 * Floor texture sampled in perspective by the stage: 800x800, 4 texels per world unit,
 * u = (worldX + 100) * 4, v = (z - 30) * 4. The platform is centred at world (0, 78), r 77.
 */
export function arenaFloor(slots: { me: readonly (readonly number[])[]; foe: readonly (readonly number[])[] }): HTMLCanvasElement {
    const S = 800;
    const p = new Pix(S, S);
    // cloud sea around the platform
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const band = Math.floor(y / 40) % 3;
        p.buf[y * S + x] = band === 0 ? INK.plum : band === 1 ? INK.wine : INK.plum;
    }
    const r = rng(17);
    for (let i = 0; i < 260; i++) {
        const x = Math.floor(r() * S), y = Math.floor(r() * S), w = 20 + Math.floor(r() * 70);
        p.ellipse(x, y, w, 6 + Math.floor(r() * 6), r() < 0.5 ? INK.wine : INK.umber);
        p.rect(x - w + 4, y - 7, w * 2 - 8, 2, INK.cinnabar);
    }
    const cx = 400, cy = (78 - 30) * 4, R = 77 * 4;
    for (let y = cy - R - 8; y <= cy + R + 8; y++) for (let x = cx - R - 8; x <= cx + R + 8; x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const d = Math.hypot(x - cx, y - cy);
        let c = -1;
        if (d <= R + 8 && d > R) c = INK.void;
        else if (d <= R && d > R - 8) c = INK.gold;
        else if (d <= R - 8 && d > R - 14) c = INK.cinnabar;
        else if (d <= R - 14) {
            // flagstones in concentric rings
            const ring = Math.floor(d / 44);
            const ang = Math.atan2(y - cy, x - cx);
            const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * (10 + ring * 6));
            const edgeR = d % 44 < 3;
            const edgeA = Math.abs(((ang + Math.PI) / (Math.PI * 2)) * (10 + ring * 6) - seg - 0.5) > 0.47;
            c = edgeR || edgeA ? INK.indigo : (ring + seg) % 2 ? INK.slate : INK.dusk;
            if (d < 60) {
                const top = Math.hypot(x - cx, y - (cy - 26)), bot = Math.hypot(x - cx, y - (cy + 26));
                c = d >= 52 ? INK.gold : top < 8 ? INK.ink : bot < 8 ? INK.bone : top < 26 ? INK.bone : bot < 26 ? INK.ink : x < cx ? INK.bone : INK.ink;
            }
        }
        if (c !== -1) p.buf[y * S + x] = c;
    }
    // slot plates
    for (const side of ['me', 'foe'] as const) for (const [sx, sz] of slots[side]) {
        const u = (sx - 9 + 100) * 4, v = (sz - 11 - 30) * 4, w = 72, h = 88;
        const edge = side === 'me' ? INK.spirit : INK.vermilion;
        p.rect(u - 4, v - 4, w + 8, h + 8, INK.void);
        p.rect(u, v, w, h, INK.indigo);
        p.rect(u + 6, v + 6, w - 12, h - 12, INK.slate);
        p.frame(u, v, w, h, edge).frame(u + 1, v + 1, w - 2, h - 2, edge).frame(u + 2, v + 2, w - 4, h - 4, edge);
        for (const [a, b] of [[0, 0], [w - 8, 0], [0, h - 8], [w - 8, h - 8]]) p.rect(u + a, v + b, 8, 8, INK.gold);
    }
    return toCanvas(p);
}
