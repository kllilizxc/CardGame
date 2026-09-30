import { INK } from './palette';
import { Pix, rng } from './pix';

/**
 * Procedural Chinese architecture on the art grid: sweeping tiled roofs with upturned eaves,
 * timber pillars, lattice windows, lanterns. Shared by map landmarks and hub street scenes.
 */

export interface HouseStyle {
    roof: number;
    roofHi: number;
    roofLo?: number;
    wall: number;
    wallLo?: number;
    pillar: number;
    window: number;
    door?: number;
}

export const HOUSE_STYLES = {
    town: { roof: INK.slate, roofHi: INK.dusk, roofLo: INK.indigo, wall: INK.bone, wallLo: INK.clay, pillar: INK.bark, window: INK.amber, door: INK.umber },
    sect: { roof: INK.jade, roofHi: INK.teal, roofLo: INK.pine, wall: INK.bone, wallLo: INK.clay, pillar: INK.cinnabar, window: INK.gold, door: INK.wine },
    temple: { roof: INK.cinnabar, roofHi: INK.vermilion, roofLo: INK.wine, wall: INK.bone, wallLo: INK.clay, pillar: INK.wine, window: INK.gold, door: INK.umber },
    shop: { roof: INK.bark, roofHi: INK.clay, roofLo: INK.umber, wall: INK.bone, wallLo: INK.clay, pillar: INK.umber, window: INK.amber, door: INK.umber },
    night: { roof: INK.indigo, roofHi: INK.slate, roofLo: INK.ink, wall: INK.grey, wallLo: INK.indigo, pillar: INK.umber, window: INK.amber, door: INK.void },
} satisfies Record<string, HouseStyle>;

/** Roof only: ridge at `y`, eaves `w` wide, `h` tall, centred on `cx`. */
export function paintRoof(p: Pix, cx: number, y: number, w: number, h: number, s: HouseStyle): void {
    const half = w / 2;
    for (let i = 0; i < h; i++) {
        const t = i / Math.max(1, h - 1);
        // concave sweep: narrow at top, flaring at the eaves
        const hw = Math.round(half * (0.55 + 0.45 * Math.pow(t, 0.6)));
        const c = i === 0 ? s.roofHi : i === h - 1 ? (s.roofLo ?? s.roof) : s.roof;
        p.rect(cx - hw, y + i, hw * 2 + 1, 1, c);
        // tile ribs
        if (i > 0 && i < h - 1) for (let x = cx - hw + 2; x < cx + hw - 1; x += 3) p.px(x, y + i, s.roofLo ?? s.roof);
    }
    // ridge + upturned ends
    p.rect(cx - Math.round(half * 0.55) - 1, y - 1, Math.round(half * 1.1) + 3, 1, s.roofHi);
    p.px(cx - Math.round(half * 0.55) - 2, y - 2, s.roofHi).px(cx + Math.round(half * 0.55) + 2, y - 2, s.roofHi);
    p.px(cx - Math.round(half) - 1, y + h - 2, s.roof).px(cx + Math.round(half) + 1, y + h - 2, s.roof);
    p.px(cx - Math.round(half) - 2, y + h - 3, s.roofHi).px(cx + Math.round(half) + 2, y + h - 3, s.roofHi);
}

export interface HouseOpts {
    floors?: number;
    lantern?: boolean;
    sign?: number;          // colour of a hanging sign board
    door?: boolean;
    seed?: number;
}

