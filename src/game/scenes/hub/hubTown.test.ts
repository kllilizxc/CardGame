import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import townShellJson from '../../../../public/data/hub/town-shell.json';
import type { StoryRuntimeSessionSnapshot } from '../../services/StoryHubSessionPersistence';
import type { StoryState } from '../../types/story';
import { validatePlayableStoryGraph } from '../story/storyFlow';
import {
    applyHubNavigationIntent,
    createHubActionIntent,
    createInitialHubNavigationState,
    createStoryHubSessionKeyFromAction,
    validateHubTownDefinition,
    type HubTownDefinition,
    type HubTownStartStoryAction,
} from './hubTown';

function getAllStartStoryActions(town: HubTownDefinition): HubTownStartStoryAction[] {
    return town.locations.flatMap((location) =>
        location.actions.filter((action): action is HubTownStartStoryAction => action.kind === 'startStory'),
    );
}

function getStartStoryAction(town: HubTownDefinition, actionId: string): HubTownStartStoryAction {
    const action = getAllStartStoryActions(town).find((candidate) => candidate.id === actionId);

    expect(action).toBeDefined();
    if (!action) {
        throw new Error(`Expected Hub startStory action to exist: ${actionId}`);
    }

    return action;
}

function readPublicJsonFile(publicFile: string): unknown {
    const absolutePath = join(process.cwd(), 'public', publicFile);

    expect(existsSync(absolutePath)).toBe(true);

    return JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown;
}

function readHubTownDefinition(publicFile: string): HubTownDefinition {
    return validateHubTownDefinition(readPublicJsonFile(publicFile));
}

function createStoryState(params: {
    storyId: string;
    locationId: string;
    sublocationId: string;
    nodeId: string;
}): StoryState {
    return {
        storyId: params.storyId,
        currentLocationId: params.locationId,
        currentSublocationId: params.sublocationId,
        currentNodeId: params.nodeId,
        visitedNodeIds: [params.nodeId],
        triggeredDialogueIds: [],
        flags: {},
        attributes: {
            心性: 55,
        },
        relations: {},
    };
}

