import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../public/data/story/story-graph.executable.json';

import {
    applyStoryEffects,
    evaluateStoryCondition,
    validateStoryContentGraph,
    type StoryRuntimeState,
} from './storyContent';

describe('validateStoryContentGraph', () => {
    it('parses the checked-in executable mainline story graph', () => {
        const graph = validateStoryContentGraph(storyGraphJson);

        expect(graph.schemaVersion).toBe(1);
        expect(graph.entryNodeId).toBe('sect_entry_001');
        expect(graph.nodes.map((node) => node.id)).toContain('sect_entry_001');
        expect(graph.choices.map((choice) => choice.id)).toContain('sect_entry_001_choice_help_girl');

        const helpGirlChoice = graph.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl');

        expect(helpGirlChoice?.visibleWhen).toEqual({
            op: 'attributeAtLeast',
            path: 'player.attributes.心性',
            value: 50,
        });
        expect(helpGirlChoice?.effects).toContainEqual({
            op: 'adjustRelation',
            npcId: 'npc_frail_girl',
            amount: 5,
        });
    });

    it('rejects choices that target missing story nodes', () => {
        const brokenGraph = structuredClone(storyGraphJson);
        brokenGraph.choices[0].to = 'missing_story_node';

        expect(() => validateStoryContentGraph(brokenGraph)).toThrow('missing_story_node');
    });

    it('rejects duplicate node ids before runtime traversal can become ambiguous', () => {
        const brokenGraph = structuredClone(storyGraphJson);
        brokenGraph.nodes.push(structuredClone(brokenGraph.nodes[0]));

        expect(() => validateStoryContentGraph(brokenGraph)).toThrow('Duplicate story node id');
    });

    it('rejects unknown condition operations', () => {
        const brokenGraph = structuredClone(storyGraphJson);
        brokenGraph.choices[0].visibleWhen = { op: 'askPlannerAtRuntime' };

        expect(() => validateStoryContentGraph(brokenGraph)).toThrow('askPlannerAtRuntime');
    });
});

describe('executable story conditions and effects', () => {
    it('evaluates a structured visibility condition against runtime state', () => {
        const graph = validateStoryContentGraph(storyGraphJson);
        const helpGirlChoice = graph.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl');
        const cautiousState: StoryRuntimeState = {
            flags: [],
            player: {
                attributes: {
                    心性: 55,
                },
                tags: ['凡人出身'],
            },
            relations: {},
        };
        const coldState: StoryRuntimeState = {
            ...cautiousState,
            player: {
                attributes: {
                    心性: 35,
                },
                tags: ['凡人出身'],
            },
        };

        if (!helpGirlChoice?.visibleWhen) {
            throw new Error('Expected the help-girl choice to define visibleWhen.');
        }

        expect(evaluateStoryCondition(helpGirlChoice.visibleWhen, cautiousState)).toBe(true);
        expect(evaluateStoryCondition(helpGirlChoice.visibleWhen, coldState)).toBe(false);
    });

    it('applies structured choice effects without mutating the input state', () => {
        const graph = validateStoryContentGraph(storyGraphJson);
        const helpGirlChoice = graph.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl');
        const initialState: StoryRuntimeState = {
            flags: [],
            location: '青云宗山门之外',
            player: {
                attributes: {
                    心性: 55,
                },
                tags: ['凡人出身'],
            },
            relations: {},
        };

        if (!helpGirlChoice) {
            throw new Error('Expected the executable example to contain the help-girl choice.');
        }

        const nextState = applyStoryEffects(helpGirlChoice.effects, initialState);

        expect(initialState.flags).toEqual([]);
        expect(nextState.flags).toContain('story.sect_entry.helped_frail_girl');
        expect(nextState.relations?.npc_frail_girl).toBe(5);
    });
});
