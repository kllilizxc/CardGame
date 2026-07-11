import { GameObjects, Scene } from 'phaser';

import type { CardKind, CardRarity } from '@data/types/cards/core';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    computeCardCollectionViewModel,
    type CardCollectionFilters,
    type CardCollectionRow,
    type CardCollectionSortConfig,
    type CardCollectionSortField,
} from '../../state/CardCollectionViewModel';
import {
    addSavedDeckToStash,
    adjustDeckCardCount,
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    deleteSavedDeckFromStash,
    renameSavedDeckInStash,
    selectDeckInStash,
    summarizeDeckCapacity,
    updateSavedDeckInStash,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
    type DeckCapacitySummary as DeckCapacityMetrics,
} from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, PersistentStash, SavedDeck } from '../../types/expedition';
import {
    NativeTextEntryOverlay,
    insetNativeTextEntryRect,
    type NativeTextEntryRect,
} from '../common/NativeTextEntryOverlay';
import { expeditionUiTheme } from '../common/expeditionUiTheme';
import type { EntryPanelFrame, EntryPanelFrameProvider } from '../expedition/EntryPanelFrame';

export interface DeckManagementPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    initialKeyboardZone?: 'decks' | 'editor' | 'browser' | 'return';
    onStashChange: (stash: PersistentStash) => void;
    onClose: () => void;
}

const KIND_CYCLE: (CardKind | undefined)[] = [
    undefined,
    'unit',
    'artifact',
    'talisman',
    'field',
    'skill',
    'pill',
];

const KIND_LABEL: Record<string, string> = {
    undefined: '全部',
    unit: '生物',
    artifact: '神器',
    talisman: '护符',
    field: '场地',
    skill: '技能',
    pill: '丹药',
};

const DEFAULT_BROWSER_SORT_FIELD: CardCollectionSortField = 'id';
const DEFAULT_BROWSER_SORT_DIRECTION: 'asc' | 'desc' = 'asc';
const BROWSER_SORT_FIELDS: CardCollectionSortField[] = ['id', 'count', 'kind', 'name'];
const SORT_FIELD_LABEL: Record<CardCollectionSortField, string> = {
    id: '编号',
    count: '库存',
    kind: '种类',
    name: '名称',
};

const DECK_LIST_SUMMARY_HEIGHT = 128;
const DECK_ROW_HEIGHT = 110;
const EDITOR_ROW_HEIGHT = 120;
const EDITOR_TILE_GAP = 14;
const EDITOR_TILE_MIN_WIDTH = 240;
const BROWSER_ROW_HEIGHT = 120;
const COMPACT_EDITOR_BREAKPOINT = 980;
const PRIMARY_BUTTON_HEIGHT = 56;
const SECONDARY_BUTTON_HEIGHT = 44;
const SEARCH_FIELD_HEIGHT = 48;
const SCROLL_BUTTON_HEIGHT = 44;
const FOOTER_GUIDE_HEIGHT = 56;
const FOOTER_GUIDE_PILL_HEIGHT = 36;
const DECK_NAMING_TEXT_ENTRY_SESSION_ID = 'deck-name';
const DECK_SEARCH_TEXT_ENTRY_SESSION_ID = 'deck-search';

const PANEL_FILL = expeditionUiTheme.colors.panel;
const SECTION_FILL = expeditionUiTheme.colors.panelInner;
const SECTION_BORDER = expeditionUiTheme.colors.slate;
const PANEL_ACCENT = expeditionUiTheme.colors.gold;
const SELECTED_ACCENT = expeditionUiTheme.colors.goldSoft;
const VALID_ACCENT = expeditionUiTheme.colors.jade;
const WARNING_ACCENT = expeditionUiTheme.colors.gold;
const INVALID_ACCENT = expeditionUiTheme.colors.emberBright;
const PANEL_DEEP_FILL = blendColor(expeditionUiTheme.colors.panel, expeditionUiTheme.colors.ink, 0.32);
const PANEL_DEEPER_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.ink, 0.34);
const PANEL_SELECTED_FILL = blendColor(expeditionUiTheme.colors.panel, expeditionUiTheme.colors.jade, 0.2);
const PANEL_SELECTED_HOVER_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.jadeBright, 0.16);
const PANEL_ATTENTION_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.gold, 0.2);
const PANEL_ATTENTION_HOVER_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.goldSoft, 0.16);
const PANEL_INPUT_ACTIVE_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.jade, 0.18);
const PANEL_INPUT_FILLED_FILL = blendColor(expeditionUiTheme.colors.panel, expeditionUiTheme.colors.jade, 0.08);
const BUTTON_NEUTRAL_FILL = blendColor(expeditionUiTheme.colors.panel, expeditionUiTheme.colors.ink, 0.24);
const BUTTON_NEUTRAL_HOVER_FILL = blendColor(expeditionUiTheme.colors.panelInner, expeditionUiTheme.colors.ink, 0.12);
const BUTTON_PRIMARY_FILL = blendColor(expeditionUiTheme.colors.jade, expeditionUiTheme.colors.ink, 0.18);
const BUTTON_PRIMARY_HOVER_FILL = blendColor(expeditionUiTheme.colors.jadeBright, expeditionUiTheme.colors.ink, 0.08);
const BUTTON_ACCENT_FILL = blendColor(expeditionUiTheme.colors.gold, expeditionUiTheme.colors.ink, 0.34);
const BUTTON_ACCENT_HOVER_FILL = blendColor(expeditionUiTheme.colors.goldSoft, expeditionUiTheme.colors.ink, 0.26);

const KIND_GLYPHS: Record<string, string> = {
    unit: '灵',
    artifact: '器',
    talisman: '符',
    field: '阵',
    skill: '诀',
    pill: '丹',
    unknown: '览',
};

const RARITY_LABEL: Record<string, string> = {
    common: '普通',
    uncommon: '少见',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说',
};

const TARGET_LABEL: Record<string, string> = {
    unit: '单体单位',
    player: '玩家本体',
    allUnits: '全部单位',
    all: '全体目标',
};

const EQUIP_TARGET_LABEL: Record<string, string> = {
    unit: '装备单位',
    player: '装备玩家',
};

const COOLDOWN_LABEL: Record<string, string> = {
    perBattle: '每场 1 次',
    perTurn: '每回合可用',
    custom: '特殊冷却',
};

interface ButtonVisualOptions {
    hoverFillColor?: number;
    strokeColor?: number;
    textColor?: string;
    fontSize?: string;
    disabledFillColor?: number;
    disabledStrokeColor?: number;
    disabledTextColor?: string;
}

interface PillVisualOptions {
    fontSize?: string;
    height?: number;
    horizontalPadding?: number;
    minWidth?: number;
}

type DeckSizeIssue = Extract<DeckValidityReason, { kind: 'too-few-cards' | 'too-many-cards' }>;
type DeckAvailabilityIssue = Extract<DeckValidityReason, { kind: 'insufficient-copies' }>;

interface DeckStatusSummary {
    count: number;
    sizeIssue: DeckSizeIssue | null;
    availabilityIssues: DeckAvailabilityIssue[];
    isValid: boolean;
    accentColor: number;
    pillFillColor: number;
    pillTextColor: string;
    statusLabel: string;
    detailLabel: string;
}

interface DeckRosterSnapshot {
    uniqueCardCount: number;
    metaLabel: string;
    detailLabel: string;
    summaryLine: string;
    pressureLabel: string;
}

interface DeckRosterHealthSummary {
    readyCount: number;
    warningCount: number;
    invalidCount: number;
}

interface ReturnCtaState {
    stripFillColor: number;
    stripTextColor: string;
    buttonFillColor: number;
    buttonHoverFillColor: number;
    buttonStrokeColor: number;
    buttonTextColor: string;
    buttonStatusLabel: string;
    summaryLabel: string;
}

interface CardPreviewTheme {
    accentColor: number;
    borderColor: number;
    headerFillColor: number;
    heroFillColor: number;
    heroGlowColor: number;
    badgeFillColor: number;
    badgeTextColor: string;
}

interface CardSpotlightMetric {
    label: string;
    value: string;
    fillColor: number;
    borderColor: number;
    valueColor: string;
    labelColor: string;
}

interface CardDetailViewModel {
    displayName: string;
    metaLabel: string;
    contextLabel: string;
    primaryCopyTitle: string;
    primaryCopyLabel: string;
    secondaryCopyTitle: string | null;
    secondaryCopyLabel: string | null;
    statusLabel: string;
    accentColor: number;
    fillColor: number;
    statusColor: string;
    bodyColor: string;
    kindLabel: string;
    kindGlyph: string;
    rarityLabel: string;
    rarityColor: number;
    previewTheme: CardPreviewTheme;
    ownershipStats: CardSpotlightMetric[];
    factsLabel: string | null;
    rulesLabel: string | null;
    footerLabel: string;
}

interface SpotlightRowHandle {
    cardId: string;
    bg: GameObjects.Rectangle;
    baseFillColor: number;
    hoverFillColor: number;
    activeFillColor: number;
    baseBorderColor: number;
    activeBorderColor: number;
    baseBorderAlpha: number;
}

type DeckReadinessTier = 'invalid' | 'warning' | 'ready';
type TweenableMotionTarget = GameObjects.Container | GameObjects.Rectangle | GameObjects.Text;
type DeckbuilderKeyboardZone = 'decks' | 'editor' | 'browser' | 'return';

interface DeckFeedbackSnapshot {
    deckId: string;
    count: number;
    readinessTier: DeckReadinessTier;
}

type DeckNamingMode = 'create' | 'rename';

interface KeyboardGuideCopy {
    fillColor: number;
    accentColor: number;
    headline: string;
    detail: string;
    headlineColor: string;
    detailColor: string;
}

const KEYBOARD_ZONE_ORDER: DeckbuilderKeyboardZone[] = ['decks', 'editor', 'browser', 'return'];

function getPreviewTheme(kind?: CardKind): CardPreviewTheme {
    switch (kind) {
        case 'unit':
            return {
                accentColor: expeditionUiTheme.colors.jadeBright,
                borderColor: 0x7dd3fc,
                headerFillColor: 0x0f2942,
                heroFillColor: 0x10263a,
                heroGlowColor: expeditionUiTheme.colors.jadeBright,
                badgeFillColor: 0x0f3b63,
                badgeTextColor: '#f3ead3',
            };
        case 'artifact':
            return {
                accentColor: expeditionUiTheme.colors.gold,
                borderColor: 0xfcd34d,
                headerFillColor: 0x3a2407,
                heroFillColor: 0x35210b,
                heroGlowColor: expeditionUiTheme.colors.gold,
                badgeFillColor: 0x5b3a12,
                badgeTextColor: '#fef3c7',
            };
        case 'talisman':
            return {
                accentColor: 0xfb7185,
                borderColor: 0xfda4af,
                headerFillColor: 0x3b1320,
                heroFillColor: 0x32101b,
                heroGlowColor: 0xfb7185,
                badgeFillColor: 0x5c1834,
                badgeTextColor: '#ffe4e6',
            };
        case 'field':
            return {
                accentColor: 0x2dd4bf,
                borderColor: 0x5eead4,
                headerFillColor: 0x10302b,
                heroFillColor: 0x0f2925,
                heroGlowColor: 0x2dd4bf,
                badgeFillColor: 0x134e4a,
                badgeTextColor: '#ccfbf1',
            };
        case 'skill':
            return {
                accentColor: 0xa78bfa,
                borderColor: 0xc4b5fd,
                headerFillColor: 0x27164a,
                heroFillColor: 0x22143d,
                heroGlowColor: 0xa78bfa,
                badgeFillColor: 0x3b2276,
                badgeTextColor: '#ede9fe',
            };
        case 'pill':
            return {
                accentColor: expeditionUiTheme.colors.jade,
                borderColor: 0x86efac,
                headerFillColor: 0x10311b,
                heroFillColor: 0x112718,
                heroGlowColor: expeditionUiTheme.colors.jade,
                badgeFillColor: 0x14532d,
                badgeTextColor: '#dcfce7',
            };
        default:
            return {
                accentColor: PANEL_ACCENT,
                borderColor: 0xc4b5fd,
                headerFillColor: 0x251744,
                heroFillColor: 0x1f1732,
                heroGlowColor: PANEL_ACCENT,
                badgeFillColor: 0x312e81,
                badgeTextColor: '#ede9fe',
            };
    }
}

function getRarityLabel(rarity?: CardRarity): string {
    return rarity ? (RARITY_LABEL[rarity] ?? rarity) : '未标注稀有度';
}

function getRarityAccentColor(rarity?: CardRarity): number {
    switch (rarity) {
        case 'uncommon':
            return VALID_ACCENT;
        case 'rare':
            return SELECTED_ACCENT;
        case 'epic':
            return PANEL_ACCENT;
        case 'legendary':
            return expeditionUiTheme.colors.gold;
        case 'common':
        default:
            return 0x94a3b8;
    }
}

function truncateLabel(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function blendColor(baseColor: number, overlayColor: number, overlayWeight: number): number {
    const weight = clampNumber(overlayWeight, 0, 1);
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

function joinPreviewFacts(parts: (string | null | undefined)[], maxLength = 50): string | null {
    const normalized = parts
        .map((part) => (typeof part === 'string' ? part.trim() : part))
        .filter((part): part is string => typeof part === 'string' && part.length > 0);

    if (normalized.length === 0) {
        return null;
    }

    return truncateLabel(normalized.join(' · '), maxLength);
}

function createDeckId(): string {
    return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function computeAvailable(
    stashCards: readonly ExpeditionCardStack[],
    deckCards: readonly ExpeditionCardStack[],
    cardId: string,
): number {
    const stashCount = stashCards.find((stack) => stack.id === cardId)?.count ?? 0;
    const deckCount = deckCards.find((stack) => stack.id === cardId)?.count ?? 0;
    return stashCount - deckCount;
}

function getStackCount(stacks: readonly ExpeditionCardStack[], cardId: string): number {
    return stacks.find((stack) => stack.id === cardId)?.count ?? 0;
}

function getDeckCapacityAccentColor(capacity: DeckCapacityMetrics): number {
    if (capacity.cardsOverMax > 0) {
        return INVALID_ACCENT;
    }

    if (capacity.cardsNeededToMin > 0) {
        return WARNING_ACCENT;
    }

    return VALID_ACCENT;
}

function getDeckCapacityTextColor(capacity: DeckCapacityMetrics): string {
    if (capacity.cardsOverMax > 0) {
        return '#f3d0c3';
    }

    if (capacity.cardsNeededToMin > 0) {
        return '#f6e2b1';
    }

    return '#e6f3ea';
}

function getDeckCapacityProgressLabel(capacity: DeckCapacityMetrics): string {
    if (capacity.cardsNeededToMin > 0) {
        return `离 ${DECK_CARD_MIN} 张出征线还差 ${capacity.cardsNeededToMin} 张`;
    }

    return `已达到 ${DECK_CARD_MIN} 张出征线`;
}

function getDeckCapacityHeadroomLabel(capacity: DeckCapacityMetrics): string {
    if (capacity.cardsOverMax > 0) {
        return `超出 ${DECK_CARD_MAX} 张上限 ${capacity.cardsOverMax} 张`;
    }

    if (capacity.slotsRemainingToMax === 0) {
        return `已到 ${DECK_CARD_MAX} 张上限`;
    }

    return `距 ${DECK_CARD_MAX} 张上限还剩 ${capacity.slotsRemainingToMax} 张`;
}

function getDeckReadinessTier(summary: DeckStatusSummary): DeckReadinessTier {
    if (summary.availabilityIssues.length > 0 || summary.sizeIssue?.kind === 'too-many-cards') {
        return 'invalid';
    }

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        return 'warning';
    }

    return summary.isValid ? 'ready' : 'invalid';
}

function getDeckShortageCopyCount(issues: readonly DeckAvailabilityIssue[]): number {
    let shortageCount = 0;

    for (let i = 0; i < issues.length; i += 1) {
        shortageCount += Math.max(issues[i].required - issues[i].available, 0);
    }

    return shortageCount;
}

function summarizeDeckKindMix(
    cards: readonly ExpeditionCardStack[],
    metadata?: CardMetadataMap,
    maxKinds = 2,
): string | null {
    const kindCounts = new Map<string, number>();
    let untypedCount = 0;

    for (let i = 0; i < cards.length; i += 1) {
        const stack = cards[i];
        if (stack.count <= 0) {
            continue;
        }

        const kind = metadata?.[stack.id]?.kind;
        if (!kind) {
            untypedCount += stack.count;
            continue;
        }

        kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + stack.count);
    }

    const rankedKinds = Array.from(kindCounts.entries()).sort((left, right) => {
        if (right[1] !== left[1]) {
            return right[1] - left[1];
        }

        const leftLabel = KIND_LABEL[left[0]] ?? left[0];
        const rightLabel = KIND_LABEL[right[0]] ?? right[0];
        return leftLabel.localeCompare(rightLabel);
    });

    if (untypedCount > 0) {
        rankedKinds.push(['unknown', untypedCount]);
    }

    if (rankedKinds.length === 0) {
        return null;
    }

    const labels = rankedKinds.slice(0, maxKinds).map(([kind, count]) => {
        const label = kind === 'unknown' ? '未标注' : KIND_LABEL[kind] ?? kind;
        return `${label} ${count}`;
    });
    const hiddenKinds = rankedKinds.length - labels.length;

    if (hiddenKinds > 0) {
        labels.push(`+${hiddenKinds} 类`);
    }

    return labels.join(' · ');
}

function getDeckRosterPressureLabel(summary: DeckStatusSummary, capacity: DeckCapacityMetrics): string {
    if (summary.availabilityIssues.length > 0) {
        const shortageCopies = getDeckShortageCopyCount(summary.availabilityIssues);
        return `缺 ${summary.availabilityIssues.length} 种 / ${shortageCopies} 张`;
    }

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        return `还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`;
    }

    if (summary.sizeIssue?.kind === 'too-many-cards') {
        return `超限 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`;
    }

    if (capacity.slotsRemainingToMax === 0) {
        return `已到 ${DECK_CARD_MAX} 张上限`;
    }

    return `空位 ${capacity.slotsRemainingToMax} 张`;
}

function buildDeckRosterSnapshot(
    deck: SavedDeck,
    summary: DeckStatusSummary,
    metadata?: CardMetadataMap,
): DeckRosterSnapshot {
    const capacity = summarizeDeckCapacity(deck.cards);
    const uniqueCardCount = deck.cards.filter((stack) => stack.count > 0).length;
    const kindMixLabel = summarizeDeckKindMix(deck.cards, metadata);
    const pressureLabel = getDeckRosterPressureLabel(summary, capacity);
    const metaLabel = `${summary.count} 张 · ${uniqueCardCount} 种卡`;
    const detailLabel = kindMixLabel ? `${kindMixLabel} · ${pressureLabel}` : pressureLabel;

    return {
        uniqueCardCount,
        metaLabel,
        detailLabel,
        summaryLine: kindMixLabel ? `${metaLabel} · ${kindMixLabel}` : metaLabel,
        pressureLabel,
    };
}

function summarizeDeckRosterHealth(
    decks: readonly SavedDeck[],
    stashCards: readonly ExpeditionCardStack[],
): DeckRosterHealthSummary {
    let readyCount = 0;
    let warningCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < decks.length; i += 1) {
        switch (getDeckReadinessTier(summarizeDeckStatus(decks[i], stashCards))) {
            case 'ready':
                readyCount += 1;
                break;
            case 'warning':
                warningCount += 1;
                break;
            case 'invalid':
            default:
                invalidCount += 1;
                break;
        }
    }

    return {
        readyCount,
        warningCount,
        invalidCount,
    };
}

function formatDeckRosterHealthLabel(summary: DeckRosterHealthSummary, totalDecks: number): string {
    if (totalDecks === 0) {
        return '尚无已保存卡组';
    }

    const parts = [`共 ${totalDecks} 套`];

    if (summary.readyCount > 0) {
        parts.push(`就绪 ${summary.readyCount} 套`);
    }

    if (summary.warningCount > 0) {
        parts.push(`待补 ${summary.warningCount} 套`);
    }

    if (summary.invalidCount > 0) {
        parts.push(`失效 ${summary.invalidCount} 套`);
    }

    return parts.join(' · ');
}

function getQuickAddCount(available: number, slotsRemainingToMax: number): number {
    return Math.max(0, Math.min(Math.max(available, 0), Math.max(slotsRemainingToMax, 0)));
}

function getSortFieldLabel(field: CardCollectionSortField): string {
    return SORT_FIELD_LABEL[field] ?? field;
}

function getSortDirectionLabel(direction: 'asc' | 'desc'): string {
    return direction === 'asc' ? '↑' : '↓';
}

function getCompactSortLabel(field: CardCollectionSortField, direction: 'asc' | 'desc'): string {
    return `${getSortFieldLabel(field)}${getSortDirectionLabel(direction)}`;
}

function getKeyboardZoneLabel(zone: DeckbuilderKeyboardZone): string {
    switch (zone) {
        case 'decks':
            return '卡组列表';
        case 'editor':
            return '当前卡组';
        case 'browser':
            return '储物袋浏览';
        case 'return':
            return '返回摘要';
        default:
            return '卡组管理';
    }
}

function createKeyboardGuideCopy(
    zone: DeckbuilderKeyboardZone,
    options: {
        dialogMode: boolean;
        namingMode: DeckNamingMode | null;
        searchFocus: boolean;
    },
): KeyboardGuideCopy {
    if (options.dialogMode) {
        return {
            fillColor: 0x29161b,
            accentColor: INVALID_ACCENT,
            headline: '键盘焦点：删除确认',
            detail: 'Enter 确认删除 · Esc 取消；对话框关闭前不会触发其他导航快捷键。',
            headlineColor: '#f3d0c3',
            detailColor: '#fca5a5',
        };
    }

    if (options.namingMode) {
        return {
            fillColor: PANEL_ATTENTION_FILL,
            accentColor: PANEL_ACCENT,
            headline: options.namingMode === 'create' ? '键盘焦点：新卡组命名' : '键盘焦点：重命名输入',
            detail: '直接键入名称或粘贴内容 · Enter 确认 · Esc 取消；支持输入法。',
            headlineColor: '#f3ead3',
            detailColor: '#d3b27b',
        };
    }

    if (options.searchFocus) {
        return {
            fillColor: PANEL_INPUT_ACTIVE_FILL,
            accentColor: SELECTED_ACCENT,
            headline: '键盘焦点：搜索输入',
            detail: '直接键入搜索词或粘贴内容 · Enter / Esc 退出搜索；支持输入法。',
            headlineColor: '#f3ead3',
            detailColor: '#d9c6a2',
        };
    }

    switch (zone) {
        case 'decks':
            return {
                fillColor: PANEL_SELECTED_FILL,
                accentColor: SELECTED_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: '↑↓ 切换卡组 · N 新建 · R 重命名 · Delete 删除当前卡组',
                headlineColor: '#f3ead3',
                detailColor: '#d9c6a2',
            };
        case 'editor':
            return {
                fillColor: 0x1f1732,
                accentColor: PANEL_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: '↑↓ 浏览卡牌 · ←→ 切换焦点 · Enter 移除 1 · X 清空整格 · I 检视当前焦点',
                headlineColor: '#ede9fe',
                detailColor: '#ddd6fe',
            };
        case 'browser':
            return {
                fillColor: 0x10251a,
                accentColor: VALID_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: '↑↓ 浏览条目 · Enter 加入 1 · F 一键加满 · / 搜索 · K/H/S/D 调整 · I 检视',
                headlineColor: '#dcfce7',
                detailColor: '#e6f3ea',
            };
        case 'return':
            return {
                fillColor: 0x271b0b,
                accentColor: WARNING_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: 'Enter 直接返回远征准备 · Esc 也可立即返回 · 摘要区也能返回。',
                headlineColor: '#f6e2b1',
                detailColor: '#fcd34d',
            };
        default:
            return {
                fillColor: expeditionUiTheme.colors.panelInner,
                accentColor: SECTION_BORDER,
                headline: '键盘焦点：卡组管理',
                detail: 'Tab / Shift+Tab 切换区域 · Esc 返回远征准备',
                headlineColor: '#f3ead3',
                detailColor: '#d9c6a2',
            };
    }
}

