import { GameObjects, Scene } from 'phaser';

import {
    createPreparationDeckCardPreview,
    createPreparationSummary,
    createPreparationSelectedLoadoutSummary,
    formatPreparationValidationLines,
    type ExpeditionRouteBriefingSummary,
    type PreparationDeckContext,
    type PreparationFocusChip,
    type PreparationDeckHandoffSummary,
    type PreparationSelectedLoadoutSummary,
} from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import {
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedSavedDeck,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
} from '../../state/PersistentStashDecks';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import type {
    ExpeditionCardStack,
    PersistentStash,
    SavedDeck,
} from '../../types/expedition';
import {
    calculateActionRailHeight,
    calculateDeckCardHeight,
    calculateSelectedLoadoutSummaryHeight,
} from './PreparationPanelLayout';
import { createRouteBriefingStrip } from './routeBriefingStrip';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    routeBriefing?: ExpeditionRouteBriefingSummary;
    onConfirm: () => void;
    onDeckSelect: (deckId: string) => void;
    onOpenDeckManager?: () => void;
    deckHandoffSummary?: PreparationDeckHandoffSummary | null;
}

export interface PreparationPanelDeckSwitchFeedback {
    before: PreparationDeckContext;
    after: PreparationDeckContext;
}

interface DeckDisplayState {
    valid: boolean;
    uniqueCardCount: number;
    selectionLabel: string;
    statusLabel: string;
    compositionLines: string[];
    comparisonLabel: string;
    comparisonLines: string[];
    focusChip: PreparationFocusChip;
    focusSummaryLine: string;
    footerText: string;
    fillColor: number;
    hoverFillColor: number;
    borderColor: number;
    accentColor: number;
    selectionBadgeColor: string;
    selectionBadgeBackgroundColor: string;
    statusBadgeColor: string;
    statusBadgeBackgroundColor: string;
    countColor: string;
    previewLabelColor: string;
    previewTextColor: string;
    previewFillColor: number;
    previewBorderColor: number;
    chipFillColor: number;
    chipBorderColor: number;
    chipTextColor: string;
    footerFillColor: number;
    footerTextColor: string;
    shadowColor: number;
    shadowAlpha: number;
}

interface DeckHandoffBannerColors {
    fillColor: number;
    borderColor: number;
    badgeColor: string;
    badgeBackgroundColor: string;
    detailColor: string;
}

interface SelectedLoadoutColors {
    fillColor: number;
    borderColor: number;
    accentColor: number;
    badgeColor: string;
    badgeBackgroundColor: string;
    headlineColor: string;
    detailColor: string;
    mutedColor: string;
}

interface ActionButtonColors {
    fill: number;
    hover: number;
    stroke: number;
    text: string;
}

interface ActionHierarchyColors {
    barFillColor: number;
    barBorderColor: number;
    barAccentColor: number;
    railLabel: string;
    titleColor: string;
    summaryColor: string;
    supportColor: string;
    headline: string;
    detail: string;
    nextStepLabel: string;
    stateBadgeLabel: string;
    stateBadgeColor: string;
    stateBadgeBackgroundColor: string;
    primaryAction: 'confirm' | 'manage';
    confirmButtonLabel: string;
    manageButtonLabel: string;
    confirmButtonColors: ActionButtonColors;
    manageButtonColors: ActionButtonColors;
    confirmGlowColor: number;
    confirmGlowAlpha: number;
    actionGlowColor: number;
    actionGlowAlpha: number;
}

interface ManifestPanelColors {
    fillColor: number;
    borderColor: number;
    titleColor: string;
    bodyColor: string;
    badgeColor?: string;
    badgeBackgroundColor?: string;
}

interface DeckSwitchRenderOptions {
    deckSwitchFeedback?: PreparationPanelDeckSwitchFeedback;
    initialScrollX?: number;
}

interface DeckCardAnimationRefs {
    deckId: string;
    container: GameObjects.Container;
    baseY: number;
    spotlight?: GameObjects.Rectangle;
    accent: GameObjects.Rectangle;
    background: GameObjects.Rectangle;
    footerBackground: GameObjects.Rectangle;
    isSelected: boolean;
    valid: boolean;
}

interface DeckCardRowBuild {
    elements: Phaser.GameObjects.GameObject[];
    selectedCard?: DeckCardAnimationRefs;
    targetScrollX: number;
}

interface PreparationPanelAnimationRefs {
    selectedCard?: DeckCardAnimationRefs;
    validationContainer?: GameObjects.Container;
    selectedLoadoutContainer?: GameObjects.Container;
    carriedReadinessContainer?: GameObjects.Container;
    actionContainer?: GameObjects.Container;
    confirmButton?: GameObjects.Container;
    manageDeckButton?: GameObjects.Container;
    validationGlow?: GameObjects.Rectangle;
    selectedLoadoutGlow?: GameObjects.Rectangle;
    actionGlow?: GameObjects.Rectangle;
    confirmGlow?: GameObjects.Rectangle;
    targetScrollX: number;
}

interface ValidationManifestMetrics {
    height: number;
    statusWidth: number;
    checklistWidth: number;
    guidanceWidth: number;
    sectionHeight: number;
}

interface LoadoutManifestMetrics {
    previewGap: number;
    utilityColumnWidth: number;
    deckPreviewWidth: number;
    deckPreviewColumnGap: number;
    singleDeckPreviewColumnWidth: number;
    previewPanelHeight: number;
    deckPanelHeight: number;
    itemPanelHeight: number;
    checklistPanelHeight: number;
    guidancePanelHeight: number;
    utilityStackHeight: number;
}

const DECK_CARD_WIDTH = 252;
const DECK_CARD_GAP = 14;
const PANEL_MIN_HEIGHT = 820;
const PANEL_MAX_HEIGHT = 1020;
const PANEL_MAX_HEIGHT_RATIO = 0.95;
const ACTION_BUTTON_COLUMN_WIDTH = 252;
const ACTION_BUTTON_PRIMARY_HEIGHT = 62;
const ACTION_BUTTON_SECONDARY_HEIGHT = 44;
const ACTION_BUTTON_GAP = 10;
const LOADOUT_MANIFEST_PREVIEW_GAP = 16;
const LOADOUT_MANIFEST_UTILITY_COLUMN_WIDTH = 208;
const LOADOUT_MANIFEST_SECTION_GAP = 8;
const LOADOUT_MANIFEST_DECK_COLUMN_GAP = 12;

function validateDeckForDisplay(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
): { valid: boolean; sizeIssue: DeckValidityReason | null; availabilityIssues: DeckValidityReason[] } {
    const sizeIssue = validateDeckSize(deck.cards);
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards);

    return {
        valid: !sizeIssue && availabilityIssues.length === 0,
        sizeIssue,
        availabilityIssues,
    };
}

function formatPreviewList(lines: string[], maxLines: number): string {
    if (lines.length === 0) {
        return '无';
    }

    if (lines.length <= maxLines) {
        return lines.join('\n');
    }

    return [...lines.slice(0, maxLines), `……另 ${lines.length - maxLines} 项`].join('\n');
}

function formatPreviewBulletList(lines: string[], maxLines: number): string {
    if (lines.length === 0) {
        return '• 无';
    }

    if (lines.length === 1 && lines[0] === '无') {
        return '• 无';
    }

    return formatPreviewList(lines.map((line) => `• ${line}`), maxLines);
}

function formatBulletLines(lines: string[], maxLines = Number.POSITIVE_INFINITY): string {
    if (lines.length === 0) {
        return '• 无';
    }

    return lines
        .slice(0, maxLines)
        .map((line) => line.startsWith('• ') ? line : `• ${line}`)
        .join('\n');
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

function getDeckCardHeight(scene: Scene, decks: readonly SavedDeck[]): number {
    const maxDeckNameHeight = decks.reduce((maxHeight, deck) => Math.max(
        maxHeight,
        measureTextHeight(scene, deck.name, {
            fontFamily: 'Arial',
            fontSize: '18px',
            fontStyle: 'bold',
            wordWrap: { width: DECK_CARD_WIDTH - 32 },
        }),
    ), 0);

    return calculateDeckCardHeight(maxDeckNameHeight);
}

function getSelectedLoadoutSummaryHeight(
    scene: Scene,
    summary: PreparationSelectedLoadoutSummary,
    width: number,
    manifestStackHeight: number,
): number {
    const nameHeight = measureTextHeight(scene, summary.selectedDeckName, {
        fontFamily: 'Arial',
        fontSize: '24px',
        fontStyle: 'bold',
        wordWrap: { width: width - 36 },
    });
    const footerHeight = measureTextHeight(scene, summary.footer, {
        fontFamily: 'Arial',
        fontSize: '12px',
        wordWrap: { width: width - 36 },
    });

    return calculateSelectedLoadoutSummaryHeight(nameHeight, footerHeight, manifestStackHeight);
}

function getRouteBriefingHeight(
    scene: Scene,
    briefing: ExpeditionRouteBriefingSummary,
    width: number,
): number {
    const descriptionHeight = measureTextHeight(scene, briefing.description, {
        fontFamily: 'Arial',
        fontSize: '15px',
        lineSpacing: 4,
        wordWrap: { width: width - 36 },
    });
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

    return 88 + descriptionHeight + glanceTitleHeight + glanceTextHeight;
}

function createManifestPanel(
    scene: Scene,
    left: number,
    top: number,
    width: number,
    height: number,
    title: string,
    body: string,
    colors: ManifestPanelColors,
    options: {
        badgeText?: string;
        monospacedBody?: boolean;
    } = {},
): Phaser.GameObjects.GameObject[] {
    const background = scene.add.rectangle(
        left + width / 2,
        top + height / 2,
        width,
        height,
        colors.fillColor,
        0.92,
    );
    background.setStrokeStyle(1, colors.borderColor, 0.5);
    const titleText = scene.add.text(left + 12, top + 10, title, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: colors.titleColor,
        fontStyle: 'bold',
    });
    const badge = options.badgeText
        ? scene.add.text(left + width - 12, top + 10, options.badgeText, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: colors.badgeColor ?? colors.bodyColor,
            fontStyle: 'bold',
            backgroundColor: colors.badgeBackgroundColor,
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
        }).setOrigin(1, 0)
        : null;
    const bodyText = scene.add.text(left + 12, titleText.y + titleText.height + 4, body, {
        fontFamily: options.monospacedBody ? 'Courier New' : 'Arial',
        fontSize: '12px',
        color: colors.bodyColor,
        lineSpacing: 3,
        wordWrap: { width: width - 24 },
    });

    return [background, titleText, bodyText, badge].filter(Boolean) as Phaser.GameObjects.GameObject[];
}

