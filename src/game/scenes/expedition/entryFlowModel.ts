import type { CardKind } from '@data/types/cards/core';
import type {
    ExpeditionMapDefinition,
    ExpeditionNodeType,
    PersistentStash,
    RunResolutionSummary,
    RunSnapshot,
} from '../../types/expedition';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedDeckCards,
    getSelectedSavedDeck,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
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

export interface PreparationFocusChip {
    label: string;
    value: string;
}

export interface PreparationSelectedLoadoutSummary {
    selectedDeckName: string;
    deckCount: number;
    uniqueCardCount: number;
    itemCount: number;
    spiritStones: number;
    readiness: PreparationDeckReadiness;
    readinessLabel: string;
    headline: string;
    detail: string;
    footer: string;
    shortageCardKinds: number;
    shortageCardCopies: number;
    kindSummaryLine: string;
    kindBreakdownLines: string[];
    compositionLine: string;
    focusSummaryLine: string;
    focusChip: PreparationFocusChip;
    issuePreviewLines: string[];
    readinessChecklistLines: string[];
    guidanceLines: string[];
    deckPreviewLines: string[];
    itemPreviewLines: string[];
}

export interface PreparationDeckCardPreview {
    deckCount: number;
    uniqueCardCount: number;
    readiness: PreparationDeckReadiness;
    readinessLabel: string;
    kindSummaryLine: string;
    kindBreakdownLines: string[];
    compositionLine: string;
    focusSummaryLine: string;
    focusChip: PreparationFocusChip;
    issuePreviewLine: string;
    shortagePreviewLines: string[];
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

export type ExpeditionRouteBriefingMode = 'preparation' | 'deckManager';

export interface ExpeditionRouteBriefingHighlight {
    label: string;
    value: string;
}

export interface ExpeditionRouteBriefingSummary {
    mode: ExpeditionRouteBriefingMode;
    shellBadgeLabel: string;
    shellSubtitle: string;
    panelBadgeLabel: string;
    panelStageLabel: string;
    description: string;
    highlights: ExpeditionRouteBriefingHighlight[];
    glanceTitle: string;
    glanceLines: string[];
}

export type ExpeditionPreflightStepState = 'current' | 'complete' | 'upcoming';

export interface ExpeditionPreflightStepSummary {
    index: 1 | 2;
    label: string;
    state: ExpeditionPreflightStepState;
}

export interface ExpeditionPreflightStatusSummary {
    mode: ExpeditionRouteBriefingMode;
    steps: [ExpeditionPreflightStepSummary, ExpeditionPreflightStepSummary];
    badgeLabel: string;
    headline: string;
    detail: string;
    tone: PreparationDeckHandoffSummary['tone'];
}

export interface PreparationLoadoutValidationResult {
    valid: boolean;
    sizeIssue: DeckValidityReason | null;
    availabilityIssues: DeckValidityReason[];
}

type PreparationCardKind = CardKind | 'unknown';

interface PreparationCardKindCount {
    kind: PreparationCardKind;
    count: number;
}

const PREPARATION_CARD_KIND_LABELS: Record<PreparationCardKind, string> = {
    unit: '单位',
    artifact: '法宝',
    talisman: '符箓',
    field: '场地',
    skill: '技能',
    pill: '丹药',
    unknown: '未分类',
};

const PREPARATION_CARD_KIND_ORDER: Record<PreparationCardKind, number> = {
    skill: 0,
    unit: 1,
    artifact: 2,
    talisman: 3,
    field: 4,
    pill: 5,
    unknown: 6,
};

const ROUTE_BRIEFING_NODE_TYPE_LABELS: Record<ExpeditionNodeType, string> = {
    entrance: '入口',
    battle: '战斗',
    event: '事件',
    shop: '商店',
    extract: '撤离',
    boss: '首领',
};

function countStacks<T extends CountableStack>(stacks: readonly T[]): number {
    return stacks.reduce((sum, stack) => sum + stack.count, 0);
}

function countPreparationMissingCopies(issues: readonly DeckValidityReason[]): number {
    return issues.reduce((sum, issue) => (
        issue.kind === 'insufficient-copies'
            ? sum + Math.max(0, issue.required - issue.available)
            : sum
    ), 0);
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

function getDeckReadinessFromValidation(
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
): PreparationDeckReadiness {
    if (sizeIssue?.kind === 'too-few-cards') {
        return 'too-few-cards';
    }

    if (sizeIssue?.kind === 'too-many-cards') {
        return 'too-many-cards';
    }

    if (availabilityIssues.length > 0) {
        return 'insufficient-copies';
    }

    return 'ready';
}

function getPreparationDeckReadiness(stash: PersistentStash): PreparationDeckReadiness {
    const selectedDeck = getSelectedSavedDeck(stash);

    if (!selectedDeck) {
        return 'none';
    }

    const sizeIssue = validateDeckSize(selectedDeck.cards);
    const availabilityIssues = validateDeckAvailability(selectedDeck.cards, stash.cards);

    return getDeckReadinessFromValidation(sizeIssue, availabilityIssues);
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

function getPreparationCardDisplayName(cardId: string, metadata?: CardMetadataMap): string {
    const name = metadata?.[cardId]?.name?.trim();

    return name && name.length > 0 ? name : cardId;
}

function formatPreparationPreviewLine(
    stack: { id: string; count: number },
    metadata?: CardMetadataMap,
): string {
    return `${getPreparationCardDisplayName(stack.id, metadata)} ×${stack.count}`;
}

function formatPreparationInlinePreview(lines: string[], maxEntries: number): string {
    if (lines.length === 0) {
        return '无';
    }

    const visibleEntries = lines.slice(0, maxEntries);

    if (lines.length <= maxEntries) {
        return visibleEntries.join(' · ');
    }

    return `${visibleEntries.join(' · ')} · …另 ${lines.length - maxEntries} 项`;
}

function getPreparationCardKind(cardId: string, metadata?: CardMetadataMap): PreparationCardKind {
    return metadata?.[cardId]?.kind ?? 'unknown';
}

function buildPreparationCardKindBreakdown(
    stacks: readonly { id: string; count: number }[],
    metadata?: CardMetadataMap,
): PreparationCardKindCount[] {
    const counts = new Map<PreparationCardKind, number>();

    for (const stack of stacks) {
        if (stack.count <= 0) {
            continue;
        }

        const kind = getPreparationCardKind(stack.id, metadata);
        counts.set(kind, (counts.get(kind) ?? 0) + stack.count);
    }

    return [...counts.entries()]
        .map(([kind, count]) => ({ kind, count }))
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }

            return PREPARATION_CARD_KIND_ORDER[left.kind] - PREPARATION_CARD_KIND_ORDER[right.kind];
        });
}

