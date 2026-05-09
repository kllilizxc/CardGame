import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../../public/data/story/story-graph.json';

import {
    chooseStoryChoice,
    createStoryNodeView,
    validatePlayableStoryGraph,
} from './storyFlow';

describe('storyFlow', () => {
    it('validates the checked-in example story as a playable graph', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);

        expect(graph.entryNodeId).toBe('sect_entry_001');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_002_wait_in_line');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_003_help_girl');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_004_trial_bell');
    });

    it('creates a readable entry view with the visible choices', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const view = createStoryNodeView(graph, graph.entryNodeId);

        expect(view.node.title).toBe('初到青云宗山门');
        expect(view.metadataLine).toBe('第一章·入宗 · 青云宗山门 · 白日');
        expect(view.isTerminal).toBe(false);
        expect(view.choices.map((choice) => choice.text)).toEqual([
            '老老实实排队等待入宗考核',
            '注意到队伍中有一名体弱少女，主动上前搭话。',
        ]);
    });

    it('advances through an available choice and exposes the next node choices', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);

        const result = chooseStoryChoice(
            graph,
            'sect_entry_001',
            'sect_entry_001_choice_1',
        );

        expect(result.status).toBe('advanced');

        if (result.status !== 'advanced') {
            throw new Error('Expected choice to advance.');
        }

        expect(result.statusText).toBe('已选择：老老实实排队等待入宗考核');
        expect(result.view.node.id).toBe('sect_entry_002_wait_in_line');
        expect(result.view.choices.map((choice) => choice.id)).toEqual(['sect_entry_002_choice_1']);
    });

    it('marks a node with no outgoing choices as terminal', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const result = chooseStoryChoice(
            graph,
            'sect_entry_002_wait_in_line',
            'sect_entry_002_choice_1',
        );

        expect(result.status).toBe('advanced');

        if (result.status !== 'advanced') {
            throw new Error('Expected choice to advance.');
        }

        expect(result.view.node.id).toBe('sect_entry_004_trial_bell');
        expect(result.view.isTerminal).toBe(true);
        expect(result.view.choices).toEqual([]);
    });

    it('keeps the current node when a choice is unavailable', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);

        expect(chooseStoryChoice(graph, 'sect_entry_001', 'missing-choice')).toEqual({
            status: 'invalid-choice',
            currentNodeId: 'sect_entry_001',
            statusText: '该选择不可用：missing-choice',
        });
    });
});
