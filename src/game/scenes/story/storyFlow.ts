// StoryScene uses storyFlowViewModel for render/transition state. This module
// stays focused on strict validation of the UI-facing playable StoryState graph.

import type {
    StoryAttributeOperator,
    StoryBattleTrigger,
    StoryCondition,
    StoryEffect,
    StoryInitialStateSeed,
} from '../../types/story';
import type { DeterministicBattleSetup } from '../../types/battle';

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
    sublocation: string;
    locationId: string;
    sublocationId: string;
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

export interface StoryGraph {
    storyId: string;
    title: string;
    entryNodeId: string;
    initialState: StoryInitialStateSeed;
    nodes: StoryNode[];
    choices: StoryChoice[];
}

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

function readOptionalString(source: Record<string, unknown>, key: string, label: string): string | undefined {
    const value = source[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Story graph ${label}.${key} must be a non-empty string when provided.`);
    }

    return value;
}

function readRequiredNumber(source: Record<string, unknown>, key: string, label: string): number {
    const value = source[key];

    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`Story graph ${label}.${key} must be a number.`);
    }

    return value;
}

function readOptionalBoolean(source: Record<string, unknown>, key: string, label: string): boolean | undefined {
    const value = source[key];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'boolean') {
        throw new Error(`Story graph ${label}.${key} must be a boolean when provided.`);
    }

    return value;
}

function readStringArray(source: Record<string, unknown>, key: string, label: string): string[] {
    const value = source[key];

    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        throw new Error(`Story graph ${label}.${key} must be an array of non-empty strings.`);
    }

    return [...value] as string[];
}

function readOptionalStringArray(source: Record<string, unknown>, key: string, label: string): string[] | undefined {
    const value = source[key];

    if (value === undefined) {
        return undefined;
    }

    return readStringArray(source, key, label);
}

function readRecordArray(source: Record<string, unknown>, key: string, label: string): Record<string, unknown>[] {
    const value = source[key];

    if (!Array.isArray(value)) {
        throw new Error(`Story graph ${label}.${key} must be an array.`);
    }

    return value.map((entry, index) => {
        assertRecord(entry, `${label}.${key}[${index}]`);
        return entry;
    });
}

function readOptionalBooleanRecord(source: Record<string, unknown>, key: string, label: string): Record<string, boolean> | undefined {
    const value = source[key];

    if (value === undefined) {
        return undefined;
    }

    assertRecord(value, `${label}.${key}`);

    return Object.fromEntries(Object.entries(value).map(([recordKey, recordValue]) => {
        if (typeof recordValue !== 'boolean') {
            throw new Error(`Story graph ${label}.${key}.${recordKey} must be a boolean.`);
        }

        return [recordKey, recordValue];
    }));
}

function readOptionalNumberRecord(source: Record<string, unknown>, key: string, label: string): Record<string, number> | undefined {
    const value = source[key];

    if (value === undefined) {
        return undefined;
    }

    assertRecord(value, `${label}.${key}`);

    return Object.fromEntries(Object.entries(value).map(([recordKey, recordValue]) => {
        if (typeof recordValue !== 'number' || Number.isNaN(recordValue)) {
            throw new Error(`Story graph ${label}.${key}.${recordKey} must be a number.`);
        }

        return [recordKey, recordValue];
    }));
}

function parseAttributeOperator(value: unknown, label: string): StoryAttributeOperator {
    const operator = typeof value === 'string' ? value : '';
    const operators: StoryAttributeOperator[] = ['>', '>=', '<', '<=', '==', '!='];

    if (!operators.includes(operator as StoryAttributeOperator)) {
        throw new Error(`Story graph ${label} must be one of ${operators.join(', ')}.`);
    }

    return operator as StoryAttributeOperator;
}

function parseStoryCondition(value: unknown, label: string): StoryCondition {
    assertRecord(value, label);

    const kind = readRequiredString(value, 'kind', label);

    switch (kind) {
        case 'attribute':
            return {
                kind,
                attribute: readRequiredString(value, 'attribute', label),
                operator: parseAttributeOperator(value.operator, `${label}.operator`),
                value: readRequiredNumber(value, 'value', label),
            };
        case 'flag':
            return {
                kind,
                flag: readRequiredString(value, 'flag', label),
                expected: readOptionalBoolean(value, 'expected', label),
            };
        case 'visitedNode':
            return {
                kind,
                nodeId: readRequiredString(value, 'nodeId', label),
                expected: readOptionalBoolean(value, 'expected', label),
            };
        case 'triggeredDialogue':
            return {
                kind,
                dialogueId: readRequiredString(value, 'dialogueId', label),
                expected: readOptionalBoolean(value, 'expected', label),
            };
        case 'all':
        case 'any': {
            const conditions = readRecordArray(value, 'conditions', label).map((entry, index) =>
                parseStoryCondition(entry, `${label}.conditions[${index}]`),
            );

            if (conditions.length === 0) {
                throw new Error(`Story graph ${label}.conditions must not be empty.`);
            }

            return { kind, conditions };
        }
        case 'not':
            return {
                kind,
                condition: parseStoryCondition(value.condition, `${label}.condition`),
            };
        default:
            throw new Error(`Story graph ${label}.kind is unsupported: ${kind}.`);
    }
}

function parseOptionalStoryCondition(value: unknown, label: string): StoryCondition | undefined {
    if (value === undefined) {
        return undefined;
    }

    return parseStoryCondition(value, label);
}

function parseDeterministicBattleSetup(value: unknown, label: string): DeterministicBattleSetup | undefined {
    if (value === undefined) {
        return undefined;
    }

    assertRecord(value, label);

    const deckOrder = readRequiredString(value, 'deckOrder', label);

    if (deckOrder !== 'preserve-json-order') {
        throw new Error(
            `Story graph ${label}.deckOrder must be preserve-json-order when deterministic battle setup is provided.`,
        );
    }

    return { deckOrder };
}

function parseStoryBattleTrigger(value: unknown, label: string): StoryBattleTrigger {
    assertRecord(value, label);

    const encounterResourceId = readOptionalString(value, 'encounterResourceId', label);
    const deckResourceId = readOptionalString(value, 'deckResourceId', label);
    const deterministicBattleSetup = parseDeterministicBattleSetup(
        value.deterministicBattleSetup,
        `${label}.deterministicBattleSetup`,
    );
    const trigger: StoryBattleTrigger = {
        battleId: readRequiredString(value, 'battleId', label),
        ...(encounterResourceId ? { encounterResourceId } : {}),
        encounterId: readRequiredString(value, 'encounterId', label),
        encounterFile: readRequiredString(value, 'encounterFile', label),
        ...(deckResourceId ? { deckResourceId } : {}),
        deckFile: readRequiredString(value, 'deckFile', label),
        ...(deterministicBattleSetup ? { deterministicBattleSetup } : {}),
        onVictoryNodeId: readRequiredString(value, 'onVictoryNodeId', label),
        onDefeatNodeId: readRequiredString(value, 'onDefeatNodeId', label),
    };
    const launchText = readOptionalString(value, 'launchText', label);

    return launchText ? { ...trigger, launchText } : trigger;
}

function parseStoryEffect(value: unknown, label: string): StoryEffect {
    assertRecord(value, label);

    const kind = readRequiredString(value, 'kind', label);

    switch (kind) {
        case 'setFlag':
            return {
                kind,
                flag: readRequiredString(value, 'flag', label),
                value: readOptionalBoolean(value, 'value', label),
            };
        case 'clearFlag':
            return {
                kind,
                flag: readRequiredString(value, 'flag', label),
            };
        case 'recordVisitedNode':
            return {
                kind,
                nodeId: readRequiredString(value, 'nodeId', label),
            };
        case 'recordDialogue':
            return {
                kind,
                dialogueId: readRequiredString(value, 'dialogueId', label),
            };
        case 'setAttribute':
            return {
                kind,
                attribute: readRequiredString(value, 'attribute', label),
                value: readRequiredNumber(value, 'value', label),
            };
        case 'adjustAttribute':
            return {
                kind,
                attribute: readRequiredString(value, 'attribute', label),
                delta: readRequiredNumber(value, 'delta', label),
            };
        case 'setRelation':
            return {
                kind,
                relationId: readRequiredString(value, 'relationId', label),
                value: readRequiredNumber(value, 'value', label),
            };
        case 'adjustRelation':
            return {
                kind,
                relationId: readRequiredString(value, 'relationId', label),
                delta: readRequiredNumber(value, 'delta', label),
            };
        case 'moveTo': {
            const effect: StoryEffect = {
                kind,
                locationId: readRequiredString(value, 'locationId', label),
                sublocationId: readRequiredString(value, 'sublocationId', label),
            };
            const nodeId = readOptionalString(value, 'nodeId', label);

            return nodeId ? { ...effect, nodeId } : effect;
        }
        case 'goToNode':
            return {
                kind,
                nodeId: readRequiredString(value, 'nodeId', label),
            };
        case 'startBattle':
            return {
                kind,
                battle: parseStoryBattleTrigger(value.battle, `${label}.battle`),
            };
        default:
            throw new Error(`Story graph ${label}.kind is unsupported: ${kind}.`);
    }
}

function parseStoryEffects(value: unknown, label: string): StoryEffect[] {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value)) {
        throw new Error(`Story graph ${label} must be an array.`);
    }

    return value.map((entry, index) => parseStoryEffect(entry, `${label}[${index}]`));
}

function parseAiHints(value: unknown, label: string): StoryAiHints | undefined {
    if (value === undefined) {
        return undefined;
    }

    assertRecord(value, label);

    return {
        tone: readOptionalString(value, 'tone', label),
        theme: readOptionalStringArray(value, 'theme', label),
        forbid: readOptionalStringArray(value, 'forbid', label),
    };
}

function toStoryNode(rawNode: unknown, index: number): StoryNode {
    assertRecord(rawNode, `nodes[${index}]`);

    return {
        id: readRequiredString(rawNode, 'id', `nodes[${index}]`),
        type: 'story',
        title: readRequiredString(rawNode, 'title', `nodes[${index}]`),
        summary: readRequiredString(rawNode, 'summary', `nodes[${index}]`),
        detail: readRequiredString(rawNode, 'detail', `nodes[${index}]`),
        tags: readStringArray(rawNode, 'tags', `nodes[${index}]`),
        chapter: readRequiredString(rawNode, 'chapter', `nodes[${index}]`),
        location: readRequiredString(rawNode, 'location', `nodes[${index}]`),
        sublocation: readRequiredString(rawNode, 'sublocation', `nodes[${index}]`),
        locationId: readRequiredString(rawNode, 'locationId', `nodes[${index}]`),
        sublocationId: readRequiredString(rawNode, 'sublocationId', `nodes[${index}]`),
        timeHint: readRequiredString(rawNode, 'timeHint', `nodes[${index}]`),
        onEnter: parseStoryEffects(rawNode.onEnter, `nodes[${index}].onEnter`),
        aiHints: parseAiHints(rawNode.aiHints, `nodes[${index}].aiHints`),
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
        visibleWhen: parseOptionalStoryCondition(rawChoice.visibleWhen, `choices[${index}].visibleWhen`),
        enabledWhen: parseOptionalStoryCondition(rawChoice.enabledWhen, `choices[${index}].enabledWhen`),
        effects: parseStoryEffects(rawChoice.effects, `choices[${index}].effects`),
        flags: readStringArray(rawChoice, 'flags', `choices[${index}]`),
    };
}

function parseInitialState(
    rawState: unknown,
    params: { storyId: string; entryNodeId: string },
): StoryInitialStateSeed {
    assertRecord(rawState, 'initialState');

    return {
        storyId: params.storyId,
        locationId: readRequiredString(rawState, 'locationId', 'initialState'),
        sublocationId: readRequiredString(rawState, 'sublocationId', 'initialState'),
        nodeId: params.entryNodeId,
        visitedNodeIds: readOptionalStringArray(rawState, 'visitedNodeIds', 'initialState'),
        triggeredDialogueIds: readOptionalStringArray(rawState, 'triggeredDialogueIds', 'initialState'),
        flags: readOptionalBooleanRecord(rawState, 'flags', 'initialState'),
        attributes: readOptionalNumberRecord(rawState, 'attributes', 'initialState'),
        relations: readOptionalNumberRecord(rawState, 'relations', 'initialState'),
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

function assertBattleResultNodeExists(
    nodeIds: Set<string>,
    nodeId: string,
    label: string,
): void {
    if (!nodeIds.has(nodeId)) {
        throw new Error(`Story graph ${label} must reference an existing node: ${nodeId}`);
    }
}

function validateStoryBattleTriggers(
    effects: StoryEffect[],
    label: string,
    nodeIds: Set<string>,
): void {
    effects.forEach((effect, index) => {
        if (effect.kind !== 'startBattle') {
            return;
        }

        assertBattleResultNodeExists(
            nodeIds,
            effect.battle.onVictoryNodeId,
            `${label}[${index}].battle.onVictoryNodeId`,
        );
        assertBattleResultNodeExists(
            nodeIds,
            effect.battle.onDefeatNodeId,
            `${label}[${index}].battle.onDefeatNodeId`,
        );
    });
}

export function validatePlayableStoryGraph(rawGraph: unknown): StoryGraph {
    assertRecord(rawGraph, 'root');

    const storyId = readRequiredString(rawGraph, 'storyId', 'root');
    const title = readRequiredString(rawGraph, 'title', 'root');
    const entryNodeId = readRequiredString(rawGraph, 'entryNodeId', 'root');
    const nodes = readRecordArray(rawGraph, 'nodes', 'root').map(toStoryNode);
    const choices = readRecordArray(rawGraph, 'choices', 'root').map(toStoryChoice);
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

    nodes.forEach((node, index) => {
        validateStoryBattleTriggers(node.onEnter, `nodes[${index}].onEnter`, nodeIds);
    });
    choices.forEach((choice, index) => {
        validateStoryBattleTriggers(choice.effects, `choices[${index}].effects`, nodeIds);
    });

    return {
        storyId,
        title,
        entryNodeId,
        initialState: parseInitialState(rawGraph.initialState, { storyId, entryNodeId }),
        nodes,
        choices,
    };
}
