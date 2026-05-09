import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../../public/data/story/story-graph.json';

import { validatePlayableStoryGraph } from './storyFlow';

describe('storyFlow', () => {
    it('validates the checked-in example story as a StoryState-backed playable graph', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);

        expect(graph.storyId).toBe('story.qingyun-entry');
        expect(graph.entryNodeId).toBe('sect_entry_001');
        expect(graph.initialState).toMatchObject({
            storyId: 'story.qingyun-entry',
            locationId: 'location.qingyun-gate',
            sublocationId: 'sublocation.qingyun.gate-plaza',
            nodeId: 'sect_entry_001',
        });
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_002_wait_in_line');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_003_help_girl');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_004_trial_bell');
        expect(graph.nodes.map((node) => node.sublocationId)).toEqual(expect.arrayContaining([
            'sublocation.qingyun.gate-plaza',
            'sublocation.qingyun.outer-steps',
            'sublocation.qingyun.queue-edge',
            'sublocation.qingyun.trial-bell',
        ]));
        expect(graph.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl')?.enabledWhen).toEqual({
            kind: 'attribute',
            attribute: '心性',
            operator: '>=',
            value: 50,
        });
        expect(graph.choices.find((choice) => choice.id === 'sect_entry_003_choice_ask_bell')?.enabledWhen).toEqual({
            kind: 'any',
            conditions: [
                { kind: 'flag', flag: 'story.sect_entry.helped_frail_girl' },
                { kind: 'triggeredDialogue', dialogueId: 'dialogue.frail_girl.intro' },
            ],
        });
        expect(graph.choices.map((choice) => choice.to)).toEqual([
            'sect_entry_002_wait_in_line',
            'sect_entry_003_help_girl',
            'sect_entry_004_trial_bell',
            'sect_entry_003_bell_secret',
            'sect_entry_004_trial_bell',
            'sect_entry_004_trial_bell',
        ]);
    });

    it('rejects a synthetic broken graph with a missing target node', () => {
        const brokenGraph = structuredClone(storyGraphJson);
        brokenGraph.choices[0].to = 'missing_story_node';

        expect(() => validatePlayableStoryGraph(brokenGraph)).toThrow(
            'Story graph choice sect_entry_001_choice_wait_in_line points to missing node: missing_story_node',
        );
    });

    it('rejects malformed structured conditions and effects', () => {
        const brokenConditionGraph = structuredClone(storyGraphJson);
        brokenConditionGraph.choices[1].enabledWhen = {
            kind: 'attribute',
            attribute: '心性',
            operator: 'atLeast',
            value: 50,
        };

        expect(() => validatePlayableStoryGraph(brokenConditionGraph)).toThrow(
            'Story graph choices[1].enabledWhen.operator must be one of >, >=, <, <=, ==, !=.',
        );

        const brokenEffectGraph = structuredClone(storyGraphJson);
        brokenEffectGraph.choices[0].effects[0] = {
            kind: 'setFlag',
        };

        expect(() => validatePlayableStoryGraph(brokenEffectGraph)).toThrow(
            'Story graph choices[0].effects[0].flag must be a non-empty string.',
        );
    });

    it('exposes only strict graph validation at runtime so storyFlowViewModel owns render and transition view models', async () => {
        const runtimeExports = await import('./storyFlow');

        expect(Object.keys(runtimeExports).sort()).toEqual(['validatePlayableStoryGraph']);
    });
});
