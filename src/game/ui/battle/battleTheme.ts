import type { Scene } from 'phaser';

import { getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';

export const battleTheme = {
    colors: {
        ...sceneTheme.colors,
        veil: 0x05070a,
        danger: 0x9f513e,
        dangerSoft: 0xc8866a,
        positive: 0x72a68a,
        positiveSoft: 0x9ec8b1,
        neutral: 0x6d6356,
        textPrimary: '#f3ead3',
        textBody: '#ead7b3',
        textSupport: '#cdbb97',
        textMuted: '#a59679',
        textPositive: '#9fd8bb',
        textDanger: '#d9a18f',
    },
} as const;

export type BattleCardKind = 'unit' | 'artifact' | 'talisman' | 'field' | 'pill';

export interface BattleCardPalette {
    shell: number;
    inner: number;
    banner: number;
    border: number;
    accent: number;
    accentSoft: number;
    iconFill: number;
    chipFill: number;
    chipStroke: number;
    bodyText: string;
    supportText: string;
}

export function blendBattleColor(baseColor: number, overlayColor: number, overlayWeight: number): number {
    const weight = Phaser.Math.Clamp(overlayWeight, 0, 1);
    const baseRed = (baseColor >> 16) & 0xff;
    const baseGreen = (baseColor >> 8) & 0xff;
    const baseBlue = baseColor & 0xff;
    const overlayRed = (overlayColor >> 16) & 0xff;
    const overlayGreen = (overlayColor >> 8) & 0xff;
    const overlayBlue = overlayColor & 0xff;

    const red = Math.round(baseRed + (overlayRed - baseRed) * weight);
    const green = Math.round(baseGreen + (overlayGreen - baseGreen) * weight);
    const blue = Math.round(baseBlue + (overlayBlue - baseBlue) * weight);

    return (red << 16) | (green << 8) | blue;
}

export function battleColorToHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}

export function getBattleCardPalette(kind: BattleCardKind): BattleCardPalette {
    const ink = sceneTheme.colors.ink;
    const panel = sceneTheme.colors.panel;
    const banner = sceneTheme.colors.banner;

    switch (kind) {
        case 'artifact':
            return {
                shell: blendBattleColor(panel, sceneTheme.colors.gold, 0.2),
                inner: blendBattleColor(ink, sceneTheme.colors.gold, 0.1),
                banner: blendBattleColor(banner, sceneTheme.colors.gold, 0.28),
                border: sceneTheme.colors.gold,
                accent: sceneTheme.colors.goldSoft,
                accentSoft: blendBattleColor(sceneTheme.colors.goldSoft, sceneTheme.colors.parchment, 0.32),
                iconFill: blendBattleColor(ink, sceneTheme.colors.gold, 0.16),
                chipFill: blendBattleColor(panel, sceneTheme.colors.gold, 0.22),
                chipStroke: sceneTheme.colors.goldSoft,
                bodyText: battleTheme.colors.textBody,
                supportText: battleTheme.colors.textSupport,
            };
        case 'talisman':
            return {
                shell: blendBattleColor(panel, sceneTheme.colors.jade, 0.08),
                inner: blendBattleColor(ink, sceneTheme.colors.banner, 0.34),
                banner: blendBattleColor(banner, battleTheme.colors.danger, 0.2),
                border: sceneTheme.colors.gold,
                accent: battleTheme.colors.dangerSoft,
                accentSoft: blendBattleColor(battleTheme.colors.dangerSoft, sceneTheme.colors.goldSoft, 0.36),
                iconFill: blendBattleColor(ink, battleTheme.colors.danger, 0.18),
                chipFill: blendBattleColor(panel, battleTheme.colors.danger, 0.22),
                chipStroke: battleTheme.colors.dangerSoft,
                bodyText: battleTheme.colors.textBody,
                supportText: battleTheme.colors.textSupport,
            };
        case 'field':
            return {
                shell: blendBattleColor(ink, sceneTheme.colors.night, 0.36),
                inner: blendBattleColor(panel, sceneTheme.colors.jade, 0.1),
                banner: blendBattleColor(banner, sceneTheme.colors.gold, 0.22),
                border: sceneTheme.colors.gold,
                accent: sceneTheme.colors.goldSoft,
                accentSoft: sceneTheme.colors.parchmentSoft,
                iconFill: blendBattleColor(ink, sceneTheme.colors.gold, 0.18),
                chipFill: blendBattleColor(panel, sceneTheme.colors.gold, 0.18),
                chipStroke: sceneTheme.colors.goldSoft,
                bodyText: battleTheme.colors.textBody,
                supportText: battleTheme.colors.textSupport,
            };
        case 'pill':
            return {
                shell: blendBattleColor(panel, sceneTheme.colors.jade, 0.16),
                inner: blendBattleColor(ink, sceneTheme.colors.jade, 0.14),
                banner: blendBattleColor(banner, sceneTheme.colors.jade, 0.24),
                border: sceneTheme.colors.gold,
                accent: battleTheme.colors.positive,
                accentSoft: battleTheme.colors.positiveSoft,
                iconFill: blendBattleColor(ink, sceneTheme.colors.jade, 0.22),
                chipFill: blendBattleColor(panel, sceneTheme.colors.jade, 0.24),
                chipStroke: battleTheme.colors.positiveSoft,
                bodyText: battleTheme.colors.textBody,
                supportText: battleTheme.colors.textSupport,
            };
        case 'unit':
        default:
            return {
                shell: blendBattleColor(panel, sceneTheme.colors.slate, 0.22),
                inner: blendBattleColor(ink, sceneTheme.colors.jade, 0.08),
                banner: blendBattleColor(banner, sceneTheme.colors.jade, 0.18),
                border: sceneTheme.colors.gold,
                accent: sceneTheme.colors.jadeBright,
                accentSoft: blendBattleColor(sceneTheme.colors.jadeBright, sceneTheme.colors.parchment, 0.3),
                iconFill: blendBattleColor(ink, sceneTheme.colors.jade, 0.16),
                chipFill: blendBattleColor(panel, sceneTheme.colors.jade, 0.2),
                chipStroke: sceneTheme.colors.jadeBright,
                bodyText: battleTheme.colors.textBody,
                supportText: battleTheme.colors.textSupport,
            };
    }
}

