import {
    applyStoryChoice,
    applyStoryEffects,
    createInitialStoryState,
    evaluateStoryCondition,
    getEffectiveStoryAttribute,
    goToStoryNode,
} from '../../state/StoryState';
import type {
    StoryBattleLaunchMetadata,
    StoryBattleTrigger,
    StoryCondition,
    StoryEffect,
    StoryEffectKind,
    StoryInitialStateSeed,
    StoryState,
} from '../../types/story';
import type { StoryDialogueLine } from './storyFlow';

export interface StoryAiHints {
    tone?: string;
    theme?: string[];
    forbid?: string[];
}

export interface StoryNodeDefinition {
    id: string;
    type: string;
    title: string;
    summary: string;
    detail: string;
    dialogues?: StoryDialogueLine[];
    tags: string[];
    chapter?: string;
    location?: string;
    timeHint?: string;
    backgroundAsset?: string;
    sublocation?: string;
    locationId?: string;
    sublocationId?: string;
    onEnter?: StoryEffect[];
    worldPrecondition?: string;
    worldEffectHint?: string;
    aiHints?: StoryAiHints;
}

export interface StoryChoiceCondition {
    expression?: string;
    worldStateHint?: string;
}

export interface StoryChoiceEffects {
    worldChangeHint?: string;
    relationChangeHint?: string;
}

export interface StoryChoiceDefinition {
    id: string;
    from: string;
    to: string;
    text: string;
    description?: string;
    condition?: StoryChoiceCondition;
    visibleWhen?: StoryCondition;
    enabledWhen?: StoryCondition;
    effects?: StoryChoiceEffects | StoryEffect[];
    flags?: string[];
}

export interface StoryGraphDefinition {
    storyId?: string;
    title?: string;
    entryNodeId: string;
    initialState?: StoryInitialStateSeed;
    nodes: StoryNodeDefinition[];
    choices: StoryChoiceDefinition[];
    shareFactsAcrossStories?: boolean;
}

export interface StoryWorldState {
    player?: {
        attributes?: Record<string, number>;
    };
    flags?: string[];
}

export interface StoryFlowRuntimeState {
    currentNodeId?: string;
    visitedNodeIds?: string[];
    selectedChoiceIds?: string[];
    storyState?: StoryState;
    worldState?: StoryWorldState;
}

export interface StoryNodeView {
    id: string;
    type: string;
    title: string;
    summary: string;
    detail: string;
    dialogues?: StoryDialogueLine[];
    subtitle: string;
    tags: string[];
    chapter?: string;
    location?: string;
    timeHint?: string;
    backgroundAsset?: string;
    sublocation?: string;
    locationId?: string;
    sublocationId?: string;
    onEnter?: StoryEffect[];
    worldPrecondition?: string;
    worldEffectHint?: string;
    aiHints?: StoryAiHints;
}

export interface StoryChoiceView {
    id: string;
    from: string;
    to: string;
    text: string;
    description: string | null;
    flags: string[];
    visible: boolean;
    recommended: boolean;
    recommendationReason: string | null;
    targetExists: boolean;
    selectable: boolean;
    disabledReason: string | null;
    conditionSummary: string;
    worldStateHint: string | null;
    effectSummary: string;
    visibleWhen?: StoryCondition;
    enabledWhen?: StoryCondition;
    effects: StoryEffect[];
    targetNodeOnEnter: StoryEffect[];
    battleTrigger: StoryBattleTrigger | null;
}

export interface StoryFlowViewModel {
    currentNodeId: string;
    currentNode: StoryNodeView;
    choices: StoryChoiceView[];
    statusText: string;
    warnings: string[];
    visitedNodeIds: string[];
    selectedChoiceIds: string[];
    storyState: StoryState;
    stateLine: string;
}

export type StoryChoiceTransition =
    | {
        status: 'selected';
        choiceId: string;
        fromNodeId: string;
        toNodeId: string;
        nextVisitedNodeIds: string[];
        nextSelectedChoiceIds: string[];
        nextStoryState: StoryState;
        battleLaunch: StoryBattleLaunchMetadata | null;
        appliedEffectKinds: StoryEffectKind[];
    }
    | {
        status: 'blocked';
        choiceId: string;
        reason: string;
    };

interface AttributeRecommendation {
    attribute: string;
    operator: string;
    threshold: number;
}

function appendUnique(items: string[], item: string): string[] {
    return items.includes(item) ? [...items] : [...items, item];
}