function formatPreparationKindSummary(
    stacks: readonly { id: string; count: number }[],
    metadata?: CardMetadataMap,
    maxKinds = 3,
): string {
    const uniqueCardCount = stacks.filter((stack) => stack.count > 0).length;

    if (uniqueCardCount === 0) {
        return '暂无卡牌构成';
    }

    const breakdown = buildPreparationCardKindBreakdown(stacks, metadata);
    const knownBreakdown = breakdown.filter((entry) => entry.kind !== 'unknown');

    if (knownBreakdown.length === 0) {
        return `${uniqueCardCount} 种卡 · 共 ${countStacks(stacks)} 张`;
    }

    const segments = knownBreakdown
        .slice(0, maxKinds)
        .map((entry) => `${PREPARATION_CARD_KIND_LABELS[entry.kind]} ${entry.count}`);

    if (knownBreakdown.length > maxKinds) {
        segments.push('…');
    }

    return [`${uniqueCardCount} 种卡`, ...segments].join(' · ');
}

function createPreparationKindBreakdownLines(
    stacks: readonly { id: string; count: number }[],
    metadata?: CardMetadataMap,
    maxKinds = Number.POSITIVE_INFINITY,
): string[] {
    const breakdown = buildPreparationCardKindBreakdown(stacks, metadata);

    if (breakdown.length === 0) {
        return ['暂无卡牌'];
    }

    const visibleLines = breakdown
        .slice(0, maxKinds)
        .map((entry) => `${PREPARATION_CARD_KIND_LABELS[entry.kind]} ${entry.count} 张`);

    if (breakdown.length > maxKinds) {
        visibleLines.push(`…另 ${breakdown.length - maxKinds} 类`);
    }

    return visibleLines;
}

