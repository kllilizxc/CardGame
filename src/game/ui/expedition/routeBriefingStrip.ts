import type { Scene } from 'phaser';

import type { ExpeditionRouteBriefingSummary } from '../../scenes/expedition/entryFlowModel';
import {
    createRouteTelemetryChipRow,
    measureRouteTelemetryChipHeight,
    type RouteTelemetryChipLayoutOptions,
} from './routeTelemetryChips';

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
    glanceTitleColor: string;
    glanceTextColor: string;
    chipFillColor: number;
    chipBorderColor: number;
    chipLabelColor: string;
    chipValueColor: string;
}

const ROUTE_BRIEFING_TELEMETRY_CHIP_OPTIONS: RouteTelemetryChipLayoutOptions = {
    chipHeight: 28,
    gapX: 8,
    gapY: 8,
    paddingX: 10,
    labelValueGap: 10,
    labelTextStyle: {
        fontFamily: 'Arial',
        fontSize: '11px',
        fontStyle: 'bold',
    },
    valueTextStyle: {
        fontFamily: 'Arial',
        fontSize: '12px',
        fontStyle: 'bold',
    },
};

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
            glanceTitleColor: '#d8b4fe',
            glanceTextColor: '#c4b5fd',
            chipFillColor: 0x24123f,
            chipBorderColor: 0x7c3aed,
            chipLabelColor: '#d8b4fe',
            chipValueColor: '#f5f3ff',
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
        glanceTitleColor: '#bfdbfe',
        glanceTextColor: '#93c5fd',
        chipFillColor: 0x0f2847,
        chipBorderColor: 0x2563eb,
        chipLabelColor: '#7dd3fc',
        chipValueColor: '#eff6ff',
    };
}

function measureTextHeight(
    scene: Scene,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
): number {
    const measurement = scene.add.text(-10_000, -10_000, text, style).setVisible(false);
    const height = measurement.height;
    measurement.destroy();

    return height;
}

export function measureRouteBriefingStripHeight(
    scene: Scene,
    width: number,
    briefing: ExpeditionRouteBriefingSummary,
): number {
    const descriptionHeight = measureTextHeight(scene, briefing.description, {
        fontFamily: 'Arial',
        fontSize: '15px',
        lineSpacing: 4,
        wordWrap: { width: width - 36 },
    });
    const telemetryHeight = measureRouteTelemetryChipHeight(
        scene,
        width - 36,
        briefing.telemetryChips,
        ROUTE_BRIEFING_TELEMETRY_CHIP_OPTIONS,
    );
    const glanceTitleHeight = measureTextHeight(scene, briefing.glanceTitle, {
        fontFamily: 'Arial',
        fontSize: '13px',
        fontStyle: 'bold',
    });
    const glanceTextHeight = measureTextHeight(
        scene,
        briefing.glanceLines.map((line) => `• ${line}`).join('\n'),
        {
            fontFamily: 'Arial',
            fontSize: '13px',
            lineSpacing: 3,
            wordWrap: { width: width - 36 },
        },
    );

    return 96 + descriptionHeight + telemetryHeight + glanceTitleHeight + glanceTextHeight;
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
    const telemetry = createRouteTelemetryChipRow(
        scene,
        left + 18,
        description.y + description.height + 12,
        width - 36,
        briefing.telemetryChips,
        {
            fillColor: theme.chipFillColor,
            borderColor: theme.chipBorderColor,
            labelColor: theme.chipLabelColor,
            valueColor: theme.chipValueColor,
        },
        ROUTE_BRIEFING_TELEMETRY_CHIP_OPTIONS,
    );
    const glanceTitle = scene.add.text(left + 18, description.y + description.height + 20 + telemetry.height, briefing.glanceTitle, {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: theme.glanceTitleColor,
        fontStyle: 'bold',
    });
    const glanceText = scene.add.text(
        left + 18,
        glanceTitle.y + glanceTitle.height + 6,
        briefing.glanceLines.map((line) => `• ${line}`).join('\n'),
        {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: theme.glanceTextColor,
            lineSpacing: 3,
            wordWrap: { width: width - 36 },
        },
    );
    const height = glanceText.y + glanceText.height - top + 16;
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
            ...telemetry.elements,
            glanceTitle,
            glanceText,
        ],
        height,
    };
}