/** Reuse the same lookup across dialogue pages and choices in one loaded story. */
export interface StoryGraphIndex {
    graph: StoryGraphDefinition;
    nodesById: Map<string, StoryNodeDefinition>;
    choicesByNodeId: Map<string, StoryChoiceDefinition[]>;
}

export function indexStoryGraph(graph: StoryGraphDefinition): StoryGraphIndex {
    const choicesByNodeId = new Map<string, StoryChoiceDefinition[]>();
    for (const choice of graph.choices) {
        const choices = choicesByNodeId.get(choice.from);
        if (choices) choices.push(choice);
        else choicesByNodeId.set(choice.from, [choice]);
    }
    return {
        graph,
        nodesById: new Map(graph.nodes.map((node) => [node.id, node])),
        choicesByNodeId,
    };
}

function findNode(graph: StoryGraphDefinition, nodeId: string): StoryNodeDefinition | undefined {
    return graph.nodes.find((node) => node.id === nodeId);
}

function createStoryNodeView(node: StoryNodeDefinition): StoryNodeView {
    return {
        id: node.id,
        type: node.type,
        title: node.title,
        summary: node.summary,
        detail: node.detail,
        ...(node.dialogues ? { dialogues: node.dialogues.map(line => ({ ...line })) } : {}),
        subtitle: createNodeSubtitle(node),
        tags: [...node.tags],
        ...(node.chapter ? { chapter: node.chapter } : {}),
        ...(node.location ? { location: node.location } : {}),
        ...(node.timeHint ? { timeHint: node.timeHint } : {}),
        ...(node.backgroundAsset ? { backgroundAsset: node.backgroundAsset } : {}),
        ...(node.sublocation ? { sublocation: node.sublocation } : {}),
        ...(node.locationId ? { locationId: node.locationId } : {}),
        ...(node.sublocationId ? { sublocationId: node.sublocationId } : {}),
        ...(node.onEnter ? { onEnter: [...node.onEnter] } : {}),
        ...(node.worldPrecondition ? { worldPrecondition: node.worldPrecondition } : {}),
        ...(node.worldEffectHint ? { worldEffectHint: node.worldEffectHint } : {}),
        ...(node.aiHints ? { aiHints: cloneAiHints(node.aiHints) } : {}),
    };
}

function cloneAiHints(aiHints: StoryAiHints): StoryAiHints {
    return {
        ...(aiHints.tone ? { tone: aiHints.tone } : {}),
        ...(aiHints.theme ? { theme: [...aiHints.theme] } : {}),
        ...(aiHints.forbid ? { forbid: [...aiHints.forbid] } : {}),
    };
}

function createNodeSubtitle(node: StoryNodeDefinition): string {
    const parts = [node.chapter, node.location, node.sublocation, node.timeHint].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : '未标注章节 / 地点';
}

function getChoiceStoryEffects(choice: StoryChoiceDefinition): StoryEffect[] {
    return Array.isArray(choice.effects) ? [...choice.effects] : [];
}

function cloneStoryBattleTrigger(battle: StoryBattleTrigger): StoryBattleTrigger {
    return {
        ...battle,
        ...(battle.deterministicBattleSetup
            ? { deterministicBattleSetup: { ...battle.deterministicBattleSetup } }
            : {}),
    };
}

function findStoryBattleTrigger(effects: StoryEffect[]): StoryBattleTrigger | null {
    const battleEffect = effects.find((effect) => effect.kind === 'startBattle');

    return battleEffect?.kind === 'startBattle' ? cloneStoryBattleTrigger(battleEffect.battle) : null;
}

function createStoryBattleLaunchMetadata(params: {
    storyId: string;
    sourceNodeId: string;
    sourceChoiceId: string;
    targetNodeId: string;
    battle: StoryBattleTrigger;
}): StoryBattleLaunchMetadata {
    return {
        sceneKey: 'BattleScene',
        storyId: params.storyId,
        sourceNodeId: params.sourceNodeId,
        sourceChoiceId: params.sourceChoiceId,
        targetNodeId: params.targetNodeId,
        ...cloneStoryBattleTrigger(params.battle),
    };
}

