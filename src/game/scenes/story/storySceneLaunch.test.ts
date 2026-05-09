import { describe, expect, it } from 'bun:test';

import type { StoryBattleCompleteEvent } from '../../types/story';
import {
    DEFAULT_STORY_GRAPH_FILE,
    DEFAULT_STORY_RESOURCE_ID,
    assertStorySceneCatalogResourceMatchesLoadedGraph,
    createStoryGraphCacheKey,
    getStoryHubSessionKey,
    normalizeStorySceneLaunchData,
    resolveStorySceneCatalogResource,
} from './storySceneLaunch';

const catalogWithDefaultAndSideStory = {
    schemaVersion: 1,
    resources: [
        {
            resourceId: DEFAULT_STORY_RESOURCE_ID,
            kind: 'story',
            schemaVersion: 1,
            publicPath: DEFAULT_STORY_GRAPH_FILE,
        },
        {
            resourceId: 'story.qingyun-teahouse-rumors',
            kind: 'story',
            schemaVersion: 1,
            publicPath: 'data/story/qingyun-teahouse-rumors.json',
        },
        {
            resourceId: 'deck.starter',
            kind: 'deck',
            schemaVersion: 1,
            publicPath: 'data/decks/starter-deck.json',
        },
    ],
};

describe('storySceneLaunch', () => {
    it('defaults to the checked-in playable story graph through the stable catalog story resource id', () => {
        const launch = normalizeStorySceneLaunchData(undefined);

        expect(launch.storyResourceId).toBe(DEFAULT_STORY_RESOURCE_ID);
        expect(launch.storyGraphFile).toBe(DEFAULT_STORY_GRAPH_FILE);
        expect(launch.storyGraphCacheKey).toBe('storyGraph:data/story/story-graph.json');
        expect(resolveStorySceneCatalogResource(catalogWithDefaultAndSideStory, launch)).toEqual({
            resourceId: DEFAULT_STORY_RESOURCE_ID,
            publicPath: DEFAULT_STORY_GRAPH_FILE,
            storyGraphCacheKey: 'storyGraph:data/story/story-graph.json',
        });
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
        expect(resolveStorySceneCatalogResource(catalogWithDefaultAndSideStory, launch)).toEqual({
            resourceId: DEFAULT_STORY_RESOURCE_ID,
            publicPath: DEFAULT_STORY_GRAPH_FILE,
            storyGraphCacheKey: 'storyGraph:data/story/story-graph.json',
        });
    });

    it('resolves legacy direct storyGraphFile launches through the catalog while preserving the file-based cache key', () => {
        const launch = normalizeStorySceneLaunchData({
            storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
        });

        expect(launch.storyResourceId).toBeUndefined();
        expect(launch.storyGraphFile).toBe('data/story/qingyun-teahouse-rumors.json');
        expect(launch.storyGraphCacheKey).toBe('storyGraph:data/story/qingyun-teahouse-rumors.json');
        expect(resolveStorySceneCatalogResource(catalogWithDefaultAndSideStory, launch)).toEqual({
            resourceId: 'story.qingyun-teahouse-rumors',
            publicPath: 'data/story/qingyun-teahouse-rumors.json',
            storyGraphCacheKey: 'storyGraph:data/story/qingyun-teahouse-rumors.json',
        });
    });

    it('fails actionably when the runtime Story catalog is missing, malformed, absent, wrong-kind, or path-mismatched', () => {
        const launch = normalizeStorySceneLaunchData({
            storyResourceId: 'story.qingyun-teahouse-rumors',
            storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
        });

        expect(() => resolveStorySceneCatalogResource(undefined, launch)).toThrow(
            'StoryScene requires runtime content catalog data/content-catalog.json, but it was not loaded or is missing from the JSON cache.',
        );

        expect(() => resolveStorySceneCatalogResource({
            schemaVersion: 1,
            resources: 'not-an-array',
        }, launch)).toThrow(
            'StoryScene runtime content catalog data/content-catalog.json is malformed: contentCatalog.resources must be an array.',
        );

        expect(() => resolveStorySceneCatalogResource({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: DEFAULT_STORY_RESOURCE_ID,
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: DEFAULT_STORY_GRAPH_FILE,
                },
            ],
        }, launch)).toThrow(
            'StoryScene could not resolve catalog resource story.qingyun-teahouse-rumors: no catalog entry exists for that resource id.',
        );

        expect(() => resolveStorySceneCatalogResource({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'story.qingyun-teahouse-rumors',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/story/qingyun-teahouse-rumors.json',
                },
            ],
        }, launch)).toThrow(
            'StoryScene could not resolve catalog resource story.qingyun-teahouse-rumors: catalog resource has kind deck; expected story.',
        );

        expect(() => resolveStorySceneCatalogResource(catalogWithDefaultAndSideStory, {
            ...launch,
            storyGraphFile: 'data/story/other-story.json',
            storyGraphCacheKey: 'storyGraph:data/story/other-story.json',
        })).toThrow(
            'StoryScene catalog resource story.qingyun-teahouse-rumors resolved to publicPath data/story/qingyun-teahouse-rumors.json, but launch storyGraphFile is data/story/other-story.json.',
        );
    });

    it('fails actionably when loaded Story JSON declares a different storyId than the catalog resource id', () => {
        const launch = normalizeStorySceneLaunchData({
            storyResourceId: 'story.qingyun-teahouse-rumors',
            storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
        });
        const resolvedResource = resolveStorySceneCatalogResource(catalogWithDefaultAndSideStory, launch);

        expect(() => assertStorySceneCatalogResourceMatchesLoadedGraph(
            { storyId: 'story.qingyun-teahouse-rumors' },
            resolvedResource,
        )).not.toThrow();

        expect(() => assertStorySceneCatalogResourceMatchesLoadedGraph(
            { storyId: 'story.other-story' },
            resolvedResource,
        )).toThrow(
            'StoryScene loaded catalog resource story.qingyun-teahouse-rumors from public/data/story/qingyun-teahouse-rumors.json, but loaded Story graph declares story.other-story. Catalog story resources must declare a storyId matching their resourceId.',
        );
    });

    it('resumes battle results against the graph file that launched the battle', () => {
        const battleResult: StoryBattleCompleteEvent = {
            source: 'story',
            storyId: 'story.qingyun-entry',
            battleId: 'story.qingyun-entry.trial-bell',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            storyResourceId: 'story.qingyun-teahouse-rumors',
            storyGraphFile: 'data/story/qingyun-teahouse-rumors.json',
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

        expect(launch.storyResourceId).toBe('story.qingyun-teahouse-rumors');
        expect(launch.storyGraphFile).toBe('data/story/qingyun-teahouse-rumors.json');
        expect(createStoryGraphCacheKey(launch.storyGraphFile)).toBe('storyGraph:data/story/qingyun-teahouse-rumors.json');
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
