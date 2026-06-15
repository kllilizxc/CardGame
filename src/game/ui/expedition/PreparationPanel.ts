import { GameObjects, Scene } from 'phaser';

import {
    createPreparationDeckCarouselSummary,
    createPreparationDeckCardPreview,
    createPreparationSummary,
    createPreparationSelectedLoadoutSummary,
    formatPreparationValidationLines,
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
    calculateDeckCardHeight,
    calculateLoadoutDetailHeight,
    calculateReadinessHeroHeight,
} from './PreparationPanelLayout';
import {
    getAdjacentPreparationDeckId,
    getPreparationKeyboardShortcut,
} from './preparationPanelKeyboard';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
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
    shortcutHint: string;
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

interface DeckCarouselWayfindingRefs {
    progressFill: GameObjects.Rectangle;
    progressText: GameObjects.Text;
    progressTrackX: number;
    progressTrackWidth: number;
    deckCount: number;
    viewportWidth: number;
    slotWidth: number;
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

interface ReadinessHeroMetrics {
    textWidth: number;
    validationPanelWidth: number;
    sectionHeight: number;
    height: number;
}

interface LoadoutDetailMetrics {
    panelWidth: number;
    panelHeight: number;
    contentHeight: number;
    footerHeight: number;
    height: number;
}

const DECK_CARD_WIDTH = 216;
const DECK_CARD_GAP = 12;
const PANEL_MIN_HEIGHT = 620;
const PANEL_MAX_HEIGHT = 900;
const PANEL_MAX_HEIGHT_RATIO = 0.95;
const ACTION_BUTTON_COLUMN_WIDTH = 228;
const ACTION_BUTTON_PRIMARY_HEIGHT = 62;
const ACTION_BUTTON_SECONDARY_HEIGHT = 44;
const ACTION_BUTTON_GAP = 10;
const LOADOUT_MANIFEST_DECK_COLUMN_GAP = 10;

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

function truncateLabel(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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
            fontSize: '16px',
            fontStyle: 'bold',
            wordWrap: { width: DECK_CARD_WIDTH - 28 },
        }),
    ), 0);

    return calculateDeckCardHeight(maxDeckNameHeight);
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

function measureManifestPanelHeight(
    scene: Scene,
    body: string,
    width: number,
    options: {
        minHeight?: number;
        monospacedBody?: boolean;
    } = {},
): number {
    return Math.max(
        options.minHeight ?? 76,
        40 + measureTextHeight(scene, body, {
            fontFamily: options.monospacedBody ? 'Courier New' : 'Arial',
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: width - 24 },
        }),
    );
}

function getReadinessHeroMetrics(
    scene: Scene,
    contentWidth: number,
    buttonColumnWidth: number,
    deckName: string,
    headline: string,
    detail: string,
    readinessBody: string,
    actionBody: string,
    shortcutHint: string,
): ReadinessHeroMetrics {
    const textWidth = contentWidth - buttonColumnWidth - 48;
    const validationPanelWidth = textWidth;
    const deckNameHeight = measureTextHeight(scene, deckName, {
        fontFamily: 'Arial',
        fontSize: '28px',
        fontStyle: 'bold',
        wordWrap: { width: textWidth },
    });
    const headlineHeight = measureTextHeight(scene, headline, {
        fontFamily: 'Arial',
        fontSize: '20px',
        fontStyle: 'bold',
        wordWrap: { width: textWidth },
    });
    const detailHeight = measureTextHeight(scene, detail, {
        fontFamily: 'Arial',
        fontSize: '13px',
        lineSpacing: 3,
        wordWrap: { width: textWidth },
    });
    const sectionHeight = measureManifestPanelHeight(
        scene,
        readinessBody,
        validationPanelWidth,
        { minHeight: 84 },
    );
    const actionBodyHeight = measureTextHeight(scene, actionBody, {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: buttonColumnWidth - 24 },
    });
    const shortcutHintHeight = measureTextHeight(scene, shortcutHint, {
        fontFamily: 'Arial',
        fontSize: '12px',
        lineSpacing: 3,
        wordWrap: { width: buttonColumnWidth - 24 },
    });
    const headerHeight = 92
        + deckNameHeight
        + headlineHeight
        + detailHeight;
    const actionColumnHeight = 50
        + actionBodyHeight
        + 8
        + shortcutHintHeight
        + 14
        + ACTION_BUTTON_PRIMARY_HEIGHT
        + ACTION_BUTTON_GAP
        + ACTION_BUTTON_SECONDARY_HEIGHT
        + 18;

    return {
        textWidth,
        validationPanelWidth,
        sectionHeight,
        height: calculateReadinessHeroHeight(
            headerHeight,
            sectionHeight,
            0,
            actionColumnHeight,
        ),
    };
}