function createPreparationShortagePreviewSegments(
    issues: readonly DeckValidityReason[],
    metadata?: CardMetadataMap,
): string[] {
    return [...issues]
        .filter((issue): issue is Extract<DeckValidityReason, { kind: 'insufficient-copies' }> => issue.kind === 'insufficient-copies')
        .sort((left, right) => {
            const leftMissing = Math.max(0, left.required - left.available);
            const rightMissing = Math.max(0, right.required - right.available);

            if (rightMissing !== leftMissing) {
                return rightMissing - leftMissing;
            }

            return getPreparationCardDisplayName(left.cardId, metadata)
                .localeCompare(getPreparationCardDisplayName(right.cardId, metadata), 'zh-Hans-CN');
        })
        .map((issue) => `${getPreparationCardDisplayName(issue.cardId, metadata)} -${Math.max(0, issue.required - issue.available)}`);
}

export function createPreparationShortagePreviewLines(
    issues: readonly DeckValidityReason[],
    metadata?: CardMetadataMap,
    maxLines = Number.POSITIVE_INFINITY,
): string[] {
    return createPreparationShortagePreviewSegments(issues, metadata)
        .slice(0, maxLines)
        .map((segment) => segment.replace(' -', ' 还差 ').concat(' 张'));
}

function createPreparationIssuePreviewLines(
    readiness: PreparationDeckReadiness,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
    metadata?: CardMetadataMap,
): string[] {
    switch (readiness) {
        case 'too-few-cards':
            return [
                `还差 ${(sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : 0)} 张才能达到 ${DECK_CARD_MIN} 张。`,
            ];
        case 'too-many-cards':
            return [
                `超出 ${(sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : 0)} 张，请精简到 ${DECK_CARD_MAX} 张内。`,
            ];
        case 'insufficient-copies':
            return createPreparationShortagePreviewLines(availabilityIssues, metadata, 3);
        case 'none':
        case 'ready':
            return [];
    }
}

function createPreparationFocusChip(
    readiness: PreparationDeckReadiness,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
): PreparationFocusChip {
    switch (readiness) {
        case 'ready':
            return { label: '状态', value: '齐备' };
        case 'too-few-cards':
            return {
                label: '还差',
                value: `${sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN} 张`,
            };
        case 'too-many-cards':
            return {
                label: '超出',
                value: `${sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : 0} 张`,
            };
        case 'insufficient-copies':
            return {
                label: '缺口',
                value: `${countPreparationMissingCopies(availabilityIssues)} 张`,
            };
        case 'none':
            return { label: '状态', value: '未选' };
    }
}

function createPreparationFocusSummaryLine(
    readiness: PreparationDeckReadiness,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
): string {
    switch (readiness) {
        case 'ready':
            return '库存齐备，可直接确认出发。';
        case 'too-few-cards':
            return `还差 ${sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN} 张才能达到出发线。`;
        case 'too-many-cards':
            return `超出 ${sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : 0} 张，请精简后再确认。`;
        case 'insufficient-copies': {
            const missingCopies = countPreparationMissingCopies(availabilityIssues);

            return availabilityIssues.length === 1
                ? `库存仍缺 ${missingCopies} 张目标卡牌。`
                : `库存共缺 ${missingCopies} 张目标卡牌，涉及 ${availabilityIssues.length} 种。`;
        }
        case 'none':
            return '请先选择一套可带入的卡组。';
    }
}

