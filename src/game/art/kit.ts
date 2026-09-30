import Phaser from 'phaser';
import { FONT, INK, PX, hex } from './palette';
import { Pix, bake, snap } from './pix';
import { addIcon, type PixIcon } from './icons';

/* ------------------------------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------------------------------ */

export type TextSize = 1 | 2 | 3;

export interface PTextOptions {
    size?: TextSize;
    color?: number;
    /** 'outline' = 1 art-px ink ring (for text over art), 'shadow' = hard drop shadow, 'none'. */
    fx?: 'outline' | 'shadow' | 'none';
    shadowColor?: number;
    wrap?: number;
    align?: 'left' | 'center' | 'right';
    origin?: [number, number];
    lineGap?: number;
}

/** Pixel text: one font pixel = one art pixel (size 1) or two (size 2). */
export function ptext(scene: Phaser.Scene, x: number, y: number, str: string, o: PTextOptions = {}): Phaser.GameObjects.Text {
    const size = o.size ?? 1;
    const fx = o.fx ?? 'shadow';
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: FONT,
        fontSize: `${12 * PX * size}px`,
        color: hex(o.color ?? INK.paper),
        align: o.align ?? 'left',
        lineSpacing: o.lineGap ?? PX * 2,
    };
    if (fx === 'outline') { style.stroke = hex(INK.void); style.strokeThickness = PX * 2; }
    if (fx === 'shadow') style.shadow = { offsetX: 0, offsetY: PX * size, color: hex(o.shadowColor ?? INK.void), blur: 0, fill: true, stroke: true };
    if (o.wrap) style.wordWrap = { width: o.wrap, useAdvancedWrap: true };
    const t = scene.add.text(snap(x), snap(y), str, style);
    if (o.origin) t.setOrigin(o.origin[0], o.origin[1]);
    return t;
}

/** Truncate to fit `maxChars` full-width glyphs. */
export function clip(s: string, maxChars: number): string {
    const chars = [...(s ?? '')];
    return chars.length > maxChars ? chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…' : s;
}

export { drawPanel, drawButton, panel, type FrameStyle } from './frames';
import { drawButton, panel, type FrameStyle } from './frames';

/* ------------------------------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------------------------------ */

export interface PButtonOptions {
    x: number;
    y: number;
    width: number;
    height?: number;
    label?: string;
    icon?: PixIcon;
    style?: FrameStyle;
    size?: TextSize;
    textColor?: number;
    disabled?: boolean;
    depth?: number;
    onClick: () => void;
    /** Show a ▶ cursor beside the button while hovered. */
    cursor?: boolean;
}

export type PButton = Phaser.GameObjects.Container & { setEnabled(v: boolean): PButton; setLabel(s: string): PButton };

/** Chunky pixel button: lifts on hover, presses down its lip on click. */
export function pbutton(scene: Phaser.Scene, o: PButtonOptions): PButton {
    const w = snap(o.width), h = snap(o.height ?? 60);
    const aw = Math.round(w / PX), ah = Math.round(h / PX);
    let style: FrameStyle = o.disabled ? 'grey' : o.style ?? 'seal';
    const keys = (s: FrameStyle) => (['up', 'hover', 'down'] as const).map((st) =>
        bake(scene, `pxbtn:${s}:${aw}x${ah}:${st}`, () => { const p = new Pix(aw, ah); drawButton(p, aw, ah, s, st); return p; }));
    let [kUp, kHover, kDown] = keys(style);

    const c = scene.add.container(snap(o.x), snap(o.y)) as PButton;
    if (o.depth !== undefined) c.setDepth(o.depth);
    const body = scene.add.image(0, 0, kUp).setScale(PX);
    c.add(body);
    const faceY = -PX; // label sits on the face, above the lip
    const content = scene.add.container(0, faceY);
    c.add(content);
    let label: Phaser.GameObjects.Text | undefined;
    let icon: Phaser.GameObjects.Image | undefined;
    const textColor = () => (style === 'grey' ? INK.ash : o.textColor ?? (style === 'paper' ? INK.umber : INK.paper));
    const layout = () => {
        const iw = icon ? 11 * PX + (label ? PX * 3 : 0) : 0;
        const lw = label ? label.width : 0;
        const x0 = -(iw + lw) / 2;
        if (icon) icon.setPosition(snap(x0 + (11 * PX) / 2), 0);
        if (label) label.setPosition(snap(x0 + iw), 0);
    };
    if (o.icon) { icon = addIcon(scene, 0, 0, o.icon); content.add(icon); }
    if (o.label) {
        label = ptext(scene, 0, 0, o.label, { size: o.size ?? 1, color: textColor(), fx: 'shadow', shadowColor: style === 'paper' ? INK.clay : INK.void, origin: [0, 0.5] });
        content.add(label);
    }
    layout();

    const cursor = o.cursor ? ptext(scene, -w / 2 - PX * 8, faceY, '▶', { color: INK.gold, origin: [0.5, 0.5] }).setVisible(false) : undefined;
    if (cursor) c.add(cursor);

    c.setSize(w, h);
    let enabled = !o.disabled;
    let hovering = false;
    const setVisual = (st: 'up' | 'hover' | 'down') => {
        body.setTexture(st === 'up' ? kUp : st === 'hover' ? kHover : kDown);
        content.y = faceY + (st === 'down' ? PX * 2 : 0);
        if (cursor) cursor.setVisible(st !== 'up');
    };
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => { if (!enabled) return; hovering = true; setVisual('hover'); });
    c.on('pointerout', () => { hovering = false; if (enabled) setVisual('up'); });
    c.on('pointerdown', () => { if (enabled) setVisual('down'); });
    c.on('pointerup', () => {
        if (!enabled) return;
        setVisual(hovering ? 'hover' : 'up');
        o.onClick();
    });

    c.setEnabled = (v: boolean) => {
        enabled = v;
        style = v ? o.style ?? 'seal' : 'grey';
        [kUp, kHover, kDown] = keys(style);
        setVisual('up');
        label?.setColor(hex(textColor()));
        if (c.input) c.input.cursor = v ? 'pointer' : 'default';
        return c;
    };
    c.setLabel = (s: string) => { label?.setText(s); layout(); return c; };
    return c;
}

