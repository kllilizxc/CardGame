import type { Scene } from 'phaser';

import type { ExpeditionRouteBriefingTelemetryChip } from '../../scenes/expedition/entryFlowModel';

export interface RouteTelemetryChipTheme {
    fillColor: number;
    borderColor: number;
    labelColor: string;
    valueColor: string;
}

export interface RouteTelemetryChipLayoutOptions {
    chipHeight?: number;
    gapX?: number;
    gapY?: number;
    paddingX?: number;
    labelValueGap?: number;
    labelTextStyle?: Phaser.Types.GameObjects.Text.TextStyle;
    valueTextStyle?: Phaser.Types.GameObjects.Text.TextStyle;
}

export interface RouteTelemetryChipView {
    background: Phaser.GameObjects.Rectangle;
    labelText: Phaser.GameObjects.Text;
    valueText: Phaser.GameObjects.Text;
}

export interface RouteTelemetryChipRenderResult {
    chips: RouteTelemetryChipView[];
    elements: Phaser.GameObjects.GameObject[];
    height: number;
}

interface RouteTelemetryChipMetrics {
    chip: ExpeditionRouteBriefingTelemetryChip;
    width: number;
    x: number;
    y: number;
}

const DEFAULT_ROUTE_TELEMETRY_CHIP_OPTIONS: Required<RouteTelemetryChipLayoutOptions> = {
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

function mergeRouteTelemetryChipOptions(options?: RouteTelemetryChipLayoutOptions): Required<RouteTelemetryChipLayoutOptions> {
    return {
        ...DEFAULT_ROUTE_TELEMETRY_CHIP_OPTIONS,
        ...options,
        labelTextStyle: {
            ...DEFAULT_ROUTE_TELEMETRY_CHIP_OPTIONS.labelTextStyle,
            ...options?.labelTextStyle,
        },
        valueTextStyle: {
            ...DEFAULT_ROUTE_TELEMETRY_CHIP_OPTIONS.valueTextStyle,
            ...options?.valueTextStyle,
        },
    };
}

function measureTextWidth(
    scene: Scene,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
): number {
    const measurement = scene.add.text(-10_000, -10_000, text, style).setVisible(false);
    const width = measurement.width;
    measurement.destroy();

    return width;
}

function getRouteTelemetryChipMetrics(
    scene: Scene,
    chips: readonly ExpeditionRouteBriefingTelemetryChip[],
    width: number,
    options?: RouteTelemetryChipLayoutOptions,
): RouteTelemetryChipMetrics[] {
    const resolvedOptions = mergeRouteTelemetryChipOptions(options);
    const availableWidth = Math.max(0, width);
    const metrics: RouteTelemetryChipMetrics[] = [];
    let currentX = 0;
    let currentY = 0;

    for (const chip of chips) {
        const labelWidth = measureTextWidth(scene, chip.label, resolvedOptions.labelTextStyle);
        const valueWidth = measureTextWidth(scene, chip.value, resolvedOptions.valueTextStyle);
        const chipWidth = Math.min(
            availableWidth,
            Math.ceil(labelWidth + valueWidth + resolvedOptions.labelValueGap + resolvedOptions.paddingX * 2),
        );

        if (currentX > 0 && currentX + chipWidth > availableWidth) {
            currentX = 0;
            currentY += resolvedOptions.chipHeight + resolvedOptions.gapY;
        }

        metrics.push({
            chip,
            width: chipWidth,
            x: currentX,
            y: currentY,
        });

        currentX += chipWidth + resolvedOptions.gapX;
    }

    return metrics;
}

export function measureRouteTelemetryChipHeight(
    scene: Scene,
    width: number,
    chips: readonly ExpeditionRouteBriefingTelemetryChip[],
    options?: RouteTelemetryChipLayoutOptions,
): number {
    if (chips.length === 0) {
        return 0;
    }

    const resolvedOptions = mergeRouteTelemetryChipOptions(options);
    const metrics = getRouteTelemetryChipMetrics(scene, chips, width, resolvedOptions);
    const lastChip = metrics[metrics.length - 1];

    return lastChip.y + resolvedOptions.chipHeight;
}

export function createRouteTelemetryChipRow(
    scene: Scene,
    left: number,
    top: number,
    width: number,
    chips: readonly ExpeditionRouteBriefingTelemetryChip[],
    theme: RouteTelemetryChipTheme,
    options?: RouteTelemetryChipLayoutOptions,
): RouteTelemetryChipRenderResult {
    const resolvedOptions = mergeRouteTelemetryChipOptions(options);
    const metrics = getRouteTelemetryChipMetrics(scene, chips, width, resolvedOptions);
    const chipViews: RouteTelemetryChipView[] = [];

    for (const metric of metrics) {
        const background = scene.add.rectangle(
            left + metric.x + metric.width / 2,
            top + metric.y + resolvedOptions.chipHeight / 2,
            metric.width,
            resolvedOptions.chipHeight,
            theme.fillColor,
            0.96,
        );
        background.setStrokeStyle(1, theme.borderColor, 0.92);
        const labelText = scene.add.text(
            left + metric.x + resolvedOptions.paddingX,
            top + metric.y + resolvedOptions.chipHeight / 2,
            metric.chip.label,
            {
                ...resolvedOptions.labelTextStyle,
                color: theme.labelColor,
            },
        ).setOrigin(0, 0.5);
        const valueText = scene.add.text(
            left + metric.x + metric.width - resolvedOptions.paddingX,
            top + metric.y + resolvedOptions.chipHeight / 2,
            metric.chip.value,
            {
                ...resolvedOptions.valueTextStyle,
                color: theme.valueColor,
            },
        ).setOrigin(1, 0.5);

        chipViews.push({
            background,
            labelText,
            valueText,
        });
    }

    return {
        chips: chipViews,
        elements: chipViews.flatMap((chipView) => [
            chipView.background,
            chipView.labelText,
            chipView.valueText,
        ]),
        height: measureRouteTelemetryChipHeight(scene, width, chips, resolvedOptions),
    };
}