function createChoiceView(
    choice: StoryChoiceDefinition,
    targetNode: StoryNodeDefinition | undefined,
    storyState: StoryState,
): StoryChoiceView {
    const choiceEffects = getChoiceStoryEffects(choice);
    const targetNodeOnEnter = targetNode?.onEnter ? [...targetNode.onEnter] : [];
    const targetExists = Boolean(targetNode);
    const visible = choice.visibleWhen ? evaluateStoryCondition(storyState, choice.visibleWhen) : true;
    const enabled = choice.enabledWhen ? evaluateStoryCondition(storyState, choice.enabledWhen) : true;
    const recommendation = evaluateRecommendation(choice.enabledWhen ?? choice.visibleWhen, choice.condition?.expression, storyState);
    const disabledReason = createDisabledReason({
        targetExists,
        visible,
        enabled,
        choice,
        storyState,
    });

    return {
        id: choice.id,
        from: choice.from,
        to: choice.to,
        text: choice.text,
        description: choice.description ?? null,
        flags: choice.flags ? [...choice.flags] : [],
        visible,
        recommended: recommendation.recommended,
        recommendationReason: recommendation.reason,
        targetExists,
        selectable: targetExists && visible && enabled,
        disabledReason,
        conditionSummary: createConditionSummary(choice, storyState),
        worldStateHint: choice.condition?.worldStateHint ?? null,
        effectSummary: createEffectSummary(choice.effects, storyState),
        ...(choice.visibleWhen ? { visibleWhen: choice.visibleWhen } : {}),
        ...(choice.enabledWhen ? { enabledWhen: choice.enabledWhen } : {}),
        effects: choiceEffects,
        targetNodeOnEnter,
        battleTrigger: findStoryBattleTrigger([...choiceEffects, ...targetNodeOnEnter]),
    };
}

function createEffectSummary(effects: StoryChoiceEffects | StoryEffect[] | undefined, storyState: StoryState): string {
    if (Array.isArray(effects)) {
        const labels = effects.flatMap((effect): string[] => {
            switch (effect.kind) {
                case 'once': return storyState.settledEventIds?.includes(effect.eventId)
                    ? ['此前已完成']
                    : [...effect.effects.flatMap(nested => createEffectSummary([nested], storyState).split(' · ')).filter(label => label !== '无状态变化。'), '仅首次'];
                case 'grantCard': return [`获得卡牌 ×${effect.count}`];
                case 'grantItem': return [`获得道具 ×${effect.count}`];
                case 'consumeItem': return [`消耗道具 ×${effect.count}`];
                case 'learnKnowledge': return ['获得线索'];
                case 'setQuestStage': return ['任务推进'];
                case 'startBattle': return ['进入战斗'];
                case 'adjustAttribute': return [`${effect.attribute}${effect.delta >= 0 ? '+' : ''}${effect.delta}`];
                case 'setAttribute': return [`${effect.attribute}变为${effect.value}`];
                case 'adjustRelation': return ['关系变化'];
                case 'setRelation': return ['关系变化'];
                case 'moveTo':
                case 'goToNode': return ['前往新地点'];
                default: return ['剧情变化'];
            }
        });
        return labels.length > 0 ? [...new Set(labels)].join(' · ') : '无状态变化。';
    }

    const parts = [effects?.worldChangeHint, effects?.relationChangeHint].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : '无明确后果提示。';
}

function createFallbackInitialStateSeed(
    graph: StoryGraphDefinition,
    nodeId: string,
): StoryInitialStateSeed {
    const node = findNode(graph, nodeId) ?? findNode(graph, graph.entryNodeId);

    return {
        storyId: graph.initialState?.storyId ?? graph.storyId ?? 'story-flow-view-model',
        locationId: node?.locationId ?? graph.initialState?.locationId ?? 'location.preview',
        sublocationId: node?.sublocationId ?? graph.initialState?.sublocationId ?? 'sublocation.preview',
        nodeId,
        visitedNodeIds: graph.initialState?.visitedNodeIds,
        triggeredDialogueIds: graph.initialState?.triggeredDialogueIds,
        flags: graph.initialState?.flags,
        attributes: graph.initialState?.attributes,
        relations: graph.initialState?.relations,
        knowledge: graph.initialState?.knowledge,
        questStages: graph.initialState?.questStages,
        settledEventIds: graph.initialState?.settledEventIds,
    };
}

function storyStateFromWorldState(
    storyState: StoryState,
    worldState: StoryWorldState | undefined,
): StoryState {
    if (!worldState) {
        return storyState;
    }

    return {
        ...storyState,
        flags: {
            ...storyState.flags,
            ...Object.fromEntries((worldState.flags ?? []).map((flag) => [flag, true])),
        },
        attributes: {
            ...storyState.attributes,
            ...(worldState.player?.attributes ?? {}),
        },
    };
}

