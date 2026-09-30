import { INK } from './palette';
import { Pix, stampText } from './pix';

/** Card back: cinnabar border, ink field with cloud scrolls, a bone seal in the middle. */
export function paintCardBack(w = 64, h = 88): Pix {
    const p = new Pix(w, h);
    p.rect(1, 0, w - 2, h, INK.void).rect(0, 1, w, h - 2, INK.void);
    p.rect(1, 1, w - 2, h - 2, INK.cinnabar);
    p.rect(2, 2, w - 4, 1, INK.vermilion);
    p.rect(4, 4, w - 8, h - 8, INK.wine);
    p.rect(5, 5, w - 10, h - 10, INK.ink);
    // cloud scroll tiling
    for (let y = 8; y < h - 8; y += 10) for (let x = 8 + ((y / 10) % 2) * 6; x < w - 10; x += 12) {
        p.px(x, y, INK.slate).px(x + 1, y - 1, INK.slate).px(x + 2, y - 1, INK.slate).px(x + 3, y, INK.slate).px(x + 2, y + 1, INK.indigo);
    }
    // seal
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    p.rect(cx - 9, cy - 9, 18, 18, INK.void).rect(cx - 8, cy - 8, 16, 16, INK.bone).rect(cx - 7, cy - 7, 14, 14, INK.cinnabar);
    stampText(p, '青', cx - 6, cy - 6, INK.paper);
    if (w > 40) for (const [x, y] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) p.px(x, y, INK.gold);
    return p;
}

/* ------------------------------------------------------------------------------------------ *
 * Card faces — 60x86 art px (180x258 on the canvas). Name, kind and art are baked; live
 * numbers (attack / health) are drawn on top as bitmap digits by the sprite.
 * ------------------------------------------------------------------------------------------ */

export const CARD_W = 60;
export const CARD_H = 86;

export type CardKindKey = 'unit' | 'artifact' | 'talisman' | 'field' | 'pill' | 'skill';

interface KindLook { frame: number; frameHi: number; frameLo: number; plate: number; plateText: number; glyph: string; label: string; art: number; artLo: number }

export const KIND_LOOK: Record<CardKindKey, KindLook> = {
    unit: { frame: INK.bone, frameHi: INK.paper, frameLo: INK.clay, plate: INK.paper, plateText: INK.umber, glyph: '灵', label: '灵契', art: INK.haze, artLo: INK.mist },
    artifact: { frame: INK.gold, frameHi: INK.paper, frameLo: INK.amber, plate: INK.bone, plateText: INK.umber, glyph: '器', label: '法器', art: INK.umber, artLo: INK.bark },
    talisman: { frame: INK.cinnabar, frameHi: INK.vermilion, frameLo: INK.wine, plate: INK.bone, plateText: INK.wine, glyph: '符', label: '符箓', art: INK.plum, artLo: INK.wine },
    field: { frame: INK.teal, frameHi: INK.spirit, frameLo: INK.jade, plate: INK.frost, plateText: INK.pine, glyph: '阵', label: '场地', art: INK.jade, artLo: INK.pine },
    pill: { frame: INK.amber, frameHi: INK.gold, frameLo: INK.clay, plate: INK.bone, plateText: INK.umber, glyph: '丹', label: '丹药', art: INK.umber, artLo: INK.bark },
    skill: { frame: INK.dusk, frameHi: INK.mist, frameLo: INK.slate, plate: INK.haze, plateText: INK.ink, glyph: '诀', label: '功法', art: INK.indigo, artLo: INK.ink },
};

const RARITY_GEM: Record<string, number> = { common: INK.ash, uncommon: INK.teal, rare: INK.dusk, epic: INK.plum, legendary: INK.gold, mythic: INK.vermilion };

/** Split a name into ≤2 lines of ≤5 glyphs, preferring the '·' break. */
export function cardNameLines(name: string): string[] {
    const chars = [...(name ?? '')];
    if (chars.length <= 5) return [name];
    const dot = chars.indexOf('·');
    if (dot > 0 && dot <= 5 && chars.length - dot - 1 <= 5) return [chars.slice(0, dot).join(''), chars.slice(dot + 1).join('')];
    const first = chars.slice(0, 5).join('');
    const rest = chars.slice(5);
    return [first, rest.length > 5 ? rest.slice(0, 4).join('') + '…' : rest.join('')];
}

