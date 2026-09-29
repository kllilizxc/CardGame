import Phaser from 'phaser';
import { C, FONT, hex, PX } from './palette';

export interface PanelStyle {
    fill?: number;
    edge?: number;      // outer outline
    border?: number;    // main frame colour
    hi?: number;        // bevel highlight
    lo?: number;        // bevel shadow
    stud?: number | null; // corner stud colour (null = none)
    alpha?: number;
    shadow?: boolean;
}

export const PANEL_INK: PanelStyle = { fill: C.ink, edge: C.void, border: C.twilight, hi: C.haze, lo: C.night, stud: C.gold };
export const PANEL_PAPER: PanelStyle = { fill: C.parchment, edge: C.umber, border: C.wood, hi: C.paper, lo: C.bark, stud: C.crimson };
export const PANEL_JADE: PanelStyle = { fill: C.pine, edge: C.void, border: C.moss, hi: C.jade, lo: C.ink, stud: C.lime };
export const PANEL_BLOOD: PanelStyle = { fill: C.umber, edge: C.void, border: C.crimson, hi: C.cinnabar, lo: C.blood, stud: C.gold };

/** Draw a stepped-corner pixel frame with bevel into `g` (top-left origin at 0,0). */
export function drawPixelFrame(g: Phaser.GameObjects.Graphics, w: number, h: number, s: PanelStyle = PANEL_INK): void {
    const u = PX;
    const { fill = C.ink, edge = C.void, border = C.twilight, hi = C.haze, lo = C.night, stud = C.gold, alpha = 1, shadow = true } = s;
    const rect = (x: number, y: number, ww: number, hh: number, c: number, a = 1) => {
        g.fillStyle(c, a);
        g.fillRect(x, y, ww, hh);
    };
    if (shadow) rect(u, u * 2, w, h, C.void, 0.55);
    // outline with cut corners
    rect(u, 0, w - 2 * u, h, edge);
    rect(0, u, w, h - 2 * u, edge);
    // frame
    rect(u, u, w - 2 * u, h - 2 * u, border);
    rect(u * 2, u * 2, w - 4 * u, h - 4 * u, fill, alpha);
    // bevel: light top/left, dark bottom/right inside frame
    rect(u * 2, u, w - 4 * u, u, hi);
    rect(u, u * 2, u, h - 4 * u, hi);
    rect(u * 2, h - 2 * u, w - 4 * u, u, lo);
    rect(w - 2 * u, u * 2, u, h - 4 * u, lo);
    // inner shading line
    rect(u * 3, u * 3, w - 6 * u, u / 2, C.void, 0.25);
    if (stud !== null) {
        for (const [sx, sy] of [[u, u], [w - 2 * u, u], [u, h - 2 * u], [w - 2 * u, h - 2 * u]]) {
            rect(sx, sy, u, u, stud);
        }
    }
}

/** Centre-anchored pixel panel. */
export function pixelPanel(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number, style: PanelStyle = PANEL_INK): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();
    g.setPosition(Math.round(cx - w / 2), Math.round(cy - h / 2));
    drawPixelFrame(g, w, h, style);
    return g;
}

export interface PixelButtonOptions {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    sub?: string;
    onClick: () => void;
    style?: PanelStyle;
    depth?: number;
    labelSize?: number;
    disabled?: boolean;
}

/** Chunky button: presses down 4px, glows on hover, ember sparks on click. */
export function pixelButton(scene: Phaser.Scene, o: PixelButtonOptions): Phaser.GameObjects.Container {
    const c = scene.add.container(o.x, o.y).setDepth(o.depth ?? 100);
    const base: PanelStyle = o.style ?? PANEL_BLOOD;
    const hot: PanelStyle = { ...base, border: C.gold, hi: C.glow, fill: base.fill };
    const g = scene.add.graphics();
    g.setPosition(-Math.round(o.width / 2), -Math.round(o.height / 2));
    drawPixelFrame(g, o.width, o.height, o.disabled ? { ...base, border: C.haze, hi: C.mist, fill: C.night, stud: null } : base);
    const label = scene.add.text(0, o.sub ? -o.height * 0.14 : 0, o.label, {
        fontFamily: FONT, fontSize: `${o.labelSize ?? 24}px`, color: hex(o.disabled ? C.mist : C.paper),
        stroke: hex(C.void), strokeThickness: 4,
    }).setOrigin(0.5);
    c.add([g, label]);
    if (o.sub) {
        c.add(scene.add.text(0, o.height * 0.24, o.sub, {
            fontFamily: FONT, fontSize: '12px', color: hex(C.fog),
            wordWrap: { width: o.width - 32 }, align: 'center',
        }).setOrigin(0.5));
    }
    const arrowL = scene.add.text(-o.width / 2 - 28, 0, '▶', { fontFamily: FONT, fontSize: '24px', color: hex(C.gold) }).setOrigin(0.5).setVisible(false);
    const arrowR = scene.add.text(o.width / 2 + 28, 0, '◀', { fontFamily: FONT, fontSize: '24px', color: hex(C.gold) }).setOrigin(0.5).setVisible(false);
    c.add([arrowL, arrowR]);
    c.setSize(o.width, o.height);
    if (!o.disabled) {
        c.setInteractive({ useHandCursor: true });
        c.on('pointerover', () => {
            g.clear(); drawPixelFrame(g, o.width, o.height, hot);
            arrowL.setVisible(true); arrowR.setVisible(true);
            scene.tweens.add({ targets: [arrowL, arrowR], alpha: { from: 0.4, to: 1 }, duration: 120 });
            c.y = o.y - PX;
        });
        c.on('pointerout', () => {
            g.clear(); drawPixelFrame(g, o.width, o.height, base);
            arrowL.setVisible(false); arrowR.setVisible(false);
            c.y = o.y;
        });
        c.on('pointerdown', () => {
            c.y = o.y + PX;
            for (let i = 0; i < 8; i++) {
                const p = scene.add.rectangle(o.x + (Math.random() - 0.5) * o.width, o.y, 6, 6, i % 2 ? C.gold : C.ember).setDepth((o.depth ?? 100) + 5);
                scene.tweens.add({ targets: p, y: o.y - 60 - Math.random() * 60, alpha: 0, duration: 420, onComplete: () => p.destroy() });
            }
            o.onClick();
        });
    }
    return c;
}

/** Segmented pixel bar (HP / qi). value 0..1 */
export function drawPixelBar(g: Phaser.GameObjects.Graphics, w: number, h: number, value: number, fill: number, back: number = C.ink, segments = 10): void {
    g.clear();
    g.fillStyle(C.void, 1); g.fillRect(0, 0, w, h);
    g.fillStyle(back, 1); g.fillRect(PX / 2, PX / 2, w - PX, h - PX);
    const inner = w - PX * 2;
    const filled = Math.round(inner * Phaser.Math.Clamp(value, 0, 1));
    g.fillStyle(fill, 1); g.fillRect(PX, PX, filled, h - PX * 2);
    g.fillStyle(C.paper, 0.35); g.fillRect(PX, PX, filled, PX / 2);
    g.fillStyle(C.void, 0.45);
    for (let i = 1; i < segments; i++) g.fillRect(PX + Math.floor((inner * i) / segments), PX, PX / 2, h - PX * 2);
}