function createPreparationReadinessChecklistLines(
    readiness: PreparationDeckReadiness,
    deckCount: number,
    uniqueCardCount: number,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
    metadata?: CardMetadataMap,
): string[] {
    switch (readiness) {
        case 'ready':
            return [
                `张数 ${deckCount} 张，符合 ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张范围。`,
                `${uniqueCardCount} 种卡牌已完成库存核对。`,
            ];
        case 'too-few-cards':
            return [
                `当前仅 ${deckCount} 张，还差 ${sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN - deckCount} 张达到出发线。`,
            ];
        case 'too-many-cards':
            return [
                `当前 ${deckCount} 张，超出上限 ${sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : deckCount - DECK_CARD_MAX} 张。`,
            ];
        case 'insufficient-copies':
            return createPreparationIssuePreviewLines(readiness, sizeIssue, availabilityIssues, metadata).slice(0, 3);
        case 'none':
            return ['尚未选中可带入卡组。'];
    }
}

function createPreparationGuidanceLines(
    readiness: PreparationDeckReadiness,
    deckCount: number,
    itemCount: number,
    spiritStones: number,
    sizeIssue: DeckValidityReason | null,
    shortageCardKinds: number,
    shortageCardCopies: number,
): string[] {
    switch (readiness) {
        case 'ready':
            return [
                '确认后立即创建本次秘境快照。',
                `按当前清单带入 ${deckCount} 张卡、${itemCount} 件道具与 ${spiritStones} 枚灵石。`,
            ];
        case 'too-few-cards':
            return [
                `先去管理卡组补足 ${sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN - deckCount} 张，达到 ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张。`,
                '返回这里后才能确认带入。',
            ];
        case 'too-many-cards':
            return [
                `先去管理卡组精简 ${sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : deckCount - DECK_CARD_MAX} 张，压回 ${DECK_CARD_MAX} 张内。`,
                '返回这里后才能确认带入。',
            ];
        case 'insufficient-copies':
            return [
                shortageCardKinds === 1
                    ? `先补齐 1 种缺牌，共 ${shortageCardCopies} 张。`
                    : `先补齐 ${shortageCardKinds} 种缺牌，共 ${shortageCardCopies} 张。`,
                '返回这里后才能确认带入。',
            ];
        case 'none':
            return [
                '先去管理卡组创建或选择一套卡组。',
                '满足带入条件后才会创建秘境快照。',
            ];
    }
}

function createPreparationDeckCardIssuePreviewLine(
    readiness: PreparationDeckReadiness,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
    metadata?: CardMetadataMap,
): string {
    switch (readiness) {
        case 'ready':
            return '库存充足，可直接带入。';
        case 'too-few-cards':
            return `还差 ${(sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : 0)} 张达到 ${DECK_CARD_MIN} 张。`;
        case 'too-many-cards':
            return `超出 ${(sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : 0)} 张，请精简。`;
        case 'insufficient-copies':
            return `缺牌：${formatPreparationInlinePreview(
                createPreparationShortagePreviewSegments(availabilityIssues, metadata),
                2,
            )}`;
        case 'none':
            return '请先选择卡组。';
    }
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

function getRouteDepth(map: ExpeditionMapDefinition): number {
    return map.nodes.reduce((maxLayer, node) => Math.max(maxLayer, node.layer), 0) + 1;
}

function createRouteNodeLookup(map: ExpeditionMapDefinition): Map<string, ExpeditionMapDefinition['nodes'][number]> {
    return new Map(map.nodes.map((node) => [node.id, node]));
}

function getRouteOpeningNodes(map: ExpeditionMapDefinition, entryNode: ExpeditionMapDefinition['nodes'][number] | undefined) {
    if (!entryNode) {
        return [];
    }

    const nodeLookup = createRouteNodeLookup(map);

    return entryNode.outgoingNodeIds
        .map((nodeId) => nodeLookup.get(nodeId))
        .filter((node): node is ExpeditionMapDefinition['nodes'][number] => node !== undefined);
}

function getRouteTerminalNodes(map: ExpeditionMapDefinition) {
    return map.nodes.filter((node) => node.outgoingNodeIds.length === 0 && node.id !== map.entryNodeId);
}

function getRouteLayerGroups(map: ExpeditionMapDefinition) {
    const layers = new Map<number, ExpeditionMapDefinition['nodes'][number][]>();

    for (const node of map.nodes) {
        if (node.id === map.entryNodeId) {
            continue;
        }

        const current = layers.get(node.layer);

        if (current) {
            current.push(node);
        } else {
            layers.set(node.layer, [node]);
        }
    }

    return [...layers.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, nodes]) => nodes);
}