function getValidationManifestMetrics(
    scene: Scene,
    contentWidth: number,
    statusBody: string,
    checklistBody: string,
    guidanceBody: string,
): ValidationManifestMetrics {
    const innerWidth = contentWidth - 36;
    const statusWidth = Math.floor(innerWidth * 0.26);
    const checklistWidth = Math.floor(innerWidth * 0.33);
    const guidanceWidth = innerWidth - statusWidth - checklistWidth - 24;
    const sectionWidths = [statusWidth, checklistWidth, guidanceWidth];
    const sectionBodies = [statusBody, checklistBody, guidanceBody];
    const maxBodyHeight = Math.max(...sectionBodies.map((body, index) => measureTextHeight(scene, body, {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: sectionWidths[index] - 24 },
    })));
    const sectionHeight = Math.max(78, 40 + maxBodyHeight);

    return {
        height: Math.max(160, 64 + sectionHeight),
        statusWidth,
        checklistWidth,
        guidanceWidth,
        sectionHeight,
    };
}

function getLoadoutManifestMetrics(
    scene: Scene,
    summary: PreparationSelectedLoadoutSummary,
    carriedLoadoutWidth: number,
    deckPreviewColumns: string[][],
    itemPreviewText: string,
): LoadoutManifestMetrics {
    const previewGap = LOADOUT_MANIFEST_PREVIEW_GAP;
    const utilityColumnWidth = LOADOUT_MANIFEST_UTILITY_COLUMN_WIDTH;
    const deckPreviewColumnGap = LOADOUT_MANIFEST_DECK_COLUMN_GAP;
    const deckPreviewWidth = carriedLoadoutWidth - 36 - previewGap - utilityColumnWidth;
    const singleDeckPreviewColumnWidth = Math.floor((deckPreviewWidth - 24 - deckPreviewColumnGap) / 2);
    const deckSummaryText = `卡组构成：${summary.kindSummaryLine}`;
    const deckSummaryHeight = measureTextHeight(scene, deckSummaryText, {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: deckPreviewWidth - 24 },
    });
    const deckPreviewHeight = Math.max(
        measureTextHeight(scene, deckPreviewColumns[0].join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: singleDeckPreviewColumnWidth },
        }),
        measureTextHeight(scene, deckPreviewColumns[1].join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: singleDeckPreviewColumnWidth },
        }),
    );
    const itemPanelHeight = Math.max(76, 40 + measureTextHeight(scene, `携带道具 ${summary.itemCount} 件\n${itemPreviewText}`, {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: utilityColumnWidth - 24 },
    }));
    const checklistPanelHeight = Math.max(76, 40 + measureTextHeight(scene, formatBulletLines(summary.readinessChecklistLines, 3), {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: utilityColumnWidth - 24 },
    }));
    const guidancePanelHeight = Math.max(76, 40 + measureTextHeight(scene, formatBulletLines(summary.guidanceLines, 3), {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: utilityColumnWidth - 24 },
    }));
    const deckPanelHeight = Math.max(140, 48 + deckSummaryHeight + deckPreviewHeight);
    const utilityStackHeight = itemPanelHeight
        + LOADOUT_MANIFEST_SECTION_GAP
        + checklistPanelHeight
        + LOADOUT_MANIFEST_SECTION_GAP
        + guidancePanelHeight;

    return {
        previewGap,
        utilityColumnWidth,
        deckPreviewWidth,
        deckPreviewColumnGap,
        singleDeckPreviewColumnWidth,
        previewPanelHeight: Math.max(deckPanelHeight, utilityStackHeight),
        deckPanelHeight,
        itemPanelHeight,
        checklistPanelHeight,
        guidancePanelHeight,
        utilityStackHeight,
    };
}

function splitPreviewColumns(
    lines: string[],
    maxVisibleLines: number,
    columnCount: number,
): string[][] {
    const visibleLines = lines.length <= maxVisibleLines
        ? [...lines]
        : [...lines.slice(0, maxVisibleLines - 1), `…另 ${lines.length - maxVisibleLines + 1} 项`];
    const rowsPerColumn = Math.max(1, Math.ceil(visibleLines.length / columnCount));

    return Array.from({ length: columnCount }, (_, index) =>
        visibleLines
            .slice(index * rowsPerColumn, (index + 1) * rowsPerColumn)
            .map((line) => `• ${line}`),
    );
}

function createDeckDisplayState(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
    isSelected: boolean,
    metadata?: CardMetadataMap,
): DeckDisplayState {
    const validation = validateDeckForDisplay(deck, stashCards);
    const preview = createPreparationDeckCardPreview(deck, stashCards, metadata);
    const selectionLabel = isSelected ? '已选定' : '备选卡组';
    const selectionBadgeColor = isSelected ? '#dbeafe' : '#e2e8f0';
    const selectionBadgeBackgroundColor = isSelected ? '#1d4ed8' : '#334155';
    const missingCopies = validation.availabilityIssues.reduce(
        (sum, issue) => sum + (issue.kind === 'insufficient-copies' ? Math.max(0, issue.required - issue.available) : 0),
        0,
    );
    const comparisonLabel = preview.readiness === 'ready'
        ? '出发状态'
        : preview.readiness === 'insufficient-copies'
            ? '缺口重点'
            : '调整重点';
    const comparisonLines = preview.shortagePreviewLines.length > 0
        ? preview.shortagePreviewLines
        : [preview.focusSummaryLine];
    const compositionLines = preview.kindBreakdownLines;

    if (validation.valid && isSelected) {
        return {
            valid: true,
            uniqueCardCount: preview.uniqueCardCount,
            selectionLabel,
            statusLabel: '可出发',
            compositionLines,
            comparisonLabel,
            comparisonLines,
            focusChip: preview.focusChip,
            focusSummaryLine: preview.focusSummaryLine,
            footerText: '库存充足，当前带入可直接确认。',
            fillColor: 0x14264a,
            hoverFillColor: 0x1a3571,
            borderColor: 0x93c5fd,
            accentColor: 0x38bdf8,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#dbeafe',
            statusBadgeBackgroundColor: '#166534',
            countColor: '#bfdbfe',
            previewLabelColor: '#93c5fd',
            previewTextColor: '#eff6ff',
            previewFillColor: 0x0f1d38,
            previewBorderColor: 0x1d4ed8,
            chipFillColor: 0x0f1d38,
            chipBorderColor: 0x3b82f6,
            chipTextColor: '#dbeafe',
            footerFillColor: 0x0f1d38,
            footerTextColor: '#dbeafe',
            shadowColor: 0x1d4ed8,
            shadowAlpha: 0.24,
        };
    }

    if (validation.valid) {
        return {
            valid: true,
            uniqueCardCount: preview.uniqueCardCount,
            selectionLabel,
            statusLabel: '可带入',
            compositionLines,
            comparisonLabel,
            comparisonLines,
            focusChip: preview.focusChip,
            focusSummaryLine: preview.focusSummaryLine,
            footerText: '库存充足，点按即可切换为本次带入。',
            fillColor: 0x12201d,
            hoverFillColor: 0x163123,
            borderColor: 0x365314,
            accentColor: 0x22c55e,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#dcfce7',
            statusBadgeBackgroundColor: '#166534',
            countColor: '#bbf7d0',
            previewLabelColor: '#86efac',
            previewTextColor: '#f0fdf4',
            previewFillColor: 0x0e1c17,
            previewBorderColor: 0x166534,
            chipFillColor: 0x0e1c17,
            chipBorderColor: 0x22c55e,
            chipTextColor: '#dcfce7',
            footerFillColor: 0x0e1c17,
            footerTextColor: '#dcfce7',
            shadowColor: 0x020617,
            shadowAlpha: 0.18,
        };
    }

    if (validation.sizeIssue?.kind === 'too-few-cards') {
        return {
            valid: false,
            uniqueCardCount: preview.uniqueCardCount,
            selectionLabel,
            statusLabel: '张数不足',
            compositionLines,
            comparisonLabel,
            comparisonLines,
            focusChip: preview.focusChip,
            focusSummaryLine: preview.focusSummaryLine,
            footerText: preview.focusSummaryLine,
            fillColor: isSelected ? 0x372215 : 0x2f1d12,
            hoverFillColor: isSelected ? 0x46301e : 0x3b2416,
            borderColor: isSelected ? 0x93c5fd : 0xf59e0b,
            accentColor: 0xf59e0b,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#fef3c7',
            statusBadgeBackgroundColor: '#92400e',
            countColor: '#fde68a',
            previewLabelColor: '#fcd34d',
            previewTextColor: '#fffbeb',
            previewFillColor: 0x291d0e,
            previewBorderColor: 0xb45309,
            chipFillColor: 0x291d0e,
            chipBorderColor: 0xf59e0b,
            chipTextColor: '#fef3c7',
            footerFillColor: 0x291d0e,
            footerTextColor: '#fde68a',
            shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
            shadowAlpha: isSelected ? 0.22 : 0.18,
        };
    }

    if (validation.sizeIssue?.kind === 'too-many-cards') {
        return {
            valid: false,
            uniqueCardCount: preview.uniqueCardCount,
            selectionLabel,
            statusLabel: '超出上限',
            compositionLines,
            comparisonLabel,
            comparisonLines,
            focusChip: preview.focusChip,
            focusSummaryLine: preview.focusSummaryLine,
            footerText: preview.focusSummaryLine,
            fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
            hoverFillColor: isSelected ? 0x4c1d30 : 0x3a1822,
            borderColor: isSelected ? 0x93c5fd : 0xf87171,
            accentColor: 0xef4444,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#fee2e2',
            statusBadgeBackgroundColor: '#b91c1c',
            countColor: '#fecaca',
            previewLabelColor: '#fda4af',
            previewTextColor: '#fff1f2',
            previewFillColor: 0x29131b,
            previewBorderColor: 0x9f1239,
            chipFillColor: 0x29131b,
            chipBorderColor: 0xef4444,
            chipTextColor: '#fee2e2',
            footerFillColor: 0x29131b,
            footerTextColor: '#fecaca',
            shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
            shadowAlpha: isSelected ? 0.22 : 0.18,
        };
    }

    return {
        valid: false,
        uniqueCardCount: preview.uniqueCardCount,
        selectionLabel,
        statusLabel: '库存不足',
        compositionLines,
        comparisonLabel,
        comparisonLines,
        focusChip: preview.focusChip,
        focusSummaryLine: validation.availabilityIssues.length > 0
            ? `${validation.availabilityIssues.length} 种卡共缺 ${missingCopies} 张。`
            : preview.focusSummaryLine,
        footerText: preview.focusSummaryLine,
        fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
        hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
        borderColor: isSelected ? 0x93c5fd : 0xf87171,
        accentColor: 0xef4444,
        selectionBadgeColor,
        selectionBadgeBackgroundColor,
        statusBadgeColor: '#fee2e2',
        statusBadgeBackgroundColor: '#b91c1c',
        countColor: '#fecaca',
        previewLabelColor: '#fda4af',
        previewTextColor: '#fff1f2',
        previewFillColor: 0x29131b,
        previewBorderColor: 0x9f1239,
        chipFillColor: 0x29131b,
        chipBorderColor: 0xef4444,
        chipTextColor: '#fee2e2',
        footerFillColor: 0x29131b,
        footerTextColor: '#fecaca',
        shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
        shadowAlpha: isSelected ? 0.22 : 0.18,
    };
}