describe('hub town shell content', () => {
    it('validates the checked-in town shell with multiple data-declared locations and navigation actions', () => {
        const town = validateHubTownDefinition(townShellJson);

        expect(town.hubId).toBe('hub.qingyun-town');
        expect(town.defaultLocationId).toBe('location.qingyun-town.gate-market');
        expect(town.locations.map((location) => location.id)).toEqual([
            'location.qingyun-town.gate-market',
            'location.qingyun-town.teahouse',
        ]);
        expect(town.locations[0].actions).toEqual([
            expect.objectContaining({
                id: 'action.start-qingyun-entry-story',
                kind: 'startStory',
                label: '前往青云宗山门',
                storyGraphFile: 'data/story/story-graph.json',
            }),
            expect.objectContaining({
                id: 'action.visit-town-teahouse',
                kind: 'navigate',
                label: '去茶棚打听消息',
                targetLocationId: 'location.qingyun-town.teahouse',
            }),
        ]);
        expect(town.locations[1].actions).toEqual([
            expect.objectContaining({
                id: 'action.return-gate-market',
                kind: 'navigate',
                label: '返回山门集市',
                targetLocationId: 'location.qingyun-town.gate-market',
            }),
            expect.objectContaining({
                id: 'action.start-teahouse-rumors-story',
                kind: 'startStory',
                label: '听茶棚传闻',
                storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
            }),
        ]);
    });

    it('validates every Hub-launched playable story graph and keeps action ids distinct per graph', () => {
        const town = validateHubTownDefinition(townShellJson);
        const startStoryActions = getAllStartStoryActions(town);

        expect(startStoryActions.map((action) => ({
            id: action.id,
            storyGraphFile: action.storyGraphFile,
        }))).toEqual([
            {
                id: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
            },
            {
                id: 'action.start-teahouse-rumors-story',
                storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
            },
        ]);

        const graphs = startStoryActions.map((action) => validatePlayableStoryGraph(
            readPublicJsonFile(action.storyGraphFile),
        ));

        expect(graphs.map((graph) => graph.storyId)).toEqual([
            'story.qingyun-entry',
            'story.qingyun-teahouse-rumors',
        ]);
    });

    it('validates the checked-in Qingyun sect-gate Hub and its data-driven story launch', () => {
        const sectGate = readHubTownDefinition('data/hub/qingyun-sect-gate.json');
        const startStoryActions = getAllStartStoryActions(sectGate);

        expect(sectGate.hubId).toBe('hub.qingyun-sect-gate');
        expect(sectGate.defaultLocationId).toBe('location.qingyun-sect-gate.archway');
        expect(sectGate.locations.map((location) => location.id)).toEqual([
            'location.qingyun-sect-gate.archway',
        ]);
        expect(startStoryActions.map((action) => ({
            id: action.id,
            storyGraphFile: action.storyGraphFile,
        }))).toEqual([
            {
                id: 'action.start-sect-gate-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
            },
        ]);

        const graph = validatePlayableStoryGraph(readPublicJsonFile(startStoryActions[0].storyGraphFile));
        expect(graph.storyId).toBe('story.qingyun-entry');
        expect(createHubActionIntent(startStoryActions[0])).toEqual({
            kind: 'startScene',
            sceneKey: 'StoryScene',
            payload: {
                source: 'hub',
                hubId: 'hub.qingyun-sect-gate',
                actionId: 'action.start-sect-gate-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                statusText: '山门云阶前，青云宗入门故事已开启。',
            },
        });
    });

    it('creates a StoryScene launch intent from data without hard-coding the story graph in the hub scene', () => {
        const town = validateHubTownDefinition(townShellJson);
        const action = town.locations[0].actions[0];

        expect(createHubActionIntent(action)).toEqual({
            kind: 'startScene',
            sceneKey: 'StoryScene',
            payload: {
                source: 'hub',
                hubId: 'hub.qingyun-town',
                actionId: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                statusText: '从青云镇出发，主线故事已开启。',
            },
        });
    });

    it('creates navigation intents and applies in-memory location state transitions', () => {
        const town = validateHubTownDefinition(townShellJson);
        const initialState = createInitialHubNavigationState(town);
        const navigateForward = town.locations[0].actions[1];

        expect(initialState).toEqual({
            currentLocationId: 'location.qingyun-town.gate-market',
        });
        expect(createHubActionIntent(navigateForward)).toEqual({
            kind: 'navigateLocation',
            targetLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
        });

        const teahouseState = applyHubNavigationIntent(
            town,
            initialState,
            createHubActionIntent(navigateForward),
        );

        expect(teahouseState).toEqual({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
        });

        const navigateBack = town.locations[1].actions[0];
        expect(applyHubNavigationIntent(town, teahouseState, createHubActionIntent(navigateBack))).toEqual({
            currentLocationId: 'location.qingyun-town.gate-market',
            statusText: '你回到山门集市，试炼告示仍贴在茶棚旁。',
        });
    });

    it('restores a persisted Hub location only when that location still exists in the current town data', () => {
        const town = validateHubTownDefinition(townShellJson);

        expect(createInitialHubNavigationState(town, {
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        })).toEqual({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
        });

        expect(createInitialHubNavigationState(town, {
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.removed-location',
            statusText: '过期地点不应继续恢复。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        })).toEqual({
            currentLocationId: 'location.qingyun-town.gate-market',
        });
    });

    it('creates a StoryScene launch intent that resumes the saved runtime for the same Hub action and graph', () => {
        const town = validateHubTownDefinition(townShellJson);
        const action = town.locations[0].actions[0];
        const savedStoryState = {
            storyId: 'story.qingyun-entry',
            currentLocationId: 'location.qingyun-gate',
            currentSublocationId: 'sublocation.qingyun.queue-edge',
            currentNodeId: 'sect_entry_003_help_girl',
            visitedNodeIds: ['sect_entry_001', 'sect_entry_003_help_girl'],
            triggeredDialogueIds: ['dialogue.frail_girl.intro'],
            flags: {
                'story.sect_entry.helped_frail_girl': true,
            },
            attributes: {
                心性: 56,
            },
            relations: {
                'npc.frail-girl': 5,
            },
        };

        const intent = createHubActionIntent(action, {
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: savedStoryState,
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '已恢复青云宗山门故事进度。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });

        expect(intent).toEqual({
            kind: 'startScene',
            sceneKey: 'StoryScene',
            payload: {
                source: 'hub',
                hubId: 'hub.qingyun-town',
                actionId: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                statusText: '已恢复青云宗山门故事进度。',
                storyState: savedStoryState,
                selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            },
        });
        if (intent.kind !== 'startScene') {
            throw new Error('Expected a StoryScene start intent.');
        }
        expect(intent.payload.storyState).not.toBe(savedStoryState);
    });

    it('isolates StoryScene resume payloads by Hub action id and story graph file', () => {
        const town = validateHubTownDefinition(townShellJson);
        const mainlineAction = getStartStoryAction(town, 'action.start-qingyun-entry-story');
        const teahouseAction = getStartStoryAction(town, 'action.start-teahouse-rumors-story');
        const mainlineSnapshot: StoryRuntimeSessionSnapshot = {
            ...createStoryHubSessionKeyFromAction(mainlineAction),
            storyState: createStoryState({
                storyId: 'story.qingyun-entry',
                locationId: 'location.qingyun-gate',
                sublocationId: 'sublocation.qingyun.queue-edge',
                nodeId: 'sect_entry_003_help_girl',
            }),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '已恢复青云宗山门故事进度。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        };
        const teahouseSnapshot: StoryRuntimeSessionSnapshot = {
            ...createStoryHubSessionKeyFromAction(teahouseAction),
            storyState: createStoryState({
                storyId: 'story.qingyun-teahouse-rumors',
                locationId: 'location.qingyun-town',
                sublocationId: 'sublocation.qingyun-town.teahouse',
                nodeId: 'teahouse_rumors_002_listen',
            }),
            selectedChoiceIds: ['teahouse_rumors_001_choice_listen'],
            statusText: '已恢复茶棚传闻支线进度。',
            updatedAt: '2026-05-09T06:02:00.000Z',
        };

        expect(createStoryHubSessionKeyFromAction(mainlineAction)).not.toEqual(createStoryHubSessionKeyFromAction(teahouseAction));

        expect(createHubActionIntent(mainlineAction, mainlineSnapshot)).toMatchObject({
            kind: 'startScene',
            payload: {
                actionId: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                storyState: {
                    storyId: 'story.qingyun-entry',
                    currentNodeId: 'sect_entry_003_help_girl',
                },
                selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
                statusText: '已恢复青云宗山门故事进度。',
            },
        });
        expect(createHubActionIntent(teahouseAction, teahouseSnapshot)).toMatchObject({
            kind: 'startScene',
            payload: {
                actionId: 'action.start-teahouse-rumors-story',
                storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
                storyState: {
                    storyId: 'story.qingyun-teahouse-rumors',
                    currentNodeId: 'teahouse_rumors_002_listen',
                },
                selectedChoiceIds: ['teahouse_rumors_001_choice_listen'],
                statusText: '已恢复茶棚传闻支线进度。',
            },
        });
        expect(createHubActionIntent(teahouseAction, mainlineSnapshot)).toEqual({
            kind: 'startScene',
            sceneKey: 'StoryScene',
            payload: {
                source: 'hub',
                hubId: 'hub.qingyun-town',
                actionId: 'action.start-teahouse-rumors-story',
                storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
                statusText: '茶棚里传来新的试炼传闻。',
            },
        });
    });

    it('separates StoryScene resume identity across different Hub ids even when actions reuse the same story graph', () => {
        const town = validateHubTownDefinition(townShellJson);
        const sectGate = readHubTownDefinition('data/hub/qingyun-sect-gate.json');
        const townMainlineAction = getStartStoryAction(town, 'action.start-qingyun-entry-story');
        const sectGateAction = getStartStoryAction(sectGate, 'action.start-sect-gate-entry-story');
        const townSnapshot: StoryRuntimeSessionSnapshot = {
            ...createStoryHubSessionKeyFromAction(townMainlineAction),
            storyState: createStoryState({
                storyId: 'story.qingyun-entry',
                locationId: 'location.qingyun-gate',
                sublocationId: 'sublocation.qingyun.queue-edge',
                nodeId: 'sect_entry_003_help_girl',
            }),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '已恢复青云镇主线故事进度。',
            updatedAt: '2026-05-09T06:03:00.000Z',
        };
        const sectGateSnapshot: StoryRuntimeSessionSnapshot = {
            ...createStoryHubSessionKeyFromAction(sectGateAction),
            storyState: createStoryState({
                storyId: 'story.qingyun-entry',
                locationId: 'location.qingyun-gate',
                sublocationId: 'sublocation.qingyun.trial-bell',
                nodeId: 'sect_entry_005_trial_bell',
            }),
            selectedChoiceIds: ['sect_entry_001_choice_wait', 'sect_entry_004_choice_ring_bell'],
            statusText: '已恢复青云宗山门故事进度。',
            updatedAt: '2026-05-09T06:04:00.000Z',
        };

        expect(createStoryHubSessionKeyFromAction(townMainlineAction)).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });
        expect(createStoryHubSessionKeyFromAction(sectGateAction)).toEqual({
            hubId: 'hub.qingyun-sect-gate',
            actionId: 'action.start-sect-gate-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });
        expect(createStoryHubSessionKeyFromAction(townMainlineAction)).not.toEqual(
            createStoryHubSessionKeyFromAction(sectGateAction),
        );

        expect(createHubActionIntent(sectGateAction, townSnapshot)).toEqual({
            kind: 'startScene',
            sceneKey: 'StoryScene',
            payload: {
                source: 'hub',
                hubId: 'hub.qingyun-sect-gate',
                actionId: 'action.start-sect-gate-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                statusText: '山门云阶前，青云宗入门故事已开启。',
            },
        });
        expect(createHubActionIntent(sectGateAction, sectGateSnapshot)).toMatchObject({
            kind: 'startScene',
            payload: {
                hubId: 'hub.qingyun-sect-gate',
                actionId: 'action.start-sect-gate-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
                storyState: {
                    storyId: 'story.qingyun-entry',
                    currentNodeId: 'sect_entry_005_trial_bell',
                },
                selectedChoiceIds: ['sect_entry_001_choice_wait', 'sect_entry_004_choice_ring_bell'],
                statusText: '已恢复青云宗山门故事进度。',
            },
        });
    });

    it('rejects navigation actions that point to missing town locations', () => {
        const brokenTown = structuredClone(townShellJson) as typeof townShellJson;
        brokenTown.locations[0].actions[1] = {
            ...brokenTown.locations[0].actions[1],
            targetLocationId: 'location.qingyun-town.missing',
        };

        expect(() => validateHubTownDefinition(brokenTown)).toThrow(
            'Hub action action.visit-town-teahouse points to missing targetLocationId: location.qingyun-town.missing',
        );
    });

    it('rejects an action with an unsupported kind so the shell contract stays explicit', () => {
        const brokenTown = structuredClone(townShellJson) as typeof townShellJson;
        brokenTown.locations[0].actions[0] = {
            ...brokenTown.locations[0].actions[0],
            kind: 'startBattle',
        } as never;

        expect(() => validateHubTownDefinition(brokenTown)).toThrow(
            'Hub action action.start-qingyun-entry-story uses unsupported kind: startBattle',
        );
    });
});
