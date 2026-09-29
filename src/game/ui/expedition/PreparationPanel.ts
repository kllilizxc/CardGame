import { GameObjects, Scene } from 'phaser';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import { paginateReadableCopy } from '../../scenes/shared/readableCopyPages';

import {
    createPreparationDeckCarouselSummary,
    createPreparationDeckCardPreview,
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
import type { EntryPanelFrame, EntryPanelFrameProvider } from './EntryPanelFrame';
import {
    calculateDeckSwitcherHeight,
    calculateDeckCardHeight,
    calculatePreparationDecisionCardHeight,
    calculateLoadoutSupportStripHeight,
    calculateReadinessHeroHeight,
} from './PreparationPanelLayout';
import {
    getAdjacentPreparationDeckId,
    getPreparationKeyboardShortcut,
} from './preparationPanelKeyboard';
import { expeditionUiTheme } from '../common/expeditionUiTheme';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    onConfirm: () => void;
    onDeckSelect: (deckId: string) => void;
    onOpenDeckManager?: () => void;
    onOpenInventory?: () => void;
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

interface LoadoutSupportStripMetrics {
    bodyHeight: number;
    footerHeight: number;
    height: number;
}

const DECK_CARD_WIDTH = 224;
const DECK_CARD_GAP = 12;
const PANEL_MIN_HEIGHT = 640;
const PANEL_MAX_HEIGHT = 980;
const PANEL_MAX_HEIGHT_RATIO = 0.96;
const ACTION_BUTTON_COLUMN_WIDTH = 248;
const ACTION_BUTTON_PRIMARY_HEIGHT = 56;
const ACTION_BUTTON_SECONDARY_HEIGHT = 44;
const ACTION_BUTTON_GAP = 8;
const READY_SELECTED_FILL = 0x163028;
const READY_SELECTED_HOVER_FILL = 0x1e4033;
const READY_DETAIL_FILL = 0x11241d;
const READY_ACTION_FILL = 0x183026;
const READY_BADGE_BACKGROUND = '#365b47';
const NEUTRAL_BADGE_BACKGROUND = '#4c4436';

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

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

function formatInlinePreviewText(lines: string[], maxEntries: number): string {
    if (lines.length === 0) {
        return '无';
    }

    if (lines.length === 1 && lines[0] === '无') {
        return '无';
    }

    if (lines.length <= maxEntries) {
        return lines.join(' · ');
    }

    return `${lines.slice(0, maxEntries).join(' · ')} · …另 ${lines.length - maxEntries} 项`;
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

function truncateSingleLine(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
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
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
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
    const titleText = scene.add.text(left + 16, top + 14, title, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        color: colors.titleColor,
        fontStyle: 'bold',
    });
    const badge = options.badgeText
        ? scene.add.text(left + width - 16, top + 14, options.badgeText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '14px',
            color: colors.badgeColor ?? colors.bodyColor,
            fontStyle: 'bold',
            backgroundColor: colors.badgeBackgroundColor,
            padding: { left: 10, right: 10, top: 5, bottom: 5 },
        }).setOrigin(1, 0)
        : null;
    const bodyText = scene.add.text(left + 16, titleText.y + titleText.height + 8, body, {
        fontFamily: options.monospacedBody ? expeditionUiTheme.fonts.mono : expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        color: colors.bodyColor,
        lineSpacing: 6,
        wordWrap: { width: width - 32 },
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
        options.minHeight ?? 112,
        58 + measureTextHeight(scene, body, {
            fontFamily: options.monospacedBody ? expeditionUiTheme.fonts.mono : expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            lineSpacing: 6,
            wordWrap: { width: width - 32 },
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
    extraHeaderHeight = 0,
): ReadinessHeroMetrics {
    const textWidth = contentWidth - buttonColumnWidth - 44;
    const validationPanelWidth = textWidth;
    const deckNameHeight = measureTextHeight(scene, deckName, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '32px',
        fontStyle: 'bold',
        wordWrap: { width: textWidth },
    });
    const headlineHeight = measureTextHeight(scene, headline, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '22px',
        fontStyle: 'bold',
        wordWrap: { width: textWidth },
    });
    const detailHeight = measureTextHeight(scene, detail, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        lineSpacing: 6,
        wordWrap: { width: textWidth },
    });
    const sectionHeight = measureManifestPanelHeight(
        scene,
        readinessBody,
        validationPanelWidth,
        { minHeight: 124 },
    );
    const actionBodyHeight = measureTextHeight(scene, actionBody, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        lineSpacing: 6,
        wordWrap: { width: buttonColumnWidth - 24 },
    });
    const shortcutHintHeight = measureTextHeight(scene, shortcutHint, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        lineSpacing: 6,
        wordWrap: { width: buttonColumnWidth - 24 },
    });
    const headerHeight = 74
        + extraHeaderHeight
        + deckNameHeight
        + detailHeight
        + headlineHeight;
    const actionColumnHeight = 24
        + actionBodyHeight
        + 6
        + shortcutHintHeight
        + 12
        + ACTION_BUTTON_PRIMARY_HEIGHT
        + ACTION_BUTTON_GAP
        + ACTION_BUTTON_SECONDARY_HEIGHT
        + 10;

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