function getSelectedLoadoutColors(
    summary: PreparationSelectedLoadoutSummary,
): SelectedLoadoutColors {
    switch (summary.readiness) {
        case 'ready':
            return {
                fillColor: 0x132949,
                borderColor: 0x60a5fa,
                accentColor: 0x38bdf8,
                badgeColor: '#dbeafe',
                badgeBackgroundColor: '#1d4ed8',
                headlineColor: '#eff6ff',
                detailColor: '#bfdbfe',
                mutedColor: '#93c5fd',
            };
        case 'too-few-cards':
            return {
                fillColor: 0x31210f,
                borderColor: 0xf59e0b,
                accentColor: 0xf59e0b,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                headlineColor: '#fffbeb',
                detailColor: '#fde68a',
                mutedColor: '#fcd34d',
            };
        case 'too-many-cards':
        case 'insufficient-copies':
            return {
                fillColor: 0x311725,
                borderColor: 0xef4444,
                accentColor: 0xf97316,
                badgeColor: '#fee2e2',
                badgeBackgroundColor: '#b91c1c',
                headlineColor: '#fff1f2',
                detailColor: '#fecaca',
                mutedColor: '#fda4af',
            };
        case 'none':
            return {
                fillColor: 0x111827,
                borderColor: 0x64748b,
                accentColor: 0x94a3b8,
                badgeColor: '#e2e8f0',
                badgeBackgroundColor: '#334155',
                headlineColor: '#f8fafc',
                detailColor: '#cbd5e1',
                mutedColor: '#94a3b8',
            };
    }
}

function getActionHierarchyColors(
    summary: PreparationSelectedLoadoutSummary,
): ActionHierarchyColors {
    const inventoryDetail = `带入明细：${summary.deckCount} 张卡 · ${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石。`;

    switch (summary.readiness) {
        case 'ready':
            return {
                barFillColor: 0x0f2142,
                barBorderColor: 0x60a5fa,
                barAccentColor: 0x38bdf8,
                railLabel: '出发准备栏',
                titleColor: '#eff6ff',
                summaryColor: '#bfdbfe',
                supportColor: '#93c5fd',
                headline: `当前带入「${summary.selectedDeckName}」已通过出发校验`,
                detail: inventoryDetail,
                nextStepLabel: '下一步：确认带入后立即创建秘境快照并进入秘境。',
                stateBadgeLabel: '可出发',
                stateBadgeColor: '#dbeafe',
                stateBadgeBackgroundColor: '#1d4ed8',
                primaryAction: 'confirm',
                confirmButtonLabel: '确认带入并出发',
                manageButtonLabel: '继续管理卡组',
                confirmButtonColors: {
                    fill: 0x2563eb,
                    hover: 0x3b82f6,
                    stroke: 0xbfdbfe,
                    text: '#f8fafc',
                },
                manageButtonColors: {
                    fill: 0x18263b,
                    hover: 0x25364e,
                    stroke: 0x64748b,
                    text: '#e2e8f0',
                },
                confirmGlowColor: 0x38bdf8,
                confirmGlowAlpha: 0.18,
                actionGlowColor: 0x2563eb,
                actionGlowAlpha: 0.08,
            };
        case 'too-few-cards': {
            const missingCards = Math.max(1, DECK_CARD_MIN - summary.deckCount);

            return {
                barFillColor: 0x23180d,
                barBorderColor: 0xf59e0b,
                barAccentColor: 0xf59e0b,
                railLabel: '出发准备栏',
                titleColor: '#fffbeb',
                summaryColor: '#fde68a',
                supportColor: '#fcd34d',
                headline: `当前带入「${summary.selectedDeckName}」还差 ${missingCards} 张才能出发`,
                detail: inventoryDetail,
                nextStepLabel: `下一步：先去管理卡组补足到 ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张，返回这里后才能确认带入。`,
                stateBadgeLabel: `差 ${missingCards} 张`,
                stateBadgeColor: '#fef3c7',
                stateBadgeBackgroundColor: '#92400e',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组补足',
                confirmButtonColors: {
                    fill: 0x3f3321,
                    hover: 0x3f3321,
                    stroke: 0x7c5b1f,
                    text: '#f8fafc',
                },
                manageButtonColors: {
                    fill: 0xb45309,
                    hover: 0xd97706,
                    stroke: 0xfef3c7,
                    text: '#fffbeb',
                },
                confirmGlowColor: 0xf59e0b,
                confirmGlowAlpha: 0,
                actionGlowColor: 0xf59e0b,
                actionGlowAlpha: 0.1,
            };
        }
        case 'too-many-cards': {
            const extraCards = Math.max(1, summary.deckCount - DECK_CARD_MAX);

            return {
                barFillColor: 0x261320,
                barBorderColor: 0xef4444,
                barAccentColor: 0xf97316,
                railLabel: '出发准备栏',
                titleColor: '#fff1f2',
                summaryColor: '#fecaca',
                supportColor: '#fda4af',
                headline: `当前带入「${summary.selectedDeckName}」超出上限 ${extraCards} 张`,
                detail: inventoryDetail,
                nextStepLabel: `下一步：先去管理卡组精简到 ${DECK_CARD_MAX} 张内，返回这里后才能确认带入。`,
                stateBadgeLabel: `超 ${extraCards} 张`,
                stateBadgeColor: '#fee2e2',
                stateBadgeBackgroundColor: '#b91c1c',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组精简',
                confirmButtonColors: {
                    fill: 0x312330,
                    hover: 0x312330,
                    stroke: 0x7f1d1d,
                    text: '#f8fafc',
                },
                manageButtonColors: {
                    fill: 0xbe123c,
                    hover: 0xe11d48,
                    stroke: 0xfecdd3,
                    text: '#fff1f2',
                },
                confirmGlowColor: 0xef4444,
                confirmGlowAlpha: 0,
                actionGlowColor: 0xf97316,
                actionGlowAlpha: 0.1,
            };
        }
        case 'insufficient-copies':
            return {
                barFillColor: 0x261320,
                barBorderColor: 0xef4444,
                barAccentColor: 0xf97316,
                railLabel: '出发准备栏',
                titleColor: '#fff1f2',
                summaryColor: '#fecaca',
                supportColor: '#fda4af',
                headline: `当前带入「${summary.selectedDeckName}」仍缺 ${Math.max(1, summary.shortageCardCopies)} 张库存卡`,
                detail: inventoryDetail,
                nextStepLabel: '下一步：先去管理卡组补齐缺口，返回这里后才能确认带入。',
                stateBadgeLabel: `缺 ${Math.max(1, summary.shortageCardCopies)} 张`,
                stateBadgeColor: '#fee2e2',
                stateBadgeBackgroundColor: '#b91c1c',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组补齐',
                confirmButtonColors: {
                    fill: 0x312330,
                    hover: 0x312330,
                    stroke: 0x7f1d1d,
                    text: '#f8fafc',
                },
                manageButtonColors: {
                    fill: 0xbe123c,
                    hover: 0xe11d48,
                    stroke: 0xfecdd3,
                    text: '#fff1f2',
                },
                confirmGlowColor: 0xef4444,
                confirmGlowAlpha: 0,
                actionGlowColor: 0xf97316,
                actionGlowAlpha: 0.1,
            };
        case 'none':
            return {
                barFillColor: 0x111827,
                barBorderColor: 0x475569,
                barAccentColor: 0x64748b,
                railLabel: '出发准备栏',
                titleColor: '#f8fafc',
                summaryColor: '#cbd5e1',
                supportColor: '#94a3b8',
                headline: '尚未选定本次带入卡组',
                detail: `当前随行物资：${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石。`,
                nextStepLabel: '下一步：先去管理卡组创建或选择一套可带入卡组，再返回这里确认出发。',
                stateBadgeLabel: '待选卡组',
                stateBadgeColor: '#e2e8f0',
                stateBadgeBackgroundColor: '#334155',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组选择',
                confirmButtonColors: {
                    fill: 0x374151,
                    hover: 0x374151,
                    stroke: 0x6b7280,
                    text: '#f8fafc',
                },
                manageButtonColors: {
                    fill: 0x1e293b,
                    hover: 0x334155,
                    stroke: 0x94a3b8,
                    text: '#f8fafc',
                },
                confirmGlowColor: 0x64748b,
                confirmGlowAlpha: 0,
                actionGlowColor: 0x64748b,
                actionGlowAlpha: 0.06,
            };
    }
}

function createActionButton(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    colors: ActionButtonColors,
    onClick: () => void,
    enabled = true,
): { container: GameObjects.Container; background: GameObjects.Rectangle; label: GameObjects.Text } {
    const background = scene.add.rectangle(0, 0, width, height, colors.fill, 1);
    background.setStrokeStyle(2, colors.stroke, enabled ? 0.95 : 0.38);

    if (enabled) {
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => background.setFillStyle(colors.hover, 1));
        background.on('pointerout', () => background.setFillStyle(colors.fill, 1));
        background.on('pointerdown', onClick);
    } else {
        background.setAlpha(0.55);
    }

    const text = scene.add.text(0, 0, label, {
        fontFamily: 'Arial',
        fontSize: height >= 56 ? '20px' : '18px',
        color: colors.text,
        fontStyle: 'bold',
    }).setOrigin(0.5);

    if (!enabled) {
        text.setAlpha(0.76);
    }

    const container = scene.add.container(x, y, [background, text]);

    return { container, background, label: text };
}

