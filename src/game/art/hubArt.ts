import { INK } from './palette';
import { Pix, bayer, rng } from './pix';
import { HOUSE_STYLES, paintHouse, paintPine, paintRock, type HouseStyle } from './buildings';

/** Street-level scenes for hubs: the art is 360px tall, ground line at GROUND. */
export const GROUND = 236;

/** Lantern string between two points (catenary-ish sag) with hanging lanterns. */
function lanternString(p: Pix, x0: number, y0: number, x1: number, y1: number, r: () => number): void {
    const n = Math.abs(x1 - x0);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = Math.round(x0 + (x1 - x0) * t);
        const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 10);
        p.px(x, y, INK.void);
        if (i % 14 === 7) {
            p.px(x, y + 1, INK.void);
            p.rect(x - 1, y + 2, 3, 4, r() < 0.8 ? INK.cinnabar : INK.gold).px(x, y + 3, INK.amber);
            p.px(x - 1, y + 2, INK.void).px(x + 1, y + 2, INK.void).px(x, y + 6, INK.gold);
        }
    }
}

/**
 * The street backdrop: a row of distant roofs, filler houses, stone road with curb.
 * `reserved` are x-ranges (art px) kept clear for interactive location buildings.
 */
export function paintStreet(w: number, seed: number, reserved: Array<[number, number]>, style: 'town' | 'sect'): Pix {
    const p = new Pix(w, 360);
    const r = rng(seed);
    // distant roofs silhouette
    if (style === 'town') {
        for (let x = -10; x < w; x += 26 + Math.floor(r() * 20)) {
            const hw = 14 + Math.floor(r() * 12), top = GROUND - 70 - Math.floor(r() * 30);
            for (let k = 0; k < 8; k++) p.rect(x - hw + Math.round(k * 0.6), top + k, (hw - Math.round(k * 0.6)) * 2, 1, INK.plum);
            p.rect(x - hw + 5, top + 8, hw * 2 - 10, GROUND - top, INK.plum);
            if (r() < 0.5) p.rect(x - 2, top + 14, 3, 3, INK.amber);
        }
    } else {
        for (let x = 0; x < w; x += 40 + Math.floor(r() * 30)) paintPine(p, x, GROUND - 20, 40 + Math.floor(r() * 30), INK.pine, INK.jade);
    }
    // filler houses between reserved spots
    const clear = (a: number, b: number) => !reserved.some(([ra, rb]) => b > ra - 6 && a < rb + 6);
    let x = 4;
    const houses: Array<[number, number]> = [];
    while (x < w) {
        const hw = 44 + Math.floor(r() * 40);
        if (clear(x, x + hw)) {
            if (style === 'town') {
                const st: HouseStyle = r() < 0.6 ? HOUSE_STYLES.town : HOUSE_STYLES.shop;
                paintHouse(p, x + Math.floor(hw / 2), GROUND, hw, 22 + Math.floor(r() * 10), st, { floors: r() < 0.3 ? 2 : 1, lantern: r() < 0.5, door: true });
                houses.push([x + Math.floor(hw / 2), GROUND - 40]);
            } else {
                paintRock(p, x + Math.floor(hw / 2), GROUND, hw, 20 + Math.floor(r() * 26), INK.slate, INK.dusk, Math.floor(r() * 99));
                paintPine(p, x + Math.floor(hw / 2) + 6, GROUND - 6, 26, INK.pine, INK.teal);
            }
            x += hw + 4;
        } else x += 8;
    }
    // road
    p.rect(0, GROUND, w, 360 - GROUND, INK.grey);
    p.rect(0, GROUND, w, 2, INK.ash);
    p.rect(0, GROUND + 2, w, 1, INK.indigo);
    for (let y = GROUND + 6; y < 360; y += 8) {
        const off = (y / 8) % 2 ? 0 : 9;
        p.rect(0, y, w, 1, INK.indigo);
        for (let xx = off; xx < w; xx += 18) p.rect(xx, y - 7, 1, 7, INK.indigo);
    }
    for (let i = 0; i < w / 5; i++) p.px(Math.floor(r() * w), GROUND + 4 + Math.floor(r() * 90), INK.ash);
    // front curb, darker toward the viewer
    for (let y = 320; y < 360; y++) for (let xx = 0; xx < w; xx++) if (bayer(xx, y) < (y - 320) / 40) p.px(xx, y, INK.indigo);
    // lantern strings between houses
    if (style === 'town') for (let i = 0; i + 1 < houses.length; i++) {
        if (r() < 0.7) lanternString(p, houses[i][0], houses[i][1], houses[i + 1][0], houses[i + 1][1], r);
    }
    return p;
}

