import type Phaser from 'phaser';
import { INK, PX } from './palette';
import { Pix, bake, snap } from './pix';

/* ------------------------------------------------------------------------------------------ *
 * Frames — drawn on the art grid, sized in art pixels
 * ------------------------------------------------------------------------------------------ */

export type FrameStyle = 'ink' | 'paper' | 'seal' | 'jade' | 'slate' | 'gold' | 'ghost' | 'grey';

interface FrameColors { fill: number; line: number; hi: number; lip: number; corner: number; inner?: number }

const FRAMES: Record<FrameStyle, FrameColors> = {
    ink: { fill: INK.ink, line: INK.slate, hi: INK.indigo, lip: INK.void, corner: INK.bone, inner: INK.indigo },
    paper: { fill: INK.bone, line: INK.clay, hi: INK.paper, lip: INK.clay, corner: INK.cinnabar, inner: INK.clay },
    seal: { fill: INK.cinnabar, line: INK.wine, hi: INK.vermilion, lip: INK.wine, corner: INK.gold },
    jade: { fill: INK.jade, line: INK.pine, hi: INK.teal, lip: INK.pine, corner: INK.spirit },
    slate: { fill: INK.indigo, line: INK.ink, hi: INK.slate, lip: INK.ink, corner: INK.mist },
    gold: { fill: INK.umber, line: INK.amber, hi: INK.gold, lip: INK.void, corner: INK.gold, inner: INK.bark },
    ghost: { fill: INK.ink, line: INK.indigo, hi: INK.ink, lip: INK.void, corner: INK.slate },
    grey: { fill: INK.grey, line: INK.indigo, hi: INK.ash, lip: INK.indigo, corner: INK.ash },
};

/** Panel: ink outline with notched corners, mounting line inset, little corner studs. */
export function drawPanel(p: Pix, x: number, y: number, w: number, h: number, style: FrameStyle = 'ink'): void {
    const f = FRAMES[style];
    p.rect(x + 1, y, w - 2, h, INK.void).rect(x, y + 1, w, h - 2, INK.void);
    p.rect(x + 1, y + 1, w - 2, h - 2, f.line);
    p.rect(x + 2, y + 2, w - 4, h - 4, f.fill);
    p.rect(x + 2, y + 2, w - 4, 1, f.hi);
    if (f.inner !== undefined && w > 16 && h > 16) {
        p.frame(x + 4, y + 4, w - 8, h - 8, f.inner);
        for (const [cx, cy] of [[x + 3, y + 3], [x + w - 6, y + 3], [x + 3, y + h - 6], [x + w - 6, y + h - 6]]) {
            p.rect(cx, cy, 3, 3, f.fill).px(cx + 1, cy + 1, f.corner);
        }
    }
}

/** Button body: face + chunky lip underneath. `down` hides the lip (pressed). */
export function drawButton(p: Pix, w: number, h: number, style: FrameStyle, state: 'up' | 'hover' | 'down'): void {
    const f = FRAMES[style];
    const lip = 2;
    const top = state === 'down' ? lip : 0;
    const face = state === 'hover' ? f.hi : f.fill;
    const hi = state === 'hover' ? lighten(style) : f.hi;
    // shadow lip
    p.rect(1, lip, w - 2, h - lip, INK.void).rect(0, lip + 1, w, h - lip - 2, INK.void);
    if (state !== 'down') p.rect(1, lip + 1, w - 2, h - lip - 2, f.lip);
    // face
    p.rect(1, top, w - 2, h - lip, INK.void).rect(0, top + 1, w, h - lip - 2, INK.void);
    p.rect(1, top + 1, w - 2, h - lip - 2, face);
    p.rect(2, top + 1, w - 4, 1, hi);
    p.px(1, top + 1, f.corner).px(w - 2, top + 1, f.corner);
}

function lighten(style: FrameStyle): number {
    switch (style) {
        case 'seal': return INK.amber;
        case 'jade': return INK.spirit;
        case 'paper': return INK.paper;
        case 'gold': return INK.gold;
        default: return INK.mist;
    }
}

/** Centre-anchored panel image in logical coordinates. */
export function panel(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number, style: FrameStyle = 'ink'): Phaser.GameObjects.Image {
    const aw = Math.max(8, Math.round(w / PX)), ah = Math.max(8, Math.round(h / PX));
    const key = bake(scene, `pxpanel:${style}:${aw}x${ah}`, () => { const p = new Pix(aw, ah); drawPanel(p, 0, 0, aw, ah, style); return p; });
    return scene.add.image(snap(cx), snap(cy), key).setScale(PX);
}

