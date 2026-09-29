import Phaser from 'phaser';
import { FONT } from './palette';

/**
 * Forces every Phaser Text in the game onto the pixel font, snapped to whole multiples of the
 * font's 12px design grid so glyphs stay crisp. Existing scene code keeps working untouched.
 */
const GRID = 12;

const snapSize = (raw: unknown): string | number | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (!Number.isFinite(n)) return raw as string;
    const snapped = n < 18 ? GRID : Math.max(GRID, Math.round(n / GRID) * GRID);
    return `${snapped}px`;
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
        const size = snapSize(s.fontSize);
        if (size !== undefined) s.fontSize = size as string;
        if (typeof s.fontStyle === 'string') s.fontStyle = s.fontStyle.replace(/bold/gi, '').trim();
        if (s.strokeThickness) s.strokeThickness = Math.max(4, Math.round(s.strokeThickness / 2) * 2);
        // Text-render resolution follows the canvas, no blurry supersampling.
        s.resolution = 1;
        return origSetStyle.call(this, s, updateText, setDefaults);
    };

    const origSize = proto.setFontSize;
    proto.setFontSize = function (size: number | string) {
        return origSize.call(this, snapSize(size) as string);
    };
    const origFam = proto.setFontFamily;
    proto.setFontFamily = function () {
        return origFam.call(this, FONT);
    };
    const origFS = proto.setFontStyle;
    proto.setFontStyle = function (fs: string) {
        return origFS.call(this, (fs || '').replace(/bold/gi, '').trim());
    };
}