/** Stamp glyphs packed at 11px (Zpix CJK glyphs carry a 1px right gutter), centred on cx. */
function stampPacked(p: Pix, str: string, cx: number, y: number, color: number): void {
    const chars = [...str];
    const w = chars.length * 11;
    let x = Math.round(cx - w / 2);
    for (const ch of chars) { stampText(p, ch, x, y, color); x += /[\x00-\x7f]/.test(ch) ? 6 : 11; }
}

export interface CardFaceInput {
    name: string;
    kind: CardKindKey;
    rarity?: string;
    stars?: number;
    art?: HTMLCanvasElement;       // optional illustration (any size, drawn into the window)
    icon?: Pix;                    // fallback emblem
}

export function paintCardFace(c: CardFaceInput): Pix {
    const W = CARD_W, H = CARD_H;
    const L = KIND_LOOK[c.kind] ?? KIND_LOOK.skill;
    const p = new Pix(W, H);
    // body + frame
    p.rect(1, 0, W - 2, H, INK.void).rect(0, 1, W, H - 2, INK.void);
    p.rect(1, 1, W - 2, H - 2, L.frame);
    p.rect(2, 1, W - 4, 1, L.frameHi).rect(1, 2, 1, H - 4, L.frameHi);
    p.rect(2, H - 2, W - 4, 1, L.frameLo).rect(W - 2, 2, 1, H - 4, L.frameLo);

    // art window
    const ax = 4, ay = 6, aw = W - 8, ah = 38;
    p.rect(ax - 1, ay - 1, aw + 2, ah + 2, INK.void);
    for (let y = 0; y < ah; y++) p.rect(ax, ay + y, aw, 1, y < ah * 0.6 ? L.art : L.artLo);
    if (c.art) {
        const cv = document.createElement('canvas');
        cv.width = aw; cv.height = ah;
        const x = cv.getContext('2d', { willReadFrequently: true })!;
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        const k = Math.max(aw / c.art.width, ah / c.art.height);
        const dw = c.art.width * k, dh = c.art.height * k;
        x.drawImage(c.art, (aw - dw) / 2, ah - dh, dw, dh);
        const d = x.getImageData(0, 0, aw, ah).data;
        for (let yy = 0; yy < ah; yy++) for (let xx = 0; xx < aw; xx++) {
            const i = (yy * aw + xx) * 4;
            if (d[i + 3] > 120) p.px(ax + xx, ay + yy, (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        }
    } else if (c.icon) {
        const big = new Pix(c.icon.w * 2, c.icon.h * 2);
        for (let y = 0; y < c.icon.h; y++) for (let x = 0; x < c.icon.w; x++) {
            const v = c.icon.get(x, y);
            if (v !== -1) big.rect(x * 2, y * 2, 2, 2, v);
        }
        p.blit(big, ax + Math.floor((aw - big.w) / 2), ay + Math.floor((ah - big.h) / 2) + 1);
    }
    // corner kind glyph on a little seal
    p.rect(ax, ay, 14, 14, INK.void).rect(ax, ay, 13, 13, L.frame).rect(ax + 1, ay + 1, 11, 11, L.frameLo);
    stampText(p, L.glyph, ax + 1, ay + 1, INK.paper);
    // rarity gem + stars along the top band
    const gem = RARITY_GEM[c.rarity ?? 'common'] ?? INK.ash;
    p.rect(W / 2 - 2, 1, 4, 4, INK.void).rect(W / 2 - 1, 2, 2, 2, gem);
    for (let i = 0; i < Math.min(5, c.stars ?? 0); i++) p.px(ax + aw - 2 - i * 3, 3, INK.gold).px(ax + aw - 2 - i * 3, 2, INK.paper);

    // name plate
    const lines = cardNameLines(c.name);
    const py = ay + ah + 2, ph = 26;
    p.rect(3, py, W - 6, ph, INK.void);
    p.rect(4, py + 1, W - 8, ph - 2, L.plate);
    const ty = lines.length === 1 ? py + 8 : py + 2;
    lines.forEach((line, i) => stampPacked(p, line, W / 2, ty + i * 12, L.plateText));

    // bottom strip: kind label (units get stat badges, painted empty; numbers are live)
    const by = py + ph + 1;
    if (c.kind === 'unit') {
        p.rect(3, by, 17, 12, INK.void).rect(4, by + 1, 15, 10, INK.wine).rect(4, by + 1, 15, 1, INK.cinnabar);
        p.rect(W - 20, by, 17, 12, INK.void).rect(W - 19, by + 1, 15, 10, INK.jade).rect(W - 19, by + 1, 15, 1, INK.teal);
    } else {
        stampPacked(p, L.label, W / 2, by, INK.void);
    }
    return p;
}
