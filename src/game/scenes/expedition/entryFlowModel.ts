import type { PersistentStash, RunResolutionSummary, RunSnapshot } from '../../types/expedition';
import {
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedDeckCards,
    getSelectedSavedDeck,
    validateDeckAvailability,
    validateDeckSize,
} from '../../state/PersistentStashDecks';

interface CountableStack {
    count: number;
}

export interface PreparationSummary {
    deckCount: number;
    itemCount: number;
    spiritStones: number;
    statusText: string;
}

export type PreparationDeckReadiness = 'none' | 'ready' | 'too-few-cards' | 'too-many-cards' | 'insufficient-copies';

export interface PreparationDeckContext {
    selectedDeckId: string | null;
    selectedDeckName: string | null;
    deckCount: number;
    readiness: PreparationDeckReadiness;
    savedDeckCount: number;
    selectedDeckCardSignature: string | null;
}

export interface PreparationDeckHandoffSummary {
    title: string;
    detail: string;
    tone: 'positive' | 'neutral' | 'warning';
}

export interface PreparationSelectedLoadoutSummary {
    selectedDeckName: string;
    deckCount: number;
    itemCount: number;
    spiritStones: number;
    readiness: PreparationDeckReadiness;
    readinessLabel: string;
    headline: string;
    detail: string;
    footer: string;
    shortageCardKinds: number;
    shortageCardCopies: number;
    deckPreviewLines: string[];
    itemPreviewLines: string[];
}

export interface RunSummary {
    currentNodeId: string;
    currentNodeLabel: string;
    carriedDeckCount: number;
    carriedItemCount: number;
    spiritStones: number;
    statusText: string;
}

export interface RunResolutionSummaryView {
    outcome: RunResolutionSummary['outcome'];
    title: string;
    subtitle: string;
    finalNodeId: string;
    keptCards: string[];
    keptItems: string[];
    keptSpiritStones: string;
    lostCards: string[];
    lostItems: string[];
    lostSpiritStones: string;
}

export type RunSummaryMode = 'started' | 'resumed';

export interface RunSummaryOptions {
    mode?: RunSummaryMode;
    currentNodeLabel?: string;
}

function countStacks<T extends CountableStack>(stacks: T[]): number {
    return stacks.reduce((sum, stack) => sum + stack.count, 0);
}

function createDeckCardSignature(stacks: Array<{ id: string; count: number }>): string | null {
    if (stacks.length === 0) {
        return null;
    }

    return [...stacks]
        .sort((left, right) => left.id.localeCompare(right.id) || left.count - right.count)
        .map((stack) => `${stack.id}:${stack.count}`)
        .join('|');
}

function getPreparationDeckReadiness(stash: PersistentStash): PreparationDeckReadiness {
    const selectedDeck = getSelectedSavedDeck(stash);

    if (!selectedDeck) {
        return 'none';
    }

    const sizeIssue = validateDeckSize(selectedDeck.cards);

    if (sizeIssue?.kind === 'too-few-cards') {
        return 'too-few-cards';
    }

    if (sizeIssue?.kind === 'too-many-cards') {
        return 'too-many-cards';
    }

    if (validateDeckAvailability(selectedDeck.cards, stash.cards).length > 0) {
        return 'insufficient-copies';
    }

    return 'ready';
}

function getPreparationDeckReadinessLabel(readiness: PreparationDeckReadiness): string {
    switch (readiness) {
        case 'none':
            return '未选择卡组';
        case 'ready':
            return '已满足带入要求';
        case 'too-few-cards':
            return '张数不足';
        case 'too-many-cards':
            return '张数超限';
        case 'insufficient-copies':
            return '缺少库存卡牌';
    }
}

function formatPreparationPreviewLine(stack: { id: string; count: number }): string {
    return `${stack.id} ×${stack.count}`;
}

function formatPreparationDeckContext(prefix: string, context: PreparationDeckContext): string {
    if (!context.selectedDeckId || !context.selectedDeckName) {
        return `${prefix}未选择卡组。`;
    }

    return `${prefix}「${context.selectedDeckName}」：${context.deckCount} 张，${getPreparationDeckReadinessLabel(context.readiness)}。`;
}

function createDeckCountDeltaText(before: number, after: number): string {
    return `已保存卡组数从 ${before} 套变为 ${after} 套。`;
}

function getPreparationDeckHandoffTone(
    changed: boolean,
    afterContext: PreparationDeckContext,
): PreparationDeckHandoffSummary['tone'] {
    if (!changed) {
        return 'neutral';
    }

    return afterContext.readiness === 'ready' ? 'positive' : 'warning';
}

export function createPreparationSummary(stash: PersistentStash): PreparationSummary {
    const deckCount = countStacks(getSelectedDeckCards(stash));
    const itemCount = countStacks(stash.items);

    return {
        deckCount,
        itemCount,
        spiritStones: stash.spiritStones,
        statusText: `储物袋已备好：${deckCount} 张卡、${itemCount} 件道具、${stash.spiritStones} 枚灵石。`,
    };
}