/** Location buildings (bigger, interactive). Anchor bottom-centre at GROUND. */
export function paintLocationBuilding(icon: string, highlight = false): Pix {
    const W = 150, H = 150;
    const p = new Pix(W, H);
    const g = H - 2;
    const cx = W / 2;
    switch (icon) {
        case 'teahouse': {
            paintHouse(p, cx - 10, g, 96, 30, HOUSE_STYLES.shop, { lantern: true, sign: INK.bark });
            // tall banner
            p.rect(cx + 50, g - 76, 2, 76, INK.bark);
            p.rect(cx + 52, g - 74, 14, 30, INK.bone).rect(cx + 52, g - 74, 14, 2, INK.cinnabar).rect(cx + 52, g - 46, 14, 2, INK.cinnabar);
            // 茶 glyph (blocky)
            p.rect(cx + 54, g - 69, 10, 1, INK.void).rect(cx + 56, g - 71, 1, 4, INK.void).rect(cx + 61, g - 71, 1, 4, INK.void);
            p.rect(cx + 55, g - 65, 8, 1, INK.void).rect(cx + 58, g - 64, 2, 1, INK.void).rect(cx + 55, g - 62, 8, 1, INK.void);
            p.rect(cx + 58, g - 61, 2, 8, INK.void).px(cx + 56, g - 58, INK.void).px(cx + 61, g - 58, INK.void);
            // tables + stools
            for (const tx of [cx - 40, cx + 24]) {
                p.rect(tx, g - 9, 16, 2, INK.clay).rect(tx + 2, g - 7, 2, 7, INK.bark).rect(tx + 12, g - 7, 2, 7, INK.bark);
                p.rect(tx + 5, g - 12, 3, 3, INK.bone).rect(tx + 9, g - 12, 2, 2, INK.bone);
                p.rect(tx - 5, g - 4, 4, 1, INK.clay).rect(tx - 4, g - 3, 1, 3, INK.bark).rect(tx + 18, g - 4, 4, 1, INK.clay).rect(tx + 20, g - 3, 1, 3, INK.bark);
            }
            break;
        }
        case 'sect-gate':
        case 'archway': {
            // hillside with stairs up to a hall
            paintRock(p, cx, g, 150, 50, INK.slate, INK.dusk, 5);
            paintHouse(p, cx, g - 44, 90, 22, HOUSE_STYLES.sect, { floors: 2, lantern: true });
            for (let i = 0; i < 14; i++) p.rect(cx - 10 - i, g - 44 + i * 3, 21 + i * 2, 3, i % 2 ? INK.ash : INK.haze);
            paintPine(p, cx - 60, g - 18, 44);
            paintPine(p, cx + 62, g - 10, 50);
            // grand paifang in front
            const a = g;
            for (const px of [cx - 44, cx - 18, cx + 15, cx + 41]) p.rect(px, a - 50, 4, 50, INK.cinnabar).rect(px, a - 50, 1, 50, INK.vermilion);
            p.rect(cx - 52, a - 60, 104, 5, INK.jade).rect(cx - 48, a - 63, 96, 3, INK.teal).rect(cx - 55, a - 58, 3, 2, INK.teal).rect(cx + 52, a - 58, 3, 2, INK.teal);
            p.rect(cx - 30, a - 42, 60, 3, INK.jade).rect(cx - 34, a - 44, 68, 2, INK.teal);
            p.rect(cx - 44, a - 53, 88, 3, INK.cinnabar);
            p.rect(cx - 14, a - 56, 28, 11, INK.gold).rect(cx - 12, a - 54, 24, 7, INK.umber);
            for (let k = 0; k < 3; k++) p.rect(cx - 8 + k * 6, a - 52, 4, 3, INK.gold);
            break;
        }
        case 'gate-market':
        default: {
            paintHouse(p, cx, g, 100, 34, HOUSE_STYLES.temple, { floors: 2, lantern: true, sign: INK.gold });
            // market stalls with striped awnings
            for (const [sx, col] of [[cx - 62, INK.cinnabar], [cx + 46, INK.teal]] as Array<[number, number]>) {
                p.rect(sx - 12, g - 30, 26, 5, col);
                for (let k = 0; k < 26; k += 4) p.rect(sx - 12 + k, g - 30, 2, 5, INK.bone);
                p.rect(sx - 12, g - 25, 26, 1, INK.void);
                p.rect(sx - 11, g - 24, 1, 24, INK.bark).rect(sx + 12, g - 24, 1, 24, INK.bark);
                p.rect(sx - 10, g - 12, 22, 3, INK.clay).rect(sx - 10, g - 9, 22, 9, INK.bark);
                p.rect(sx - 8, g - 15, 4, 3, INK.amber).rect(sx - 2, g - 15, 5, 3, INK.spirit).rect(sx + 5, g - 16, 4, 4, INK.skin);
            }
            break;
        }
    }
    p.outline(highlight ? INK.gold : INK.void);
    if (highlight) p.outline(INK.void);
    return p;
}

/** Street folk: 12x24 robed figures in two walking frames. */
export function paintPerson(variant: number, frame: 0 | 1): Pix {
    const robes = [INK.cinnabar, INK.teal, INK.slate, INK.clay, INK.bone, INK.plum];
    const robe = robes[variant % robes.length];
    const robeLo = robe === INK.bone ? INK.clay : robe === INK.cinnabar ? INK.wine : robe === INK.teal ? INK.jade : robe === INK.slate ? INK.indigo : robe === INK.clay ? INK.bark : INK.void;
    const hat = variant % 3 === 0;
    const rows = [
        hat ? '..yyyyyyy...' : '....kkkk....',
        hat ? '.yyyyyyyyy..' : '...kkkkkk...',
        '....ssss....',
        '....sses....',
        '.....ss.....',
        '...rrrrrr...',
        '..rRrrrrrr..',
        '..rRrbbrrr..',
        '..sRrrrrrs..',
        '...Rrrrrr...',
        '...Rrrrrr...',
        '..rRrrrrrr..',
        '..rRrrrrrr..',
        '..rrrrrrrr..',
        '.rrrrrrrrrr.',
        '.llllllllll.',
        frame ? '..kk...kk...' : '...kk.kk....',
        frame ? '.kk.....kk..' : '...kk.kk....',
    ];
    const p = new Pix(12, 24);
    p.sprite(rows, 0, 5, {
        y: INK.gold, k: INK.void, s: INK.skin, e: INK.void, r: robe, R: robe === INK.bone ? INK.paper : INK.haze,
        b: INK.umber, l: robeLo,
    });
    return p.outline(INK.void);
}