function createMetricChip(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    colors: { fill: number; stroke: number; value: string },
): Phaser.GameObjects.GameObject[] {
    const background = scene.add.rectangle(x, y, width, 32, colors.fill, 0.96);
    background.setStrokeStyle(1, colors.stroke, 0.85);
    const text = scene.add.text(x - width / 2 + 12, y, `${label} ${value}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: colors.value,
        fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    return [background, text];
}

function createCompactChip(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    textValue: string,
    colors: { fill: number; stroke: number; text: string },
): Phaser.GameObjects.GameObject[] {
    const background = scene.add.rectangle(x, y, width, 26, colors.fill, 0.96);
    background.setStrokeStyle(1, colors.stroke, 0.92);
    const text = scene.add.text(x, y, textValue, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: colors.text,
        fontStyle: 'bold',
    }).setOrigin(0.5);

    return [background, text];
}

function getDeckHandoffBannerColors(
    tone: PreparationDeckHandoffSummary['tone'],
): DeckHandoffBannerColors {
    switch (tone) {
        case 'positive':
            return {
                fillColor: 0x10261d,
                borderColor: 0x22c55e,
                badgeColor: '#dcfce7',
                badgeBackgroundColor: '#166534',
                detailColor: '#bbf7d0',
            };
        case 'warning':
            return {
                fillColor: 0x2a1420,
                borderColor: 0xf59e0b,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                detailColor: '#fde68a',
            };
        case 'neutral':
            return {
                fillColor: 0x111827,
                borderColor: 0x64748b,
                badgeColor: '#e2e8f0',
                badgeBackgroundColor: '#334155',
                detailColor: '#cbd5e1',
            };
    }
}

export class PreparationPanel extends GameObjects.Container {
    private stash: PersistentStash;
    private readonly metadata?: CardMetadataMap;
    private readonly routeBriefing?: ExpeditionRouteBriefingSummary;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private deckHandoffSummary?: PreparationDeckHandoffSummary | null;

    private scrollX = 0;
    private maxScrollX = 0;
    private isDragging = false;
    private dragStartX = 0;
    private dragMoved = false;
    private pendingDeckClick: string | null = null;
    private scrollContainer?: GameObjects.Container;
    private leftIndicator?: GameObjects.Text;
    private rightIndicator?: GameObjects.Text;
    private readonly scrollTweenState = { value: 0 };
    private wheelHandler?: (
        pointer: Phaser.Input.Pointer,
        gameObjects: unknown[],
        deltaX: number,
        deltaY: number,
    ) => void;
    private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerUpHandler?: () => void;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.metadata = config.metadata;
        this.routeBriefing = config.routeBriefing;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;
        this.deckHandoffSummary = config.deckHandoffSummary;

        this.renderPanel();
        this.once(Phaser.GameObjects.Events.DESTROY, () => this.teardownScrollInteraction());
        scene.add.existing(this);
    }

    updateStash(
        stash: PersistentStash,
        deckSwitchFeedback?: PreparationPanelDeckSwitchFeedback,
    ): void {
        this.stash = stash;
        this.deckHandoffSummary = null;
        this.renderPanel({
            deckSwitchFeedback,
            initialScrollX: this.scrollX,
        });
    }

    private renderPanel(options: DeckSwitchRenderOptions = {}): void {
        this.teardownScrollInteraction();
        this.scene.tweens.killTweensOf(this.scrollTweenState);
        this.removeAll(true);
        this.scrollContainer = undefined;
        this.leftIndicator = undefined;
        this.rightIndicator = undefined;
        this.isDragging = false;
        this.dragMoved = false;
        this.pendingDeckClick = null;

        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(980, width * 0.82);
        const panelX = width / 2;
        const summary = createPreparationSummary(this.stash);
        const selectedLoadoutSummary = createPreparationSelectedLoadoutSummary(this.stash, this.metadata);
        const validation = validateExpeditionLoadout(this.stash);
        const isDeckValid = validation.valid;
        const selectedDeck = getSelectedSavedDeck(this.stash);
        const selectedDeckId = selectedDeck?.id ?? null;
        const selectedLoadoutColors = getSelectedLoadoutColors(selectedLoadoutSummary);
        const actionColors = getActionHierarchyColors(selectedLoadoutSummary);
        const selectedDeckSummaryWidth = 308;
        const loadoutGap = 18;
        const contentWidth = panelWidth - 96;
        const carriedLoadoutWidth = contentWidth - selectedDeckSummaryWidth - loadoutGap;
        const deckPreviewColumns = splitPreviewColumns(selectedLoadoutSummary.deckPreviewLines, 8, 2);
        const itemPreviewText = formatPreviewBulletList(selectedLoadoutSummary.itemPreviewLines, 3);
        const validationLines = formatPreparationValidationLines(validation, this.metadata);
        const validationStatusBody = selectedDeckId
            ? `当前带入「${selectedLoadoutSummary.selectedDeckName}」\n${selectedLoadoutSummary.deckCount} 张卡 · ${selectedLoadoutSummary.uniqueCardCount} 种 · ${selectedLoadoutSummary.itemCount} 件道具`
            : `尚未选中卡组\n随行物资 ${selectedLoadoutSummary.itemCount} 件道具 · ${selectedLoadoutSummary.spiritStones} 枚灵石`;
        const validationChecklistBody = formatBulletLines(
            isDeckValid ? selectedLoadoutSummary.readinessChecklistLines : validationLines,
            3,
        );
        const validationGuidanceBody = formatBulletLines(selectedLoadoutSummary.guidanceLines, 3);
        const validationMetrics = getValidationManifestMetrics(
            this.scene,
            contentWidth,
            validationStatusBody,
            validationChecklistBody,
            validationGuidanceBody,
        );
        const validationHeight = validationMetrics.height;
        const loadoutManifestMetrics = getLoadoutManifestMetrics(
            this.scene,
            selectedLoadoutSummary,
            carriedLoadoutWidth,
            deckPreviewColumns,
            itemPreviewText,
        );
        const actionTextWidth = Math.max(280, contentWidth - ACTION_BUTTON_COLUMN_WIDTH - 68);
        const deckCardHeight = getDeckCardHeight(this.scene, this.stash.savedDecks);
        const loadoutSummaryHeight = getSelectedLoadoutSummaryHeight(
            this.scene,
            selectedLoadoutSummary,
            selectedDeckSummaryWidth,
            loadoutManifestMetrics.previewPanelHeight,
        );
        const actionHeadlineHeight = measureTextHeight(this.scene, actionColors.headline, {
            fontFamily: 'Arial',
            fontSize: '22px',
            fontStyle: 'bold',
            wordWrap: { width: actionTextWidth },
        });
        const actionDetailHeight = measureTextHeight(this.scene, actionColors.detail, {
            fontFamily: 'Arial',
            fontSize: '14px',
            lineSpacing: 3,
            wordWrap: { width: actionTextWidth },
        });
        const actionNextStepHeight = measureTextHeight(this.scene, actionColors.nextStepLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: actionTextWidth },
        });
        const actionHeight = calculateActionRailHeight(
            actionHeadlineHeight,
            actionDetailHeight,
            actionNextStepHeight,
        );
        const subtitleHeight = measureTextHeight(
            this.scene,
            '选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。',
            {
                fontFamily: 'Arial',
                fontSize: '20px',
                wordWrap: { width: contentWidth },
            },
        );
        const scrollHintHeight = measureTextHeight(
            this.scene,
            this.stash.savedDecks.length > 1
                ? '拖动或滚轮浏览更多卡组，点按卡片即可切换本次带入卡组。'
                : '点按卡片即可切换本次带入卡组。',
            {
                fontFamily: 'Arial',
                fontSize: '15px',
            },
        );
        const titleTop = 34;
        const subtitleTop = titleTop + 48;
        const subtitleBottom = subtitleTop + subtitleHeight;
        const routeBriefingHeight = this.routeBriefing
            ? getRouteBriefingHeight(this.scene, this.routeBriefing, contentWidth)
            : 0;
        const routeBriefingTopOffset = this.routeBriefing
            ? subtitleBottom + 18
            : null;
        const handoffTopOffset = this.deckHandoffSummary
            ? (this.routeBriefing
                ? (routeBriefingTopOffset ?? subtitleBottom) + routeBriefingHeight + 16
                : subtitleBottom + 16)
            : null;
        const deckSelectorOffsetY = handoffTopOffset !== null
            ? handoffTopOffset + 84 + 18
            : this.routeBriefing
                ? (routeBriefingTopOffset ?? subtitleBottom) + routeBriefingHeight + 16
                : subtitleBottom + 26;
        const scrollHintOffsetY = deckSelectorOffsetY + deckCardHeight + 10;
        const validationOffsetY = scrollHintOffsetY + scrollHintHeight + 12;
        const loadoutOffsetY = validationOffsetY + validationHeight + 16;
        const actionOffsetY = loadoutOffsetY + loadoutSummaryHeight + 16;
        const panelHeight = Math.min(
            Math.max(PANEL_MIN_HEIGHT, actionOffsetY + actionHeight + 34),
            Math.min(PANEL_MAX_HEIGHT, Math.floor(height * PANEL_MAX_HEIGHT_RATIO)),
        );
        const panelY = height / 2 + (panelHeight > 920 ? 10 : 24);
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentLeft = panelLeft + 48;
        const routeBriefingTop = routeBriefingTopOffset !== null
            ? panelTop + routeBriefingTopOffset
            : null;
        const deckSelectorY = panelTop + deckSelectorOffsetY;
        const scrollHintY = panelTop + scrollHintOffsetY;
        const validationTop = panelTop + validationOffsetY;
        const loadoutTop = panelTop + loadoutOffsetY;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x030712, 0.8);
        const shadow = this.scene.add.rectangle(panelX, panelY + 12, panelWidth + 16, panelHeight + 16, 0x020617, 0.42);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.98);
        panel.setStrokeStyle(3, 0x60a5fa, 0.82);
        const panelAccent = this.scene.add.rectangle(panelX, panelTop + 6, panelWidth - 36, 6, 0x7c3aed, 0.96).setOrigin(0.5, 0);

        const title = this.scene.add.text(contentLeft, panelTop + 34, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(contentLeft, title.y + 48, '选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: contentWidth },
        });
        const routeBriefingElements: Phaser.GameObjects.GameObject[] = [];

        if (this.routeBriefing && routeBriefingTop !== null) {
            const routeBriefing = createRouteBriefingStrip(
                this.scene,
                contentLeft,
                routeBriefingTop,
                contentWidth,
                this.routeBriefing,
            );

            routeBriefingElements.push(...routeBriefing.elements);
        }
        const handoffSummary = this.deckHandoffSummary;
        const handoffElements: Phaser.GameObjects.GameObject[] = [];

        if (handoffSummary) {
            const bannerColors = getDeckHandoffBannerColors(handoffSummary.tone);
            const bannerTop = panelTop + (handoffTopOffset ?? subtitleBottom + 16);
            const bannerHeight = 84;
            const banner = this.scene.add.rectangle(
                panelX,
                bannerTop + bannerHeight / 2,
                contentWidth,
                bannerHeight,
                bannerColors.fillColor,
                0.96,
            );
            banner.setStrokeStyle(2, bannerColors.borderColor, 0.92);
            const bannerTitle = this.scene.add.text(contentLeft + 18, bannerTop + 14, handoffSummary.title, {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: bannerColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: bannerColors.badgeBackgroundColor,
                padding: { left: 12, right: 12, top: 6, bottom: 6 },
            });
            const bannerDetail = this.scene.add.text(contentLeft + 18, bannerTitle.y + 38, handoffSummary.detail, {
                fontFamily: 'Arial',
                fontSize: '17px',
                color: bannerColors.detailColor,
                wordWrap: { width: contentWidth - 36 },
                lineSpacing: 4,
            });

            handoffElements.push(banner, bannerTitle, bannerDetail);
        }

        const deckCardRow = this.createDeckCardRow(
            contentLeft,
            deckSelectorY,
            contentWidth,
            selectedDeckId,
            deckCardHeight,
            options.initialScrollX,
        );

        const scrollHint = this.maxScrollX > 0
            ? this.scene.add.text(contentLeft, scrollHintY, '拖动或滚轮浏览更多卡组，点按卡片即可切换本次带入卡组。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#a78bfa',
            })
            : this.scene.add.text(contentLeft, scrollHintY, '点按卡片即可切换本次带入卡组。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#94a3b8',
            });
        const validationGlow = this.scene.add.rectangle(
            panelX,
            validationTop + validationHeight / 2,
            contentWidth + 10,
            validationHeight + 10,
            isDeckValid ? 0x22c55e : 0xef4444,
            isDeckValid ? 0.08 : 0.12,
        );
        const validationCard = this.scene.add.rectangle(
            panelX,
            validationTop + validationHeight / 2,
            contentWidth,
            validationHeight,
            isDeckValid ? 0x10261d : 0x2a1420,
            0.96,
        );
        validationCard.setStrokeStyle(2, isDeckValid ? 0x22c55e : 0xef4444, 0.92);
        const validationBadge = this.scene.add.text(contentLeft + 18, validationTop + 16, isDeckValid ? '已满足带入要求' : '出发前仍需调整', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: isDeckValid ? '#bbf7d0' : '#fecaca',
            fontStyle: 'bold',
            backgroundColor: isDeckValid ? '#14532d' : '#7f1d1d',
            padding: { left: 12, right: 12, top: 6, bottom: 6 },
        });
        const validationRule = this.scene.add.text(contentLeft + contentWidth - 18, validationTop + 20, '放行清单：张数 / 库存 / 随行物资', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: isDeckValid ? '#86efac' : '#fca5a5',
        }).setOrigin(1, 0);
        const validationSectionTop = validationTop + 52;
        const validationSectionLeft = contentLeft + 18;
        const validationChecklistLeft = validationSectionLeft + validationMetrics.statusWidth + 12;
        const validationGuidanceLeft = validationChecklistLeft + validationMetrics.checklistWidth + 12;
        const validationStatusPanel = createManifestPanel(
            this.scene,
            validationSectionLeft,
            validationSectionTop,
            validationMetrics.statusWidth,
            validationMetrics.sectionHeight,
            '放行结论',
            validationStatusBody,
            {
                fillColor: isDeckValid ? 0x0f1d38 : 0x2b1622,
                borderColor: isDeckValid ? 0x1d4ed8 : 0x9f1239,
                titleColor: isDeckValid ? '#93c5fd' : '#fda4af',
                bodyColor: isDeckValid ? '#dbeafe' : '#fee2e2',
                badgeColor: selectedLoadoutColors.badgeColor,
                badgeBackgroundColor: selectedLoadoutColors.badgeBackgroundColor,
            },
            {
                badgeText: selectedLoadoutSummary.readinessLabel,
            },
        );
        const validationChecklistPanel = createManifestPanel(
            this.scene,
            validationChecklistLeft,
            validationSectionTop,
            validationMetrics.checklistWidth,
            validationMetrics.sectionHeight,
            isDeckValid ? '校验清单' : '阻塞项',
            validationChecklistBody,
            {
                fillColor: isDeckValid ? 0x10261d : 0x311725,
                borderColor: isDeckValid ? 0x166534 : 0xb91c1c,
                titleColor: isDeckValid ? '#86efac' : '#fda4af',
                bodyColor: isDeckValid ? '#dcfce7' : '#fff1f2',
            },
        );
        const validationGuidancePanel = createManifestPanel(
            this.scene,
            validationGuidanceLeft,
            validationSectionTop,
            validationMetrics.guidanceWidth,
            validationMetrics.sectionHeight,
            isDeckValid ? '执行提示' : '修整建议',
            validationGuidanceBody,
            {
                fillColor: 0x111827,
                borderColor: isDeckValid ? 0x475569 : 0xf59e0b,
                titleColor: isDeckValid ? '#cbd5e1' : '#fcd34d',
                bodyColor: isDeckValid ? '#e2e8f0' : '#fef3c7',
            },
        );
        const validationContainer = this.scene.add.container(0, 0, [
            validationGlow,
            validationCard,
            validationBadge,
            validationRule,
            ...validationStatusPanel,
            ...validationChecklistPanel,
            ...validationGuidancePanel,
        ]);
        const selectedLoadoutGlow = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            loadoutTop + loadoutSummaryHeight / 2,
            selectedDeckSummaryWidth + 12,
            loadoutSummaryHeight + 12,
            selectedLoadoutColors.accentColor,
            selectedLoadoutSummary.readiness === 'ready' ? 0.1 : 0.14,
        );
        const selectedDeckSummaryCard = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            loadoutTop + loadoutSummaryHeight / 2,
            selectedDeckSummaryWidth,
            loadoutSummaryHeight,
            selectedLoadoutColors.fillColor,
            0.98,
        );
        selectedDeckSummaryCard.setStrokeStyle(2, selectedLoadoutColors.borderColor, 0.92);
        const selectedDeckSummaryAccent = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            loadoutTop + 5,
            selectedDeckSummaryWidth - 16,
            5,
            selectedLoadoutColors.accentColor,
            1,
        ).setOrigin(0.5, 0);
        const selectedDeckHeading = this.scene.add.text(contentLeft + 18, loadoutTop + 14, '当前带入卡组', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
        });
        const selectedDeckStatusBadge = this.scene.add.text(
            contentLeft + selectedDeckSummaryWidth - 18,
            loadoutTop + 16,
            selectedLoadoutSummary.readinessLabel,
            {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: selectedLoadoutColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: selectedLoadoutColors.badgeBackgroundColor,
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        ).setOrigin(1, 0);
        const selectedDeckNameText = this.scene.add.text(contentLeft + 18, selectedDeckHeading.y + 34, selectedLoadoutSummary.selectedDeckName, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
            wordWrap: { width: selectedDeckSummaryWidth - 36 },
        });
        const selectedDeckChipWidth = (selectedDeckSummaryWidth - 36 - 12 * 2) / 3;
        const selectedDeckChipY = selectedDeckNameText.y + selectedDeckNameText.height + 18;
        const selectedDeckChipColors = {
            fill: 0x0b1220,
            stroke: selectedLoadoutColors.borderColor,
            text: selectedLoadoutColors.headlineColor,
        };
        const selectedDeckCountChip = createCompactChip(
            this.scene,
            contentLeft + 18 + selectedDeckChipWidth / 2,
            selectedDeckChipY,
            selectedDeckChipWidth,
            `张数 ${selectedLoadoutSummary.deckCount}`,
            selectedDeckChipColors,
        );
        const selectedDeckUniqueChip = createCompactChip(
            this.scene,
            contentLeft + 18 + selectedDeckChipWidth * 1.5 + 12,
            selectedDeckChipY,
            selectedDeckChipWidth,
            `种类 ${selectedLoadoutSummary.uniqueCardCount}`,
            selectedDeckChipColors,
        );
        const selectedDeckFocusChip = createCompactChip(
            this.scene,
            contentLeft + 18 + selectedDeckChipWidth * 2.5 + 24,
            selectedDeckChipY,
            selectedDeckChipWidth,
            `${selectedLoadoutSummary.focusChip.label} ${selectedLoadoutSummary.focusChip.value}`,
            selectedDeckChipColors,
        );
        const selectedDeckReadinessPanelTop = selectedDeckChipY + 20;
        const selectedDeckReadinessPanelHeight = 52;
        const selectedDeckReadinessPanel = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            selectedDeckReadinessPanelTop + selectedDeckReadinessPanelHeight / 2,
            selectedDeckSummaryWidth - 36,
            selectedDeckReadinessPanelHeight,
            selectedLoadoutColors.fillColor,
            0.72,
        );
        selectedDeckReadinessPanel.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.58);
        const selectedDeckReadinessLabel = this.scene.add.text(contentLeft + 30, selectedDeckReadinessPanelTop + 7, '出发校验', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const selectedDeckReadinessText = this.scene.add.text(
            contentLeft + 30,
            selectedDeckReadinessLabel.y + 18,
            selectedLoadoutSummary.issuePreviewLines.length > 0
                ? `${selectedLoadoutSummary.focusSummaryLine}\n• ${selectedLoadoutSummary.issuePreviewLines[0]}`
                : `${selectedLoadoutSummary.headline}\n${selectedLoadoutSummary.focusSummaryLine}`,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: selectedLoadoutColors.headlineColor,
                wordWrap: { width: selectedDeckSummaryWidth - 60 },
                lineSpacing: 2,
            },
        );
        const selectedDeckCompositionPanelTop = selectedDeckReadinessPanelTop + selectedDeckReadinessPanelHeight + 8;
        const selectedDeckCompositionPanelHeight = 54;
        const selectedDeckCompositionPanel = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            selectedDeckCompositionPanelTop + selectedDeckCompositionPanelHeight / 2,
            selectedDeckSummaryWidth - 36,
            selectedDeckCompositionPanelHeight,
            0x0b1220,
            0.9,
        );
        selectedDeckCompositionPanel.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.42);
        const selectedDeckCompositionLabel = this.scene.add.text(contentLeft + 30, selectedDeckCompositionPanelTop + 7, '构成速览', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const selectedDeckComposition = this.scene.add.text(
            contentLeft + 30,
            selectedDeckCompositionLabel.y + 18,
            `${selectedLoadoutSummary.kindSummaryLine}\n${formatBulletLines(selectedLoadoutSummary.kindBreakdownLines, 2)}`,
            {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: selectedLoadoutColors.headlineColor,
                wordWrap: { width: selectedDeckSummaryWidth - 60 },
                lineSpacing: 2,
            },
        );
        const selectedDeckFooter = this.scene.add.text(
            contentLeft + 18,
            loadoutTop + loadoutSummaryHeight - 18,
            selectedLoadoutSummary.footer,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: selectedLoadoutColors.mutedColor,
                wordWrap: { width: selectedDeckSummaryWidth - 36 },
            },
        ).setOrigin(0, 1);
        const selectedLoadoutContainer = this.scene.add.container(0, 0, [
            selectedLoadoutGlow,
            selectedDeckSummaryCard,
            selectedDeckSummaryAccent,
            selectedDeckHeading,
            selectedDeckStatusBadge,
            selectedDeckNameText,
            ...selectedDeckCountChip,
            ...selectedDeckUniqueChip,
            ...selectedDeckFocusChip,
            selectedDeckReadinessPanel,
            selectedDeckReadinessLabel,
            selectedDeckReadinessText,
            selectedDeckCompositionPanel,
            selectedDeckCompositionLabel,
            selectedDeckComposition,
            selectedDeckFooter,
        ]);

        const carriedLoadoutLeft = contentLeft + selectedDeckSummaryWidth + loadoutGap;
        const carriedLoadoutCard = this.scene.add.rectangle(
            carriedLoadoutLeft + carriedLoadoutWidth / 2,
            loadoutTop + loadoutSummaryHeight / 2,
            carriedLoadoutWidth,
            loadoutSummaryHeight,
            0x111827,
            0.98,
        );
        carriedLoadoutCard.setStrokeStyle(2, 0x334155, 0.9);
        const carriedLoadoutAccent = this.scene.add.rectangle(
            carriedLoadoutLeft + carriedLoadoutWidth / 2,
            loadoutTop + 5,
            carriedLoadoutWidth - 16,
            5,
            0x8b5cf6,
            1,
        ).setOrigin(0.5, 0);
        const carriedLoadoutHeading = this.scene.add.text(carriedLoadoutLeft + 18, loadoutTop + 14, '本次携带一览', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const metricChipWidth = (carriedLoadoutWidth - 36 - 12 * 2) / 3;
        const metricChipY = carriedLoadoutHeading.y + 40;
        const carriedDeckChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth / 2, metricChipY, metricChipWidth, '卡牌', `${summary.deckCount} 张`, {
            fill: 0x132949,
            stroke: 0x3b82f6,
            value: '#dbeafe',
        });
        const carriedItemsChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth * 1.5 + 12, metricChipY, metricChipWidth, '道具', `${summary.itemCount} 件`, {
            fill: 0x10261d,
            stroke: 0x22c55e,
            value: '#dcfce7',
        });
        const carriedStonesChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth * 2.5 + 24, metricChipY, metricChipWidth, '灵石', `${summary.spiritStones}`, {
            fill: 0x2a220f,
            stroke: 0xf59e0b,
            value: '#fef3c7',
        });
        const previewTop = metricChipY + 24;
        const previewGap = loadoutManifestMetrics.previewGap;
        const utilityColumnWidth = loadoutManifestMetrics.utilityColumnWidth;
        const deckPreviewWidth = loadoutManifestMetrics.deckPreviewWidth;
        const previewPanelHeight = loadoutManifestMetrics.previewPanelHeight;
        const deckPreviewColumnGap = loadoutManifestMetrics.deckPreviewColumnGap;
        const singleDeckPreviewColumnWidth = loadoutManifestMetrics.singleDeckPreviewColumnWidth;
        const itemPanelHeight = loadoutManifestMetrics.itemPanelHeight;
        const checklistPanelHeight = loadoutManifestMetrics.checklistPanelHeight;
        const guidancePanelHeight = loadoutManifestMetrics.guidancePanelHeight
            + Math.max(0, previewPanelHeight - loadoutManifestMetrics.utilityStackHeight);
        const carriedDeckPanel = this.scene.add.rectangle(
            carriedLoadoutLeft + 18 + deckPreviewWidth / 2,
            previewTop + previewPanelHeight / 2,
            deckPreviewWidth,
            previewPanelHeight,
            0x0b1220,
            0.92,
        );
        carriedDeckPanel.setStrokeStyle(1, 0x3b82f6, 0.42);
        const carriedDeckHeading = this.scene.add.text(carriedLoadoutLeft + 18 + 12, previewTop + 10, '带入舱单', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        const carriedDeckSummary = this.scene.add.text(carriedDeckHeading.x, carriedDeckHeading.y + carriedDeckHeading.height + 4, `卡组构成：${selectedLoadoutSummary.kindSummaryLine}`, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#bfdbfe',
            lineSpacing: 3,
            wordWrap: { width: deckPreviewWidth - 24 },
        });
        const carriedDeckPreviewLeft = this.scene.add.text(carriedLoadoutLeft + 18 + 12, carriedDeckSummary.y + carriedDeckSummary.height + 8, deckPreviewColumns[0].join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '12px',
            color: '#e2e8f0',
            lineSpacing: 3,
            wordWrap: { width: singleDeckPreviewColumnWidth },
        });
        const carriedDeckPreviewRight = this.scene.add.text(
            carriedLoadoutLeft + 18 + 12 + singleDeckPreviewColumnWidth + deckPreviewColumnGap,
            carriedDeckPreviewLeft.y,
            deckPreviewColumns[1].join('\n'),
            {
                fontFamily: 'Courier New',
                fontSize: '12px',
                color: '#e2e8f0',
                lineSpacing: 3,
                wordWrap: { width: singleDeckPreviewColumnWidth },
            },
        );
        const utilityColumnLeft = carriedLoadoutLeft + 18 + deckPreviewWidth + previewGap;
        const checklistPanelTop = previewTop + itemPanelHeight + LOADOUT_MANIFEST_SECTION_GAP;
        const guidancePanelTop = checklistPanelTop + checklistPanelHeight + LOADOUT_MANIFEST_SECTION_GAP;
        const carriedItemsPanel = createManifestPanel(
            this.scene,
            utilityColumnLeft,
            previewTop,
            utilityColumnWidth,
            itemPanelHeight,
            '物资封单',
            `携带道具 ${summary.itemCount} 件\n${itemPreviewText}`,
            {
                fillColor: 0x0d1b15,
                borderColor: 0x22c55e,
                titleColor: '#86efac',
                bodyColor: '#dcfce7',
            },
        );
        const carriedChecklistPanel = createManifestPanel(
            this.scene,
            utilityColumnLeft,
            checklistPanelTop,
            utilityColumnWidth,
            checklistPanelHeight,
            selectedLoadoutSummary.issuePreviewLines.length > 0 ? '阻塞项' : '放行检查',
            formatBulletLines(selectedLoadoutSummary.readinessChecklistLines, 3),
            {
                fillColor: selectedLoadoutColors.fillColor,
                borderColor: selectedLoadoutColors.borderColor,
                titleColor: selectedLoadoutColors.mutedColor,
                bodyColor: selectedLoadoutColors.headlineColor,
                badgeColor: selectedLoadoutColors.badgeColor,
                badgeBackgroundColor: selectedLoadoutColors.badgeBackgroundColor,
            },
            {
                badgeText: selectedLoadoutSummary.readinessLabel,
            },
        );
        const carriedGuidancePanel = createManifestPanel(
            this.scene,
            utilityColumnLeft,
            guidancePanelTop,
            utilityColumnWidth,
            guidancePanelHeight,
            selectedLoadoutSummary.readiness === 'ready' ? '放行建议' : '修整建议',
            formatBulletLines(selectedLoadoutSummary.guidanceLines, 3),
            {
                fillColor: 0x111827,
                borderColor: selectedLoadoutSummary.readiness === 'ready' ? 0x475569 : 0xf59e0b,
                titleColor: selectedLoadoutSummary.readiness === 'ready' ? '#cbd5e1' : '#fcd34d',
                bodyColor: selectedLoadoutSummary.readiness === 'ready' ? '#e2e8f0' : '#fef3c7',
            },
        );
        const carriedReadinessContainer = this.scene.add.container(0, 0, [
            ...carriedItemsPanel,
            ...carriedChecklistPanel,
            ...carriedGuidancePanel,
        ]);

        const actionTop = loadoutTop + loadoutSummaryHeight + 16;
        const actionGlow = this.scene.add.rectangle(
            panelX,
            actionTop + actionHeight / 2,
            contentWidth + 14,
            actionHeight + 16,
            actionColors.actionGlowColor,
            actionColors.actionGlowAlpha,
        );
        const actionBar = this.scene.add.rectangle(
            panelX,
            actionTop + actionHeight / 2,
            contentWidth,
            actionHeight,
            actionColors.barFillColor,
            0.98,
        );
        actionBar.setStrokeStyle(2, actionColors.barBorderColor, 0.9);
        const actionAccent = this.scene.add.rectangle(
            panelX,
            actionTop + 6,
            contentWidth - 24,
            5,
            actionColors.barAccentColor,
            0.96,
        ).setOrigin(0.5, 0);
        const actionRailLabel = this.scene.add.text(contentLeft + 20, actionTop + 16, actionColors.railLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.supportColor,
            fontStyle: 'bold',
        });
        const actionStateBadge = this.scene.add.text(
            contentLeft + 20 + actionTextWidth,
            actionTop + 16,
            actionColors.stateBadgeLabel,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: actionColors.stateBadgeColor,
                fontStyle: 'bold',
                backgroundColor: actionColors.stateBadgeBackgroundColor,
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        ).setOrigin(1, 0);
        const actionHeadline = this.scene.add.text(contentLeft + 20, actionTop + 38, actionColors.headline, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: actionColors.titleColor,
            fontStyle: 'bold',
            wordWrap: { width: actionTextWidth },
        });
        const actionSummary = this.scene.add.text(contentLeft + 20, actionHeadline.y + actionHeadline.height + 6, actionColors.detail, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: actionColors.summaryColor,
            lineSpacing: 3,
            wordWrap: { width: actionTextWidth },
        });
        const actionNextStep = this.scene.add.text(contentLeft + 20, actionSummary.y + actionSummary.height + 6, actionColors.nextStepLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.supportColor,
            lineSpacing: 3,
            wordWrap: { width: actionTextWidth },
        });

        const buttonColumnLeft = contentLeft + contentWidth - ACTION_BUTTON_COLUMN_WIDTH - 20;
        const buttonStackHeight = ACTION_BUTTON_PRIMARY_HEIGHT + ACTION_BUTTON_GAP + ACTION_BUTTON_SECONDARY_HEIGHT;
        const buttonStackTop = actionTop + Math.max(16, Math.floor((actionHeight - buttonStackHeight) / 2));
        const primaryButtonY = buttonStackTop + ACTION_BUTTON_PRIMARY_HEIGHT / 2;
        const secondaryButtonY = buttonStackTop + ACTION_BUTTON_PRIMARY_HEIGHT + ACTION_BUTTON_GAP + ACTION_BUTTON_SECONDARY_HEIGHT / 2;
        const manageButtonHeight = actionColors.primaryAction === 'manage'
            ? ACTION_BUTTON_PRIMARY_HEIGHT
            : ACTION_BUTTON_SECONDARY_HEIGHT;
        const confirmButtonHeight = actionColors.primaryAction === 'confirm'
            ? ACTION_BUTTON_PRIMARY_HEIGHT
            : ACTION_BUTTON_SECONDARY_HEIGHT;
        const manageButtonY = actionColors.primaryAction === 'manage' ? primaryButtonY : secondaryButtonY;
        const confirmButtonY = actionColors.primaryAction === 'confirm' ? primaryButtonY : secondaryButtonY;

        const deckManagerButton = createActionButton(
            this.scene,
            buttonColumnLeft + ACTION_BUTTON_COLUMN_WIDTH / 2,
            manageButtonY,
            ACTION_BUTTON_COLUMN_WIDTH,
            manageButtonHeight,
            actionColors.manageButtonLabel,
            actionColors.manageButtonColors,
            () => this.openDeckManager(),
        );

        const confirmGlow = this.scene.add.rectangle(
            buttonColumnLeft + ACTION_BUTTON_COLUMN_WIDTH / 2,
            confirmButtonY,
            ACTION_BUTTON_COLUMN_WIDTH + 18,
            confirmButtonHeight + 14,
            actionColors.confirmGlowColor,
            actionColors.confirmGlowAlpha,
        );
        const confirmButton = createActionButton(
            this.scene,
            buttonColumnLeft + ACTION_BUTTON_COLUMN_WIDTH / 2,
            confirmButtonY,
            ACTION_BUTTON_COLUMN_WIDTH,
            confirmButtonHeight,
            actionColors.confirmButtonLabel,
            actionColors.confirmButtonColors,
            () => this.confirmLoadout(),
            isDeckValid,
        );
        const actionContainer = this.scene.add.container(0, 0, [
            actionGlow,
            actionBar,
            actionAccent,
            actionRailLabel,
            actionStateBadge,
            actionHeadline,
            actionSummary,
            actionNextStep,
            deckManagerButton.container,
            confirmGlow,
            confirmButton.container,
        ]);

        this.add([
            overlay,
            shadow,
            panel,
            panelAccent,
            title,
            subtitle,
            ...routeBriefingElements,
            ...handoffElements,
            ...deckCardRow.elements,
            scrollHint,
            validationContainer,
            selectedLoadoutContainer,
            carriedLoadoutCard,
            carriedLoadoutAccent,
            carriedLoadoutHeading,
            ...carriedDeckChip,
            ...carriedItemsChip,
            ...carriedStonesChip,
            carriedDeckPanel,
            carriedDeckHeading,
            carriedDeckSummary,
            carriedDeckPreviewLeft,
            carriedDeckPreviewRight,
            carriedReadinessContainer,
            actionContainer,
        ]);

        if (this.maxScrollX > 0) {
            this.setupScrollInteraction();
        }

        this.setDepth(1000);

        if (options.deckSwitchFeedback) {
            this.playDeckSwitchFeedback(options.deckSwitchFeedback, {
                selectedCard: deckCardRow.selectedCard,
                validationContainer,
                selectedLoadoutContainer,
                carriedReadinessContainer,
                actionContainer,
                confirmButton: confirmButton.container,
                manageDeckButton: deckManagerButton.container,
                validationGlow,
                selectedLoadoutGlow,
                actionGlow,
                confirmGlow,
                targetScrollX: deckCardRow.targetScrollX,
            });
        }
    }

    private createDeckCardRow(
        startX: number,
        y: number,
        maxWidth: number,
        selectedDeckId: string | null,
        cardHeight: number,
        initialScrollX?: number,
    ): DeckCardRowBuild {
        const elements: Phaser.GameObjects.GameObject[] = [];
        const decks = this.stash.savedDecks;
        const cardWidth = DECK_CARD_WIDTH;
        const cardGap = DECK_CARD_GAP;
        let selectedCard: DeckCardAnimationRefs | undefined;

        if (decks.length === 0) {
            this.maxScrollX = 0;
            this.scrollX = 0;

            const emptyState = this.scene.add.rectangle(startX + maxWidth / 2, y + cardHeight / 2, maxWidth, cardHeight, 0x111827, 0.94);
            emptyState.setStrokeStyle(2, 0x475569, 0.82);
            const emptyTitle = this.scene.add.text(startX + 20, y + 20, '暂无可带入卡组', {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            });
            const emptyBody = this.scene.add.text(startX + 20, emptyTitle.y + 38, '请先点击“管理卡组”整理一套满足要求的卡组，再开始秘境探索。', {
                fontFamily: 'Arial',
                fontSize: '17px',
                color: '#94a3b8',
                wordWrap: { width: maxWidth - 40 },
            });
            elements.push(emptyState, emptyTitle, emptyBody);
            return {
                elements,
                targetScrollX: 0,
            };
        }

        const totalContentWidth = decks.length * cardWidth + Math.max(0, decks.length - 1) * cardGap;
        const needsScroll = totalContentWidth > maxWidth;
        const selectedDeckIndex = Math.max(0, decks.findIndex((deck) => deck.id === selectedDeckId));
        const targetScrollX = Math.max(0, Phaser.Math.Clamp(
            selectedDeckIndex * (cardWidth + cardGap) - (maxWidth - cardWidth) / 2,
            0,
            Math.max(0, totalContentWidth - maxWidth),
        ));

        this.maxScrollX = Math.max(0, totalContentWidth - maxWidth);
        this.scrollX = this.maxScrollX > 0
            ? Phaser.Math.Clamp(initialScrollX ?? targetScrollX, 0, this.maxScrollX)
            : 0;
        this.scrollTweenState.value = this.scrollX;

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(startX, y, maxWidth, cardHeight);
        const mask = maskGraphics.createGeometryMask();
        elements.push(maskGraphics);

        const innerContainer = this.scene.add.container(0, 0);
        innerContainer.setX(-this.scrollX);
        this.scrollContainer = innerContainer;

        const outerContainer = this.scene.add.container(startX, y);
        outerContainer.add(innerContainer);
        outerContainer.setMask(mask);
        elements.push(outerContainer);

        decks.forEach((deck, index) => {
            const cardX = index * (cardWidth + cardGap) + cardWidth / 2;
            const cardY = cardHeight / 2;
            const isSelected = deck.id === selectedDeckId;
            const displayState = createDeckDisplayState(deck, this.stash.cards, isSelected, this.metadata);
            const cardCount = countDeckCards(deck.cards);
            const selectedLift = isSelected ? -8 : 0;
            const spotlight = isSelected
                ? this.scene.add.rectangle(0, 0, cardWidth + 12, cardHeight + 12, displayState.borderColor, 0.08)
                : undefined;
            const cardContainer = this.scene.add.container(cardX, cardY + selectedLift);
            const shadow = this.scene.add.rectangle(4, 6, cardWidth, cardHeight, displayState.shadowColor, displayState.shadowAlpha);
            spotlight?.setStrokeStyle(1, displayState.borderColor, 0.32);
            const bg = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, displayState.fillColor, 0.98);
            bg.setStrokeStyle(isSelected ? 3 : 2, displayState.borderColor, 1);

            const accent = this.scene.add.rectangle(0, -cardHeight / 2 + 5, cardWidth - 12, 6, displayState.accentColor, 1).setOrigin(0.5, 0);
            const selection = this.scene.add.text(-cardWidth / 2 + 16, -cardHeight / 2 + 16, displayState.selectionLabel, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: displayState.selectionBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.selectionBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            });
            const status = this.scene.add.text(cardWidth / 2 - 16, -cardHeight / 2 + 16, displayState.statusLabel, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: displayState.statusBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.statusBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            }).setOrigin(1, 0);
            const deckName = this.scene.add.text(-cardWidth / 2 + 16, selection.y + 28, deck.name, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#f8fafc',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 32 },
            });
            const countText = this.scene.add.text(
                -cardWidth / 2 + 16,
                deckName.y + deckName.height + 6,
                `${cardCount} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} · ${displayState.uniqueCardCount} 种卡`,
                {
                    fontFamily: 'Arial',
                    fontSize: '13px',
                    color: displayState.countColor,
                },
            );
            const chipAreaWidth = cardWidth - 32;
            const chipWidth = (chipAreaWidth - 6 * 2) / 3;
            const chipY = countText.y + 18;
            const deckCountChip = createCompactChip(
                this.scene,
                -cardWidth / 2 + 16 + chipWidth / 2,
                chipY,
                chipWidth,
                `张数 ${cardCount}`,
                {
                    fill: displayState.chipFillColor,
                    stroke: displayState.chipBorderColor,
                    text: displayState.chipTextColor,
                },
            );
            const uniqueCountChip = createCompactChip(
                this.scene,
                -cardWidth / 2 + 16 + chipWidth * 1.5 + 6,
                chipY,
                chipWidth,
                `种类 ${displayState.uniqueCardCount}`,
                {
                    fill: displayState.chipFillColor,
                    stroke: displayState.chipBorderColor,
                    text: displayState.chipTextColor,
                },
            );
            const focusChip = createCompactChip(
                this.scene,
                -cardWidth / 2 + 16 + chipWidth * 2.5 + 12,
                chipY,
                chipWidth,
                `${displayState.focusChip.label} ${displayState.focusChip.value}`,
                {
                    fill: displayState.chipFillColor,
                    stroke: displayState.chipBorderColor,
                    text: displayState.chipTextColor,
                },
            );
            const footerBg = this.scene.add.rectangle(
                0,
                cardHeight / 2 - 18,
                cardWidth - 2,
                34,
                displayState.footerFillColor,
                0.95,
            );
            const comparisonTop = chipY + 18;
            const comparisonHeight = Math.max(50, footerBg.getTopCenter().y - comparisonTop - 8);
            const comparisonGap = 10;
            const comparisonWidth = cardWidth - 32;
            const comparisonColumnWidth = (comparisonWidth - comparisonGap) / 2;
            const compositionPanel = this.scene.add.rectangle(
                -comparisonColumnWidth / 2 - comparisonGap / 2,
                comparisonTop + comparisonHeight / 2,
                comparisonColumnWidth,
                comparisonHeight,
                displayState.previewFillColor,
                0.96,
            );
            compositionPanel.setStrokeStyle(1, displayState.previewBorderColor, 0.55);
            const compositionLabel = this.scene.add.text(-cardWidth / 2 + 24, comparisonTop + 8, '构成分布', {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.previewLabelColor,
                fontStyle: 'bold',
            });
            const compositionText = this.scene.add.text(-cardWidth / 2 + 24, compositionLabel.y + 16, formatBulletLines(displayState.compositionLines, 3), {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.previewTextColor,
                wordWrap: { width: comparisonColumnWidth - 20, useAdvancedWrap: true },
                lineSpacing: 2,
            });
            const comparisonPanel = this.scene.add.rectangle(
                comparisonColumnWidth / 2 + comparisonGap / 2,
                comparisonTop + comparisonHeight / 2,
                comparisonColumnWidth,
                comparisonHeight,
                displayState.previewFillColor,
                0.96,
            );
            comparisonPanel.setStrokeStyle(1, displayState.previewBorderColor, 0.55);
            const comparisonLabel = this.scene.add.text(
                -cardWidth / 2 + 24 + comparisonColumnWidth + comparisonGap,
                comparisonTop + 8,
                displayState.comparisonLabel,
                {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: displayState.previewLabelColor,
                    fontStyle: 'bold',
                },
            );
            const comparisonText = this.scene.add.text(
                comparisonLabel.x,
                comparisonLabel.y + 16,
                formatBulletLines(displayState.comparisonLines, 2),
                {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: displayState.previewTextColor,
                    wordWrap: { width: comparisonColumnWidth - 20, useAdvancedWrap: true },
                    lineSpacing: 2,
                },
            );
            const footerText = this.scene.add.text(-cardWidth / 2 + 16, footerBg.y, displayState.footerText, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.footerTextColor,
                wordWrap: { width: cardWidth - 32, useAdvancedWrap: true },
            }).setOrigin(0, 0.5);
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(displayState.hoverFillColor, 1));
            bg.on('pointerout', () => bg.setFillStyle(displayState.fillColor, 0.98));
            bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                this.pendingDeckClick = deck.id;
                this.dragStartX = pointer.x;
                this.isDragging = true;
                this.dragMoved = false;
            });

            cardContainer.add([
                ...(spotlight ? [spotlight] : []),
                shadow,
                bg,
                accent,
                selection,
                status,
                deckName,
                countText,
                ...deckCountChip,
                ...uniqueCountChip,
                ...focusChip,
                compositionPanel,
                compositionLabel,
                compositionText,
                comparisonPanel,
                comparisonLabel,
                comparisonText,
                footerBg,
                footerText,
            ]);

            innerContainer.add(cardContainer);

            if (isSelected) {
                selectedCard = {
                    deckId: deck.id,
                    container: cardContainer,
                    baseY: cardY + selectedLift,
                    spotlight,
                    accent,
                    background: bg,
                    footerBackground: footerBg,
                    isSelected,
                    valid: displayState.valid,
                };
            }
        });

        if (needsScroll) {
            this.leftIndicator = this.scene.add.text(startX + 10, y + cardHeight / 2, '◀', {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#c4b5fd',
                backgroundColor: '#111827',
                padding: { left: 8, right: 8, top: 8, bottom: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.leftIndicator.on('pointerdown', () => this.applyScroll(this.scrollX - (cardWidth + cardGap)));

            this.rightIndicator = this.scene.add.text(startX + maxWidth - 10, y + cardHeight / 2, '▶', {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#c4b5fd',
                backgroundColor: '#111827',
                padding: { left: 8, right: 8, top: 8, bottom: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.rightIndicator.on('pointerdown', () => this.applyScroll(this.scrollX + (cardWidth + cardGap)));

            this.updateScrollIndicators();
            elements.push(this.leftIndicator, this.rightIndicator);
        }

        return {
            elements,
            selectedCard,
            targetScrollX,
        };
    }

    private playDeckSwitchFeedback(
        feedback: PreparationPanelDeckSwitchFeedback,
        refs: PreparationPanelAnimationRefs,
    ): void {
        const deckChanged = feedback.before.selectedDeckId !== feedback.after.selectedDeckId;
        const readinessChanged = feedback.before.readiness !== feedback.after.readiness;
        const becameReady = feedback.before.readiness !== 'ready' && feedback.after.readiness === 'ready';
        const becameInvalid = feedback.before.readiness === 'ready' && feedback.after.readiness !== 'ready';

        if (deckChanged && refs.selectedCard) {
            refs.selectedCard.container.setAlpha(0.84);
            refs.selectedCard.container.setScale(0.95);
            refs.selectedCard.container.setY(refs.selectedCard.baseY + 14);
            refs.selectedCard.background.setAlpha(0.9);
            refs.selectedCard.footerBackground.setAlpha(0.82);
            refs.selectedCard.accent.setScale(0.78, 1);
            refs.selectedCard.spotlight?.setAlpha(0);

            this.scene.tweens.add({
                targets: refs.selectedCard.container,
                alpha: 1,
                scaleX: 1,
                scaleY: 1,
                y: refs.selectedCard.baseY,
                duration: 260,
                ease: 'Back.easeOut',
            });
            this.scene.tweens.add({
                targets: [refs.selectedCard.background, refs.selectedCard.footerBackground],
                alpha: 0.98,
                duration: 220,
                ease: 'Cubic.easeOut',
            });
            this.scene.tweens.add({
                targets: refs.selectedCard.accent,
                scaleX: 1,
                duration: 240,
                ease: 'Cubic.easeOut',
            });

            if (refs.selectedCard.spotlight) {
                this.scene.tweens.add({
                    targets: refs.selectedCard.spotlight,
                    alpha: refs.selectedCard.valid ? 0.22 : 0.28,
                    duration: 180,
                    ease: 'Cubic.easeOut',
                    yoyo: true,
                    hold: 90,
                });
            }
        }

        [
            refs.validationContainer,
            refs.selectedLoadoutContainer,
            refs.carriedReadinessContainer,
            refs.actionContainer,
        ].forEach((target, index) => {
            if (!target) {
                return;
            }

            target.setAlpha(0.68);
            target.setY(12 + index * 3);
            this.scene.tweens.add({
                targets: target,
                alpha: 1,
                y: 0,
                duration: 220 + index * 30,
                ease: 'Cubic.easeOut',
                delay: 40 + index * 20,
            });
        });

        if (Math.abs(refs.targetScrollX - this.scrollX) > 1) {
            this.animateScrollTo(refs.targetScrollX, 260);
        }

        if (becameReady) {
            refs.confirmButton?.setScale(0.95);
            refs.confirmGlow?.setAlpha(0);
            refs.actionGlow?.setAlpha(0.04);

            this.scene.tweens.add({
                targets: refs.confirmButton,
                scaleX: 1,
                scaleY: 1,
                duration: 260,
                ease: 'Back.easeOut',
                delay: 120,
            });
            this.scene.tweens.add({
                targets: refs.confirmGlow,
                alpha: 0.26,
                duration: 180,
                ease: 'Cubic.easeOut',
                yoyo: true,
                hold: 140,
                delay: 100,
            });
            this.scene.tweens.add({
                targets: refs.actionGlow,
                alpha: 0.14,
                duration: 180,
                ease: 'Cubic.easeOut',
                yoyo: true,
                hold: 140,
                delay: 60,
            });
            return;
        }

        if (becameInvalid) {
            refs.manageDeckButton?.setScale(0.96);
            refs.validationGlow?.setAlpha(0.06);
            refs.selectedLoadoutGlow?.setAlpha(0.08);
            refs.actionGlow?.setAlpha(0.04);

            this.scene.tweens.add({
                targets: refs.manageDeckButton,
                scaleX: 1,
                scaleY: 1,
                duration: 240,
                ease: 'Back.easeOut',
                delay: 120,
            });
            this.scene.tweens.add({
                targets: [refs.validationGlow, refs.selectedLoadoutGlow, refs.actionGlow].filter(Boolean),
                alpha: 0.18,
                duration: 170,
                ease: 'Cubic.easeOut',
                yoyo: true,
                hold: 120,
                delay: 80,
            });
            return;
        }

        if (readinessChanged) {
            this.scene.tweens.add({
                targets: [refs.validationGlow, refs.selectedLoadoutGlow, refs.actionGlow].filter(Boolean),
                alpha: '+=0.08',
                duration: 150,
                ease: 'Cubic.easeOut',
                yoyo: true,
                hold: 100,
                delay: 70,
            });
        }
    }

    private animateScrollTo(targetScrollX: number, duration: number): void {
        const clampedTarget = Phaser.Math.Clamp(targetScrollX, 0, this.maxScrollX);

        if (!this.scrollContainer || Math.abs(clampedTarget - this.scrollX) <= 0.5) {
            this.applyScroll(clampedTarget, true);
            return;
        }

        this.scene.tweens.killTweensOf(this.scrollTweenState);
        this.scrollTweenState.value = this.scrollX;
        this.scene.tweens.add({
            targets: this.scrollTweenState,
            value: clampedTarget,
            duration,
            ease: 'Cubic.easeOut',
            onUpdate: () => this.applyScroll(this.scrollTweenState.value, true),
        });
    }

    private setupScrollInteraction(): void {
        this.teardownScrollInteraction();

        this.wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
            if (!this.visible) {
                return;
            }

            this.applyScroll(this.scrollX + deltaY * 0.65);
        };
        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.visible || !this.isDragging) {
                return;
            }

            const dx = this.dragStartX - pointer.x;

            if (!this.dragMoved && Math.abs(dx) > 4) {
                this.dragMoved = true;
            }

            if (this.dragMoved) {
                this.applyScroll(this.scrollX + dx);
                this.dragStartX = pointer.x;
            }
        };
        this.pointerUpHandler = () => {
            if (!this.isDragging) {
                return;
            }

            if (!this.dragMoved && this.pendingDeckClick !== null) {
                this.onDeckSelect(this.pendingDeckClick);
            }

            this.isDragging = false;
            this.dragMoved = false;
            this.pendingDeckClick = null;
        };

        this.scene.input.on('wheel', this.wheelHandler);
        this.scene.input.on('pointermove', this.pointerMoveHandler);
        this.scene.input.on('pointerup', this.pointerUpHandler);
    }

    private teardownScrollInteraction(): void {
        this.scene.tweens.killTweensOf(this.scrollTweenState);

        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
            this.wheelHandler = undefined;
        }

        if (this.pointerMoveHandler) {
            this.scene.input.off('pointermove', this.pointerMoveHandler);
            this.pointerMoveHandler = undefined;
        }

        if (this.pointerUpHandler) {
            this.scene.input.off('pointerup', this.pointerUpHandler);
            this.pointerUpHandler = undefined;
        }
    }

    private applyScroll(desired: number, skipTweenKill = false): void {
        if (!skipTweenKill) {
            this.scene.tweens.killTweensOf(this.scrollTweenState);
        }

        this.scrollX = Phaser.Math.Clamp(desired, 0, this.maxScrollX);
        this.scrollTweenState.value = this.scrollX;

        if (this.scrollContainer) {
            this.scrollContainer.setX(-this.scrollX);
        }

        this.updateScrollIndicators();
    }

    private updateScrollIndicators(): void {
        if (this.leftIndicator) {
            this.leftIndicator.setAlpha(this.scrollX > 1 ? 1 : 0.25);
        }

        if (this.rightIndicator) {
            this.rightIndicator.setAlpha(this.scrollX < this.maxScrollX - 1 ? 1 : 0.25);
        }
    }

    private confirmLoadout(): void {
        this.onConfirm();
    }

    private openDeckManager(): void {
        this.onOpenDeckManager?.();
    }
}