function createRuntimeStoryState(
    graph: StoryGraphDefinition,
    state: StoryFlowRuntimeState,
    requestedNodeId: string,
): StoryState {
    if (state.storyState) {
        return state.storyState;
    }

    const initialState = createInitialStoryState(createFallbackInitialStateSeed(graph, requestedNodeId));
    const withRuntimeOverrides = {
        ...initialState,
        visitedNodeIds: state.visitedNodeIds
            ? appendUnique([...state.visitedNodeIds], requestedNodeId)
            : initialState.visitedNodeIds,
    };

    return storyStateFromWorldState(withRuntimeOverrides, state.worldState);
}

function createInitialStoryStateForGraph(graph: StoryGraphDefinition): StoryState {
    return createInitialStoryState(createFallbackInitialStateSeed(graph, graph.entryNodeId));
}

export function createInitialStoryRuntime(graph: StoryGraphDefinition): StoryState {
    const initialState = createInitialStoryStateForGraph(graph);
    const entryNode = findNode(graph, graph.entryNodeId);

    return applyStoryEffects(initialState, entryNode?.onEnter ?? []).state;
}

function createDisabledReason(params: {
    targetExists: boolean;
    visible: boolean;
    enabled: boolean;
    choice: StoryChoiceDefinition;
    storyState: StoryState;
}): string | null {
    if (!params.targetExists) {
        return `后续剧情节点未配置：${params.choice.to}`;
    }

    if (!params.visible && params.choice.visibleWhen) {
        return `条件未满足：${describeStructuredCondition(params.choice.visibleWhen, params.storyState)}`;
    }

    if (!params.enabled && params.choice.enabledWhen) {
        return `条件未满足：${describeStructuredCondition(params.choice.enabledWhen, params.storyState)}`;
    }

    return null;
}

function createConditionSummary(choice: StoryChoiceDefinition, storyState: StoryState): string {
    const structuredCondition = choice.enabledWhen ?? choice.visibleWhen;

    if (structuredCondition) {
        return describeStructuredCondition(structuredCondition, storyState);
    }

    return choice.condition?.expression ?? '无特殊条件。';
}

function describeStructuredCondition(condition: StoryCondition, storyState: StoryState): string {
    switch (condition.kind) {
        case 'always':
            return '无特殊条件。';
        case 'attribute': {
            const actual = getEffectiveStoryAttribute(storyState, condition.attribute);
            return actual !== undefined
                ? `${condition.attribute} ${actual} ${condition.operator} ${condition.value}`
                : `缺少属性 ${condition.attribute}`;
        }
        case 'relation':
            return Object.hasOwn(storyState.relations, condition.relationId)
                ? `关系 ${condition.relationId} ${storyState.relations[condition.relationId]} ${condition.operator} ${condition.value}`
                : `缺少关系 ${condition.relationId}`;
        case 'actorAbility': {
            const abilities = storyState.actorAbilities?.[condition.actorId];
            return abilities && Object.hasOwn(abilities, condition.ability)
                ? `${condition.actorId} 的${condition.ability} ${abilities[condition.ability]} ${condition.operator} ${condition.value}`
                : `缺少人物能力 ${condition.actorId} · ${condition.ability}`;
        }
        case 'itemCount':
            return `持有 ${condition.itemId} ×${storyState.itemCounts?.[condition.itemId] ?? 0} ${condition.operator} ${condition.value}`;
        case 'knowledge':
            return condition.expected === false
                ? `${condition.actorId} 尚不知道 ${condition.knowledgeId}`
                : `${condition.actorId} 已知道 ${condition.knowledgeId}`;
        case 'questStage':
            return `任务 ${condition.questId} 处于 ${condition.stage}`;
        case 'flag':
            return condition.expected === false
                ? `未设置标记 ${condition.flag}`
                : `需要标记 ${condition.flag}`;
        case 'visitedNode':
            return condition.expected === false
                ? `未访问节点 ${condition.nodeId}`
                : `需要访问节点 ${condition.nodeId}`;
        case 'triggeredDialogue':
            return condition.expected === false
                ? `未触发对话 ${condition.dialogueId}`
                : `需要触发对话 ${condition.dialogueId}`;
        case 'all':
            return condition.conditions.every(child => evaluateStoryCondition(storyState, child))
                ? '所有条件已满足'
                : condition.conditions.filter(child => !evaluateStoryCondition(storyState, child))
                    .map(child => describeStructuredCondition(child, storyState)).join('；');
        case 'any':
            return condition.conditions.some(child => evaluateStoryCondition(storyState, child))
                ? '已有可行条件'
                : `需要满足其一：${condition.conditions.map(child => describeStructuredCondition(child, storyState)).join('；')}`;
        case 'not':
            return `不能满足：${describeStructuredCondition(condition.condition, storyState)}`;
    }
}