function summarizeDeckStatus(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
): DeckStatusSummary {
    const count = countDeckCards(deck.cards);
    const sizeIssue = validateDeckSize(deck.cards) as DeckSizeIssue | null;
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards) as DeckAvailabilityIssue[];

    if (availabilityIssues.length > 0) {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: INVALID_ACCENT,
            pillFillColor: 0x3f1d24,
            pillTextColor: '#f3d0c3',
            statusLabel: '缺卡',
            detailLabel: availabilityIssues.length === 1 ? '1 种卡牌库存不足' : `${availabilityIssues.length} 种卡牌库存不足`,
        };
    }

    if (sizeIssue?.kind === 'too-few-cards') {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: WARNING_ACCENT,
            pillFillColor: 0x3b2a0e,
            pillTextColor: '#f6e2b1',
            statusLabel: '未满',
            detailLabel: `还差 ${sizeIssue.min - sizeIssue.count} 张才能出征`,
        };
    }

    if (sizeIssue?.kind === 'too-many-cards') {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: INVALID_ACCENT,
            pillFillColor: 0x3f1d24,
            pillTextColor: '#f3d0c3',
            statusLabel: '超限',
            detailLabel: `超出 ${sizeIssue.count - sizeIssue.max} 张`,
        };
    }

    return {
        count,
        sizeIssue,
        availabilityIssues,
        isValid: true,
        accentColor: VALID_ACCENT,
        pillFillColor: 0x15372a,
        pillTextColor: '#e6f3ea',
        statusLabel: '就绪',
        detailLabel: '满足 20-40 张且库存充足',
    };
}

function getCardDisplayName(cardId: string, metadata?: CardMetadataMap): string {
    return metadata?.[cardId]?.name ?? cardId;
}

function getCardMetaLabel(cardId: string, metadata?: CardMetadataMap): string {
    const parts: string[] = [];
    const name = metadata?.[cardId]?.name;
    const kind = metadata?.[cardId]?.kind;

    if (name && name !== cardId) {
        parts.push(cardId);
    }

    if (kind) {
        parts.push(KIND_LABEL[kind]);
    }

    return parts.length > 0 ? parts.join(' · ') : '未标注类别';
}

function getCardKindLabel(kind?: CardKind): string {
    return kind ? KIND_LABEL[kind] ?? '未标注类别' : '未标注类别';
}

function getCardKindGlyph(kind?: CardKind): string {
    return kind ? KIND_GLYPHS[kind] ?? KIND_GLYPHS.unknown : KIND_GLYPHS.unknown;
}

function formatCardRulesLine(cardId: string, metadata?: CardMetadataMap): string | null {
    const entry = metadata?.[cardId];

    return joinPreviewFacts([
        entry?.limitPerDeck ? `同卡上限 ${entry.limitPerDeck}` : null,
        entry?.gradeLabel,
        entry?.equipTarget ? (EQUIP_TARGET_LABEL[entry.equipTarget] ?? entry.equipTarget) : null,
        entry?.target ? (TARGET_LABEL[entry.target] ?? entry.target) : null,
        entry?.cooldownType ? (COOLDOWN_LABEL[entry.cooldownType] ?? entry.cooldownType) : null,
        entry?.isInstant === true
            ? '即时施放'
            : entry?.duration
                ? `持续 ${entry.duration} 回合`
                : entry?.isInstant === false
                    ? '持续施放'
                    : null,
        entry?.symmetric === true
            ? '对称场地'
            : entry?.symmetric === false
                ? '单边场地'
                : null,
    ]);
}

function formatCardFactsLine(cardId: string, metadata?: CardMetadataMap): string | null {
    const entry = metadata?.[cardId];
    const labelSummary = entry?.labels?.slice(0, 2).join(' / ');

    return joinPreviewFacts([
        entry?.attack !== undefined ? `攻击 ${entry.attack}` : null,
        entry?.health !== undefined ? `生命 ${entry.health}` : null,
        entry?.attackBonus !== undefined ? `攻击 +${entry.attackBonus}` : null,
        entry?.healthBonus !== undefined ? `生命 +${entry.healthBonus}` : null,
        entry?.race,
        entry?.weaponType ? `${entry.weaponType}器` : null,
        entry?.linggen?.length ? `灵根 ${entry.linggen.join('/')}` : null,
        entry?.elements?.length ? `五行 ${entry.elements.join('/')}` : null,
        labelSummary ? `标签 ${labelSummary}` : null,
    ]);
}

function buildCardDetailViewModel(
    cardId: string | null,
    stashCards: readonly ExpeditionCardStack[],
    deckCards: readonly ExpeditionCardStack[],
    metadata?: CardMetadataMap,
): CardDetailViewModel {
    if (!cardId) {
        const previewTheme = getPreviewTheme(undefined);
        return {
            displayName: '悬停卡牌查看详情',
            metaLabel: '当前卡组与储物袋条目会同步在这里展示',
            contextLabel: deckCards.length > 0
                ? `当前卡组 ${countDeckCards(deckCards)} 张 · ${deckCards.length} 个条目`
                : '可先在右侧储物袋中浏览可用卡牌',
            primaryCopyTitle: '查看方式',
            primaryCopyLabel: '从当前卡组清单或储物袋浏览中悬停或点击任一条目，即可切换这里的牌面焦点。',
            secondaryCopyTitle: '同步说明',
            secondaryCopyLabel: deckCards.length > 0
                ? '详情会保留最近查看的卡牌，方便一边滚动列表一边确认配置。'
                : '右侧储物袋支持搜索、种类筛选与一键加满；这里会同步显示当前查看的牌面。',
            statusLabel: '等待查看',
            accentColor: PANEL_ACCENT,
            fillColor: expeditionUiTheme.colors.panel,
            statusColor: '#d9c6a2',
            bodyColor: '#d9c6a2',
            kindLabel: '浏览提示',
            kindGlyph: '览',
            rarityLabel: '预览面板',
            rarityColor: PANEL_ACCENT,
            previewTheme,
            ownershipStats: [
                {
                    label: '卡组',
                    value: String(countDeckCards(deckCards)),
                    fillColor: blendColor(expeditionUiTheme.colors.panel, previewTheme.headerFillColor, 0.72),
                    borderColor: previewTheme.borderColor,
                    valueColor: '#f3ead3',
                    labelColor: '#d9c6a2',
                },
                {
                    label: '库存',
                    value: String(stashCards.length),
                    fillColor: blendColor(expeditionUiTheme.colors.panel, previewTheme.heroFillColor, 0.76),
                    borderColor: previewTheme.accentColor,
                    valueColor: '#f3ead3',
                    labelColor: '#d9c6a2',
                },
                {
                    label: '焦点',
                    value: '待选',
                    fillColor: expeditionUiTheme.colors.panelInner,
                    borderColor: SECTION_BORDER,
                    valueColor: '#d9c6a2',
                    labelColor: '#bca785',
                },
                {
                    label: '切换',
                    value: '悬停',
                    fillColor: expeditionUiTheme.colors.panelInner,
                    borderColor: SECTION_BORDER,
                    valueColor: '#d9c6a2',
                    labelColor: '#bca785',
                },
            ],
            factsLabel: deckCards.length > 0
                ? '最近焦点会保留在这里，方便边滚动边核对。'
                : '右侧储物袋支持搜索、筛选与一键加满。',
            rulesLabel: '缺少完整内容时也会回退到编号、类型与库存信息。',
            footerLabel: '悬停卡组或储物袋条目即可切换焦点牌面',
        };
    }

    const entry = metadata?.[cardId];
    const displayName = getCardDisplayName(cardId, metadata);
    const kindLabel = getCardKindLabel(entry?.kind);
    const metaLabel = joinPreviewFacts([
        displayName !== cardId ? cardId : null,
        entry?.gradeLabel,
        entry?.kind ? KIND_LABEL[entry.kind] : null,
    ], 42) ?? cardId;
    const description = entry?.description?.trim() || undefined;
    const effectSummary = entry?.effectSummary?.trim() || undefined;
    const ownedCount = getStackCount(stashCards, cardId);
    const deckCount = getStackCount(deckCards, cardId);
    const availableCount = Math.max(ownedCount - deckCount, 0);
    const shortageCount = Math.max(deckCount - ownedCount, 0);
    const contextParts = [`袋中 ${ownedCount} 张`, `卡组 ${deckCount} 张`];

    let statusLabel = '当前未持有';
    let accentColor: number = SECTION_BORDER;
    let fillColor: number = expeditionUiTheme.colors.panelInner;
    let statusColor = '#d9c6a2';
    let bodyColor = '#f3ead3';

    if (shortageCount > 0) {
        contextParts.push(`缺 ${shortageCount} 张`);
        statusLabel = `库存不足 ${shortageCount} 张`;
        accentColor = INVALID_ACCENT;
        fillColor = 0x201018;
        statusColor = '#f3d0c3';
        bodyColor = '#fce7ea';
    } else if (availableCount > 0) {
        contextParts.push(`可再加 ${availableCount} 张`);
        statusLabel = `还可加入 ${availableCount} 张`;
        accentColor = VALID_ACCENT;
        fillColor = 0x0d1b13;
        statusColor = '#e6f3ea';
    } else if (deckCount > 0) {
        contextParts.push('已占满库存');
        statusLabel = '当前卡组已用满库存';
        accentColor = WARNING_ACCENT;
        fillColor = 0x1b1a12;
        statusColor = '#f6e2b1';
    } else {
        contextParts.push('库存为 0');
    }

    const previewTheme = getPreviewTheme(entry?.kind);
    const rarityColor = getRarityAccentColor(entry?.rarity);
    const factsLabel = formatCardFactsLine(cardId, metadata);
    const rulesLabel = formatCardRulesLine(cardId, metadata);
    const spotlightContext = factsLabel ?? contextParts.join(' · ');
    const primaryCopyTitle = effectSummary ? '效果要点' : description ? '卡牌简介' : factsLabel ? '牌面要点' : '预览提示';
    const primaryCopyLabel = effectSummary
        ?? description
        ?? factsLabel
        ?? '未找到描述或效果摘要，仍可按编号与数量管理此卡。';
    let secondaryCopyTitle: string | null = null;
    let secondaryCopyLabel: string | null = null;

    if (effectSummary && description && description !== effectSummary) {
        secondaryCopyTitle = '卡牌简介';
        secondaryCopyLabel = description;
    } else if (factsLabel && factsLabel !== primaryCopyLabel) {
        secondaryCopyTitle = '牌面要点';
        secondaryCopyLabel = factsLabel;
    } else if (spotlightContext !== primaryCopyLabel) {
        secondaryCopyTitle = '持有情况';
        secondaryCopyLabel = spotlightContext;
    }

    const footerLabel = entry
        ? truncateLabel(
            joinPreviewFacts([
                entry.rarity ? `稀有度 ${getRarityLabel(entry.rarity)}` : null,
                entry.gradeLabel,
                contextParts.join(' · '),
            ], 62) ?? contextParts.join(' · '),
            62,
        )
        : contextParts.join(' · ');

    return {
        displayName,
        metaLabel,
        contextLabel: spotlightContext,
        primaryCopyTitle,
        primaryCopyLabel,
        secondaryCopyTitle,
        secondaryCopyLabel,
        statusLabel,
        accentColor,
        fillColor,
        statusColor,
        bodyColor,
        kindLabel,
        kindGlyph: getCardKindGlyph(entry?.kind),
        rarityLabel: getRarityLabel(entry?.rarity),
        rarityColor,
        previewTheme,
        ownershipStats: [
            {
                label: '袋中',
                value: String(ownedCount),
                fillColor: blendColor(expeditionUiTheme.colors.panel, previewTheme.headerFillColor, 0.72),
                borderColor: previewTheme.borderColor,
                valueColor: '#f3ead3',
                labelColor: '#d9c6a2',
            },
            {
                label: '卡组',
                value: String(deckCount),
                fillColor: blendColor(expeditionUiTheme.colors.panel, previewTheme.heroFillColor, 0.78),
                borderColor: previewTheme.accentColor,
                valueColor: '#f3ead3',
                labelColor: '#d9c6a2',
            },
            {
                label: '剩余',
                value: String(availableCount),
                fillColor: availableCount > 0 ? 0x0d2a1d : expeditionUiTheme.colors.panelInner,
                borderColor: availableCount > 0 ? VALID_ACCENT : SECTION_BORDER,
                valueColor: availableCount > 0 ? '#e6f3ea' : '#d9c6a2',
                labelColor: availableCount > 0 ? '#e6f3ea' : '#bca785',
            },
            {
                label: '缺口',
                value: String(shortageCount),
                fillColor: shortageCount > 0 ? 0x2b1418 : expeditionUiTheme.colors.panelInner,
                borderColor: shortageCount > 0 ? INVALID_ACCENT : SECTION_BORDER,
                valueColor: shortageCount > 0 ? '#f3d0c3' : '#d9c6a2',
                labelColor: shortageCount > 0 ? '#f3d0c3' : '#bca785',
            },
        ],
        factsLabel,
        rulesLabel,
        footerLabel,
    };
}

