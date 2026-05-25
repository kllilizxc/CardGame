import type { Scene } from 'phaser';

import type { ExpeditionRouteBriefingSummary } from '../../scenes/expedition/entryFlowModel';

export interface RouteBriefingStripRenderResult {
    elements: Phaser.GameObjects.GameObject[];
    height: number;
}

interface RouteBriefingStripTheme {
    fillColor: number;
    borderColor: number;
    accentColor: number;
    badgeTextColor: string;
    badgeBackgroundColor: string;
    stageColor: string;
    descriptionColor: string;
    highlightLabelColor: string;
}

function getRouteBriefingStripTheme(briefing: ExpeditionRouteBriefingSummary): RouteBriefingStripTheme {
    if (briefing.mode === 'deckManager') {
        return {
            fillColor: 0x130f25,
            borderColor: 0xa855f7,
            accentColor: 0xc084fc,
            badgeTextColor: '#ede9fe',
            badgeBackgroundColor: '#4c1d95',
            stageColor: '#ddd6fe',
            descriptionColor: '#ede9fe',
            highlightLabelColor: '#c4b5fd',
        };
    }

    return {
        fillColor: 0x0f1b33,
        borderColor: 0x3b82f6,
        accentColor: 0x38bdf8,
        badgeTextColor: '#dbeafe',
        badgeBackgroundColor: '#1d4ed8',
        stageColor: '#bfdbfe',
        descriptionColor: '#eff6ff',
        highlightLabelColor: '#93c5fd',
    };
}

export function createRouteBriefingStrip(
    scene: Scene,
    left: number,
    top: number,
    width: number,
    briefing: ExpeditionRouteBriefingSummary,
): RouteBriefingStripRenderResult {
    const theme = getRouteBriefingStripTheme(briefing);
    const badge = scene.add.text(left + 18, top + 14, briefing.panelBadgeLabel, {
        fontFamily: 'Arial',
        fontSize: '15px',
        color: theme.badgeTextColor,
        fontStyle: 'bold',
        backgroundColor: theme.badgeBackgroundColor,
        padding: { left: 12, right: 12, top: 6, bottom: 6 },
    });
    const stageText = scene.add.text(left + width - 18, top + 18, briefing.panelStageLabel, {
        fontFamily: 'Arial',
        fontSize: '15px',
        color: theme.stageColor,
        fontStyle: 'bold',
    }).setOrigin(1, 0);
    const description = scene.add.text(left + 18, badge.y + 40, briefing.description, {
        fontFamily: 'Arial',
        fontSize: '15px',
        color: theme.descriptionColor,
        lineSpacing: 4,
        wordWrap: { width: width - 36 },
    });
    const highlightText = scene.add.text(
        left + 18,
        description.y + description.height + 10,
        briefing.highlights.map((highlight) => `${highlight.label}：${highlight.value}`).join(' · '),
        {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: theme.highlightLabelColor,
            lineSpacing: 3,
            wordWrap: { width: width - 36 },
        },
    );
    const height = highlightText.y + highlightText.height - top + 16;
    const background = scene.add.rectangle(left + width / 2, top + height / 2, width, height, theme.fillColor, 0.96);
    background.setStrokeStyle(2, theme.borderColor, 0.92);
    const accent = scene.add.rectangle(left + width / 2, top + 5, width - 16, 5, theme.accentColor, 1).setOrigin(0.5, 0);

    return {
        elements: [
            background,
            accent,
            badge,
            stageText,
            description,
            highlightText,
        ],
        height,
    };
}