function getLoadoutSupportStripMetrics(
    scene: Scene,
    contentWidth: number,
    body: string,
    footer: string,
): LoadoutSupportStripMetrics {
    const bodyHeight = measureTextHeight(scene, body, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        lineSpacing: 6,
        wordWrap: { width: contentWidth - 36 },
    });
    const footerHeight = measureTextHeight(scene, footer, {
        fontFamily: expeditionUiTheme.fonts.ui,
        fontSize: '18px',
        lineSpacing: 6,
        wordWrap: { width: contentWidth - 36 },
    });

    return {
        bodyHeight,
        footerHeight,
        height: calculateLoadoutSupportStripHeight(bodyHeight, footerHeight),
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
    const selectionBadgeColor = isSelected ? '#f3ead3' : '#f3ead3';
    const selectionBadgeBackgroundColor = isSelected ? READY_BADGE_BACKGROUND : NEUTRAL_BADGE_BACKGROUND;
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
            footerText: '当前将按此出发。',
            fillColor: READY_SELECTED_FILL,
            hoverFillColor: READY_SELECTED_HOVER_FILL,
            borderColor: expeditionUiTheme.colors.goldSoft,
            accentColor: expeditionUiTheme.colors.jadeBright,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#f3ead3',
            statusBadgeBackgroundColor: '#166534',
            countColor: '#d9c6a2',
            previewLabelColor: '#e8d5ab',
            previewTextColor: '#eff6ff',
            previewFillColor: READY_DETAIL_FILL,
            previewBorderColor: expeditionUiTheme.colors.jade,
            chipFillColor: READY_DETAIL_FILL,
            chipBorderColor: expeditionUiTheme.colors.jadeBright,
            chipTextColor: '#f3ead3',
            footerFillColor: READY_DETAIL_FILL,
            footerTextColor: '#f3ead3',
            shadowColor: expeditionUiTheme.colors.jade,
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
            footerText: '点按切换为当前带入。',
            fillColor: 0x12201d,
            hoverFillColor: 0x163123,
            borderColor: 0x365314,
            accentColor: expeditionUiTheme.colors.jade,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#dcfce7',
            statusBadgeBackgroundColor: '#166534',
            countColor: '#e6f3ea',
            previewLabelColor: '#e6f3ea',
            previewTextColor: '#f0fdf4',
            previewFillColor: 0x0e1c17,
            previewBorderColor: 0x166534,
            chipFillColor: 0x0e1c17,
            chipBorderColor: expeditionUiTheme.colors.jade,
            chipTextColor: '#dcfce7',
            footerFillColor: 0x0e1c17,
            footerTextColor: '#dcfce7',
            shadowColor: expeditionUiTheme.colors.overlay,
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
            footerText: '点按切换后补足牌数。',
            fillColor: isSelected ? 0x372215 : 0x2f1d12,
            hoverFillColor: isSelected ? 0x46301e : 0x3b2416,
            borderColor: isSelected ? expeditionUiTheme.colors.goldSoft : expeditionUiTheme.colors.gold,
            accentColor: expeditionUiTheme.colors.gold,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#fef3c7',
            statusBadgeBackgroundColor: '#92400e',
            countColor: '#f6e2b1',
            previewLabelColor: '#fcd34d',
            previewTextColor: '#f3ead3',
            previewFillColor: 0x291d0e,
            previewBorderColor: 0xb45309,
            chipFillColor: 0x291d0e,
            chipBorderColor: expeditionUiTheme.colors.gold,
            chipTextColor: '#fef3c7',
            footerFillColor: 0x291d0e,
            footerTextColor: '#f6e2b1',
            shadowColor: isSelected ? expeditionUiTheme.colors.jade : expeditionUiTheme.colors.overlay,
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
            footerText: '点按切换后精简卡组。',
            fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
            hoverFillColor: isSelected ? 0x4c1d30 : 0x3a1822,
            borderColor: isSelected ? expeditionUiTheme.colors.goldSoft : 0xf87171,
            accentColor: expeditionUiTheme.colors.emberBright,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#f3d0c3',
            statusBadgeBackgroundColor: '#b91c1c',
            countColor: '#f3d0c3',
            previewLabelColor: '#f3d0c3',
            previewTextColor: '#fff1f2',
            previewFillColor: 0x29131b,
            previewBorderColor: 0x9f1239,
            chipFillColor: 0x29131b,
            chipBorderColor: expeditionUiTheme.colors.emberBright,
            chipTextColor: '#f3d0c3',
            footerFillColor: 0x29131b,
            footerTextColor: '#f3d0c3',
            shadowColor: isSelected ? expeditionUiTheme.colors.jade : expeditionUiTheme.colors.overlay,
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
        footerText: '点按切换后补齐缺牌。',
        fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
        hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
        borderColor: isSelected ? expeditionUiTheme.colors.goldSoft : 0xf87171,
        accentColor: expeditionUiTheme.colors.emberBright,
        selectionBadgeColor,
        selectionBadgeBackgroundColor,
        statusBadgeColor: '#f3d0c3',
        statusBadgeBackgroundColor: '#b91c1c',
        countColor: '#f3d0c3',
        previewLabelColor: '#f3d0c3',
        previewTextColor: '#fff1f2',
        previewFillColor: 0x29131b,
        previewBorderColor: 0x9f1239,
        chipFillColor: 0x29131b,
        chipBorderColor: expeditionUiTheme.colors.emberBright,
        chipTextColor: '#f3d0c3',
        footerFillColor: 0x29131b,
        footerTextColor: '#f3d0c3',
        shadowColor: isSelected ? expeditionUiTheme.colors.jade : expeditionUiTheme.colors.overlay,
        shadowAlpha: isSelected ? 0.22 : 0.18,
    };
}

function getSelectedLoadoutColors(
    summary: PreparationSelectedLoadoutSummary,
): SelectedLoadoutColors {
    switch (summary.readiness) {
        case 'ready':
            return {
                fillColor: READY_SELECTED_FILL,
                borderColor: expeditionUiTheme.colors.goldSoft,
                accentColor: expeditionUiTheme.colors.jadeBright,
                badgeColor: '#f3ead3',
                badgeBackgroundColor: READY_BADGE_BACKGROUND,
                headlineColor: '#f3ead3',
                detailColor: '#d9c6a2',
                mutedColor: '#e8d5ab',
            };
        case 'too-few-cards':
            return {
                fillColor: 0x31210f,
                borderColor: expeditionUiTheme.colors.gold,
                accentColor: expeditionUiTheme.colors.gold,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                headlineColor: '#f3ead3',
                detailColor: '#f6e2b1',
                mutedColor: '#fcd34d',
            };
        case 'too-many-cards':
        case 'insufficient-copies':
            return {
                fillColor: 0x311725,
                borderColor: expeditionUiTheme.colors.emberBright,
                accentColor: expeditionUiTheme.colors.ember,
                badgeColor: '#f3d0c3',
                badgeBackgroundColor: '#b91c1c',
                headlineColor: '#fff1f2',
                detailColor: '#f3d0c3',
                mutedColor: '#f3d0c3',
            };
        case 'none':
            return {
                fillColor: expeditionUiTheme.colors.panelInner,
                borderColor: 0x64748b,
                accentColor: 0x94a3b8,
                badgeColor: '#f3ead3',
                badgeBackgroundColor: NEUTRAL_BADGE_BACKGROUND,
                headlineColor: '#f3ead3',
                detailColor: '#d9c6a2',
                mutedColor: '#bca785',
            };
    }
}

