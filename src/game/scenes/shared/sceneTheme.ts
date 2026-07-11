import { Scene } from 'phaser';

const DISPLAY_FONT = '"Noto Serif SC", "STKaiti", "KaiTi", serif';
const BODY_FONT = '"Noto Serif SC", "Songti SC", "STSong", serif';
const UI_FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

const THEME_COLORS = {
    night: 0x0d1320,
    nightSoft: 0x172133,
    ink: 0x22180f,
    panel: 0x1f1912,
    panelInner: 0x2d2419,
    banner: 0x493824,
    jade: 0x4f7a62,
    jadeBright: 0x72a68a,
    gold: 0xd3b27b,
    goldSoft: 0xe8d5ab,
    parchment: 0xf3ead3,
    parchmentSoft: 0xd9c6a2,
    ember: 0x8f5037,
    emberBright: 0xb36c46,
    slate: 0x524a3f,
    shadow: 0x000000,
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
    const styles: Record<ThemeTextRole, Phaser.Types.GameObjects.Text.TextStyle> = {
        sceneTitle: {
            fontFamily: DISPLAY_FONT,
            fontSize: '52px',
            color: '#f3ead3',
            stroke: '#140f0a',
            strokeThickness: 6,
        },
        sceneSubtitle: {
            fontFamily: BODY_FONT,
            fontSize: '22px',
            color: '#d9c6a2',
        },
        panelTitle: {
            fontFamily: DISPLAY_FONT,
            fontSize: '34px',
            color: '#e8d5ab',
        },
        panelEyebrow: {
            fontFamily: UI_FONT,
            fontSize: '18px',
            color: '#72a68a',
            letterSpacing: 1.2,
        },
        body: {
            fontFamily: BODY_FONT,
            fontSize: '22px',
            color: '#f3ead3',
            lineSpacing: 10,
        },
        support: {
            fontFamily: BODY_FONT,
            fontSize: '18px',
            color: '#d9c6a2',
            lineSpacing: 8,
        },
        status: {
            fontFamily: UI_FONT,
            fontSize: '18px',
            color: '#e8d5ab',
            lineSpacing: 6,
        },
        buttonLabel: {
            fontFamily: UI_FONT,
            fontSize: '24px',
            color: '#f7efdc',
            fontStyle: 'bold',
        },
        buttonDescription: {
            fontFamily: BODY_FONT,
            fontSize: '18px',
            color: '#ead7b3',
        },
    };

    return {
        ...styles[role],
        ...overrides,
    };
}

export function createSceneBackdrop(scene: Scene): Phaser.GameObjects.GameObject[] {
    const { width, height } = scene.scale;
    const sky = scene.add.rectangle(width / 2, height / 2, width, height, THEME_COLORS.night, 1);
    const glaze = scene.add.rectangle(width / 2, height / 2, width, height, THEME_COLORS.nightSoft, 0.45);
    const leftGlow = scene.add.circle(width * 0.2, height * 0.24, 280, THEME_COLORS.jade, 0.12);
    const moon = scene.add.circle(width * 0.82, height * 0.18, 124, THEME_COLORS.goldSoft, 0.12);
    const moonHalo = scene.add.circle(width * 0.82, height * 0.18, 172, THEME_COLORS.gold, 0.05);
    const mistFront = scene.add.ellipse(width * 0.32, height * 0.74, width * 0.58, 180, THEME_COLORS.jadeBright, 0.06);
    const mistRear = scene.add.ellipse(width * 0.68, height * 0.8, width * 0.52, 160, THEME_COLORS.gold, 0.04);

    const ridges = scene.add.graphics();
    ridges.fillStyle(THEME_COLORS.ink, 0.58);
    ridges.beginPath();
    ridges.moveTo(0, height);
    ridges.lineTo(width * 0.14, height * 0.68);
    ridges.lineTo(width * 0.3, height * 0.78);
    ridges.lineTo(width * 0.44, height * 0.62);
    ridges.lineTo(width * 0.6, height * 0.75);
    ridges.lineTo(width * 0.78, height * 0.64);
    ridges.lineTo(width, height * 0.76);
    ridges.lineTo(width, height);
    ridges.closePath();
    ridges.fillPath();

    ridges.fillStyle(THEME_COLORS.panel, 0.7);
    ridges.beginPath();
    ridges.moveTo(0, height);
    ridges.lineTo(width * 0.18, height * 0.8);
    ridges.lineTo(width * 0.36, height * 0.88);
    ridges.lineTo(width * 0.52, height * 0.74);
    ridges.lineTo(width * 0.7, height * 0.86);
    ridges.lineTo(width * 0.9, height * 0.76);
    ridges.lineTo(width, height * 0.82);
    ridges.lineTo(width, height);
    ridges.closePath();
    ridges.fillPath();

    const border = scene.add.graphics();
    border.lineStyle(2, THEME_COLORS.gold, 0.38);
    border.strokeRect(34, 34, width - 68, height - 68);
    border.lineStyle(1, THEME_COLORS.jadeBright, 0.22);
    border.strokeRect(52, 52, width - 104, height - 104);

    return [sky, glaze, leftGlow, moonHalo, moon, mistRear, mistFront, ridges, border];
}