export function createPreparationDeckContext(stash: PersistentStash): PreparationDeckContext {
    const selectedDeck = getSelectedSavedDeck(stash);
    const selectedDeckCards = getSelectedDeckCards(stash);

    return {
        selectedDeckId: selectedDeck?.id ?? null,
        selectedDeckName: selectedDeck?.name ?? null,
        deckCount: countStacks(selectedDeckCards),
        readiness: getPreparationDeckReadiness(stash),
        savedDeckCount: stash.savedDecks.length,
        selectedDeckCardSignature: createDeckCardSignature(selectedDeckCards),
    };
}

export function createPreparationDeckHandoffSummary(
    beforeContext: PreparationDeckContext,
    afterContext: PreparationDeckContext,
): PreparationDeckHandoffSummary {
    const selectedDeckChanged = beforeContext.selectedDeckId !== afterContext.selectedDeckId;
    const deckNameChanged = beforeContext.selectedDeckName !== afterContext.selectedDeckName;
    const deckCountChanged = beforeContext.deckCount !== afterContext.deckCount;
    const readinessChanged = beforeContext.readiness !== afterContext.readiness;
    const deckCompositionChanged = beforeContext.selectedDeckCardSignature !== afterContext.selectedDeckCardSignature;
    const focusChanged = selectedDeckChanged
        || deckNameChanged
        || deckCountChanged
        || readinessChanged
        || deckCompositionChanged;
    const savedDeckCountChanged = beforeContext.savedDeckCount !== afterContext.savedDeckCount;
    const changed = focusChanged || savedDeckCountChanged;
    const tone = getPreparationDeckHandoffTone(changed, afterContext);

    if (!changed) {
        return {
            title: '卡组未改动',
            detail: `${formatPreparationDeckContext('当前带入', afterContext)}名称、构成、张数与带入状态均未变化。`,
            tone,
        };
    }

    if (!focusChanged && savedDeckCountChanged) {
        return {
            title: '卡组列表已更新',
            detail: `${formatPreparationDeckContext('当前带入', afterContext)}${createDeckCountDeltaText(
                beforeContext.savedDeckCount,
                afterContext.savedDeckCount,
            )}`,
            tone,
        };
    }

    if (
        !selectedDeckChanged
        && !deckNameChanged
        && !deckCountChanged
        && !readinessChanged
        && deckCompositionChanged
        && !savedDeckCountChanged
    ) {
        return {
            title: '卡组内容已调整',
            detail: `${formatPreparationDeckContext('当前带入', afterContext)}卡牌构成已更新。`,
            tone,
        };
    }

    const detailParts = [
        formatPreparationDeckContext('当前带入', afterContext),
    ];

    if (beforeContext.selectedDeckId || beforeContext.selectedDeckName) {
        detailParts.push(formatPreparationDeckContext('离开前为', beforeContext));
    } else {
        detailParts.push('离开管理界面前尚未选中卡组。');
    }

    if (deckCompositionChanged && !selectedDeckChanged) {
        detailParts.push('卡牌构成也已更新。');
    }

    if (savedDeckCountChanged) {
        detailParts.push(createDeckCountDeltaText(beforeContext.savedDeckCount, afterContext.savedDeckCount));
    }

    return {
        title: selectedDeckChanged ? '当前带入已切换' : '卡组改动已同步',
        detail: detailParts.join(''),
        tone,
    };
}