function getActionHierarchyColors(
    summary: PreparationSelectedLoadoutSummary,
): ActionHierarchyColors {
    const inventoryDetail = `清单：${summary.deckCount} 张卡 · ${summary.uniqueCardCount} 种卡 · ${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石。`;

    switch (summary.readiness) {
        case 'ready':
            return {
                barFillColor: READY_ACTION_FILL,
                barBorderColor: expeditionUiTheme.colors.goldSoft,
                barAccentColor: expeditionUiTheme.colors.jadeBright,
                railLabel: '主操作',
                titleColor: '#f3ead3',
                summaryColor: '#d9c6a2',
                supportColor: '#e8d5ab',
                headline: `当前带入「${summary.selectedDeckName}」已通过出发校验`,
                detail: inventoryDetail,
                nextStepLabel: '现在可以直接确认带入并进入秘境。',
                shortcutHint: '快捷键：Enter 主操作 · M 管理卡组',
                stateBadgeLabel: '可出发',
                stateBadgeColor: '#f3ead3',
                stateBadgeBackgroundColor: READY_BADGE_BACKGROUND,
                primaryAction: 'confirm',
                confirmButtonLabel: '确认带入并出发',
                manageButtonLabel: '继续管理卡组',
                confirmButtonColors: {
                    fill: expeditionUiTheme.colors.jade,
                    hover: expeditionUiTheme.colors.jadeBright,
                    stroke: expeditionUiTheme.colors.goldSoft,
                    text: '#f3ead3',
                },
                manageButtonColors: {
                    fill: expeditionUiTheme.colors.panel,
                    hover: expeditionUiTheme.colors.panelInner,
                    stroke: expeditionUiTheme.colors.parchmentSoft,
                    text: '#f3ead3',
                },
                confirmGlowColor: expeditionUiTheme.colors.jadeBright,
                confirmGlowAlpha: 0.18,
                actionGlowColor: expeditionUiTheme.colors.jade,
                actionGlowAlpha: 0.08,
            };
        case 'too-few-cards': {
            const missingCards = Math.max(1, DECK_CARD_MIN - summary.deckCount);

            return {
                barFillColor: 0x23180d,
                barBorderColor: expeditionUiTheme.colors.gold,
                barAccentColor: expeditionUiTheme.colors.gold,
                railLabel: '主操作',
                titleColor: '#f3ead3',
                summaryColor: '#f6e2b1',
                supportColor: '#fcd34d',
                headline: `当前带入「${summary.selectedDeckName}」还差 ${missingCards} 张才能出发`,
                detail: inventoryDetail,
                nextStepLabel: `先把卡组补到 ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张，再回来确认。`,
                shortcutHint: '快捷键：Enter 主操作 · M 管理卡组',
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
                    text: '#f3ead3',
                },
                manageButtonColors: {
                    fill: 0xb45309,
                    hover: 0xd97706,
                    stroke: 0xfef3c7,
                    text: '#f3ead3',
                },
                confirmGlowColor: expeditionUiTheme.colors.gold,
                confirmGlowAlpha: 0,
                actionGlowColor: expeditionUiTheme.colors.gold,
                actionGlowAlpha: 0.1,
            };
        }
        case 'too-many-cards': {
            const extraCards = Math.max(1, summary.deckCount - DECK_CARD_MAX);

            return {
                barFillColor: 0x261320,
                barBorderColor: expeditionUiTheme.colors.emberBright,
                barAccentColor: expeditionUiTheme.colors.ember,
                railLabel: '主操作',
                titleColor: '#fff1f2',
                summaryColor: '#f3d0c3',
                supportColor: '#f3d0c3',
                headline: `当前带入「${summary.selectedDeckName}」超出上限 ${extraCards} 张`,
                detail: inventoryDetail,
                nextStepLabel: `先把卡组精简到 ${DECK_CARD_MAX} 张内，再回来确认。`,
                shortcutHint: '快捷键：Enter 主操作 · M 管理卡组',
                stateBadgeLabel: `超 ${extraCards} 张`,
                stateBadgeColor: '#f3d0c3',
                stateBadgeBackgroundColor: '#b91c1c',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组精简',
                confirmButtonColors: {
                    fill: 0x312330,
                    hover: 0x312330,
                    stroke: 0x7f1d1d,
                    text: '#f3ead3',
                },
                manageButtonColors: {
                    fill: 0xbe123c,
                    hover: 0xe11d48,
                    stroke: 0xfecdd3,
                    text: '#fff1f2',
                },
                confirmGlowColor: expeditionUiTheme.colors.emberBright,
                confirmGlowAlpha: 0,
                actionGlowColor: expeditionUiTheme.colors.ember,
                actionGlowAlpha: 0.1,
            };
        }
        case 'insufficient-copies':
            return {
                barFillColor: 0x261320,
                barBorderColor: expeditionUiTheme.colors.emberBright,
                barAccentColor: expeditionUiTheme.colors.ember,
                railLabel: '主操作',
                titleColor: '#fff1f2',
                summaryColor: '#f3d0c3',
                supportColor: '#f3d0c3',
                headline: `当前带入「${summary.selectedDeckName}」仍缺 ${Math.max(1, summary.shortageCardCopies)} 张库存卡`,
                detail: inventoryDetail,
                nextStepLabel: '先补齐缺牌库存，再回来确认。',
                shortcutHint: '快捷键：Enter 主操作 · M 管理卡组',
                stateBadgeLabel: `缺 ${Math.max(1, summary.shortageCardCopies)} 张`,
                stateBadgeColor: '#f3d0c3',
                stateBadgeBackgroundColor: '#b91c1c',
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组补齐',
                confirmButtonColors: {
                    fill: 0x312330,
                    hover: 0x312330,
                    stroke: 0x7f1d1d,
                    text: '#f3ead3',
                },
                manageButtonColors: {
                    fill: 0xbe123c,
                    hover: 0xe11d48,
                    stroke: 0xfecdd3,
                    text: '#fff1f2',
                },
                confirmGlowColor: expeditionUiTheme.colors.emberBright,
                confirmGlowAlpha: 0,
                actionGlowColor: expeditionUiTheme.colors.ember,
                actionGlowAlpha: 0.1,
            };
        case 'none':
            return {
                barFillColor: expeditionUiTheme.colors.panelInner,
                barBorderColor: expeditionUiTheme.colors.slate,
                barAccentColor: 0x64748b,
                railLabel: '主操作',
                titleColor: '#f3ead3',
                summaryColor: '#d9c6a2',
                supportColor: '#bca785',
                headline: '尚未选定本次带入卡组',
                detail: `当前随行物资：${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石。`,
                nextStepLabel: '先去管理卡组创建或选定一套带入。',
                shortcutHint: '快捷键：Enter 主操作 · M 管理卡组',
                stateBadgeLabel: '待选卡组',
                stateBadgeColor: '#f3ead3',
                stateBadgeBackgroundColor: NEUTRAL_BADGE_BACKGROUND,
                primaryAction: 'manage',
                confirmButtonLabel: '暂不可确认带入',
                manageButtonLabel: '去管理卡组选择',
                confirmButtonColors: {
                    fill: expeditionUiTheme.colors.slate,
                    hover: expeditionUiTheme.colors.slate,
                    stroke: expeditionUiTheme.colors.parchmentSoft,
                    text: '#f3ead3',
                },
                manageButtonColors: {
                    fill: expeditionUiTheme.colors.panelInner,
                    hover: expeditionUiTheme.colors.slate,
                    stroke: expeditionUiTheme.colors.parchmentSoft,
                    text: '#f3ead3',
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
        fontFamily: expeditionUiTheme.fonts.ui,
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

function getDeckHandoffBannerColors(
    tone: PreparationDeckHandoffSummary['tone'],
): DeckHandoffBannerColors {
    switch (tone) {
        case 'positive':
            return {
                fillColor: 0x10261d,
                borderColor: expeditionUiTheme.colors.jade,
                badgeColor: '#dcfce7',
                badgeBackgroundColor: '#166534',
                detailColor: '#e6f3ea',
            };
        case 'warning':
            return {
                fillColor: 0x2a1420,
                borderColor: expeditionUiTheme.colors.gold,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                detailColor: '#f6e2b1',
            };
        case 'neutral':
            return {
                fillColor: expeditionUiTheme.colors.panelInner,
                borderColor: 0x64748b,
                badgeColor: '#f3ead3',
                badgeBackgroundColor: NEUTRAL_BADGE_BACKGROUND,
                detailColor: '#d9c6a2',
            };
    }
}

export class PreparationPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly metadata?: CardMetadataMap;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private readonly onOpenInventory?: () => void;
    private deckHandoffSummary?: PreparationDeckHandoffSummary | null;
    private panelFrame: EntryPanelFrame | null = null;
    private portraitInfoPage = 0;

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
        this.onOpenInventory = config.onOpenInventory;
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
        this.portraitInfoPage = 0;
        this.renderPanel({
            deckSwitchFeedback,
            initialScrollX: this.scrollX,
        });
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    private renderPortraitPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = width - 40;
        const panelHeight = 800;
        const panelX = width / 2;
        const panelY = 550;
        const panelTop = panelY - panelHeight / 2;
        const contentWidth = panelWidth - 56;
        const selected = getSelectedSavedDeck(this.stash);
        const selectedIndex = this.stash.savedDecks.findIndex(deck => deck.id === selected?.id);
        const summary = createPreparationSelectedLoadoutSummary(this.stash, this.metadata);
        const validation = validateExpeditionLoadout(this.stash);
        const infoCopy = (validation.valid
            ? [summary.detail, ...summary.readinessChecklistLines]
            : formatPreparationValidationLines(validation, this.metadata)).join('\n') || '请选择一套可带入的卡组。';
        const infoPages = paginateReadableCopy(infoCopy, 70);
        this.portraitInfoPage = Math.min(this.portraitInfoPage, infoPages.length - 1);
        this.panelFrame = { panelX, panelY, panelWidth, panelHeight };

        const overlay = this.scene.add.rectangle(panelX, height / 2, width, height, 0x030712, 0.8);
        const shadow = this.scene.add.rectangle(panelX + 5, panelY + 8, panelWidth, panelHeight,
            expeditionUiTheme.colors.overlay, 0.5);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight,
            expeditionUiTheme.colors.panel, 0.98);
        panel.setStrokeStyle(3, expeditionUiTheme.colors.goldSoft, 0.82);
        const accent = this.scene.add.rectangle(panelX, panelTop + 7, panelWidth - 28, 6,
            expeditionUiTheme.colors.gold, 0.9);
        const title = this.scene.add.text(panelX, 196, '出发前确认', {
            fontFamily: expeditionUiTheme.fonts.display, fontSize: '32px', color: '#f3ead3',
        }).setOrigin(0.5);
        const subtitle = this.scene.add.text(panelX, 240, '选定卡组，核对随行物资。', {
            fontFamily: expeditionUiTheme.fonts.body, fontSize: '19px', color: '#d9c6a2',
        }).setOrigin(0.5);
        const deckPlate = this.scene.add.rectangle(panelX, 364, panelWidth - 28, 190,
            expeditionUiTheme.colors.panelInner, 0.95);
        deckPlate.setStrokeStyle(1, validation.valid ? expeditionUiTheme.colors.jadeBright : expeditionUiTheme.colors.goldSoft, 0.72);
        const deckLabel = this.scene.add.text(52, 289, '当前带入卡组', {
            fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px', color: '#bca785',
        });
        const deckName = this.scene.add.text(panelX, 335, selected?.name ?? '尚未选择卡组', {
            fontFamily: expeditionUiTheme.fonts.display, fontSize: '26px', color: '#f3ead3',
            align: 'center', wordWrap: { width: contentWidth },
        }).setOrigin(0.5);
        const deckCount = this.scene.add.text(panelX, 391,
            `${summary.deckCount} 张卡 · ${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石`, {
                fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px', color: '#d9c6a2',
                align: 'center', wordWrap: { width: contentWidth },
            }).setOrigin(0.5);
        const readiness = this.scene.add.text(panelX, 429,
            validation.valid ? '可以直接出发' : summary.readinessLabel, {
                fontFamily: expeditionUiTheme.fonts.ui, fontSize: '20px', fontStyle: 'bold',
                color: validation.valid ? '#b7f1cf' : '#f6e2b1',
                align: 'center', wordWrap: { width: contentWidth },
            }).setOrigin(0.5);
        const switchLabel = this.scene.add.text(panelX, 487,
            this.stash.savedDecks.length
                ? `选择卡组 · ${Math.max(1, selectedIndex + 1)}/${this.stash.savedDecks.length}`
                : '暂无可选卡组', {
                fontFamily: expeditionUiTheme.fonts.ui, fontSize: '20px', color: '#f3ead3',
            }).setOrigin(0.5);
        const secondaryColors: ActionButtonColors = {
            fill: expeditionUiTheme.colors.slate, hover: expeditionUiTheme.colors.panelInner,
            stroke: expeditionUiTheme.colors.goldSoft, text: '#f3ead3',
        };
        const previousDeck = createActionButton(this.scene, 141, 552, 172, 58, '上一套', secondaryColors,
            () => this.selectAdjacentDeck(-1), this.stash.savedDecks.length > 1);
        const nextDeck = createActionButton(this.scene, width - 141, 552, 172, 58, '下一套', secondaryColors,
            () => this.selectAdjacentDeck(1), this.stash.savedDecks.length > 1);
        const infoPlate = this.scene.add.rectangle(panelX, 690, panelWidth - 28, 180,
            expeditionUiTheme.colors.panelInner, 0.94);
        infoPlate.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.56);
        const infoHeading = this.scene.add.text(52, 613,
            `准备说明 ${this.portraitInfoPage + 1}/${infoPages.length}`, {
                fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px', color: '#d9c6a2',
            });
        const infoBody = this.scene.add.text(52, 647, infoPages[this.portraitInfoPage]!, {
            fontFamily: expeditionUiTheme.fonts.body, fontSize: '18px', color: '#f3ead3',
            lineSpacing: 4, wordWrap: { width: contentWidth },
        });
        this.add([overlay, shadow, panel, accent, title, subtitle, deckPlate, deckLabel, deckName,
            deckCount, readiness, switchLabel, previousDeck.container, nextDeck.container,
            infoPlate, infoHeading, infoBody]);
        if (infoPages.length > 1) {
            const previousInfo = createActionButton(this.scene, 141, 753, 172, 42, '上一段', secondaryColors,
                () => { this.portraitInfoPage -= 1; this.renderPanel(); }, this.portraitInfoPage > 0);
            const nextInfo = createActionButton(this.scene, width - 141, 753, 172, 42, '下一段', secondaryColors,
                () => { this.portraitInfoPage += 1; this.renderPanel(); }, this.portraitInfoPage < infoPages.length - 1);
            this.add([previousInfo.container, nextInfo.container]);
        }
        const manage = createActionButton(this.scene, 141, 831, 172, 58, '管理卡组', secondaryColors,
            () => this.openDeckManager(), Boolean(this.onOpenDeckManager));
        const inventory = createActionButton(this.scene, width - 141, 831, 172, 58, '整理道具', secondaryColors,
            () => this.onOpenInventory?.(), Boolean(this.onOpenInventory));
        const confirm = createActionButton(this.scene, panelX, 910, panelWidth - 56, 68,
            '确认带入并出发', {
                fill: expeditionUiTheme.colors.jade, hover: expeditionUiTheme.colors.jadeBright,
                stroke: expeditionUiTheme.colors.goldSoft, text: '#f3ead3',
            }, () => this.confirmLoadout(), validation.valid);
        this.add([manage.container, inventory.container, confirm.container]);
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
        if (isPortraitGameViewport(width, height)) {
            this.renderPortraitPanel();
            return;
        }
        const panelWidth = Math.min(1040, width * 0.86);
        const panelX = width / 2;
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
            Math.max(232, Math.floor(contentWidth * 0.3)),
        );
        const selectorInnerWidth = contentWidth - 36;
        const preparationTitle = '出发前确认';
        const preparationSubtitle = '能出发就确认；不能就管理卡组。';
        const itemPreviewText = formatInlinePreviewText(selectedLoadoutSummary.itemPreviewLines, 2);
        const validationLines = formatPreparationValidationLines(validation, this.metadata);
        const validationChecklistBody = formatBulletLines(
            isDeckValid ? selectedLoadoutSummary.readinessChecklistLines : validationLines,
            2,
        );
        const loadoutSupportBody = [
            `卡组总览：${selectedLoadoutSummary.kindSummaryLine}`,
            selectedLoadoutSummary.issuePreviewLines.length > 0
                ? `阻塞摘要：${formatInlinePreviewText(selectedLoadoutSummary.issuePreviewLines, 2)}`
                : `物资封单：${itemPreviewText}`,
        ].join('\n');
        const loadoutSupportFooter = selectedLoadoutSummary.footer;
        const selectorSupportText = this.stash.savedDecks.length === 0
            ? '暂无候选卡组；先去管理卡组整理一套。'
            : deckCarouselSummary.invalidDeckCount > 0
                ? `候选 ${deckCarouselSummary.readyDeckCount} 套可带入 · ${deckCarouselSummary.invalidDeckCount} 套需调整`
                : `候选 ${deckCarouselSummary.readyDeckCount} 套都可直接带入`;
        const carouselProgressMeasurementText = this.stash.savedDecks.length === 0
            ? '浏览进度 0% · 按 M 去管理卡组'
            : this.stash.savedDecks.length > 3
                ? `浏览进度 100% · 可见 1-${Math.min(this.stash.savedDecks.length, 4)} / ${this.stash.savedDecks.length} 套 · 拖动/滚轮/← → 切换`
                : `浏览进度 100% · 当前 1-${this.stash.savedDecks.length} / ${this.stash.savedDecks.length} 套 · 点按或按 ← / → 切换`;
        const heroDetailText = selectedLoadoutSummary.detail;
        const actionSummaryLabel = '下一步';
        const actionSummaryText = actionColors.nextStepLabel.replace(/^下一步：/, '');
        const subtitleHeight = measureTextHeight(
            this.scene,
            preparationSubtitle,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                wordWrap: { width: contentWidth - buttonColumnWidth - 48 },
            },
        );
        const handoffDetailHeight = this.deckHandoffSummary
            ? measureTextHeight(this.scene, this.deckHandoffSummary.detail, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                wordWrap: { width: contentWidth - buttonColumnWidth - 72 },
                lineSpacing: 6,
            })
            : 0;
        const handoffBannerHeight = this.deckHandoffSummary
            ? Math.max(76, 28 + handoffDetailHeight + 16)
            : 0;
        const heroLeadHeight = subtitleHeight + 8 + (handoffBannerHeight > 0 ? handoffBannerHeight + 8 : 0);
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
            heroLeadHeight,
        );
        const loadoutStripMetrics = getLoadoutSupportStripMetrics(
            this.scene,
            contentWidth,
            loadoutSupportBody,
            loadoutSupportFooter,
        );
        const decisionCardHeight = calculatePreparationDecisionCardHeight(
            heroMetrics.height,
            loadoutStripMetrics.height,
        );
        const deckCardHeight = getDeckCardHeight(this.scene, this.stash.savedDecks);
        const selectorHeadingHeight = measureTextHeight(this.scene, '改用其他卡组', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            fontStyle: 'bold',
        });
        const selectorSupportHeight = measureTextHeight(this.scene, selectorSupportText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            lineSpacing: 6,
            wordWrap: { width: selectorInnerWidth },
        });
        const selectorProgressHeight = measureTextHeight(this.scene, carouselProgressMeasurementText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            lineSpacing: 6,
            wordWrap: { width: selectorInnerWidth },
        });
        const deckSwitcherSectionHeaderHeight = Math.max(selectorHeadingHeight, 24)
            + 8
            + selectorSupportHeight
            + 8
            + selectorProgressHeight
            + 10;
        const deckSwitcherSectionHeight = calculateDeckSwitcherHeight(
            deckSwitcherSectionHeaderHeight,
            deckCardHeight,
        );
        const preflightTopOffset = 30;
        const panelHeight = Math.min(
            Math.max(PANEL_MIN_HEIGHT, preflightTopOffset + decisionCardHeight + 10 + deckSwitcherSectionHeight + 24),
            Math.min(PANEL_MAX_HEIGHT, Math.floor(height * PANEL_MAX_HEIGHT_RATIO)),
        );
        const panelY = height / 2 + (panelHeight > 760 ? 6 : 12);
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentLeft = panelLeft + 48;
        const readinessHeroTop = panelTop + preflightTopOffset;
        const loadoutStripTop = readinessHeroTop + decisionCardHeight - loadoutStripMetrics.height - 10;
        const deckSwitcherTop = readinessHeroTop + decisionCardHeight + 10;
        this.panelFrame = {
            panelX,
            panelY,
            panelWidth,
            panelHeight,
        };

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x030712, 0.8);
        const shadow = this.scene.add.rectangle(panelX, panelY + 12, panelWidth + 16, panelHeight + 16, expeditionUiTheme.colors.overlay, 0.42);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, expeditionUiTheme.colors.panel, 0.98);
        panel.setStrokeStyle(3, expeditionUiTheme.colors.goldSoft, 0.82);
        const panelAccent = this.scene.add.rectangle(panelX, panelTop + 6, panelWidth - 36, 6, expeditionUiTheme.colors.gold, 0.96).setOrigin(0.5, 0);
        const handoffSummary = this.deckHandoffSummary;

        const heroInnerLeft = contentLeft + 18;
        const heroButtonLeft = contentLeft + contentWidth - buttonColumnWidth - 20;
        const heroGlow = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + decisionCardHeight / 2,
            contentWidth + 12,
            decisionCardHeight + 10,
            selectedLoadoutColors.accentColor,
            selectedLoadoutSummary.readiness === 'ready' ? 0.08 : 0.12,
        );
        const heroCard = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + decisionCardHeight / 2,
            contentWidth,
            decisionCardHeight,
            selectedLoadoutColors.fillColor,
            0.98,
        );
        heroCard.setStrokeStyle(2, selectedLoadoutColors.borderColor, 0.92);
        const heroAccent = this.scene.add.rectangle(
            panelX,
            readinessHeroTop + 4,
            contentWidth - 16,
            4,
            selectedLoadoutColors.accentColor,
            1,
        ).setOrigin(0.5, 0);
        const heroRailLabel = this.scene.add.text(heroInnerLeft, readinessHeroTop + 16, preparationTitle, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: actionColors.supportColor,
            fontStyle: 'bold',
        });
        const heroStateBadge = this.scene.add.text(
            heroButtonLeft - 12,
            readinessHeroTop + 12,
            actionColors.stateBadgeLabel,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: actionColors.stateBadgeColor,
                fontStyle: 'bold',
                backgroundColor: actionColors.stateBadgeBackgroundColor,
                padding: { left: 12, right: 12, top: 6, bottom: 6 },
            },
        ).setOrigin(1, 0);
        const heroIntro = this.scene.add.text(heroInnerLeft, heroRailLabel.y + heroRailLabel.height + 4, preparationSubtitle, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroHandoffElements: Phaser.GameObjects.GameObject[] = [];
        let heroBodyTop = heroIntro.y + heroIntro.height + 10;

        if (handoffSummary) {
            const bannerColors = getDeckHandoffBannerColors(handoffSummary.tone);
            const compactBanner = this.scene.add.rectangle(
                heroInnerLeft + heroMetrics.textWidth / 2,
                heroBodyTop + handoffBannerHeight / 2,
                heroMetrics.textWidth,
                handoffBannerHeight,
                bannerColors.fillColor,
                0.46,
            ).setOrigin(0.5, 0.5);
            compactBanner.setStrokeStyle(1, bannerColors.borderColor, 0.54);
            const compactBannerTitle = this.scene.add.text(heroInnerLeft + 12, heroBodyTop + 8, handoffSummary.title, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '14px',
                color: bannerColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: bannerColors.badgeBackgroundColor,
                padding: { left: 10, right: 10, top: 4, bottom: 4 },
            });
            const compactBannerDetail = this.scene.add.text(heroInnerLeft + 12, compactBannerTitle.y + compactBannerTitle.height + 4, handoffSummary.detail, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: bannerColors.detailColor,
                wordWrap: { width: heroMetrics.textWidth - 24 },
                lineSpacing: 6,
            });

            heroBodyTop += handoffBannerHeight + 10;
            heroHandoffElements.push(compactBanner, compactBannerTitle, compactBannerDetail);
        }

        const heroDeckLabel = this.scene.add.text(heroInnerLeft, heroBodyTop, '当前带入', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const heroDeckName = this.scene.add.text(heroInnerLeft, heroDeckLabel.y + heroDeckLabel.height + 8, selectedLoadoutSummary.selectedDeckName, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '32px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroHeadline = this.scene.add.text(heroInnerLeft, heroDeckName.y + heroDeckName.height + 8, selectedLoadoutSummary.headline, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '22px',
            color: actionColors.titleColor,
            fontStyle: 'bold',
            wordWrap: { width: heroMetrics.textWidth },
        });
        const heroDetail = this.scene.add.text(heroInnerLeft, heroHeadline.y + heroHeadline.height + 6, heroDetailText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: actionColors.summaryColor,
            lineSpacing: 6,
            wordWrap: { width: heroMetrics.textWidth },
        });
        const readinessPanelTop = heroDetail.y + heroDetail.height + 12;
        const readinessPanel = createManifestPanel(
            this.scene,
            heroInnerLeft,
            readinessPanelTop,
            heroMetrics.validationPanelWidth,
            heroMetrics.sectionHeight,
            selectedLoadoutSummary.issuePreviewLines.length > 0 ? '当前阻塞' : '已核对',
            validationChecklistBody,
            {
                fillColor: selectedLoadoutSummary.readiness === 'ready' ? READY_DETAIL_FILL : 0x29131b,
                borderColor: selectedLoadoutSummary.readiness === 'ready' ? expeditionUiTheme.colors.jadeBright : selectedLoadoutColors.borderColor,
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
            heroIntro,
            ...heroHandoffElements,
            heroDeckLabel,
            heroDeckName,
            heroHeadline,
            heroDetail,
            ...readinessPanel,
        ]);

        const actionGlow = this.scene.add.rectangle(
            heroButtonLeft + buttonColumnWidth / 2,
            readinessHeroTop + heroMetrics.height / 2,
            buttonColumnWidth + 18,
            heroMetrics.height - 24,
            actionColors.actionGlowColor,
            actionColors.actionGlowAlpha,
        );
        const actionColumnPlate = this.scene.add.rectangle(
            heroButtonLeft + buttonColumnWidth / 2,
            readinessHeroTop + heroMetrics.height / 2,
            buttonColumnWidth,
            heroMetrics.height - 36,
            actionColors.barFillColor,
            0.28,
        );
        actionColumnPlate.setStrokeStyle(1, actionColors.barBorderColor, 0.24);
        const actionDivider = this.scene.add.rectangle(
            heroButtonLeft - 10,
            readinessHeroTop + heroMetrics.height / 2,
            1,
            heroMetrics.height - 42,
            actionColors.barBorderColor,
            0.36,
        ).setOrigin(0.5, 0.5);
        const actionSlotLabel = this.scene.add.text(heroButtonLeft, readinessHeroTop + 18, actionColors.railLabel, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: actionColors.supportColor,
            fontStyle: 'bold',
        });
        const actionSummaryHeading = this.scene.add.text(heroButtonLeft, actionSlotLabel.y + actionSlotLabel.height + 8, actionSummaryLabel, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: selectedLoadoutSummary.readiness === 'ready' ? '#d9c6a2' : '#fcd34d',
            fontStyle: 'bold',
        });
        const actionSummary = this.scene.add.text(heroButtonLeft, actionSummaryHeading.y + actionSummaryHeading.height + 8, actionSummaryText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: actionColors.summaryColor,
            lineSpacing: 6,
            wordWrap: { width: buttonColumnWidth - 24 },
        });
        const actionShortcutHint = this.scene.add.text(heroButtonLeft, actionSummary.y + actionSummary.height + 8, actionColors.shortcutHint, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: actionColors.supportColor,
            lineSpacing: 6,
            wordWrap: { width: buttonColumnWidth - 24 },
        });
        const buttonStackHeight = ACTION_BUTTON_PRIMARY_HEIGHT + ACTION_BUTTON_GAP + ACTION_BUTTON_SECONDARY_HEIGHT;
        const buttonStackTop = Math.max(
            actionShortcutHint.y + actionShortcutHint.height + 12,
            readinessHeroTop + heroMetrics.height - 16 - buttonStackHeight,
        );
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
            actionColumnPlate,
            actionDivider,
            actionSlotLabel,
            actionSummaryHeading,
            actionSummary,
            actionShortcutHint,
            deckManagerButton.container,
            confirmGlow,
            confirmButton.container,
        ]);

        const selectorInnerLeft = contentLeft + 18;
        const loadoutDivider = this.scene.add.rectangle(
            panelX,
            loadoutStripTop - 4,
            contentWidth - 28,
            1,
            selectedLoadoutColors.borderColor,
            0.18,
        ).setOrigin(0.5, 0);
        const loadoutSummaryGlow = this.scene.add.rectangle(
            panelX,
            loadoutStripTop + loadoutStripMetrics.height / 2,
            contentWidth - 8,
            loadoutStripMetrics.height + 4,
            selectedLoadoutColors.accentColor,
            0.05,
        );
        loadoutSummaryGlow.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.06);
        const loadoutSummaryCard = this.scene.add.rectangle(
            panelX,
            loadoutStripTop + loadoutStripMetrics.height / 2,
            contentWidth - 20,
            loadoutStripMetrics.height,
            expeditionUiTheme.colors.ink,
            0.5,
        );
        loadoutSummaryCard.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.1);
        const loadoutSummaryHeading = this.scene.add.text(contentLeft + 18, loadoutStripTop + 10, '带入清单', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: selectedLoadoutColors.mutedColor,
            fontStyle: 'bold',
        });
        const inventoryAction = this.onOpenInventory ? this.scene.add.text(contentLeft + 128, loadoutStripTop + 10, '整理道具', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d8c08b',
            fontStyle: 'bold',
        }).setInteractive({ useHandCursor: true }) : null;
        inventoryAction?.on('pointerover', () => inventoryAction.setColor('#f3ead3'));
        inventoryAction?.on('pointerout', () => inventoryAction.setColor('#d8c08b'));
        inventoryAction?.on('pointerdown', () => this.onOpenInventory?.());
        const loadoutSummaryBadge = this.scene.add.text(
            contentLeft + contentWidth - 18,
            loadoutStripTop + 10,
            `物资：${selectedLoadoutSummary.itemCount} 件道具 · 灵石 ${selectedLoadoutSummary.spiritStones} 枚`,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '16px',
                color: selectedLoadoutColors.mutedColor,
            },
        ).setOrigin(1, 0);
        const loadoutSummaryBodyTop = Math.max(
            loadoutSummaryHeading.y + loadoutSummaryHeading.height,
            loadoutSummaryBadge.y + loadoutSummaryBadge.height,
        ) + 6;
        const loadoutSummaryBodyText = this.scene.add.text(
            contentLeft + 18,
            loadoutSummaryBodyTop,
            loadoutSupportBody,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f3ead3',
                lineSpacing: 6,
                wordWrap: { width: contentWidth - 36 },
            },
        );
        const loadoutSummaryFooter = this.scene.add.text(
            contentLeft + 18,
            loadoutStripTop + loadoutStripMetrics.height - 10,
            loadoutSupportFooter,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                lineSpacing: 6,
                wordWrap: { width: contentWidth - 36 },
            },
        ).setOrigin(0, 1);
        const loadoutSummaryContainer = this.scene.add.container(0, 0, [
            loadoutDivider,
            loadoutSummaryGlow,
            loadoutSummaryCard,
            loadoutSummaryHeading,
            ...(inventoryAction ? [inventoryAction] : []),
            loadoutSummaryBadge,
            loadoutSummaryBodyText,
            loadoutSummaryFooter,
        ]);

        const switcherPanel = this.scene.add.rectangle(
            panelX,
            deckSwitcherTop + deckSwitcherSectionHeight / 2,
            contentWidth - 28,
            deckSwitcherSectionHeight,
            expeditionUiTheme.colors.ink,
            0.44,
        );
        switcherPanel.setStrokeStyle(1, selectedLoadoutColors.borderColor, 0.1);
        const switcherAccent = this.scene.add.rectangle(
            panelX,
            deckSwitcherTop + 4,
            contentWidth - 42,
            3,
            selectedLoadoutColors.accentColor,
            0.6,
        ).setOrigin(0.5, 0);
        const selectorHeading = this.scene.add.text(selectorInnerLeft, deckSwitcherTop + 10, '改用其他卡组', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            fontStyle: 'bold',
        });
        const selectorPositionBadge = this.scene.add.text(
            contentLeft + contentWidth - 18,
            deckSwitcherTop + 6,
            deckCarouselSummary.positionLabel,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '16px',
                color: '#f3ead3',
                fontStyle: 'bold',
                backgroundColor: '#0f172a',
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        ).setOrigin(1, 0);
        const selectorSupportSummary = this.scene.add.text(
            selectorInnerLeft,
            selectorHeading.y + selectorHeading.height + 4,
            selectorSupportText,
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#64748b',
                lineSpacing: 6,
                wordWrap: { width: selectorInnerWidth },
            },
        );
        const carouselProgressText = this.scene.add.text(
            selectorInnerLeft,
            selectorSupportSummary.y + selectorSupportSummary.height + 4,
            '',
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: this.maxScrollX > 0 ? '#d3b27b' : '#bca785',
                lineSpacing: 6,
                wordWrap: { width: selectorInnerWidth },
            },
        );
        const carouselProgressTrack = this.scene.add.rectangle(
            selectorInnerLeft,
            carouselProgressText.y + carouselProgressText.height + 4,
            selectorInnerWidth,
            6,
            expeditionUiTheme.colors.panelInner,
            0.72,
        ).setOrigin(0, 0.5);
        const carouselProgressFill = this.scene.add.rectangle(
            selectorInnerLeft,
            carouselProgressTrack.y,
            selectorInnerWidth,
            6,
            selectedLoadoutColors.accentColor,
            0.92,
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
            carouselProgressTrack.y + 8,
            selectorInnerWidth,
            selectedDeckId,
            deckCardHeight,
            options.initialScrollX,
        );
        const deckSwitcherContainer = this.scene.add.container(0, 0, [
            switcherPanel,
            switcherAccent,
            selectorHeading,
            selectorPositionBadge,
            selectorSupportSummary,
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
            loadoutSummaryContainer,
            deckSwitcherContainer,
        ]);

        this.add([
            overlay,
            shadow,
            panel,
            panelAccent,
            readinessHeroContainer,
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
                carriedReadinessContainer: loadoutSummaryContainer,
                actionContainer,
                confirmButton: confirmButton.container,
                manageDeckButton: deckManagerButton.container,
                validationGlow: heroGlow,
                selectedLoadoutGlow: loadoutSummaryGlow,
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

            const emptyState = this.scene.add.rectangle(startX + maxWidth / 2, y + cardHeight / 2, maxWidth, cardHeight, expeditionUiTheme.colors.panelInner, 0.94);
            emptyState.setStrokeStyle(2, expeditionUiTheme.colors.slate, 0.82);
            const emptyTitle = this.scene.add.text(startX + 20, y + 20, '暂无可带入卡组', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '24px',
                color: '#f3ead3',
                fontStyle: 'bold',
            });
            const emptyBody = this.scene.add.text(startX + 20, emptyTitle.y + 38, '请先点击“管理卡组”整理一套满足要求的卡组，再开始秘境探索。', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
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
        const targetScrollX = Math.max(0, clampNumber(
            selectedDeckIndex * (cardWidth + cardGap) - (maxWidth - cardWidth) / 2,
            0,
            Math.max(0, totalContentWidth - maxWidth),
        ));

        this.maxScrollX = Math.max(0, totalContentWidth - maxWidth);
        this.scrollX = this.maxScrollX > 0
            ? clampNumber(initialScrollX ?? targetScrollX, 0, this.maxScrollX)
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
            const selectedLift = isSelected ? -4 : 0;
            const spotlight = isSelected
                ? this.scene.add.rectangle(0, 0, cardWidth + 12, cardHeight + 12, displayState.borderColor, 0.08)
                : undefined;
            const cardContainer = this.scene.add.container(cardX, cardY + selectedLift);
            const shadow = this.scene.add.rectangle(4, 6, cardWidth, cardHeight, displayState.shadowColor, displayState.shadowAlpha);
            spotlight?.setStrokeStyle(1, displayState.borderColor, 0.32);
            const bg = this.scene.add.rectangle(0, 0, cardWidth, cardHeight, displayState.fillColor, 0.98);
            bg.setStrokeStyle(isSelected ? 2 : 1, displayState.borderColor, isSelected ? 1 : 0.88);

            const accent = this.scene.add.rectangle(0, -cardHeight / 2 + 5, cardWidth - 12, 6, displayState.accentColor, 1).setOrigin(0.5, 0);
            const selection = this.scene.add.text(-cardWidth / 2 + 16, -cardHeight / 2 + 14, displayState.selectionLabel, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '14px',
                color: displayState.selectionBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.selectionBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            });
            const status = this.scene.add.text(cardWidth / 2 - 16, -cardHeight / 2 + 14, displayState.statusLabel, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '14px',
                color: displayState.statusBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.statusBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            }).setOrigin(1, 0);
            const deckName = this.scene.add.text(-cardWidth / 2 + 16, selection.y + selection.height + 10, deck.name, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f3ead3',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 32 },
            });
            const countText = this.scene.add.text(
                -cardWidth / 2 + 16,
                deckName.y + deckName.height + 8,
                `${cardCount} 张 · ${displayState.uniqueCardCount} 种卡`,
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: displayState.countColor,
                },
            );
            const statusNote = this.scene.add.text(
                -cardWidth / 2 + 16,
                countText.y + countText.height + 6,
                truncateSingleLine(displayState.comparisonLines[0] ?? displayState.focusSummaryLine, 17),
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: displayState.previewTextColor,
                    wordWrap: { width: cardWidth - 32, useAdvancedWrap: true },
                },
            );
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
                statusNote,
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
                    isSelected,
                    valid: displayState.valid,
                };
            }
        });

        if (needsScroll) {
            this.leftIndicator = this.scene.add.text(startX + 10, y + cardHeight / 2, '◀', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '20px',
                color: '#d3b27b',
                backgroundColor: '#111827',
                padding: { left: 8, right: 8, top: 8, bottom: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.leftIndicator.on('pointerdown', () => this.applyScroll(this.scrollX - (cardWidth + cardGap)));

            this.rightIndicator = this.scene.add.text(startX + maxWidth - 10, y + cardHeight / 2, '▶', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '20px',
                color: '#d3b27b',
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
                targets: refs.selectedCard.background,
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
        const clampedTarget = clampNumber(targetScrollX, 0, this.maxScrollX);

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

        this.scrollX = clampNumber(desired, 0, this.maxScrollX);
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
            const progressRatio = this.maxScrollX <= 1 ? 0 : clampNumber(this.scrollX / this.maxScrollX, 0, 1);
            const thumbRatio = totalContentWidth > 0
                ? clampNumber(viewportWidth / totalContentWidth, 0.14, 1)
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
            progressText.setColor(this.maxScrollX > 0 ? '#d3b27b' : '#bca785');
            progressText.setText(deckCount === 0
                ? '浏览进度 0% · 暂无卡组 · 请先去管理卡组整理一套。'
                : this.maxScrollX > 0
                    ? `浏览进度 ${Math.round(progressRatio * 100)}% · 可见 ${visibleStart}-${visibleEnd} / ${deckCount} 套 · 拖动/滚轮/← → 切换`
                    : `浏览进度 100% · 当前 ${visibleStart}-${visibleEnd} / ${deckCount} 套 · 点按或按 ← / → 切换`);
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