function getLoadoutDetailMetrics(
    scene: Scene,
    summary: PreparationSelectedLoadoutSummary,
    contentWidth: number,
    compositionBody: string,
    itemPreviewText: string,
): LoadoutDetailMetrics {
    const innerWidth = contentWidth - 36;
    const panelWidth = Math.floor((innerWidth - LOADOUT_MANIFEST_DECK_COLUMN_GAP) / 2);
    const compositionPanelHeight = measureManifestPanelHeight(
        scene,
        compositionBody,
        panelWidth,
        {
            minHeight: 84,
        },
    );
    const itemPanelHeight = measureManifestPanelHeight(
        scene,
        `携带道具 ${summary.itemCount} 件 · 灵石 ${summary.spiritStones} 枚\n${itemPreviewText}`,
        panelWidth,
        {
            minHeight: 84,
        },
    );
    const footerHeight = measureTextHeight(scene, summary.footer, {
        fontFamily: 'Arial',
        fontSize: '12px',
        wordWrap: { width: contentWidth - 36 },
    });
    const panelHeight = Math.max(compositionPanelHeight, itemPanelHeight);
    const contentHeight = panelHeight;

    return {
        panelWidth,
        panelHeight,
        contentHeight,
        footerHeight,
        height: calculateLoadoutDetailHeight(contentHeight, footerHeight),
    };
}