export function getBattleCardTextStyle(
    role: 'name' | 'meta' | 'body' | 'support' | 'accent' | 'stat' | 'tiny',
    overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
    const styles: Record<typeof role, Phaser.Types.GameObjects.Text.TextStyle> = {
        name: {
            fontFamily: sceneTheme.fonts.display,
            fontSize: '22px',
            color: battleTheme.colors.textPrimary,
            stroke: '#140f0a',
            strokeThickness: 2,
            align: 'center',
        },
        meta: {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: battleTheme.colors.textSupport,
            align: 'center',
        },
        body: {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: battleTheme.colors.textBody,
            lineSpacing: 6,
            align: 'center',
        },
        support: {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: battleTheme.colors.textSupport,
            lineSpacing: 6,
            align: 'center',
        },
        accent: {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: battleTheme.colors.textPrimary,
            fontStyle: 'bold',
            align: 'center',
        },
        stat: {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: battleTheme.colors.textPrimary,
            fontStyle: 'bold',
            align: 'center',
        },
        tiny: {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: battleTheme.colors.textMuted,
            align: 'center',
        },
    };

    return {
        ...styles[role],
        ...overrides,
    };
}

export function createBattleOverlay(scene: Scene, alpha = 0.8): Phaser.GameObjects.Rectangle {
    const { width, height } = scene.scale;

    return scene.add.rectangle(width / 2, height / 2, width, height, battleTheme.colors.veil, alpha);
}

export function createBattleZoneFrame(
    scene: Scene,
    config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        accent: number;
    },
): {
    objects: Phaser.GameObjects.GameObject[];
    label: Phaser.GameObjects.Text;
} {
    const fill = scene.add.rectangle(
        config.x,
        config.y,
        config.width,
        config.height,
        blendBattleColor(sceneTheme.colors.panel, config.accent, 0.16),
        0.18,
    );
    fill.setStrokeStyle(2, config.accent, 0.34);

    const inner = scene.add.rectangle(
        config.x,
        config.y,
        config.width - 24,
        config.height - 24,
        blendBattleColor(sceneTheme.colors.ink, config.accent, 0.08),
        0.08,
    );
    inner.setStrokeStyle(1, sceneTheme.colors.parchmentSoft, 0.12);

    const labelBackground = scene.add.rectangle(
        config.x,
        config.y - config.height / 2 - 24,
        224,
        42,
        blendBattleColor(sceneTheme.colors.banner, config.accent, 0.22),
        0.92,
    );
    labelBackground.setStrokeStyle(1, config.accent, 0.3);

    const label = scene.add.text(
        config.x,
        config.y - config.height / 2 - 24,
        config.label,
        getSceneTextStyle('panelEyebrow', {
            fontSize: '28px',
            color: battleColorToHex(config.accent),
        }),
    ).setOrigin(0.5);

    return {
        objects: [fill, inner, labelBackground, label],
        label,
    };
}

export function createBattleCounterButton(
    scene: Scene,
    config: {
        x: number;
        y: number;
        width: number;
        height: number;
        title: string;
        count: string;
        accent: number;
        onClick?: () => void;
    },
): {
    objects: Phaser.GameObjects.GameObject[];
    background: Phaser.GameObjects.Rectangle;
    title: Phaser.GameObjects.Text;
    count: Phaser.GameObjects.Text;
} {
    const shadow = scene.add.rectangle(
        config.x + 6,
        config.y + 8,
        config.width,
        config.height,
        sceneTheme.colors.shadow,
        0.22,
    );
    const background = scene.add.rectangle(
        config.x,
        config.y,
        config.width,
        config.height,
        blendBattleColor(sceneTheme.colors.panelInner, config.accent, 0.24),
        0.95,
    );
    background.setStrokeStyle(2, config.accent, 0.56);

    const banner = scene.add.rectangle(
        config.x,
        config.y - config.height / 2 + 16,
        config.width - 18,
        26,
        blendBattleColor(sceneTheme.colors.banner, config.accent, 0.18),
        0.88,
    );
    banner.setStrokeStyle(1, config.accent, 0.26);

    const title = scene.add.text(
        config.x,
        config.y - 18,
        config.title,
        getSceneTextStyle('buttonLabel', {
            fontSize: '28px',
            color: battleTheme.colors.textPrimary,
        }),
    ).setOrigin(0.5);

    const count = scene.add.text(
        config.x,
        config.y + 24,
        config.count,
        getSceneTextStyle('panelTitle', {
            fontSize: '30px',
            color: battleColorToHex(config.accent),
        }),
    ).setOrigin(0.5);

    if (config.onClick) {
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => {
            background.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, config.accent, 0.34), 1);
        });
        background.on('pointerout', () => {
            background.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, config.accent, 0.24), 0.95);
        });
        background.on('pointerdown', config.onClick);
    }

    return {
        objects: [shadow, background, banner, title, count],
        background,
        title,
        count,
    };
}
