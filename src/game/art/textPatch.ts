import Phaser from 'phaser';
import { FONT, PX } from './palette';

/**
 * Forces every Phaser Text in the game onto the pixel font at whole multiples of its 12px
 * design grid scaled by the art pixel (3x) — so one font pixel is always one art pixel (36px)
 * or two (72px). Anything else would be torn apart by the 3px pixelation pass.
 */
const GRID = 12 * PX;

export const snapFontSize = (raw: unknown): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n)) return undefined;
    const k = Math.max(1, Math.round(n / GRID - 0.25));
    return `${k * GRID}px`;
};

let installed = false;

export function installPixelText(): void {
    if (installed) return;
    installed = true;

    const proto = Phaser.GameObjects.TextStyle.prototype;
    const origSetStyle = proto.setStyle;
    proto.setStyle = function (style: Phaser.Types.GameObjects.Text.TextStyle, updateText?: boolean, setDefaults?: boolean) {
        const s: Phaser.Types.GameObjects.Text.TextStyle = { ...(style || {}) };
        s.fontFamily = FONT;
        const size = snapFontSize(s.fontSize ?? 12);
        if (size !== undefined) s.fontSize = size;
        if (typeof s.fontStyle === 'string') s.fontStyle = s.fontStyle.replace(/bold|italic/gi, '').trim();
        // A stroke becomes a crisp one-art-pixel outline.
        if (s.strokeThickness) s.strokeThickness = PX * 2;
        s.resolution = 1;
        if (s.lineSpacing === undefined) s.lineSpacing = PX * 2;
        // CJK has no spaces to break on — wrap per glyph.
        if (s.wordWrap && s.wordWrap.width) s.wordWrap = { ...s.wordWrap, useAdvancedWrap: true };
        return origSetStyle.call(this, s, updateText, setDefaults);
    };

    const origSize = proto.setFontSize;
    proto.setFontSize = function (size: number | string) {
        return origSize.call(this, snapFontSize(size) ?? `${GRID}px`);
    };
    const origFam = proto.setFontFamily;
    proto.setFontFamily = function () {
        return origFam.call(this, FONT);
    };
    const origFS = proto.setFontStyle;
    proto.setFontStyle = function (fs: string) {
        return origFS.call(this, (fs || '').replace(/bold|italic/gi, '').trim());
    };
    const origStroke = proto.setStroke;
    proto.setStroke = function (color: string, thickness: number) {
        return origStroke.call(this, color, thickness ? PX * 2 : 0);
    };
}