function evaluateRecommendation(
    condition: StoryCondition | undefined,
    expression: string | undefined,
    storyState: StoryState,
): { recommended: boolean; reason: string | null } {
    const structuredRecommendation = condition ? getAttributeRecommendationFromCondition(condition) : null;

    if (structuredRecommendation) {
        return evaluateAttributeRecommendation(structuredRecommendation, storyState);
    }

    if (!expression?.includes('推荐')) {
        return { recommended: false, reason: null };
    }

    const recommendation = parseAttributeRecommendation(expression);

    if (!recommendation) {
        return { recommended: false, reason: `无法解析推荐条件：${expression}` };
    }

    return evaluateAttributeRecommendation(recommendation, storyState);
}

function getAttributeRecommendationFromCondition(condition: StoryCondition): AttributeRecommendation | null {
    if (condition.kind === 'attribute') {
        return {
            attribute: condition.attribute,
            operator: condition.operator,
            threshold: condition.value,
        };
    }

    return null;
}

function evaluateAttributeRecommendation(
    recommendation: AttributeRecommendation,
    storyState: StoryState,
): { recommended: boolean; reason: string | null } {
    const actualValue = getEffectiveStoryAttribute(storyState, recommendation.attribute);

    if (typeof actualValue !== 'number') {
        return {
            recommended: false,
            reason: `无法判断推荐条件：缺少属性 ${recommendation.attribute}。`,
        };
    }

    const passed = compareNumericValues(actualValue, recommendation.operator, recommendation.threshold);
    const normalizedOperator = normalizeOperatorForCopy(recommendation.operator);
    const prefix = passed ? '满足推荐条件' : '未满足推荐条件';

    return {
        recommended: passed,
        reason: `${prefix}：${recommendation.attribute} ${actualValue} ${normalizedOperator} ${recommendation.threshold}。`,
    };
}

function parseAttributeRecommendation(expression: string): AttributeRecommendation | null {
    const operatorPattern = '(≥|>=|≤|<=|>|<|==|=|＝)';
    const playerAttributeMatch = expression.match(
        new RegExp(`玩家([\\p{Script=Han}A-Za-z_][\\p{Script=Han}A-Za-z0-9_]*)\\s*${operatorPattern}\\s*(-?\\d+)`, 'u'),
    );
    const match = playerAttributeMatch ?? expression.match(
        new RegExp(`(?:^|[，,。；;\\s])([\\p{Script=Han}A-Za-z_][\\p{Script=Han}A-Za-z0-9_]*)\\s*${operatorPattern}\\s*(-?\\d+)`, 'u'),
    );

    if (!match) {
        return null;
    }

    return {
        attribute: match[1],
        operator: match[2],
        threshold: Number(match[3]),
    };
}

function normalizeOperatorForCopy(operator: string): string {
    switch (operator) {
        case '>=':
            return '≥';
        case '<=':
            return '≤';
        case '==':
        case '=':
        case '＝':
            return '=';
        default:
            return operator;
    }
}

function compareNumericValues(actual: number, operator: string, threshold: number): boolean {
    switch (operator) {
        case '≥':
        case '>=':
            return actual >= threshold;
        case '≤':
        case '<=':
            return actual <= threshold;
        case '>':
            return actual > threshold;
        case '<':
            return actual < threshold;
        case '==':
        case '=':
        case '＝':
            return actual === threshold;
        default:
            return false;
    }
}

function createStatusText(currentNode: StoryNodeView, choices: StoryChoiceView[]): string {
    const visibleChoiceCount = choices.filter((choice) => choice.visible).length;
    const recommendedChoiceCount = choices.filter((choice) => choice.visible && choice.recommended).length;

    return `当前剧情：${currentNode.title}（${currentNode.subtitle}）。可见选项 ${visibleChoiceCount} 个，推荐 ${recommendedChoiceCount} 个。`;
}

