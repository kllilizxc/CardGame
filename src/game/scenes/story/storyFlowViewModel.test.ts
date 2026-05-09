import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../../public/data/story/story-graph.json';
import initialWorldState from '../../../../public/data/world/initial-state.json';

import { goToStoryNode, setStoryAttribute } from '../../state/StoryState';
import { validatePlayableStoryGraph } from './storyFlow';
import {
    createInitialStoryRuntime,
    createStoryChoiceTransition,
    createStoryFlowViewModel,
    type StoryGraphDefinition,
} from './storyFlowViewModel';

describe('storyFlowViewModel', () => {
    it('creates an entry-node view with readable StoryState-backed story context and outgoing choices', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const view = createStoryFlowViewModel(graph, {
            storyState: createInitialStoryRuntime(graph),
        });

        expect(view.currentNode).toMatchObject({
            id: 'sect_entry_001',
            type: 'story',
            title: '初到青云宗山门',
            summary: '玩家随凡人队伍抵达青云宗山门，准备参加入宗试炼。',
            subtitle: '第一章·入宗 · 青云宗山门 · 山门广场 · 白日',
            tags: ['门派', '入门试炼', '主线'],
            chapter: '第一章·入宗',
            location: '青云宗山门',
            sublocation: '山门广场',
            locationId: 'location.qingyun-gate',
            sublocationId: 'sublocation.qingyun.gate-plaza',
            timeHint: '白日',
            aiHints: {
                tone: '仙气缥缈，带一点庄严',
                theme: ['初入仙门', '凡人对仙道的向往'],
                forbid: ['直接给予过强的实力', '无缘由的金手指掉落'],
            },
        });
        expect(view.statusText).toBe('当前剧情：初到青云宗山门（第一章·入宗 · 青云宗山门 · 山门广场 · 白日）。可见选项 2 个，推荐 1 个。');
        expect(view.stateLine).toBe('当前位置：location.qingyun-gate / sublocation.qingyun.gate-plaza');
        expect(view.warnings).toEqual([]);
        expect(view.choices.map((choice) => choice.text)).toEqual([
            '老老实实排队等待入宗考核',
            '注意到队伍中有一名体弱少女，主动上前搭话。',
        ]);
        expect(view.choices[0].conditionSummary).toBe('未设置标记 story.sect_entry.disrupted_line');
        expect(view.choices[0].effectSummary).toBe('setFlag / adjustAttribute / adjustRelation');
    });

    it('marks structured attribute-gated choices as recommended and disables them when unmet', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const recommendedView = createStoryFlowViewModel(graph, {
            worldState: structuredClone(initialWorldState),
        });
        const helpGirlChoice = recommendedView.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl');

        expect(helpGirlChoice?.visible).toBe(true);
        expect(helpGirlChoice?.selectable).toBe(true);
        expect(helpGirlChoice?.recommended).toBe(true);
        expect(helpGirlChoice?.recommendationReason).toBe('满足推荐条件：心性 55 ≥ 50。');

        const lowCompassionState = setStoryAttribute(createInitialStoryRuntime(graph), '心性', 40);
        const notRecommendedView = createStoryFlowViewModel(graph, {
            storyState: lowCompassionState,
        });
        const notRecommendedChoice = notRecommendedView.choices.find((choice) => choice.id === 'sect_entry_001_choice_help_girl');

        expect(notRecommendedChoice?.visible).toBe(true);
        expect(notRecommendedChoice?.selectable).toBe(false);
        expect(notRecommendedChoice?.recommended).toBe(false);
        expect(notRecommendedChoice?.recommendationReason).toBe('未满足推荐条件：心性 40 ≥ 50。');
        expect(notRecommendedChoice?.disabledReason).toBe('条件未满足：心性 40 >= 50');
        expect(createStoryChoiceTransition(notRecommendedView, 'sect_entry_001_choice_help_girl')).toEqual({
            status: 'blocked',
            choiceId: 'sect_entry_001_choice_help_girl',
            reason: '条件未满足：心性 40 >= 50',
        });
    });

    it('surfaces synthetic missing target nodes as disabled choices and warnings instead of relying on the playable example graph being broken', () => {
        const brokenGraph: StoryGraphDefinition = {
            entryNodeId: 'start',
            nodes: [
                {
                    id: 'start',
                    type: 'story',
                    title: '残缺草稿',
                    summary: '作者还没有补完后续节点。',
                    detail: '入口节点仍然应该能渲染。',
                    tags: ['测试'],
                },
            ],
            choices: [
                {
                    id: 'draft_choice_1',
                    from: 'start',
                    to: 'missing_story_node_1',
                    text: '进入尚未配置的节点一',
                    description: '用于测试缺失目标一。',
                    flags: ['测试'],
                },
                {
                    id: 'draft_choice_2',
                    from: 'start',
                    to: 'missing_story_node_2',
                    text: '进入尚未配置的节点二',
                    description: '用于测试缺失目标二。',
                    flags: ['测试'],
                },
            ],
        };
        const view = createStoryFlowViewModel(brokenGraph, {
            worldState: structuredClone(initialWorldState),
        });

        expect(view.choices.every((choice) => choice.visible)).toBe(true);
        expect(view.choices.every((choice) => choice.selectable === false)).toBe(true);
        expect(view.choices.map((choice) => choice.disabledReason)).toEqual([
            '后续剧情节点未配置：missing_story_node_1',
            '后续剧情节点未配置：missing_story_node_2',
        ]);
        expect(view.warnings).toEqual([
            '选项 draft_choice_1 指向未配置节点 missing_story_node_1。',
            '选项 draft_choice_2 指向未配置节点 missing_story_node_2。',
        ]);
        expect(createStoryChoiceTransition(view, 'draft_choice_1')).toEqual({
            status: 'blocked',
            choiceId: 'draft_choice_1',
            reason: '后续剧情节点未配置：missing_story_node_1',
        });
    });

    it('uses runtime story state to render a resumed node and create a selectable transition', () => {
        const graph: StoryGraphDefinition = {
            entryNodeId: 'start',
            nodes: [
                {
                    id: 'start',
                    type: 'story',
                    title: '山门外',
                    summary: '等待考核。',
                    detail: '山风微凉。',
                    tags: ['主线'],
                },
                {
                    id: 'trial',
                    type: 'story',
                    title: '问心阶',
                    summary: '踏上石阶。',
                    detail: '石阶映出杂念。',
                    tags: ['考核'],
                    chapter: '第一章·入宗',
                    location: '问心阶',
                },
            ],
            choices: [
                {
                    id: 'start_to_trial',
                    from: 'start',
                    to: 'trial',
                    text: '踏上问心阶',
                    flags: ['主线'],
                },
            ],
        };

        const view = createStoryFlowViewModel(graph, {
            currentNodeId: 'start',
            visitedNodeIds: ['start'],
            selectedChoiceIds: [],
            worldState: structuredClone(initialWorldState),
        });

        expect(view.currentNode.id).toBe('start');
        expect(view.choices).toHaveLength(1);
        expect(view.choices[0]).toMatchObject({
            id: 'start_to_trial',
            to: 'trial',
            targetExists: true,
            selectable: true,
            disabledReason: null,
        });
        expect(createStoryChoiceTransition(view, 'start_to_trial')).toMatchObject({
            status: 'selected',
            choiceId: 'start_to_trial',
            fromNodeId: 'start',
            toNodeId: 'trial',
            nextVisitedNodeIds: ['start', 'trial'],
            nextSelectedChoiceIds: ['start_to_trial'],
            appliedEffectKinds: ['goToNode'],
        });
    });

    it('returns battle launch metadata when a selected story choice triggers combat', () => {
        const graph: StoryGraphDefinition = {
            storyId: 'story.test-battle',
            entryNodeId: 'start',
            nodes: [
                {
                    id: 'start',
                    type: 'story',
                    title: '山门外',
                    summary: '等待考核。',
                    detail: '山风微凉。',
                    tags: ['主线'],
                },
                {
                    id: 'duel_pending',
                    type: 'story',
                    title: '演武台前',
                    summary: '执事点名要求玩家切磋。',
                    detail: '战斗场景稍后再接入。',
                    tags: ['战斗'],
                },
                {
                    id: 'duel_victory',
                    type: 'story',
                    title: '胜利',
                    summary: '赢下切磋。',
                    detail: '胜利后继续剧情。',
                    tags: ['战斗'],
                },
                {
                    id: 'duel_defeat',
                    type: 'story',
                    title: '失败',
                    summary: '输掉切磋。',
                    detail: '失败后继续剧情。',
                    tags: ['战斗'],
                },
            ],
            choices: [
                {
                    id: 'start_to_duel',
                    from: 'start',
                    to: 'duel_pending',
                    text: '以卡匣应战',
                    flags: ['主线', '战斗'],
                    effects: [
                        {
                            kind: 'startBattle',
                            battle: {
                                battleId: 'story.test-battle.first-duel',
                                encounterId: 'test_encounter_01',
                                encounterFile: 'data/encounters/test-enemy.json',
                                deckFile: 'data/decks/starter-deck.json',
                                onVictoryNodeId: 'duel_victory',
                                onDefeatNodeId: 'duel_defeat',
                                launchText: '执事示意你以卡匣应战。',
                            },
                        },
                    ],
                },
            ],
        };

        const view = createStoryFlowViewModel(graph, {
            currentNodeId: 'start',
            visitedNodeIds: ['start'],
            selectedChoiceIds: [],
            worldState: structuredClone(initialWorldState),
        });
        const transition = createStoryChoiceTransition(view, 'start_to_duel');

        expect(transition).toMatchObject({
            status: 'selected',
            choiceId: 'start_to_duel',
            fromNodeId: 'start',
            toNodeId: 'duel_pending',
            battleLaunch: {
                sceneKey: 'BattleScene',
                storyId: 'story.test-battle',
                sourceNodeId: 'start',
                sourceChoiceId: 'start_to_duel',
                targetNodeId: 'duel_pending',
                battleId: 'story.test-battle.first-duel',
                encounterId: 'test_encounter_01',
                encounterFile: 'data/encounters/test-enemy.json',
                deckFile: 'data/decks/starter-deck.json',
                onVictoryNodeId: 'duel_victory',
                onDefeatNodeId: 'duel_defeat',
                launchText: '执事示意你以卡匣应战。',
            },
            appliedEffectKinds: ['startBattle', 'goToNode'],
        });
    });

    it('applies choice effects and target node enter effects while moving between sublocations deterministically', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const initialView = createStoryFlowViewModel(graph, {
            storyState: createInitialStoryRuntime(graph),
        });
        const waitResult = createStoryChoiceTransition(initialView, 'sect_entry_001_choice_wait_in_line');

        expect(waitResult.status).toBe('selected');

        if (waitResult.status !== 'selected') {
            throw new Error('Expected the wait-in-line choice to advance.');
        }

        expect(waitResult.nextStoryState.currentNodeId).toBe('sect_entry_002_wait_in_line');
        expect(waitResult.nextStoryState.currentSublocationId).toBe('sublocation.qingyun.outer-steps');
        expect(waitResult.nextStoryState.flags['story.sect_entry.chose_patient_line']).toBe(true);
        expect(waitResult.nextStoryState.flags['story.sect_entry.waited_patiently']).toBe(true);
        expect(waitResult.nextStoryState.attributes['心性']).toBe(56);
        expect(waitResult.nextStoryState.visitedNodeIds).toEqual([
            'sect_entry_001',
            'sect_entry_002_wait_in_line',
        ]);
        expect(waitResult.appliedEffectKinds).toEqual([
            'setFlag',
            'adjustAttribute',
            'adjustRelation',
            'goToNode',
            'moveTo',
            'setFlag',
        ]);

        const waitView = createStoryFlowViewModel(graph, {
            storyState: waitResult.nextStoryState,
            selectedChoiceIds: waitResult.nextSelectedChoiceIds,
        });
        const trialResult = createStoryChoiceTransition(waitView, 'sect_entry_002_choice_trial_bell');

        expect(trialResult.status).toBe('selected');

        if (trialResult.status !== 'selected') {
            throw new Error('Expected the trial-bell choice to advance.');
        }

        expect(trialResult.nextStoryState.currentNodeId).toBe('sect_entry_004_trial_bell');
        expect(trialResult.nextStoryState.currentSublocationId).toBe('sublocation.qingyun.trial-bell');
        expect(trialResult.battleLaunch).toMatchObject({
            sceneKey: 'BattleScene',
            storyId: 'story.qingyun-entry',
            sourceNodeId: 'sect_entry_002_wait_in_line',
            sourceChoiceId: 'sect_entry_002_choice_trial_bell',
            targetNodeId: 'sect_entry_004_trial_bell',
            battleId: 'story.qingyun.trial-bell-duel',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            onVictoryNodeId: 'sect_entry_005_trial_victory',
            onDefeatNodeId: 'sect_entry_005_trial_defeat',
        });
        expect(createStoryFlowViewModel(graph, { storyState: trialResult.nextStoryState }).choices.filter((choice) => choice.visible)).toEqual([]);
    });

    it('unlocks a later choice after a prior dialogue or flag effect', () => {
        const graph = validatePlayableStoryGraph(storyGraphJson);
        const initialState = createInitialStoryRuntime(graph);
        const jumpedStateWithoutPriorDialogue = goToStoryNode(initialState, 'sect_entry_003_help_girl');
        const lockedView = createStoryFlowViewModel(graph, {
            storyState: jumpedStateWithoutPriorDialogue,
        });
        const lockedBellChoice = lockedView.choices.find((choice) => choice.id === 'sect_entry_003_choice_ask_bell');

        expect(lockedBellChoice?.selectable).toBe(false);
        expect(lockedBellChoice?.disabledReason).toBe('条件未满足：需要任一条件满足');

        const initialView = createStoryFlowViewModel(graph, {
            storyState: initialState,
        });
        const helpResult = createStoryChoiceTransition(initialView, 'sect_entry_001_choice_help_girl');

        expect(helpResult.status).toBe('selected');

        if (helpResult.status !== 'selected') {
            throw new Error('Expected the help-girl choice to advance.');
        }

        expect(helpResult.nextStoryState.flags['story.sect_entry.helped_frail_girl']).toBe(true);
        expect(helpResult.nextStoryState.triggeredDialogueIds).toContain('dialogue.frail_girl.intro');

        const unlockedView = createStoryFlowViewModel(graph, {
            storyState: helpResult.nextStoryState,
            selectedChoiceIds: helpResult.nextSelectedChoiceIds,
        });
        const unlockedBellChoice = unlockedView.choices.find((choice) => choice.id === 'sect_entry_003_choice_ask_bell');

        expect(unlockedBellChoice?.selectable).toBe(true);
        expect(unlockedBellChoice?.disabledReason).toBeNull();

        const bellResult = createStoryChoiceTransition(unlockedView, 'sect_entry_003_choice_ask_bell');

        expect(bellResult.status).toBe('selected');

        if (bellResult.status !== 'selected') {
            throw new Error('Expected the unlocked bell choice to advance.');
        }

        expect(bellResult.nextStoryState.currentNodeId).toBe('sect_entry_003_bell_secret');
        expect(bellResult.nextStoryState.flags['story.sect_entry.bell_secret_learned']).toBe(true);
    });
});