function formatRouteNodeLabels(
    nodes: readonly ExpeditionMapDefinition['nodes'][number][],
    options?: {
        includeType?: boolean;
        limit?: number;
        emptyLabel?: string;
    },
): string {
    const includeType = options?.includeType ?? false;
    const limit = options?.limit ?? nodes.length;
    const emptyLabel = options?.emptyLabel ?? '暂无节点';

    if (nodes.length === 0) {
        return emptyLabel;
    }

    const visibleNodes = nodes.slice(0, limit);
    const label = visibleNodes
        .map((node) => includeType
            ? `${node.label}（${ROUTE_BRIEFING_NODE_TYPE_LABELS[node.type]}）`
            : node.label)
        .join(' / ');

    return visibleNodes.length < nodes.length
        ? `${label} · …另 ${nodes.length - visibleNodes.length} 处`
        : label;
}

function getRouteLayerLabel(index: number, totalLayers: number): string {
    if (index === 0) {
        return '首层';
    }

    if (index === totalLayers - 1) {
        return '终层';
    }

    const numerals = ['二', '三', '四', '五', '六', '七', '八', '九'];

    return `${numerals[index - 1] ?? `${index + 1}`}层`;
}

function createRouteGlanceLines(map: ExpeditionMapDefinition): string[] {
    const layerGroups = getRouteLayerGroups(map);

    return layerGroups.map((nodes, index) => `${getRouteLayerLabel(index, layerGroups.length)}：${formatRouteNodeLabels(nodes, {
        includeType: true,
    })}`);
}

function createRouteShellSubtitle(
    openingNodes: readonly ExpeditionMapDefinition['nodes'][number][],
    terminalNodes: readonly ExpeditionMapDefinition['nodes'][number][],
): string {
    const openingSummary = formatRouteNodeLabels(openingNodes, {
        limit: 2,
        emptyLabel: '入口后直进',
    });
    const terminalSummary = formatRouteNodeLabels(terminalNodes, {
        limit: 2,
        emptyLabel: '无终点情报',
    });

    return `开局：${openingSummary} · 收官：${terminalSummary}`;
}

function createRouteBriefingDescription(
    map: ExpeditionMapDefinition,
    mode: ExpeditionRouteBriefingMode,
    entryNode: ExpeditionMapDefinition['nodes'][number] | undefined,
    openingNodes: readonly ExpeditionMapDefinition['nodes'][number][],
    terminalNodes: readonly ExpeditionMapDefinition['nodes'][number][],
): string {
    const entryLabel = entryNode?.label ?? map.entryNodeId;
    const openingSummary = formatRouteNodeLabels(openingNodes, {
        limit: 2,
        emptyLabel: '入口后的单线推进',
    });
    const terminalSummary = formatRouteNodeLabels(terminalNodes, {
        limit: 2,
        emptyLabel: '终段节点',
    });
    const openingPhrase = openingNodes.length > 1
        ? `${openingSummary}的分路`
        : `${openingSummary}的推进顺序`;

    if (mode === 'deckManager') {
        return `${map.name}从${entryLabel}起步，前段要先看${openingPhrase}；整理卡组时请对照${terminalSummary}的收官节点再返回远征准备。`;
    }

    return `${map.name}从${entryLabel}起步，先辨认${openingPhrase}，再按${terminalSummary}的收官去准备本次带入。`;
}

function getRouteBriefingShellCopy(mode: ExpeditionRouteBriefingMode): {
    badgeLabel: string;
    subtitle: string;
    stageLabel: string;
} {
    if (mode === 'deckManager') {
        return {
            badgeLabel: '步骤 2 / 2',
            subtitle: '两步出发校验 · 整理卡组后返回确认',
            stageLabel: '当前阶段：整理卡组并返回远征准备',
        };
    }

    return {
        badgeLabel: '步骤 1 / 2',
        subtitle: '两步出发校验 · 先确认路线，再选定带入',
        stageLabel: '当前阶段：确认路线并选定本次带入',
    };
}