/** Square icon button (e.g. back, log, settings). */
export function piconButton(scene: Phaser.Scene, x: number, y: number, icon: PixIcon, onClick: () => void, style: FrameStyle = 'slate', size = 22): PButton {
    return pbutton(scene, { x, y, width: size * PX, height: (size + 2) * PX, icon, style, onClick });
}

/* ------------------------------------------------------------------------------------------ *
 * Bars, chips, tooltips
 * ------------------------------------------------------------------------------------------ */

/** Segmented pixel bar. Width/height in logical px. Returns a redraw fn. */
export function pbar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number, back: number = INK.ink) {
    const g = scene.add.graphics().setPosition(snap(x), snap(y));
    const draw = (v: number, color = fill) => {
        g.clear();
        g.fillStyle(INK.void, 1); g.fillRect(0, 0, w, h);
        g.fillStyle(back, 1); g.fillRect(PX, PX, w - PX * 2, h - PX * 2);
        const inner = w - PX * 2;
        const fw = snap(inner * Phaser.Math.Clamp(v, 0, 1));
        g.fillStyle(color, 1); g.fillRect(PX, PX, fw, h - PX * 2);
        g.fillStyle(INK.paper, 0.5); g.fillRect(PX, PX, fw, PX);
    };
    draw(1);
    return { g, draw };
}

/** Small chip: icon + value, e.g. ◆ 36. */
export function pchip(scene: Phaser.Scene, x: number, y: number, icon: PixIcon, value: string, color: number = INK.paper): Phaser.GameObjects.Container & { setValue(v: string): void } {
    const c = scene.add.container(snap(x), snap(y)) as Phaser.GameObjects.Container & { setValue(v: string): void };
    const ic = addIcon(scene, 0, 0, icon).setOrigin(0, 0.5);
    const t = ptext(scene, 14 * PX, 0, value, { color, fx: 'outline', origin: [0, 0.5] });
    c.add([ic, t]);
    c.setValue = (v: string) => { t.setText(v); };
    return c;
}

/** Floating tooltip panel that sizes itself to its text; call `show` / `hide`. */
export class PTooltip {
    private box: Phaser.GameObjects.Container;
    private bg?: Phaser.GameObjects.Image;
    private title: Phaser.GameObjects.Text;
    private body: Phaser.GameObjects.Text;

    constructor(private scene: Phaser.Scene, private width = 480, depth = 9000) {
        this.box = scene.add.container(0, 0).setDepth(depth).setVisible(false);
        this.title = ptext(scene, PX * 7, PX * 6, '', { color: INK.gold });
        this.body = ptext(scene, PX * 7, PX * 6 + 48, '', { color: INK.bone, wrap: width - PX * 14 });
        this.box.add([this.title, this.body]);
    }

    show(x: number, y: number, title: string, body: string): void {
        this.title.setText(title);
        this.body.setText(body);
        this.body.setY(title ? PX * 6 + 48 : PX * 6);
        const h = snap((title ? 48 : 0) + (body ? this.body.height : 0) + PX * 14);
        this.bg?.destroy();
        this.bg = panel(this.scene, this.width / 2, h / 2, this.width, h, 'ink');
        this.box.addAt(this.bg, 0);
        const { width: W, height: H } = this.scene.scale;
        const bx = Phaser.Math.Clamp(x, PX * 4, W - this.width - PX * 4);
        const by = Phaser.Math.Clamp(y, PX * 4, H - h - PX * 4);
        this.box.setPosition(snap(bx), snap(by)).setVisible(true);
    }