export function createPreparationSelectedLoadoutSummary(
    stash: PersistentStash,
): PreparationSelectedLoadoutSummary {
    const selectedDeck = getSelectedSavedDeck(stash);
    const selectedDeckCards = getSelectedDeckCards(stash);
    const deckCount = countStacks(selectedDeckCards);
    const itemCount = countStacks(stash.items);
    const readiness = getPreparationDeckReadiness(stash);
    const readinessLabel = getPreparationDeckReadinessLabel(readiness);
    const sizeIssue = selectedDeck ? validateDeckSize(selectedDeck.cards) : null;
    const availabilityIssues = selectedDeck ? validateDeckAvailability(selectedDeck.cards, stash.cards) : [];
    const shortageCardKinds = availabilityIssues.length;
    const shortageCardCopies = availabilityIssues.reduce(
        (sum, issue) => sum + Math.max(0, issue.required - issue.available),
        0,
    );

    let headline = '尚未选择卡组';
    let detail = '请先选择或创建一套满足要求的卡组，再确认本次带入。';
    let footer = '当前不会创建新的秘境带入快照。';

    switch (readiness) {
        case 'ready':
            headline = '当前卡组已可带入';
            detail = '满足 20-40 张且所有卡牌均在储物袋中。';
            footer = `确认时会携带 ${deckCount} 张卡、${itemCount} 件道具与 ${stash.spiritStones} 枚灵石进入秘境。`;
            break;
        case 'too-few-cards':
            headline = '当前卡组张数不足';
            detail = `还差 ${(sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN - deckCount)} 张才能达到 ${DECK_CARD_MIN} 张。`;
            footer = '补足牌数后，会按当前所示卡组与物资进入秘境。';
            break;
        case 'too-many-cards':
            headline = '当前卡组超出上限';
            detail = `超出 ${(sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : deckCount - DECK_CARD_MAX)} 张，请精简到 ${DECK_CARD_MAX} 张内。`;
            footer = '精简卡组后，会按当前所示卡组与物资进入秘境。';
            break;
        case 'insufficient-copies':
            headline = '当前卡组库存不足';
            detail = shortageCardKinds === 1
                ? `1 种卡牌库存不足，共缺 ${shortageCardCopies} 张。`
                : `${shortageCardKinds} 种卡牌库存不足，共缺 ${shortageCardCopies} 张。`;
            footer = '补齐库存卡牌后，会按当前所示卡组与物资进入秘境。';
            break;
        case 'none':
            break;
    }

    return {
        selectedDeckName: selectedDeck?.name ?? '未选择卡组',
        deckCount,
        itemCount,
        spiritStones: stash.spiritStones,
        readiness,
        readinessLabel,
        headline,
        detail,
        footer,
        shortageCardKinds,
        shortageCardCopies,
        deckPreviewLines: selectedDeckCards.length > 0
            ? selectedDeckCards.map(formatPreparationPreviewLine)
            : ['无'],
        itemPreviewLines: stash.items.length > 0
            ? stash.items.map(formatPreparationPreviewLine)
            : ['无'],
    };
}

export function createRunSummary(run: RunSnapshot, options: RunSummaryOptions = {}): RunSummary {
    const carriedDeckCount = countStacks(run.carriedDeck);
    const carriedItemCount = countStacks(run.carriedItems);
    const runVerb = options.mode === 'started' ? '已进入秘境' : '已继续探索';
    const currentNodeLabel = options.currentNodeLabel ?? run.currentNodeId;

    return {
        currentNodeId: run.currentNodeId,
        currentNodeLabel,
        carriedDeckCount,
        carriedItemCount,
        spiritStones: run.spiritStones,
        statusText: `${runVerb}：当前位置 ${currentNodeLabel}，携带 ${carriedDeckCount} 张卡、${carriedItemCount} 件道具、${run.spiritStones} 枚灵石。`,
    };
}

function formatStacks<T extends { id: string; count: number }>(stacks: T[]): string[] {
    return stacks.length > 0 ? stacks.map((stack) => `${stack.id} ×${stack.count}`) : ['无'];
}

function getResolutionCopy(outcome: RunResolutionSummary['outcome']): { title: string; subtitle: string } {
    switch (outcome) {
        case 'defeat':
            return {
                title: '探索失败',
                subtitle: '战败：本次携带与搜刮的资产全部遗失。',
            };
        case 'extract':
            return {
                title: '撤离成功',
                subtitle: '撤离成功：当前携带与搜刮的资产已存入永久仓库。',
            };
        case 'boss-clear':
            return {
                title: 'Boss 通关',
                subtitle: 'Boss 通关：当前携带与搜刮的资产已存入永久仓库。',
            };
    }
}

function getEntranceOutcomeLabel(outcome: RunResolutionSummary['outcome']): string {
    switch (outcome) {
        case 'defeat':
            return '探索失败';
        case 'extract':
            return '撤离成功';
        case 'boss-clear':
            return 'Boss 通关';
    }
}

export function createPostRunEntranceStatus(
    stash: PersistentStash,
    summary: RunResolutionSummary,
): string {
    return `${createPreparationSummary(stash).statusText}\n` +
        `上次结果：${getEntranceOutcomeLabel(summary.outcome)}（${summary.finalNodeId}）。可立即开始新的秘境探索。`;
}

export function createRunResolutionSummaryView(summary: RunResolutionSummary): RunResolutionSummaryView {
    const copy = getResolutionCopy(summary.outcome);
    const kept = summary.outcome === 'defeat'
        ? { cards: [], items: [], spiritStones: 0 }
        : summary.kept;

    return {
        outcome: summary.outcome,
        title: copy.title,
        subtitle: copy.subtitle,
        finalNodeId: summary.finalNodeId,
        keptCards: formatStacks(kept.cards),
        keptItems: formatStacks(kept.items),
        keptSpiritStones: String(kept.spiritStones),
        lostCards: formatStacks(summary.lost.cards),
        lostItems: formatStacks(summary.lost.items),
        lostSpiritStones: String(summary.lost.spiritStones),
    };
}