function createExpeditionPreflightSteps(mode: ExpeditionRouteBriefingMode): [ExpeditionPreflightStepSummary, ExpeditionPreflightStepSummary] {
    if (mode === 'deckManager') {
        return [
            { index: 1, label: '确认路线与带入', state: 'complete' },
            { index: 2, label: '卡组管理', state: 'current' },
        ];
    }

    return [
        { index: 1, label: '确认路线与带入', state: 'current' },
        { index: 2, label: '卡组管理', state: 'upcoming' },
    ];
}

function getExpeditionPreflightBadgeLabel(
    mode: ExpeditionRouteBriefingMode,
    readiness: PreparationDeckReadiness,
): string {
    switch (readiness) {
        case 'ready':
            return mode === 'deckManager' ? '可返回确认' : '可出发';
        case 'none':
            return '待选卡组';
        case 'too-few-cards':
            return '缺出征线';
        case 'too-many-cards':
            return '超出上限';
        case 'insufficient-copies':
            return '库存不足';
    }
}

function getExpeditionPreflightTone(readiness: PreparationDeckReadiness): PreparationDeckHandoffSummary['tone'] {
    return readiness === 'ready' ? 'positive' : 'warning';
}

function formatExpeditionPreflightHeadline(context: PreparationDeckContext): string {
    if (!context.selectedDeckId || !context.selectedDeckName) {
        return '尚未选定本次带入卡组';
    }

    return `当前带入「${context.selectedDeckName}」 · ${context.deckCount} 张`;
}

function formatExpeditionPreflightInventory(stash: PersistentStash): string {
    return `${countStacks(stash.items)} 件道具 · ${stash.spiritStones} 枚灵石`;
}

function createExpeditionPreflightDetail(
    mode: ExpeditionRouteBriefingMode,
    stash: PersistentStash,
    readiness: PreparationDeckReadiness,
    sizeIssue: DeckValidityReason | null,
    availabilityIssues: DeckValidityReason[],
): string {
    const inventorySummary = formatExpeditionPreflightInventory(stash);

    switch (readiness) {
        case 'ready':
            return mode === 'deckManager'
                ? `已通过 20-40 张与库存校验；同行 ${inventorySummary}，可继续微调或返回确认。`
                : `已通过 20-40 张与库存校验；同行 ${inventorySummary}，可直接确认出发。`;
        case 'none':
            return mode === 'deckManager'
                ? `请先选择或创建一套卡组；同行 ${inventorySummary}，返回远征准备前需满足带入要求。`
                : `请先选择或创建一套卡组；同行 ${inventorySummary}，随后才能确认出发。`;
        case 'too-few-cards':
            return `还差 ${sizeIssue?.kind === 'too-few-cards' ? sizeIssue.min - sizeIssue.count : DECK_CARD_MIN} 张达到 ${DECK_CARD_MIN} 张出发线；同行 ${inventorySummary}。`;
        case 'too-many-cards':
            return `当前超出 ${sizeIssue?.kind === 'too-many-cards' ? sizeIssue.count - sizeIssue.max : 0} 张，请精简到 ${DECK_CARD_MAX} 张内；同行 ${inventorySummary}。`;
        case 'insufficient-copies': {
            const missingCopies = countPreparationMissingCopies(availabilityIssues);

            return availabilityIssues.length === 1
                ? `有 1 种卡牌库存不足，共缺 ${missingCopies} 张；同行 ${inventorySummary}。`
                : `有 ${availabilityIssues.length} 种卡牌库存不足，共缺 ${missingCopies} 张；同行 ${inventorySummary}。`;
        }
    }
}

