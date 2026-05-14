import { describe, expect, it } from 'bun:test';

import compactStoryGraphJson from '../../../../public/data/story/story-graph.compact.example.json';
import storyGraphJson from '../../../../public/data/story/story-graph.json';
import tutorialEntryStoryJson from '../../../../public/data/story/tutorial-qingyun-entry.json';
import tutorialTeahouseStoryJson from '../../../../public/data/story/tutorial-qingyun-teahouse-rumor.json';

import { validatePlayableStoryGraph } from './storyFlow';

describe('storyFlow', () => {
    it('keeps the compact authoring example valid against the playable StoryState schema', () => {
        const graph = validatePlayableStoryGraph(compactStoryGraphJson);

        expect(graph.storyId).toBe('story.example.compact');
        expect(graph.entryNodeId).toBe('start');
        expect(graph.nodes.map((node) => node.id)).toEqual(['start', 'finish']);
        expect(graph.choices[0]).toMatchObject({
            id: 'start_choice_finish',
            from: 'start',
            to: 'finish',
            enabledWhen: {
                kind: 'attribute',
                attribute: '心性',
                operator: '>=',
                value: 1,
            },
            effects: [
                {
                    kind: 'setFlag',
                    flag: 'story.example.chose_finish',
                },
            ],
        });
    });

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

    it('validates the tutorial Qingyun entry front half with choices, deterministic duel, and continuation', () => {
        const graph = validatePlayableStoryGraph(tutorialEntryStoryJson);
        const nodeIds = graph.nodes.map((node) => node.id);

        expect(graph.storyId).toBe('tutorial.qingyun-story-entry');
        expect(graph.entryNodeId).toBe('tutorial_entry_001_foothill_notice');
        expect(nodeIds).toEqual([
            'tutorial_entry_001_foothill_notice',
            'tutorial_entry_002_waiting_queue',
            'tutorial_entry_003_patient_line',
            'tutorial_entry_003_help_frail_girl',
            'tutorial_entry_004_bell_secret',
            'tutorial_entry_005_mind_bell_duel',
            'tutorial_entry_006_mind_duel_victory',
            'tutorial_entry_006_mind_duel_defeat',
            'tutorial_entry_007_outer_mountain_lead',
        ]);
        expect(JSON.stringify(tutorialEntryStoryJson)).not.toContain('骨架');
        expect(JSON.stringify(tutorialEntryStoryJson)).not.toContain('后续批次');

        expect(graph.choices.find((choice) => choice.id === 'tutorial_entry_002_choice_help_frail_girl')?.enabledWhen).toEqual({
            kind: 'attribute',
            attribute: '心性',
            operator: '>=',
            value: 50,
        });
        expect(graph.choices.map((choice) => choice.to)).toEqual([
            'tutorial_entry_002_waiting_queue',
            'tutorial_entry_003_patient_line',
            'tutorial_entry_003_help_frail_girl',
            'tutorial_entry_005_mind_bell_duel',
            'tutorial_entry_004_bell_secret',
            'tutorial_entry_005_mind_bell_duel',
            'tutorial_entry_005_mind_bell_duel',
            'tutorial_entry_007_outer_mountain_lead',
            'tutorial_entry_007_outer_mountain_lead',
        ]);

        const battleNode = graph.nodes.find((node) => node.id === 'tutorial_entry_005_mind_bell_duel');
        const battleEffect = battleNode?.onEnter.find((effect) => effect.kind === 'startBattle');

        expect(battleEffect).toEqual({
            kind: 'startBattle',
            battle: {
                battleId: 'tutorial.qingyun.battle.mind-echo',
                encounterResourceId: 'tutorial.qingyun-encounter-mind-echo',
                encounterId: 'tutorial.qingyun-encounter-mind-echo',
                encounterFile: 'data/encounters/tutorial-qingyun-mind-echo.json',
                deckResourceId: 'tutorial.qingyun-deck-casket-starter',
                deckFile: 'data/decks/tutorial-qingyun-casket-starter.json',
                deterministicBattleSetup: {
                    deckOrder: 'preserve-json-order',
                },
                onVictoryNodeId: 'tutorial_entry_006_mind_duel_victory',
                onDefeatNodeId: 'tutorial_entry_006_mind_duel_defeat',
                launchText: '问心钟声中的狐影压低身形，执事提醒你按卡匣显现的顺序完成第一轮演武。',
            },
        });
    });

    it('validates the tutorial teahouse rumor as story-choice setup instead of a placeholder', () => {
        const graph = validatePlayableStoryGraph(tutorialTeahouseStoryJson);

        expect(graph.storyId).toBe('tutorial.qingyun-story-teahouse-rumor');
        expect(graph.entryNodeId).toBe('tutorial_teahouse_001_arrive');
        expect(graph.nodes.map((node) => node.id)).toEqual([
            'tutorial_teahouse_001_arrive',
            'tutorial_teahouse_002_listen',
            'tutorial_teahouse_003_depart_for_gate',
        ]);
        expect(JSON.stringify(tutorialTeahouseStoryJson)).not.toContain('骨架');
        expect(JSON.stringify(tutorialTeahouseStoryJson)).not.toContain('后续批次');
        expect(graph.choices.map((choice) => choice.id)).toEqual([
            'tutorial_teahouse_001_choice_listen',
            'tutorial_teahouse_002_choice_depart',
        ]);
        expect(graph.nodes[1].onEnter).toEqual(expect.arrayContaining([
            {
                kind: 'setFlag',
                flag: 'tutorial.qingyun.teahouse.heard_mind_step',
            },
            {
                kind: 'adjustAttribute',
                attribute: '悟性',
                delta: 1,
            },
        ]));
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

    it('validates story battle trigger effects and their explicit result nodes', () => {
        const battleGraph = structuredClone(compactStoryGraphJson);
        battleGraph.storyId = 'story.example.battle-trigger';
        battleGraph.nodes = [
            ...battleGraph.nodes,
            {
                id: 'duel_pending',
                type: 'story',
                title: '试炼切磋',
                summary: '执事点名要求玩家以卡匣应战。',
                detail: '战斗尚未接入场景往返，但剧情图已经声明了启动元数据。',
                tags: ['示例', '战斗'],
                chapter: '示例章',
                location: '示例地点',
                sublocation: '演武台',
                locationId: 'location.example',
                sublocationId: 'sublocation.example.duel',
                timeHint: '清晨',
                onEnter: [],
            },
            {
                id: 'duel_victory',
                type: 'story',
                title: '切磋胜利',
                summary: '玩家赢下演示战斗。',
                detail: '胜利后回到剧情图。',
                tags: ['示例', '胜利'],
                chapter: '示例章',
                location: '示例地点',
                sublocation: '演武台',
                locationId: 'location.example',
                sublocationId: 'sublocation.example.duel',
                timeHint: '清晨',
                onEnter: [],
            },
            {
                id: 'duel_defeat',
                type: 'story',
                title: '切磋失利',
                summary: '玩家输掉演示战斗。',
                detail: '失败后回到剧情图。',
                tags: ['示例', '失败'],
                chapter: '示例章',
                location: '示例地点',
                sublocation: '演武台',
                locationId: 'location.example',
                sublocationId: 'sublocation.example.duel',
                timeHint: '清晨',
                onEnter: [],
            },
        ];
        battleGraph.choices[0].to = 'duel_pending';
        battleGraph.choices[0].effects = [
            {
                kind: 'startBattle',
                battle: {
                    battleId: 'story.example.first-duel',
                    encounterResourceId: 'test_encounter_01',
                    encounterId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                    deckResourceId: 'deck.starter',
                    deckFile: 'data/decks/starter-deck.json',
                    deterministicBattleSetup: {
                        deckOrder: 'preserve-json-order',
                    },
                    onVictoryNodeId: 'duel_victory',
                    onDefeatNodeId: 'duel_defeat',
                    launchText: '执事示意你以卡匣应战。',
                },
            },
        ];

        const graph = validatePlayableStoryGraph(battleGraph);

        expect(graph.choices[0].effects).toEqual([
            {
                kind: 'startBattle',
                battle: {
                    battleId: 'story.example.first-duel',
                    encounterResourceId: 'test_encounter_01',
                    encounterId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                    deckResourceId: 'deck.starter',
                    deckFile: 'data/decks/starter-deck.json',
                    deterministicBattleSetup: {
                        deckOrder: 'preserve-json-order',
                    },
                    onVictoryNodeId: 'duel_victory',
                    onDefeatNodeId: 'duel_defeat',
                    launchText: '执事示意你以卡匣应战。',
                },
            },
        ]);

        const brokenGraph = structuredClone(battleGraph);
        brokenGraph.choices[0].effects[0].battle.onVictoryNodeId = 'missing_victory_node';

        expect(() => validatePlayableStoryGraph(brokenGraph)).toThrow(
            'Story graph choices[0].effects[0].battle.onVictoryNodeId must reference an existing node: missing_victory_node',
        );

        const brokenSetupGraph = structuredClone(battleGraph);
        brokenSetupGraph.choices[0].effects[0].battle.deterministicBattleSetup.deckOrder = 'debug-no-shuffle';

        expect(() => validatePlayableStoryGraph(brokenSetupGraph)).toThrow(
            'Story graph choices[0].effects[0].battle.deterministicBattleSetup.deckOrder must be preserve-json-order when deterministic battle setup is provided.',
        );
    });

    it('exposes only strict graph validation at runtime so storyFlowViewModel owns render and transition view models', async () => {
        const runtimeExports = await import('./storyFlow');

        expect(Object.keys(runtimeExports).sort()).toEqual(['validatePlayableStoryGraph']);
    });
});