/** A full building standing on `ground` (y of the lowest wall row + 1). Returns top y. */
export function paintHouse(p: Pix, cx: number, ground: number, w: number, wallH: number, s: HouseStyle, o: HouseOpts = {}): number {
    const floors = o.floors ?? 1;
    const roofH = Math.max(4, Math.round(w * 0.22));
    let base = ground;
    let top = ground;
    for (let f = 0; f < floors; f++) {
        const fw = Math.round(w * (1 - f * 0.18));
        const wallW = fw - Math.round(fw * 0.16) * 2;
        const wx = cx - Math.floor(wallW / 2);
        const wy = base - wallH;
        // platform
        if (f === 0) { p.rect(wx - 2, ground, wallW + 4, 2, INK.grey); p.rect(wx - 2, ground, wallW + 4, 1, INK.ash); }
        p.rect(wx, wy, wallW, wallH, s.wall);
        if (s.wallLo !== undefined) p.rect(wx, base - 2, wallW, 2, s.wallLo);
        // pillars
        const bays = Math.max(2, Math.round(wallW / 9));
        for (let b = 0; b <= bays; b++) {
            const px = wx + Math.round((b / bays) * (wallW - 2));
            p.rect(px, wy, 2, wallH, s.pillar);
        }
        // windows / door
        for (let b = 0; b < bays; b++) {
            const bx0 = wx + Math.round((b / bays) * (wallW - 2)) + 3;
            const bx1 = wx + Math.round(((b + 1) / bays) * (wallW - 2)) - 1;
            const bw = bx1 - bx0;
            if (bw < 3) continue;
            const isDoor = f === 0 && (o.door ?? true) && b === Math.floor(bays / 2);
            if (isDoor) {
                p.rect(bx0, wy + Math.round(wallH * 0.3), bw, wallH - Math.round(wallH * 0.3), s.door ?? INK.umber);
                p.rect(bx0 + Math.floor(bw / 2), wy + Math.round(wallH * 0.3), 1, wallH - Math.round(wallH * 0.3), INK.void);
            } else {
                const wh = Math.max(2, Math.round(wallH * 0.4));
                const wy0 = wy + Math.round(wallH * 0.22);
                p.rect(bx0, wy0, bw, wh, s.window);
                for (let lx = bx0 + 1; lx < bx0 + bw; lx += 2) p.rect(lx, wy0, 1, wh, INK.bark);
                p.rect(bx0, wy0 + Math.floor(wh / 2), bw, 1, INK.bark);
            }
        }
        paintRoof(p, cx, wy - roofH + 1, fw, roofH, s);
        top = wy - roofH;
        base = wy - roofH + 2;
    }
    if (o.sign !== undefined) {
        const sw = Math.max(6, Math.round(w * 0.28));
        const sy = ground - wallH - 1;
        p.rect(cx - Math.floor(sw / 2), sy, sw, 4, o.sign).rect(cx - Math.floor(sw / 2) + 1, sy + 1, sw - 2, 2, INK.umber);
        for (let x = cx - Math.floor(sw / 2) + 2; x < cx + Math.floor(sw / 2) - 1; x += 2) p.px(x, sy + 2, INK.gold);
    }
    if (o.lantern) {
        for (const lx of [cx - Math.round(w * 0.38), cx + Math.round(w * 0.38)]) {
            const ly = ground - wallH + 1;
            p.px(lx, ly, INK.void).rect(lx - 1, ly + 1, 3, 4, INK.cinnabar).px(lx, ly + 2, INK.amber).px(lx, ly + 5, INK.gold);
        }
    }
    return top;
}

export function paintPine(p: Pix, x: number, ground: number, h: number, dark: number = INK.pine, light: number = INK.jade): void {
    const trunk = Math.max(2, Math.round(h * 0.18));
    p.rect(x, ground - trunk, 1, trunk, INK.bark);
    const tiers = Math.max(2, Math.round(h / 9));
    const crownH = h - trunk;
    for (let i = 0; i < tiers; i++) {
        const top = ground - h + Math.round((i / tiers) * crownH * 0.75);
        const th = Math.round(crownH / tiers) + 3;
        const hw = 2 + Math.round(((i + 1) / tiers) * h * 0.3);
        p.poly([[x + 0.5, top], [x + hw + 1, top + th], [x - hw, top + th]], dark);
        p.line(x, top + 1, x - hw + 1, top + th - 1, light);
        p.rect(x - hw + 1, top + th - 1, hw * 2, 1, INK.void);
    }
}

export function paintRock(p: Pix, cx: number, ground: number, w: number, h: number, fill: number = INK.slate, lit: number = INK.dusk, seed = 1): void {
    const r = rng(seed);
    const pts: Array<[number, number]> = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = cx - w / 2 + t * w;
        const y = ground - Math.sin(t * Math.PI) * h * (0.7 + r() * 0.3);
        pts.push([Math.round(x), Math.round(y)]);
    }
    pts.push([cx + w / 2, ground], [cx - w / 2, ground]);
    p.poly(pts, fill);
    for (let i = 0; i < n / 2; i++) p.line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, lit);
}

/* ------------------------------------------------------------------------------------------ *
 * Map landmarks (~48x36 art px, anchored bottom-centre)
 * ------------------------------------------------------------------------------------------ */

export const LANDMARK_W = 52;
export const LANDMARK_H = 40;

