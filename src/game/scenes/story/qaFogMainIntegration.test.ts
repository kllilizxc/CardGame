import { describe, expect, it } from 'bun:test';

import hubJson from '../../../../public/data/hub/qingyun-sect-gate.json';
import graphJson from '../../../../public/data/story/qa-fog-fox.json';
import { settleStoryRewards } from '../../services/StoryCardGrantPersistence';
import { validateHubTownDefinition } from '../hub/hubTown';
import { validatePlayableStoryGraph } from './storyFlow';
import { createInitialStoryRuntime, createStoryChoiceTransition, createStoryFlowViewModel } from './storyFlowViewModel';

describe('N1 story in the main game', () => {
    it('opens from the existing sect gate and grants gathering supplies once', () => {
        const hub = validateHubTownDefinition(hubJson);
        const action = hub.locations.flatMap(location => location.actions)
            .find(candidate => candidate.id === 'action.qa-fog-fox');
        expect(action).toMatchObject({
            kind: 'startStory',
            storyResourceId: 'story.qa-fog-fox',
            storyGraphFile: 'data/story/qa-fog-fox.json',
        });

        const graph = validatePlayableStoryGraph(graphJson);
        expect(graph.nodes).toHaveLength(13);
        expect(graph.choices).toHaveLength(28);
        const entry = createStoryFlowViewModel(graph, { storyState: createInitialStoryRuntime(graph) });
        const first = createStoryChoiceTransition(entry, 'choice.qa-fog.entry.first');
        expect(first.status).toBe('selected');
        if (first.status !== 'selected') throw new Error('N1 entry is blocked');
        const firstView = createStoryFlowViewModel(graph, {
            storyState: first.nextStoryState,
            selectedChoiceIds: first.nextSelectedChoiceIds,
        });
        const gather = createStoryChoiceTransition(firstView, 'choice.qa-fog.first.gather');
        expect(gather.status).toBe('selected');
        if (gather.status !== 'selected') throw new Error('N1 gathering is blocked');
        expect(gather.nextStoryState.currentNodeId).toBe('scene.qa-fog.gather');

        const transactions = gather.nextStoryState.itemTransactions ?? [];
        expect(transactions.map(item => [item.itemId, item.countDelta])).toEqual([
            ['tool.qa-fog-silver-needle', 1],
            ['consumable.qa-fog-white-leaf', 2],
        ]);
        const values = new Map<string, string>();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => { values.set(key, value); },
            removeItem: (key: string) => { values.delete(key); },
        };
        const seed = {
            worldState: { stash: { items: [], spiritStones: 0 } },
            starterDeck: { cards: [{ id: 'CR_001', count: 1 }] },
        };
        const settled = settleStoryRewards([], transactions, seed, storage);
        expect(settled.items).toEqual([
            { id: 'tool.qa-fog-silver-needle', itemType: 'tool', count: 1 },
            { id: 'consumable.qa-fog-white-leaf', itemType: 'consumable', count: 2 },
        ]);
        expect(settleStoryRewards([], transactions, seed, storage).items).toEqual(settled.items);
        expect(settled.settledStoryItemTransactionIds).toHaveLength(2);
    });
});
