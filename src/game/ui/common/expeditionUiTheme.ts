import { sceneTheme } from '../../scenes/shared/sceneTheme';

type ExpeditionTextRole =
    | 'sceneTitle'
    | 'title'
    | 'section'
    | 'body'
    | 'support'
    | 'label'
    | 'button'
    | 'micro'
    | 'mono';

export const expeditionUiTheme = {
    fonts: {
        display: sceneTheme.fonts.display,
        body: sceneTheme.fonts.body,
        ui: sceneTheme.fonts.ui,
        mono: '"Noto Sans Mono CJK SC", "SFMono-Regular", "Menlo", monospace',
    },
    colors: {
        overlay: 0x05070a,
        shadow: sceneTheme.colors.shadow,
        ink: sceneTheme.colors.ink,
        panel: sceneTheme.colors.panel,
        panelInner: sceneTheme.colors.panelInner,
        banner: sceneTheme.colors.banner,
        jade: sceneTheme.colors.jade,
        jadeBright: sceneTheme.colors.jadeBright,
        gold: sceneTheme.colors.gold,
        goldSoft: sceneTheme.colors.goldSoft,
        parchment: sceneTheme.colors.parchment,
        parchmentSoft: sceneTheme.colors.parchmentSoft,
        ember: sceneTheme.colors.ember,
        emberBright: sceneTheme.colors.emberBright,
        slate: sceneTheme.colors.slate,
        text: '#f3ead3',
        textSoft: '#d9c6a2',
        textMuted: '#bca785',
        textDim: '#9f8c6c',
        textSuccess: '#e6f3ea',
        textWarning: '#f6e2b1',
        textDanger: '#f3d0c3',
    },
} as const;

export function getExpeditionTextStyle(
    role: ExpeditionTextRole,
    overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.Types.GameObjects.Text.TextStyle {
    const baseStyles: Record<ExpeditionTextRole, Phaser.Types.GameObjects.Text.TextStyle> = {
        sceneTitle: {
            fontFamily: expeditionUiTheme.fonts.display,
            fontSize: '42px',
            color: expeditionUiTheme.colors.text,
            stroke: '#140f0a',
            strokeThickness: 5,
        },
        title: {
            fontFamily: expeditionUiTheme.fonts.display,
            fontSize: '32px',
            color: expeditionUiTheme.colors.goldSoft,
        },
        section: {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: expeditionUiTheme.colors.text,
            fontStyle: 'bold',
        },
        body: {
            fontFamily: expeditionUiTheme.fonts.body,
            fontSize: '18px',
            color: expeditionUiTheme.colors.text,
            lineSpacing: 6,
        },
        support: {
            fontFamily: expeditionUiTheme.fonts.body,
            fontSize: '18px',
            color: expeditionUiTheme.colors.textSoft,
            lineSpacing: 6,
        },
        label: {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '16px',
            color: expeditionUiTheme.colors.textMuted,
            fontStyle: 'bold',
        },
        button: {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '20px',
            color: '#f8f2e4',
            fontStyle: 'bold',
        },
        micro: {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '14px',
            color: expeditionUiTheme.colors.textMuted,
        },
        mono: {
            fontFamily: expeditionUiTheme.fonts.mono,
            fontSize: '18px',
            color: expeditionUiTheme.colors.text,
            lineSpacing: 6,
        },
    };

    return {
        ...baseStyles[role],
        ...overrides,
    };
}
