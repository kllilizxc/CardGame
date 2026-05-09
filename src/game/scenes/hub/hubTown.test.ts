import { describe, expect, it } from 'bun:test';

import townShellJson from '../../../../public/data/hub/town-shell.json';
import {
    applyHubNavigationIntent,
    createHubActionIntent,
    createInitialHubNavigationState,
    validateHubTownDefinition,
} from './hubTown';

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
        ]);
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
