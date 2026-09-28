import { describe, expect, it } from 'bun:test';

import graphJson from '../../../../public/data/story/qa-fog-fox.json';
import npcJson from '../../../../public/data/world/npcs.json';
import { planStoryRewards, attachStoryItemCounts } from '../../services/StoryCardGrantPersistence';
import { attachStoryActorAbilities } from '../../state/StoryState';
import type { PersistentStash } from '../../types/expedition';
import type { StoryState } from '../../types/story';
import { validatePlayableStoryGraph } from './storyFlow';
import { createInitialStoryRuntime, createStoryChoiceTransition, createStoryFlowViewModel } from './storyFlowViewModel';

const graph = validatePlayableStoryGraph(graphJson);

function route(attributes: Record<string, number> = {}) {
    let state: StoryState = attachStoryActorAbilities(createInitialStoryRuntime(graph), npcJson.npcs);
    state = { ...state, attributes: { ...state.attributes, ...attributes } };
    let stash: PersistentStash = { stashId: 'qa-fog-route', deck: [], items: [], spiritStones: 0 };
    const view = () => createStoryFlowViewModel(graph, { storyState: attachStoryItemCounts(state, stash) });
    const choice = (id: string) => view().choices.find(candidate => candidate.id === id);
    const choose = (id: string) => {
        const result = createStoryChoiceTransition(view(), id);
        if (result.status !== 'selected') throw new Error(`${id}: ${result.reason}`);
        stash = planStoryRewards(stash, result.nextStoryState.cardGrants ?? [], result.nextStoryState.itemTransactions ?? []);
        state = result.nextStoryState;
        return result;
    };
    return { view, choice, choose, get state() { return state; }, get stash() { return stash; } };
}

describe('雾林遇狐的玩家路线', () => {
    it('lets the ordinary visitor finish without persuasion or medicine, then keeps the reward once', () => {
        const play = route();
        play.choose('choice.qa-fog.entry.first');
        play.choose('choice.qa-fog.first.ask-secret');
        expect(play.choice('choice.qa-fog.secret.promise')).toMatchObject({ visible: true, selectable: false });
        play.choose('choice.qa-fog.secret.leave');
        expect(play.stash.items.map(item => [item.id, item.count])).toEqual([
            ['tool.qa-fog-silver-needle', 1],
            ['consumable.qa-fog-white-leaf', 2],
        ]);
        play.choose('choice.qa-fog.gather.regular');
        expect(play.state.questStages?.['quest.qa-fog-heal-fox']).toBe('completed');
        expect(play.stash.items.find(item => item.id === 'consumable.qa-fog-white-leaf')?.count).toBe(1);
        expect(play.stash.deck).toEqual([{ id: 'CR_001', count: 1 }]);
        expect(planStoryRewards(play.stash, play.state.cardGrants ?? [], play.state.itemTransactions ?? [])).toBe(play.stash);
        play.choose('choice.qa-fog.healed.chapter3');
        expect(play.choice('choice.qa-fog.chapter3.trusted')?.visible).toBe(false);
        expect(play.choice('choice.qa-fog.chapter3.alternative')?.selectable).toBe(true);
    });

    it('lets a persuasive visitor make a promise and receive the later trusted route', () => {
        const play = route({ 口才: 6 });
        play.choose('choice.qa-fog.entry.first');
        play.choose('choice.qa-fog.first.ask-secret');
        expect(play.choice('choice.qa-fog.secret.promise')?.selectable).toBe(true);
        play.choose('choice.qa-fog.secret.promise');
        expect(play.state.flags['qa-fog.promised']).toBe(true);
        expect(play.state.relations['npc.qa-fog-fox']).toBe(30);
        play.choose('choice.qa-fog.promised.gather');
        play.choose('choice.qa-fog.gather.regular');
        play.choose('choice.qa-fog.healed.chapter3');
        expect(play.choice('choice.qa-fog.chapter3.trusted')?.selectable).toBe(true);
        expect(play.choice('choice.qa-fog.chapter3.alternative')?.visible).toBe(false);
        play.choose('choice.qa-fog.chapter3.trusted');
        expect(play.state.flags['qa-fog.chapter3-help']).toBe(true);
    });

    it('keeps the guard informed and the later response different after reporting', () => {
        const play = route({ 口才: 6 });
        play.choose('choice.qa-fog.entry.first');
        play.choose('choice.qa-fog.first.ask-secret');
        play.choose('choice.qa-fog.secret.report');
        expect(play.state.knowledge?.['npc.qa-fog-guard']).toContain('qa-fog.fox-identity');
        expect(play.state.relations['npc.qa-fog-fox']).toBe(0);
        play.choose('choice.qa-fog.guard.return');
        expect(play.choice('choice.qa-fog.revisit.reproach')?.selectable).toBe(true);
        expect(play.choice('choice.qa-fog.revisit.secret')?.visible).toBe(false);
        play.choose('choice.qa-fog.revisit.reproach');
        play.choose('choice.qa-fog.reproach.help');
        play.choose('choice.qa-fog.gather.regular');
        play.choose('choice.qa-fog.healed.chapter3');
        expect(play.choice('choice.qa-fog.chapter3.trusted')?.visible).toBe(false);
        expect(play.choice('choice.qa-fog.chapter3.alternative')?.selectable).toBe(true);
    });

    it('consumes one herb for the trained healer while preserving the silver needle', () => {
        const play = route({ 医术: 4 });
        play.choose('choice.qa-fog.entry.first');
        play.choose('choice.qa-fog.first.observe');
        expect(play.choice('choice.qa-fog.diagnosis.needle')?.selectable).toBe(false);
        play.choose('choice.qa-fog.diagnosis.prepare');
        play.choose('choice.qa-fog.gather.needle');
        expect(play.choice('choice.qa-fog.diagnosis.needle')?.selectable).toBe(true);
        play.choose('choice.qa-fog.diagnosis.needle');
        expect(play.state.flags['qa-fog.needle-route']).toBe(true);
        expect(play.stash.items.find(item => item.id === 'tool.qa-fog-silver-needle')?.count).toBe(1);
        expect(play.stash.items.find(item => item.id === 'consumable.qa-fog-white-leaf')?.count).toBe(1);
        expect(play.stash.deck).toEqual([{ id: 'CR_001', count: 1 }]);
    });
});
