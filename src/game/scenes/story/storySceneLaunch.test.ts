import { describe, expect, it } from 'bun:test';

import type { StoryBattleCompleteEvent } from '../../types/story';
import {
    DEFAULT_STORY_GRAPH_FILE,
    createStoryGraphCacheKey,
    getStoryHubSessionKey,
    normalizeStorySceneLaunchData,
} from './storySceneLaunch';

describe('storySceneLaunch', () => {
    it('defaults to the checked-in playable story graph', () => {
        const launch = normalizeStorySceneLaunchData(undefined);

        expect(launch.storyGraphFile).toBe(DEFAULT_STORY_GRAPH_FILE);
        expect(launch.storyGraphCacheKey).toBe('storyGraph:data/story/story-graph.json');
    });

    it('accepts a hub-provided story graph file and creates a stable cache key', () => {
        const launch = normalizeStorySceneLaunchData({
            source: 'hub',
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyResourceId: ' story.qingyun-entry ',
            storyGraphFile: 'data/story/story-graph.json',
            statusText: '从青云镇出发，主线故事已开启。',
        });

        expect(launch.storyResourceId).toBe('story.qingyun-entry');
        expect(launch.storyGraphFile).toBe('data/story/story-graph.json');
        expect(launch.storyGraphCacheKey).toBe('storyGraph:data/story/story-graph.json');
        expect(launch.statusText).toBe('从青云镇出发，主线故事已开启。');
        expect(getStoryHubSessionKey(launch)).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });
    });

    it('resumes battle results against the graph file that launched the battle', () => {
        const battleResult: StoryBattleCompleteEvent = {
            source: 'story',
            storyId: 'story.qingyun-entry',
            battleId: 'story.qingyun-entry.trial-bell',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            storyGraphFile: 'data/story/custom-graph.json',
            victory: true,
            outcome: 'victory',
            sourceNodeId: 'sect_entry_004_trial_bell',
            pendingNodeId: 'sect_entry_004_trial_bell',
            onVictoryNodeId: 'sect_entry_005_trial_victory',
            onDefeatNodeId: 'sect_entry_006_trial_defeat',
            resultNodeId: 'sect_entry_005_trial_victory',
            storyState: {
                storyId: 'story.qingyun-entry',
                currentLocationId: 'location.qingyun-gate',
                currentSublocationId: 'sublocation.qingyun.trial-bell',
                currentNodeId: 'sect_entry_004_trial_bell',
                visitedNodeIds: ['sect_entry_004_trial_bell'],
                triggeredDialogueIds: [],
                flags: {},
                attributes: {},
                relations: {},
            },
            selectedChoiceIds: [],
            completedAt: '2026-05-09T00:00:00.000Z',
        };

        const launch = normalizeStorySceneLaunchData({ storyBattleResult: battleResult });

        expect(launch.storyGraphFile).toBe('data/story/custom-graph.json');
        expect(createStoryGraphCacheKey(launch.storyGraphFile)).toBe('storyGraph:data/story/custom-graph.json');
    });

    it('normalizes Hub session identity from Hub launches and story battle results', () => {
        const hubLaunch = normalizeStorySceneLaunchData({
            source: 'hub',
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        expect(getStoryHubSessionKey(hubLaunch)).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        const battleResult: StoryBattleCompleteEvent = {
            source: 'story',
            storyId: 'story.qingyun-entry',
            battleId: 'story.qingyun-entry.trial-bell',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            storyGraphFile: 'data/story/story-graph.json',
            victory: true,
            outcome: 'victory',
            sourceNodeId: 'sect_entry_004_trial_bell',
            pendingNodeId: 'sect_entry_004_trial_bell',
            onVictoryNodeId: 'sect_entry_005_trial_victory',
            onDefeatNodeId: 'sect_entry_005_trial_defeat',
            resultNodeId: 'sect_entry_005_trial_victory',
            hubSession: {
                hubId: 'hub.qingyun-town',
                actionId: 'action.start-qingyun-entry-story',
                storyGraphFile: 'data/story/story-graph.json',
            },
            storyState: {
                storyId: 'story.qingyun-entry',
                currentLocationId: 'location.qingyun-gate',
                currentSublocationId: 'sublocation.qingyun.trial-bell',
                currentNodeId: 'sect_entry_004_trial_bell',
                visitedNodeIds: ['sect_entry_004_trial_bell'],
                triggeredDialogueIds: [],
                flags: {},
                attributes: {},
                relations: {},
            },
            selectedChoiceIds: [],
            completedAt: '2026-05-09T00:00:00.000Z',
        };

        expect(getStoryHubSessionKey(normalizeStorySceneLaunchData({ storyBattleResult: battleResult }))).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });
    });
});
