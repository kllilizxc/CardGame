import { describe, expect, it } from 'bun:test';
import legacyGraph from '../../../../public/data/story/story-graph.executable.json';
import { evaluateStoryCondition, setStoryAttribute } from '../../state/StoryState';
import { createInitialStoryRuntime, createStoryChoiceTransition, createStoryFlowViewModel } from './storyFlowViewModel';
import { adaptStoryContentGraph } from './storyContentAdapter';

describe('legacy executable story adapter', () => {
    it('keeps checked-in conditions, tags, relations and location effects in the playable runtime', () => {
        const graph = adaptStoryContentGraph(legacyGraph);
        expect(graph.storyId).toBe('mainline.qingyun-entry.executable');
        const initial = createInitialStoryRuntime(graph);
        expect(initial.currentLocationLabel).toBe('青云宗山门之外');
        expect(initial.flags['story.sect_entry.arrived_at_gate']).toBe(true);

        const low = createStoryFlowViewModel(graph, { storyState: setStoryAttribute(initial, '心性', 49) });
        expect(low.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl')?.visible).toBe(false);
        const high = createStoryFlowViewModel(graph, { storyState: setStoryAttribute(initial, '心性', 50) });
        expect(high.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl')?.selectable).toBe(true);
        const transition = createStoryChoiceTransition(high, 'sect_entry_001_choice_help_girl');
        expect(transition.status).toBe('selected');
        if (transition.status !== 'selected') return;
        expect(transition.nextStoryState.flags['story.sect_entry.helped_frail_girl']).toBe(true);
        expect(transition.nextStoryState.relations.npc_frail_girl).toBe(5);
        expect(transition.nextStoryState.flags['player.tag:善意初显']).toBe(true);
        expect(evaluateStoryCondition(transition.nextStoryState, { kind: 'flag', flag: 'player.tag:善意初显' })).toBe(true);
        expect(initial.relations.npc_frail_girl).toBeUndefined();
    });

    it('reports unsupported legacy scene launches instead of dropping them', () => {
        const graph = structuredClone(legacyGraph) as any;
        graph.choices[0].effects.push({ op: 'startExpedition', expeditionId: 'missing-route' });
        expect(() => adaptStoryContentGraph(graph)).toThrow('needs an explicit playable scene target');
    });
});
