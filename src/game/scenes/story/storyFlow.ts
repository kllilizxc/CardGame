export interface StoryAiHints {
    tone?: string;
    theme?: string[];
    forbid?: string[];
}

export interface StoryNode {
    id: string;
    type: 'story';
    title: string;
    summary: string;
    detail: string;
    tags: string[];
    chapter: string;
    location: string;
    timeHint: string;
    worldPrecondition?: string;
    worldEffectHint?: string;
    aiHints?: StoryAiHints;
}

export interface StoryChoice {
    id: string;
    from: string;
    to: string;
    text: string;
    description: string;
    condition?: {
        expression: string;
        worldStateHint?: string;
    };
    effects?: {
        worldChangeHint?: string;
        relationChangeHint?: string;
    };
    flags: string[];
}

export interface StoryGraph {
    entryNodeId: string;
    nodes: StoryNode[];
    choices: StoryChoice[];
}

export interface StoryNodeView {
    node: StoryNode;
    choices: StoryChoice[];
    metadataLine: string;
    tagLine: string;
    isTerminal: boolean;
}

export type StoryChoiceResult =
    | {
        status: 'advanced';
        choice: StoryChoice;
        view: StoryNodeView;
        statusText: string;
    }
    | {
        status: 'invalid-choice';
        currentNodeId: string;
        statusText: string;
    };

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`Story graph ${label} must be an object.`);
    }
}

function readRequiredString(source: Record<string, unknown>, key: string, label: string): string {
    const value = source[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Story graph ${label}.${key} must be a non-empty string.`);
    }

    return value;
}

function readStringArray(source: Record<string, unknown>, key: string): string[] {
    const value = source[key];

    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string');
}

function toStoryNode(rawNode: unknown, index: number): StoryNode {
    assertRecord(rawNode, `nodes[${index}]`);

    return {
        id: readRequiredString(rawNode, 'id', `nodes[${index}]`),
        type: 'story',
        title: readRequiredString(rawNode, 'title', `nodes[${index}]`),
        summary: readRequiredString(rawNode, 'summary', `nodes[${index}]`),
        detail: readRequiredString(rawNode, 'detail', `nodes[${index}]`),
        tags: readStringArray(rawNode, 'tags'),
        chapter: readRequiredString(rawNode, 'chapter', `nodes[${index}]`),
        location: readRequiredString(rawNode, 'location', `nodes[${index}]`),
        timeHint: readRequiredString(rawNode, 'timeHint', `nodes[${index}]`),
        worldPrecondition: typeof rawNode.worldPrecondition === 'string' ? rawNode.worldPrecondition : undefined,
        worldEffectHint: typeof rawNode.worldEffectHint === 'string' ? rawNode.worldEffectHint : undefined,
        aiHints: typeof rawNode.aiHints === 'object' && rawNode.aiHints !== null
            ? rawNode.aiHints as StoryAiHints
            : undefined,
    };
}

function toStoryChoice(rawChoice: unknown, index: number): StoryChoice {
    assertRecord(rawChoice, `choices[${index}]`);

    return {
        id: readRequiredString(rawChoice, 'id', `choices[${index}]`),
        from: readRequiredString(rawChoice, 'from', `choices[${index}]`),
        to: readRequiredString(rawChoice, 'to', `choices[${index}]`),
        text: readRequiredString(rawChoice, 'text', `choices[${index}]`),
        description: readRequiredString(rawChoice, 'description', `choices[${index}]`),
        condition: typeof rawChoice.condition === 'object' && rawChoice.condition !== null
            ? rawChoice.condition as StoryChoice['condition']
            : undefined,
        effects: typeof rawChoice.effects === 'object' && rawChoice.effects !== null
            ? rawChoice.effects as StoryChoice['effects']
            : undefined,
        flags: readStringArray(rawChoice, 'flags'),
    };
}

function assertUniqueIds(ids: string[], label: string): void {
    const seen = new Set<string>();

    for (const id of ids) {
        if (seen.has(id)) {
            throw new Error(`Story graph ${label} contains duplicate id: ${id}`);
        }

        seen.add(id);
    }
}

export function validatePlayableStoryGraph(rawGraph: unknown): StoryGraph {
    assertRecord(rawGraph, 'root');

    const entryNodeId = readRequiredString(rawGraph, 'entryNodeId', 'root');

    if (!Array.isArray(rawGraph.nodes)) {
        throw new Error('Story graph nodes must be an array.');
    }

    if (!Array.isArray(rawGraph.choices)) {
        throw new Error('Story graph choices must be an array.');
    }

    const nodes = rawGraph.nodes.map(toStoryNode);
    const choices = rawGraph.choices.map(toStoryChoice);
    const nodeIds = new Set(nodes.map((node) => node.id));

    assertUniqueIds(nodes.map((node) => node.id), 'nodes');
    assertUniqueIds(choices.map((choice) => choice.id), 'choices');

    if (!nodeIds.has(entryNodeId)) {
        throw new Error(`Story graph entryNodeId does not exist: ${entryNodeId}`);
    }

    for (const choice of choices) {
        if (!nodeIds.has(choice.from)) {
            throw new Error(`Story graph choice ${choice.id} starts from missing node: ${choice.from}`);
        }

        if (!nodeIds.has(choice.to)) {
            throw new Error(`Story graph choice ${choice.id} points to missing node: ${choice.to}`);
        }
    }

    return {
        entryNodeId,
        nodes,
        choices,
    };
}

export function createStoryNodeView(graph: StoryGraph, nodeId: string): StoryNodeView {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);

    if (!node) {
        throw new Error(`Story node does not exist: ${nodeId}`);
    }

    const choices = graph.choices.filter((choice) => choice.from === nodeId);
    const metadataLine = [node.chapter, node.location, node.timeHint].filter(Boolean).join(' · ');

    return {
        node,
        choices,
        metadataLine,
        tagLine: node.tags.join(' / '),
        isTerminal: choices.length === 0,
    };
}

export function chooseStoryChoice(
    graph: StoryGraph,
    currentNodeId: string,
    choiceId: string,
): StoryChoiceResult {
    const choice = graph.choices.find((candidate) =>
        candidate.from === currentNodeId && candidate.id === choiceId,
    );

    if (!choice) {
        return {
            status: 'invalid-choice',
            currentNodeId,
            statusText: `该选择不可用：${choiceId}`,
        };
    }

    return {
        status: 'advanced',
        choice,
        view: createStoryNodeView(graph, choice.to),
        statusText: `已选择：${choice.text}`,
    };
}