    hide(): void { this.box.setVisible(false); }
    destroy(): void { this.box.destroy(); }
}

/** A short banner message that drops in from the top and leaves by itself. */
export function ptoast(scene: Phaser.Scene, message: string, color: number = INK.bone, ms = 2600): void {
    if (!message) return;
    const { width } = scene.scale;
    const t = ptext(scene, 0, 0, message, { color, origin: [0.5, 0.5], wrap: Math.min(1200, width - 200), align: 'center' });
    const w = snap(Math.min(1260, t.width + PX * 20));
    const h = snap(t.height + PX * 10);
    const bg = panel(scene, 0, 0, w, h, 'ink');
    const c = scene.add.container(snap(width / 2), -h).setDepth(9500);
    c.add([bg, t]);
    scene.tweens.add({ targets: c, y: snap(h / 2 + PX * 8), duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: c, y: -h, duration: 220, delay: ms, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
}

/* ------------------------------------------------------------------------------------------ *
 * Numbers: a chunky outlined 5x7 bitmap digit face
 * ------------------------------------------------------------------------------------------ */

const DIGITS: Record<string, string[]> = {
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
    'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const DIGIT_CHARS = Object.keys(DIGITS).join('');

/** Register an outlined bitmap number font in `color`; returns its key. */
export function numberFont(scene: Phaser.Scene, color: number = INK.paper): string {
    const key = `pxnum:${color.toString(16)}`;
    if (scene.cache.bitmapFont.exists(key)) return key;
    const cw = 7, ch = 9;
    const p = new Pix(cw * DIGIT_CHARS.length, ch);
    [...DIGIT_CHARS].forEach((c, i) => {
        const glyph = new Pix(cw, ch);
        glyph.sprite(DIGITS[c].map((r) => r.replace(/#/g, 'a')), 1, 1, { a: color });
        glyph.outline(INK.void, true);
        p.blit(glyph, i * cw, 0);
    });
    p.texture(scene, key);
    const data = Phaser.GameObjects.RetroFont.Parse(scene, {
        image: key, width: cw, height: ch, chars: DIGIT_CHARS, charsPerRow: DIGIT_CHARS.length,
        'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0,
    } as unknown as Phaser.Types.GameObjects.BitmapText.RetroFontConfig);
    scene.cache.bitmapFont.add(key, data);
    return key;
}

/** Bitmap number text at `k` art px per font px. Letter spacing overlaps the outlines by one px. */
export function pnum(scene: Phaser.Scene, x: number, y: number, value: string | number, color: number = INK.paper, k = 1): Phaser.GameObjects.BitmapText {
    const t = scene.add.bitmapText(snap(x), snap(y), numberFont(scene, color), String(value)).setScale(PX * k);
    t.setLetterSpacing(-1);
    return t;
}

/* ------------------------------------------------------------------------------------------ *
 * Display titles: the pixel font rasterised at 12px and re-inked as a chunky logo
 * ------------------------------------------------------------------------------------------ */

export interface TitleStyle { face?: number; lower?: number; extrude?: number; extrudeDepth?: number; gap?: number }

/** Paint `str` as a logo texture: two-tone face, ink outline, extruded drop. k = art px per font px. */
export function titlePix(str: string, k = 3, s: TitleStyle = {}): Pix {
    const face = s.face ?? INK.paper, lower = s.lower ?? INK.bone, extrude = s.extrude ?? INK.cinnabar;
    const depth = s.extrudeDepth ?? 2;
    const gap = s.gap ?? 1;
    const chars = [...str];
    const fw = 12;
    const cv = document.createElement('canvas');
    cv.width = chars.length * (fw + gap) + 4; cv.height = 16;
    const ctx = cv.getContext('2d')!;
    ctx.font = '12px Zpix';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    chars.forEach((ch, i) => ctx.fillText(ch, 2 + i * (fw + gap), 2));
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < cv.width && y < cv.height && data[(y * cv.width + x) * 4 + 3] > 110;
    const W = cv.width * k + 4, H = cv.height * k + depth + 4;
    const p = new Pix(W, H);
    for (let d = depth; d >= 1; d--) for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        if (on(x, y)) p.rect(2 + x * k, 2 + y * k + d, k, k, d === depth ? INK.wine : extrude);
    }
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        if (!on(x, y)) continue;
        p.rect(2 + x * k, 2 + y * k, k, k, y < 8 ? face : lower);
    }
    p.outline(INK.void);
    return p;
}

export function ptitle(scene: Phaser.Scene, x: number, y: number, str: string, k = 3, s: TitleStyle = {}): Phaser.GameObjects.Image {
    const key = bake(scene, `pxtitle:${str}:${k}:${JSON.stringify(s)}`, () => titlePix(str, k, s));
    return scene.add.image(snap(x), snap(y), key).setScale(PX);
}

export { stampText } from './pix';