export function createExpeditionRouteBriefingSummary(
    map: ExpeditionMapDefinition,
    mode: ExpeditionRouteBriefingMode,
): ExpeditionRouteBriefingSummary {
    const entryNode = map.nodes.find((node) => node.id === map.entryNodeId);
    const openingNodes = getRouteOpeningNodes(map, entryNode);
    const terminalNodes = getRouteTerminalNodes(map);
    const shellCopy = getRouteBriefingShellCopy(mode);

    return {
        mode,
        shellBadgeLabel: shellCopy.badgeLabel,
        shellSubtitle: createRouteShellSubtitle(openingNodes, terminalNodes),
        panelBadgeLabel: '路线简报',
        panelStageLabel: shellCopy.stageLabel,
        description: createRouteBriefingDescription(map, mode, entryNode, openingNodes, terminalNodes),
        highlights: [
            {
                label: '入口',
                value: entryNode?.label ?? map.entryNodeId,
            },
            {
                label: '开局',
                value: formatRouteNodeLabels(openingNodes, {
                    limit: 2,
                    emptyLabel: `${getRouteDepth(map)} 层推进`,
                }),
            },
            {
                label: '收官',
                value: formatRouteNodeLabels(terminalNodes, {
                    limit: 2,
                    emptyLabel: `${getRouteDepth(map)} 层推进`,
                }),
            },
        ],
        glanceTitle: '路线速览',
        glanceLines: createRouteGlanceLines(map),
    };
}

export function createExpeditionPreflightStatusSummary(
    stash: PersistentStash,
    mode: ExpeditionRouteBriefingMode,
): ExpeditionPreflightStatusSummary {
    const context = createPreparationDeckContext(stash);
    const selectedDeck = getSelectedSavedDeck(stash);
    const sizeIssue = selectedDeck ? validateDeckSize(selectedDeck.cards) : null;
    const availabilityIssues = selectedDeck ? validateDeckAvailability(selectedDeck.cards, stash.cards) : [];

    return {
        mode,
        steps: createExpeditionPreflightSteps(mode),
        badgeLabel: getExpeditionPreflightBadgeLabel(mode, context.readiness),
        headline: formatExpeditionPreflightHeadline(context),
        detail: createExpeditionPreflightDetail(mode, stash, context.readiness, sizeIssue, availabilityIssues),
        tone: getExpeditionPreflightTone(context.readiness),
    };
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
    metadata?: CardMetadataMap,
): PreparationSelectedLoadoutSummary {
    const selectedDeck = getSelectedSavedDeck(stash);
    const selectedDeckCards = getSelectedDeckCards(stash);
    const deckCount = countStacks(selectedDeckCards);
    const uniqueCardCount = selectedDeckCards.filter((stack) => stack.count > 0).length;
    const itemCount = countStacks(stash.items);
    const readiness = getPreparationDeckReadiness(stash);
    const readinessLabel = getPreparationDeckReadinessLabel(readiness);
    const sizeIssue = selectedDeck ? validateDeckSize(selectedDeck.cards) : null;
    const availabilityIssues = selectedDeck ? validateDeckAvailability(selectedDeck.cards, stash.cards) : [];
    const shortageCardKinds = availabilityIssues.length;
    const shortageCardCopies = countPreparationMissingCopies(availabilityIssues);

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

    const deckPreviewLines = selectedDeckCards.length > 0
        ? selectedDeckCards.map((stack) => formatPreparationPreviewLine(stack, metadata))
        : ['无'];
    const issuePreviewLines = createPreparationIssuePreviewLines(
        readiness,
        sizeIssue,
        availabilityIssues,
        metadata,
    );
    const readinessChecklistLines = createPreparationReadinessChecklistLines(
        readiness,
        deckCount,
        uniqueCardCount,
        sizeIssue,
        availabilityIssues,
        metadata,
    );
    const focusSummaryLine = createPreparationFocusSummaryLine(readiness, sizeIssue, availabilityIssues);
    const focusChip = createPreparationFocusChip(readiness, sizeIssue, availabilityIssues);
    const guidanceLines = createPreparationGuidanceLines(
        readiness,
        deckCount,
        itemCount,
        stash.spiritStones,
        sizeIssue,
        shortageCardKinds,
        shortageCardCopies,
    );

    return {
        selectedDeckName: selectedDeck?.name ?? '未选择卡组',
        deckCount,
        uniqueCardCount,
        itemCount,
        spiritStones: stash.spiritStones,
        readiness,
        readinessLabel,
        headline,
        detail,
        footer,
        shortageCardKinds,
        shortageCardCopies,
        kindSummaryLine: formatPreparationKindSummary(selectedDeckCards, metadata),
        kindBreakdownLines: createPreparationKindBreakdownLines(selectedDeckCards, metadata, 3),
        compositionLine: formatPreparationInlinePreview(deckPreviewLines, 4),
        focusSummaryLine,
        focusChip,
        issuePreviewLines,
        readinessChecklistLines,
        guidanceLines,
        deckPreviewLines,
        itemPreviewLines: stash.items.length > 0
            ? stash.items.map((stack) => formatPreparationPreviewLine(stack))
            : ['无'],
    };
}