export function createScenePanel(
    scene: Scene,
    config: ThemePanelConfig,
): Phaser.GameObjects.GameObject[] {
    const { x, y, width, height } = config;
    const shadow = scene.add.rectangle(x + 10, y + 12, width, height, THEME_COLORS.shadow, 0.24);
    const panel = scene.add.rectangle(x, y, width, height, THEME_COLORS.panel, 0.95);
    panel.setStrokeStyle(3, THEME_COLORS.gold, 0.7);

    const inner = scene.add.rectangle(x, y, width - 24, height - 24, THEME_COLORS.panelInner, 0.94);
    inner.setStrokeStyle(1, THEME_COLORS.jadeBright, 0.22);

    const banner = scene.add.rectangle(x, y - height / 2 + 40, width - 44, 54, THEME_COLORS.banner, 0.56);
    banner.setStrokeStyle(1, THEME_COLORS.gold, 0.22);

    const corners = scene.add.graphics();
    corners.lineStyle(3, THEME_COLORS.gold, 0.72);
    drawCorner(corners, x - width / 2 + 18, y - height / 2 + 18, 34, 1, 1);
    drawCorner(corners, x + width / 2 - 18, y - height / 2 + 18, 34, -1, 1);
    drawCorner(corners, x - width / 2 + 18, y + height / 2 - 18, 34, 1, -1);
    drawCorner(corners, x + width / 2 - 18, y + height / 2 - 18, 34, -1, -1);

    return [shadow, panel, inner, banner, corners];
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
    const palette = getButtonPalette(config.variant ?? 'primary');
    const align = config.align ?? 'center';
    const shadow = scene.add.rectangle(
        config.x + 6,
        config.y + 8,
        config.width,
        config.height,
        THEME_COLORS.shadow,
        0.22,
    );
    const background = scene.add.rectangle(
        config.x,
        config.y,
        config.width,
        config.height,
        palette.fill,
        palette.alpha,
    );
    background.setStrokeStyle(2, palette.stroke, palette.strokeAlpha);

    const sheen = scene.add.rectangle(
        config.x,
        config.y - config.height / 2 + 12,
        config.width - 20,
        16,
        palette.sheen,
        0.18,
    );

    const textX = align === 'left' ? config.x - config.width / 2 + 28 : config.x;
    const labelY = config.description ? config.y - 14 : config.y;
    const label = scene.add.text(
        textX,
        labelY,
        config.label,
        getSceneTextStyle('buttonLabel', {
            align,
            wordWrap: { width: config.width - 56 },
        }),
    ).setOrigin(align === 'left' ? 0 : 0.5, 0.5);

    const objects: Phaser.GameObjects.GameObject[] = [shadow, background, sheen, label];

    let description: Phaser.GameObjects.Text | undefined;
    if (config.description) {
        description = scene.add.text(
            textX,
            config.y + 18,
            config.description,
            getSceneTextStyle('buttonDescription', {
                align,
                wordWrap: { width: config.width - 56 },
            }),
        ).setOrigin(align === 'left' ? 0 : 0.5, 0.5);
        objects.push(description);
    }

    if (config.variant !== 'disabled') {
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => background.setFillStyle(palette.hoverFill, 1));
        background.on('pointerout', () => background.setFillStyle(palette.fill, palette.alpha));
        background.on('pointerdown', config.onClick);
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
    const background = scene.add.rectangle(
        config.x,
        config.y,
        config.width,
        78,
        THEME_COLORS.banner,
        0.78,
    );
    background.setStrokeStyle(2, THEME_COLORS.gold, 0.3);

    const textX = align === 'left' ? config.x - config.width / 2 + 24 : config.x;
    const text = scene.add.text(
        textX,
        config.y,
        config.text,
        getSceneTextStyle('status', {
            align,
            wordWrap: { width: config.width - 48 },
        }),
    ).setOrigin(align === 'left' ? 0 : 0.5, 0.5);

    return {
        objects: [background, text],
        text,
    };
}

export const sceneTheme = {
    fonts: {
        display: DISPLAY_FONT,
        body: BODY_FONT,
        ui: UI_FONT,
    },
    colors: THEME_COLORS,
} as const;

function getButtonPalette(variant: ThemeButtonVariant) {
    switch (variant) {
        case 'secondary':
            return {
                fill: THEME_COLORS.slate,
                hoverFill: 0x695f52,
                stroke: THEME_COLORS.goldSoft,
                strokeAlpha: 0.56,
                sheen: THEME_COLORS.goldSoft,
                alpha: 0.94,
            };
        case 'option':
            return {
                fill: THEME_COLORS.jade,
                hoverFill: THEME_COLORS.jadeBright,
                stroke: THEME_COLORS.goldSoft,
                strokeAlpha: 0.58,
                sheen: THEME_COLORS.goldSoft,
                alpha: 0.94,
            };
        case 'disabled':
            return {
                fill: 0x403730,
                hoverFill: 0x403730,
                stroke: 0x9f9687,
                strokeAlpha: 0.28,
                sheen: 0xc7b698,
                alpha: 0.86,
            };
        case 'primary':
        default:
            return {
                fill: THEME_COLORS.ember,
                hoverFill: THEME_COLORS.emberBright,
                stroke: THEME_COLORS.goldSoft,
                strokeAlpha: 0.68,
                sheen: THEME_COLORS.goldSoft,
                alpha: 0.96,
            };
    }
}

function drawCorner(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    size: number,
    horizontalDirection: 1 | -1,
    verticalDirection: 1 | -1,
): void {
    graphics.beginPath();
    graphics.moveTo(x, y + size * verticalDirection);
    graphics.lineTo(x, y);
    graphics.lineTo(x + size * horizontalDirection, y);
    graphics.strokePath();
}
