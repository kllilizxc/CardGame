import { GameObjects, Scene } from 'phaser';

import type { CardKind, CardRarity } from '@data/types/cards/core';
import type { ExpeditionRouteBriefingSummary } from '../../scenes/expedition/entryFlowModel';
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

export interface DeckManagementPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    routeBriefing?: ExpeditionRouteBriefingSummary;
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

const DECK_LIST_SUMMARY_HEIGHT = 64;
const DECK_ROW_HEIGHT = 84;
const EDITOR_ROW_HEIGHT = 72;
const BROWSER_ROW_HEIGHT = 72;
const DECK_NAMING_TEXT_ENTRY_SESSION_ID = 'deck-name';
const DECK_SEARCH_TEXT_ENTRY_SESSION_ID = 'deck-search';

const PANEL_FILL = 0x0b1220;
const SECTION_FILL = 0x111827;
const SECTION_BORDER = 0x334155;
const PANEL_ACCENT = 0x8b5cf6;
const SELECTED_ACCENT = 0x60a5fa;
const VALID_ACCENT = 0x22c55e;
const WARNING_ACCENT = 0xf59e0b;
const INVALID_ACCENT = 0xef4444;

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
                accentColor: 0x38bdf8,
                borderColor: 0x7dd3fc,
                headerFillColor: 0x0f2942,
                heroFillColor: 0x10263a,
                heroGlowColor: 0x38bdf8,
                badgeFillColor: 0x0f3b63,
                badgeTextColor: '#dbeafe',
            };
        case 'artifact':
            return {
                accentColor: 0xf59e0b,
                borderColor: 0xfcd34d,
                headerFillColor: 0x3a2407,
                heroFillColor: 0x35210b,
                heroGlowColor: 0xf59e0b,
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
                accentColor: 0x22c55e,
                borderColor: 0x86efac,
                headerFillColor: 0x10311b,
                heroFillColor: 0x112718,
                heroGlowColor: 0x22c55e,
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
            return 0xf59e0b;
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

function blendColor(baseColor: number, overlayColor: number, overlayWeight: number): number {
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
        return '#fecaca';
    }

    if (capacity.cardsNeededToMin > 0) {
        return '#fde68a';
    }

    return '#bbf7d0';
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

function getDeckCapacityBrowserLabel(capacity: DeckCapacityMetrics): string {
    if (capacity.cardsOverMax > 0) {
        return `超上限 ${capacity.cardsOverMax} 张 · 需回到 ${DECK_CARD_MAX} 张内`;
    }

    if (capacity.slotsRemainingToMax === 0) {
        return `已到 ${DECK_CARD_MAX} 张上限 · 请先移除再加入`;
    }

    if (capacity.cardsNeededToMin > 0) {
        return `离 ${DECK_CARD_MIN} 张还差 ${capacity.cardsNeededToMin} 张 · 空位 ${capacity.slotsRemainingToMax} 张`;
    }

    return `已达 ${DECK_CARD_MIN} 张出征线 · 空位 ${capacity.slotsRemainingToMax} 张`;
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
            headlineColor: '#fecaca',
            detailColor: '#fca5a5',
        };
    }

    if (options.namingMode) {
        return {
            fillColor: 0x241b4d,
            accentColor: PANEL_ACCENT,
            headline: options.namingMode === 'create' ? '键盘焦点：新卡组命名' : '键盘焦点：重命名输入',
            detail: '直接键入名称或粘贴内容 · Enter 确认 · Esc 取消；支持输入法。',
            headlineColor: '#ede9fe',
            detailColor: '#c4b5fd',
        };
    }

    if (options.searchFocus) {
        return {
            fillColor: 0x172554,
            accentColor: SELECTED_ACCENT,
            headline: '键盘焦点：搜索输入',
            detail: '直接键入搜索词或粘贴内容 · Enter / Esc 退出搜索；支持输入法。',
            headlineColor: '#dbeafe',
            detailColor: '#bfdbfe',
        };
    }

    switch (zone) {
        case 'decks':
            return {
                fillColor: 0x102344,
                accentColor: SELECTED_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: '↑↓ 切换卡组 · N 新建 · R 重命名 · Delete 删除当前卡组',
                headlineColor: '#dbeafe',
                detailColor: '#bfdbfe',
            };
        case 'editor':
            return {
                fillColor: 0x1f1732,
                accentColor: PANEL_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: '↑↓ 选中条目 · Enter 移除 1 · X 清空整行 · I 检视当前焦点',
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
                detailColor: '#bbf7d0',
            };
        case 'return':
            return {
                fillColor: 0x271b0b,
                accentColor: WARNING_ACCENT,
                headline: `键盘焦点：${getKeyboardZoneLabel(zone)}`,
                detail: 'Enter 直接返回远征准备 · Esc 也可立即返回 · 摘要区也能返回。',
                headlineColor: '#fde68a',
                detailColor: '#fcd34d',
            };
        default:
            return {
                fillColor: 0x111827,
                accentColor: SECTION_BORDER,
                headline: '键盘焦点：卡组管理',
                detail: 'Tab / Shift+Tab 切换区域 · Esc 返回远征准备',
                headlineColor: '#e2e8f0',
                detailColor: '#cbd5e1',
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
            pillTextColor: '#fecaca',
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
            pillTextColor: '#fde68a',
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
            pillTextColor: '#fecaca',
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
        pillTextColor: '#bbf7d0',
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
            fillColor: 0x0f172a,
            statusColor: '#cbd5e1',
            bodyColor: '#cbd5e1',
            kindLabel: '浏览提示',
            kindGlyph: '览',
            rarityLabel: '预览面板',
            rarityColor: PANEL_ACCENT,
            previewTheme,
            ownershipStats: [
                {
                    label: '卡组',
                    value: String(countDeckCards(deckCards)),
                    fillColor: blendColor(0x0f172a, previewTheme.headerFillColor, 0.72),
                    borderColor: previewTheme.borderColor,
                    valueColor: '#f8fafc',
                    labelColor: '#cbd5e1',
                },
                {
                    label: '库存',
                    value: String(stashCards.length),
                    fillColor: blendColor(0x0f172a, previewTheme.heroFillColor, 0.76),
                    borderColor: previewTheme.accentColor,
                    valueColor: '#f8fafc',
                    labelColor: '#cbd5e1',
                },
                {
                    label: '焦点',
                    value: '待选',
                    fillColor: 0x111827,
                    borderColor: SECTION_BORDER,
                    valueColor: '#cbd5e1',
                    labelColor: '#94a3b8',
                },
                {
                    label: '切换',
                    value: '悬停',
                    fillColor: 0x111827,
                    borderColor: SECTION_BORDER,
                    valueColor: '#cbd5e1',
                    labelColor: '#94a3b8',
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
    let accentColor = SECTION_BORDER;
    let fillColor = 0x111827;
    let statusColor = '#cbd5e1';
    let bodyColor = '#e2e8f0';

    if (shortageCount > 0) {
        contextParts.push(`缺 ${shortageCount} 张`);
        statusLabel = `库存不足 ${shortageCount} 张`;
        accentColor = INVALID_ACCENT;
        fillColor = 0x201018;
        statusColor = '#fecaca';
        bodyColor = '#fce7ea';
    } else if (availableCount > 0) {
        contextParts.push(`可再加 ${availableCount} 张`);
        statusLabel = `还可加入 ${availableCount} 张`;
        accentColor = VALID_ACCENT;
        fillColor = 0x0d1b13;
        statusColor = '#bbf7d0';
    } else if (deckCount > 0) {
        contextParts.push('已占满库存');
        statusLabel = '当前卡组已用满库存';
        accentColor = WARNING_ACCENT;
        fillColor = 0x1b1a12;
        statusColor = '#fde68a';
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
                fillColor: blendColor(0x0f172a, previewTheme.headerFillColor, 0.72),
                borderColor: previewTheme.borderColor,
                valueColor: '#f8fafc',
                labelColor: '#cbd5e1',
            },
            {
                label: '卡组',
                value: String(deckCount),
                fillColor: blendColor(0x0f172a, previewTheme.heroFillColor, 0.78),
                borderColor: previewTheme.accentColor,
                valueColor: '#f8fafc',
                labelColor: '#cbd5e1',
            },
            {
                label: '剩余',
                value: String(availableCount),
                fillColor: availableCount > 0 ? 0x0d2a1d : 0x111827,
                borderColor: availableCount > 0 ? VALID_ACCENT : SECTION_BORDER,
                valueColor: availableCount > 0 ? '#bbf7d0' : '#cbd5e1',
                labelColor: availableCount > 0 ? '#bbf7d0' : '#94a3b8',
            },
            {
                label: '缺口',
                value: String(shortageCount),
                fillColor: shortageCount > 0 ? 0x2b1418 : 0x111827,
                borderColor: shortageCount > 0 ? INVALID_ACCENT : SECTION_BORDER,
                valueColor: shortageCount > 0 ? '#fecaca' : '#cbd5e1',
                labelColor: shortageCount > 0 ? '#fecaca' : '#94a3b8',
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
            stripFillColor: 0x29161b,
            stripTextColor: '#fecaca',
            buttonFillColor: 0xb91c1c,
            buttonHoverFillColor: 0xdc2626,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#fff1f2',
            buttonStatusLabel: '库存待补齐',
            summaryLabel: `当前卡组：${summary.count} 张 · ${summary.availabilityIssues.length} 种卡牌库存不足`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        return {
            stripFillColor: 0x271b0b,
            stripTextColor: '#fde68a',
            buttonFillColor: 0xb45309,
            buttonHoverFillColor: 0xd97706,
            buttonStrokeColor: 0xfcd34d,
            buttonTextColor: '#fff7ed',
            buttonStatusLabel: `还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
            summaryLabel: `当前卡组：${summary.count} 张 · 还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-many-cards') {
        return {
            stripFillColor: 0x29161b,
            stripTextColor: '#fecaca',
            buttonFillColor: 0xb91c1c,
            buttonHoverFillColor: 0xdc2626,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#fff1f2',
            buttonStatusLabel: `超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
            summaryLabel: `当前卡组：${summary.count} 张 · 超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
        };
    }

    return {
        stripFillColor: 0x10251a,
        stripTextColor: '#bbf7d0',
        buttonFillColor: 0x166534,
        buttonHoverFillColor: 0x15803d,
        buttonStrokeColor: 0x86efac,
        buttonTextColor: '#f0fdf4',
        buttonStatusLabel: '当前卡组已就绪',
        summaryLabel: `当前卡组：${summary.count} 张 · 已满足 20-40 张`,
    };
}

function buildDeckManagerRouteBannerDetail(routeBriefing: ExpeditionRouteBriefingSummary): string {
    return truncateLabel(routeBriefing.description, 120);
}

export class DeckManagementPanel extends GameObjects.Container {
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
    private detailPaneExpanded = false;
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

    private deckListOuter?: GameObjects.Container;
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
    private editorContentWidth = 0;
    private editorContentHeight = 0;
    private detailPaneWidth = 0;
    private detailPaneHeight = 0;

    private dialogMode = false;
    private dialogObjects: GameObjects.GameObject[] = [];

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

        this.keyboardGuideBg.setFillStyle(copy.fillColor, 0.98);
        this.keyboardGuideBg.setStrokeStyle(1, copy.accentColor, 0.92);
        this.keyboardGuideAccent.setFillStyle(copy.accentColor, 0.95);
        this.keyboardGuideHeadline.setText(copy.headline);
        this.keyboardGuideHeadline.setColor(copy.headlineColor);
        this.keyboardGuideDetail.setText(truncateLabel(copy.detail, this.config.routeBriefing ? 50 : 76));
        this.keyboardGuideDetail.setColor(copy.detailColor);
        this.keyboardGuidePillText.setText(this.dialogMode || this.namingMode || this.searchFocus
            ? 'Enter 确认 · Esc 取消'
            : 'Tab 切换区域 · Esc 返回');
        this.keyboardGuidePillText.setColor(copy.headlineColor);
        this.keyboardGuidePillBg.setFillStyle(0x0f172a, 1);
        this.keyboardGuidePillBg.setStrokeStyle(1, copy.accentColor, 0.28);
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
        this.namingInputText.setColor(this.renameBuffer.trim().length > 0 ? '#f8fafc' : '#64748b');
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
                fontFamily: 'Courier New',
                fontSize: 18,
                fontWeight: 'bold',
                color: '#f8fafc',
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

        this.deckListScrollOffset = Phaser.Math.Clamp(this.deckListScrollOffset, 0, maxOffset);
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

        const clampedIndex = Phaser.Math.Clamp(index, 0, deck.cards.length - 1);
        const nextCardId = deck.cards[clampedIndex]?.id;
        if (!nextCardId) {
            return;
        }

        const maxOffset = Math.max(0, deck.cards.length - this.editorVisibleRows);
        const previousOffset = this.editorScrollOffset;

        if (clampedIndex < this.editorScrollOffset) {
            this.editorScrollOffset = clampedIndex;
        } else if (clampedIndex >= this.editorScrollOffset + this.editorVisibleRows) {
            this.editorScrollOffset = clampedIndex - this.editorVisibleRows + 1;
        }

        this.editorScrollOffset = Phaser.Math.Clamp(this.editorScrollOffset, 0, maxOffset);
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

        const clampedIndex = Phaser.Math.Clamp(index, 0, browserRows.length - 1);
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

        this.browserScrollOffset = Phaser.Math.Clamp(this.browserScrollOffset, 0, maxOffset);
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

        this.detailPaneContainer.list.slice().forEach((child) => {
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
        const compactPreview = previewHeight < 170;
        const innerWidth = previewWidth - 20;
        const contentLeft = 10;
        const verticalGap = previewHeight >= 184 ? 8 : 6;
        const headerHeight = compactPreview ? 20 : previewHeight >= 184 ? 24 : 22;
        const footerHeight = compactPreview ? 18 : previewHeight >= 184 ? 22 : 18;
        const workingHeight = Math.max(compactPreview ? 64 : 74, previewHeight - headerHeight - footerHeight - verticalGap * 2 - 8);
        const heroHeight = Phaser.Math.Clamp(
            Math.floor(workingHeight * (compactPreview ? 0.34 : 0.42)),
            compactPreview ? 34 : 42,
            compactPreview ? 50 : 58,
        );
        const metricHeight = Phaser.Math.Clamp(
            Math.floor(workingHeight * (compactPreview ? 0.18 : 0.24)),
            compactPreview ? 20 : 24,
            compactPreview ? 26 : 30,
        );
        const copyHeight = Math.max(compactPreview ? 14 : 22, workingHeight - heroHeight - metricHeight);
        const heroTop = headerHeight + verticalGap;
        const metricsTop = heroTop + heroHeight + verticalGap;
        const copyTop = metricsTop + metricHeight + verticalGap;
        const availableCopyHeight = previewHeight - footerHeight - 8 - copyTop;
        const copyPanelHeight = Math.max(22, Math.min(copyHeight, availableCopyHeight));
        const footerTop = previewHeight - footerHeight - 8;
        const metricGap = 4;
        const metricWidth = (innerWidth - metricGap * 3) / 4;
        const showSecondaryCopy = Boolean(detail.secondaryCopyLabel) && copyPanelHeight >= 46;
        const showHeroSupport = !compactPreview && heroHeight >= 52;
        const primaryCopy = truncateLabel(
            detail.primaryCopyLabel,
            showSecondaryCopy ? 48 : copyPanelHeight >= 54 ? 84 : 68,
        );
        const secondaryCopy = showSecondaryCopy
            ? truncateLabel(detail.secondaryCopyLabel ?? '', copyPanelHeight >= 58 ? 54 : 42)
            : null;
        const supportLine = truncateLabel(detail.contextLabel, 38);
        const footerCopy = truncateLabel(
            joinPreviewFacts([detail.metaLabel, detail.rulesLabel ?? detail.footerLabel], 72) ?? detail.footerLabel,
            72,
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
                fontFamily: 'Arial',
                fontSize: '10px',
                color: textColor,
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            const width = Math.max(54, text.width + 18);
            const left = align === 'left' ? x : x - width;
            text.setX(left + 9);

            const bg = this.scene.add.rectangle(left + width / 2, y, width, 20, fillColor, 1);
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
            fontFamily: 'Arial',
            fontSize: '11px',
            color: '#cbd5e1',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        let collapseButtonBg: GameObjects.Rectangle | null = null;
        let collapseButtonText: GameObjects.Text | null = null;
        if (this.detailPaneExpanded) {
            collapseButtonBg = this.scene.add.rectangle(
                previewWidth - 28,
                headerHeight / 2,
                42,
                16,
                0x0f172a,
                0.96,
            );
            collapseButtonBg.setStrokeStyle(1, previewTheme.borderColor, 0.42);
            collapseButtonBg.setInteractive({ useHandCursor: true });
            collapseButtonBg.on('pointerover', () => collapseButtonBg?.setFillStyle(0x172033, 0.98));
            collapseButtonBg.on('pointerout', () => collapseButtonBg?.setFillStyle(0x0f172a, 0.96));
            collapseButtonBg.on('pointerdown', () => this.toggleDetailPane(false));
            collapseButtonText = this.scene.add.text(previewWidth - 28, headerHeight / 2, '收起', {
                fontFamily: 'Arial',
                fontSize: '9px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            }).setOrigin(0.5);
        }
        const [kindBadgeBg, kindBadgeText] = createBadge(
            18,
            heroTop + 12,
            detail.kindLabel,
            previewTheme.badgeFillColor,
            previewTheme.badgeTextColor,
        );
        const [rarityBadgeBg, rarityBadgeText] = createBadge(
            previewWidth - 18,
            heroTop + 12,
            detail.rarityLabel,
            detail.rarityColor,
            '#f8fafc',
            'right',
        );

        const heroName = this.scene.add.text(18, heroTop + 22, detail.displayName, {
            fontFamily: 'Arial',
            fontSize: previewHeight >= 184 ? '18px' : compactPreview ? '15px' : '16px',
            color: '#f8fafc',
            fontStyle: 'bold',
            wordWrap: { width: innerWidth - 68 },
        });
        const heroSupport = this.scene.add.text(18, heroTop + heroHeight - 24, supportLine, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#cbd5e1',
            fontStyle: 'bold',
            wordWrap: { width: innerWidth - 74 },
        }).setOrigin(0, 1).setVisible(showHeroSupport);

        const heroGlyph = this.scene.add.text(previewWidth - 38, heroTop + heroHeight / 2 + 1, detail.kindGlyph, {
            fontFamily: 'Arial',
            fontSize: previewHeight >= 184 ? '52px' : compactPreview ? '44px' : '48px',
            color: '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5).setAlpha(0.2);

        const statusRibbon = this.scene.add.rectangle(
            previewWidth / 2,
            heroTop + heroHeight - 8,
            innerWidth - 16,
            16,
            blendColor(previewTheme.heroFillColor, detail.accentColor, 0.45),
            0.68,
        );
        statusRibbon.setStrokeStyle(1, detail.accentColor, 0.55);
        const statusText = this.scene.add.text(previewWidth / 2, heroTop + heroHeight - 8, truncateLabel(detail.statusLabel, 18), {
            fontFamily: 'Arial',
            fontSize: '10px',
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
            const metricLabel = this.scene.add.text(metricLeft + metricWidth / 2, metricsTop + 7, metric.label, {
                fontFamily: 'Arial',
                fontSize: '8px',
                color: metric.labelColor,
                fontStyle: 'bold',
            }).setOrigin(0.5, 0);
            const metricValue = this.scene.add.text(metricLeft + metricWidth / 2, metricsTop + metricHeight - 6, metric.value, {
                fontFamily: 'Arial',
                fontSize: previewHeight >= 184 ? '14px' : '13px',
                color: metric.valueColor,
                fontStyle: 'bold',
            }).setOrigin(0.5, 1);
            metricBoxes.push(metricBg, metricLabel, metricValue);
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
            fontFamily: 'Arial',
            fontSize: '9px',
            color: '#cbd5e1',
            fontStyle: 'bold',
        });
        const copyBody = this.scene.add.text(contentLeft + 12, copyTop + 22, primaryCopy, {
            fontFamily: 'Arial',
            fontSize: '11px',
            color: detail.bodyColor,
            lineSpacing: 2,
            wordWrap: { width: innerWidth - 22 },
        });

        const secondaryTitle = this.scene.add.text(contentLeft + 12, copyTop + copyPanelHeight - 26, detail.secondaryCopyTitle ?? '', {
            fontFamily: 'Arial',
            fontSize: '8px',
            color: '#93c5fd',
            fontStyle: 'bold',
        }).setVisible(Boolean(secondaryCopy));
        const secondaryText = this.scene.add.text(contentLeft + 54, copyTop + copyPanelHeight - 26, secondaryCopy ?? '', {
            fontFamily: 'Arial',
            fontSize: '8px',
            color: '#bfdbfe',
            wordWrap: { width: innerWidth - 66 },
        });
        secondaryText.setVisible(Boolean(secondaryCopy));

        const footerSeparator = this.scene.add.rectangle(
            previewWidth / 2,
            footerTop - 4,
            innerWidth,
            1,
            detail.accentColor,
            0.45,
        );
        const footerText = this.scene.add.text(contentLeft, footerTop, footerCopy, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#94a3b8',
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
            secondaryTitle,
            secondaryText,
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
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.focusEditorIndex(this.getFocusedEditorIndex(deck) - 1);
                } else if (event.key === 'ArrowDown') {
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
                    fontFamily: 'Arial',
                    fontSize: 14,
                    color: '#f8fafc',
                    placeholderColor: '#64748b',
                    lineHeight: 20,
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
                this.queryText.setColor(hasQuery ? '#f8fafc' : '#64748b');
            }
            this.queryBg.setFillStyle(0x172554, 1);
            this.queryBg.setStrokeStyle(2, PANEL_ACCENT, 0.95);
        } else {
            this.queryText.setText(this.filterQuery || '搜索卡牌、编号或名称');
            this.queryText.setColor(hasQuery ? '#e2e8f0' : '#64748b');
            this.queryBg.setFillStyle(hasQuery ? 0x112338 : 0x0f172a, 1);
            this.queryBg.setStrokeStyle(1, hasQuery ? SELECTED_ACCENT : SECTION_BORDER, hasQuery ? 0.95 : 0.9);
        }

        if (this.queryClearBtn) {
            this.queryClearBtn.setVisible(this.filterQuery.length > 0);
            this.queryClearBtn.setColor(this.searchFocus ? '#e2e8f0' : '#94a3b8');
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
        const nextIndex = Phaser.Math.Clamp(currentIndex + delta, 0, decks.length - 1);
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

        let detailColor = '#bbf7d0';

        if (resultCount === 0 && (hasModifiedControls || matchedCount > 0)) {
            detailColor = '#fcd34d';
        } else if (resultCount === 0) {
            detailColor = '#cbd5e1';
        } else if (hasModifiedControls) {
            detailColor = '#bfdbfe';
        }

        const selectedSlotsRemaining = Math.max(selectedCapacity?.slotsRemainingToMax ?? 0, 0);
        const selectedCount = selectedSummary?.count ?? 0;

        let summaryLine = selectedDeck
            ? `下一步：从下方加入 · 命中 ${resultCount} 条 · 空位 ${selectedSlotsRemaining} 张`
            : '先在左侧选定卡组，再回到下方加入';

        if (selectedDeck && selectedSlotsRemaining <= 0) {
            summaryLine = `当前卡组已满 · 先在中间移除，再回来加入 · 当前卡组 ${selectedCount} 张`;
        } else if (selectedDeck && resultCount === 0 && hiddenZeroCount > 0 && this.filterHideZero) {
            summaryLine = `命中 ${matchedCount} 条但都被零库存隐藏 · 可切换显示或恢复默认`;
        } else if (selectedDeck && resultCount === 0) {
            summaryLine = hasModifiedControls
                ? '当前条件下没有可加入条目 · 可恢复默认后继续补牌'
                : `当前没有可加入条目 · 当前卡组 ${selectedCount} 张`;
        } else if (selectedDeck) {
            summaryLine = joinPreviewFacts(
                [
                    summaryLine,
                    `当前卡组 ${selectedCount} 张`,
                    selectedSummary?.statusLabel,
                    this.filterHideZero && hiddenZeroCount > 0 ? `零张隐藏 ${hiddenZeroCount}` : null,
                ],
                72,
            ) ?? summaryLine;
        } else if (hasModifiedControls) {
            summaryLine = joinPreviewFacts(
                [
                    summaryLine,
                    `命中 ${resultCount} / ${matchedCount || totalCount} 条`,
                    this.filterHideZero && hiddenZeroCount > 0 ? `零张隐藏 ${hiddenZeroCount}` : null,
                ],
                72,
            ) ?? summaryLine;
        }

        const headlineText = this.scene.add.text(2, this.browserSummaryArea.h / 2, truncateLabel(summaryLine, hasModifiedControls ? 36 : 44), {
            fontFamily: 'Arial',
            fontSize: '9px',
            color: detailColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.browserSummaryContainer.add(headlineText);

        if (hasModifiedControls) {
            const resetButton = this.createButton(
                this.browserSummaryArea.w - 34,
                this.browserSummaryArea.h / 2,
                64,
                18,
                '恢复默认',
                0x4338ca,
                () => {
                    this.setKeyboardZone('browser');
                    this.resetBrowserControls();
                    this.syncKeyboardZoneSelection();
                },
                false,
                {
                    hoverFillColor: 0x5b4ce1,
                    strokeColor: 0xc4b5fd,
                    fontSize: '10px',
                },
            );
            this.browserSummaryContainer.add(resetButton);
        } else {
            const defaultPill = this.createRightAlignedPill(
                this.browserSummaryArea.w - 12,
                this.browserSummaryArea.h / 2,
                '默认浏览',
                0x1e293b,
                '#cbd5e1',
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
        const panelWidth = Math.min(1120, width * 0.9);
        const panelHeight = Math.min(760, height * 0.86);
        const panelX = width / 2;
        const panelY = height / 2 + 18;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.82);
        overlay.setInteractive();

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, PANEL_FILL, 0.98);
        panel.setStrokeStyle(3, PANEL_ACCENT, 0.9);

        const titleX = panelX - panelWidth / 2 + 34;
        const titleTop = panelY - panelHeight / 2 + 24;

        const title = this.scene.add.text(titleX, titleTop, '卡组管理', {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(titleX, titleTop + 34, '先切换卡组，再从右侧加入或在中间移除；左侧集中当前卡组，右侧集中储物袋浏览。', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#cbd5e1',
            wordWrap: { width: panelWidth - 120 },
        });

        const closeButton = this.createButton(
            panelX + panelWidth / 2 - 68,
            titleTop + 14,
            92,
            32,
            '返回',
            0x334155,
            () => {
                this.setKeyboardZone('return');
                this.config.onClose();
            },
            false,
            { hoverFillColor: 0x475569, strokeColor: 0x94a3b8, fontSize: '14px' },
        );
        const routeBriefingElements: Phaser.GameObjects.GameObject[] = [];
        const keyboardGuideTop = subtitle.y + subtitle.height + 8;
        const keyboardGuideWidth = panelWidth - 68;
        const hasRouteBriefing = Boolean(this.config.routeBriefing);
        const keyboardGuideHeight = hasRouteBriefing ? 40 : 28;
        this.keyboardGuideBg = this.scene.add.rectangle(
            panelX,
            keyboardGuideTop + keyboardGuideHeight / 2,
            keyboardGuideWidth,
            keyboardGuideHeight,
            0x102344,
            0.98,
        );
        this.keyboardGuideBg.setStrokeStyle(1, SELECTED_ACCENT, 0.92);
        this.keyboardGuideAccent = this.scene.add.rectangle(
            titleX + 5,
            keyboardGuideTop + keyboardGuideHeight / 2,
            6,
            keyboardGuideHeight - 10,
            SELECTED_ACCENT,
            0.95,
        ).setOrigin(0, 0.5);
        if (this.config.routeBriefing) {
            const routeDetail = truncateLabel(
                `路线：${buildDeckManagerRouteBannerDetail(this.config.routeBriefing)}`,
                86,
            );
            const routeLabel = this.scene.add.text(titleX + 18, keyboardGuideTop + 5, routeDetail, {
                fontFamily: 'Arial',
                fontSize: '10px',
                color: '#dbeafe',
                fontStyle: 'bold',
            });
            routeBriefingElements.push(routeLabel);
        }

        const keyboardGuideY = hasRouteBriefing
            ? keyboardGuideTop + keyboardGuideHeight - 11
            : keyboardGuideTop + keyboardGuideHeight / 2;
        this.keyboardGuideHeadline = this.scene.add.text(titleX + 18, keyboardGuideY, '', {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#dbeafe',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.keyboardGuideDetail = this.scene.add.text(titleX + 144, keyboardGuideY, '', {
            fontFamily: 'Arial',
            fontSize: '9px',
            color: '#bfdbfe',
        }).setOrigin(0, 0.5);
        const [keyboardGuidePillBg, keyboardGuidePillText] = this.createRightAlignedPill(
            titleX + keyboardGuideWidth - 12,
            keyboardGuideY,
            'Tab 切换区域 · Esc 返回',
            0x0f172a,
            '#cbd5e1',
        );
        this.keyboardGuidePillBg = keyboardGuidePillBg;
        this.keyboardGuidePillText = keyboardGuidePillText;

        const contentY = keyboardGuideTop + keyboardGuideHeight + 14;
        const contentH = panelY + panelHeight / 2 - 28 - contentY;

        const columnGap = 18;
        const leftColX = panelX - panelWidth / 2 + 26;
        const contentWidth = panelWidth - 88;
        const rightColW = Math.max(320, Math.min(372, Math.floor(contentWidth * 0.36)));
        const leftWorkspaceW = contentWidth - rightColW - columnGap;
        const rightColX = leftColX + leftWorkspaceW + columnGap;
        const leftWorkspaceInnerX = leftColX + 12;
        const leftWorkspaceInnerY = contentY + 52;
        const leftWorkspaceInnerW = leftWorkspaceW - 24;
        const leftWorkspaceInnerH = contentH - 64;
        const deckTrayW = Math.max(218, Math.min(236, Math.floor(leftWorkspaceInnerW * 0.31)));
        const leftWorkspaceInnerGap = 14;
        const editorW = leftWorkspaceInnerW - deckTrayW - leftWorkspaceInnerGap;
        const editorX = leftWorkspaceInnerX + deckTrayW + leftWorkspaceInnerGap;
        const workspaceDivider = this.scene.add.rectangle(
            leftWorkspaceInnerX + deckTrayW + leftWorkspaceInnerGap / 2,
            leftWorkspaceInnerY + leftWorkspaceInnerH / 2,
            1,
            leftWorkspaceInnerH - 10,
            SECTION_BORDER,
            0.55,
        );
        const workspaceDividerGlow = this.scene.add.rectangle(
            leftWorkspaceInnerX + deckTrayW + leftWorkspaceInnerGap / 2,
            leftWorkspaceInnerY + leftWorkspaceInnerH / 2,
            3,
            leftWorkspaceInnerH - 42,
            PANEL_ACCENT,
            0.1,
        );

        this.add([
            overlay,
            panel,
            title,
            subtitle,
            ...closeButton,
            this.keyboardGuideBg,
            this.keyboardGuideAccent,
            ...routeBriefingElements,
            this.keyboardGuideHeadline,
            this.keyboardGuideDetail,
            this.keyboardGuidePillBg,
            this.keyboardGuidePillText,
        ]);

        this.add(this.createSectionFrame(
            leftColX,
            contentY,
            leftWorkspaceW,
            contentH,
            '当前卡组编辑',
            '左侧集中当前带入、切换与移除；右侧储物袋负责补牌，不再拆成并列三栏。',
            PANEL_ACCENT,
        ));
        this.add([workspaceDividerGlow, workspaceDivider]);
        this.createDeckListColumn(leftWorkspaceInnerX, leftWorkspaceInnerY, deckTrayW, leftWorkspaceInnerH, { embedded: true });
        this.createEditorColumn(editorX, leftWorkspaceInnerY, editorW, leftWorkspaceInnerH, { embedded: true });
        this.createBrowserColumn(rightColX, contentY, rightColW, contentH);

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
        const disabledFillColor = options.disabledFillColor ?? 0x334155;
        const disabledStrokeColor = options.disabledStrokeColor ?? 0x475569;
        const textColor = options.textColor ?? '#f8fafc';
        const disabledTextColor = options.disabledTextColor ?? '#94a3b8';

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
            fontFamily: 'Arial',
            fontSize: options.fontSize ?? '15px',
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
        text.setColor(config.textColor ?? '#f8fafc');
    }

    private createPill(
        x: number,
        y: number,
        label: string,
        fillColor: number,
        textColor = '#f8fafc',
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const text = this.scene.add.text(x + 10, y, label, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: textColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);

        const width = Math.max(56, text.width + 20);
        const bg = this.scene.add.rectangle(x + width / 2, y, width, 22, fillColor, 1);
        bg.setStrokeStyle(1, 0xffffff, 0.08);
        return [bg, text];
    }

    private createRightAlignedPill(
        rightX: number,
        y: number,
        label: string,
        fillColor: number,
        textColor = '#f8fafc',
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const [bg, text] = this.createPill(0, y, label, fillColor, textColor);
        const width = bg.width;
        bg.setX(rightX - width / 2);
        text.setX(rightX - width + 10);
        return [bg, text];
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
        const background = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, SECTION_FILL, 0.96);
        background.setStrokeStyle(1, SECTION_BORDER, 0.9);

        const accent = this.scene.add.rectangle(x + 16, y + 20, 6, 22, accentColor, 1);
        const titleText = this.scene.add.text(x + 30, y + 10, title, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const subtitleText = this.scene.add.text(x + 30, y + 33, subtitle, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
            wordWrap: { width: w - 48 },
        });

        return [background, accent, titleText, subtitleText];
    }

    private createEmbeddedSectionSurface(
        x: number,
        y: number,
        w: number,
        h: number,
        title: string,
        subtitle: string,
        accentColor: number,
    ): Phaser.GameObjects.GameObject[] {
        const background = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0b1324, 0.76);
        background.setStrokeStyle(1, blendColor(SECTION_BORDER, accentColor, 0.22), 0.58);

        const accent = this.scene.add.rectangle(x + 12, y + 16, 5, 18, accentColor, 0.95).setOrigin(0, 0);
        const titleText = this.scene.add.text(x + 24, y + 8, title, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const subtitleText = this.scene.add.text(x + 24, y + 27, subtitle, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#94a3b8',
            wordWrap: { width: w - 42 },
        });
        const divider = this.scene.add.rectangle(x + w / 2, y + 46, w - 20, 1, accentColor, 0.18);

        return [background, accent, titleText, subtitleText, divider];
    }

    private createDeckListColumn(
        x: number,
        y: number,
        colW: number,
        colH: number,
        options: {
            embedded?: boolean;
        } = {},
    ): void {
        const embedded = options.embedded ?? false;
        if (embedded) {
            this.add(this.createEmbeddedSectionSurface(
                x,
                y,
                colW,
                colH,
                '卡组序列',
                '先在这里选定要编辑的卡组。↑↓ 切换 · N 新建 · R 重命名。',
                SELECTED_ACCENT,
            ));
        } else {
            this.add(this.createSectionFrame(x, y, colW, colH, '切换卡组', '先在这里选定要编辑的卡组。↑↓ 切换 · N 新建 · R 重命名。', SELECTED_ACCENT));
        }

        const inset = embedded ? 12 : 16;
        const innerX = x + inset;
        const innerW = colW - inset * 2;
        const summaryY = y + (embedded ? 54 : 62);
        const newDeckY = summaryY + DECK_LIST_SUMMARY_HEIGHT + 10;
        const deleteY = y + colH - (embedded ? 18 : 28);
        const scrollBtnY = deleteY - (embedded ? 36 : 42);
        const listTop = newDeckY + (embedded ? 28 : 32);
        const listBottom = scrollBtnY - (embedded ? 14 : 18);
        const listH = Math.max(embedded ? 96 : 120, listBottom - listTop);

        this.deckListArea = { x: innerX, y: listTop, w: innerW, h: listH };
        this.deckListVisibleRows = Math.max(1, Math.floor(listH / DECK_ROW_HEIGHT));

        this.deckListSummaryContainer = this.scene.add.container(innerX, summaryY);
        this.add(this.deckListSummaryContainer);

        const newDeckButton = this.createButton(
            innerX + innerW / 2,
            newDeckY,
            innerW,
            embedded ? 30 : 34,
            '＋ 新建卡组',
            0x2563eb,
            () => this.createDeck(),
            false,
            {
                hoverFillColor: 0x3b82f6,
                strokeColor: 0x93c5fd,
                fontSize: embedded ? '14px' : '15px',
            },
        );
        this.add(newDeckButton);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(innerX, listTop, innerW, listH);

        this.deckListOuter = this.scene.add.container(innerX, listTop);
        this.deckListOuter.setMask(maskGraphics.createGeometryMask());
        this.deckListInner = this.scene.add.container(0, 0);
        this.deckListOuter.add(this.deckListInner);
        this.add([maskGraphics, this.deckListOuter]);

        const scrollUpButton = this.createButton(
            innerX + innerW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.deckListScrollOffset = Math.max(0, this.deckListScrollOffset - 1);
                this.refreshDeckList();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            innerX + innerW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.deckListScrollOffset += 1;
                this.refreshDeckList();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.add([...scrollUpButton, ...scrollDownButton]);

        this.deckListPosText = this.scene.add.text(innerX, scrollBtnY, '', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(0, 0.5);
        this.add(this.deckListPosText);

        const [deleteButton, deleteLabel] = this.createButton(
            innerX + innerW / 2,
            deleteY,
            innerW,
            embedded ? 30 : 34,
            '删除当前卡组',
            0xb91c1c,
            () => this.showDeleteConfirmation(),
            false,
            {
                hoverFillColor: 0xdc2626,
                strokeColor: 0xfca5a5,
                fontSize: embedded ? '14px' : '15px',
            },
        );
        this.deleteDeckBtn = deleteButton;
        this.deleteDeckLabel = deleteLabel;
        this.add([deleteButton, deleteLabel]);

        this.refreshDeckList();
    }

    private refreshDeckList(): void {
        if (!this.deckListInner) return;
        this.deckListInner.removeAll(true);

        const decks = this.stash.savedDecks;
        const maxOffset = Math.max(0, decks.length - this.deckListVisibleRows);
        this.deckListScrollOffset = Phaser.Math.Clamp(this.deckListScrollOffset, 0, maxOffset);

        const selectedDeck = this.getSelectedDeck();
        const selectedDeckSummary = selectedDeck ? summarizeDeckStatus(selectedDeck, this.stash.cards) : null;
        if (this.deckListSummaryContainer) {
            this.deckListSummaryContainer.removeAll(true);

            const rosterHealth = summarizeDeckRosterHealth(decks, this.stash.cards);
            const currentDeckAccentColor = selectedDeckSummary
                ? blendColor(SELECTED_ACCENT, selectedDeckSummary.accentColor, selectedDeckSummary.isValid ? 0.18 : 0.55)
                : SECTION_BORDER;
            const summaryBg = this.scene.add.rectangle(
                this.deckListArea.w / 2,
                DECK_LIST_SUMMARY_HEIGHT / 2,
                this.deckListArea.w,
                DECK_LIST_SUMMARY_HEIGHT,
                selectedDeck ? 0x102344 : 0x0f172a,
                0.99,
            );
            summaryBg.setStrokeStyle(1, selectedDeck ? currentDeckAccentColor : SECTION_BORDER, 0.95);
            const summaryAccent = this.scene.add.rectangle(
                5,
                DECK_LIST_SUMMARY_HEIGHT / 2,
                6,
                DECK_LIST_SUMMARY_HEIGHT - 18,
                selectedDeck ? currentDeckAccentColor : SECTION_BORDER,
                1,
            ).setOrigin(0, 0.5);

            if (selectedDeck && selectedDeckSummary) {
                const selectedSummary = selectedDeckSummary;
                const selectedSnapshot = buildDeckRosterSnapshot(selectedDeck, selectedSummary, this.config.metadata);
                const [statusPillBg, statusPillText] = this.createRightAlignedPill(
                    this.deckListArea.w - 12,
                    16,
                    selectedSummary.statusLabel,
                    selectedSummary.pillFillColor,
                    selectedSummary.pillTextColor,
                );
                const eyebrow = this.scene.add.text(16, 7, '当前带入卡组', {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: '#93c5fd',
                    fontStyle: 'bold',
                });
                const deckName = this.scene.add.text(16, 21, truncateLabel(selectedDeck.name, 18), {
                    fontFamily: 'Arial',
                    fontSize: '17px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });
                const meta = this.scene.add.text(16, 40, `${selectedSummary.count} 张 · ${truncateLabel(selectedSnapshot.pressureLabel, 14)}`, {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: '#dbeafe',
                    wordWrap: { width: this.deckListArea.w - 28 },
                });
                const rosterLine = this.scene.add.text(
                    16,
                    53,
                    truncateLabel(formatDeckRosterHealthLabel(rosterHealth, decks.length), 34),
                    {
                        fontFamily: 'Arial',
                        fontSize: '9px',
                        color: selectedSummary.isValid ? '#cbd5e1' : selectedSummary.pillTextColor,
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
                const eyebrow = this.scene.add.text(16, 7, '当前带入卡组', {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: '#93c5fd',
                    fontStyle: 'bold',
                });
                const deckName = this.scene.add.text(16, 21, '尚未选择卡组', {
                    fontFamily: 'Arial',
                    fontSize: '17px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });
                const meta = this.scene.add.text(16, 40, '新建或从下方列表切换一套卡组。', {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: '#cbd5e1',
                    wordWrap: { width: this.deckListArea.w - 28 },
                });
                const rosterLine = this.scene.add.text(16, 53, truncateLabel(formatDeckRosterHealthLabel(rosterHealth, decks.length), 34), {
                    fontFamily: 'Arial',
                    fontSize: '9px',
                    color: '#94a3b8',
                    wordWrap: { width: this.deckListArea.w - 28 },
                });

                this.deckListSummaryContainer.add([summaryBg, summaryAccent, eyebrow, deckName, meta, rosterLine]);
            }
        }

        if (decks.length === 0) {
            const emptyCard = this.scene.add.rectangle(this.deckListArea.w / 2, 76, this.deckListArea.w, 116, 0x0f172a, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);

            const emptyTitle = this.scene.add.text(this.deckListArea.w / 2, 54, '还没有保存的卡组', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            const emptyBody = this.scene.add.text(this.deckListArea.w / 2, 84, '点击上方“新建卡组”开始整理本次远征配置。', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: this.deckListArea.w - 40 },
            }).setOrigin(0.5);

            this.deckListInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const start = this.deckListScrollOffset;
            const end = Math.min(start + this.deckListVisibleRows, decks.length);

            for (let index = start; index < end; index += 1) {
                const deck = decks[index];
                const rowY = (index - start) * DECK_ROW_HEIGHT;
                const isSelected = deck.id === this.selectedDeckId;
                const summary = summarizeDeckStatus(deck, this.stash.cards);
                const snapshot = buildDeckRosterSnapshot(deck, summary, this.config.metadata);
                const bgFill = isSelected ? 0x102750 : 0x0f172a;
                const hoverFill = isSelected ? 0x17346a : 0x172033;
                const selectionAccentColor = isSelected
                    ? blendColor(SELECTED_ACCENT, summary.accentColor, summary.isValid ? 0.18 : 0.55)
                    : summary.accentColor;
                const borderColor = isSelected ? selectionAccentColor : SECTION_BORDER;
                const secondaryColor = isSelected ? '#dbeafe' : '#cbd5e1';
                const detailColor = summary.isValid ? (isSelected ? '#bfdbfe' : '#93c5fd') : summary.pillTextColor;

                const bg = this.scene.add.rectangle(
                    this.deckListArea.w / 2,
                    rowY + DECK_ROW_HEIGHT / 2,
                    this.deckListArea.w,
                    DECK_ROW_HEIGHT - 8,
                    bgFill,
                    0.98,
                );
                bg.setStrokeStyle(isSelected ? 2 : 1, borderColor, isSelected ? 0.95 : 0.72);

                const accent = this.scene.add.rectangle(
                    5,
                    rowY + DECK_ROW_HEIGHT / 2,
                    6,
                    DECK_ROW_HEIGHT - 18,
                    selectionAccentColor,
                    1,
                )
                    .setOrigin(0, 0.5);

                const detailStrip = this.scene.add.rectangle(
                    this.deckListArea.w / 2,
                    rowY + DECK_ROW_HEIGHT - 18,
                    this.deckListArea.w - 18,
                    20,
                    blendColor(bgFill, summary.accentColor, isSelected ? 0.22 : 0.16),
                    0.98,
                );
                detailStrip.setStrokeStyle(1, summary.accentColor, 0.22);

                let currentLabel: GameObjects.Text | undefined;
                if (isSelected) {
                    currentLabel = this.scene.add.text(16, rowY + 8, '当前带入', {
                        fontFamily: 'Arial',
                        fontSize: '10px',
                        color: '#93c5fd',
                        fontStyle: 'bold',
                    });
                }

                const name = this.scene.add.text(16, rowY + (isSelected ? 22 : 16), truncateLabel(deck.name, 18), {
                    fontFamily: 'Arial',
                    fontSize: isSelected ? '17px' : '16px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });

                const meta = this.scene.add.text(16, rowY + (isSelected ? 42 : 38), snapshot.metaLabel, {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: secondaryColor,
                });

                const detail = this.scene.add.text(16, rowY + (isSelected ? 58 : 57), truncateLabel(snapshot.detailLabel, 32), {
                    fontFamily: 'Arial',
                    fontSize: '10px',
                    color: detailColor,
                    fontStyle: isSelected ? 'bold' : 'normal',
                });

                const [statusPillBg, statusPillText] = this.createRightAlignedPill(
                    this.deckListArea.w - 12,
                    rowY + 18,
                    summary.statusLabel,
                    summary.pillFillColor,
                    summary.pillTextColor,
                );

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
                    detailStrip,
                    ...(currentLabel ? [currentLabel] : []),
                    name,
                    meta,
                    detail,
                    statusPillBg,
                    statusPillText,
                ]);

                if (isSelected && this.pendingSelectedDeckMotionId === deck.id) {
                    this.playMotionPulse(
                        [bg, accent, detailStrip, currentLabel, name, meta, detail, statusPillBg, statusPillText],
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
            this.deckListPosText.setText(`显示 ${start}-${end} / ${total}`);
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
            this.deleteDeckLabel.setText('删除当前卡组');
            this.deleteDeckLabel.setColor('#f8fafc');
        } else {
            this.deleteDeckBtn.disableInteractive();
            this.deleteDeckBtn.setFillStyle(0x1f2937, 1);
            this.deleteDeckBtn.setStrokeStyle(1, 0x334155, 0.95);
            this.deleteDeckBtn.setAlpha(0.82);
            this.deleteDeckLabel.setText('至少保留 1 套卡组');
            this.deleteDeckLabel.setColor('#94a3b8');
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
        const targetSummaryH = namingActive ? 324 : 212;
        const summaryH = Math.min(targetSummaryH, Math.max(176, contentH - 132));
        const listHeaderY = summaryH + 10;
        const scrollBtnY = contentH - 12;
        const listTop = listHeaderY + 30;
        const listBottom = scrollBtnY - 12;
        const listH = Math.max(82, listBottom - listTop);

        this.editorArea = {
            x: this.editorContainer.x,
            y: this.editorContainer.y + listTop,
            w: summaryW,
            h: listH,
        };
        this.editorVisibleRows = Math.max(1, Math.floor(listH / EDITOR_ROW_HEIGHT));
        this.ensureDetailCardSelection();

        if (!deck) {
            this.lastEditorFeedback = undefined;
            const emptyCard = this.scene.add.rectangle(localX + summaryW / 2, 84, summaryW, 168, 0x0f172a, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(localX + summaryW / 2, 62, '先选择一个卡组', {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#f8fafc',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(localX + summaryW / 2, 102, '左侧可以选择已有卡组，或新建一套用于本次远征的配置。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: summaryW - 40 },
            }).setOrigin(0.5);
            this.editorContainer.add([emptyCard, emptyTitle, emptyBody]);
            return;
        }

        const summary = this.getSelectedDeckStatus() ?? summarizeDeckStatus(deck, this.stash.cards);
        const capacity = summarizeDeckCapacity(deck.cards);
        const capacityAccentColor = getDeckCapacityAccentColor(capacity);
        const capacityTextColor = getDeckCapacityTextColor(capacity);
        const readinessTier = getDeckReadinessTier(summary);
        const previousFeedback = this.lastEditorFeedback;
        const deckSelectionChanged = this.pendingSelectedDeckMotionId === deck.id;
        const countChanged = previousFeedback?.deckId === deck.id && previousFeedback.count !== summary.count;
        const readinessChanged = previousFeedback?.deckId === deck.id && previousFeedback.readinessTier !== readinessTier;
        const summaryCard = this.scene.add.rectangle(localX + summaryW / 2, summaryH / 2, summaryW, summaryH, 0x0f172a, 0.98);
        summaryCard.setStrokeStyle(1, summary.accentColor, 0.9);
        this.editorContainer.add(summaryCard);

        const eyebrow = this.scene.add.text(localX + 16, 16, namingActive
            ? (this.namingMode === 'create' ? '新卡组命名' : '重命名流程')
            : '当前卡组', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        this.editorContainer.add(eyebrow);

        if (namingActive) {
            const namingTitle = this.scene.add.text(localX + 16, 38, this.namingMode === 'create' ? '给新卡组起个名字' : '修改卡组名称', {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#f8fafc',
                fontStyle: 'bold',
            });
            const namingBody = this.scene.add.text(
                localX + 16,
                66,
                this.namingMode === 'create'
                    ? '新卡组已经建好；现在确认一个玩家可见名称，之后随时还能再改。'
                    : '这里只会修改玩家可见名称，内部保存编号会继续保持稳定。',
                {
                    fontFamily: 'Arial',
                    fontSize: '12px',
                    color: '#cbd5e1',
                    wordWrap: { width: summaryW - 32 },
                },
            );
            const renameHint = this.scene.add.text(localX + summaryW - 16, 18, '键盘输入 · Enter 确认 · Esc 取消 · 支持输入法 / 粘贴', {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: '#fde68a',
            }).setOrigin(1, 0);
            const inputWidth = Math.max(168, summaryW - 272);
            const inputBg = this.scene.add.rectangle(localX + 16 + inputWidth / 2, 104, inputWidth, 38, 0x111827, 1);
            inputBg.setStrokeStyle(1, PANEL_ACCENT, 0.95);
            const inputText = this.scene.add.text(localX + 18, 104, '', {
                fontFamily: 'Courier New',
                fontSize: '18px',
                color: '#f8fafc',
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            this.namingInputBg = inputBg;
            this.namingInputText = inputText;
            this.updateNamingTextDisplay();
            const namingWarning = this.scene.add.text(
                localX + 16,
                126,
                this.renameBuffer.trim().length > 0
                    ? (this.namingMode === 'create' ? '确认后会保留这套新卡组，并继续在左侧列表中选中它。' : '确认后会立刻更新左侧列表和远征带入名称。')
                    : '请输入至少 1 个字符，或按 Esc 退出本次命名。',
                {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: this.renameBuffer.trim().length > 0 ? '#93c5fd' : '#fca5a5',
                    wordWrap: { width: summaryW - 32 },
                },
            );
            const confirmButton = this.createButton(
                localX + summaryW - 176,
                104,
                120,
                34,
                this.namingMode === 'create' ? '确认名称' : '确认重命名',
                0x2563eb,
                () => this.confirmRename(),
                this.renameBuffer.trim().length === 0,
                {
                    hoverFillColor: 0x3b82f6,
                    strokeColor: 0x93c5fd,
                    fontSize: '14px',
                },
            );
            const cancelButton = this.createButton(
                localX + summaryW - 60,
                104,
                104,
                34,
                this.namingMode === 'create' ? '保留默认名' : '取消',
                0x334155,
                () => this.cancelRename(),
                false,
                {
                    hoverFillColor: 0x475569,
                    strokeColor: 0x94a3b8,
                    fontSize: '14px',
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
            const nameText = this.scene.add.text(localX + 16, 38, deck.name, {
                fontFamily: 'Arial',
                fontSize: '25px',
                color: '#f8fafc',
                fontStyle: 'bold',
                wordWrap: { width: summaryW - 128 },
            });
            const renameButton = this.createButton(
                localX + summaryW - 54,
                34,
                88,
                28,
                '重命名',
                0x312e81,
                () => this.beginRenameSelectedDeck(),
                false,
                {
                    hoverFillColor: 0x4338ca,
                    strokeColor: 0xa5b4fc,
                    fontSize: '13px',
                },
            );
            nameText.setInteractive({ useHandCursor: true });
            nameText.on('pointerdown', () => {
                this.setKeyboardZone('decks');
                this.beginRenameSelectedDeck();
            });
            this.editorContainer.add([nameText, ...renameButton]);
        }

        const detailY = namingActive ? 136 : 64;
        const detailExpanded = !namingActive && this.detailPaneExpanded;
        const detailSurfaceWidth = namingActive ? 0 : detailExpanded ? 160 : 0;
        const detailPaneX = detailSurfaceWidth > 0
            ? localX + summaryW - detailSurfaceWidth - 16
            : localX + summaryW;
        const detailPaneY = 44;
        const leftSummaryW = detailSurfaceWidth > 0
            ? detailPaneX - (localX + 24)
            : summaryW - 32;
        const detailSurfacePulseTargets: (TweenableMotionTarget | null | undefined)[] = [];
        const countText = this.scene.add.text(localX + 16, detailY, `${summary.count} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: summary.isValid ? '#86efac' : summary.pillTextColor,
            fontStyle: 'bold',
            wordWrap: { width: leftSummaryW },
        });
        const [statusPillBg, statusPillText] = this.createPill(
            localX + 16,
            detailY + 30,
            summary.statusLabel,
            summary.pillFillColor,
            summary.pillTextColor,
        );
        const detailText = this.scene.add.text(localX + 16, detailY + 50, summary.detailLabel, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: summary.isValid ? '#93c5fd' : summary.pillTextColor,
            wordWrap: { width: leftSummaryW },
        });
        this.editorContainer.add([countText, statusPillBg, statusPillText, detailText]);

        const capacitySummaryText = this.scene.add.text(localX + 16, detailY + 68, joinPreviewFacts([
            getDeckCapacityProgressLabel(capacity),
            getDeckCapacityHeadroomLabel(capacity),
        ], detailExpanded ? 50 : 72) ?? getDeckCapacityProgressLabel(capacity), {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: capacityTextColor,
            fontStyle: 'bold',
            wordWrap: { width: leftSummaryW },
        });
        this.editorContainer.add(capacitySummaryText);

        const capacityTrackX = localX + 16;
        const capacityTrackY = detailY + 88;
        const capacityTrackW = leftSummaryW;
        const capacityTrackH = 12;
        const capacityFillWidth = capacityTrackW * Phaser.Math.Clamp(capacity.count / DECK_CARD_MAX, 0, 1);
        const previousCapacityFillWidth = previousFeedback?.deckId === deck.id
            ? capacityTrackW * Phaser.Math.Clamp(previousFeedback.count / DECK_CARD_MAX, 0, 1)
            : 0;
        const capacityTrackBg = this.scene.add.rectangle(
            capacityTrackX + capacityTrackW / 2,
            capacityTrackY,
            capacityTrackW,
            capacityTrackH,
            0x172033,
            1,
        );
        capacityTrackBg.setStrokeStyle(1, SECTION_BORDER, 0.9);
        this.editorContainer.add(capacityTrackBg);

        let capacityFill: GameObjects.Rectangle | undefined;
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
        const capacityRangeLabel = this.scene.add.text(capacityTrackX, capacityTrackY + 12, `${DECK_CARD_MIN} 张出征线 · ${DECK_CARD_MAX} 张上限`, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#94a3b8',
            fontStyle: 'bold',
            wordWrap: { width: leftSummaryW },
        });
        this.editorContainer.add([capacityMinimumMarker, capacityRangeLabel]);

        const nextStepLabel = summary.availabilityIssues.length > 0
            ? '下一步：先补齐库存短缺，再返回远征准备。'
            : summary.sizeIssue?.kind === 'too-few-cards'
                ? '下一步：继续从右侧补牌，直到达到出征线。'
                : summary.sizeIssue?.kind === 'too-many-cards'
                    ? '下一步：先在这里移除多余卡牌，再返回远征准备。'
                    : '下一步：当前卡组已就绪，可直接返回远征准备确认带入。';
        const returnCta = createReturnCtaState(summary);
        const exitStripX = localX + 16;
        const exitStripY = summaryH - 38;
        const exitStripW = summaryW - 32;
        const exitStripH = 34;
        const exitStrip = this.scene.add.rectangle(
            exitStripX + exitStripW / 2,
            exitStripY + exitStripH / 2,
            exitStripW,
            exitStripH,
            returnCta.stripFillColor,
            0.98,
        );
        exitStrip.setStrokeStyle(this.keyboardZone === 'return' ? 2 : 1, summary.accentColor, 0.9);
        exitStrip.setInteractive({ useHandCursor: true });
        exitStrip.on('pointerover', () => exitStrip.setFillStyle(blendColor(returnCta.stripFillColor, returnCta.buttonFillColor, 0.18), 0.98));
        exitStrip.on('pointerout', () => exitStrip.setFillStyle(returnCta.stripFillColor, 0.98));
        exitStrip.on('pointerdown', () => {
            this.setKeyboardZone('return');
            this.config.onClose();
        });

        const exitHeader = this.scene.add.text(exitStripX + 14, exitStripY + 6, '返回前摘要', {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: returnCta.stripTextColor,
            fontStyle: 'bold',
        });
        const exitHint = this.scene.add.text(exitStripX + exitStripW - 14, exitStripY + 6, '摘要区可直接返回远征准备', {
            fontFamily: 'Arial',
            fontSize: '9px',
            color: this.keyboardZone === 'return' ? '#fef3c7' : returnCta.stripTextColor,
            fontStyle: 'bold',
        }).setOrigin(1, 0);

        const exitSummary = this.scene.add.text(exitStripX + 14, exitStripY + 22, truncateLabel(
            joinPreviewFacts([returnCta.summaryLabel, nextStepLabel], 74) ?? returnCta.summaryLabel,
            74,
        ), {
            fontFamily: 'Arial',
            fontSize: '9px',
            color: '#e2e8f0',
            wordWrap: { width: exitStripW - 152 },
        }).setOrigin(0, 0.5);

        const ctaButtonWidth = 128;
        const ctaButtonHeight = 28;
        const ctaButtonX = exitStripX + exitStripW - ctaButtonWidth / 2 - 8;
        const ctaButtonY = exitStripY + exitStripH / 2;
        const ctaButton = this.scene.add.rectangle(
            ctaButtonX,
            ctaButtonY,
            ctaButtonWidth,
            ctaButtonHeight,
            returnCta.buttonFillColor,
            1,
        );
        ctaButton.setStrokeStyle(this.keyboardZone === 'return' ? 2 : 1, returnCta.buttonStrokeColor, 0.95);
        ctaButton.setInteractive({ useHandCursor: true });
        ctaButton.on('pointerover', () => ctaButton.setFillStyle(returnCta.buttonHoverFillColor, 1));
        ctaButton.on('pointerout', () => ctaButton.setFillStyle(returnCta.buttonFillColor, 1));
        ctaButton.on('pointerdown', () => {
            this.setKeyboardZone('return');
            this.config.onClose();
        });

        const ctaLabel = this.scene.add.text(ctaButtonX, ctaButtonY, '返回远征准备', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: returnCta.buttonTextColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.editorContainer.add([exitStrip, exitHeader, exitHint, exitSummary, ctaButton, ctaLabel]);

        let inspectFocusButton: [GameObjects.Rectangle, GameObjects.Text] | null = null;
        if (!namingActive) {
            if (detailExpanded) {
                const detailPaneBottom = exitStripY - 10;
                const detailPaneH = Math.max(124, detailPaneBottom - detailPaneY);
                this.detailPaneContainer = this.scene.add.container(detailPaneX, detailPaneY);
                this.detailPaneWidth = detailSurfaceWidth;
                this.detailPaneHeight = detailPaneH;
                this.editorContainer.add(this.detailPaneContainer);
                this.refreshDetailPane(deckSelectionChanged);
                detailSurfacePulseTargets.push(this.detailPaneContainer);
            } else {
                inspectFocusButton = this.createButton(
                    summaryW - 58,
                    listHeaderY + 11,
                    116,
                    22,
                    '查看当前焦点',
                    0x312e81,
                    () => {
                        this.setKeyboardZone('editor');
                        this.toggleDetailPane(true);
                    },
                    false,
                    {
                        hoverFillColor: 0x4338ca,
                        strokeColor: 0xa5b4fc,
                        fontSize: '11px',
                    },
                );
            }
        }

        const cardListTitle = this.scene.add.text(localX, listHeaderY, `当前卡牌（在这里移除）· ${deck.cards.length} 个条目 / ${summary.count} 张`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const cardListSubtitle = this.scene.add.text(
            localX,
            listHeaderY + 17,
            detailExpanded
                ? '选中条目后可移除 1 张或清空整行；焦点牌面已展开，悬停或上下切换会同步更新。'
                : '选中条目后可移除 1 张或清空整行；焦点牌面默认收起详情，按 I 或点右侧查看当前焦点。',
            {
                fontFamily: 'Arial',
                fontSize: '11px',
                color: '#94a3b8',
                wordWrap: { width: detailExpanded ? summaryW : summaryW - 132 },
            },
        );
        this.editorContainer.add([
            cardListTitle,
            cardListSubtitle,
            ...(inspectFocusButton ? inspectFocusButton : []),
        ]);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(this.editorContainer.x, this.editorContainer.y + listTop, summaryW, listH);
        const cardsOuter = this.scene.add.container(localX, listTop);
        cardsOuter.setMask(maskGraphics.createGeometryMask());
        const cardsInner = this.scene.add.container(0, 0);
        cardsOuter.add(cardsInner);
        this.editorContainer.add([maskGraphics, cardsOuter]);

        const maxOffset = Math.max(0, deck.cards.length - this.editorVisibleRows);
        this.editorScrollOffset = Phaser.Math.Clamp(this.editorScrollOffset, 0, maxOffset);

        if (deck.cards.length === 0) {
            const emptyCard = this.scene.add.rectangle(summaryW / 2, 72, summaryW, 116, 0x111827, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(summaryW / 2, 52, '卡组还是空的', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(summaryW / 2, 82, '从右侧储物袋挑选卡牌加入这里，合法性会实时更新。', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: summaryW - 36 },
            }).setOrigin(0.5);
            cardsInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const start = this.editorScrollOffset;
            const end = Math.min(start + this.editorVisibleRows, deck.cards.length);

            for (let index = start; index < end; index += 1) {
                const stack = deck.cards[index];
                const rowY = (index - start) * EDITOR_ROW_HEIGHT;
                const displayName = getCardDisplayName(stack.id, this.config.metadata);
                const metaLabel = getCardMetaLabel(stack.id, this.config.metadata);
                const ownedCount = getStackCount(this.stash.cards, stack.id);
                const shortageCount = Math.max(stack.count - ownedCount, 0);
                const remainingCount = Math.max(ownedCount - stack.count, 0);
                const rowAccentColor = shortageCount > 0
                    ? INVALID_ACCENT
                    : remainingCount === 0
                        ? WARNING_ACCENT
                        : VALID_ACCENT;
                const rowBorderColor = shortageCount > 0
                    ? INVALID_ACCENT
                    : remainingCount === 0
                        ? WARNING_ACCENT
                        : SECTION_BORDER;
                const rowFillColor = shortageCount > 0
                    ? 0x201018
                    : remainingCount === 0
                        ? 0x1b1a12
                        : 0x111827;
                const detailColor = shortageCount > 0
                    ? '#fecaca'
                    : remainingCount === 0
                        ? '#fde68a'
                        : '#93c5fd';
                const availabilityLabel = shortageCount > 0
                    ? `袋中${ownedCount} · 缺${shortageCount}张`
                    : remainingCount === 0
                        ? `袋中${ownedCount} · 已占满库存`
                        : `袋中${ownedCount} · 可再加${remainingCount}张`;
                const stateLabel = shortageCount > 0
                    ? `缺 ${shortageCount} 张`
                    : remainingCount === 0
                        ? '已占满'
                        : `可再加 ${remainingCount}`;
                const stateFillColor = shortageCount > 0
                    ? 0x3f1d24
                    : remainingCount === 0
                        ? 0x3b2a0e
                        : 0x15372a;
                const stateTextColor = shortageCount > 0
                    ? '#fecaca'
                    : remainingCount === 0
                        ? '#fde68a'
                        : '#bbf7d0';
                const spotlightTheme = getPreviewTheme(this.config.metadata?.[stack.id]?.kind);
                const hoverFillColor = shortageCount > 0
                    ? 0x27141c
                    : remainingCount === 0
                        ? 0x252015
                        : 0x172033;
                const activeFillColor = blendColor(rowFillColor, spotlightTheme.headerFillColor, 0.52);

                const rowBg = this.scene.add.rectangle(summaryW / 2, rowY + EDITOR_ROW_HEIGHT / 2, summaryW, EDITOR_ROW_HEIGHT - 6, rowFillColor, 0.98);
                rowBg.setStrokeStyle(1, rowBorderColor, shortageCount > 0 ? 0.95 : 0.82);
                const spotlightRow: SpotlightRowHandle = {
                    cardId: stack.id,
                    bg: rowBg,
                    baseFillColor: rowFillColor,
                    hoverFillColor,
                    activeFillColor,
                    baseBorderColor: rowBorderColor,
                    activeBorderColor: spotlightTheme.borderColor,
                    baseBorderAlpha: shortageCount > 0 ? 0.95 : 0.82,
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
                const accent = this.scene.add.rectangle(5, rowY + EDITOR_ROW_HEIGHT / 2, 6, EDITOR_ROW_HEIGHT - 14, rowAccentColor, 1)
                    .setOrigin(0, 0.5);

                const nameText = this.scene.add.text(14, rowY + 14, displayName, {
                    fontFamily: 'Arial',
                    fontSize: '15px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });
                const metaText = this.scene.add.text(14, rowY + 40, `${metaLabel} · ${availabilityLabel}`, {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: detailColor,
                });

                const [countPillBg, countPillText] = this.createPill(summaryW - 196, rowY + 20, `卡组 ×${stack.count}`, 0x1d4ed8, '#dbeafe');
                const [statePillBg, statePillText] = this.createPill(summaryW - 196, rowY + 48, stateLabel, stateFillColor, stateTextColor);
                const removeButton = this.createButton(
                    summaryW - 50,
                    rowY + 22,
                    84,
                    22,
                    '移除 1',
                    0x7f1d1d,
                    () => {
                        this.setKeyboardZone('editor');
                        this.setDetailCardId(stack.id);
                        this.updateDeckCards(deck.id, adjustDeckCardCount(deck.cards, stack.id, -1));
                    },
                    false,
                    {
                        hoverFillColor: 0x991b1b,
                        strokeColor: 0xfca5a5,
                        fontSize: '11px',
                    },
                );
                const clearButton = this.createButton(
                    summaryW - 50,
                    rowY + 50,
                    84,
                    22,
                    '全部移除',
                    0x991b1b,
                    () => {
                        this.setKeyboardZone('editor');
                        this.setDetailCardId(stack.id);
                        this.updateDeckCards(deck.id, adjustDeckCardCount(deck.cards, stack.id, -stack.count));
                    },
                    false,
                    {
                        hoverFillColor: 0xb91c1c,
                        strokeColor: 0xfca5a5,
                        fontSize: '11px',
                    },
                );

                cardsInner.add([
                    rowBg,
                    accent,
                    nameText,
                    metaText,
                    countPillBg,
                    countPillText,
                    statePillBg,
                    statePillText,
                    ...removeButton,
                    ...clearButton,
                ]);
            }
        }

        const total = deck.cards.length;
        const start = total === 0 ? 0 : this.editorScrollOffset + 1;
        const end = total === 0 ? 0 : Math.min(this.editorScrollOffset + this.editorVisibleRows, total);
        const posText = this.scene.add.text(localX, scrollBtnY, `显示 ${start}-${end} / ${total}`, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(0, 0.5);

        const scrollUpButton = this.createButton(
            summaryW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.editorScrollOffset = Math.max(0, this.editorScrollOffset - 1);
                this.refreshEditor();
            },
            this.editorScrollOffset <= 0,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            summaryW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.editorScrollOffset += 1;
                this.refreshEditor();
            },
            this.editorScrollOffset >= maxOffset,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );

        this.editorContainer.add([posText, ...scrollUpButton, ...scrollDownButton]);

        if (capacityFill && (deckSelectionChanged || countChanged)) {
            const startingScaleX = deckSelectionChanged
                ? 0
                : capacityFillWidth > 0
                    ? Phaser.Math.Clamp(previousCapacityFillWidth / capacityFillWidth, 0, 1.35)
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
                        countText,
                        statusPillBg,
                        statusPillText,
                        detailText,
                        exitStrip,
                        exitHeader,
                        exitHint,
                        exitSummary,
                        ctaButton,
                        ctaLabel,
                        ...detailSurfacePulseTargets,
                        cardListTitle,
                        cardListSubtitle,
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
                        countText,
                        detailText,
                        capacitySummaryText,
                        exitSummary,
                        exitHint,
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
                        exitStrip,
                        exitHeader,
                        exitHint,
                        exitSummary,
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
        this.add(this.createSectionFrame(x, y, colW, colH, '从储物袋加入', '储物袋浏览：搜索、筛选、排序都集中在顶部，再从下方加入。/ 搜索 · Enter 加入 · F 一键加满。', VALID_ACCENT));

        const innerX = x + 16;
        const innerW = colW - 32;
        const railTop = y + 60;
        const railHeight = 88;
        const railLabelY = railTop + 6;
        const searchY = railTop + 28;
        const controlsY = railTop + 54;
        const summaryY = railTop + 68;
        const summaryHeight = 20;
        const deleteY = y + colH - 28;
        const scrollBtnY = deleteY - 42;
        const listTop = railTop + railHeight + 6;
        const listBottom = scrollBtnY - 18;
        const listH = Math.max(120, listBottom - listTop);

        this.browserArea = { x: innerX, y: listTop, w: innerW, h: listH };
        this.browserVisibleRows = Math.max(1, Math.floor(listH / BROWSER_ROW_HEIGHT));
        this.browserSummaryArea = { x: innerX, y: summaryY, w: innerW, h: summaryHeight };

        const railBg = this.scene.add.rectangle(innerX + innerW / 2, railTop + railHeight / 2, innerW, railHeight, 0x0f172a, 0.98);
        railBg.setStrokeStyle(1, SECTION_BORDER, 0.92);
        const railAccent = this.scene.add.rectangle(innerX + 5, railTop + railHeight / 2, 6, railHeight - 16, 0x4ade80, 0.9)
            .setOrigin(0, 0.5);
        const railLabel = this.scene.add.text(innerX + 16, railLabelY, '浏览控制', {
            fontFamily: 'Arial',
            fontSize: '11px',
            color: '#cbd5e1',
            fontStyle: 'bold',
        });
        this.browserStateText = this.scene.add.text(innerX + innerW - 12, railLabelY, '', {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#94a3b8',
            fontStyle: 'bold',
        }).setOrigin(1, 0);

        this.queryBg = this.scene.add.rectangle(innerX + innerW / 2, searchY, innerW, 26, 0x0f172a, 1);
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
            fontFamily: 'Arial',
            fontSize: '14px',
            color: this.filterQuery ? '#f8fafc' : '#64748b',
        }).setOrigin(0, 0.5);

        this.queryClearBtn = this.scene.add.text(innerX + innerW - 12, searchY, '清空', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
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
        const kindButtonWidth = 92;
        const hideZeroButtonWidth = 58;
        const sortFieldButtonWidth = 92;
        const sortDirButtonWidth = 56;
        const sortDirButtonX = innerX + innerW - sortDirButtonWidth / 2;
        const sortFieldButtonX = sortDirButtonX - sortDirButtonWidth / 2 - buttonGap - sortFieldButtonWidth / 2;
        const hideZeroButtonX = sortFieldButtonX - sortFieldButtonWidth / 2 - buttonGap - hideZeroButtonWidth / 2;
        const kindButtonX = hideZeroButtonX - hideZeroButtonWidth / 2 - buttonGap - kindButtonWidth / 2;

        const kindButton = this.createButton(
            kindButtonX,
            controlsY,
            kindButtonWidth,
            24,
            `类：${KIND_LABEL[String(this.filterKind)]}`,
            0x312e81,
            () => {
                this.setKeyboardZone('browser');
                this.cycleBrowserKindFilter();
            },
            false,
            {
                hoverFillColor: 0x4338ca,
                strokeColor: 0xa5b4fc,
                fontSize: '12px',
            },
        );
        this.kindBtn = kindButton[0];
        this.kindBtnText = kindButton[1];

        const hideZeroButton = this.createButton(
            hideZeroButtonX,
            controlsY,
            hideZeroButtonWidth,
            24,
            this.filterHideZero ? '零：隐' : '零：显',
            this.filterHideZero ? 0x1d4ed8 : 0x1f2937,
            () => {
                this.setKeyboardZone('browser');
                this.toggleBrowserHideZero();
            },
            false,
            {
                hoverFillColor: this.filterHideZero ? 0x2563eb : 0x334155,
                strokeColor: this.filterHideZero ? 0x93c5fd : 0x475569,
                fontSize: '12px',
            },
        );
        this.hideZeroBtn = hideZeroButton[0];
        this.hideZeroBtnText = hideZeroButton[1];

        const sortFieldButton = this.createButton(
            sortFieldButtonX,
            controlsY,
            sortFieldButtonWidth,
            24,
            `序：${getSortFieldLabel(this.sortField)}`,
            0x1f2937,
            () => {
                this.setKeyboardZone('browser');
                this.cycleBrowserSortField();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '12px' },
        );
        this.sortFieldBtn = sortFieldButton[0];
        this.sortFieldBtnText = sortFieldButton[1];

        const sortDirButton = this.createButton(
            sortDirButtonX,
            controlsY,
            sortDirButtonWidth,
            24,
            this.sortDirection === 'asc' ? '↑ 升' : '↓ 降',
            0x1f2937,
            () => {
                this.setKeyboardZone('browser');
                this.toggleBrowserSortDirection();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '12px' },
        );
        this.sortDirBtn = sortDirButton[0];
        this.sortDirBtnText = sortDirButton[1];

        this.browserSummaryContainer = this.scene.add.container(innerX, summaryY);

        this.add([
            railBg,
            railAccent,
            railLabel,
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

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(innerX, listTop, innerW, listH);

        this.browserOuter = this.scene.add.container(innerX, listTop);
        this.browserOuter.setMask(maskGraphics.createGeometryMask());
        this.browserInner = this.scene.add.container(0, 0);
        this.browserOuter.add(this.browserInner);
        this.add([maskGraphics, this.browserOuter]);

        const scrollUpButton = this.createButton(
            innerX + innerW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.browserScrollOffset = Math.max(0, this.browserScrollOffset - 1);
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            innerX + innerW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.browserScrollOffset += 1;
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.add([...scrollUpButton, ...scrollDownButton]);

        this.browserPosText = this.scene.add.text(innerX, scrollBtnY, '', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
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
            this.browserStateText.setColor(this.hasModifiedBrowserControls() ? '#bfdbfe' : '#94a3b8');
        }

        if (this.kindBtnText) {
            this.kindBtnText.setText(`类：${KIND_LABEL[String(this.filterKind)]}`);
        }

        this.setButtonVisualState(this.kindBtn, this.kindBtnText, {
            fillColor: this.filterKind === undefined ? 0x241f49 : 0x4338ca,
            hoverFillColor: this.filterKind === undefined ? 0x312e81 : 0x5b4ce1,
            strokeColor: this.filterKind === undefined ? 0x6d5bd0 : 0xc4b5fd,
        }
        );

        if (this.hideZeroBtnText) {
            this.hideZeroBtnText.setText(this.filterHideZero ? '零：隐' : '零：显');
        }
        this.setButtonVisualState(this.hideZeroBtn, this.hideZeroBtnText, {
            fillColor: this.filterHideZero ? 0x1d4ed8 : 0x1f2937,
            hoverFillColor: this.filterHideZero ? 0x2563eb : 0x334155,
            strokeColor: this.filterHideZero ? 0x93c5fd : 0x475569,
        });

        if (this.sortFieldBtnText) {
            this.sortFieldBtnText.setText(`序：${getSortFieldLabel(this.sortField)}`);
        }
        this.setButtonVisualState(this.sortFieldBtn, this.sortFieldBtnText, {
            fillColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? 0x1f2937 : 0x134e4a,
            hoverFillColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? 0x334155 : 0x0f766e,
            strokeColor: this.sortField === DEFAULT_BROWSER_SORT_FIELD ? 0x475569 : 0x5eead4,
        });

        if (this.sortDirBtnText) {
            this.sortDirBtnText.setText(this.sortDirection === 'asc' ? '↑ 升' : '↓ 降');
        }
        this.setButtonVisualState(this.sortDirBtn, this.sortDirBtnText, {
            fillColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? 0x1f2937 : 0x1d4ed8,
            hoverFillColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? 0x334155 : 0x2563eb,
            strokeColor: this.sortDirection === DEFAULT_BROWSER_SORT_DIRECTION ? 0x475569 : 0x93c5fd,
        });

        this.browserInner.removeAll(true);

        const { rows, matchedRows, totalRows } = this.buildBrowserCollections();

        const maxOffset = Math.max(0, rows.length - this.browserVisibleRows);
        this.browserScrollOffset = Phaser.Math.Clamp(this.browserScrollOffset, 0, maxOffset);

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
            let emptyFillColor = 0x0f172a;
            let emptyBorderColor = SECTION_BORDER;
            let emptyTitleColor = '#e2e8f0';
            let emptyBodyColor = '#94a3b8';

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
                emptyTitleColor = '#fde68a';
                emptyBodyColor = '#fcd34d';
            } else if (this.filterQuery.trim().length > 0 || this.filterKind !== undefined) {
                emptyTitle = '当前浏览条件没有命中卡牌';
                emptyBody = '可调整搜索词、切换种类，或点击上方“恢复默认”重新查看全部库存。';
                emptyFillColor = 0x111c33;
                emptyBorderColor = SELECTED_ACCENT;
                emptyTitleColor = '#dbeafe';
                emptyBodyColor = '#bfdbfe';
            } else if (hasModifiedControls) {
                emptyTitle = '当前没有可加入的库存条目';
                emptyBody = '试试切换零库存显示方式，或点击上方“恢复默认”回到默认浏览。';
                emptyFillColor = 0x271b0b;
                emptyBorderColor = WARNING_ACCENT;
                emptyTitleColor = '#fde68a';
                emptyBodyColor = '#fcd34d';
            }

            const emptyCard = this.scene.add.rectangle(this.browserArea.w / 2, 78, this.browserArea.w, 124, emptyFillColor, 0.98);
            emptyCard.setStrokeStyle(1, emptyBorderColor, 0.92);
            const title = this.scene.add.text(this.browserArea.w / 2, 56, emptyTitle, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: emptyTitleColor,
                fontStyle: 'bold',
                align: 'center',
                wordWrap: { width: this.browserArea.w - 40 },
            }).setOrigin(0.5);
            const body = this.scene.add.text(this.browserArea.w / 2, 92, emptyBody, {
                fontFamily: 'Arial',
                fontSize: '13px',
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
                if (displayName !== row.id) {
                    secondaryParts.push(row.id);
                }
                if (row.kind) {
                    secondaryParts.push(KIND_LABEL[row.kind]);
                }
                secondaryParts.push(`库存${row.count}`);
                secondaryParts.push(`卡组${inDeck}`);
                secondaryParts.push(`可加${Math.max(available, 0)}`);
                if (hasDeck) {
                    secondaryParts.push(`空位${deckSlotsRemaining}`);
                }

                let stateLabel = `一键 +${quickAddCount}`;
                let stateFillColor = 0x15372a;
                let stateTextColor = '#bbf7d0';
                let borderColor = VALID_ACCENT;
                let fillColor = 0x0d1b13;
                let nameColor = '#f8fafc';
                let detailColor = '#bbf7d0';
                let disabledFillColor = 0x1f2937;
                let disabledStrokeColor = 0x334155;
                let disabledTextColor = '#94a3b8';

                if (!hasDeck) {
                    stateLabel = '先选卡组';
                    stateFillColor = 0x1f2937;
                    stateTextColor = '#cbd5e1';
                    borderColor = SECTION_BORDER;
                    fillColor = 0x111827;
                    nameColor = '#e2e8f0';
                    detailColor = '#94a3b8';
                    disabledStrokeColor = 0x475569;
                } else if (deckFull) {
                    stateLabel = '卡组已满';
                    stateFillColor = 0x3b2a0e;
                    stateTextColor = '#fde68a';
                    borderColor = WARNING_ACCENT;
                    fillColor = 0x1c1a12;
                    detailColor = '#fde68a';
                    disabledFillColor = 0x3b2a0e;
                    disabledStrokeColor = 0xfcd34d;
                    disabledTextColor = '#fde68a';
                } else if (available <= 0) {
                    stateLabel = '已耗尽';
                    stateFillColor = 0x3f1d24;
                    stateTextColor = '#fecaca';
                    borderColor = INVALID_ACCENT;
                    fillColor = 0x201018;
                    nameColor = row.count > 0 || inDeck > 0 ? '#e2e8f0' : '#94a3b8';
                    detailColor = '#fecaca';
                    disabledFillColor = 0x3f1d24;
                    disabledStrokeColor = 0xfca5a5;
                    disabledTextColor = '#fecaca';
                }
                const spotlightTheme = getPreviewTheme(this.config.metadata?.[row.id]?.kind);
                const hoverFillColor = !hasDeck ? 0x172033 : deckFull ? 0x252016 : available <= 0 ? 0x27141c : 0x102017;
                const activeFillColor = blendColor(fillColor, spotlightTheme.headerFillColor, 0.54);

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

                const nameText = this.scene.add.text(14, rowY + 14, displayName, {
                    fontFamily: 'Arial',
                    fontSize: '15px',
                    color: nameColor,
                    fontStyle: 'bold',
                });
                const detailText = this.scene.add.text(14, rowY + 40, secondaryParts.join(' · '), {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: detailColor,
                });
                const [statePillBg, statePillText] = this.createPill(
                    this.browserArea.w - 210,
                    rowY + 20,
                    stateLabel,
                    stateFillColor,
                    stateTextColor,
                );

                const addButton = this.createButton(
                    this.browserArea.w - 50,
                    rowY + 22,
                    84,
                    22,
                    '加入 1',
                    0x166534,
                    () => {
                        this.setKeyboardZone('browser');
                        this.setDetailCardId(row.id);
                        if (selectedDeck) {
                            this.updateDeckCards(selectedDeck.id, adjustDeckCardCount(deckCards, row.id, 1));
                        }
                    },
                    !canAdd,
                    {
                        hoverFillColor: 0x15803d,
                        strokeColor: 0x86efac,
                        disabledFillColor,
                        disabledStrokeColor,
                        disabledTextColor,
                        fontSize: '11px',
                    },
                );
                const quickAddButton = this.createButton(
                    this.browserArea.w - 50,
                    rowY + 50,
                    84,
                    22,
                    '一键加满',
                    0x15803d,
                    () => {
                        this.setKeyboardZone('browser');
                        this.setDetailCardId(row.id);
                        if (selectedDeck) {
                            this.updateDeckCards(selectedDeck.id, adjustDeckCardCount(deckCards, row.id, quickAddCount));
                        }
                    },
                    !canAdd,
                    {
                        hoverFillColor: 0x16a34a,
                        strokeColor: 0x86efac,
                        disabledFillColor,
                        disabledStrokeColor,
                        disabledTextColor,
                        fontSize: '11px',
                    },
                );

                this.browserInner.add([rowBg, accent, nameText, detailText, statePillBg, statePillText, ...addButton, ...quickAddButton]);
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

        const boxW = 452;
        const boxH = 214;
        const box = this.scene.add.rectangle(width / 2, height / 2, boxW, boxH, 0x111827, 0.99)
            .setStrokeStyle(2, INVALID_ACCENT, 0.92)
            .setDepth(1501);

        const title = this.scene.add.text(width / 2, height / 2 - 68, '确认删除当前卡组', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(1501);

        const body = this.scene.add.text(width / 2, height / 2 - 18, `确定要删除卡组「${deck.name}」吗？\n删除后无法撤销，请谨慎确认。`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#cbd5e1',
            align: 'center',
        }).setOrigin(0.5).setDepth(1501);

        const [cancelBtn, cancelLabel] = this.createButton(
            width / 2 - 88,
            height / 2 + 58,
            130,
            36,
            '取消',
            0x334155,
            () => this.hideDeleteConfirmation(),
            false,
            { hoverFillColor: 0x475569, strokeColor: 0x94a3b8 },
        );
        cancelBtn.setDepth(1501);
        cancelLabel.setDepth(1501);

        const [confirmBtn, confirmLabel] = this.createButton(
            width / 2 + 88,
            height / 2 + 58,
            130,
            36,
            '确认删除',
            0xb91c1c,
            () => this.confirmDelete(),
            false,
            { hoverFillColor: 0xdc2626, strokeColor: 0xfca5a5 },
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
