import storyGraphJson from '../../../public/data/story/story-graph.executable.json';

export type StoryNodeType = 'story' | 'gate' | 'encounter' | 'terminal';

export type StoryCondition =
    | { op: 'always' }
    | { op: 'hasFlag'; flag: string }
    | { op: 'missingFlag'; flag: string }
    | { op: 'attributeAtLeast'; path: string; value: number }
    | { op: 'tagPresent'; path: 'player.tags'; tag: string }
    | { op: 'tagMissing'; path: 'player.tags'; tag: string }
    | { op: 'all'; conditions: StoryCondition[] }
    | { op: 'any'; conditions: StoryCondition[] }
    | { op: 'not'; condition: StoryCondition };

export type StoryEffect =
    | { op: 'setFlag'; flag: string }
    | { op: 'clearFlag'; flag: string }
    | { op: 'adjustAttribute'; path: string; amount: number }
    | { op: 'addTag'; path: 'player.tags'; tag: string }
    | { op: 'removeTag'; path: 'player.tags'; tag: string }
    | { op: 'adjustRelation'; npcId: string; amount: number }
    | { op: 'setLocation'; location: string }
    | { op: 'startExpedition'; expeditionId: string; mapId?: string };

export interface StoryAiHints {
    tone?: string;
    theme?: string[];
    forbid?: string[];
}

export interface StoryNode {
    id: string;
    type: StoryNodeType;
    title: string;
    summary: string;
    body: string;
    tags: string[];
    chapter: string;
    location: string;
    timeHint: string;
    onEnter: StoryEffect[];
    aiHints?: StoryAiHints;
}

export interface StoryChoice {
    id: string;
    from: string;
    to: string;
    text: string;
    description: string;
    visibleWhen?: StoryCondition;
    enabledWhen?: StoryCondition;
    effects: StoryEffect[];
    flags: string[];
}

export interface StoryContentGraph {
    schemaVersion: 1;
    id: string;
    title: string;
    entryNodeId: string;
    nodes: StoryNode[];
    choices: StoryChoice[];
}

