import { Scene } from 'phaser';
import { FONT, INK, PX, hex } from '../../art/palette';
import { Pix, bake, snap } from '../../art/pix';
import { drawButton, panel as pixelPanelImage, type FrameStyle } from '../../art/frames';

const DISPLAY_FONT = FONT;
const BODY_FONT = FONT;
const UI_FONT = FONT;

const THEME_COLORS = {
    night: INK.ink,
    nightSoft: INK.indigo,
    ink: INK.void,
    panel: INK.ink,
    panelInner: INK.indigo,
    banner: INK.slate,
    jade: INK.jade,
    jadeBright: INK.teal,
    gold: INK.gold,
    goldSoft: INK.bone,
    parchment: INK.paper,
    parchmentSoft: INK.bone,
    ember: INK.cinnabar,
    emberBright: INK.vermilion,
    slate: INK.slate,
    shadow: INK.void,
} as const;

type ThemeTextRole =
    | 'sceneTitle'
    | 'sceneSubtitle'
    | 'panelTitle'
    | 'panelEyebrow'
    | 'body'
    | 'support'
    | 'status'
    | 'buttonLabel'
    | 'buttonDescription';

type ThemeButtonVariant = 'primary' | 'secondary' | 'option' | 'disabled';

interface ThemeButtonConfig {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    onClick: () => void;
    description?: string;
    variant?: ThemeButtonVariant;
    align?: 'center' | 'left';
}

interface ThemeStatusLineConfig {
    x: number;
    y: number;
    width: number;
    text: string;
    align?: 'center' | 'left';
}