function createStateLine(storyState: StoryState): string {
    return `当前位置：${storyState.currentLocationId} / ${storyState.currentSublocationId}`;
}

export function createStoryFlowViewModel(
    graph: StoryGraphDefinition,
    state: StoryFlowRuntimeState = {},
    index?: StoryGraphIndex,
): StoryFlowViewModel {
    const indexed = index?.graph === graph ? index : indexStoryGraph(graph);
    const nodesById = indexed.nodesById;
    const requestedNodeId = state.currentNodeId ?? state.storyState?.currentNodeId ?? graph.entryNodeId;
    const entryNode = nodesById.get(graph.entryNodeId);
    const requestedNode = nodesById.get(requestedNodeId);
    const currentNode = requestedNode ?? entryNode;

    if (!currentNode) {
        throw new Error(`Story graph has no entry node: ${graph.entryNodeId}`);
    }

    const warnings = requestedNode
        ? []
        : [`当前剧情节点未配置：${requestedNodeId}，已回退到入口节点 ${currentNode.id}。`];
    const storyState = createRuntimeStoryState(graph, state, requestedNodeId);
    const currentStoryState = storyState.currentNodeId === currentNode.id
        ? storyState
        : goToStoryNode(storyState, currentNode.id);
    const choices = (indexed.choicesByNodeId.get(currentNode.id) ?? [])
        .map((choice) => {
            const targetNode = nodesById.get(choice.to);

            if (!targetNode) {
                warnings.push(`选项 ${choice.id} 指向未配置节点 ${choice.to}。`);
            }

            return createChoiceView(choice, targetNode, currentStoryState);
        });
    const currentNodeView = createStoryNodeView(currentNode);

    return {
        currentNodeId: currentNode.id,
        currentNode: currentNodeView,
        choices,
        statusText: createStatusText(currentNodeView, choices),
        warnings,
        visitedNodeIds: currentStoryState.visitedNodeIds,
        selectedChoiceIds: state.selectedChoiceIds ? [...state.selectedChoiceIds] : [],
        storyState: currentStoryState,
        stateLine: createStateLine(currentStoryState),
    };
}

export function createStoryChoiceTransition(
    viewModel: StoryFlowViewModel,
    choiceId: string,
): StoryChoiceTransition {
    const choice = viewModel.choices.find((candidate) => candidate.id === choiceId);

    if (!choice) {
        return {
            status: 'blocked',
            choiceId,
            reason: `选项不存在：${choiceId}`,
        };
    }

    if (!choice.visible) {
        return {
            status: 'blocked',
            choiceId,
            reason: `选项当前不可见：${choiceId}`,
        };
    }

    if (!choice.selectable) {
        return {
            status: 'blocked',
            choiceId,
            reason: choice.disabledReason ?? `选项当前不可选择：${choiceId}`,
        };
    }

    const choiceResult = applyStoryChoice(viewModel.storyState, {
        id: choice.id,
        condition: choice.enabledWhen,
        effects: choice.effects,
        nextNodeId: choice.to,
    });

    if (choiceResult.status === 'blocked') {
        return {
            status: 'blocked',
            choiceId,
            reason: choice.enabledWhen
                ? `条件未满足：${describeStructuredCondition(choice.enabledWhen, viewModel.storyState)}`
                : `选项当前不可选择：${choiceId}`,
        };
    }

    const enterResult = applyStoryEffects(choiceResult.state, choice.targetNodeOnEnter);
    const nextStoryState = enterResult.state;
    const pendingBattle = enterResult.pendingBattle ?? choiceResult.pendingBattle;

    return {
        status: 'selected',
        choiceId,
        fromNodeId: choice.from,
        toNodeId: nextStoryState.currentNodeId,
        nextVisitedNodeIds: nextStoryState.visitedNodeIds,
        nextSelectedChoiceIds: appendUnique(viewModel.selectedChoiceIds, choiceId),
        nextStoryState,
        battleLaunch: pendingBattle
            ? createStoryBattleLaunchMetadata({
                storyId: viewModel.storyState.storyId,
                sourceNodeId: choice.from,
                sourceChoiceId: choice.id,
                targetNodeId: nextStoryState.currentNodeId,
                battle: pendingBattle,
            })
            : null,
        appliedEffectKinds: [
            ...choiceResult.appliedEffectKinds,
            ...enterResult.appliedEffectKinds,
        ],
    };
}