export function paintLandmark(icon: string): Pix {
    const p = new Pix(LANDMARK_W, LANDMARK_H);
    const g = LANDMARK_H - 3;
    const cx = LANDMARK_W / 2;
    switch (icon) {
        case 'sect-gate': {
            paintHouse(p, cx, g - 14, 30, 8, HOUSE_STYLES.sect, { floors: 2 });
            // stairs
            for (let i = 0; i < 6; i++) p.rect(cx - 6 - i, g - 12 + i * 2, 13 + i * 2, 2, i % 2 ? INK.ash : INK.haze);
            paintPine(p, cx - 20, g - 2, 14);
            paintPine(p, cx + 20, g, 16);
            // paifang in front
            const a = g - 1;
            p.rect(cx - 14, a - 12, 2, 12, INK.cinnabar).rect(cx + 12, a - 12, 2, 12, INK.cinnabar);
            p.rect(cx - 17, a - 15, 34, 2, INK.jade).rect(cx - 15, a - 16, 30, 1, INK.teal).px(cx - 18, a - 16, INK.teal).px(cx + 17, a - 16, INK.teal);
            p.rect(cx - 13, a - 12, 26, 1, INK.cinnabar).rect(cx - 4, a - 12, 8, 3, INK.gold);
            break;
        }
        case 'teahouse': {
            paintHouse(p, cx - 4, g, 30, 9, HOUSE_STYLES.shop, { lantern: true, sign: INK.bark });
            // banner pole with 茶 flag
            p.rect(cx + 15, g - 22, 1, 22, INK.bark);
            p.rect(cx + 16, g - 21, 6, 10, INK.bone).rect(cx + 17, g - 19, 4, 1, INK.cinnabar).rect(cx + 18, g - 18, 2, 4, INK.cinnabar).rect(cx + 17, g - 15, 4, 1, INK.cinnabar);
            p.px(cx + 21, g - 11, INK.bone).px(cx + 20, g - 11, INK.bone);
            paintPine(p, cx - 21, g, 12);
            break;
        }
        case 'trial': {
            paintRock(p, cx, g, 46, 12, INK.slate, INK.dusk, 4);
            for (const sx of [cx - 11, cx + 9]) {
                p.rect(sx, g - 22, 4, 20, INK.grey).rect(sx, g - 22, 1, 20, INK.ash).rect(sx - 1, g - 23, 6, 2, INK.ash);
                // torch
                p.rect(sx + 1, g - 27, 2, 3, INK.bark).px(sx + 1, g - 29, INK.gold).px(sx + 2, g - 30, INK.amber).px(sx + 2, g - 28, INK.vermilion);
            }
            // rope with paper talismans
            for (let x = cx - 7; x < cx + 9; x++) p.px(x, g - 18 + Math.round(Math.sin(((x - cx + 7) / 16) * Math.PI) * 2), INK.clay);
            for (const tx of [cx - 4, cx, cx + 4]) p.rect(tx, g - 16, 2, 4, INK.bone).px(tx, g - 14, INK.cinnabar);
            p.rect(cx - 2, g - 8, 4, 6, INK.void);
            break;
        }
        case 'cave': {
            paintRock(p, cx, g, 50, 30, INK.slate, INK.mist, 8);
            paintRock(p, cx + 12, g, 22, 18, INK.indigo, INK.dusk, 9);
            p.ellipse(cx - 2, g - 5, 7, 7, INK.void);
            p.rect(cx - 9, g - 3, 15, 3, INK.void);
            // crystals
            for (const [x, h] of [[cx - 14, 6], [cx - 11, 9], [cx + 7, 7], [cx + 10, 5]] as Array<[number, number]>) {
                for (let k = 0; k < h; k++) p.rect(x - Math.floor((h - k) / 4), g - 1 - k, Math.max(1, Math.floor((h - k) / 2)), 1, k > h - 3 ? INK.frost : INK.spirit);
            }
            p.px(cx - 2, g - 6, INK.spirit).px(cx + 1, g - 4, INK.teal);
            break;
        }
        case 'town':
        default: {
            paintHouse(p, cx - 13, g, 22, 8, HOUSE_STYLES.town, { door: true });
            paintHouse(p, cx + 13, g, 22, 8, HOUSE_STYLES.town, { door: false });
            paintHouse(p, cx, g - 2, 24, 9, HOUSE_STYLES.temple, { floors: 2, lantern: true });
            break;
        }
    }
    return p.outline(INK.void);
}
