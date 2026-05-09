import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import townShellJson from '../../../../public/data/hub/town-shell.json';
import type { StoryRuntimeSessionSnapshot } from '../../services/StoryHubSessionPersistence';
import type { StoryState } from '../../types/story';
import { validatePlayableStoryGraph } from '../story/storyFlow';
import * as hubTown from './hubTown';
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
    it('validates checked-in Hub sub-map presentation metadata for Qingyun town and the one-location sect gate', () => {
        const town = validateHubTownDefinition(townShellJson);
        const sectGate = readHubTownDefinition('data/hub/qingyun-sect-gate.json');

        expect(town.presentation).toEqual({
            mapWidth: 1000,
            mapHeight: 620,
            initialCenter: {
                x: 0.5,
                y: 0.57,
            },
        });
        expect(town.locations.map((location) => ({
            id: location.id,
            presentation: location.presentation,
        }))).toEqual([
            {
                id: 'location.qingyun-town.gate-market',
                presentation: {
                    position: {
                        x: 0.36,
                        y: 0.64,
                    },
                    icon: 'gate-market',
                    regionLabel: '山门集市',
                },
            },
            {
                id: 'location.qingyun-town.teahouse',
                presentation: {
                    position: {
                        x: 0.66,
                        y: 0.5,
                    },
                    icon: 'teahouse',
                    regionLabel: '镇口茶棚',
                },
            },
        ]);
        expect(sectGate.presentation).toEqual({
            mapWidth: 820,
            mapHeight: 520,
            initialCenter: {
                x: 0.5,
                y: 0.52,
            },
        });
        expect(sectGate.locations.map((location) => ({
            id: location.id,
            presentation: location.presentation,
        }))).toEqual([
            {
                id: 'location.qingyun-sect-gate.archway',
                presentation: {
                    position: {
                        x: 0.5,
                        y: 0.52,
                    },
                    icon: 'sect-gate',
                    regionLabel: '青云宗山门',
                },
            },
        ]);
    });

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
                storyResourceId: 'story.qingyun-entry',
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
                storyResourceId: 'story.qingyun-teahouse-rumors',
                storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
            }),
        ]);
    });

    it('validates every Hub-launched playable story graph and keeps action ids distinct per graph', () => {
        const town = validateHubTownDefinition(townShellJson);
        const startStoryActions = getAllStartStoryActions(town);

        expect(startStoryActions.map((action) => ({
            id: action.id,
            storyResourceId: action.storyResourceId,
            storyGraphFile: action.storyGraphFile,
        }))).toEqual([
            {
                id: 'action.start-qingyun-entry-story',
                storyResourceId: 'story.qingyun-entry',
                storyGraphFile: 'data/story/story-graph.json',
            },
            {
                id: 'action.start-teahouse-rumors-story',
                storyResourceId: 'story.qingyun-teahouse-rumors',
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
            storyResourceId: action.storyResourceId,
            storyGraphFile: action.storyGraphFile,
        }))).toEqual([
            {
                id: 'action.start-sect-gate-entry-story',
                storyResourceId: 'story.qingyun-entry',
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
                storyResourceId: 'story.qingyun-entry',
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
                storyResourceId: 'story.qingyun-entry',
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

    it('uses a world-map Hub targetLocationId as an explicit location destination before restoring saved location', () => {
        const town = validateHubTownDefinition(townShellJson);

        expect(createInitialHubNavigationState(
            town,
            {
                hubId: 'hub.qingyun-town',
                currentLocationId: 'location.qingyun-town.gate-market',
                statusText: '保存位置仍在山门集市。',
                updatedAt: '2026-05-09T06:00:00.000Z',
            },
            {
                targetLocationId: 'location.qingyun-town.teahouse',
                statusText: '从大地图直接前往青云镇集市茶棚。',
            },
        )).toEqual({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '从大地图直接前往青云镇集市茶棚。',
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
                storyResourceId: 'story.qingyun-entry',
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
                storyResourceId: 'story.qingyun-teahouse-rumors',
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
                storyResourceId: 'story.qingyun-entry',
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

    it('converts normalized Hub marker coordinates and clamps the draggable sub-map surface', () => {
        const town = validateHubTownDefinition(townShellJson);
        const helpers = hubTown as typeof hubTown & {
            getHubLocationSurfacePosition?: (hub: HubTownDefinition, location: HubTownDefinition['locations'][number]) => { x: number; y: number };
            createHubMapInitialSurfacePosition?: (presentation: HubTownDefinition['presentation'], viewport: { left: number; top: number; width: number; height: number }) => { x: number; y: number };
            clampHubMapSurfacePosition?: (presentation: HubTownDefinition['presentation'], viewport: { left: number; top: number; width: number; height: number }, position: { x: number; y: number }) => { x: number; y: number };
            shouldActivateHubMarker?: (pointerDown: { x: number; y: number }, pointerUp: { x: number; y: number }, dragDistanceThreshold: number) => boolean;
        };

        expect(typeof helpers.getHubLocationSurfacePosition).toBe('function');
        expect(typeof helpers.createHubMapInitialSurfacePosition).toBe('function');
        expect(typeof helpers.clampHubMapSurfacePosition).toBe('function');
        expect(typeof helpers.shouldActivateHubMarker).toBe('function');
        if (!helpers.getHubLocationSurfacePosition
            || !helpers.createHubMapInitialSurfacePosition
            || !helpers.clampHubMapSurfacePosition
            || !helpers.shouldActivateHubMarker) {
            throw new Error('Expected Hub map helpers to be exported.');
        }

        expect(helpers.getHubLocationSurfacePosition(town, town.locations[1])).toEqual({
            x: 660,
            y: 310,
        });

        const viewport = {
            left: 120,
            top: 180,
            width: 500,
            height: 360,
        };
        const initialSurfacePosition = helpers.createHubMapInitialSurfacePosition(town.presentation, viewport);
        expect(initialSurfacePosition.x).toBe(-130);
        expect(initialSurfacePosition.y).toBeCloseTo(6.6);
        expect(helpers.clampHubMapSurfacePosition(town.presentation, viewport, {
            x: 240,
            y: 260,
        })).toEqual({
            x: 120,
            y: 180,
        });
        expect(helpers.clampHubMapSurfacePosition(town.presentation, viewport, {
            x: -600,
            y: -200,
        })).toEqual({
            x: -380,
            y: -80,
        });
        expect(helpers.shouldActivateHubMarker({ x: 200, y: 300 }, { x: 206, y: 304 }, 8)).toBe(true);
        expect(helpers.shouldActivateHubMarker({ x: 200, y: 300 }, { x: 214, y: 304 }, 8)).toBe(false);
    });

    it('applies Hub marker selection through the same persisted navigation state boundary', () => {
        const town = validateHubTownDefinition(townShellJson);
        const helpers = hubTown as typeof hubTown & {
            createHubLocationSelectionIntent?: (targetLocationId: string, statusText?: string) => ReturnType<typeof createHubActionIntent>;
        };

        expect(typeof helpers.createHubLocationSelectionIntent).toBe('function');
        if (!helpers.createHubLocationSelectionIntent) {
            throw new Error('Expected createHubLocationSelectionIntent to be exported.');
        }

        const markerIntent = helpers.createHubLocationSelectionIntent(
            'location.qingyun-town.teahouse',
            '已在 Hub 子地图选择集市茶棚。',
        );

        expect(markerIntent).toEqual({
            kind: 'selectLocation',
            targetLocationId: 'location.qingyun-town.teahouse',
            statusText: '已在 Hub 子地图选择集市茶棚。',
        });
        expect(applyHubNavigationIntent(town, {
            currentLocationId: 'location.qingyun-town.gate-market',
        }, markerIntent)).toEqual({
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '已在 Hub 子地图选择集市茶棚。',
        });
    });

    it('rejects invalid Hub sub-map presentation metadata before rendering markers', () => {
        const missingTownPresentation = structuredClone(townShellJson) as Record<string, unknown>;
        delete missingTownPresentation.presentation;

        expect(() => validateHubTownDefinition(missingTownPresentation)).toThrow(
            'Hub town presentation must be an object.',
        );

        const invalidTownSize = structuredClone(townShellJson) as typeof townShellJson;
        invalidTownSize.presentation.mapWidth = 0;

        expect(() => validateHubTownDefinition(invalidTownSize)).toThrow(
            'Hub town presentation.mapWidth must be a positive number.',
        );

        const invalidLocationPosition = structuredClone(townShellJson) as typeof townShellJson;
        invalidLocationPosition.locations[0].presentation.position.x = 1.2;

        expect(() => validateHubTownDefinition(invalidLocationPosition)).toThrow(
            'Hub location location.qingyun-town.gate-market presentation.position.x must be between 0 and 1.',
        );

        const invalidLocationIcon = structuredClone(townShellJson) as typeof townShellJson;
        invalidLocationIcon.locations[0].presentation.icon = '';

        expect(() => validateHubTownDefinition(invalidLocationIcon)).toThrow(
            'Hub location location.qingyun-town.gate-market presentation.icon must be a non-empty string.',
        );
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
