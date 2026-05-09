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
    tags: string[];
    chapter?: string;
    location?: string;
    timeHint?: string;
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
    effects?: StoryChoiceEffects;
    flags?: string[];
}

export interface StoryGraphDefinition {
    entryNodeId: string;
    nodes: StoryNodeDefinition[];
    choices: StoryChoiceDefinition[];
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
    worldState?: StoryWorldState;
}

export interface StoryNodeView {
    id: string;
    type: string;
    title: string;
    summary: string;
    detail: string;
    subtitle: string;
    tags: string[];
    chapter?: string;
    location?: string;
    timeHint?: string;
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
}

export interface StoryFlowViewModel {
    currentNodeId: string;
    currentNode: StoryNodeView;
    choices: StoryChoiceView[];
    statusText: string;
    warnings: string[];
    visitedNodeIds: string[];
    selectedChoiceIds: string[];
}

export type StoryChoiceTransition =
    | {
        status: 'selected';
        choiceId: string;
        fromNodeId: string;
        toNodeId: string;
        nextVisitedNodeIds: string[];
        nextSelectedChoiceIds: string[];
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

function createNodeIndex(graph: StoryGraphDefinition): Map<string, StoryNodeDefinition> {
    return new Map(graph.nodes.map((node) => [node.id, node]));
}

function createStoryNodeView(node: StoryNodeDefinition): StoryNodeView {
    return {
        id: node.id,
        type: node.type,
        title: node.title,
        summary: node.summary,
        detail: node.detail,
        subtitle: createNodeSubtitle(node),
        tags: [...node.tags],
        ...(node.chapter ? { chapter: node.chapter } : {}),
        ...(node.location ? { location: node.location } : {}),
        ...(node.timeHint ? { timeHint: node.timeHint } : {}),
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
    const parts = [node.chapter, node.location, node.timeHint].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : '未标注章节 / 地点';
}

function createChoiceView(
    choice: StoryChoiceDefinition,
    targetExists: boolean,
    worldState: StoryWorldState | undefined,
): StoryChoiceView {
    const recommendation = evaluateRecommendation(choice.condition?.expression, worldState);
    const disabledReason = targetExists ? null : `后续剧情节点未配置：${choice.to}`;

    return {
        id: choice.id,
        from: choice.from,
        to: choice.to,
        text: choice.text,
        description: choice.description ?? null,
        flags: choice.flags ? [...choice.flags] : [],
        visible: true,
        recommended: recommendation.recommended,
        recommendationReason: recommendation.reason,
        targetExists,
        selectable: targetExists,
        disabledReason,
        conditionSummary: choice.condition?.expression ?? '无特殊条件。',
        worldStateHint: choice.condition?.worldStateHint ?? null,
        effectSummary: createEffectSummary(choice.effects),
    };
}

function createEffectSummary(effects: StoryChoiceEffects | undefined): string {
    const parts = [effects?.worldChangeHint, effects?.relationChangeHint].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : '无明确后果提示。';
}

function evaluateRecommendation(
    expression: string | undefined,
    worldState: StoryWorldState | undefined,
): { recommended: boolean; reason: string | null } {
    if (!expression?.includes('推荐')) {
        return { recommended: false, reason: null };
    }

    const recommendation = parseAttributeRecommendation(expression);

    if (!recommendation) {
        return { recommended: false, reason: `无法解析推荐条件：${expression}` };
    }

    const actualValue = worldState?.player?.attributes?.[recommendation.attribute];

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

function appendUnique(items: string[], item: string): string[] {
    return items.includes(item) ? [...items] : [...items, item];
}

export function createStoryFlowViewModel(
    graph: StoryGraphDefinition,
    state: StoryFlowRuntimeState = {},
): StoryFlowViewModel {
    const nodesById = createNodeIndex(graph);
    const requestedNodeId = state.currentNodeId ?? graph.entryNodeId;
    const entryNode = nodesById.get(graph.entryNodeId);
    const requestedNode = nodesById.get(requestedNodeId);
    const currentNode = requestedNode ?? entryNode;

    if (!currentNode) {
        throw new Error(`Story graph has no entry node: ${graph.entryNodeId}`);
    }

    const warnings = requestedNode
        ? []
        : [`当前剧情节点未配置：${requestedNodeId}，已回退到入口节点 ${currentNode.id}。`];
    const choices = graph.choices
        .filter((choice) => choice.from === currentNode.id)
        .map((choice) => {
            const targetExists = nodesById.has(choice.to);

            if (!targetExists) {
                warnings.push(`选项 ${choice.id} 指向未配置节点 ${choice.to}。`);
            }

            return createChoiceView(choice, targetExists, state.worldState);
        });
    const currentNodeView = createStoryNodeView(currentNode);

    return {
        currentNodeId: currentNode.id,
        currentNode: currentNodeView,
        choices,
        statusText: createStatusText(currentNodeView, choices),
        warnings,
        visitedNodeIds: state.visitedNodeIds ? [...state.visitedNodeIds] : [currentNode.id],
        selectedChoiceIds: state.selectedChoiceIds ? [...state.selectedChoiceIds] : [],
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

    return {
        status: 'selected',
        choiceId,
        fromNodeId: choice.from,
        toNodeId: choice.to,
        nextVisitedNodeIds: appendUnique(viewModel.visitedNodeIds, choice.to),
        nextSelectedChoiceIds: appendUnique(viewModel.selectedChoiceIds, choiceId),
    };
}