function createDeckDisplayState(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
    isSelected: boolean,
    metadata?: CardMetadataMap,
): DeckDisplayState {
    const validation = validateDeckForDisplay(deck, stashCards);
    const preview = createPreparationDeckCardPreview(deck, stashCards, metadata);
    const selectionLabel = isSelected ? '当前带入' : '候选卡组';
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
            footerText: '当前将按这套卡组出发。',
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
            footerText: '点按切换为本次带入。',
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
            footerText: '需补足牌数后再确认。',
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
            footerText: '需精简后再确认。',
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
        footerText: '需补齐库存后再确认。',
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
                shortcutHint: '快捷操作：Enter 触发主操作 · M 管理卡组',
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
                shortcutHint: '快捷操作：Enter 触发主操作 · M 管理卡组',
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
                shortcutHint: '快捷操作：Enter 触发主操作 · M 管理卡组',
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
                shortcutHint: '快捷操作：Enter 触发主操作 · M 管理卡组',
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
                shortcutHint: '快捷操作：Enter 触发主操作 · M 管理卡组',
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
    private deckCarouselWayfinding?: DeckCarouselWayfindingRefs;
    private readonly scrollTweenState = { value: 0 };
    private wheelHandler?: (
        pointer: Phaser.Input.Pointer,
        gameObjects: unknown[],
        deltaX: number,
        deltaY: number,
    ) => void;
    private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerUpHandler?: () => void;
    private keydownHandler?: (event: KeyboardEvent) => void;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.metadata = config.metadata;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;
        this.deckHandoffSummary = config.deckHandoffSummary;

        this.renderPanel();
        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);
        this.once(Phaser.GameObjects.Events.DESTROY, () => {
            this.teardownScrollInteraction();
            this.teardownKeyboardShortcuts();
        });
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
        this.deckCarouselWayfinding = undefined;
        this.isDragging = false;
        this.dragMoved = false;
        this.pendingDeckClick = null;

        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(980, width * 0.82);
        const panelX = width / 2;
        const summary = createPreparationSummary(this.stash);
        const selectedLoadoutSummary = createPreparationSelectedLoadoutSummary(this.stash, this.metadata);
        const deckCarouselSummary = createPreparationDeckCarouselSummary(this.stash);
        const validation = validateExpeditionLoadout(this.stash);
        const isDeckValid = validation.valid;
        const selectedDeck = getSelectedSavedDeck(this.stash);
        const selectedDeckId = selectedDeck?.id ?? null;
        const selectedLoadoutColors = getSelectedLoadoutColors(selectedLoadoutSummary);
        const actionColors = getActionHierarchyColors(selectedLoadoutSummary);
        const contentWidth = panelWidth - 96;
        const buttonColumnWidth = Math.min(
            ACTION_BUTTON_COLUMN_WIDTH,
            Math.max(224, Math.floor(contentWidth * 0.3)),
        );
        const selectorInnerWidth = contentWidth - 36;
        const preparationSubtitle = '选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。';
        const itemPreviewText = formatPreviewBulletList(selectedLoadoutSummary.itemPreviewLines, 1);
        const validationLines = formatPreparationValidationLines(validation, this.metadata);
        const validationChecklistBody = formatBulletLines(
            isDeckValid ? selectedLoadoutSummary.readinessChecklistLines : validationLines,
            3,
        );
        const carouselProgressMeasurementText = this.stash.savedDecks.length === 0
            ? '暂无卡组可浏览 · 请先去管理卡组整理一套。'
            : this.maxScrollX > 0 || this.stash.savedDecks.length > 3
                ? `浏览进度 100% · 当前可见 1-${Math.min(this.stash.savedDecks.length, 4)} / ${this.stash.savedDecks.length} 套 · 拖动/滚轮/← / → 切换`
                : `全部卡组已展开 · 当前可见 1-${this.stash.savedDecks.length} / ${this.stash.savedDecks.length} 套 · 点按卡片或按 ← / → 切换`;
        const heroDetailText = `${selectedLoadoutSummary.detail}\n${actionColors.detail}`;
        const actionSummaryLabel = selectedLoadoutSummary.readiness === 'ready' ? '执行提示' : '修整建议';
        const actionSummaryText = actionColors.nextStepLabel.replace(/^下一步：/, '');
        const heroMetrics = getReadinessHeroMetrics(
            this.scene,
            contentWidth,
            buttonColumnWidth,
            selectedLoadoutSummary.selectedDeckName,
            selectedLoadoutSummary.headline,
            heroDetailText,
            validationChecklistBody,
            actionSummaryText,
            actionColors.shortcutHint,
        );
        const detailCompositionBody = `卡组构成：${selectedLoadoutSummary.kindSummaryLine}\n${formatPreviewBulletList(
            selectedLoadoutSummary.deckPreviewLines,
            1,
        )}`;
        const detailMetrics = getLoadoutDetailMetrics(
            this.scene,
            selectedLoadoutSummary,
            contentWidth,
            detailCompositionBody,
            itemPreviewText,
        );
        const supportHeadingHeight = measureTextHeight(this.scene, '本次携带一览', {
            fontFamily: 'Arial',
            fontSize: '13px',
            fontStyle: 'bold',
        });
        const deckCardHeight = getDeckCardHeight(this.scene, this.stash.savedDecks);
        const selectorHeadingHeight = measureTextHeight(this.scene, '切换本次带入卡组', {
            fontFamily: 'Arial',
            fontSize: '14px',
            fontStyle: 'bold',
        });
        const selectorLabelHeight = measureTextHeight(this.scene, '卡组序列', {
            fontFamily: 'Arial',
            fontSize: '11px',
            fontStyle: 'bold',
        });
        const selectorRosterHeight = measureTextHeight(this.scene, deckCarouselSummary.rosterSummaryLine, {
            fontFamily: 'Arial',
            fontSize: '12px',
            lineSpacing: 3,
            wordWrap: { width: selectorInnerWidth },
        });
        const selectorProgressHeight = measureTextHeight(this.scene, carouselProgressMeasurementText, {
            fontFamily: 'Arial',
            fontSize: '11px',
            lineSpacing: 3,
            wordWrap: { width: selectorInnerWidth },
        });
        const deckSwitcherSectionHeaderHeight = 12
            + selectorHeadingHeight
            + 6
            + selectorLabelHeight
            + 4
            + selectorRosterHeight
            + 6
            + selectorProgressHeight
            + 8
            + 4
            + 10;
        const deckSwitcherSectionHeight = deckSwitcherSectionHeaderHeight + deckCardHeight + 14;
        const primaryPreflightHeight = heroMetrics.height + 10 + deckSwitcherSectionHeight + 12;
        const subtitleHeight = measureTextHeight(
            this.scene,
            preparationSubtitle,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                wordWrap: { width: contentWidth },
            },
        );
        const titleHeight = measureTextHeight(this.scene, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '14px',
            fontStyle: 'bold',
        });
        const headerBlockHeight = titleHeight + 4 + subtitleHeight;
        const handoffDetailHeight = this.deckHandoffSummary
            ? measureTextHeight(this.scene, this.deckHandoffSummary.detail, {
                fontFamily: 'Arial',
                fontSize: '13px',
                wordWrap: { width: contentWidth - 36 },
                lineSpacing: 3,
            })
            : 0;
        const handoffBannerHeight = this.deckHandoffSummary
            ? Math.max(48, 28 + handoffDetailHeight + 10)
            : 0;
        const titleTop = 24;
        const subtitleTop = titleTop + titleHeight + 4;
        const handoffTopOffset = this.deckHandoffSummary
            ? subtitleTop + subtitleHeight + 10
            : null;
        const readinessHeroOffsetY = handoffTopOffset !== null
            ? handoffTopOffset + handoffBannerHeight + 10
            : titleTop + headerBlockHeight + 10;
        const detailSectionOffsetY = readinessHeroOffsetY + primaryPreflightHeight + 10;
        const detailCardHeight = 18
            + Math.max(supportHeadingHeight, 16)
            + 10
            + detailMetrics.panelHeight
            + 10
            + detailMetrics.footerHeight
            + 14;
        const panelHeight = Math.min(
            Math.max(PANEL_MIN_HEIGHT, detailSectionOffsetY + detailCardHeight + 24),
            Math.min(PANEL_MAX_HEIGHT, Math.floor(height * PANEL_MAX_HEIGHT_RATIO)),
        );
        const panelY = height / 2 + (panelHeight > 820 ? 8 : 18);
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentLeft = panelLeft + 48;
        const readinessHeroTop = panelTop + readinessHeroOffsetY;
        const detailSectionTop = panelTop + detailSectionOffsetY;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x030712, 0.8);
        const shadow = this.scene.add.rectangle(panelX, panelY + 12, panelWidth + 16, panelHeight + 16, 0x020617, 0.42);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.98);
        panel.setStrokeStyle(3, 0x60a5fa, 0.82);
        const panelAccent = this.scene.add.rectangle(panelX, panelTop + 6, panelWidth - 36, 6, 0x7c3aed, 0.96).setOrigin(0.5, 0);

        const title = this.scene.add.text(contentLeft, panelTop + titleTop, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#c4b5fd',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(contentLeft, panelTop + subtitleTop, preparationSubtitle, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
            wordWrap: { width: contentWidth },
        });
        const handoffSummary = this.deckHandoffSummary;
        const handoffElements: Phaser.GameObjects.GameObject[] = [];

        if (handoffSummary) {
            const bannerColors = getDeckHandoffBannerColors(handoffSummary.tone);
            const bannerTop = panelTop + (handoffTopOffset ?? subtitleTop + subtitleHeight + 10);
            const bannerHeight = handoffBannerHeight;
            const banner = this.scene.add.rectangle(
                panelX,
                bannerTop + bannerHeight / 2,
                contentWidth,
                bannerHeight,
                bannerColors.fillColor,
                0.96,
            );
            banner.setStrokeStyle(2, bannerColors.borderColor, 0.92);
            const bannerTitle = this.scene.add.text(contentLeft + 18, bannerTop + 10, handoffSummary.title, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: bannerColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: bannerColors.badgeBackgroundColor,
                padding: { left: 9, right: 9, top: 4, bottom: 4 },
            });
            const bannerDetail = this.scene.add.text(contentLeft + 18, bannerTitle.y + bannerTitle.height + 8, handoffSummary.detail, {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: bannerColors.detailColor,
                wordWrap: { width: contentWidth - 36 },
                lineSpacing: 3,
            });

            handoffElements.push(banner, bannerTitle, bannerDetail);
        }

        const heroInnerLeft = contentLeft + 18;
        const heroButtonLeft = contentLeft + contentWidth - buttonColumnWidth - 20;
        const heroGlow = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + primaryPreflightHeight / 2,
            contentWidth + 12,
            primaryPreflightHeight + 10,
            selectedLoadoutColors.accentColor,
            selectedLoadoutSummary.readiness === 'ready' ? 0.08 : 0.12,
        );
        const heroCard = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + primaryPreflightHeight / 2,
            contentWidth,
            primaryPreflightHeight,
            selectedLoadoutColors.fillColor,
            0.98,
        );
        heroCard.setStrokeStyle(2, selectedLoadoutColors.borderColor, 0.92);
        const heroAccent = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + 5,
            contentWidth - 16,
            5,
            selectedLoadoutColors.accentColor,
            1,
        ).setOrigin(0.5, 0);
        const heroRailLabel = this.scene.add.text(heroInnerLeft, readinessHeroTop + 16, actionColors.railLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.supportColor,
            fontStyle: 'bold',
        });
        const heroStateBadge = this.scene.add.text(
            heroButtonLeft - 12,
            readinessHeroTop + 12,
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
        const heroDeckLabel = this.scene.add.text(heroInnerLeft, heroRailLabel.y + 24, '当前带入卡组', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const heroDeckName = this.scene.add.text(heroInnerLeft, heroDeckLabel.y + 18, selectedLoadoutSummary.selectedDeckName, {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroConclusionLabel = this.scene.add.text(heroInnerLeft, heroDeckName.y + heroDeckName.height + 10, '放行结论', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const heroHeadline = this.scene.add.text(heroInnerLeft, heroConclusionLabel.y + 18, selectedLoadoutSummary.headline, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: actionColors.titleColor,
            fontStyle: 'bold',
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroDetail = this.scene.add.text(heroInnerLeft, heroHeadline.y + heroHeadline.height + 8, heroDetailText, {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: actionColors.summaryColor,
            lineSpacing: 3,
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroFocusBadge = this.scene.add.text(
            heroInnerLeft,
            heroDetail.y + heroDetail.height + 12,
            `${selectedLoadoutSummary.focusChip.label}：${selectedLoadoutSummary.focusChip.value}`,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: selectedLoadoutColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: selectedLoadoutColors.badgeBackgroundColor,
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        );
        const heroChecklistRule = this.scene.add.text(
            heroInnerLeft,
            heroFocusBadge.y + heroFocusBadge.height + 10,
            '放行清单',
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: actionColors.supportColor,
            },
        );
        const readinessPanelTop = heroChecklistRule.y + heroChecklistRule.height + 8;
        const readinessPanel = createManifestPanel(
            this.scene,
            heroInnerLeft,
            readinessPanelTop,
            heroMetrics.validationPanelWidth,
            heroMetrics.sectionHeight,
            selectedLoadoutSummary.issuePreviewLines.length > 0 ? '阻塞项' : '出发校验',
            validationChecklistBody,
            {
                fillColor: selectedLoadoutSummary.readiness === 'ready' ? 0x0f1d38 : 0x29131b,
                borderColor: selectedLoadoutSummary.readiness === 'ready' ? 0x3b82f6 : selectedLoadoutColors.borderColor,
                titleColor: selectedLoadoutColors.mutedColor,
                bodyColor: selectedLoadoutColors.headlineColor,
                badgeColor: selectedLoadoutColors.badgeColor,
                badgeBackgroundColor: selectedLoadoutColors.badgeBackgroundColor,
            },
            {
                badgeText: selectedLoadoutSummary.readinessLabel,
            },
        );
        const heroSummaryContainer = this.scene.add.container(0, 0, [
            heroRailLabel,
            heroStateBadge,
            heroDeckLabel,
            heroDeckName,
            heroConclusionLabel,
            heroHeadline,
            heroDetail,
            heroFocusBadge,
            heroChecklistRule,
            ...readinessPanel,
        ]);

        const actionGlow = this.scene.add.rectangle(
            heroButtonLeft + buttonColumnWidth / 2,
            readinessHeroTop + heroMetrics.height / 2,
            buttonColumnWidth + 18,
            heroMetrics.height - 28,
            actionColors.actionGlowColor,
            actionColors.actionGlowAlpha,
        );
        const actionSlot = this.scene.add.rectangle(
            heroButtonLeft + buttonColumnWidth / 2,
            readinessHeroTop + heroMetrics.height / 2,
            buttonColumnWidth,
            heroMetrics.height - 36,
            actionColors.barFillColor,
            0.66,
        );
        actionSlot.setStrokeStyle(1, actionColors.barBorderColor, 0.5);
        const actionSlotLabel = this.scene.add.text(heroButtonLeft, readinessHeroTop + 16, '本次操作', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.supportColor,
            fontStyle: 'bold',
        });
        const actionSummaryHeading = this.scene.add.text(heroButtonLeft, actionSlotLabel.y + 24, actionSummaryLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: selectedLoadoutSummary.readiness === 'ready' ? '#cbd5e1' : '#fcd34d',
            fontStyle: 'bold',
        });
        const actionSummary = this.scene.add.text(heroButtonLeft, actionSummaryHeading.y + 18, actionSummaryText, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.summaryColor,
            lineSpacing: 3,
            wordWrap: { width: buttonColumnWidth - 24 },
        });
        const actionShortcutHint = this.scene.add.text(heroButtonLeft, actionSummary.y + actionSummary.height + 8, actionColors.shortcutHint, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: actionColors.supportColor,
            lineSpacing: 3,
            wordWrap: { width: buttonColumnWidth - 24 },
        });
        const buttonStackHeight = ACTION_BUTTON_PRIMARY_HEIGHT + ACTION_BUTTON_GAP + ACTION_BUTTON_SECONDARY_HEIGHT;
        const buttonStackTop = readinessHeroTop + heroMetrics.height - 16 - buttonStackHeight;
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
            heroButtonLeft + buttonColumnWidth / 2,
            manageButtonY,
            buttonColumnWidth,
            manageButtonHeight,
            actionColors.manageButtonLabel,
            actionColors.manageButtonColors,
            () => this.openDeckManager(),
        );
        const confirmGlow = this.scene.add.rectangle(
            heroButtonLeft + buttonColumnWidth / 2,
            confirmButtonY,
            buttonColumnWidth + 18,
            confirmButtonHeight + 14,
            actionColors.confirmGlowColor,
            actionColors.confirmGlowAlpha,
        );
        const confirmButton = createActionButton(
            this.scene,
            heroButtonLeft + buttonColumnWidth / 2,
            confirmButtonY,
            buttonColumnWidth,
            confirmButtonHeight,
            actionColors.confirmButtonLabel,
            actionColors.confirmButtonColors,
            () => this.confirmLoadout(),
            isDeckValid,
        );
        const actionContainer = this.scene.add.container(0, 0, [
            actionGlow,
            actionSlot,
            actionSlotLabel,
            actionSummaryHeading,
            actionSummary,
            actionShortcutHint,
            deckManagerButton.container,
            confirmGlow,
            confirmButton.container,
        ]);

        const selectorInnerLeft = contentLeft + 18;
        const deckSwitcherTop = readinessHeroTop + heroMetrics.height + 10;
        const switcherDivider = this.scene.add.rectangle(
            panelX,
            deckSwitcherTop - 4,
            contentWidth - 36,
            1,
            selectedLoadoutColors.borderColor,
            0.26,
        ).setOrigin(0.5, 0);
        const switcherPanel = this.scene.add.rectangle(
            panelX,
            deckSwitcherTop + deckSwitcherSectionHeight / 2 - 2,
            contentWidth - 20,
            deckSwitcherSectionHeight - 4,
            0x08111f,
            0.34,
        );
        switcherPanel.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.14);
        const selectorHeading = this.scene.add.text(selectorInnerLeft, deckSwitcherTop + 10, '切换本次带入卡组', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#cbd5e1',
            fontStyle: 'bold',
        });
        const selectorPositionBadge = this.scene.add.text(
            contentLeft + contentWidth - 18,
            deckSwitcherTop + 10,
            deckCarouselSummary.positionLabel,
            {
                fontFamily: 'Arial',
                fontSize: '10px',
                color: '#e2e8f0',
                fontStyle: 'bold',
                backgroundColor: '#1e293b',
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        ).setOrigin(1, 0);
        const selectorRosterLabel = this.scene.add.text(
            selectorInnerLeft,
            selectorHeading.y + selectorHeading.height + 6,
            '卡组序列',
            {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#94a3b8',
                fontStyle: 'bold',
            },
        );
        const selectorRosterSummary = this.scene.add.text(
            selectorInnerLeft,
            selectorRosterLabel.y + selectorRosterLabel.height + 4,
            deckCarouselSummary.rosterSummaryLine,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: '#cbd5e1',
                lineSpacing: 3,
                wordWrap: { width: selectorInnerWidth },
            },
        );
        const carouselProgressText = this.scene.add.text(
            selectorInnerLeft,
            selectorRosterSummary.y + selectorRosterSummary.height + 6,
            '',
            {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: this.maxScrollX > 0 ? '#c4b5fd' : '#94a3b8',
                lineSpacing: 3,
                wordWrap: { width: selectorInnerWidth },
            },
        );
        const carouselProgressTrack = this.scene.add.rectangle(
            selectorInnerLeft,
            carouselProgressText.y + carouselProgressText.height + 8,
            selectorInnerWidth,
            4,
            0x1e293b,
            1,
        ).setOrigin(0, 0.5);
        const carouselProgressFill = this.scene.add.rectangle(
            selectorInnerLeft,
            carouselProgressTrack.y,
            selectorInnerWidth,
            4,
            selectedLoadoutColors.accentColor,
            1,
        ).setOrigin(0, 0.5);
        carouselProgressFill.setScale(0, 1);
        this.deckCarouselWayfinding = {
            progressFill: carouselProgressFill,
            progressText: carouselProgressText,
            progressTrackX: selectorInnerLeft,
            progressTrackWidth: selectorInnerWidth,
            deckCount: this.stash.savedDecks.length,
            viewportWidth: selectorInnerWidth,
            slotWidth: DECK_CARD_WIDTH + DECK_CARD_GAP,
        };
        const deckCardRow = this.createDeckCardRow(
            selectorInnerLeft,
            carouselProgressTrack.y + 12,
            selectorInnerWidth,
            selectedDeckId,
            deckCardHeight,
            options.initialScrollX,
        );
        const deckSwitcherContainer = this.scene.add.container(0, 0, [
            switcherDivider,
            switcherPanel,
            selectorHeading,
            selectorPositionBadge,
            selectorRosterLabel,
            selectorRosterSummary,
            carouselProgressText,
            carouselProgressTrack,
            carouselProgressFill,
            ...deckCardRow.elements,
        ]);
        const readinessHeroContainer = this.scene.add.container(0, 0, [
            heroGlow,
            heroCard,
            heroAccent,
            heroSummaryContainer,
            actionContainer,
            deckSwitcherContainer,
        ]);

        const detailHeading = this.scene.add.text(contentLeft + 18, detailSectionTop + 18, '本次携带一览', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#cbd5e1',
            fontStyle: 'bold',
        });
        const detailBadge = this.scene.add.text(
            contentLeft + contentWidth - 18,
            detailSectionTop + 18,
            '带入舱单 · 补充明细',
            {
                fontFamily: 'Arial',
                fontSize: '10px',
                color: '#cbd5e1',
                fontStyle: 'bold',
                backgroundColor: '#1e293b',
                padding: { left: 10, right: 10, top: 4, bottom: 4 },
            },
        ).setOrigin(1, 0);
        const supportGlow = this.scene.add.rectangle(
            panelX,
            detailSectionTop + detailCardHeight / 2,
            contentWidth + 10,
            detailCardHeight + 8,
            0x020617,
            0.08,
        );
        supportGlow.setStrokeStyle(1, 0x334155, 0.22);
        const supportCard = this.scene.add.rectangle(
            panelX,
            detailSectionTop + detailCardHeight / 2,
            contentWidth,
            detailCardHeight,
            0x0b1220,
            0.94,
        );
        supportCard.setStrokeStyle(1, 0x334155, 0.62);
        const detailPanelTop = Math.max(
            detailHeading.y + detailHeading.height,
            detailBadge.y + detailBadge.height,
        ) + 10;
        const detailCompositionPanel = createManifestPanel(
            this.scene,
            contentLeft + 18,
            detailPanelTop,
            detailMetrics.panelWidth,
            detailMetrics.panelHeight,
            '构成速览',
            detailCompositionBody,
            {
                fillColor: 0x101b30,
                borderColor: 0x334155,
                titleColor: '#94a3b8',
                bodyColor: '#e2e8f0',
                badgeColor: selectedLoadoutColors.badgeColor,
                badgeBackgroundColor: selectedLoadoutColors.badgeBackgroundColor,
            },
            {
                badgeText: selectedLoadoutSummary.readinessLabel,
            },
        );
        const detailItemPanelLeft = contentLeft + 18 + detailMetrics.panelWidth + LOADOUT_MANIFEST_DECK_COLUMN_GAP;
        const detailItemsPanel = createManifestPanel(
            this.scene,
            detailItemPanelLeft,
            detailPanelTop,
            detailMetrics.panelWidth,
            detailMetrics.panelHeight,
            '物资封单',
            `携带道具 ${summary.itemCount} 件 · 灵石 ${summary.spiritStones} 枚
${itemPreviewText}`,
            {
                fillColor: 0x0d1b15,
                borderColor: 0x22c55e,
                titleColor: '#86efac',
                bodyColor: '#dcfce7',
            },
        );
        const detailFooter = this.scene.add.text(
            contentLeft + 18,
            detailSectionTop + detailCardHeight - 14,
            selectedLoadoutSummary.footer,
            {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: '#94a3b8',
                wordWrap: { width: contentWidth - 36 },
            },
        ).setOrigin(0, 1);
        const carriedReadinessContainer = this.scene.add.container(0, 0, [
            ...detailCompositionPanel,
            ...detailItemsPanel,
        ]);
        const selectedLoadoutSupportContainer = this.scene.add.container(0, 0, [
            supportGlow,
            supportCard,
            detailHeading,
            detailBadge,
            carriedReadinessContainer,
            detailFooter,
        ]);

        this.add([
            overlay,
            shadow,
            panel,
            panelAccent,
            title,
            subtitle,
            ...handoffElements,
            readinessHeroContainer,
            selectedLoadoutSupportContainer,
        ]);

        this.updateScrollIndicators();

        if (this.maxScrollX > 0) {
            this.setupScrollInteraction();
        }

        this.setDepth(1000);

        if (options.deckSwitchFeedback) {
            this.playDeckSwitchFeedback(options.deckSwitchFeedback, {
                selectedCard: deckCardRow.selectedCard,
                validationContainer: heroSummaryContainer,
                selectedLoadoutContainer: deckSwitcherContainer,
                carriedReadinessContainer,
                actionContainer,
                confirmButton: confirmButton.container,
                manageDeckButton: deckManagerButton.container,
                validationGlow: heroGlow,
                selectedLoadoutGlow: supportGlow,
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
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            });
            const emptyBody = this.scene.add.text(startX + 20, emptyTitle.y + 38, '请先点击“管理卡组”整理一套满足要求的卡组，再开始秘境探索。', {
                fontFamily: 'Arial',
                fontSize: '14px',
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
            const selection = this.scene.add.text(-cardWidth / 2 + 16, -cardHeight / 2 + 14, displayState.selectionLabel, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.selectionBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.selectionBadgeBackgroundColor,
                padding: { left: 7, right: 7, top: 4, bottom: 4 },
            });
            const status = this.scene.add.text(cardWidth / 2 - 16, -cardHeight / 2 + 14, displayState.statusLabel, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.statusBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.statusBadgeBackgroundColor,
                padding: { left: 7, right: 7, top: 4, bottom: 4 },
            }).setOrigin(1, 0);
            const deckName = this.scene.add.text(-cardWidth / 2 + 16, selection.y + 24, deck.name, {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: '#f8fafc',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 32 },
            });
            const countText = this.scene.add.text(
                -cardWidth / 2 + 16,
                deckName.y + deckName.height + 4,
                `${cardCount} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} · ${displayState.uniqueCardCount} 种卡`,
                {
                    fontFamily: 'Arial',
                    fontSize: '12px',
                    color: displayState.countColor,
                },
            );
            const chipAreaWidth = cardWidth - 32;
            const chipWidth = (chipAreaWidth - 6 * 2) / 3;
            const chipY = countText.y + 16;
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
                cardHeight / 2 - 14,
                cardWidth - 2,
                28,
                displayState.footerFillColor,
                0.95,
            );
            const comparisonTop = chipY + 18;
            const comparisonHeight = Math.max(42, footerBg.getTopCenter().y - comparisonTop - 8);
            const comparisonWidth = cardWidth - 32;
            const comparisonPanel = this.scene.add.rectangle(
                0,
                comparisonTop + comparisonHeight / 2,
                comparisonWidth,
                comparisonHeight,
                displayState.previewFillColor,
                0.96,
            );
            comparisonPanel.setStrokeStyle(1, displayState.previewBorderColor, 0.55);
            const comparisonLabel = this.scene.add.text(-cardWidth / 2 + 24, comparisonTop + 8, displayState.comparisonLabel, {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: displayState.previewLabelColor,
                fontStyle: 'bold',
            });
            const comparisonText = this.scene.add.text(
                -cardWidth / 2 + 24,
                comparisonLabel.y + 16,
                formatPreviewList(
                    [
                        displayState.focusSummaryLine,
                        ...displayState.compositionLines.map((line) => `• ${line}`),
                    ],
                    3,
                ),
                {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: displayState.previewTextColor,
                    wordWrap: { width: comparisonWidth - 20, useAdvancedWrap: true },
                    lineSpacing: 2,
                },
            );
            const footerText = this.scene.add.text(-cardWidth / 2 + 16, footerBg.y, displayState.footerText, {
                fontFamily: 'Arial',
                fontSize: '10px',
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

        if (this.deckCarouselWayfinding) {
            const {
                progressFill,
                progressText,
                progressTrackX,
                progressTrackWidth,
                deckCount,
                viewportWidth,
                slotWidth,
            } = this.deckCarouselWayfinding;
            const totalContentWidth = deckCount > 0
                ? deckCount * slotWidth - DECK_CARD_GAP
                : 0;
            const progressRatio = this.maxScrollX <= 1 ? 0 : Phaser.Math.Clamp(this.scrollX / this.maxScrollX, 0, 1);
            const thumbRatio = totalContentWidth > 0
                ? Phaser.Math.Clamp(viewportWidth / totalContentWidth, 0.14, 1)
                : 0;
            const thumbWidth = progressTrackWidth * thumbRatio;
            const thumbTravel = Math.max(0, progressTrackWidth - thumbWidth);
            const visibleStart = deckCount === 0
                ? 0
                : Math.min(deckCount, Math.floor(this.scrollX / slotWidth) + 1);
            const visibleEnd = deckCount === 0
                ? 0
                : Math.min(deckCount, Math.max(visibleStart, Math.ceil((this.scrollX + viewportWidth) / slotWidth)));

            progressFill.setScale(deckCount === 0 ? 0 : thumbRatio, 1);
            progressFill.setX(progressTrackX + thumbTravel * progressRatio);
            progressText.setColor(this.maxScrollX > 0 ? '#c4b5fd' : '#94a3b8');
            progressText.setText(deckCount === 0
                ? '暂无卡组可浏览 · 请先去管理卡组整理一套。'
                : this.maxScrollX > 0
                    ? `浏览进度 ${Math.round(progressRatio * 100)}% · 当前可见 ${visibleStart}-${visibleEnd} / ${deckCount} 套 · 拖动/滚轮/点按，或按 ← / → 切换当前带入`
                    : `全部卡组已展开 · 当前可见 ${visibleStart}-${visibleEnd} / ${deckCount} 套 · 点按卡片或按 ← / → 切换当前带入`);
        }
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.visible) {
            return;
        }

        const shortcut = getPreparationKeyboardShortcut(event);
        if (!shortcut) {
            return;
        }

        if (event.repeat && shortcut !== 'previous-deck' && shortcut !== 'next-deck') {
            return;
        }

        event.preventDefault();

        switch (shortcut) {
            case 'previous-deck':
                this.selectAdjacentDeck(-1);
                return;
            case 'next-deck':
                this.selectAdjacentDeck(1);
                return;
            case 'primary-action':
                this.triggerPrimaryAction();
                return;
            case 'manage':
                this.openDeckManager();
                return;
            default:
                return;
        }
    }

    private teardownKeyboardShortcuts(): void {
        if (this.keydownHandler) {
            this.scene.input.keyboard?.off('keydown', this.keydownHandler);
            this.keydownHandler = undefined;
        }
    }

    private selectAdjacentDeck(direction: -1 | 1): void {
        const nextDeckId = getAdjacentPreparationDeckId(
            this.stash.savedDecks,
            this.stash.selectedDeckId,
            direction,
        );

        if (!nextDeckId || nextDeckId === this.stash.selectedDeckId) {
            return;
        }

        this.onDeckSelect(nextDeckId);
    }

    private canConfirmLoadout(): boolean {
        return validateExpeditionLoadout(this.stash).valid;
    }

    private triggerPrimaryAction(): void {
        if (this.canConfirmLoadout()) {
            this.confirmLoadout();
            return;
        }

        this.openDeckManager();
    }

    private confirmLoadout(): void {
        if (!this.canConfirmLoadout()) {
            return;
        }

        this.onConfirm();
    }

    private openDeckManager(): void {
        this.onOpenDeckManager?.();
    }
}
