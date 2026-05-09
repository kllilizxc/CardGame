import { beforeEach, describe, expect, it } from 'bun:test';

import type { StoryState } from '../types/story';
import {
    clearStoryRuntimeSession,
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    writeRawStoryHubSessionForTests,
} from './StoryHubSessionPersistence';

function createStoryState(nodeId = 'sect_entry_003_help_girl'): StoryState {
    return {
        storyId: 'story.qingyun-entry',
        currentLocationId: 'location.qingyun-gate',
        currentSublocationId: 'sublocation.qingyun.queue-edge',
        currentNodeId: nodeId,
        visitedNodeIds: ['sect_entry_001', nodeId],
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
}

describe('StoryHubSessionPersistence', () => {
    beforeEach(() => {
        resetStoryHubSessionPersistenceForTests();
    });

    it('saves and loads versioned Hub location and per-action Story runtime snapshots without sharing mutable references', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });

        const storyState = createStoryState();
        const selectedChoiceIds = ['sect_entry_001_choice_help_girl'];
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState,
            selectedChoiceIds,
            statusText: '已选择：注意到队伍中有一名体弱少女，主动上前搭话。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });

        const loadedHub = loadHubSessionSnapshot('hub.qingyun-town');
        const loadedStory = loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        expect(loadedHub).toEqual({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            statusText: '你穿过集市，来到茶棚边听散修议论今日试炼。',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        expect(loadedStory).toEqual({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState,
            selectedChoiceIds: ['sect_entry_001_choice_help_girl'],
            statusText: '已选择：注意到队伍中有一名体弱少女，主动上前搭话。',
            updatedAt: '2026-05-09T06:01:00.000Z',
        });
        expect(loadedStory?.storyState).not.toBe(storyState);
        expect(loadedStory?.selectedChoiceIds).not.toBe(selectedChoiceIds);
    });

    it('falls back to an empty session document when stored JSON is corrupt or the schema version is stale', () => {
        writeRawStoryHubSessionForTests('{not valid json');

        expect(loadHubSessionSnapshot('hub.qingyun-town')).toBeNull();
        expect(loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        })).toBeNull();

        writeRawStoryHubSessionForTests(JSON.stringify({ schemaVersion: 0, hubs: {}, stories: {} }));

        expect(loadHubSessionSnapshot('hub.qingyun-town')).toBeNull();
    });

    it('clears one saved story runtime session so restart can reset progress without wiping Hub location', () => {
        saveHubSessionSnapshot({
            hubId: 'hub.qingyun-town',
            currentLocationId: 'location.qingyun-town.teahouse',
            updatedAt: '2026-05-09T06:00:00.000Z',
        });
        saveStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
            storyState: createStoryState('sect_entry_004_trial_bell'),
            selectedChoiceIds: ['sect_entry_001_choice_help_girl', 'sect_entry_003_choice_trial_bell'],
            updatedAt: '2026-05-09T06:02:00.000Z',
        });

        clearStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        });

        expect(loadStoryRuntimeSession({
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        })).toBeNull();
        expect(loadHubSessionSnapshot('hub.qingyun-town')?.currentLocationId).toBe('location.qingyun-town.teahouse');
    });
});
