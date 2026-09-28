import { describe, expect, it } from 'bun:test';

import hubJson from '../../../../public/data/hub/qingyun-sect-gate.json';
import graphJson from '../../../../public/data/story/qa-fog-fox.json';
import { settleStoryRewards } from '../../services/StoryCardGrantPersistence';
import { goToStoryNode } from '../../state/StoryState';
import { validateHubTownDefinition } from '../hub/hubTown';
import { applyStoryBattleResultToRuntime, createStoryBattleCompleteEvent, createStoryBattleSceneStartPayload } from './storyBattleRoundTrip';
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
        expect(graph.nodes).toHaveLength(18);
        expect(graph.choices).toHaveLength(38);
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

    it('returns from the optional mist fox battle and carries its clue into chapter three', () => {
        const graph = validatePlayableStoryGraph(graphJson);
        const entry = createStoryFlowViewModel(graph, { storyState: createInitialStoryRuntime(graph) });
        const first = createStoryChoiceTransition(entry, 'choice.qa-fog.entry.first');
        if (first.status !== 'selected') throw new Error('N1 entry is blocked');
        const gather = createStoryChoiceTransition(createStoryFlowViewModel(graph, { storyState: first.nextStoryState }), 'choice.qa-fog.first.gather');
        if (gather.status !== 'selected') throw new Error('N1 gathering is blocked');
        const track = createStoryChoiceTransition(createStoryFlowViewModel(graph, { storyState: gather.nextStoryState }), 'choice.qa-fog.gather.track');
        if (track.status !== 'selected') throw new Error('N1 mist fox route is blocked');
        const fight = createStoryChoiceTransition(createStoryFlowViewModel(graph, { storyState: track.nextStoryState }), 'choice.qa-fog.mist-fox.fight');
        if (fight.status !== 'selected' || !fight.battleLaunch) throw new Error('N1 battle launch is missing');
        expect(fight.battleLaunch).toMatchObject({
            battleId: 'battle.qa-fog.mist-fox',
            encounterResourceId: 'test_encounter_01',
            deckResourceId: 'deck.starter',
            onVictoryNodeId: 'scene.qa-fog.battle-victory',
            onDefeatNodeId: 'scene.qa-fog.battle-defeat',
        });
        const pending = createStoryFlowViewModel(graph, { storyState: fight.nextStoryState });
        expect(pending.choices.filter(choice => choice.visible).map(choice => choice.id)).toEqual(['choice.qa-fog.battle-pending.retreat']);

        const payload = createStoryBattleSceneStartPayload(fight.battleLaunch, fight.nextStoryState, fight.nextSelectedChoiceIds);
        const victory = applyStoryBattleResultToRuntime(graph, createStoryBattleCompleteEvent(payload, true));
        const defeat = applyStoryBattleResultToRuntime(graph, createStoryBattleCompleteEvent(payload, false));
        expect(victory.storyState.currentNodeId).toBe('scene.qa-fog.battle-victory');
        expect(defeat.storyState.currentNodeId).toBe('scene.qa-fog.battle-defeat');
        expect(victory.storyState.flags['qa-fog.mist-fox-resolved']).toBe(true);
        expect(defeat.storyState.flags['qa-fog.mist-fox-resolved']).toBe(true);
        expect(victory.storyState.knowledge?.player).toContain('qa-fog.blue-thread');
        expect(defeat.storyState.knowledge?.player ?? []).not.toContain('qa-fog.blue-thread');
        for (const [outcome, returnChoiceId] of [
            [victory, 'choice.qa-fog.battle-victory.return'],
            [defeat, 'choice.qa-fog.battle-defeat.return'],
        ] as const) {
            const returned = createStoryChoiceTransition(
                createStoryFlowViewModel(graph, { storyState: outcome.storyState }),
                returnChoiceId,
            );
            if (returned.status !== 'selected') throw new Error('N1 battle return is blocked');
            expect(returned.nextStoryState.currentNodeId).toBe('scene.qa-fog.gather');
            expect(returned.nextStoryState.itemTransactions).toEqual(gather.nextStoryState.itemTransactions);
            expect(createStoryFlowViewModel(graph, { storyState: returned.nextStoryState })
                .choices.find(choice => choice.id === 'choice.qa-fog.gather.track')?.visible).toBe(false);
        }
        const chapterChoice = (storyState: typeof victory.storyState) => createStoryFlowViewModel(graph, {
            storyState: goToStoryNode(storyState, 'scene.qa-fog.chapter3'),
        }).choices.find(choice => choice.id === 'choice.qa-fog.chapter3.blue-thread');
        expect(chapterChoice(victory.storyState)?.visible).toBe(true);
        expect(chapterChoice(defeat.storyState)?.visible).toBe(false);
    });
});