interface ThemePanelConfig {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function getSceneTextStyle(
    role: ThemeTextRole,
    overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
    const shadow = { offsetX: 0, offsetY: PX, color: hex(INK.void), blur: 0, fill: true, stroke: true };
    const styles: Record<ThemeTextRole, Phaser.Types.GameObjects.Text.TextStyle> = {
        sceneTitle: { fontFamily: FONT, fontSize: '72px', color: hex(INK.paper), stroke: hex(INK.void), strokeThickness: 6 },
        sceneSubtitle: { fontFamily: FONT, fontSize: '36px', color: hex(INK.bone), shadow },
        panelTitle: { fontFamily: FONT, fontSize: '36px', color: hex(INK.gold), shadow },
        panelEyebrow: { fontFamily: FONT, fontSize: '36px', color: hex(INK.spirit), shadow },
        body: { fontFamily: FONT, fontSize: '36px', color: hex(INK.paper), lineSpacing: 6, shadow },
        support: { fontFamily: FONT, fontSize: '36px', color: hex(INK.haze), lineSpacing: 6, shadow },
        status: { fontFamily: FONT, fontSize: '36px', color: hex(INK.bone), lineSpacing: 6, shadow },
        buttonLabel: { fontFamily: FONT, fontSize: '36px', color: hex(INK.paper), shadow },
        buttonDescription: { fontFamily: FONT, fontSize: '36px', color: hex(INK.bone), shadow },
    };

    return {
        ...styles[role],
        ...overrides,
        ...(overrides.wordWrap ? { wordWrap: { useAdvancedWrap: true, ...overrides.wordWrap } } : {}),
    };
}

export function createSceneBackdrop(scene: Scene): Phaser.GameObjects.GameObject[] {
    const { width, height } = scene.scale;
    return [scene.add.rectangle(width / 2, height / 2, width, height, INK.ink, 1)];
}

export function createScenePanel(
    scene: Scene,
    config: ThemePanelConfig,
): Phaser.GameObjects.GameObject[] {
    return [pixelPanelImage(scene, config.x, config.y, config.width, config.height, 'ink')];
}

const VARIANT_STYLE: Record<ThemeButtonVariant, FrameStyle> = {
    primary: 'seal',
    secondary: 'slate',
    option: 'jade',
    disabled: 'grey',
};

function buttonKeys(scene: Scene, style: FrameStyle, w: number, h: number): [string, string, string] {
    const aw = Math.max(8, Math.round(w / PX)), ah = Math.max(8, Math.round(h / PX));
    return (['up', 'hover', 'down'] as const).map((st) =>
        bake(scene, `pxbtn:${style}:${aw}x${ah}:${st}`, () => { const p = new Pix(aw, ah); drawButton(p, aw, ah, style, st); return p; })) as [string, string, string];
}

export function createSceneButton(
    scene: Scene,
    config: ThemeButtonConfig,
): {
    objects: Phaser.GameObjects.GameObject[];
    background: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    description?: Phaser.GameObjects.Text;
} {
    const variant = config.variant ?? 'primary';
    const style = VARIANT_STYLE[variant];
    const align = config.align ?? 'center';
    const x = snap(config.x), y = snap(config.y);
    const w = snap(config.width), h = snap(Math.max(config.height, config.description ? 108 : 60));
    const [kUp, kHover, kDown] = buttonKeys(scene, style, w, h);
    const body = scene.add.image(x, y, kUp).setScale(PX);
    const background = scene.add.rectangle(x, y, w, h, 0x000000, 0.001);

    const textX = align === 'left' ? x - w / 2 + PX * 8 : x;
    const labelY = config.description ? y - PX * 7 : y - PX;
    const textColor = variant === 'disabled' ? hex(INK.ash) : hex(INK.paper);
    const label = scene.add.text(textX, snap(labelY), config.label, getSceneTextStyle('buttonLabel', {
        align, color: textColor, wordWrap: { width: w - PX * 16 }, maxLines: 1,
    } as Phaser.Types.GameObjects.Text.TextStyle)).setOrigin(align === 'left' ? 0 : 0.5, 0.5);

    const objects: Phaser.GameObjects.GameObject[] = [body, label];
    let description: Phaser.GameObjects.Text | undefined;
    if (config.description) {
        description = scene.add.text(textX, snap(y + PX * 8), config.description, getSceneTextStyle('buttonDescription', {
            align, color: variant === 'disabled' ? hex(INK.ash) : hex(INK.bone), wordWrap: { width: w - PX * 16 }, maxLines: 1,
        } as Phaser.Types.GameObjects.Text.TextStyle)).setOrigin(align === 'left' ? 0 : 0.5, 0.5);
        objects.push(description);
    }
    objects.push(background);

    if (variant !== 'disabled') {
        const texts = [label, description].filter(Boolean) as Phaser.GameObjects.Text[];
        const baseY = texts.map((t) => t.y);
        const setState = (st: 'up' | 'hover' | 'down') => {
            body.setTexture(st === 'up' ? kUp : st === 'hover' ? kHover : kDown);
            texts.forEach((t, i) => t.setY(baseY[i] + (st === 'down' ? PX * 2 : 0)));
        };
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => setState('hover'));
        background.on('pointerout', () => setState('up'));
        background.on('pointerdown', () => { setState('down'); config.onClick(); });
        background.on('pointerup', () => setState('hover'));
    }

    return { objects, background, label, description };
}

export function createStatusLine(
    scene: Scene,
    config: ThemeStatusLineConfig,
): {
    objects: Phaser.GameObjects.GameObject[];
    text: Phaser.GameObjects.Text;
} {
    const align = config.align ?? 'left';
    const textX = align === 'left' ? config.x - config.width / 2 + PX * 6 : config.x;
    const text = scene.add.text(snap(textX), snap(config.y), config.text, getSceneTextStyle('status', {
        align,
        stroke: hex(INK.void),
        strokeThickness: 6,
        wordWrap: { width: config.width - PX * 12 },
    })).setOrigin(align === 'left' ? 0 : 0.5, 0.5);

    return { objects: [text], text };
}

export const sceneTheme = {
    fonts: {
        display: DISPLAY_FONT,
        body: BODY_FONT,
        ui: UI_FONT,
    },
    colors: THEME_COLORS,
} as const;