function createReturnCtaState(summary: DeckStatusSummary): ReturnCtaState {
    if (summary.availabilityIssues.length > 0) {
        return {
            stripFillColor: PANEL_DEEP_FILL,
            stripTextColor: '#f3d0c3',
            buttonFillColor: BUTTON_NEUTRAL_FILL,
            buttonHoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#f3d0c3',
            buttonStatusLabel: '库存待补齐',
            summaryLabel: `当前卡组：${summary.count} 张 · ${summary.availabilityIssues.length} 种卡牌库存不足`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        return {
            stripFillColor: PANEL_DEEP_FILL,
            stripTextColor: '#f6e2b1',
            buttonFillColor: BUTTON_NEUTRAL_FILL,
            buttonHoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
            buttonStrokeColor: 0xfcd34d,
            buttonTextColor: '#f6e2b1',
            buttonStatusLabel: `还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
            summaryLabel: `当前卡组：${summary.count} 张 · 还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-many-cards') {
        return {
            stripFillColor: PANEL_DEEP_FILL,
            stripTextColor: '#f3d0c3',
            buttonFillColor: BUTTON_NEUTRAL_FILL,
            buttonHoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#f3d0c3',
            buttonStatusLabel: `超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
            summaryLabel: `当前卡组：${summary.count} 张 · 超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
        };
    }

    return {
        stripFillColor: PANEL_DEEP_FILL,
        stripTextColor: '#e6f3ea',
        buttonFillColor: BUTTON_NEUTRAL_FILL,
        buttonHoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
        buttonStrokeColor: 0x86efac,
        buttonTextColor: '#dcfce7',
        buttonStatusLabel: '当前卡组已就绪',
        summaryLabel: `当前卡组：${summary.count} 张 · 已满足 20-40 张`,
    };
}

export class DeckManagementPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly config: DeckManagementPanelConfig;
    private readonly nativeTextEntry: NativeTextEntryOverlay;
    private selectedDeckId: string | null = null;
    private detailCardId: string | null = null;

    private deckListScrollOffset = 0;
    private editorScrollOffset = 0;
    private browserScrollOffset = 0;

    private deckListVisibleRows = 1;
    private editorVisibleRows = 1;
    private browserVisibleRows = 1;
    private editorGridColumns = 1;

    private filterQuery = '';
    private filterHideZero = true;
    private filterKind: CardKind | undefined = undefined;
    private sortField: CardCollectionSortField = DEFAULT_BROWSER_SORT_FIELD;
    private sortDirection: 'asc' | 'desc' = DEFAULT_BROWSER_SORT_DIRECTION;

    private namingMode: DeckNamingMode | null = null;
    private namingDeckId: string | null = null;
    private renameBuffer = '';
    private namingInputBg?: GameObjects.Rectangle;
    private namingInputText?: GameObjects.Text;

    private searchFocus = false;
    private detailPaneExpanded = true;
    private keyboardZone: DeckbuilderKeyboardZone = 'decks';

    private browserStateText?: GameObjects.Text;
    private queryBg?: GameObjects.Rectangle;
    private queryText?: GameObjects.Text;
    private queryClearBtn?: GameObjects.Text;
    private keyboardGuideHeadline?: GameObjects.Text;
    private keyboardGuideDetail?: GameObjects.Text;
    private keyboardGuideBg?: GameObjects.Rectangle;
    private keyboardGuideAccent?: GameObjects.Rectangle;
    private keyboardGuidePillBg?: GameObjects.Rectangle;
    private keyboardGuidePillText?: GameObjects.Text;

    private deckListInner?: GameObjects.Container;
    private editorContainer?: GameObjects.Container;
    private browserOuter?: GameObjects.Container;
    private browserInner?: GameObjects.Container;

    private deckListSummaryContainer?: GameObjects.Container;
    private deckListPosText?: GameObjects.Text;
    private deleteDeckBtn?: GameObjects.Rectangle;
    private deleteDeckLabel?: GameObjects.Text;

    private kindBtn?: GameObjects.Rectangle;
    private kindBtnText?: GameObjects.Text;
    private hideZeroBtn?: GameObjects.Rectangle;
    private hideZeroBtnText?: GameObjects.Text;
    private sortFieldBtn?: GameObjects.Rectangle;
    private sortFieldBtnText?: GameObjects.Text;
    private sortDirBtn?: GameObjects.Rectangle;
    private sortDirBtnText?: GameObjects.Text;
    private browserSummaryContainer?: GameObjects.Container;
    private browserPosText?: GameObjects.Text;
    private detailPaneContainer?: GameObjects.Container;
    private detailPaneContent?: GameObjects.Container;
    private readonly editorSpotlightRows = new Map<string, SpotlightRowHandle>();
    private readonly browserSpotlightRows = new Map<string, SpotlightRowHandle>();
    private pendingSelectedDeckMotionId: string | null = null;
    private lastEditorFeedback?: DeckFeedbackSnapshot;

    private keydownHandler?: (event: KeyboardEvent) => void;
    private wheelHandler?: (pointer: Phaser.Input.Pointer, _gameObjects: unknown[], deltaX: number, deltaY: number) => void;

    private deckListArea = { x: 0, y: 0, w: 0, h: 0 };
    private editorArea = { x: 0, y: 0, w: 0, h: 0 };
    private browserArea = { x: 0, y: 0, w: 0, h: 0 };
    private browserSummaryArea = { x: 0, y: 0, w: 0, h: 0 };
    private deckListSummaryHeight = DECK_LIST_SUMMARY_HEIGHT;
    private deckListRowHeight = DECK_ROW_HEIGHT;
    private deckListCompact = false;
    private editorContentWidth = 0;
    private editorContentHeight = 0;
    private detailPaneWidth = 0;
    private detailPaneHeight = 0;

    private dialogMode = false;
    private dialogObjects: GameObjects.GameObject[] = [];
    private panelFrame: EntryPanelFrame | null = null;

    constructor(scene: Scene, config: DeckManagementPanelConfig) {
        super(scene, 0, 0);
        this.stash = config.stash;
        this.config = config;
        this.nativeTextEntry = new NativeTextEntryOverlay(scene);
        this.selectedDeckId = config.stash.selectedDeckId ?? config.stash.savedDecks[0]?.id ?? null;
        this.detailCardId = this.resolveFallbackDetailCardId();
        this.keyboardZone = config.initialKeyboardZone ?? this.keyboardZone;

        this.createPanel();
        this.syncKeyboardZoneSelection();
        scene.add.existing(this);

        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);

        this.wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => this.handleWheel(pointer, deltaY);
        scene.input.on('wheel', this.wheelHandler);
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    destroy(fromScene?: boolean): void {
        if (this.keydownHandler) {
            this.scene.input.keyboard?.off('keydown', this.keydownHandler);
        }

        this.scene.input.off('pointerdown', this.handleSearchClickOutside, this);

        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
        }

        this.nativeTextEntry.destroy();
        this.dialogObjects.forEach((obj) => obj.destroy());
        this.dialogObjects = [];
        super.destroy(fromScene);
    }

    private getSelectedDeck(): SavedDeck | null {
        return this.stash.savedDecks.find((deck) => deck.id === this.selectedDeckId) ?? null;
    }

    private getSelectedDeckStatus(): DeckStatusSummary | null {
        const deck = this.getSelectedDeck();
        return deck ? summarizeDeckStatus(deck, this.stash.cards) : null;
    }

    private isDeckNamingActive(deck?: SavedDeck | null): boolean {
        return Boolean(deck && this.namingMode !== null && this.namingDeckId === deck.id);
    }

    private beginDeckNaming(mode: DeckNamingMode, deckId: string, initialName: string): void {
        this.namingMode = mode;
        this.namingDeckId = deckId;
        this.renameBuffer = initialName;
        this.detailPaneExpanded = false;
        this.refreshKeyboardGuide();
    }

    private resetDeckNamingState(): void {
        this.nativeTextEntry.deactivate(DECK_NAMING_TEXT_ENTRY_SESSION_ID);
        this.namingMode = null;
        this.namingDeckId = null;
        this.renameBuffer = '';
        this.refreshKeyboardGuide();
    }

    private isCardKnownToPanel(cardId: string): boolean {
        if (this.config.metadata?.[cardId]) {
            return true;
        }

        if (this.stash.cards.some((stack) => stack.id === cardId)) {
            return true;
        }

        return this.stash.savedDecks.some((deck) => deck.cards.some((stack) => stack.id === cardId));
    }

    private resolveFallbackDetailCardId(): string | null {
        const selectedDeck = this.getSelectedDeck();
        const selectedDeckCardId = selectedDeck?.cards[0]?.id;
        if (selectedDeckCardId) {
            return selectedDeckCardId;
        }

        const ownedCardId = this.stash.cards.find((stack) => stack.count > 0)?.id ?? this.stash.cards[0]?.id;
        if (ownedCardId) {
            return ownedCardId;
        }

        return Object.keys(this.config.metadata ?? {})[0] ?? null;
    }

    private ensureDetailCardSelection(): void {
        if (this.detailCardId && this.isCardKnownToPanel(this.detailCardId)) {
            return;
        }

        this.detailCardId = this.resolveFallbackDetailCardId();
    }

    private setDetailCardId(cardId: string): void {
        if (this.detailCardId === cardId) {
            return;
        }

        this.detailCardId = cardId;
        this.refreshDetailPane(true);
        this.refreshSpotlightRowStates(true);
    }

    private setDetailPaneExpanded(expanded: boolean): void {
        if (this.detailPaneExpanded === expanded) {
            return;
        }

        this.detailPaneExpanded = expanded;
        this.refreshEditor();
        this.refreshKeyboardGuide();
    }

    private toggleDetailPane(expanded?: boolean): void {
        this.setDetailPaneExpanded(expanded ?? !this.detailPaneExpanded);
    }

    private setKeyboardZone(zone: DeckbuilderKeyboardZone): void {
        this.keyboardZone = zone;
        this.refreshKeyboardGuide();
    }

    private cycleKeyboardZone(direction: -1 | 1): void {
        const currentIndex = KEYBOARD_ZONE_ORDER.indexOf(this.keyboardZone);
        const baseIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (baseIndex + direction + KEYBOARD_ZONE_ORDER.length) % KEYBOARD_ZONE_ORDER.length;
        this.setKeyboardZone(KEYBOARD_ZONE_ORDER[nextIndex]);
        this.syncKeyboardZoneSelection(true);
    }

    private refreshKeyboardGuide(): void {
        if (!this.keyboardGuideHeadline
            || !this.keyboardGuideDetail
            || !this.keyboardGuideBg
            || !this.keyboardGuideAccent
            || !this.keyboardGuidePillText
            || !this.keyboardGuidePillBg) {
            return;
        }

        const copy = createKeyboardGuideCopy(this.keyboardZone, {
            dialogMode: this.dialogMode,
            namingMode: this.namingMode,
            searchFocus: this.searchFocus,
        });
        const emphasizeGuide = this.dialogMode
            || this.namingMode !== null
            || this.searchFocus
            || this.keyboardZone !== 'editor';

        this.keyboardGuideBg.setFillStyle(copy.fillColor, emphasizeGuide ? 0.96 : 0.72);
        this.keyboardGuideBg.setStrokeStyle(1, copy.accentColor, emphasizeGuide ? 0.82 : 0.38);
        this.keyboardGuideAccent.setFillStyle(copy.accentColor, emphasizeGuide ? 0.95 : 0.58);
        this.keyboardGuideHeadline.setText(copy.headline);
        this.keyboardGuideHeadline.setColor(copy.headlineColor);
        this.keyboardGuideDetail.setText(truncateLabel(copy.detail, emphasizeGuide ? 34 : 18));
        this.keyboardGuideDetail.setColor(copy.detailColor);
        this.keyboardGuideDetail.setVisible(emphasizeGuide);
        this.keyboardGuidePillText.setText(this.dialogMode || this.namingMode || this.searchFocus
            ? 'Enter 确认 · Esc 取消'
            : 'Tab 切换区域 · Esc 返回');
        this.keyboardGuidePillText.setColor(copy.headlineColor);
        this.keyboardGuidePillBg.setFillStyle(expeditionUiTheme.colors.panel, emphasizeGuide ? 1 : 0.88);
        this.keyboardGuidePillBg.setStrokeStyle(1, copy.accentColor, emphasizeGuide ? 0.28 : 0.18);
    }

    private getNamingTextEntryBounds(): NativeTextEntryRect | null {
        if (!this.namingInputBg) {
            return null;
        }

        return insetNativeTextEntryRect(this.namingInputBg.getBounds(), {
            left: 8,
            right: 8,
            top: 4,
            bottom: 4,
        });
    }

    private updateNamingTextDisplay(): void {
        if (!this.namingInputText) {
            return;
        }

        const nativeNamingActive = this.nativeTextEntry.isActive(DECK_NAMING_TEXT_ENTRY_SESSION_ID);
        this.namingInputText.setVisible(!nativeNamingActive);

        if (nativeNamingActive) {
            return;
        }

        this.namingInputText.setText(this.renameBuffer.length > 0 ? this.renameBuffer : '输入卡组名称');
        this.namingInputText.setColor(this.renameBuffer.trim().length > 0 ? '#f3ead3' : '#64748b');
    }

    private syncNamingTextEntry(): void {
        if (!this.namingMode || !this.namingInputBg) {
            this.nativeTextEntry.deactivate(DECK_NAMING_TEXT_ENTRY_SESSION_ID);
            this.updateNamingTextDisplay();
            return;
        }

        this.nativeTextEntry.activate({
            id: DECK_NAMING_TEXT_ENTRY_SESSION_ID,
            ariaLabel: this.namingMode === 'create' ? '新卡组名称输入' : '卡组重命名输入',
            value: this.renameBuffer,
            placeholder: '输入卡组名称',
            selectAllOnFocus: true,
            getBounds: () => this.getNamingTextEntryBounds(),
            style: {
                fontFamily: expeditionUiTheme.fonts.mono,
                fontSize: 18,
                fontWeight: 'bold',
                color: '#f3ead3',
                placeholderColor: '#64748b',
                lineHeight: 28,
            },
            onValueChange: (value) => {
                this.renameBuffer = value;
                this.refreshEditor();
            },
            onConfirm: (value) => {
                this.renameBuffer = value;
                this.confirmRename();
            },
            onCancel: () => this.cancelRename(),
        });
        this.updateNamingTextDisplay();
    }

    private getSearchTextEntryBounds(): NativeTextEntryRect | null {
        if (!this.queryBg) {
            return null;
        }

        return insetNativeTextEntryRect(this.queryBg.getBounds(), {
            left: 10,
            right: 56,
            top: 4,
            bottom: 4,
        });
    }

    private focusSearchTextEntry(): void {
        this.nativeTextEntry.focus(DECK_SEARCH_TEXT_ENTRY_SESSION_ID);
    }

    private ensureSelectedDeckVisible(): boolean {
        const decks = this.stash.savedDecks;
        if (decks.length === 0 || !this.selectedDeckId) {
            return false;
        }

        const selectedIndex = decks.findIndex((deck) => deck.id === this.selectedDeckId);
        if (selectedIndex < 0) {
            return false;
        }

        const maxOffset = Math.max(0, decks.length - this.deckListVisibleRows);
        const previousOffset = this.deckListScrollOffset;

        if (selectedIndex < this.deckListScrollOffset) {
            this.deckListScrollOffset = selectedIndex;
        } else if (selectedIndex >= this.deckListScrollOffset + this.deckListVisibleRows) {
            this.deckListScrollOffset = selectedIndex - this.deckListVisibleRows + 1;
        }

        this.deckListScrollOffset = clampNumber(this.deckListScrollOffset, 0, maxOffset);
        return previousOffset !== this.deckListScrollOffset;
    }

    private getFocusedEditorIndex(deck: SavedDeck | null = this.getSelectedDeck()): number {
        if (!deck || deck.cards.length === 0) {
            return -1;
        }

        const focusedIndex = deck.cards.findIndex((stack) => stack.id === this.detailCardId);
        return focusedIndex >= 0 ? focusedIndex : 0;
    }

    private focusEditorIndex(index: number, animate = true): void {
        const deck = this.getSelectedDeck();
        if (!deck || deck.cards.length === 0) {
            return;
        }

        const clampedIndex = clampNumber(index, 0, deck.cards.length - 1);
        const nextCardId = deck.cards[clampedIndex]?.id;
        if (!nextCardId) {
            return;
        }

        const gridColumns = Math.max(1, this.editorGridColumns);
        const focusedRow = Math.floor(clampedIndex / gridColumns);
        const maxOffset = Math.max(0, Math.ceil(deck.cards.length / gridColumns) - this.editorVisibleRows);
        const previousOffset = this.editorScrollOffset;

        if (focusedRow < this.editorScrollOffset) {
            this.editorScrollOffset = focusedRow;
        } else if (focusedRow >= this.editorScrollOffset + this.editorVisibleRows) {
            this.editorScrollOffset = focusedRow - this.editorVisibleRows + 1;
        }

        this.editorScrollOffset = clampNumber(this.editorScrollOffset, 0, maxOffset);
        const detailChanged = this.detailCardId !== nextCardId;
        this.detailCardId = nextCardId;

        if (this.editorScrollOffset !== previousOffset) {
            this.refreshEditor();
            return;
        }

        if (detailChanged) {
            this.refreshDetailPane(animate);
        }
        this.refreshSpotlightRowStates(animate);
    }

    private buildBrowserCollections(): {
        rows: CardCollectionRow[];
        matchedRows: CardCollectionRow[];
        totalRows: CardCollectionRow[];
    } {
        const baseFilters: CardCollectionFilters = {
            query: this.filterQuery || undefined,
            kind: this.filterKind,
            hideZeroCount: false,
        };
        const sort: CardCollectionSortConfig = {
            field: this.sortField,
            direction: this.sortDirection,
        };

        return {
            rows: computeCardCollectionViewModel(this.stash.cards, {
                metadata: this.config.metadata,
                filters: {
                    ...baseFilters,
                    hideZeroCount: this.filterHideZero,
                },
                sort,
            }),
            matchedRows: computeCardCollectionViewModel(this.stash.cards, {
                metadata: this.config.metadata,
                filters: baseFilters,
                sort,
            }),
            totalRows: computeCardCollectionViewModel(this.stash.cards, {
                metadata: this.config.metadata,
                sort,
            }),
        };
    }

    private getFocusedBrowserIndex(rows: readonly CardCollectionRow[]): number {
        if (rows.length === 0) {
            return -1;
        }

        const focusedIndex = rows.findIndex((row) => row.id === this.detailCardId);
        return focusedIndex >= 0 ? focusedIndex : 0;
    }

    private focusBrowserIndex(index: number, rows: readonly CardCollectionRow[] | null = null, animate = true): void {
        const browserRows = rows ?? this.buildBrowserCollections().rows;
        if (browserRows.length === 0) {
            return;
        }

        const clampedIndex = clampNumber(index, 0, browserRows.length - 1);
        const nextCardId = browserRows[clampedIndex]?.id;
        if (!nextCardId) {
            return;
        }

        const maxOffset = Math.max(0, browserRows.length - this.browserVisibleRows);
        const previousOffset = this.browserScrollOffset;

        if (clampedIndex < this.browserScrollOffset) {
            this.browserScrollOffset = clampedIndex;
        } else if (clampedIndex >= this.browserScrollOffset + this.browserVisibleRows) {
            this.browserScrollOffset = clampedIndex - this.browserVisibleRows + 1;
        }

        this.browserScrollOffset = clampNumber(this.browserScrollOffset, 0, maxOffset);
        const detailChanged = this.detailCardId !== nextCardId;
        this.detailCardId = nextCardId;

        if (this.browserScrollOffset !== previousOffset) {
            this.refreshBrowser();
            return;
        }

        if (detailChanged) {
            this.refreshDetailPane(animate);
        }
        this.refreshSpotlightRowStates(animate);
    }

    private syncKeyboardZoneSelection(animate = false): void {
        if (this.dialogMode || this.namingMode || this.searchFocus) {
            this.refreshKeyboardGuide();
            return;
        }

        switch (this.keyboardZone) {
            case 'decks':
                if (this.ensureSelectedDeckVisible()) {
                    this.refreshDeckList();
                }
                break;
            case 'editor':
                this.focusEditorIndex(this.getFocusedEditorIndex(), animate);
                break;
            case 'browser': {
                const { rows } = this.buildBrowserCollections();
                this.focusBrowserIndex(this.getFocusedBrowserIndex(rows), rows, animate);
                break;
            }
            case 'return':
                this.refreshEditor();
                break;
        }
    }

    private playMotionPulse(
        targets: (TweenableMotionTarget | null | undefined)[],
        config: {
            alphaFrom?: number;
            scaleXFrom?: number;
            scaleYFrom?: number;
            duration?: number;
            ease?: string;
        } = {},
    ): void {
        const liveTargets = targets.filter((target): target is TweenableMotionTarget => Boolean(target));
        if (liveTargets.length === 0) {
            return;
        }

        const {
            alphaFrom = 0.76,
            scaleXFrom = 0.985,
            scaleYFrom = scaleXFrom,
            duration = 180,
            ease = 'Cubic.easeOut',
        } = config;

        liveTargets.forEach((target) => {
            this.scene.tweens.killTweensOf(target);
            target.setAlpha(alphaFrom);
            target.setScale(scaleXFrom, scaleYFrom);
        });

        this.scene.tweens.add({
            targets: liveTargets,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration,
            ease,
        });
    }

    private applySpotlightRowState(row: SpotlightRowHandle, active: boolean, animate = false): void {
        this.scene.tweens.killTweensOf(row.bg);
        row.bg.setFillStyle(active ? row.activeFillColor : row.baseFillColor, 0.98);
        row.bg.setStrokeStyle(active ? 2 : 1, active ? row.activeBorderColor : row.baseBorderColor, active ? 0.98 : row.baseBorderAlpha);

        if (animate) {
            if (active) {
                row.bg.setScale(0.985, 0.94);
            }

            this.scene.tweens.add({
                targets: row.bg,
                scaleX: 1,
                scaleY: 1,
                duration: active ? 170 : 120,
                ease: 'Cubic.easeOut',
            });
            return;
        }

        row.bg.setScale(1, 1);
    }

    private registerSpotlightRow(target: Map<string, SpotlightRowHandle>, row: SpotlightRowHandle): void {
        target.set(row.cardId, row);
        this.applySpotlightRowState(row, this.detailCardId === row.cardId);
    }

    private refreshSpotlightRowStates(animate = false): void {
        this.editorSpotlightRows.forEach((row) => this.applySpotlightRowState(row, this.detailCardId === row.cardId, animate));
        this.browserSpotlightRows.forEach((row) => this.applySpotlightRowState(row, this.detailCardId === row.cardId, animate));
    }

    private refreshDetailPane(animate = false): void {
        if (!this.detailPaneContainer) {
            return;
        }

        this.detailPaneContainer.list.slice().forEach((child: GameObjects.GameObject) => {
            if (child !== this.detailPaneContent) {
                this.scene.tweens.killTweensOf(child);
                child.destroy();
            }
        });

        const detail = buildCardDetailViewModel(
            this.detailCardId,
            this.stash.cards,
            this.getSelectedDeck()?.cards ?? [],
            this.config.metadata,
        );
        const nextContent = this.scene.add.container(0, 0);

        const previewWidth = this.detailPaneWidth;
        const previewHeight = this.detailPaneHeight;
        const previewTheme = detail.previewTheme;
        const compactPreview = previewHeight < 260 || previewWidth < 280;
        const innerWidth = previewWidth - 28;
        const contentLeft = 14;
        const verticalGap = compactPreview ? 8 : 10;
        const headerHeight = compactPreview ? 44 : 48;
        const footerHeight = compactPreview ? 28 : 32;
        const workingHeight = Math.max(
            compactPreview ? 180 : 208,
            previewHeight - headerHeight - footerHeight - verticalGap * 2 - 10,
        );
        const heroHeight = clampNumber(
            Math.floor(workingHeight * (compactPreview ? 0.36 : 0.4)),
            compactPreview ? 78 : 84,
            compactPreview ? 92 : 104,
        );
        const metricHeight = clampNumber(
            Math.floor(workingHeight * (compactPreview ? 0.18 : 0.2)),
            compactPreview ? 42 : 44,
            compactPreview ? 46 : 50,
        );
        const copyHeight = Math.max(compactPreview ? 64 : 76, workingHeight - heroHeight - metricHeight);
        const heroTop = headerHeight + verticalGap;
        const metricsTop = heroTop + heroHeight + verticalGap;
        const copyTop = metricsTop + metricHeight + verticalGap;
        const availableCopyHeight = previewHeight - footerHeight - 10 - copyTop;
        const showSecondaryCopy = Boolean(detail.secondaryCopyLabel) && availableCopyHeight >= 96;
        const copyPanelHeight = Math.min(
            availableCopyHeight,
            Math.max(copyHeight, showSecondaryCopy ? 92 : 68),
        );
        const footerTop = previewHeight - footerHeight + 1;
        const metricGap = 4;
        const metricWidth = (innerWidth - metricGap * 3) / 4;
        const showHeroSupport = heroHeight >= 80;
        const primaryCopy = truncateLabel(
            detail.primaryCopyLabel,
            showSecondaryCopy ? 46 : copyPanelHeight >= 88 ? 70 : 54,
        );
        const secondaryCopy = showSecondaryCopy
            ? truncateLabel(detail.secondaryCopyLabel ?? '', compactPreview ? 28 : 34)
            : null;
        const supportLine = truncateLabel(detail.contextLabel, compactPreview ? 18 : 24);
        const footerCopy = truncateLabel(
            joinPreviewFacts([detail.metaLabel, detail.rulesLabel ?? detail.footerLabel], 72) ?? detail.footerLabel,
            compactPreview ? 30 : 36,
        );

        const createBadge = (
            x: number,
            y: number,
            label: string,
            fillColor: number,
            textColor: string,
            align: 'left' | 'right' = 'left',
        ): [GameObjects.Rectangle, GameObjects.Text, number] => {
            const text = this.scene.add.text(0, y, label, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: textColor,
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            const width = Math.max(88, text.width + 24);
            const left = align === 'left' ? x : x - width;
            text.setX(left + 12);

            const bg = this.scene.add.rectangle(left + width / 2, y, width, 30, fillColor, 1);
            bg.setStrokeStyle(1, 0xffffff, 0.12);
            return [bg, text, width];
        };

        const shadow = this.scene.add.rectangle(
            previewWidth / 2,
            previewHeight / 2 + 4,
            previewWidth + 6,
            previewHeight + 6,
            previewTheme.heroGlowColor,
            0.12,
        );
        shadow.setStrokeStyle(1, previewTheme.heroGlowColor, 0.12);

        const outerCard = this.scene.add.rectangle(
            previewWidth / 2,
            previewHeight / 2,
            previewWidth,
            previewHeight,
            detail.fillColor,
            0.99,
        );
        outerCard.setStrokeStyle(2, detail.accentColor, 0.95);
        const innerFrame = this.scene.add.rectangle(
            previewWidth / 2,
            previewHeight / 2,
            previewWidth - 8,
            previewHeight - 8,
            0x000000,
            0,
        );
        innerFrame.setStrokeStyle(1, previewTheme.borderColor, 0.28);

        const header = this.scene.add.rectangle(
            previewWidth / 2,
            headerHeight / 2,
            previewWidth - 2,
            headerHeight,
            previewTheme.headerFillColor,
            1,
        );
        header.setStrokeStyle(1, previewTheme.borderColor, 0.5);
        const headerGlow = this.scene.add.rectangle(
            previewWidth / 2,
            headerHeight,
            previewWidth - 18,
            8,
            previewTheme.heroGlowColor,
            0.12,
        );

        const hero = this.scene.add.rectangle(
            previewWidth / 2,
            heroTop + heroHeight / 2,
            innerWidth,
            heroHeight,
            previewTheme.heroFillColor,
            1,
        );
        hero.setStrokeStyle(1, previewTheme.heroGlowColor, 0.6);
        const heroAccent = this.scene.add.rectangle(
            contentLeft + 4,
            heroTop + heroHeight / 2,
            6,
            heroHeight - 12,
            previewTheme.accentColor,
            0.9,
        ).setOrigin(0, 0.5);

        const heroGlow = this.scene.add.rectangle(
            previewWidth - 40,
            heroTop + heroHeight / 2,
            56,
            heroHeight - 8,
            previewTheme.heroGlowColor,
            0.18,
        );

        const headerTitle = this.scene.add.text(12, headerHeight / 2, '焦点牌面', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        let collapseButtonBg: GameObjects.Rectangle | null = null;
        let collapseButtonText: GameObjects.Text | null = null;
        if (this.detailPaneExpanded) {
            const collapseButtonWidth = 78;
            const collapseButtonHeight = 44;
            const collapseButtonX = previewWidth - 14 - collapseButtonWidth / 2;
            collapseButtonBg = this.scene.add.rectangle(
                collapseButtonX,
                headerHeight / 2,
                collapseButtonWidth,
                collapseButtonHeight,
                expeditionUiTheme.colors.panel,
                0.96,
            );
            collapseButtonBg.setStrokeStyle(1, previewTheme.borderColor, 0.42);
            collapseButtonBg.setInteractive({ useHandCursor: true });
            collapseButtonBg.on('pointerover', () => collapseButtonBg?.setFillStyle(BUTTON_NEUTRAL_HOVER_FILL, 0.98));
            collapseButtonBg.on('pointerout', () => collapseButtonBg?.setFillStyle(expeditionUiTheme.colors.panel, 0.96));
            collapseButtonBg.on('pointerdown', () => this.toggleDetailPane(false));
            collapseButtonText = this.scene.add.text(collapseButtonX, headerHeight / 2, '收起', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f3ead3',
                fontStyle: 'bold',
            }).setOrigin(0.5);
        }
        const [kindBadgeBg, kindBadgeText] = createBadge(
            18,
            heroTop + 16,
            detail.kindLabel,
            previewTheme.badgeFillColor,
            previewTheme.badgeTextColor,
        );
        const [rarityBadgeBg, rarityBadgeText] = createBadge(
            previewWidth - 18,
            heroTop + 16,
            detail.rarityLabel,
            detail.rarityColor,
            '#f3ead3',
            'right',
        );

        const heroName = this.scene.add.text(18, heroTop + 54, truncateLabel(detail.displayName, compactPreview ? 16 : 18), {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: compactPreview ? '20px' : '22px',
            color: '#f3ead3',
            fontStyle: 'bold',
        });
        const heroSupport = this.scene.add.text(18, heroTop + heroHeight - 48, supportLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            fontStyle: 'bold',
            wordWrap: { width: innerWidth - 88 },
        }).setOrigin(0, 1).setVisible(showHeroSupport);

        const heroGlyph = this.scene.add.text(previewWidth - 44, heroTop + heroHeight / 2 + 4, detail.kindGlyph, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: compactPreview ? '48px' : '56px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5).setAlpha(0.2);

        const statusRibbon = this.scene.add.rectangle(
            previewWidth / 2,
            heroTop + heroHeight - 16,
            innerWidth - 18,
            24,
            blendColor(previewTheme.heroFillColor, detail.accentColor, 0.45),
            0.68,
        );
        statusRibbon.setStrokeStyle(1, detail.accentColor, 0.55);
        const statusText = this.scene.add.text(previewWidth / 2, heroTop + heroHeight - 16, truncateLabel(detail.statusLabel, compactPreview ? 16 : 20), {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: detail.statusColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const metricBoxes: GameObjects.GameObject[] = [];
        detail.ownershipStats.forEach((metric, index) => {
            const metricLeft = contentLeft + index * (metricWidth + metricGap);
            const metricBg = this.scene.add.rectangle(
                metricLeft + metricWidth / 2,
                metricsTop + metricHeight / 2,
                metricWidth,
                metricHeight,
                metric.fillColor,
                0.98,
            );
            metricBg.setStrokeStyle(1, metric.borderColor, 0.75);
            const metricText = this.scene.add.text(metricLeft + metricWidth / 2, metricsTop + metricHeight / 2, `${metric.label} ${metric.value}`, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: metric.valueColor,
                fontStyle: 'bold',
            }).setOrigin(0.5);
            metricBoxes.push(metricBg, metricText);
        });

        const copyPanel = this.scene.add.rectangle(
            previewWidth / 2,
            copyTop + copyPanelHeight / 2,
            innerWidth,
            copyPanelHeight,
            0x0b1220,
            0.98,
        );
        copyPanel.setStrokeStyle(1, previewTheme.borderColor, 0.4);
        const copyAccent = this.scene.add.rectangle(
            contentLeft + 3,
            copyTop + copyPanelHeight / 2,
            4,
            Math.max(22, copyPanelHeight - 10),
            previewTheme.accentColor,
            0.9,
        ).setOrigin(0, 0.5);
        const copyTitle = this.scene.add.text(contentLeft + 12, copyTop + 8, detail.primaryCopyTitle, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            fontStyle: 'bold',
        });
        const copyBody = this.scene.add.text(contentLeft + 12, copyTop + 34, primaryCopy, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: detail.bodyColor,
            lineSpacing: 4,
            wordWrap: { width: innerWidth - 28 },
        });

        const secondaryLine = this.scene.add.text(
            contentLeft + 12,
            copyTop + copyPanelHeight - 30,
            secondaryCopy ? `${detail.secondaryCopyTitle}：${secondaryCopy}` : '',
            {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#e8d5ab',
                wordWrap: { width: innerWidth - 28 },
            },
        );
        secondaryLine.setVisible(Boolean(secondaryCopy));

        const footerSeparator = this.scene.add.rectangle(
            previewWidth / 2,
            footerTop - 14,
            innerWidth,
            1,
            detail.accentColor,
            0.45,
        );
        const footerText = this.scene.add.text(contentLeft, footerTop, footerCopy, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            wordWrap: { width: innerWidth },
        }).setOrigin(0, 1);

        nextContent.add([
            shadow,
            outerCard,
            innerFrame,
            header,
            headerGlow,
            hero,
            heroAccent,
            heroGlow,
            headerTitle,
            ...(collapseButtonBg && collapseButtonText ? [collapseButtonBg, collapseButtonText] : []),
            kindBadgeBg,
            kindBadgeText,
            rarityBadgeBg,
            rarityBadgeText,
            heroName,
            heroSupport,
            heroGlyph,
            statusRibbon,
            statusText,
            ...metricBoxes,
            copyPanel,
            copyAccent,
            copyTitle,
            copyBody,
            secondaryLine,
            footerSeparator,
            footerText,
        ]);

        const previousContent = this.detailPaneContent;
        this.detailPaneContent = nextContent;

        if (!animate || !previousContent) {
            this.detailPaneContainer.removeAll(true);
            this.detailPaneContainer.add(nextContent);
            nextContent.setAlpha(1);
            nextContent.setScale(1, 1);
            return;
        }

        this.detailPaneContainer.add(nextContent);
        nextContent.setAlpha(0);
        nextContent.setScale(0.975, 0.975);
        previousContent.setAlpha(1);
        previousContent.setScale(1, 1);

        this.scene.tweens.killTweensOf(previousContent);
        this.scene.tweens.killTweensOf(nextContent);

        this.scene.tweens.add({
            targets: previousContent,
            alpha: 0,
            scaleX: 1.02,
            scaleY: 1.02,
            duration: 110,
            ease: 'Cubic.easeIn',
            onComplete: () => previousContent.destroy(),
        });
        this.scene.tweens.add({
            targets: nextContent,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 170,
            ease: 'Cubic.easeOut',
        });
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (this.dialogMode) {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.confirmDelete();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.hideDeleteConfirmation();
            }
            return;
        }

        if (this.namingMode) {
            if (this.nativeTextEntry.isFocused(DECK_NAMING_TEXT_ENTRY_SESSION_ID)) {
                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                this.confirmRename();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.cancelRename();
            }
            return;
        }

        if (this.searchFocus) {
            if (this.nativeTextEntry.isFocused(DECK_SEARCH_TEXT_ENTRY_SESSION_ID)) {
                return;
            }

            if (event.key === 'Escape' || event.key === 'Enter') {
                event.preventDefault();
                this.setSearchFocus(false);
            }
            return;
        }

        const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;

        if (event.key === 'Tab') {
            event.preventDefault();
            this.cycleKeyboardZone(event.shiftKey ? -1 : 1);
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            this.setKeyboardZone('return');
            this.config.onClose();
            return;
        }

        if (event.key === '/') {
            event.preventDefault();
            this.setKeyboardZone('browser');
            this.setSearchFocus(true);
            return;
        }

        switch (this.keyboardZone) {
            case 'decks':
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.focusNextDeck(-1);
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.focusNextDeck(1);
                } else if (normalizedKey === 'n') {
                    event.preventDefault();
                    this.createDeck();
                } else if (normalizedKey === 'r') {
                    event.preventDefault();
                    this.beginRenameSelectedDeck();
                } else if (event.key === 'Delete') {
                    event.preventDefault();
                    this.showDeleteConfirmation();
                }
                break;
            case 'editor': {
                const deck = this.getSelectedDeck();
                const editorStep = Math.max(1, this.editorGridColumns);
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.focusEditorIndex(this.getFocusedEditorIndex(deck) - editorStep);
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.focusEditorIndex(this.getFocusedEditorIndex(deck) + editorStep);
                } else if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    this.focusEditorIndex(this.getFocusedEditorIndex(deck) - 1);
                } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    this.focusEditorIndex(this.getFocusedEditorIndex(deck) + 1);
                } else if (event.key === 'Home') {
                    event.preventDefault();
                    this.focusEditorIndex(0);
                } else if (event.key === 'End') {
                    event.preventDefault();
                    this.focusEditorIndex(Number.MAX_SAFE_INTEGER);
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    this.removeFocusedEditorCard(false);
                } else if (normalizedKey === 'x' || event.key === 'Delete') {
                    event.preventDefault();
                    this.removeFocusedEditorCard(true);
                } else if (normalizedKey === 'i') {
                    event.preventDefault();
                    this.toggleDetailPane();
                }
                break;
            }
            case 'browser': {
                const { rows } = this.buildBrowserCollections();
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.focusBrowserIndex(this.getFocusedBrowserIndex(rows) - 1, rows);
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.focusBrowserIndex(this.getFocusedBrowserIndex(rows) + 1, rows);
                } else if (event.key === 'Home') {
                    event.preventDefault();
                    this.focusBrowserIndex(0, rows);
                } else if (event.key === 'End') {
                    event.preventDefault();
                    this.focusBrowserIndex(Number.MAX_SAFE_INTEGER, rows);
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    this.addFocusedBrowserCard(false);
                } else if (normalizedKey === 'f') {
                    event.preventDefault();
                    this.addFocusedBrowserCard(true);
                } else if (normalizedKey === 'k') {
                    event.preventDefault();
                    this.cycleBrowserKindFilter();
                } else if (normalizedKey === 'h') {
                    event.preventDefault();
                    this.toggleBrowserHideZero();
                } else if (normalizedKey === 's') {
                    event.preventDefault();
                    this.cycleBrowserSortField();
                } else if (normalizedKey === 'd') {
                    event.preventDefault();
                    this.toggleBrowserSortDirection();
                } else if (normalizedKey === 'r') {
                    event.preventDefault();
                    this.resetBrowserControls();
                    this.syncKeyboardZoneSelection();
                } else if (normalizedKey === 'i') {
                    event.preventDefault();
                    this.toggleDetailPane();
                }
                break;
            }
            case 'return':
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.config.onClose();
                }
                break;
        }
    }

    private handleWheel(pointer: Phaser.Input.Pointer, deltaY: number): void {
        if (this.dialogMode) return;

        const direction = Math.sign(deltaY);
        if (direction === 0) return;

        const deckArea = this.deckListArea;
        if (pointer.x >= deckArea.x && pointer.x <= deckArea.x + deckArea.w && pointer.y >= deckArea.y && pointer.y <= deckArea.y + deckArea.h) {
            this.deckListScrollOffset += direction;
            this.refreshDeckList();
            return;
        }

        const editorArea = this.editorArea;
        if (pointer.x >= editorArea.x && pointer.x <= editorArea.x + editorArea.w && pointer.y >= editorArea.y && pointer.y <= editorArea.y + editorArea.h) {
            this.editorScrollOffset += direction;
            this.refreshEditor();
            return;
        }

        const browserArea = this.browserArea;
        if (pointer.x >= browserArea.x && pointer.x <= browserArea.x + browserArea.w && pointer.y >= browserArea.y && pointer.y <= browserArea.y + browserArea.h) {
            this.browserScrollOffset += direction;
            this.refreshBrowser();
        }
    }

    private confirmRename(): void {
        if (!this.namingMode || !this.namingDeckId) return;

        const deck = this.stash.savedDecks.find((savedDeck) => savedDeck.id === this.namingDeckId);
        const trimmed = this.renameBuffer.trim();
        if (trimmed.length === 0) {
            this.refreshEditor();
            return;
        }

        this.resetDeckNamingState();

        if (!deck || deck.name === trimmed) {
            this.refreshDeckViews();
            return;
        }

        this.applyStashChange(renameSavedDeckInStash(this.stash, deck.id, trimmed));
        this.refreshDeckViews();
    }

    private cancelRename(): void {
        this.resetDeckNamingState();
        this.refreshEditor();
    }

    private setSearchFocus(focused: boolean): void {
        if (this.searchFocus === focused) return;
        this.searchFocus = focused;

        if (focused) {
            this.setKeyboardZone('browser');
            if (this.namingMode) {
                this.cancelRename();
            }

            this.nativeTextEntry.activate({
                id: DECK_SEARCH_TEXT_ENTRY_SESSION_ID,
                ariaLabel: '储物袋搜索输入',
                value: this.filterQuery,
                placeholder: '搜索卡牌、编号或名称',
                getBounds: () => this.getSearchTextEntryBounds(),
                style: {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: 18,
                    color: '#f3ead3',
                    placeholderColor: '#64748b',
                    lineHeight: 24,
                },
                onValueChange: (value) => {
                    this.filterQuery = value;
                    this.refreshBrowser();
                    this.updateSearchDisplay();
                },
                onConfirm: (value) => {
                    this.filterQuery = value;
                    this.setSearchFocus(false);
                },
                onCancel: () => this.setSearchFocus(false),
                onBlur: () => {
                    if (this.searchFocus) {
                        this.setSearchFocus(false);
                    }
                },
            });
            this.scene.input.on('pointerdown', this.handleSearchClickOutside, this);
        } else {
            this.nativeTextEntry.deactivate(DECK_SEARCH_TEXT_ENTRY_SESSION_ID);
            this.scene.input.off('pointerdown', this.handleSearchClickOutside, this);
        }

        this.updateSearchDisplay();
        this.refreshKeyboardGuide();
    }

    private handleSearchClickOutside(pointer: Phaser.Input.Pointer): void {
        if (!this.searchFocus) return;

        if (this.queryBg) {
            const bounds = this.queryBg.getBounds();
            if (bounds.contains(pointer.x, pointer.y)) {
                return;
            }
        }

        if (this.queryClearBtn && this.queryClearBtn.visible) {
            const bounds = this.queryClearBtn.getBounds();
            if (bounds.contains(pointer.x, pointer.y)) {
                return;
            }
        }

        this.setSearchFocus(false);
    }

    private updateSearchDisplay(): void {
        if (!this.queryText || !this.queryBg) return;

        const hasQuery = this.filterQuery.trim().length > 0;
        const nativeSearchActive = this.nativeTextEntry.isActive(DECK_SEARCH_TEXT_ENTRY_SESSION_ID);
        this.queryText.setVisible(!nativeSearchActive);

        if (this.searchFocus) {
            if (!nativeSearchActive) {
                this.queryText.setText(this.filterQuery || '搜索卡牌、编号或名称');
                this.queryText.setColor(hasQuery ? '#f3ead3' : '#64748b');
            }
            this.queryBg.setFillStyle(PANEL_INPUT_ACTIVE_FILL, 1);
            this.queryBg.setStrokeStyle(2, PANEL_ACCENT, 0.95);
        } else {
            this.queryText.setText(this.filterQuery || '搜索卡牌、编号或名称');
            this.queryText.setColor(hasQuery ? '#f3ead3' : '#64748b');
            this.queryBg.setFillStyle(hasQuery ? PANEL_INPUT_FILLED_FILL : expeditionUiTheme.colors.panel, 1);
            this.queryBg.setStrokeStyle(1, hasQuery ? SELECTED_ACCENT : SECTION_BORDER, hasQuery ? 0.95 : 0.9);
        }

        if (this.queryClearBtn) {
            this.queryClearBtn.setVisible(this.filterQuery.length > 0);
            this.queryClearBtn.setColor(this.searchFocus ? '#f3ead3' : '#bca785');
        }
    }

    private hasModifiedBrowserControls(): boolean {
        return this.filterQuery.trim().length > 0
            || this.filterKind !== undefined
            || !this.filterHideZero
            || this.sortField !== DEFAULT_BROWSER_SORT_FIELD
            || this.sortDirection !== DEFAULT_BROWSER_SORT_DIRECTION;
    }

    private resetBrowserControls(): void {
        this.filterQuery = '';
        this.filterHideZero = true;
        this.filterKind = undefined;
        this.sortField = DEFAULT_BROWSER_SORT_FIELD;
        this.sortDirection = DEFAULT_BROWSER_SORT_DIRECTION;
        this.setSearchFocus(false);
        this.refreshBrowser();
    }

    private cycleBrowserKindFilter(): void {
        const idx = KIND_CYCLE.indexOf(this.filterKind);
        this.filterKind = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length];
        this.refreshBrowser();
        this.syncKeyboardZoneSelection();
    }

    private toggleBrowserHideZero(): void {
        this.filterHideZero = !this.filterHideZero;
        this.refreshBrowser();
        this.syncKeyboardZoneSelection();
    }

    private cycleBrowserSortField(): void {
        const idx = BROWSER_SORT_FIELDS.indexOf(this.sortField);
        this.sortField = BROWSER_SORT_FIELDS[(idx + 1) % BROWSER_SORT_FIELDS.length];
        this.refreshBrowser();
        this.syncKeyboardZoneSelection();
    }

    private toggleBrowserSortDirection(): void {
        this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        this.refreshBrowser();
        this.syncKeyboardZoneSelection();
    }

    private createDeck(): void {
        const id = createDeckId();
        const createdStash = addSavedDeckToStash(this.stash, id, null, []);
        const selectedStash = selectDeckInStash(createdStash, id);
        const createdDeck = selectedStash.savedDecks.find((savedDeck) => savedDeck.id === id);
        this.setKeyboardZone('decks');
        this.applyStashChange(selectedStash);
        this.beginDeckNaming('create', id, createdDeck?.name ?? '');
        this.deckListScrollOffset = Math.max(0, selectedStash.savedDecks.length - this.deckListVisibleRows);
        this.refreshDeckViews();
    }

    private beginRenameSelectedDeck(): void {
        const deck = this.getSelectedDeck();
        if (!deck) {
            return;
        }

        this.beginDeckNaming('rename', deck.id, deck.name);
        this.refreshEditor();
    }

    private focusNextDeck(delta: number): void {
        const decks = this.stash.savedDecks;
        if (decks.length === 0) {
            return;
        }

        const currentIndex = Math.max(0, decks.findIndex((deck) => deck.id === this.selectedDeckId));
        const nextIndex = clampNumber(currentIndex + delta, 0, decks.length - 1);
        const nextDeck = decks[nextIndex];
        if (!nextDeck || nextDeck.id === this.selectedDeckId) {
            if (this.ensureSelectedDeckVisible()) {
                this.refreshDeckList();
            }
            return;
        }

        this.setKeyboardZone('decks');
        this.applyStashChange(selectDeckInStash(this.stash, nextDeck.id));
        this.ensureSelectedDeckVisible();
        this.refreshDeckViews();
    }

    private removeFocusedEditorCard(removeAll = false): void {
        const deck = this.getSelectedDeck();
        if (!deck || deck.cards.length === 0) {
            return;
        }

        const focusedIndex = this.getFocusedEditorIndex(deck);
        if (focusedIndex < 0) {
            return;
        }

        const stack = deck.cards[focusedIndex];
        if (!stack) {
            return;
        }

        this.setKeyboardZone('editor');
        this.setDetailCardId(stack.id);
        this.updateDeckCards(deck.id, adjustDeckCardCount(deck.cards, stack.id, removeAll ? -stack.count : -1));
    }

    private addFocusedBrowserCard(quickAdd = false): void {
        const selectedDeck = this.getSelectedDeck();
        if (!selectedDeck) {
            return;
        }

        const { rows } = this.buildBrowserCollections();
        if (rows.length === 0) {
            return;
        }

        const focusedIndex = this.getFocusedBrowserIndex(rows);
        if (focusedIndex < 0) {
            return;
        }

        const row = rows[focusedIndex];
        if (!row) {
            return;
        }

        const deckCards = selectedDeck.cards;
        const selectedCapacity = summarizeDeckCapacity(deckCards);
        const available = computeAvailable(this.stash.cards, deckCards, row.id);
        const quickAddCount = getQuickAddCount(available, selectedCapacity.slotsRemainingToMax);
        const delta = quickAdd ? quickAddCount : 1;
        if (delta <= 0) {
            return;
        }

        this.setKeyboardZone('browser');
        this.setDetailCardId(row.id);
        this.updateDeckCards(selectedDeck.id, adjustDeckCardCount(deckCards, row.id, delta));
    }

    private refreshBrowserSummary(
        resultCount: number,
        matchedCount: number,
        totalCount: number,
        selectedDeck: SavedDeck | null,
        selectedSummary: DeckStatusSummary | null,
        selectedCapacity: DeckCapacityMetrics | null,
    ): void {
        if (!this.browserSummaryContainer) {
            return;
        }

        this.browserSummaryContainer.removeAll(true);

        const hasModifiedControls = this.hasModifiedBrowserControls();
        const hiddenZeroCount = Math.max(0, matchedCount - resultCount);

        let detailColor = '#e6f3ea';

        if (resultCount === 0 && (hasModifiedControls || matchedCount > 0)) {
            detailColor = '#fcd34d';
        } else if (resultCount === 0) {
            detailColor = '#d9c6a2';
        } else if (hasModifiedControls) {
            detailColor = '#d9c6a2';
        }

        const selectedSlotsRemaining = Math.max(selectedCapacity?.slotsRemainingToMax ?? 0, 0);
        const selectedCount = selectedSummary?.count ?? 0;

        let summaryLine = selectedDeck
            ? `可加入 ${resultCount} 条 · 空位 ${selectedSlotsRemaining} 张`
            : '先在左侧选定卡组';

        if (selectedDeck && selectedSlotsRemaining <= 0) {
            summaryLine = `当前卡组已满 · 先在左侧移除`;
        } else if (selectedDeck && resultCount === 0 && hiddenZeroCount > 0 && this.filterHideZero) {
            summaryLine = `命中 ${matchedCount} 条，但都被零库存隐藏`;
        } else if (selectedDeck && resultCount === 0) {
            summaryLine = hasModifiedControls
                ? '当前条件下没有可加入条目'
                : `当前没有可加入条目 · 当前卡组 ${selectedCount} 张`;
        } else if (selectedDeck) {
            summaryLine = joinPreviewFacts(
                [
                    `可加入 ${resultCount} 条`,
                    `空位 ${selectedSlotsRemaining} 张`,
                    selectedSummary?.statusLabel,
                    this.filterHideZero && hiddenZeroCount > 0 ? `零张隐藏 ${hiddenZeroCount}` : null,
                ],
                64,
            ) ?? summaryLine;
        } else if (hasModifiedControls) {
            summaryLine = joinPreviewFacts(
                [
                    summaryLine,
                    `命中 ${resultCount} / ${matchedCount || totalCount} 条`,
                    this.filterHideZero && hiddenZeroCount > 0 ? `零张隐藏 ${hiddenZeroCount}` : null,
                ],
                64,
            ) ?? summaryLine;
        }

        const headlineText = this.scene.add.text(2, this.browserSummaryArea.h / 2, truncateLabel(summaryLine, hasModifiedControls ? 36 : 44), {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: detailColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.browserSummaryContainer.add(headlineText);

        if (hasModifiedControls) {
            const resetButton = this.createButton(
                this.browserSummaryArea.w - 52,
                this.browserSummaryArea.h / 2,
                96,
                SECONDARY_BUTTON_HEIGHT,
                '恢复默认',
                BUTTON_ACCENT_FILL,
                () => {
                    this.setKeyboardZone('browser');
                    this.resetBrowserControls();
                    this.syncKeyboardZoneSelection();
                },
                false,
                {
                    hoverFillColor: PANEL_ATTENTION_HOVER_FILL,
                    strokeColor: expeditionUiTheme.colors.goldSoft,
                    fontSize: '18px',
                },
            );
            this.browserSummaryContainer.add(resetButton);
        } else {
            const defaultPill = this.createRightAlignedPill(
                this.browserSummaryArea.w - 12,
                this.browserSummaryArea.h / 2,
                '默认浏览',
                expeditionUiTheme.colors.panelInner,
                '#d9c6a2',
            );
            this.browserSummaryContainer.add(defaultPill);
        }
    }

    private applyStashChange(newStash: PersistentStash): void {
        const nextSelectedDeckId = newStash.selectedDeckId ?? newStash.savedDecks[0]?.id ?? null;
        if (this.selectedDeckId !== nextSelectedDeckId) {
            this.pendingSelectedDeckMotionId = nextSelectedDeckId;
            this.detailPaneExpanded = false;
        }

        const shouldKeepDeckNaming = this.namingMode !== null
            && this.namingDeckId !== null
            && this.namingDeckId === nextSelectedDeckId
            && newStash.savedDecks.some((savedDeck) => savedDeck.id === this.namingDeckId);
        if (!shouldKeepDeckNaming) {
            this.resetDeckNamingState();
        }

        this.stash = newStash;
        this.config.onStashChange(this.stash);
        this.selectedDeckId = nextSelectedDeckId;
        this.ensureDetailCardSelection();
    }

    private refreshDeckViews(): void {
        this.refreshDeckList();
        this.refreshEditor();
        this.refreshBrowser();
        this.pendingSelectedDeckMotionId = null;
        this.refreshKeyboardGuide();
    }

    private updateDeckCards(deckId: string, cards: readonly ExpeditionCardStack[]): void {
        const newStash = updateSavedDeckInStash(this.stash, deckId, cards);
        this.applyStashChange(newStash);
        this.refreshDeckViews();
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(1460, width * 0.984);
        const panelHeight = Math.min(920, height * 0.96);
        const panelX = width / 2;
        const panelY = height / 2 + 12;
        this.panelFrame = {
            panelX,
            panelY,
            panelWidth,
            panelHeight,
        };

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, expeditionUiTheme.colors.overlay, 0.82);
        overlay.setInteractive();

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, PANEL_FILL, 0.98);
        panel.setStrokeStyle(2, PANEL_ACCENT, 0.82);

        const panelLeft = panelX - panelWidth / 2;
        const panelRight = panelX + panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const panelBottom = panelY + panelHeight / 2;
        const keyboardGuideWidth = Math.min(428, Math.max(336, panelWidth * 0.28));
        const keyboardGuideHeight = FOOTER_GUIDE_HEIGHT;
        const footerY = panelBottom - 20;
        const keyboardGuideLeft = panelRight - 22 - keyboardGuideWidth;
        this.keyboardGuideBg = this.scene.add.rectangle(
            keyboardGuideLeft + keyboardGuideWidth / 2,
            footerY,
            keyboardGuideWidth,
            keyboardGuideHeight,
            expeditionUiTheme.colors.panel,
            0.8,
        );
        this.keyboardGuideBg.setStrokeStyle(1, blendColor(PANEL_ACCENT, SECTION_BORDER, 0.28), 0.34);
        this.keyboardGuideAccent = this.scene.add.rectangle(
            keyboardGuideLeft + 10,
            footerY,
            3,
            keyboardGuideHeight - 12,
            PANEL_ACCENT,
            0.52,
        ).setOrigin(0, 0.5);
        this.keyboardGuideHeadline = this.scene.add.text(keyboardGuideLeft + 18, footerY - 7, '', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0, 1);
        this.keyboardGuideDetail = this.scene.add.text(keyboardGuideLeft + 18, footerY + 2, '', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
        }).setOrigin(0, 0);
        const [keyboardGuidePillBg, keyboardGuidePillText] = this.createRightAlignedPill(
            panelRight - 16,
            footerY,
            'Tab 切换区域 · Esc 返回',
            expeditionUiTheme.colors.panel,
            '#d9c6a2',
            {
                fontSize: '18px',
                height: FOOTER_GUIDE_PILL_HEIGHT,
                horizontalPadding: 28,
                minWidth: 112,
            },
        );
        this.keyboardGuidePillBg = keyboardGuidePillBg;
        this.keyboardGuidePillText = keyboardGuidePillText;

        const contentY = panelTop + 16;
        const contentBottom = footerY - keyboardGuideHeight / 2 - 10;
        const contentH = contentBottom - contentY;

        const columnGap = 8;
        const leftColX = panelLeft + 18;
        const contentWidth = panelWidth - 36;
        const rightColW = Math.max(320, Math.min(360, Math.floor(contentWidth * 0.24)));
        const leftWorkspaceW = contentWidth - rightColW - columnGap;
        const rightColX = leftColX + leftWorkspaceW + columnGap;
        const leftWorkspaceInnerX = leftColX + 10;
        const leftWorkspaceInnerY = contentY + 8;
        const leftWorkspaceInnerW = leftWorkspaceW - 20;
        const leftWorkspaceInnerH = contentH - 14;
        const editorW = leftWorkspaceInnerW;
        const editorX = leftWorkspaceInnerX;

        this.add([
            overlay,
            panel,
        ]);

        this.add(this.createWorkspaceShell(
            leftColX,
            contentY,
            leftWorkspaceW,
            contentH,
            PANEL_ACCENT,
        ));
        this.createEditorColumn(editorX, leftWorkspaceInnerY, editorW, leftWorkspaceInnerH, { embedded: true });
        this.createBrowserColumn(rightColX, contentY, rightColW, contentH);
        this.add([
            this.keyboardGuideBg,
            this.keyboardGuideAccent,
            this.keyboardGuideHeadline,
            this.keyboardGuideDetail,
            this.keyboardGuidePillBg,
            this.keyboardGuidePillText,
        ]);

        this.setDepth(1200);
        this.refreshKeyboardGuide();
    }

    private createButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        fillColor: number,
        onClick: () => void,
        disabled = false,
        options: ButtonVisualOptions = {},
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const strokeColor = options.strokeColor ?? 0xffffff;
        const hoverFillColor = options.hoverFillColor ?? fillColor;
        const disabledFillColor = options.disabledFillColor ?? expeditionUiTheme.colors.slate;
        const disabledStrokeColor = options.disabledStrokeColor ?? expeditionUiTheme.colors.slate;
        const textColor = options.textColor ?? '#f3ead3';
        const disabledTextColor = options.disabledTextColor ?? '#bca785';

        const button = this.scene.add.rectangle(
            x,
            y,
            w,
            h,
            disabled ? disabledFillColor : fillColor,
            1,
        );
        button.setStrokeStyle(1, disabled ? disabledStrokeColor : strokeColor, disabled ? 0.9 : 0.95);
        button.setData('baseFillColor', disabled ? disabledFillColor : fillColor);
        button.setData('hoverFillColor', disabled ? disabledFillColor : hoverFillColor);

        if (!disabled) {
            button.setInteractive({ useHandCursor: true });
            button.on('pointerover', () => {
                const nextFillColor = Number(button.getData('hoverFillColor') ?? hoverFillColor);
                button.setFillStyle(nextFillColor, 1);
            });
            button.on('pointerout', () => {
                const nextFillColor = Number(button.getData('baseFillColor') ?? fillColor);
                button.setFillStyle(nextFillColor, 1);
            });
            button.on('pointerdown', onClick);
        } else {
            button.setAlpha(0.78);
        }

        const text = this.scene.add.text(x, y, label, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: options.fontSize
                ?? (h >= PRIMARY_BUTTON_HEIGHT ? '20px' : h >= SECONDARY_BUTTON_HEIGHT ? '18px' : h >= 32 ? '16px' : '14px'),
            color: disabled ? disabledTextColor : textColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);

        return [button, text];
    }

    private setButtonVisualState(
        button: GameObjects.Rectangle | undefined,
        text: GameObjects.Text | undefined,
        config: {
            fillColor: number;
            hoverFillColor: number;
            strokeColor: number;
            textColor?: string;
        },
    ): void {
        if (!button || !text) {
            return;
        }

        button.setFillStyle(config.fillColor, 1);
        button.setStrokeStyle(1, config.strokeColor, 0.95);
        button.setData('baseFillColor', config.fillColor);
        button.setData('hoverFillColor', config.hoverFillColor);
        text.setColor(config.textColor ?? '#f3ead3');
    }

    private createPill(
        x: number,
        y: number,
        label: string,
        fillColor: number,
        textColor = '#f3ead3',
        options: PillVisualOptions = {},
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const fontSize = options.fontSize ?? '16px';
        const height = options.height ?? 32;
        const horizontalPadding = options.horizontalPadding ?? 24;
        const minWidth = options.minWidth ?? 76;
        const text = this.scene.add.text(x + 10, y, label, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize,
            color: textColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);

        const width = Math.max(minWidth, text.width + horizontalPadding);
        const bg = this.scene.add.rectangle(x + width / 2, y, width, height, fillColor, 1);
        bg.setStrokeStyle(1, 0xffffff, 0.08);
        return [bg, text];
    }

    private createRightAlignedPill(
        rightX: number,
        y: number,
        label: string,
        fillColor: number,
        textColor = '#f3ead3',
        options: PillVisualOptions = {},
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const [bg, text] = this.createPill(0, y, label, fillColor, textColor, options);
        const width = bg.width;
        bg.setX(rightX - width / 2);
        text.setX(rightX - width + 10);
        return [bg, text];
    }

    private createCompactCardGlyphBadge(
        x: number,
        y: number,
        kind: CardKind | undefined,
        rarity: CardRarity | undefined,
    ): Phaser.GameObjects.GameObject[] {
        const theme = getPreviewTheme(kind);
        const rarityColor = getRarityAccentColor(rarity);
        const glyph = getCardKindGlyph(kind);

        const glow = this.scene.add.rectangle(x + 20, y + 22, 40, 48, theme.heroGlowColor, 0.08);
        glow.setStrokeStyle(1, theme.heroGlowColor, 0.08);

        const outer = this.scene.add.rectangle(
            x + 20,
            y + 22,
            36,
            44,
            blendColor(expeditionUiTheme.colors.panel, theme.heroFillColor, 0.76),
            0.98,
        );
        outer.setStrokeStyle(1, theme.borderColor, 0.78);

        const accent = this.scene.add.rectangle(
            x + 4,
            y + 22,
            4,
            28,
            theme.accentColor,
            0.92,
        ).setOrigin(0, 0.5);

        const rarityPip = this.scene.add.rectangle(x + 28, y + 8, 12, 12, rarityColor, 0.96);
        rarityPip.setStrokeStyle(1, 0xffffff, 0.14);

        const glyphText = this.scene.add.text(x + 20, y + 22, glyph, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '16px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0.5).setAlpha(0.88);

        return [glow, outer, accent, rarityPip, glyphText];
    }

    private createSectionFrame(
        x: number,
        y: number,
        w: number,
        h: number,
        title: string,
        subtitle: string,
        accentColor: number,
    ): Phaser.GameObjects.GameObject[] {
        const background = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, SECTION_FILL, 0.95);
        background.setStrokeStyle(1, SECTION_BORDER, 0.82);

        const accent = this.scene.add.rectangle(x + 16, y + 22, 5, 26, accentColor, 0.96);
        const titleText = this.scene.add.text(x + 28, y + 10, title, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '24px',
            color: '#f3ead3',
            fontStyle: 'bold',
        });
        const subtitleText = this.scene.add.text(x + 28, y + 40, subtitle, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '16px',
            color: '#bca785',
            wordWrap: { width: w - 48 },
        });

        return [background, accent, titleText, subtitleText];
    }

    private createWorkspaceShell(
        x: number,
        y: number,
        w: number,
        h: number,
        accentColor: number,
    ): Phaser.GameObjects.GameObject[] {
        const background = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, SECTION_FILL, 0.95);
        background.setStrokeStyle(1, SECTION_BORDER, 0.82);

        const accent = this.scene.add.rectangle(x + 18, y + 14, 54, 3, accentColor, 0.82).setOrigin(0, 0.5);
        const accentGlow = this.scene.add.rectangle(x + 18, y + 14, 66, 7, accentColor, 0.08).setOrigin(0, 0.5);

        return [background, accentGlow, accent];
    }

    private refreshDeckList(): void {
        if (!this.deckListInner) return;
        this.deckListInner.removeAll(true);

        const decks = this.stash.savedDecks;
        const maxOffset = Math.max(0, decks.length - this.deckListVisibleRows);
        this.deckListScrollOffset = clampNumber(this.deckListScrollOffset, 0, maxOffset);

        const selectedDeck = this.getSelectedDeck();
        const selectedDeckSummary = selectedDeck ? summarizeDeckStatus(selectedDeck, this.stash.cards) : null;
        if (this.deckListSummaryContainer) {
            this.deckListSummaryContainer.removeAll(true);

            const rosterHealth = summarizeDeckRosterHealth(decks, this.stash.cards);
            const selectedIndex = selectedDeck
                ? decks.findIndex((deck) => deck.id === selectedDeck.id)
                : -1;
            const currentDeckAccentColor = selectedDeckSummary
                ? blendColor(SELECTED_ACCENT, selectedDeckSummary.accentColor, selectedDeckSummary.isValid ? 0.18 : 0.55)
                : SECTION_BORDER;
            const summaryBg = this.scene.add.rectangle(
                this.deckListArea.w / 2,
                this.deckListSummaryHeight / 2,
                this.deckListArea.w,
                this.deckListSummaryHeight,
                this.deckListCompact ? PANEL_DEEP_FILL : selectedDeck ? PANEL_SELECTED_FILL : expeditionUiTheme.colors.panel,
                this.deckListCompact ? 0.84 : 0.99,
            );
            summaryBg.setStrokeStyle(1, selectedDeck ? currentDeckAccentColor : SECTION_BORDER, this.deckListCompact ? 0.46 : 0.95);
            const summaryAccent = this.scene.add.rectangle(
                5,
                this.deckListSummaryHeight / 2,
                6,
                Math.max(this.deckListCompact ? 10 : 24, this.deckListSummaryHeight - (this.deckListCompact ? 10 : 18)),
                selectedDeck ? currentDeckAccentColor : SECTION_BORDER,
                1,
            ).setOrigin(0, 0.5);

            if (this.deckListCompact) {
                const headline = this.scene.add.text(14, 5, `${decks.length} 套已存`, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '8px',
                    color: '#e8d5ab',
                    fontStyle: 'bold',
                });
                const detailLabel = selectedDeck
                    ? `${Math.max(selectedIndex + 1, 1)} / ${Math.max(decks.length, 1)}`
                    : '先选卡组';
                const detail = this.scene.add.text(14, 14, truncateLabel(detailLabel, 12), {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '8px',
                    color: selectedDeck ? '#f3ead3' : '#bca785',
                    wordWrap: { width: this.deckListArea.w - 26 },
                });

                this.deckListSummaryContainer.add([
                    summaryBg,
                    summaryAccent,
                    headline,
                    detail,
                ]);
            } else if (selectedDeck && selectedDeckSummary) {
                const selectedSummary = selectedDeckSummary;
                const selectedSnapshot = buildDeckRosterSnapshot(selectedDeck, selectedSummary, this.config.metadata);
                const [statusPillBg, statusPillText] = this.createRightAlignedPill(
                    this.deckListArea.w - 12,
                    22,
                    selectedSummary.statusLabel,
                    selectedSummary.pillFillColor,
                    selectedSummary.pillTextColor,
                    {
                        fontSize: '18px',
                        height: FOOTER_GUIDE_PILL_HEIGHT,
                        horizontalPadding: 28,
                        minWidth: 108,
                    },
                );
                const eyebrow = this.scene.add.text(16, 12, '当前带入卡组', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: '#e8d5ab',
                    fontStyle: 'bold',
                });
                const deckName = this.scene.add.text(16, 36, truncateLabel(selectedDeck.name, 14), {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '28px',
                    color: '#f3ead3',
                    fontStyle: 'bold',
                    wordWrap: { width: this.deckListArea.w - 128 },
                });
                const meta = this.scene.add.text(16, 72, `${selectedSummary.count} 张 · ${truncateLabel(selectedSnapshot.pressureLabel, 18)}`, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: '#f3ead3',
                    wordWrap: { width: this.deckListArea.w - 28 },
                });
                const rosterLine = this.scene.add.text(
                    16,
                    96,
                    truncateLabel(formatDeckRosterHealthLabel(rosterHealth, decks.length), 42),
                    {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '18px',
                        color: selectedSummary.isValid ? '#d9c6a2' : selectedSummary.pillTextColor,
                        wordWrap: { width: this.deckListArea.w - 28 },
                    },
                );

                this.deckListSummaryContainer.add([
                    summaryBg,
                    summaryAccent,
                    eyebrow,
                    deckName,
                    meta,
                    rosterLine,
                    statusPillBg,
                    statusPillText,
                ]);
            } else {
                const eyebrow = this.scene.add.text(this.deckListCompact ? 14 : 16, this.deckListCompact ? 5 : 12, this.deckListCompact ? '已存 0 套' : '当前带入卡组', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: this.deckListCompact ? '8px' : '18px',
                    color: '#e8d5ab',
                    fontStyle: 'bold',
                });
                const deckName = this.scene.add.text(this.deckListCompact ? 14 : 16, this.deckListCompact ? 13 : 36, this.deckListCompact ? '先选卡组' : '尚未选择卡组', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: this.deckListCompact ? '8px' : '28px',
                    color: '#f3ead3',
                    fontStyle: this.deckListCompact ? 'normal' : 'bold',
                    wordWrap: this.deckListCompact ? undefined : { width: this.deckListArea.w - 28 },
                });
                const meta = this.scene.add.text(this.deckListCompact ? 14 : 16, this.deckListCompact ? 13 : 72, this.deckListCompact ? '新建或切换一套卡组。' : '新建或从下方列表切换一套卡组。', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: this.deckListCompact ? '8px' : '18px',
                    color: '#d9c6a2',
                    wordWrap: { width: this.deckListArea.w - (this.deckListCompact ? 24 : 28) },
                });
                if (this.deckListCompact) {
                    this.deckListSummaryContainer.add([summaryBg, summaryAccent, eyebrow, deckName]);
                } else {
                    const rosterLine = this.scene.add.text(16, 96, truncateLabel(formatDeckRosterHealthLabel(rosterHealth, decks.length), 42), {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '18px',
                        color: '#bca785',
                        wordWrap: { width: this.deckListArea.w - 28 },
                    });

                    this.deckListSummaryContainer.add([summaryBg, summaryAccent, eyebrow, deckName, meta, rosterLine]);
                }
            }
        }

        if (decks.length === 0) {
            const emptyCard = this.scene.add.rectangle(this.deckListArea.w / 2, 84, this.deckListArea.w, 132, expeditionUiTheme.colors.panel, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);

            const emptyTitle = this.scene.add.text(this.deckListArea.w / 2, 56, '还没有保存的卡组', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '28px',
                color: '#f3ead3',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            const emptyBody = this.scene.add.text(this.deckListArea.w / 2, 94, this.deckListCompact ? '点击上方“新建”开始整理本次远征配置。' : '点击上方“新建卡组”开始整理本次远征配置。', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                align: 'center',
                wordWrap: { width: this.deckListArea.w - 40 },
            }).setOrigin(0.5);

            this.deckListInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const start = this.deckListScrollOffset;
            const end = Math.min(start + this.deckListVisibleRows, decks.length);

            for (let index = start; index < end; index += 1) {
                const deck = decks[index];
                const rowY = (index - start) * this.deckListRowHeight;
                const isSelected = deck.id === this.selectedDeckId;
                const summary = summarizeDeckStatus(deck, this.stash.cards);
                const snapshot = buildDeckRosterSnapshot(deck, summary, this.config.metadata);
                const bgFill = isSelected ? PANEL_SELECTED_FILL : expeditionUiTheme.colors.panel;
                const hoverFill = isSelected ? PANEL_SELECTED_HOVER_FILL : BUTTON_NEUTRAL_FILL;
                const selectionAccentColor = isSelected
                    ? blendColor(SELECTED_ACCENT, summary.accentColor, summary.isValid ? 0.18 : 0.55)
                    : summary.accentColor;
                const borderColor = isSelected ? selectionAccentColor : SECTION_BORDER;
                const secondaryColor = isSelected ? '#f3ead3' : '#d9c6a2';
                const detailColor = summary.isValid ? (isSelected ? '#d9c6a2' : '#e8d5ab') : summary.pillTextColor;

                const bg = this.scene.add.rectangle(
                    this.deckListArea.w / 2,
                    rowY + this.deckListRowHeight / 2,
                    this.deckListArea.w,
                    this.deckListRowHeight - 8,
                    bgFill,
                    0.98,
                );
                bg.setStrokeStyle(isSelected ? 2 : 1, borderColor, isSelected ? 0.95 : 0.72);

                const accent = this.scene.add.rectangle(
                    5,
                    rowY + this.deckListRowHeight / 2,
                    6,
                    this.deckListCompact ? this.deckListRowHeight - 14 : this.deckListRowHeight - 18,
                    selectionAccentColor,
                    1,
                )
                    .setOrigin(0, 0.5);

                let detailStrip: GameObjects.Rectangle | undefined;
                if (!this.deckListCompact) {
                    detailStrip = this.scene.add.rectangle(
                        this.deckListArea.w / 2,
                        rowY + this.deckListRowHeight - 18,
                        this.deckListArea.w - 18,
                        20,
                        blendColor(bgFill, summary.accentColor, isSelected ? 0.22 : 0.16),
                        0.98,
                    );
                    detailStrip.setStrokeStyle(1, summary.accentColor, 0.22);
                }

                let currentLabel: GameObjects.Text | undefined;
                let name: GameObjects.Text;
                let meta: GameObjects.Text;
                let detail: GameObjects.Text | undefined;
                let statusPillBg: GameObjects.Rectangle | undefined;
                let statusPillText: GameObjects.Text | undefined;
                let statusDot: GameObjects.Rectangle | undefined;

                if (this.deckListCompact) {
                    const compactMetaLabel = truncateLabel(summary.isValid ? `${summary.count} 张` : summary.statusLabel, 8);

                    name = this.scene.add.text(8, rowY + 6, truncateLabel(deck.name, 5), {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: isSelected ? '9px' : '8px',
                        color: '#f3ead3',
                        fontStyle: 'bold',
                    });
                    meta = this.scene.add.text(8, rowY + 19, compactMetaLabel, {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '7px',
                        color: detailColor,
                        wordWrap: { width: this.deckListArea.w - 18 },
                    });
                    statusDot = this.scene.add.rectangle(
                        this.deckListArea.w - 7,
                        rowY + this.deckListRowHeight / 2,
                        6,
                        6,
                        selectionAccentColor,
                        isSelected ? 1 : 0.86,
                    );
                    statusDot.setStrokeStyle(isSelected ? 1 : 0, 0xffffff, 0.2);
                } else {
                    if (isSelected) {
                        currentLabel = this.scene.add.text(14, rowY + 10, '当前带入', {
                            fontFamily: expeditionUiTheme.fonts.ui,
                            fontSize: '14px',
                            color: '#e8d5ab',
                            fontStyle: 'bold',
                        });
                    }

                    name = this.scene.add.text(14, rowY + (isSelected ? 34 : 24), truncateLabel(deck.name, 18), {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: isSelected ? '22px' : '20px',
                        color: '#f3ead3',
                        fontStyle: 'bold',
                    });
                    meta = this.scene.add.text(14, rowY + (isSelected ? 64 : 52), snapshot.metaLabel, {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '16px',
                        color: secondaryColor,
                    });

                    detail = this.scene.add.text(16, rowY + (isSelected ? 86 : 76), truncateLabel(snapshot.detailLabel, 32), {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '14px',
                        color: detailColor,
                        fontStyle: isSelected ? 'bold' : 'normal',
                    });

                    [statusPillBg, statusPillText] = this.createRightAlignedPill(
                        this.deckListArea.w - 12,
                        rowY + 22,
                        summary.statusLabel,
                        summary.pillFillColor,
                        summary.pillTextColor,
                    );
                }

                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerover', () => bg.setFillStyle(hoverFill, 1));
                bg.on('pointerout', () => bg.setFillStyle(bgFill, 1));
                bg.on('pointerdown', () => {
                    this.setKeyboardZone('decks');
                    this.applyStashChange(selectDeckInStash(this.stash, deck.id));
                    this.refreshDeckViews();
                });

                this.deckListInner.add([
                    bg,
                    accent,
                    ...(detailStrip ? [detailStrip] : []),
                    ...(currentLabel ? [currentLabel] : []),
                    name,
                    meta,
                    ...(detail ? [detail] : []),
                    ...(statusDot ? [statusDot] : []),
                    ...(statusPillBg && statusPillText ? [statusPillBg, statusPillText] : []),
                ]);

                if (isSelected && this.pendingSelectedDeckMotionId === deck.id) {
                    this.playMotionPulse(
                        [bg, accent, detailStrip, currentLabel, name, meta, detail, statusDot, statusPillBg, statusPillText],
                        {
                            alphaFrom: 0.54,
                            scaleXFrom: 0.975,
                            scaleYFrom: 0.92,
                            duration: 210,
                        },
                    );
                }
            }
        }

        this.updateDeleteButton();

        if (this.deckListPosText) {
            const total = decks.length;
            const start = total === 0 ? 0 : this.deckListScrollOffset + 1;
            const end = total === 0 ? 0 : Math.min(this.deckListScrollOffset + this.deckListVisibleRows, total);
            this.deckListPosText.setText(this.deckListCompact ? `${start}-${end}/${total}` : `显示 ${start}-${end} / ${total}`);
        }
    }

    private updateDeleteButton(): void {
        if (!this.deleteDeckBtn || !this.deleteDeckLabel) return;

        const canDelete = this.selectedDeckId !== null && this.stash.savedDecks.length > 1;
        this.deleteDeckBtn.removeAllListeners();

        if (canDelete) {
            this.deleteDeckBtn.setFillStyle(0xb91c1c, 1);
            this.deleteDeckBtn.setStrokeStyle(1, 0xfca5a5, 0.95);
            this.deleteDeckBtn.setAlpha(1);
            this.deleteDeckBtn.setInteractive({ useHandCursor: true });
            this.deleteDeckBtn.on('pointerover', () => this.deleteDeckBtn?.setFillStyle(0xdc2626, 1));
            this.deleteDeckBtn.on('pointerout', () => this.deleteDeckBtn?.setFillStyle(0xb91c1c, 1));
            this.deleteDeckBtn.on('pointerdown', () => {
                this.setKeyboardZone('decks');
                this.showDeleteConfirmation();
            });
            this.deleteDeckLabel.setText('删除卡组');
            this.deleteDeckLabel.setColor('#f3ead3');
        } else {
            this.deleteDeckBtn.disableInteractive();
            this.deleteDeckBtn.setFillStyle(BUTTON_NEUTRAL_FILL, 1);
            this.deleteDeckBtn.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.95);
            this.deleteDeckBtn.setAlpha(0.82);
            this.deleteDeckLabel.setText('至少保留 1 套');
            this.deleteDeckLabel.setColor('#bca785');
        }
    }

    private createEditorColumn(
        x: number,
        y: number,
        colW: number,
        colH: number,
        options: {
            embedded?: boolean;
        } = {},
    ): void {
        const embedded = options.embedded ?? false;
        if (!embedded) {
            this.add(this.createSectionFrame(x, y, colW, colH, '当前卡组', '主编辑区：在这里移除，去右侧加入。↑↓ 选条目 · Enter 移除 · X 清空。', PANEL_ACCENT));
        }
        this.editorContentWidth = embedded ? colW : colW - 32;
        this.editorContentHeight = embedded ? colH : colH - 66;
        this.editorContainer = this.scene.add.container(
            embedded ? x : x + 16,
            embedded ? y : y + 62,
        );
        this.add(this.editorContainer);
        this.refreshEditor();
    }

    private refreshEditor(): void {
        if (!this.editorContainer) return;
        this.editorContainer.removeAll(true);
        this.detailPaneContainer = undefined;
        this.detailPaneContent = undefined;
        this.detailPaneWidth = 0;
        this.detailPaneHeight = 0;
        this.namingInputBg = undefined;
        this.namingInputText = undefined;
        this.editorSpotlightRows.clear();

        const localX = 0;
        const summaryW = this.editorContentWidth;
        const contentH = this.editorContentHeight;
        const deck = this.getSelectedDeck();
        const namingActive = this.isDeckNamingActive(deck);
        const detailExpanded = !namingActive && this.detailPaneExpanded;
        const compactSummaryMetrics = !namingActive && !detailExpanded && summaryW < COMPACT_EDITOR_BREAKPOINT;
        const sheetMode = compactSummaryMetrics;
        const targetSummaryH = namingActive
            ? 284
            : detailExpanded
                ? 360
                : compactSummaryMetrics
                    ? 188
                    : 276;
        const minSummaryH = namingActive
            ? 196
            : detailExpanded
                ? 320
                : compactSummaryMetrics
                    ? 140
                    : 240;
        const summaryReserveSpace = namingActive
            ? 118
            : detailExpanded
                ? 180
                : compactSummaryMetrics
                    ? 136
                    : 220;
        const summaryH = Math.min(targetSummaryH, Math.max(minSummaryH, contentH - summaryReserveSpace));
        const listHeaderY = sheetMode ? summaryH + 6 : summaryH + 20;
        const scrollBtnY = contentH - 24;
        const listTop = sheetMode ? summaryH + 24 : listHeaderY + 34;
        const listBottom = scrollBtnY - 22;
        const listH = Math.max(sheetMode ? 160 : 120, listBottom - listTop);
        const editorRowHeight = sheetMode
            ? 112
            : detailExpanded
                ? EDITOR_ROW_HEIGHT + 4
                : EDITOR_ROW_HEIGHT;
        const editorRowGap = sheetMode ? EDITOR_TILE_GAP : detailExpanded ? 8 : 8;
        const editorRowStride = editorRowHeight + editorRowGap;
        this.editorGridColumns = sheetMode
            ? Math.min(
                2,
                Math.max(
                    1,
                    Math.floor(
                        (Math.max(summaryW - 8, EDITOR_TILE_MIN_WIDTH) + EDITOR_TILE_GAP)
                        / (EDITOR_TILE_MIN_WIDTH + EDITOR_TILE_GAP),
                    ),
                ),
            )
            : 1;

        this.editorArea = {
            x: this.editorContainer.x,
            y: this.editorContainer.y + listTop,
            w: summaryW,
            h: listH,
        };
        this.editorVisibleRows = Math.max(1, Math.floor((listH + editorRowGap) / editorRowStride));
        this.ensureDetailCardSelection();
        this.deleteDeckBtn = undefined;
        this.deleteDeckLabel = undefined;

        if (!deck) {
            this.lastEditorFeedback = undefined;
            const emptyCard = this.scene.add.rectangle(localX + summaryW / 2, 84, summaryW, 168, expeditionUiTheme.colors.panel, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(localX + summaryW / 2, 62, '先选择一个卡组', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '28px',
                color: '#f3ead3',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(localX + summaryW / 2, 102, '先切换卡组，再从右侧加入或在中间移除。左侧可以选择已有卡组，或新建一套用于本次远征的配置。', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                align: 'center',
                wordWrap: { width: summaryW - 40 },
            }).setOrigin(0.5);
            this.editorContainer.add([emptyCard, emptyTitle, emptyBody]);
            return;
        }

        const summary = this.getSelectedDeckStatus() ?? summarizeDeckStatus(deck, this.stash.cards);
        const decks = this.stash.savedDecks;
        const selectedDeckIndex = Math.max(0, decks.findIndex((candidate) => candidate.id === deck.id));
        const summarySnapshot = buildDeckRosterSnapshot(deck, summary, this.config.metadata);
        const capacity = summarizeDeckCapacity(deck.cards);
        const capacityAccentColor = getDeckCapacityAccentColor(capacity);
        const capacityTextColor = getDeckCapacityTextColor(capacity);
        const readinessTier = getDeckReadinessTier(summary);
        const previousFeedback = this.lastEditorFeedback;
        const deckSelectionChanged = this.pendingSelectedDeckMotionId === deck.id;
        const countChanged = previousFeedback?.deckId === deck.id && previousFeedback.count !== summary.count;
        const readinessChanged = previousFeedback?.deckId === deck.id && previousFeedback.readinessTier !== readinessTier;
        const summaryGlow = this.scene.add.rectangle(
            localX + summaryW / 2,
            contentH / 2 + 2,
            summaryW + 4,
            contentH + 4,
            summary.accentColor,
            compactSummaryMetrics ? 0.05 : 0.08,
        );
        const summaryCard = this.scene.add.rectangle(
            localX + summaryW / 2,
            contentH / 2,
            summaryW,
            contentH,
            PANEL_DEEP_FILL,
            0.98,
        );
        summaryCard.setStrokeStyle(1, blendColor(summary.accentColor, SECTION_BORDER, 0.18), compactSummaryMetrics ? 0.76 : 0.92);
        const headerSurface = this.scene.add.rectangle(
            localX + summaryW / 2,
            summaryH / 2,
            summaryW - 4,
            summaryH - 4,
            compactSummaryMetrics ? expeditionUiTheme.colors.panel : PANEL_DEEPER_FILL,
            compactSummaryMetrics ? 0.92 : 0.95,
        );
        headerSurface.setStrokeStyle(1, blendColor(summary.accentColor, SECTION_BORDER, 0.22), 0.38);
        const headerSurfaceAccent = this.scene.add.rectangle(
            localX + 18,
            18,
            Math.min(94, summaryW - 40),
            3,
            summary.accentColor,
            0.72,
        ).setOrigin(0, 0.5);
        this.editorContainer.add([summaryGlow, summaryCard, headerSurface, headerSurfaceAccent]);

        const detailSurfaceWidth = namingActive
            ? 0
            : detailExpanded
                ? clampNumber(Math.floor(summaryW * 0.3), 288, 320)
                : 0;
        const detailPaneX = detailSurfaceWidth > 0
            ? localX + summaryW - detailSurfaceWidth - 16
            : localX + summaryW;
        const detailPaneY = namingActive ? 44 : 28;
        const leftSummaryW = detailSurfaceWidth > 0
            ? detailPaneX - (localX + 20) - 14
            : summaryW - (namingActive ? 32 : 28);
        const detailSurfacePulseTargets: (TweenableMotionTarget | null | undefined)[] = [];

        const eyebrow = this.scene.add.text(localX + 16, namingActive ? 16 : 74, namingActive
            ? (this.namingMode === 'create' ? '新卡组命名' : '重命名流程')
            : '主编辑区', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: namingActive ? '18px' : '16px',
            color: '#e8d5ab',
            fontStyle: 'bold',
        });
        this.editorContainer.add(eyebrow);

        let ctaButton: GameObjects.Rectangle | null = null;
        let ctaLabel: GameObjects.Text | null = null;
        let returnHintText: GameObjects.Text | null = null;
        let headerMetaText: GameObjects.Text | null = null;
        let compactHeaderTextWidth = leftSummaryW;

        if (namingActive) {
            const namingTitle = this.scene.add.text(localX + 16, 38, this.namingMode === 'create' ? '给新卡组起个名字' : '修改卡组名称', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '32px',
                color: '#f3ead3',
                fontStyle: 'bold',
            });
            const namingBody = this.scene.add.text(
                localX + 16,
                66,
                this.namingMode === 'create'
                    ? '新卡组已经建好；现在确认一个玩家可见名称，之后随时还能再改。'
                    : '这里只会修改玩家可见名称，内部保存编号会继续保持稳定。',
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: '#d9c6a2',
                    wordWrap: { width: summaryW - 32 },
                },
            );
            const renameHint = this.scene.add.text(localX + summaryW - 16, 18, '键盘输入 · Enter 确认 · Esc 取消 · 支持输入法 / 粘贴', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f6e2b1',
            }).setOrigin(1, 0);
            const confirmButtonWidth = 148;
            const cancelButtonWidth = this.namingMode === 'create' ? 132 : 112;
            const namingButtonGap = 12;
            const inputY = Math.max(122, namingBody.y + namingBody.height + 26);
            const cancelButtonCenterX = localX + summaryW - 16 - cancelButtonWidth / 2;
            const confirmButtonCenterX = cancelButtonCenterX - cancelButtonWidth / 2 - namingButtonGap - confirmButtonWidth / 2;
            const inputWidth = Math.max(220, confirmButtonCenterX - confirmButtonWidth / 2 - (localX + 24));
            const inputBg = this.scene.add.rectangle(localX + 16 + inputWidth / 2, inputY, inputWidth, 48, expeditionUiTheme.colors.panelInner, 1);
            inputBg.setStrokeStyle(1, PANEL_ACCENT, 0.95);
            const inputText = this.scene.add.text(localX + 18, inputY, '', {
                fontFamily: expeditionUiTheme.fonts.mono,
                fontSize: '20px',
                color: '#f3ead3',
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            this.namingInputBg = inputBg;
            this.namingInputText = inputText;
            this.updateNamingTextDisplay();
            const namingWarning = this.scene.add.text(
                localX + 16,
                inputY + 42,
                this.renameBuffer.trim().length > 0
                    ? (this.namingMode === 'create' ? '确认后会保留这套新卡组，并继续在左侧列表中选中它。' : '确认后会立刻更新左侧列表和远征带入名称。')
                    : '请输入至少 1 个字符，或按 Esc 退出本次命名。',
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: this.renameBuffer.trim().length > 0 ? '#e8d5ab' : '#fca5a5',
                    wordWrap: { width: summaryW - 32 },
                },
            );
            const confirmButton = this.createButton(
                confirmButtonCenterX,
                inputY,
                confirmButtonWidth,
                PRIMARY_BUTTON_HEIGHT,
                this.namingMode === 'create' ? '确认名称' : '确认重命名',
                BUTTON_PRIMARY_FILL,
                () => this.confirmRename(),
                this.renameBuffer.trim().length === 0,
                {
                    hoverFillColor: BUTTON_PRIMARY_HOVER_FILL,
                    strokeColor: expeditionUiTheme.colors.goldSoft,
                    fontSize: '18px',
                },
            );
            const cancelButton = this.createButton(
                cancelButtonCenterX,
                inputY,
                cancelButtonWidth,
                SECONDARY_BUTTON_HEIGHT,
                this.namingMode === 'create' ? '保留默认名' : '取消',
                expeditionUiTheme.colors.slate,
                () => this.cancelRename(),
                false,
                {
                    hoverFillColor: expeditionUiTheme.colors.slate,
                    strokeColor: 0x94a3b8,
                    fontSize: '18px',
                },
            );
            this.editorContainer.add([
                namingTitle,
                namingBody,
                renameHint,
                inputBg,
                inputText,
                namingWarning,
                ...confirmButton,
                ...cancelButton,
            ]);
            this.syncNamingTextEntry();
        } else {
            this.nativeTextEntry.deactivate(DECK_NAMING_TEXT_ENTRY_SESSION_ID);
            eyebrow.setText('当前带入卡组');
            eyebrow.setPosition(localX + 20, compactSummaryMetrics ? 12 : 14);
            const titleBarAccent = this.scene.add.rectangle(localX + 14, 14, 4, 12, summary.accentColor, 0.9).setOrigin(0, 0.5);
            const titleDivider = this.scene.add.rectangle(
                localX + summaryW / 2,
                compactSummaryMetrics ? 26 : 28,
                summaryW - 16,
                1,
                blendColor(summary.accentColor, SECTION_BORDER, 0.22),
                compactSummaryMetrics ? 0.26 : 0.34,
            );
            const returnCta = createReturnCtaState(summary);
            const actionButtonGap = 10;
            const actionButtonY = 34;
            const returnButtonWidth = compactSummaryMetrics ? 0 : 196;
            const inspectButtonWidth = compactSummaryMetrics ? 132 : 0;
            const deleteButtonWidth = 144;
            const renameButtonWidth = 92;
            const newDeckButtonWidth = 108;
            const deckStepButtonWidth = compactSummaryMetrics && decks.length > 1 ? SECONDARY_BUTTON_HEIGHT : 0;
            let actionCursorRight = localX + summaryW - 16;
            const placeActionButton = (width: number): number => {
                const centerX = actionCursorRight - width / 2;
                actionCursorRight = centerX - width / 2 - actionButtonGap;
                return centerX;
            };

            const returnButtonCenterX = returnButtonWidth > 0 ? placeActionButton(returnButtonWidth) : null;
            const inspectButtonCenterX = compactSummaryMetrics ? placeActionButton(inspectButtonWidth) : null;
            const deleteButtonCenterX = placeActionButton(deleteButtonWidth);
            const renameButtonCenterX = placeActionButton(renameButtonWidth);
            const newDeckButtonCenterX = placeActionButton(newDeckButtonWidth);
            const nextDeckButtonCenterX = deckStepButtonWidth > 0 ? placeActionButton(deckStepButtonWidth) : null;
            const prevDeckButtonCenterX = deckStepButtonWidth > 0 ? placeActionButton(deckStepButtonWidth) : null;
            compactHeaderTextWidth = compactSummaryMetrics
                ? Math.max(240, actionCursorRight - (localX + 20))
                : leftSummaryW;
            const newDeckButton = this.createButton(
                newDeckButtonCenterX,
                actionButtonY,
                newDeckButtonWidth,
                SECONDARY_BUTTON_HEIGHT,
                '新建卡组',
                BUTTON_PRIMARY_FILL,
                () => this.createDeck(),
                false,
                {
                    hoverFillColor: BUTTON_PRIMARY_HOVER_FILL,
                    strokeColor: expeditionUiTheme.colors.goldSoft,
                    fontSize: '18px',
                },
            );
            const renameButton = this.createButton(
                renameButtonCenterX,
                actionButtonY,
                renameButtonWidth,
                SECONDARY_BUTTON_HEIGHT,
                '重命名',
                expeditionUiTheme.colors.panel,
                () => this.beginRenameSelectedDeck(),
                false,
                {
                    hoverFillColor: expeditionUiTheme.colors.panelInner,
                    strokeColor: 0xe2e8f0,
                    fontSize: '18px',
                },
            );
            const [deleteDeckButton, deleteDeckLabel] = this.createButton(
                deleteButtonCenterX,
                actionButtonY,
                deleteButtonWidth,
                SECONDARY_BUTTON_HEIGHT,
                '删除卡组',
                0xb91c1c,
                () => this.showDeleteConfirmation(),
                false,
                {
                    hoverFillColor: 0xdc2626,
                    strokeColor: 0xfca5a5,
                    fontSize: '18px',
                },
            );
            this.deleteDeckBtn = deleteDeckButton;
            this.deleteDeckLabel = deleteDeckLabel;
            const prevDeckButton = deckStepButtonWidth > 0 && prevDeckButtonCenterX !== null
                ? this.createButton(
                    prevDeckButtonCenterX,
                    actionButtonY,
                    deckStepButtonWidth,
                    SECONDARY_BUTTON_HEIGHT,
                    '‹',
                    BUTTON_NEUTRAL_FILL,
                    () => this.focusNextDeck(-1),
                    selectedDeckIndex <= 0,
                    {
                        hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
                        strokeColor: expeditionUiTheme.colors.slate,
                        fontSize: '18px',
                    },
                )
                : null;
            const nextDeckButton = deckStepButtonWidth > 0 && nextDeckButtonCenterX !== null
                ? this.createButton(
                    nextDeckButtonCenterX,
                    actionButtonY,
                    deckStepButtonWidth,
                    SECONDARY_BUTTON_HEIGHT,
                    '›',
                    BUTTON_NEUTRAL_FILL,
                    () => this.focusNextDeck(1),
                    selectedDeckIndex >= decks.length - 1,
                    {
                        hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
                        strokeColor: expeditionUiTheme.colors.slate,
                        fontSize: '18px',
                    },
                )
                : null;
            const inspectFocusAction = compactSummaryMetrics && inspectButtonCenterX !== null
                ? this.createButton(
                    inspectButtonCenterX,
                    actionButtonY,
                    inspectButtonWidth,
                    SECONDARY_BUTTON_HEIGHT,
                    '查看当前焦点',
                    expeditionUiTheme.colors.panel,
                    () => {
                        this.setKeyboardZone('editor');
                        this.toggleDetailPane(true);
                    },
                    false,
                    {
                        hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
                        strokeColor: expeditionUiTheme.colors.slate,
                        fontSize: '18px',
                    },
                )
                : null;
            let compactReturnSummaryText: GameObjects.Text | null = null;
            let compactReturnButton: [GameObjects.Rectangle, GameObjects.Text] | null = null;
            if (!compactSummaryMetrics && returnButtonCenterX !== null) {
                ctaButton = this.scene.add.rectangle(
                    returnButtonCenterX,
                    actionButtonY,
                    returnButtonWidth,
                    PRIMARY_BUTTON_HEIGHT,
                    returnCta.buttonFillColor,
                    1,
                );
                ctaButton.setStrokeStyle(this.keyboardZone === 'return' ? 2 : 1, returnCta.buttonStrokeColor, 0.95);
                ctaButton.setInteractive({ useHandCursor: true });
                ctaButton.on('pointerover', () => ctaButton?.setFillStyle(returnCta.buttonHoverFillColor, 1));
                ctaButton.on('pointerout', () => ctaButton?.setFillStyle(returnCta.buttonFillColor, 1));
                ctaButton.on('pointerdown', () => {
                    this.setKeyboardZone('return');
                    this.config.onClose();
                });
                ctaLabel = this.scene.add.text(returnButtonCenterX, actionButtonY, '返回远征准备', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '20px',
                    color: returnCta.buttonTextColor,
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                const returnHintLabel = summary.availabilityIssues.length > 0
                    ? '返回前先补库存'
                    : summary.sizeIssue?.kind === 'too-few-cards'
                        ? `还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`
                    : summary.sizeIssue?.kind === 'too-many-cards'
                            ? `超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`
                            : '已可直接返回';
                returnHintText = this.scene.add.text(localX + summaryW - 16, 74, returnHintLabel, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: returnCta.buttonTextColor,
                    fontStyle: 'bold',
                }).setOrigin(1, 0);
            }
            const nameText = this.scene.add.text(
                localX + 20,
                compactSummaryMetrics ? 24 : 40,
                truncateLabel(deck.name, detailExpanded ? 15 : compactSummaryMetrics ? 18 : 20),
                {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: compactSummaryMetrics ? '22px' : '30px',
                color: '#f3ead3',
                fontStyle: 'bold',
                wordWrap: { width: Math.max(144, compactSummaryMetrics ? compactHeaderTextWidth : leftSummaryW - 128) },
            });
            nameText.setInteractive({ useHandCursor: true });
            nameText.on('pointerdown', () => {
                this.setKeyboardZone('decks');
                this.beginRenameSelectedDeck();
            });
            headerMetaText = this.scene.add.text(
                localX + 20,
                compactSummaryMetrics ? 48 : 84,
                truncateLabel(
                    compactSummaryMetrics
                        ? (joinPreviewFacts(
                            summary.isValid
                                ? [`第 ${selectedDeckIndex + 1}/${Math.max(decks.length, 1)} 套`, `${summarySnapshot.uniqueCardCount} 种卡`, summarySnapshot.pressureLabel]
                                : [`第 ${selectedDeckIndex + 1}/${Math.max(decks.length, 1)} 套`, summary.detailLabel, `${summarySnapshot.uniqueCardCount} 种卡`],
                            56,
                        ) ?? summary.detailLabel)
                        : joinPreviewFacts([
                            `第 ${selectedDeckIndex + 1}/${Math.max(decks.length, 1)} 套`,
                            summarySnapshot.metaLabel,
                        ], 52) ?? summarySnapshot.metaLabel,
                    detailExpanded ? 32 : compactSummaryMetrics ? 56 : 52,
                ),
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: compactSummaryMetrics ? '14px' : '18px',
                    color: '#d9c6a2',
                    fontStyle: compactSummaryMetrics ? 'normal' : 'bold',
                    wordWrap: { width: Math.max(132, compactSummaryMetrics ? compactHeaderTextWidth : leftSummaryW - 8) },
                },
            );
            if (compactSummaryMetrics) {
                const compactReturnButtonWidth = 220;
                const compactReturnButtonCenterX = localX + summaryW - 20 - compactReturnButtonWidth / 2;
                compactReturnSummaryText = this.scene.add.text(localX + 20, 118, returnCta.summaryLabel, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: returnCta.stripTextColor,
                    fontStyle: 'bold',
                    wordWrap: { width: Math.max(220, summaryW - compactReturnButtonWidth - 64) },
                });
                compactReturnButton = this.createButton(
                    compactReturnButtonCenterX,
                    150,
                    compactReturnButtonWidth,
                    SECONDARY_BUTTON_HEIGHT,
                    '返回远征准备',
                    returnCta.buttonFillColor,
                    () => {
                        this.setKeyboardZone('return');
                        this.config.onClose();
                    },
                    false,
                    {
                        hoverFillColor: returnCta.buttonHoverFillColor,
                        strokeColor: returnCta.buttonStrokeColor,
                        textColor: returnCta.buttonTextColor,
                        fontSize: '18px',
                    },
                );
                compactReturnButton[0].setStrokeStyle(this.keyboardZone === 'return' ? 2 : 1, returnCta.buttonStrokeColor, 0.95);
            }
            this.editorContainer.add([
                titleBarAccent,
                titleDivider,
                nameText,
                headerMetaText,
                ...(prevDeckButton ? prevDeckButton : []),
                ...(nextDeckButton ? nextDeckButton : []),
                ...newDeckButton,
                ...renameButton,
                deleteDeckButton,
                deleteDeckLabel,
                ...(inspectFocusAction ? inspectFocusAction : []),
                ...(compactReturnSummaryText ? [compactReturnSummaryText] : []),
                ...(compactReturnButton ? compactReturnButton : []),
                ...(ctaButton ? [ctaButton] : []),
                ...(ctaLabel ? [ctaLabel] : []),
                ...(returnHintText ? [returnHintText] : []),
            ]);
            this.updateDeleteButton();
        }

        let countText: GameObjects.Text | null = null;
        let detailText: GameObjects.Text | null = null;
        let statusPillBg: GameObjects.Rectangle | null = null;
        let statusPillText: GameObjects.Text | null = null;
        let capacitySummaryText: GameObjects.Text | null = null;
        let capacityFill: GameObjects.Rectangle | undefined;
        let capacityFillWidth = 0;
        let previousCapacityFillWidth = 0;

        if (compactSummaryMetrics) {
            countText = this.scene.add.text(localX + 16 + leftSummaryW, 43, `${summary.count} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '10px',
                color: summary.isValid ? '#e6f3ea' : summary.pillTextColor,
                fontStyle: 'bold',
            }).setOrigin(1, 0);
            [statusPillBg, statusPillText] = this.createRightAlignedPill(
                localX + 16 + leftSummaryW,
                28,
                summary.statusLabel,
                summary.pillFillColor,
                summary.pillTextColor,
            );
            detailText = this.scene.add.text(
                localX + 20,
                60,
                truncateLabel(
                    joinPreviewFacts([
                        getDeckCapacityProgressLabel(capacity),
                        getDeckCapacityHeadroomLabel(capacity),
                    ], 72) ?? getDeckCapacityProgressLabel(capacity),
                    72,
                ),
                {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '9px',
                    color: capacityTextColor,
                    fontStyle: 'bold',
                    wordWrap: { width: Math.max(180, compactHeaderTextWidth) },
                },
            );
            capacitySummaryText = detailText;
            this.editorContainer.add([countText, statusPillBg, statusPillText, detailText]);

            const capacityTrackX = localX + 20;
            const capacityTrackW = Math.max(88, leftSummaryW - 8);
            const capacityTrackY = 75;
            const capacityTrackH = 8;
            capacityFillWidth = capacityTrackW * clampNumber(capacity.count / DECK_CARD_MAX, 0, 1);
            previousCapacityFillWidth = previousFeedback?.deckId === deck.id
                ? capacityTrackW * clampNumber(previousFeedback.count / DECK_CARD_MAX, 0, 1)
                : 0;
            const capacityTrackBg = this.scene.add.rectangle(
                capacityTrackX + capacityTrackW / 2,
                capacityTrackY,
                capacityTrackW,
                capacityTrackH,
                BUTTON_NEUTRAL_FILL,
                1,
            );
            capacityTrackBg.setStrokeStyle(1, SECTION_BORDER, 0.82);
            this.editorContainer.add(capacityTrackBg);

            if (capacityFillWidth > 0) {
                capacityFill = this.scene.add.rectangle(
                    capacityTrackX,
                    capacityTrackY,
                    capacityFillWidth,
                    capacityTrackH - 2,
                    capacityAccentColor,
                    1,
                ).setOrigin(0, 0.5);
                this.editorContainer.add(capacityFill);
            }

            const capacityMinimumMarker = this.scene.add.rectangle(
                capacityTrackX + capacityTrackW * (DECK_CARD_MIN / DECK_CARD_MAX),
                capacityTrackY,
                3,
                capacityTrackH + 4,
                0xe2e8f0,
                0.86,
            );
            this.editorContainer.add(capacityMinimumMarker);
        } else {
            const detailY = namingActive ? 132 : 118;
            countText = this.scene.add.text(localX + 20, detailY, `${summary.count} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: namingActive ? '19px' : '22px',
                color: summary.isValid ? '#e6f3ea' : summary.pillTextColor,
                fontStyle: 'bold',
                wordWrap: { width: leftSummaryW },
            });
            const statusPillRightX = localX + 16 + leftSummaryW;
            [statusPillBg, statusPillText] = this.createRightAlignedPill(
                statusPillRightX,
                detailY + (namingActive ? 30 : 14),
                summary.statusLabel,
                summary.pillFillColor,
                summary.pillTextColor,
            );
            detailText = this.scene.add.text(localX + 20, detailY + (namingActive ? 50 : 22), namingActive
                ? summary.detailLabel
                : truncateLabel(
                    joinPreviewFacts(
                        summary.isValid
                            ? [summarySnapshot.detailLabel]
                            : [summary.detailLabel, summarySnapshot.detailLabel],
                        detailExpanded ? 46 : 68,
                    ) ?? summary.detailLabel,
                    detailExpanded ? 46 : 68,
                ), {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: namingActive ? '16px' : '18px',
                color: summary.isValid ? '#e8d5ab' : summary.pillTextColor,
                wordWrap: { width: leftSummaryW },
            });
            this.editorContainer.add([countText, statusPillBg, statusPillText, detailText]);

            const capacitySummaryY = detailY + (namingActive ? 68 : 52);
            const capacityTrackY = detailY + (namingActive ? 88 : 84);
            const showCapacityRangeLabel = namingActive || detailExpanded;
            capacitySummaryText = this.scene.add.text(localX + 20, capacitySummaryY, joinPreviewFacts([
                getDeckCapacityProgressLabel(capacity),
                getDeckCapacityHeadroomLabel(capacity),
            ], detailExpanded ? 50 : 62) ?? getDeckCapacityProgressLabel(capacity), {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: capacityTextColor,
                fontStyle: 'bold',
                wordWrap: { width: leftSummaryW },
            });
            this.editorContainer.add(capacitySummaryText);

            const capacityTrackX = localX + 20;
            const capacityTrackW = Math.max(88, leftSummaryW - 10);
            const capacityTrackH = 11;
            capacityFillWidth = capacityTrackW * clampNumber(capacity.count / DECK_CARD_MAX, 0, 1);
            previousCapacityFillWidth = previousFeedback?.deckId === deck.id
                ? capacityTrackW * clampNumber(previousFeedback.count / DECK_CARD_MAX, 0, 1)
                : 0;
            const capacityTrackBg = this.scene.add.rectangle(
                capacityTrackX + capacityTrackW / 2,
                capacityTrackY,
                capacityTrackW,
                capacityTrackH,
                BUTTON_NEUTRAL_FILL,
                1,
            );
            capacityTrackBg.setStrokeStyle(1, SECTION_BORDER, 0.9);
            this.editorContainer.add(capacityTrackBg);

            if (capacityFillWidth > 0) {
                capacityFill = this.scene.add.rectangle(
                    capacityTrackX,
                    capacityTrackY,
                    capacityFillWidth,
                    capacityTrackH - 4,
                    capacityAccentColor,
                    1,
                ).setOrigin(0, 0.5);
                this.editorContainer.add(capacityFill);
            }

            const capacityMinimumMarker = this.scene.add.rectangle(
                capacityTrackX + capacityTrackW * (DECK_CARD_MIN / DECK_CARD_MAX),
                capacityTrackY,
                3,
                capacityTrackH + 6,
                0xe2e8f0,
                0.9,
            );
            const capacityRangeLabel = this.scene.add.text(capacityTrackX, capacityTrackY + 12, namingActive
                ? `${DECK_CARD_MIN} 张出征线 · ${DECK_CARD_MAX} 张上限`
                : truncateLabel(
                    joinPreviewFacts(
                        [`${DECK_CARD_MIN} 张出征线`, `${DECK_CARD_MAX} 张上限`, summarySnapshot.detailLabel],
                        detailExpanded ? 52 : 72,
                    ) ?? `${DECK_CARD_MIN} 张出征线 · ${DECK_CARD_MAX} 张上限`,
                    detailExpanded ? 52 : 72,
                ), {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                fontStyle: 'bold',
                wordWrap: { width: leftSummaryW },
            });
            this.editorContainer.add(showCapacityRangeLabel
                ? [capacityMinimumMarker, capacityRangeLabel]
                : [capacityMinimumMarker]);
        }

        if (!namingActive && !compactSummaryMetrics) {
            const maxVisibleDeckChips = 4;
            const visibleStart = clampNumber(
                selectedDeckIndex - Math.floor((maxVisibleDeckChips - 1) / 2),
                0,
                Math.max(0, decks.length - maxVisibleDeckChips),
            );
            const visibleDecks = decks.slice(visibleStart, visibleStart + maxVisibleDeckChips);
            const deckChipY = summaryH - 26;
            const deckChipH = SECONDARY_BUTTON_HEIGHT;
            const deckChipGap = 8;
            const deckChipAreaW = Math.max(220, leftSummaryW);
            const deckChipW = Math.min(
                176,
                Math.max(
                    112,
                    Math.floor((deckChipAreaW - deckChipGap * Math.max(visibleDecks.length - 1, 0)) / Math.max(visibleDecks.length, 1)),
                ),
            );
            const deckChipLeft = localX + 20;

            visibleDecks.forEach((candidate, visibleIndex) => {
                const candidateSummary = summarizeDeckStatus(candidate, this.stash.cards);
                const candidateX = deckChipLeft + deckChipW / 2 + visibleIndex * (deckChipW + deckChipGap);
                const isSelected = candidate.id === deck.id;
                const chipFillColor = isSelected ? PANEL_SELECTED_FILL : expeditionUiTheme.colors.panel;
                const chipHoverFillColor = isSelected ? PANEL_SELECTED_HOVER_FILL : BUTTON_NEUTRAL_FILL;
                const chipBorderColor = isSelected
                    ? blendColor(SELECTED_ACCENT, candidateSummary.accentColor, candidateSummary.isValid ? 0.18 : 0.55)
                    : blendColor(SECTION_BORDER, candidateSummary.accentColor, 0.32);
                const chipTextColor = isSelected ? '#f3ead3' : '#f3ead3';
                const chipDetailColor = candidateSummary.isValid ? '#e8d5ab' : candidateSummary.pillTextColor;

                const chipBg = this.scene.add.rectangle(
                    candidateX,
                    deckChipY,
                    deckChipW,
                    deckChipH,
                    chipFillColor,
                    0.98,
                );
                chipBg.setStrokeStyle(isSelected ? 2 : 1, chipBorderColor, isSelected ? 0.95 : 0.72);
                chipBg.setInteractive({ useHandCursor: true });
                chipBg.on('pointerover', () => chipBg.setFillStyle(chipHoverFillColor, 1));
                chipBg.on('pointerout', () => chipBg.setFillStyle(chipFillColor, 1));
                chipBg.on('pointerdown', () => {
                    this.setKeyboardZone('decks');
                    this.applyStashChange(selectDeckInStash(this.stash, candidate.id));
                    this.refreshDeckViews();
                });

                const accent = this.scene.add.rectangle(
                    candidateX - deckChipW / 2 + 6,
                    deckChipY,
                    4,
                    deckChipH - 6,
                    candidateSummary.accentColor,
                    0.96,
                ).setOrigin(0, 0.5);
                const name = this.scene.add.text(candidateX - deckChipW / 2 + 14, deckChipY - 1, truncateLabel(candidate.name, 10), {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: chipTextColor,
                    fontStyle: 'bold',
                }).setOrigin(0, 0.5);
                const count = this.scene.add.text(candidateX + deckChipW / 2 - 8, deckChipY - 1, `${countDeckCards(candidate.cards)} 张`, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: chipDetailColor,
                    fontStyle: 'bold',
                }).setOrigin(1, 0.5);

                this.editorContainer.add([chipBg, accent, name, count]);
            });

            if (visibleStart > 0) {
                const moreLeft = this.scene.add.text(deckChipLeft - 10, deckChipY, '‹', {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '18px',
                    color: '#64748b',
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                this.editorContainer.add(moreLeft);
            }

            if (visibleStart + visibleDecks.length < decks.length) {
                const moreRight = this.scene.add.text(
                    deckChipLeft + visibleDecks.length * deckChipW + Math.max(0, visibleDecks.length - 1) * deckChipGap + 10,
                    deckChipY,
                    '›',
                    {
                        fontFamily: expeditionUiTheme.fonts.ui,
                        fontSize: '18px',
                        color: '#64748b',
                        fontStyle: 'bold',
                    },
                ).setOrigin(0.5);
                this.editorContainer.add(moreRight);
            }
        }

        let inspectFocusButton: [GameObjects.Rectangle, GameObjects.Text] | null = null;
        if (!namingActive) {
            if (detailExpanded) {
                const detailPaneBottom = summaryH - 12;
                const detailPaneH = Math.max(96, detailPaneBottom - detailPaneY);
                this.detailPaneContainer = this.scene.add.container(detailPaneX, detailPaneY);
                this.detailPaneWidth = detailSurfaceWidth;
                this.detailPaneHeight = detailPaneH;
                this.editorContainer.add(this.detailPaneContainer);
                this.refreshDetailPane(deckSelectionChanged);
                detailSurfacePulseTargets.push(this.detailPaneContainer);
            } else if (!compactSummaryMetrics) {
                inspectFocusButton = this.createButton(
                    summaryW - 56,
                    listHeaderY + 12,
                    132,
                    SECONDARY_BUTTON_HEIGHT,
                    '查看当前焦点',
                    expeditionUiTheme.colors.panel,
                    () => {
                        this.setKeyboardZone('editor');
                        this.toggleDetailPane(true);
                    },
                    false,
                    {
                        hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL,
                        strokeColor: expeditionUiTheme.colors.slate,
                        fontSize: '18px',
                    },
                );
            }
        }

        let cardListTitle: GameObjects.Text | null = null;
        if (compactSummaryMetrics) {
            cardListTitle = this.scene.add.text(localX + 2, listTop - 11, `当前卡牌（在这里移除） · ${deck.cards.length} 个条目`, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '9px',
                color: '#bca785',
                fontStyle: 'bold',
                wordWrap: { width: summaryW - 12 },
            });
            this.editorContainer.add(cardListTitle);
        } else {
            const listHeaderDivider = this.scene.add.rectangle(summaryW / 2, listHeaderY + 12, summaryW - 4, 1, summary.accentColor, 0.1);
            cardListTitle = this.scene.add.text(localX, listHeaderY - 1, `当前卡牌（在这里移除） · ${deck.cards.length} 个条目`, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                fontStyle: 'bold',
                wordWrap: { width: inspectFocusButton ? summaryW - 138 : summaryW - 12 },
            });
            this.editorContainer.add([
                listHeaderDivider,
                cardListTitle,
                ...(inspectFocusButton ? inspectFocusButton : []),
            ]);
        }

        const listSurface = this.scene.add.rectangle(summaryW / 2, listTop + listH / 2, summaryW - 6, listH, PANEL_DEEP_FILL, 0.34);
        listSurface.setStrokeStyle(1, blendColor(summary.accentColor, SECTION_BORDER, 0.18), 0.18);
        const listSurfaceAccent = this.scene.add.rectangle(summaryW / 2, listTop + 1, summaryW - 18, 2, summary.accentColor, 0.12);
        this.editorContainer.add([listSurface, listSurfaceAccent]);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(this.editorContainer.x, this.editorContainer.y + listTop, summaryW, listH);
        maskGraphics.setVisible(false);
        const cardsOuter = this.scene.add.container(localX, listTop);
        cardsOuter.setMask(maskGraphics.createGeometryMask());
        const cardsInner = this.scene.add.container(0, 0);
        cardsOuter.add(cardsInner);
        this.editorContainer.add([maskGraphics, cardsOuter]);

        const visibleCardCount = Math.max(1, this.editorVisibleRows * this.editorGridColumns);
        const maxOffset = sheetMode
            ? Math.max(0, Math.ceil(deck.cards.length / this.editorGridColumns) - this.editorVisibleRows)
            : Math.max(0, deck.cards.length - visibleCardCount);
        this.editorScrollOffset = clampNumber(this.editorScrollOffset, 0, maxOffset);

        if (deck.cards.length === 0) {
            const emptyCard = this.scene.add.rectangle(summaryW / 2, listH / 2, Math.max(220, summaryW - 24), 132, expeditionUiTheme.colors.panelInner, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(summaryW / 2, listH / 2 - 22, '卡组还是空的', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#f3ead3',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(summaryW / 2, listH / 2 + 14, '从右侧储物袋挑选卡牌加入这里，合法性会实时更新。', {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: '#bca785',
                align: 'center',
                wordWrap: { width: Math.max(220, summaryW - 48) },
            }).setOrigin(0.5);
            cardsInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const startIndex = sheetMode
                ? this.editorScrollOffset * this.editorGridColumns
                : this.editorScrollOffset;
            const end = Math.min(startIndex + visibleCardCount, deck.cards.length);
            const tileGap = sheetMode ? editorRowGap : 0;
            const tileW = sheetMode
                ? Math.max(
                    EDITOR_TILE_MIN_WIDTH,
                    Math.floor((summaryW - 8 - (this.editorGridColumns - 1) * tileGap) / this.editorGridColumns),
                )
                : summaryW - 8;

            for (let index = startIndex; index < end; index += 1) {
                const stack = deck.cards[index];
                const relativeIndex = index - startIndex;
                const gridRow = sheetMode ? Math.floor(relativeIndex / this.editorGridColumns) : relativeIndex;
                const gridCol = sheetMode ? relativeIndex % this.editorGridColumns : 0;
                const rowY = gridRow * editorRowStride;
                const tileX = sheetMode ? gridCol * (tileW + tileGap) : 0;
                const rowCenterY = rowY + editorRowHeight / 2;
                const rowCenterX = sheetMode ? tileX + tileW / 2 : summaryW / 2;
                const displayName = getCardDisplayName(stack.id, this.config.metadata);
                const metaLabel = getCardMetaLabel(stack.id, this.config.metadata);
                const metadataEntry = this.config.metadata?.[stack.id];
                const ownedCount = getStackCount(this.stash.cards, stack.id);
                const shortageCount = Math.max(stack.count - ownedCount, 0);
                const remainingCount = Math.max(ownedCount - stack.count, 0);
                const rowAccentColor = shortageCount > 0
                    ? INVALID_ACCENT
                    : remainingCount === 0
                        ? WARNING_ACCENT
                        : VALID_ACCENT;
                const rowBorderColor = sheetMode
                    ? blendColor(
                        SECTION_BORDER,
                        rowAccentColor,
                        shortageCount > 0 ? 0.66 : remainingCount === 0 ? 0.42 : 0.24,
                    )
                    : shortageCount > 0
                        ? INVALID_ACCENT
                        : remainingCount === 0
                            ? WARNING_ACCENT
                            : SECTION_BORDER;
                const rowFillColor = sheetMode
                    ? expeditionUiTheme.colors.panel
                    : shortageCount > 0
                        ? 0x1b1320
                        : remainingCount === 0
                            ? 0x1c180f
                            : PANEL_DEEPER_FILL;
                const detailColor = shortageCount > 0
                    ? '#f3d0c3'
                    : remainingCount === 0
                        ? '#f6e2b1'
                        : '#e8d5ab';
                const availabilityLabel = shortageCount > 0
                    ? `袋中${ownedCount} · 待补${shortageCount}张`
                    : remainingCount === 0
                        ? `袋中${ownedCount} · 已全部带入`
                        : `袋中${ownedCount} · 还可补${remainingCount}张`;
                const spotlightTheme = getPreviewTheme(this.config.metadata?.[stack.id]?.kind);
                const hoverFillColor = sheetMode
                    ? blendColor(
                        rowFillColor,
                        spotlightTheme.headerFillColor,
                        shortageCount > 0 ? 0.18 : remainingCount === 0 ? 0.14 : 0.2,
                    )
                    : shortageCount > 0
                        ? 0x261626
                        : remainingCount === 0
                            ? 0x272016
                            : 0x162136;
                const activeFillColor = blendColor(rowFillColor, spotlightTheme.headerFillColor, sheetMode ? 0.34 : 0.52);
                const tileStatusLabel = shortageCount > 0
                    ? `缺 ${shortageCount}`
                    : remainingCount === 0
                        ? '已耗尽'
                        : `剩 ${remainingCount}`;

                const rowBg = this.scene.add.rectangle(
                    rowCenterX,
                    rowCenterY,
                    sheetMode ? tileW : summaryW - 8,
                    editorRowHeight,
                    rowFillColor,
                    0.98,
                );
                rowBg.setStrokeStyle(1, rowBorderColor, sheetMode ? 0.74 : shortageCount > 0 ? 0.95 : 0.82);
                const spotlightRow: SpotlightRowHandle = {
                    cardId: stack.id,
                    bg: rowBg,
                    baseFillColor: rowFillColor,
                    hoverFillColor,
                    activeFillColor,
                    baseBorderColor: rowBorderColor,
                    activeBorderColor: spotlightTheme.borderColor,
                    baseBorderAlpha: sheetMode ? 0.74 : shortageCount > 0 ? 0.95 : 0.82,
                };
                rowBg.setInteractive({ useHandCursor: true });
                rowBg.on('pointerover', () => {
                    rowBg.setFillStyle(spotlightRow.hoverFillColor, 1);
                    this.setDetailCardId(stack.id);
                });
                rowBg.on('pointerout', () => this.applySpotlightRowState(spotlightRow, this.detailCardId === stack.id));
                rowBg.on('pointerdown', () => {
                    this.setKeyboardZone('editor');
                    this.setDetailCardId(stack.id);
                });
                this.registerSpotlightRow(this.editorSpotlightRows, spotlightRow);
                const accent = this.scene.add.rectangle(tileX + 8, rowCenterY, 5, editorRowHeight - 18, rowAccentColor, 0.96)
                    .setOrigin(0, 0.5);
                const cardGlyph = this.createCompactCardGlyphBadge(
                    tileX + 16,
                    rowY + 12,
                    metadataEntry?.kind,
                    metadataEntry?.rarity,
                );

                const [statusPillBgLocal, statusPillTextLocal] = this.createRightAlignedPill(
                    tileX + tileW - 12,
                    rowY + 16,
                    tileStatusLabel,
                    shortageCount > 0 ? 0x5b1520 : remainingCount === 0 ? 0x4d3709 : PANEL_SELECTED_FILL,
                    shortageCount > 0 ? '#f3d0c3' : remainingCount === 0 ? '#f6e2b1' : '#d9c6a2',
                );
                const textColumnWidth = Math.max(144, sheetMode ? tileW - 236 : summaryW - 296);
                const nameText = this.scene.add.text(tileX + 56, rowY + 12, displayName, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '20px',
                    color: '#f3ead3',
                    fontStyle: 'bold',
                    wordWrap: { width: textColumnWidth },
                });
                const metaText = this.scene.add.text(tileX + 56, rowY + 38, truncateLabel(metaLabel, detailExpanded ? 28 : sheetMode ? 28 : 36), {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: '#d9c6a2',
                    wordWrap: { width: textColumnWidth },
                });
                const availabilityText = this.scene.add.text(tileX + 16, rowY + 62, availabilityLabel, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: detailColor,
                    wordWrap: { width: Math.max(140, sheetMode ? tileW - 220 : summaryW - 296) },
                });
                const footerDivider = this.scene.add.rectangle(
                    tileX + tileW / 2,
                    rowY + editorRowHeight - 46,
                    sheetMode ? tileW - 18 : summaryW - 22,
                    1,
                    rowAccentColor,
                    sheetMode ? 0.12 : 0.16,
                );
                const actionY = rowY + editorRowHeight - 26;
                const countBadgeBg = this.scene.add.rectangle(tileX + tileW - 190, actionY, 80, 30, expeditionUiTheme.colors.panel, 0.96);
                countBadgeBg.setStrokeStyle(1, rowBorderColor, 0.52);
                const countBadgeText = this.scene.add.text(tileX + tileW - 190, actionY, `×${stack.count}`, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: '#f3ead3',
                    fontStyle: 'bold',
                }).setOrigin(0.5);
                const removeButton = this.createButton(
                    tileX + tileW - 104,
                    actionY,
                    56,
                    SECONDARY_BUTTON_HEIGHT,
                    '-1',
                    0x3f1d24,
                    () => {
                        this.setKeyboardZone('editor');
                        this.setDetailCardId(stack.id);
                        this.updateDeckCards(deck.id, adjustDeckCardCount(deck.cards, stack.id, -1));
                    },
                    false,
                    {
                        hoverFillColor: 0x5a2430,
                        strokeColor: 0xfca5a5,
                        fontSize: '18px',
                    },
                );
                const clearButton = this.createButton(
                    tileX + tileW - 36,
                    actionY,
                    64,
                    SECONDARY_BUTTON_HEIGHT,
                    '清空',
                    0x51202a,
                    () => {
                        this.setKeyboardZone('editor');
                        this.setDetailCardId(stack.id);
                        this.updateDeckCards(deck.id, adjustDeckCardCount(deck.cards, stack.id, -stack.count));
                    },
                    false,
                    {
                        hoverFillColor: 0x6f2430,
                        strokeColor: 0xfca5a5,
                        fontSize: '18px',
                    },
                );

                cardsInner.add([
                    rowBg,
                    accent,
                    ...cardGlyph,
                    statusPillBgLocal,
                    statusPillTextLocal,
                    nameText,
                    metaText,
                    availabilityText,
                    footerDivider,
                    countBadgeBg,
                    countBadgeText,
                    ...removeButton,
                    ...clearButton,
                ]);
            }
        }

        const total = deck.cards.length;
        const start = total === 0
            ? 0
            : (sheetMode ? this.editorScrollOffset * this.editorGridColumns : this.editorScrollOffset) + 1;
        const end = total === 0
            ? 0
            : Math.min(
                (sheetMode ? this.editorScrollOffset * this.editorGridColumns : this.editorScrollOffset) + visibleCardCount,
                total,
            );
        const posText = this.scene.add.text(localX, scrollBtnY, `显示 ${start}-${end} / ${total}`, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
        }).setOrigin(0, 0.5);

        const scrollUpButton = this.createButton(
            summaryW - 86,
            scrollBtnY,
            56,
            SCROLL_BUTTON_HEIGHT,
            '▲',
            BUTTON_NEUTRAL_FILL,
            () => {
                this.editorScrollOffset = Math.max(0, this.editorScrollOffset - 1);
                this.refreshEditor();
            },
            this.editorScrollOffset <= 0,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );
        const scrollDownButton = this.createButton(
            summaryW - 22,
            scrollBtnY,
            56,
            SCROLL_BUTTON_HEIGHT,
            '▼',
            BUTTON_NEUTRAL_FILL,
            () => {
                this.editorScrollOffset += 1;
                this.refreshEditor();
            },
            this.editorScrollOffset >= maxOffset,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );

        this.editorContainer.add([posText, ...scrollUpButton, ...scrollDownButton]);

        if (capacityFill && (deckSelectionChanged || countChanged)) {
            const startingScaleX = deckSelectionChanged
                ? 0
                : capacityFillWidth > 0
                    ? clampNumber(previousCapacityFillWidth / capacityFillWidth, 0, 1.35)
                    : 0;
            capacityFill.setScale(startingScaleX, 1);
            this.scene.tweens.add({
                targets: capacityFill,
                scaleX: 1,
                duration: deckSelectionChanged ? 210 : 170,
                ease: 'Cubic.easeOut',
            });
        }

        if (deckSelectionChanged) {
            this.playMotionPulse(
                [
                    summaryCard,
                    headerMetaText,
                    countText,
                    statusPillBg,
                    statusPillText,
                    detailText,
                    returnHintText,
                    ctaButton,
                    ctaLabel,
                    ...detailSurfacePulseTargets,
                    cardListTitle,
                    cardsOuter,
                ],
                {
                    alphaFrom: 0.58,
                    scaleXFrom: 0.976,
                    scaleYFrom: 0.94,
                    duration: 210,
                },
            );
        } else {
            if (countChanged) {
                this.playMotionPulse(
                    [
                        headerMetaText,
                        countText,
                        detailText,
                        capacitySummaryText,
                        returnHintText,
                    ],
                    {
                        alphaFrom: 0.52,
                        scaleXFrom: 0.99,
                        scaleYFrom: 0.99,
                        duration: 160,
                    },
                );
            }

            if (readinessChanged) {
                this.playMotionPulse(
                    [
                        summaryCard,
                        statusPillBg,
                        statusPillText,
                        returnHintText,
                        ctaButton,
                        ctaLabel,
                    ],
                    {
                        alphaFrom: 0.48,
                        scaleXFrom: 0.975,
                        scaleYFrom: 0.92,
                        duration: 210,
                    },
                );
            }
        }

        this.lastEditorFeedback = {
            deckId: deck.id,
            count: summary.count,
            readinessTier,
        };
    }

    private createBrowserColumn(x: number, y: number, colW: number, colH: number): void {
        const shellBg = this.scene.add.rectangle(x + colW / 2, y + colH / 2, colW, colH, SECTION_FILL, 0.94);
        shellBg.setStrokeStyle(1, blendColor(SECTION_BORDER, VALID_ACCENT, 0.16), 0.68);
        const shellAccent = this.scene.add.rectangle(x + 16, y + 13, 42, 3, VALID_ACCENT, 0.76).setOrigin(0, 0.5);
        const title = this.scene.add.text(x + 16, y + 7, '从储物袋加入', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#f3ead3',
            fontStyle: 'bold',
        });
        const subtitle = this.scene.add.text(x + 16, y + 38, '搜索 / 筛选 / 排序都收在这里；结果直接接在下方。', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            wordWrap: { width: colW - 32 },
        });

        const innerX = x + 16;
        const innerW = colW - 32;
        const controlCardY = y + 68;
        const controlCardH = 188;
        const controlsCard = this.scene.add.rectangle(innerX + innerW / 2, controlCardY + controlCardH / 2, innerW, controlCardH, PANEL_DEEP_FILL, 0.92);
        controlsCard.setStrokeStyle(1, blendColor(VALID_ACCENT, SECTION_BORDER, 0.3), 0.32);
        const controlsDivider = this.scene.add.rectangle(innerX + innerW / 2, controlCardY + 28, innerW - 20, 1, VALID_ACCENT, 0.12);
        const controlLabelY = controlCardY + 14;
        const searchY = controlCardY + 58;
        const controlsY = controlCardY + 116;
        const summaryHeight = 40;
        const summaryY = controlCardY + controlCardH - 24;
        const scrollBtnY = y + colH - 28;
        const listTop = controlCardY + controlCardH + 8;
        const listBottom = scrollBtnY - 24;
        const listH = Math.max(120, listBottom - listTop);

        this.browserArea = { x: innerX, y: listTop, w: innerW, h: listH };
        this.browserVisibleRows = Math.max(1, Math.floor(listH / BROWSER_ROW_HEIGHT));
        this.browserSummaryArea = { x: innerX, y: summaryY, w: innerW, h: summaryHeight };

        const controlLabel = this.scene.add.text(innerX, controlLabelY, '浏览控制', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            fontStyle: 'bold',
        });
        this.browserStateText = this.scene.add.text(innerX + innerW - 12, controlLabelY, '', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            fontStyle: 'bold',
        }).setOrigin(1, 0);

        this.queryBg = this.scene.add.rectangle(innerX + innerW / 2, searchY, innerW, SEARCH_FIELD_HEIGHT, expeditionUiTheme.colors.panel, 1);
        this.queryBg.setStrokeStyle(1, SECTION_BORDER, 0.9);
        this.queryBg.setInteractive({ useHandCursor: true });
        this.queryBg.on('pointerdown', () => {
            this.setKeyboardZone('browser');
            if (this.searchFocus) {
                this.focusSearchTextEntry();
                return;
            }

            this.setSearchFocus(true);
        });

        this.queryText = this.scene.add.text(innerX + 14, searchY, this.filterQuery || '搜索卡牌、编号或名称', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: this.filterQuery ? '#f3ead3' : '#64748b',
        }).setOrigin(0, 0.5);

        this.queryClearBtn = this.scene.add.text(innerX + innerW - 12, searchY, '清空', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            fontStyle: 'bold',
        }).setOrigin(1, 0.5);
        this.queryClearBtn.setInteractive({ useHandCursor: true });
        this.queryClearBtn.on('pointerdown', () => {
            this.setKeyboardZone('browser');
            this.filterQuery = '';
            this.setSearchFocus(false);
            this.refreshBrowser();
            this.updateSearchDisplay();
        });
        this.queryClearBtn.setVisible(this.filterQuery.length > 0);

        const buttonGap = 6;
        const kindButtonWidth = 78;
        const hideZeroButtonWidth = 56;
        const sortFieldButtonWidth = 78;
        const sortDirButtonWidth = 56;
        const sortDirButtonX = innerX + innerW - sortDirButtonWidth / 2;
        const sortFieldButtonX = sortDirButtonX - sortDirButtonWidth / 2 - buttonGap - sortFieldButtonWidth / 2;
        const hideZeroButtonX = sortFieldButtonX - sortFieldButtonWidth / 2 - buttonGap - hideZeroButtonWidth / 2;
        const kindButtonX = hideZeroButtonX - hideZeroButtonWidth / 2 - buttonGap - kindButtonWidth / 2;

        const kindButton = this.createButton(
            kindButtonX,
            controlsY,
            kindButtonWidth,
            SECONDARY_BUTTON_HEIGHT,
            `类：${KIND_LABEL[String(this.filterKind)]}`,
            BUTTON_ACCENT_FILL,
            () => {
                this.setKeyboardZone('browser');
                this.cycleBrowserKindFilter();
            },
            false,
            {
                hoverFillColor: BUTTON_ACCENT_HOVER_FILL,
                strokeColor: expeditionUiTheme.colors.goldSoft,
                fontSize: '18px',
            },
        );
        this.kindBtn = kindButton[0];
        this.kindBtnText = kindButton[1];

        const hideZeroButton = this.createButton(
            hideZeroButtonX,
            controlsY,
            hideZeroButtonWidth,
            SECONDARY_BUTTON_HEIGHT,
            this.filterHideZero ? '零：隐' : '零：显',
            this.filterHideZero ? BUTTON_PRIMARY_FILL : BUTTON_NEUTRAL_FILL,
            () => {
                this.setKeyboardZone('browser');
                this.toggleBrowserHideZero();
            },
            false,
            {
                hoverFillColor: this.filterHideZero ? BUTTON_PRIMARY_HOVER_FILL : BUTTON_NEUTRAL_HOVER_FILL,
                strokeColor: this.filterHideZero ? expeditionUiTheme.colors.goldSoft : expeditionUiTheme.colors.slate,
                fontSize: '18px',
            },
        );
        this.hideZeroBtn = hideZeroButton[0];
        this.hideZeroBtnText = hideZeroButton[1];

        const sortFieldButton = this.createButton(
            sortFieldButtonX,
            controlsY,
            sortFieldButtonWidth,
            SECONDARY_BUTTON_HEIGHT,
            `序：${getSortFieldLabel(this.sortField)}`,
            BUTTON_NEUTRAL_FILL,
            () => {
                this.setKeyboardZone('browser');
                this.cycleBrowserSortField();
            },
            false,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );
        this.sortFieldBtn = sortFieldButton[0];
        this.sortFieldBtnText = sortFieldButton[1];

        const sortDirButton = this.createButton(
            sortDirButtonX,
            controlsY,
            sortDirButtonWidth,
            SECONDARY_BUTTON_HEIGHT,
            this.sortDirection === 'asc' ? '↑ 升' : '↓ 降',
            BUTTON_NEUTRAL_FILL,
            () => {
                this.setKeyboardZone('browser');
                this.toggleBrowserSortDirection();
            },
            false,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );
        this.sortDirBtn = sortDirButton[0];
        this.sortDirBtnText = sortDirButton[1];

        this.browserSummaryContainer = this.scene.add.container(innerX, summaryY);

        this.add([
            shellBg,
            shellAccent,
            title,
            subtitle,
            controlsCard,
            controlsDivider,
            controlLabel,
            this.browserStateText,
            this.queryBg,
            this.queryText,
            this.queryClearBtn,
            ...kindButton,
            ...hideZeroButton,
            ...sortFieldButton,
            ...sortDirButton,
            this.browserSummaryContainer,
        ]);

        const resultsBg = this.scene.add.rectangle(innerX + innerW / 2, listTop + listH / 2, innerW, listH, PANEL_DEEP_FILL, 0.82);
        resultsBg.setStrokeStyle(1, blendColor(VALID_ACCENT, SECTION_BORDER, 0.22), 0.44);
        const resultsAccent = this.scene.add.rectangle(innerX + innerW / 2, listTop + 1, innerW - 12, 2, VALID_ACCENT, 0.2);
        this.add([resultsBg, resultsAccent]);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(innerX, listTop, innerW, listH);
        maskGraphics.setVisible(false);

        this.browserOuter = this.scene.add.container(innerX, listTop);
        this.browserOuter.setMask(maskGraphics.createGeometryMask());
        this.browserInner = this.scene.add.container(0, 0);
        this.browserOuter.add(this.browserInner);
        this.add([maskGraphics, this.browserOuter]);

        const scrollUpButton = this.createButton(
            innerX + innerW - 86,
            scrollBtnY,
            56,
            SCROLL_BUTTON_HEIGHT,
            '▲',
            BUTTON_NEUTRAL_FILL,
            () => {
                this.browserScrollOffset = Math.max(0, this.browserScrollOffset - 1);
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );
        const scrollDownButton = this.createButton(
            innerX + innerW - 22,
            scrollBtnY,
            56,
            SCROLL_BUTTON_HEIGHT,
            '▼',
            BUTTON_NEUTRAL_FILL,
            () => {
                this.browserScrollOffset += 1;
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: BUTTON_NEUTRAL_HOVER_FILL, strokeColor: expeditionUiTheme.colors.slate, fontSize: '18px' },
        );
        this.add([...scrollUpButton, ...scrollDownButton]);

        this.browserPosText = this.scene.add.text(innerX, scrollBtnY, '', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
        }).setOrigin(0, 0.5);
        this.add(this.browserPosText);

        this.refreshBrowser();
    }

    private refreshBrowser(): void {
        if (!this.browserInner) return;

        this.updateSearchDisplay();
        this.browserSpotlightRows.clear();

        const browserStateParts = [
            this.filterQuery.trim().length > 0 ? `搜「${truncateLabel(this.filterQuery.trim(), 6)}」` : '搜全部',
            `类${KIND_LABEL[String(this.filterKind)]}`,
            this.filterHideZero ? '零隐藏' : '零显示',
            `序${getCompactSortLabel(this.sortField, this.sortDirection)}`,
        ];
        if (this.browserStateText) {
            this.browserStateText.setText(truncateLabel(browserStateParts.join(' · '), 34));
            this.browserStateText.setColor(this.hasModifiedBrowserControls() ? '#d9c6a2' : '#bca785');
        }

        if (this.kindBtnText) {
            this.kindBtnText.setText(`类：${KIND_LABEL[String(this.filterKind)]}`);
        }

        this.setButtonVisualState(this.kindBtn, this.kindBtnText, {
            fillColor: this.filterKind === undefined ? PANEL_ATTENTION_FILL : BUTTON_ACCENT_FILL,
            hoverFillColor: this.filterKind === undefined ? PANEL_ATTENTION_HOVER_FILL : BUTTON_ACCENT_HOVER_FILL,
            strokeColor: expeditionUiTheme.colors.goldSoft,
        }
        );

        if (this.hideZeroBtnText) {
            this.hideZeroBtnText.setText(this.filterHideZero ? '零：隐' : '零：显');
        }
        this.setButtonVisualState(this.hideZeroBtn, this.hideZeroBtnText, {
            fillColor: this.filterHideZero ? BUTTON_PRIMARY_FILL : BUTTON_NEUTRAL_FILL,
            hoverFillColor: this.filterHideZero ? BUTTON_PRIMARY_HOVER_FILL : BUTTON_NEUTRAL_HOVER_FILL,
            strokeColor: this.filterHideZero ? expeditionUiTheme.colors.goldSoft : expeditionUiTheme.colors.slate,
        });

        if (this.sortFieldBtnText) {
            this.sortFieldBtnText.setText(`序：${getSortFieldLabel(this.sortField)}`);
        }
        this.setButtonVisualState(this.sortFieldBtn, this.sortFieldBtnText, {
            fillColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? BUTTON_NEUTRAL_FILL : BUTTON_ACCENT_FILL,
            hoverFillColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? BUTTON_NEUTRAL_HOVER_FILL : BUTTON_ACCENT_HOVER_FILL,
            strokeColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? expeditionUiTheme.colors.slate : expeditionUiTheme.colors.goldSoft,
        });

        if (this.sortDirBtnText) {
            this.sortDirBtnText.setText(this.sortDirection === 'asc' ? '↑ 升' : '↓ 降');
        }
        this.setButtonVisualState(this.sortDirBtn, this.sortDirBtnText, {
            fillColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? BUTTON_NEUTRAL_FILL : BUTTON_PRIMARY_FILL,
            hoverFillColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? BUTTON_NEUTRAL_HOVER_FILL : BUTTON_PRIMARY_HOVER_FILL,
            strokeColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? expeditionUiTheme.colors.slate : expeditionUiTheme.colors.goldSoft,
        });

        this.browserInner.removeAll(true);

        const { rows, matchedRows, totalRows } = this.buildBrowserCollections();

        const maxOffset = Math.max(0, rows.length - this.browserVisibleRows);
        this.browserScrollOffset = clampNumber(this.browserScrollOffset, 0, maxOffset);

        const selectedDeck = this.getSelectedDeck();
        const deckCards = selectedDeck?.cards ?? [];
        const selectedSummary = this.getSelectedDeckStatus();
        const selectedCapacity = selectedDeck ? summarizeDeckCapacity(deckCards) : null;
        this.refreshBrowserSummary(
            rows.length,
            matchedRows.length,
            totalRows.length,
            selectedDeck,
            selectedSummary,
            selectedCapacity,
        );

        if (rows.length === 0) {
            const hasModifiedControls = this.hasModifiedBrowserControls();
            let emptyTitle = '储物袋中还没有卡牌';
            let emptyBody = '当前库存为空，暂时没有可加入卡组的卡牌。';
            let emptyFillColor: number = expeditionUiTheme.colors.panel;
            let emptyBorderColor: number = SECTION_BORDER;
            let emptyTitleColor = '#f3ead3';
            let emptyBodyColor = '#bca785';

            if (!selectedDeck) {
                emptyTitle = '先选择一个要带入的卡组';
                emptyBody = hasModifiedControls
                    ? '左侧选定卡组后，再决定是否保持当前浏览条件，或点击上方“恢复默认”回到完整库存。'
                    : '左侧选定卡组后，这里会继续显示可加入的库存卡牌与一键加满入口。';
            } else if (matchedRows.length > 0 && this.filterHideZero) {
                emptyTitle = '命中条目都为零张';
                emptyBody = '当前搜索或种类条件有命中，但它们都被“零：隐”筛掉了；可切换到“零：显”，或点击上方“恢复默认”。';
                emptyFillColor = 0x271b0b;
                emptyBorderColor = WARNING_ACCENT;
                emptyTitleColor = '#f6e2b1';
                emptyBodyColor = '#fcd34d';
            } else if (this.filterQuery.trim().length > 0 || this.filterKind !== undefined) {
                emptyTitle = '当前浏览条件没有命中卡牌';
                emptyBody = '可调整搜索词、切换种类，或点击上方“恢复默认”重新查看全部库存。';
                emptyFillColor = 0x111c33;
                emptyBorderColor = SELECTED_ACCENT;
                emptyTitleColor = '#f3ead3';
                emptyBodyColor = '#d9c6a2';
            } else if (hasModifiedControls) {
                emptyTitle = '当前没有可加入的库存条目';
                emptyBody = '试试切换零库存显示方式，或点击上方“恢复默认”回到默认浏览。';
                emptyFillColor = 0x271b0b;
                emptyBorderColor = WARNING_ACCENT;
                emptyTitleColor = '#f6e2b1';
                emptyBodyColor = '#fcd34d';
            }

            const emptyCard = this.scene.add.rectangle(this.browserArea.w / 2, 78, this.browserArea.w, 124, emptyFillColor, 0.98);
            emptyCard.setStrokeStyle(1, emptyBorderColor, 0.92);
            const title = this.scene.add.text(this.browserArea.w / 2, 56, emptyTitle, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '18px',
                color: emptyTitleColor,
                fontStyle: 'bold',
                align: 'center',
                wordWrap: { width: this.browserArea.w - 40 },
            }).setOrigin(0.5);
            const body = this.scene.add.text(this.browserArea.w / 2, 92, emptyBody, {
                fontFamily: expeditionUiTheme.fonts.ui,
                fontSize: '16px',
                color: emptyBodyColor,
                align: 'center',
                wordWrap: { width: this.browserArea.w - 40 },
            }).setOrigin(0.5);
            this.browserInner.add([emptyCard, title, body]);
        } else {
            const start = this.browserScrollOffset;
            const end = Math.min(start + this.browserVisibleRows, rows.length);

            for (let index = start; index < end; index += 1) {
                const row = rows[index];
                const rowY = (index - start) * BROWSER_ROW_HEIGHT;
                const inDeck = deckCards.find((stack) => stack.id === row.id)?.count ?? 0;
                const available = computeAvailable(this.stash.cards, deckCards, row.id);
                const hasDeck = selectedDeck !== null;
                const deckSlotsRemaining = selectedCapacity?.slotsRemainingToMax ?? 0;
                const deckFull = deckSlotsRemaining <= 0;
                const quickAddCount = getQuickAddCount(available, deckSlotsRemaining);
                const canAdd = hasDeck && available > 0 && !deckFull;
                const displayName = row.name ?? row.id;

                const secondaryParts: string[] = [];
                if (row.kind) {
                    secondaryParts.push(KIND_LABEL[row.kind]);
                }
                secondaryParts.push(`库存 ${row.count}`);
                secondaryParts.push(`卡组 ${inDeck}`);

                let stateLabel = `可加 ${Math.max(available, 0)}`;
                let borderColor: number = VALID_ACCENT;
                let fillColor: number = 0x0d1b13;
                let nameColor = '#f3ead3';
                let detailColor = '#e6f3ea';
                let disabledFillColor = BUTTON_NEUTRAL_FILL;
                let disabledStrokeColor: number = expeditionUiTheme.colors.slate;
                let disabledTextColor = '#bca785';

                if (!hasDeck) {
                    stateLabel = '先选卡组';
                    borderColor = SECTION_BORDER;
                    fillColor = expeditionUiTheme.colors.panelInner;
                    nameColor = '#f3ead3';
                    detailColor = '#bca785';
                    disabledStrokeColor = expeditionUiTheme.colors.slate;
                } else if (deckFull) {
                    stateLabel = '卡组已满';
                    borderColor = WARNING_ACCENT;
                    fillColor = 0x1c1a12;
                    detailColor = '#f6e2b1';
                    disabledFillColor = 0x3b2a0e;
                    disabledStrokeColor = 0xfcd34d;
                    disabledTextColor = '#f6e2b1';
                } else if (available <= 0) {
                    stateLabel = '已耗尽';
                    borderColor = INVALID_ACCENT;
                    fillColor = 0x201018;
                    nameColor = row.count > 0 || inDeck > 0 ? '#f3ead3' : '#bca785';
                    detailColor = '#f3d0c3';
                    disabledFillColor = 0x3f1d24;
                    disabledStrokeColor = 0xfca5a5;
                    disabledTextColor = '#f3d0c3';
                }
                const spotlightTheme = getPreviewTheme(this.config.metadata?.[row.id]?.kind);
                const hoverFillColor = !hasDeck ? BUTTON_NEUTRAL_HOVER_FILL : deckFull ? 0x252016 : available <= 0 ? 0x27141c : 0x102017;
                const activeFillColor = blendColor(fillColor, spotlightTheme.headerFillColor, 0.54);
                secondaryParts.push(stateLabel);

                const rowBg = this.scene.add.rectangle(this.browserArea.w / 2, rowY + BROWSER_ROW_HEIGHT / 2, this.browserArea.w, BROWSER_ROW_HEIGHT - 6, fillColor, 0.98);
                rowBg.setStrokeStyle(1, borderColor, canAdd ? 0.9 : 0.65);
                const spotlightRow: SpotlightRowHandle = {
                    cardId: row.id,
                    bg: rowBg,
                    baseFillColor: fillColor,
                    hoverFillColor,
                    activeFillColor,
                    baseBorderColor: borderColor,
                    activeBorderColor: spotlightTheme.borderColor,
                    baseBorderAlpha: canAdd ? 0.9 : 0.65,
                };
                rowBg.setInteractive({ useHandCursor: true });
                rowBg.on('pointerover', () => {
                    rowBg.setFillStyle(spotlightRow.hoverFillColor, 1);
                    this.setDetailCardId(row.id);
                });
                rowBg.on('pointerout', () => this.applySpotlightRowState(spotlightRow, this.detailCardId === row.id));
                rowBg.on('pointerdown', () => {
                    this.setKeyboardZone('browser');
                    this.setDetailCardId(row.id);
                });
                this.registerSpotlightRow(this.browserSpotlightRows, spotlightRow);
                const accent = this.scene.add.rectangle(5, rowY + BROWSER_ROW_HEIGHT / 2, 6, BROWSER_ROW_HEIGHT - 14, borderColor, 1)
                    .setOrigin(0, 0.5);
                const browserGlyph = this.createCompactCardGlyphBadge(
                    14,
                    rowY + 10,
                    row.kind,
                    this.config.metadata?.[row.id]?.rarity,
                );

                const nameText = this.scene.add.text(50, rowY + 10, displayName, {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '20px',
                    color: nameColor,
                    fontStyle: 'bold',
                    wordWrap: { width: Math.max(110, this.browserArea.w - 168) },
                });
                const detailText = this.scene.add.text(50, rowY + 40, secondaryParts.join(' · '), {
                    fontFamily: expeditionUiTheme.fonts.ui,
                    fontSize: '16px',
                    color: detailColor,
                    wordWrap: { width: Math.max(110, this.browserArea.w - 168) },
                });

                const addButton = this.createButton(
                    this.browserArea.w - 96,
                    rowY + 86,
                    56,
                    SECONDARY_BUTTON_HEIGHT,
                    '+1',
                    0x14532d,
                    () => {
                        this.setKeyboardZone('browser');
                        this.setDetailCardId(row.id);
                        if (selectedDeck) {
                            this.updateDeckCards(selectedDeck.id, adjustDeckCardCount(deckCards, row.id, 1));
                        }
                    },
                    !canAdd,
                    {
                        hoverFillColor: 0x166534,
                        strokeColor: 0x86efac,
                        disabledFillColor,
                        disabledStrokeColor,
                        disabledTextColor,
                        fontSize: '18px',
                    },
                );
                const quickAddButton = this.createButton(
                    this.browserArea.w - 34,
                    rowY + 86,
                    64,
                    SECONDARY_BUTTON_HEIGHT,
                    '加满',
                    0x166534,
                    () => {
                        this.setKeyboardZone('browser');
                        this.setDetailCardId(row.id);
                        if (selectedDeck) {
                            this.updateDeckCards(selectedDeck.id, adjustDeckCardCount(deckCards, row.id, quickAddCount));
                        }
                    },
                    !canAdd,
                    {
                        hoverFillColor: 0x15803d,
                        strokeColor: 0x86efac,
                        disabledFillColor,
                        disabledStrokeColor,
                        disabledTextColor,
                        fontSize: '18px',
                    },
                );

                this.browserInner.add([rowBg, accent, ...browserGlyph, nameText, detailText, ...addButton, ...quickAddButton]);
            }
        }

        if (selectedDeck && this.pendingSelectedDeckMotionId === selectedDeck.id) {
            this.playMotionPulse([this.browserInner], {
                alphaFrom: 0.62,
                scaleXFrom: 0.985,
                scaleYFrom: 0.96,
                duration: 190,
            });
        }

        if (this.pendingSelectedDeckMotionId !== null) {
            this.refreshSpotlightRowStates(true);
        }

        if (this.browserPosText) {
            const total = rows.length;
            const start = total === 0 ? 0 : this.browserScrollOffset + 1;
            const end = total === 0 ? 0 : Math.min(this.browserScrollOffset + this.browserVisibleRows, total);
            this.browserPosText.setText(total === 0 ? '当前无结果' : `显示 ${start}-${end} / ${total}`);
        }
    }

    private showDeleteConfirmation(): void {
        if (this.dialogMode) return;
        if (this.stash.savedDecks.length <= 1) return;
        const deck = this.getSelectedDeck();
        if (!deck || !this.selectedDeckId) return;

        if (this.searchFocus) {
            this.setSearchFocus(false);
        }

        if (this.namingMode) {
            this.cancelRename();
        }

        this.dialogMode = true;
        this.setKeyboardZone('decks');
        this.refreshKeyboardGuide();

        const { width, height } = this.scene.scale;
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.62)
            .setInteractive()
            .setDepth(1500);

        const boxW = 484;
        const boxH = 236;
        const box = this.scene.add.rectangle(width / 2, height / 2, boxW, boxH, expeditionUiTheme.colors.panelInner, 0.99)
            .setStrokeStyle(2, INVALID_ACCENT, 0.92)
            .setDepth(1501);

        const title = this.scene.add.text(width / 2, height / 2 - 68, '确认删除当前卡组', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(1501);

        const body = this.scene.add.text(width / 2, height / 2 - 12, `确定要删除卡组「${deck.name}」吗？\n删除后无法撤销，请谨慎确认。`, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#d9c6a2',
            align: 'center',
            wordWrap: { width: boxW - 64 },
        }).setOrigin(0.5).setDepth(1501);

        const [cancelBtn, cancelLabel] = this.createButton(
            width / 2 - 92,
            height / 2 + 66,
            136,
            SECONDARY_BUTTON_HEIGHT,
            '取消',
            expeditionUiTheme.colors.slate,
            () => this.hideDeleteConfirmation(),
            false,
            { hoverFillColor: expeditionUiTheme.colors.slate, strokeColor: 0x94a3b8 },
        );
        cancelBtn.setDepth(1501);
        cancelLabel.setDepth(1501);

        const [confirmBtn, confirmLabel] = this.createButton(
            width / 2 + 92,
            height / 2 + 66,
            148,
            PRIMARY_BUTTON_HEIGHT,
            '确认删除',
            0xb91c1c,
            () => this.confirmDelete(),
            false,
            { hoverFillColor: 0xdc2626, strokeColor: 0xfca5a5, fontSize: '18px' },
        );
        confirmBtn.setDepth(1501);
        confirmLabel.setDepth(1501);

        this.dialogObjects = [overlay, box, title, body, cancelBtn, cancelLabel, confirmBtn, confirmLabel];
    }

    private hideDeleteConfirmation(): void {
        this.dialogMode = false;
        this.dialogObjects.forEach((obj) => obj.destroy());
        this.dialogObjects = [];
        this.refreshKeyboardGuide();
    }

    private confirmDelete(): void {
        if (!this.selectedDeckId) return;

        const newStash = deleteSavedDeckFromStash(this.stash, this.selectedDeckId);
        this.applyStashChange(newStash);
        this.refreshDeckViews();
        this.hideDeleteConfirmation();
    }
}
