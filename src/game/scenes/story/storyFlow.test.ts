import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../../public/data/story/story-graph.json';

import { validatePlayableStoryGraph } from './storyFlow';

describe('storyFlow', () => {
    it('validates the checked-in example story as a playable graph', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);

        expect(graph.entryNodeId).toBe('sect_entry_001');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_002_wait_in_line');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_003_help_girl');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_004_trial_bell');
        expect(graph.choices.map((choice) => choice.to)).toEqual([
            'sect_entry_002_wait_in_line',
            'sect_entry_003_help_girl',
            'sect_entry_004_trial_bell',
            'sect_entry_004_trial_bell',
        ]);
    });

    it('rejects a synthetic broken graph with a missing target node', () => {
        const brokenGraph = structuredClone(storyGraphJson);
        brokenGraph.choices[0].to = 'missing_story_node';

        expect(() => validatePlayableStoryGraph(brokenGraph)).toThrow(
            'Story graph choice sect_entry_001_choice_1 points to missing node: missing_story_node',
        );
    });

    it('exposes only strict graph validation at runtime so storyFlowViewModel owns render and transition view models', async () => {
        const runtimeExports = await import('./storyFlow');

        expect(Object.keys(runtimeExports).sort()).toEqual(['validatePlayableStoryGraph']);
    });
});