export interface StoryRuntimeState {
    flags: string[];
    location?: string;
    player?: {
        attributes?: Record<string, number>;
        tags?: string[];
    };
    relations?: Record<string, number>;
    pendingExpedition?: {
        expeditionId: string;
        mapId?: string;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object.`);
    }

    return value;
}

function expectString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }

    return value;
}

function expectNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`${label} must be a number.`);
    }

    return value;
}

function expectLiteral<T extends string | number>(value: unknown, expected: T, label: string): T {
    if (value !== expected) {
        throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
    }

    return expected;
}

function expectStringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        throw new Error(`${label} must be an array of non-empty strings.`);
    }

    return value;
}

function expectRecordArray(value: unknown, label: string): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        throw new Error(`${label} must be an array.`);
    }

    return value.map((entry, index) => expectRecord(entry, `${label}[${index}]`));
}

function parseOptionalStringArray(value: unknown, label: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    return expectStringArray(value, label);
}

function parseStoryNodeType(value: unknown, label: string): StoryNodeType {
    const parsed = expectString(value, label);
    const allowedTypes: StoryNodeType[] = ['story', 'gate', 'encounter', 'terminal'];

    if (!allowedTypes.includes(parsed as StoryNodeType)) {
        throw new Error(`${label} must be one of ${allowedTypes.join(', ')}.`);
    }

    return parsed as StoryNodeType;
}

function parsePlayerTagsPath(value: unknown, label: string): 'player.tags' {
    return expectLiteral(value, 'player.tags', label);
}

function parseAttributePath(value: unknown, label: string): string {
    const path = expectString(value, label);

    if (!path.startsWith('player.attributes.')) {
        throw new Error(`${label} must start with "player.attributes.".`);
    }

    return path;
}

function parseStoryCondition(value: unknown, label: string): StoryCondition {
    const record = expectRecord(value, label);
    const op = expectString(record.op, `${label}.op`);

    switch (op) {
        case 'always':
            return { op };
        case 'hasFlag':
        case 'missingFlag':
            return { op, flag: expectString(record.flag, `${label}.flag`) };
        case 'attributeAtLeast':
            return {
                op,
                path: parseAttributePath(record.path, `${label}.path`),
                value: expectNumber(record.value, `${label}.value`),
            };
        case 'tagPresent':
        case 'tagMissing':
            return {
                op,
                path: parsePlayerTagsPath(record.path, `${label}.path`),
                tag: expectString(record.tag, `${label}.tag`),
            };
        case 'all':
        case 'any': {
            const conditions = expectRecordArray(record.conditions, `${label}.conditions`).map((entry, index) =>
                parseStoryCondition(entry, `${label}.conditions[${index}]`),
            );

            if (conditions.length === 0) {
                throw new Error(`${label}.conditions must contain at least one condition.`);
            }

            return { op, conditions };
        }
        case 'not':
            return {
                op,
                condition: parseStoryCondition(record.condition, `${label}.condition`),
            };
        default:
            throw new Error(`${label}.op "${op}" is not a supported story condition operation.`);
    }
}

function parseOptionalStoryCondition(value: unknown, label: string): StoryCondition | undefined {
    if (value === undefined) {
        return undefined;
    }

    return parseStoryCondition(value, label);
}

function parseStoryEffect(value: unknown, label: string): StoryEffect {
    const record = expectRecord(value, label);
    const op = expectString(record.op, `${label}.op`);

    switch (op) {
        case 'setFlag':
        case 'clearFlag':
            return { op, flag: expectString(record.flag, `${label}.flag`) };
        case 'adjustAttribute':
            return {
                op,
                path: parseAttributePath(record.path, `${label}.path`),
                amount: expectNumber(record.amount, `${label}.amount`),
            };
        case 'addTag':
        case 'removeTag':
            return {
                op,
                path: parsePlayerTagsPath(record.path, `${label}.path`),
                tag: expectString(record.tag, `${label}.tag`),
            };
        case 'adjustRelation':
            return {
                op,
                npcId: expectString(record.npcId, `${label}.npcId`),
                amount: expectNumber(record.amount, `${label}.amount`),
            };
        case 'setLocation':
            return {
                op,
                location: expectString(record.location, `${label}.location`),
            };
        case 'startExpedition': {
            const effect: StoryEffect = {
                op,
                expeditionId: expectString(record.expeditionId, `${label}.expeditionId`),
            };

            if (record.mapId !== undefined) {
                return {
                    ...effect,
                    mapId: expectString(record.mapId, `${label}.mapId`),
                };
            }

            return effect;
        }
        default:
            throw new Error(`${label}.op "${op}" is not a supported story effect operation.`);
    }
}

function parseStoryEffects(value: unknown, label: string): StoryEffect[] {
    if (value === undefined) {
        return [];
    }

    return expectRecordArray(value, label).map((entry, index) => parseStoryEffect(entry, `${label}[${index}]`));
}

function parseAiHints(value: unknown, label: string): StoryAiHints | undefined {
    if (value === undefined) {
        return undefined;
    }

    const record = expectRecord(value, label);
    const hints: StoryAiHints = {};

    if (record.tone !== undefined) {
        hints.tone = expectString(record.tone, `${label}.tone`);
    }

    const theme = parseOptionalStringArray(record.theme, `${label}.theme`);
    if (theme) {
        hints.theme = theme;
    }

    const forbid = parseOptionalStringArray(record.forbid, `${label}.forbid`);
    if (forbid) {
        hints.forbid = forbid;
    }

    return hints;
}

function parseStoryNode(value: unknown, label: string): StoryNode {
    const record = expectRecord(value, label);

    return {
        id: expectString(record.id, `${label}.id`),
        type: parseStoryNodeType(record.type, `${label}.type`),
        title: expectString(record.title, `${label}.title`),
        summary: expectString(record.summary, `${label}.summary`),
        body: expectString(record.body, `${label}.body`),
        tags: expectStringArray(record.tags, `${label}.tags`),
        chapter: expectString(record.chapter, `${label}.chapter`),
        location: expectString(record.location, `${label}.location`),
        timeHint: expectString(record.timeHint, `${label}.timeHint`),
        onEnter: parseStoryEffects(record.onEnter, `${label}.onEnter`),
        aiHints: parseAiHints(record.aiHints, `${label}.aiHints`),
    };
}

function parseStoryChoice(value: unknown, label: string): StoryChoice {
    const record = expectRecord(value, label);

    return {
        id: expectString(record.id, `${label}.id`),
        from: expectString(record.from, `${label}.from`),
        to: expectString(record.to, `${label}.to`),
        text: expectString(record.text, `${label}.text`),
        description: expectString(record.description, `${label}.description`),
        visibleWhen: parseOptionalStoryCondition(record.visibleWhen, `${label}.visibleWhen`),
        enabledWhen: parseOptionalStoryCondition(record.enabledWhen, `${label}.enabledWhen`),
        effects: parseStoryEffects(record.effects, `${label}.effects`),
        flags: expectStringArray(record.flags, `${label}.flags`),
    };
}

function assertUniqueIds(entries: Array<{ id: string }>, label: string): void {
    const seen = new Set<string>();

    for (const entry of entries) {
        if (seen.has(entry.id)) {
            throw new Error(`Duplicate ${label} id "${entry.id}".`);
        }

        seen.add(entry.id);
    }
}

export function validateStoryContentGraph(value: unknown): StoryContentGraph {
    const record = expectRecord(value, 'storyGraph');
    const nodes = expectRecordArray(record.nodes, 'storyGraph.nodes').map((entry, index) =>
        parseStoryNode(entry, `storyGraph.nodes[${index}]`),
    );
    const choices = expectRecordArray(record.choices, 'storyGraph.choices').map((entry, index) =>
        parseStoryChoice(entry, `storyGraph.choices[${index}]`),
    );

    if (nodes.length === 0) {
        throw new Error('storyGraph.nodes must contain at least one node.');
    }

    assertUniqueIds(nodes, 'story node');
    assertUniqueIds(choices, 'story choice');

    const nodeIds = new Set(nodes.map((node) => node.id));
    const entryNodeId = expectString(record.entryNodeId, 'storyGraph.entryNodeId');

    if (!nodeIds.has(entryNodeId)) {
        throw new Error(`storyGraph.entryNodeId "${entryNodeId}" must reference an existing story node.`);
    }

    for (const choice of choices) {
        if (!nodeIds.has(choice.from)) {
            throw new Error(`story choice "${choice.id}" references missing from node "${choice.from}".`);
        }

        if (!nodeIds.has(choice.to)) {
            throw new Error(`story choice "${choice.id}" references missing to node "${choice.to}".`);
        }
    }

    return {
        schemaVersion: expectLiteral(record.schemaVersion, 1, 'storyGraph.schemaVersion'),
        id: expectString(record.id, 'storyGraph.id'),
        title: expectString(record.title, 'storyGraph.title'),
        entryNodeId,
        nodes,
        choices,
    };
}

function getPlayerAttribute(state: StoryRuntimeState, path: string): number {
    const attributeName = path.slice('player.attributes.'.length);
    const value = state.player?.attributes?.[attributeName];

    return typeof value === 'number' ? value : 0;
}

function hasPlayerTag(state: StoryRuntimeState, tag: string): boolean {
    return state.player?.tags?.includes(tag) ?? false;
}

export function evaluateStoryCondition(condition: StoryCondition, state: StoryRuntimeState): boolean {
    switch (condition.op) {
        case 'always':
            return true;
        case 'hasFlag':
            return state.flags.includes(condition.flag);
        case 'missingFlag':
            return !state.flags.includes(condition.flag);
        case 'attributeAtLeast':
            return getPlayerAttribute(state, condition.path) >= condition.value;
        case 'tagPresent':
            return hasPlayerTag(state, condition.tag);
        case 'tagMissing':
            return !hasPlayerTag(state, condition.tag);
        case 'all':
            return condition.conditions.every((entry) => evaluateStoryCondition(entry, state));
        case 'any':
            return condition.conditions.some((entry) => evaluateStoryCondition(entry, state));
        case 'not':
            return !evaluateStoryCondition(condition.condition, state);
    }
}

function cloneStoryRuntimeState(state: StoryRuntimeState): StoryRuntimeState {
    return {
        flags: [...state.flags],
        location: state.location,
        player: {
            attributes: { ...(state.player?.attributes ?? {}) },
            tags: [...(state.player?.tags ?? [])],
        },
        relations: { ...(state.relations ?? {}) },
        pendingExpedition: state.pendingExpedition ? { ...state.pendingExpedition } : undefined,
    };
}

function addUnique(values: string[], value: string): string[] {
    return values.includes(value) ? values : [...values, value];
}

function applyStoryEffect(effect: StoryEffect, state: StoryRuntimeState): void {
    switch (effect.op) {
        case 'setFlag':
            state.flags = addUnique(state.flags, effect.flag);
            break;
        case 'clearFlag':
            state.flags = state.flags.filter((flag) => flag !== effect.flag);
            break;
        case 'adjustAttribute': {
            const attributeName = effect.path.slice('player.attributes.'.length);
            const player = (state.player ??= {});
            const attributes = (player.attributes ??= {});

            attributes[attributeName] = (attributes[attributeName] ?? 0) + effect.amount;
            break;
        }
        case 'addTag': {
            const player = (state.player ??= {});
            player.tags = addUnique(player.tags ?? [], effect.tag);
            break;
        }
        case 'removeTag':
            if (state.player?.tags) {
                state.player.tags = state.player.tags.filter((tag) => tag !== effect.tag);
            }
            break;
        case 'adjustRelation': {
            const relations = (state.relations ??= {});
            relations[effect.npcId] = (relations[effect.npcId] ?? 0) + effect.amount;
            break;
        }
        case 'setLocation':
            state.location = effect.location;
            break;
        case 'startExpedition':
            state.pendingExpedition = {
                expeditionId: effect.expeditionId,
                mapId: effect.mapId,
            };
            break;
    }
}

export function applyStoryEffects(effects: StoryEffect[], state: StoryRuntimeState): StoryRuntimeState {
    const nextState = cloneStoryRuntimeState(state);

    for (const effect of effects) {
        applyStoryEffect(effect, nextState);
    }

    return nextState;
}

export const mainlineStoryGraph = validateStoryContentGraph(storyGraphJson);
