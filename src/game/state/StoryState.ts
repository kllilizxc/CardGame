import type {
    ApplyStoryChoiceResult,
    ApplyStoryEffectsResult,
    StoryAttributeOperator,
    StoryBattleTrigger,
    StoryChoiceRuntimeDefinition,
    StoryCondition,
    StoryEffect,
    StoryEffectKind,
    StoryInitialStateSeed,
    StoryState,
} from '../types/story';

function appendUnique(values: string[], value: string): string[] {
    return values.includes(value) ? [...values] : [...values, value];
}

function cloneNumberMap(values: Record<string, number> | undefined): Record<string, number> {
    return { ...(values ?? {}) };
}

function cloneFlagMap(values: Record<string, boolean> | undefined): Record<string, boolean> {
    return { ...(values ?? {}) };
}

function cloneStoryBattleTrigger(battle: StoryBattleTrigger): StoryBattleTrigger {
    return {
        ...battle,
        ...(battle.deterministicBattleSetup
            ? { deterministicBattleSetup: { ...battle.deterministicBattleSetup } }
            : {}),
    };
}

function compareNumber(left: number, operator: StoryAttributeOperator, right: number): boolean {
    switch (operator) {
        case '>':
            return left > right;
        case '>=':
            return left >= right;
        case '<':
            return left < right;
        case '<=':
            return left <= right;
        case '==':
            return left === right;
        case '!=':
            return left !== right;
    }
}

function expectBooleanPresence(actual: boolean, expected: boolean | undefined): boolean {
    return actual === (expected ?? true);
}

function unsupportedStoryCondition(condition: never): never {
    throw new Error(`Unsupported story condition kind: ${JSON.stringify(condition)}`);
}

function unsupportedStoryEffect(effect: never): never {
    throw new Error(`Unsupported story effect kind: ${JSON.stringify(effect)}`);
}

export function createInitialStoryState(seed: StoryInitialStateSeed): StoryState {
    const visitedNodeIds = appendUnique(seed.visitedNodeIds ?? [], seed.nodeId);

    return {
        storyId: seed.storyId,
        currentLocationId: seed.locationId,
        currentSublocationId: seed.sublocationId,
        currentNodeId: seed.nodeId,
        visitedNodeIds,
        triggeredDialogueIds: [...(seed.triggeredDialogueIds ?? [])],
        flags: cloneFlagMap(seed.flags),
        attributes: cloneNumberMap(seed.attributes),
        relations: cloneNumberMap(seed.relations),
    };
}

export function markStoryNodeVisited(state: StoryState, nodeId: string): StoryState {
    return {
        ...state,
        visitedNodeIds: appendUnique(state.visitedNodeIds, nodeId),
    };
}

export function markDialogueTriggered(state: StoryState, dialogueId: string): StoryState {
    return {
        ...state,
        triggeredDialogueIds: appendUnique(state.triggeredDialogueIds, dialogueId),
    };
}

export function setStoryFlag(state: StoryState, flag: string, value = true): StoryState {
    return {
        ...state,
        flags: {
            ...state.flags,
            [flag]: value,
        },
    };
}

export function clearStoryFlag(state: StoryState, flag: string): StoryState {
    const { [flag]: _removed, ...remainingFlags } = state.flags;

    return {
        ...state,
        flags: remainingFlags,
    };
}

export function setStoryAttribute(state: StoryState, attribute: string, value: number): StoryState {
    return {
        ...state,
        attributes: {
            ...state.attributes,
            [attribute]: value,
        },
    };
}

export function adjustStoryAttribute(state: StoryState, attribute: string, delta: number): StoryState {
    return setStoryAttribute(state, attribute, (state.attributes[attribute] ?? 0) + delta);
}

export function setStoryRelation(state: StoryState, relationId: string, value: number): StoryState {
    return {
        ...state,
        relations: {
            ...state.relations,
            [relationId]: value,
        },
    };
}

export function adjustStoryRelation(state: StoryState, relationId: string, delta: number): StoryState {
    return setStoryRelation(state, relationId, (state.relations[relationId] ?? 0) + delta);
}

