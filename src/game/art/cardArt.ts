import { INK } from './palette';
import { Pix } from './pix';
import { stampText } from './kit';

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
    for (const [x, y] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) p.px(x, y, INK.gold);
    return p;
}