export function createPreparationDeckCardPreview(
    deck: { cards: readonly { id: string; count: number }[] },
    stashCards: readonly { id: string; count: number }[],
    metadata?: CardMetadataMap,
): PreparationDeckCardPreview {
    const sizeIssue = validateDeckSize(deck.cards);
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards);
    const readiness = getDeckReadinessFromValidation(sizeIssue, availabilityIssues);
    const compositionPreviewLines = deck.cards
        .filter((stack) => stack.count > 0)
        .map((stack) => formatPreparationPreviewLine(stack, metadata));
    const shortagePreviewLines = readiness === 'ready'
        ? ['库存齐备，可直接带入。']
        : createPreparationIssuePreviewLines(readiness, sizeIssue, availabilityIssues, metadata).slice(0, 2);
    const focusSummaryLine = createPreparationFocusSummaryLine(readiness, sizeIssue, availabilityIssues);
    const focusChip = createPreparationFocusChip(readiness, sizeIssue, availabilityIssues);

    return {
        deckCount: countStacks(deck.cards),
        uniqueCardCount: deck.cards.filter((stack) => stack.count > 0).length,
        readiness,
        readinessLabel: getPreparationDeckReadinessLabel(readiness),
        kindSummaryLine: formatPreparationKindSummary(deck.cards, metadata, 2),
        kindBreakdownLines: createPreparationKindBreakdownLines(deck.cards, metadata, 3),
        compositionLine: formatPreparationInlinePreview(compositionPreviewLines, 3),
        focusSummaryLine,
        focusChip,
        issuePreviewLine: createPreparationDeckCardIssuePreviewLine(
            readiness,
            sizeIssue,
            availabilityIssues,
            metadata,
        ),
        shortagePreviewLines,
    };
}

function formatPreparationSizeIssue(issue: Extract<DeckValidityReason, { kind: 'too-few-cards' | 'too-many-cards' }>): string {
    if (issue.kind === 'too-few-cards') {
        return `卡组数量不足（当前 ${issue.count} 张，需要至少 ${issue.min} 张）`;
    }

    return `卡组数量超限（当前 ${issue.count} 张，最多 ${issue.max} 张）`;
}

function formatPreparationAvailabilityIssue(
    issue: DeckValidityReason,
    metadata?: CardMetadataMap,
): string {
    if (issue.kind === 'insufficient-copies') {
        const displayName = getPreparationCardDisplayName(issue.cardId, metadata);
        return `卡牌 ${displayName} 数量不足（需要 ${issue.required} 张，储物袋中仅有 ${issue.available} 张）`;
    }

    return '';
}

export function formatPreparationValidationLines(
    result: PreparationLoadoutValidationResult,
    metadata?: CardMetadataMap,
): string[] {
    if (result.valid) {
        return ['卡组符合要求，可以带入秘境。'];
    }

    const lines: string[] = [];

    if (result.sizeIssue?.kind === 'too-few-cards' || result.sizeIssue?.kind === 'too-many-cards') {
        lines.push(formatPreparationSizeIssue(result.sizeIssue));
    }

    for (const issue of result.availabilityIssues) {
        const line = formatPreparationAvailabilityIssue(issue, metadata);

        if (line.length > 0) {
            lines.push(line);
        }
    }

    if (lines.length === 0) {
        lines.push('请先在管理卡组中创建或选择一套可用卡组。');
    }

    return lines;
}

export function formatPreparationValidationStatusText(
    result: PreparationLoadoutValidationResult,
    metadata?: CardMetadataMap,
): string {
    return formatPreparationValidationLines(result, metadata).join('\n');
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