export function moveStoryPosition(
    state: StoryState,
    params: { locationId: string; sublocationId: string; nodeId?: string },
): StoryState {
    const movedState: StoryState = {
        ...state,
        currentLocationId: params.locationId,
        currentSublocationId: params.sublocationId,
        currentNodeId: params.nodeId ?? state.currentNodeId,
    };

    return params.nodeId ? markStoryNodeVisited(movedState, params.nodeId) : movedState;
}

export function goToStoryNode(state: StoryState, nodeId: string): StoryState {
    return markStoryNodeVisited(
        {
            ...state,
            currentNodeId: nodeId,
        },
        nodeId,
    );
}

export function evaluateStoryCondition(state: StoryState, condition: StoryCondition): boolean {
    switch (condition.kind) {
        case 'attribute':
            return compareNumber(state.attributes[condition.attribute] ?? 0, condition.operator, condition.value);
        case 'flag':
            return expectBooleanPresence(state.flags[condition.flag] === true, condition.expected);
        case 'visitedNode':
            return expectBooleanPresence(state.visitedNodeIds.includes(condition.nodeId), condition.expected);
        case 'triggeredDialogue':
            return expectBooleanPresence(state.triggeredDialogueIds.includes(condition.dialogueId), condition.expected);
        case 'all':
            return condition.conditions.every((childCondition) => evaluateStoryCondition(state, childCondition));
        case 'any':
            return condition.conditions.some((childCondition) => evaluateStoryCondition(state, childCondition));
        case 'not':
            return !evaluateStoryCondition(state, condition.condition);
        default:
            return unsupportedStoryCondition(condition);
    }
}

export function applyStoryEffects(state: StoryState, effects: StoryEffect[] = []): ApplyStoryEffectsResult {
    let nextState = state;
    let nextNodeId: string | undefined;
    let pendingBattle: StoryBattleTrigger | undefined;
    const appliedEffectKinds: StoryEffectKind[] = [];

    for (const effect of effects) {
        appliedEffectKinds.push(effect.kind);

        switch (effect.kind) {
            case 'setFlag':
                nextState = setStoryFlag(nextState, effect.flag, effect.value ?? true);
                break;
            case 'clearFlag':
                nextState = clearStoryFlag(nextState, effect.flag);
                break;
            case 'recordVisitedNode':
                nextState = markStoryNodeVisited(nextState, effect.nodeId);
                break;
            case 'recordDialogue':
                nextState = markDialogueTriggered(nextState, effect.dialogueId);
                break;
            case 'setAttribute':
                nextState = setStoryAttribute(nextState, effect.attribute, effect.value);
                break;
            case 'adjustAttribute':
                nextState = adjustStoryAttribute(nextState, effect.attribute, effect.delta);
                break;
            case 'setRelation':
                nextState = setStoryRelation(nextState, effect.relationId, effect.value);
                break;
            case 'adjustRelation':
                nextState = adjustStoryRelation(nextState, effect.relationId, effect.delta);
                break;
            case 'moveTo':
                nextState = moveStoryPosition(nextState, effect);
                if (effect.nodeId) {
                    nextNodeId = effect.nodeId;
                }
                break;
            case 'goToNode':
                nextNodeId = effect.nodeId;
                nextState = goToStoryNode(nextState, effect.nodeId);
                break;
            case 'startBattle':
                pendingBattle = cloneStoryBattleTrigger(effect.battle);
                break;
            default:
                unsupportedStoryEffect(effect);
        }
    }

    return {
        state: nextState,
        nextNodeId,
        pendingBattle,
        appliedEffectKinds,
    };
}

export function canSelectStoryChoice(state: StoryState, choice: StoryChoiceRuntimeDefinition): boolean {
    return choice.condition ? evaluateStoryCondition(state, choice.condition) : true;
}

export function applyStoryChoice(state: StoryState, choice: StoryChoiceRuntimeDefinition): ApplyStoryChoiceResult {
    if (!canSelectStoryChoice(state, choice)) {
        return {
            status: 'blocked',
            choiceId: choice.id,
            state,
            unmetCondition: choice.condition,
            appliedEffectKinds: [],
        };
    }

    const choiceEffects: StoryEffect[] = choice.nextNodeId
        ? [...(choice.effects ?? []), { kind: 'goToNode', nodeId: choice.nextNodeId }]
        : choice.effects ?? [];
    const result = applyStoryEffects(state, choiceEffects);

    return {
        ...result,
        status: 'applied',
        choiceId: choice.id,
    };
}
