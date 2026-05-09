import { describe, expect, it } from 'bun:test';

import townShellJson from '../../../../public/data/hub/town-shell.json';
import {
    createHubActionLaunchIntent,
    validateHubTownDefinition,
} from './hubTown';

describe('hub town shell content', () => {
    it('validates the checked-in town shell and exposes a story launch action', () => {
        const town = validateHubTownDefinition(townShellJson);

        expect(town.hubId).toBe('hub.qingyun-town');
        expect(town.defaultLocationId).toBe('location.qingyun-town.gate-market');
        expect(town.locations).toHaveLength(1);
        expect(town.locations[0].actions).toEqual([
            expect.objectContaining({
                id: 'action.start-qingyun-entry-story',
                kind: 'startStory',
                label: '前往青云宗山门',
                storyGraphFile: 'data/story/story-graph.json',
            }),
        ]);
    });

    it('creates a StoryScene launch intent from data without hard-coding the story graph in the hub scene', () => {
        const town = validateHubTownDefinition(townShellJson);
        const action = town.locations[0].actions[0];

        expect(createHubActionLaunchIntent(action)).toEqual({
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

    it('rejects a location with a non-story action so the minimal shell stays explicit', () => {
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
