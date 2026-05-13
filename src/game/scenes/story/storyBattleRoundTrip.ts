import { applyStoryEffects, goToStoryNode } from '../../state/StoryState';
import type {
    StoryBattleCompleteEvent,
    StoryBattleLaunchMetadata,
    StoryBattleSceneLaunchPayload,
    StoryHubSessionKey,
    StoryState,
} from '../../types/story';
import type { StoryChoiceTransition, StoryGraphDefinition } from './storyFlowViewModel';

export type StoryBattleResumeRuntime = {
    storyState: StoryState;
    selectedChoiceIds: string[];
    statusText: string;
};

export type StorySceneTransitionIntent =
    | {
        kind: 'renderStory';
        statusText: string;
    }
    | {
        kind: 'startBattleScene';
        sceneKey: 'BattleScene';
        statusText: string;
        payload: StoryBattleSceneLaunchPayload;
    };

function cloneStringArray(values: string[] | undefined): string[] {
    return [...(values ?? [])];
}

function cloneBooleanMap(values: Record<string, boolean>): Record<string, boolean> {
    return { ...values };
}

function cloneNumberMap(values: Record<string, number>): Record<string, number> {
    return { ...values };
}

export function cloneStoryState(state: StoryState): StoryState {
    return {
        ...state,
        visitedNodeIds: cloneStringArray(state.visitedNodeIds),
        triggeredDialogueIds: cloneStringArray(state.triggeredDialogueIds),
        flags: cloneBooleanMap(state.flags),
        attributes: cloneNumberMap(state.attributes),
        relations: cloneNumberMap(state.relations),
    };
}

export function cloneStoryBattleLaunchMetadata(
    battleLaunch: StoryBattleLaunchMetadata,
): StoryBattleLaunchMetadata {
    return {
        ...battleLaunch,
        ...(battleLaunch.deterministicBattleSetup
            ? { deterministicBattleSetup: { ...battleLaunch.deterministicBattleSetup } }
            : {}),
    };
}

export function createStoryBattleSceneStartPayload(
    battleLaunch: StoryBattleLaunchMetadata,
    storyState: StoryState,
    selectedChoiceIds: string[],
    storyGraphFile?: string,
    hubSession?: StoryHubSessionKey | null,
    storyResourceId?: string,
): StoryBattleSceneLaunchPayload {
    return {
        source: 'story',
        ...(storyResourceId ? { storyResourceId } : {}),
        battleLaunch: cloneStoryBattleLaunchMetadata(battleLaunch),
        storyState: cloneStoryState(storyState),
        selectedChoiceIds: cloneStringArray(selectedChoiceIds),
        ...(storyGraphFile ? { storyGraphFile } : {}),
        ...(hubSession ? { hubSession: { ...hubSession } } : {}),
    };
}

export function createStoryBattleCompleteEvent(
    payload: StoryBattleSceneLaunchPayload,
    victory: boolean,
    completedAt = new Date().toISOString(),
): StoryBattleCompleteEvent {
    const resultNodeId = victory
        ? payload.battleLaunch.onVictoryNodeId
        : payload.battleLaunch.onDefeatNodeId;

    return {
        source: 'story',
        storyId: payload.battleLaunch.storyId,
        battleId: payload.battleLaunch.battleId,
        ...(payload.battleLaunch.encounterResourceId
            ? { encounterResourceId: payload.battleLaunch.encounterResourceId }
            : {}),
        encounterId: payload.battleLaunch.encounterId,
        encounterFile: payload.battleLaunch.encounterFile,
        ...(payload.battleLaunch.deckResourceId
            ? { deckResourceId: payload.battleLaunch.deckResourceId }
            : {}),
        deckFile: payload.battleLaunch.deckFile,
        ...(payload.storyResourceId ? { storyResourceId: payload.storyResourceId } : {}),
        ...(payload.storyGraphFile ? { storyGraphFile: payload.storyGraphFile } : {}),
        victory,
        outcome: victory ? 'victory' : 'defeat',
        sourceNodeId: payload.battleLaunch.sourceNodeId,
        ...(payload.battleLaunch.sourceChoiceId ? { sourceChoiceId: payload.battleLaunch.sourceChoiceId } : {}),
        pendingNodeId: payload.battleLaunch.targetNodeId,
        onVictoryNodeId: payload.battleLaunch.onVictoryNodeId,
        onDefeatNodeId: payload.battleLaunch.onDefeatNodeId,
        resultNodeId,
        ...(payload.hubSession ? { hubSession: { ...payload.hubSession } } : {}),
        storyState: cloneStoryState(payload.storyState),
        selectedChoiceIds: cloneStringArray(payload.selectedChoiceIds),
        completedAt,
    };
}

export function routeStoryBattleResultNodeId(result: StoryBattleCompleteEvent): string {
    return result.victory ? result.onVictoryNodeId : result.onDefeatNodeId;
}

function findStoryNode(graph: StoryGraphDefinition, nodeId: string) {
    return graph.nodes.find((node) => node.id === nodeId);
}

export function applyStoryBattleResultToRuntime(
    graph: StoryGraphDefinition,
    result: StoryBattleCompleteEvent,
): StoryBattleResumeRuntime {
    const resultNodeId = routeStoryBattleResultNodeId(result);
    const resultNode = findStoryNode(graph, resultNodeId);

    if (!resultNode) {
        throw new Error(`Story battle result node is missing from graph: ${resultNodeId}`);
    }

    const movedState = goToStoryNode(cloneStoryState(result.storyState), resultNodeId);
    const enteredState = applyStoryEffects(movedState, resultNode.onEnter ?? []).state;
    const outcomeText = result.victory ? '战斗胜利' : '战斗失败';

    return {
        storyState: enteredState,
        selectedChoiceIds: cloneStringArray(result.selectedChoiceIds),
        statusText: `${outcomeText}，剧情已回到：${resultNode.title}`,
    };
}

export function createStorySceneTransitionIntent(
    transition: Extract<StoryChoiceTransition, { status: 'selected' }>,
    selectedChoiceText: string,
    storyGraphFile?: string,
    hubSession?: StoryHubSessionKey | null,
    storyResourceId?: string,
): StorySceneTransitionIntent {
    if (!transition.battleLaunch) {
        return {
            kind: 'renderStory',
            statusText: `已选择：${selectedChoiceText}`,
        };
    }

    return {
        kind: 'startBattleScene',
        sceneKey: transition.battleLaunch.sceneKey,
        statusText: transition.battleLaunch.launchText ?? `已选择：${selectedChoiceText}`,
        payload: createStoryBattleSceneStartPayload(
            transition.battleLaunch,
            transition.nextStoryState,
            transition.nextSelectedChoiceIds,
            storyGraphFile,
            hubSession,
            storyResourceId,
        ),
    };
}
