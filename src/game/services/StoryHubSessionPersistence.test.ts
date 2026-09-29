import { beforeEach, describe, expect, it } from 'bun:test';

import type { StoryState } from '../types/story';
import { applyStoryEffects } from '../state/StoryState';
import {
    applySharedNarrativeFacts,
    clearStoryRuntimeSession,
    loadHubSessionSnapshot,
    loadStoryRuntimeSession,
    loadSharedNarrativeFacts,
    resetStoryHubSessionPersistenceForTests,
    saveHubSessionSnapshot,
    saveStoryRuntimeSession,
    saveStoryRuntimeSessionWithSharedFacts,
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

    it('round-trips narrative knowledge, quest stages and settlement records without aliasing arrays', () => {
        const key = { hubId: 'hub.fox', actionId: 'story.fox', storyGraphFile: 'data/story/fox.json' };
        const storyState: StoryState = {
            ...createStoryState(),
            knowledge: { player: ['fox.stolen-recipe'], 'npc.guard': [] },
            questStages: { 'quest.heal-fox': 'completed' },
            settledEventIds: ['quest.heal-fox.reward'],
            cardGrants: [{ grantId: 'quest.heal-fox.card', cardId: 'CR_001', count: 1 }],
            actorAbilities: { 'npc.fox': { 医术: 8 } },
            itemTransactions: [{ transactionId: 'quest.fox.salve', itemId: 'consumable.spirit-salve', itemType: 'consumable', countDelta: -1 }],
            itemCounts: { 'consumable.spirit-salve': 1 },
            currentDialogueId: 'dlg.fox.042',
            currentReadingPage: 2,
        };
        saveStoryRuntimeSession({ ...key, storyState, selectedChoiceIds: [], updatedAt: '2026-09-26T00:00:00.000Z' });
        storyState.knowledge!.player!.push('later');
        storyState.actorAbilities!['npc.fox']!.医术 = 1;
        storyState.itemCounts!['consumable.spirit-salve'] = 9;
        const loaded = loadStoryRuntimeSession(key);
        expect(loaded?.storyState.knowledge?.player).toEqual(['fox.stolen-recipe']);
        expect(loaded?.storyState.questStages?.['quest.heal-fox']).toBe('completed');
        expect(loaded?.storyState.settledEventIds).toEqual(['quest.heal-fox.reward']);
        expect(loaded?.storyState.cardGrants).toEqual([{ grantId: 'quest.heal-fox.card', cardId: 'CR_001', count: 1 }]);
        expect(loaded?.storyState.actorAbilities?.['npc.fox']?.医术).toBe(8);
        expect(loaded?.storyState.itemCounts?.['consumable.spirit-salve']).toBe(1);
        expect(loaded?.storyState.itemTransactions).toHaveLength(1);
        expect(loaded?.storyState.currentDialogueId).toBe('dlg.fox.042');
        expect(loaded?.storyState.currentReadingPage).toBe(2);
    });

    it('shares opt-in story facts across Hub actions while preserving each reading position', () => {
        const firstKey = { hubId: 'hub.fox', actionId: 'story.first', storyGraphFile: 'data/story/first.json' };
        const secondKey = { hubId: 'hub.town', actionId: 'story.second', storyGraphFile: 'data/story/second.json' };
        const firstState: StoryState = {
            ...createStoryState('scene.fox'),
            attributes: { 口才: 6 },
            relations: { 'npc.fox->player': 30 },
            knowledge: { player: ['fox.stolen-recipe'] },
            questStages: { 'quest.heal-fox': 'completed' },
            settledEventIds: ['quest.heal-fox.reward'],
            cardGrants: [{ grantId: 'quest.heal-fox.card', cardId: 'CR_001', count: 1 }],
            itemTransactions: [{ transactionId: 'quest.heal-fox.salve', itemId: 'consumable.spirit-salve', itemType: 'consumable', countDelta: -1 }],
            currentDialogueId: 'dlg.fox.100',
        };
        saveStoryRuntimeSessionWithSharedFacts({ ...firstKey, storyState: firstState, selectedChoiceIds: [], updatedAt: '2026-09-26T00:00:00.000Z' });
        const secondState = applySharedNarrativeFacts({ ...createStoryState('scene.town'), attributes: { 口才: 4 } }, loadSharedNarrativeFacts());
        expect(secondState.currentNodeId).toBe('scene.town');
        expect(secondState.currentDialogueId).toBeUndefined();
        expect(secondState.attributes.口才).toBe(6);
        expect(secondState.knowledge?.player).toEqual(['fox.stolen-recipe']);
        expect(secondState.questStages?.['quest.heal-fox']).toBe('completed');
        expect(secondState.settledEventIds).toContain('quest.heal-fox.reward');
        expect(secondState.cardGrants).toEqual(firstState.cardGrants);
        expect(secondState.itemTransactions).toEqual(firstState.itemTransactions);
        const replay = applyStoryEffects(secondState, [{ kind: 'once', eventId: 'quest.heal-fox.reward', effects: [{ kind: 'adjustRelation', relationId: 'npc.fox->player', delta: 10 }] }]);
        expect(replay.state.relations['npc.fox->player']).toBe(30);
        saveStoryRuntimeSessionWithSharedFacts({ ...secondKey, storyState: secondState, selectedChoiceIds: [], updatedAt: '2026-09-26T00:01:00.000Z' });
        expect(loadStoryRuntimeSession(firstKey)?.storyState.currentNodeId).toBe('scene.fox');
        expect(loadStoryRuntimeSession(secondKey)?.storyState.currentNodeId).toBe('scene.town');
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
