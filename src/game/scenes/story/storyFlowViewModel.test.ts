import { describe, expect, it } from 'bun:test';

import storyGraphJson from '../../../../public/data/story/story-graph.json';
import initialWorldState from '../../../../public/data/world/initial-state.json';

import {
    createStoryChoiceTransition,
    createStoryFlowViewModel,
    type StoryGraphDefinition,
} from './storyFlowViewModel';

describe('storyFlowViewModel', () => {
    it('creates an entry-node view with readable story context and outgoing choices', () => {
        const view = createStoryFlowViewModel(storyGraphJson, {
            worldState: structuredClone(initialWorldState),
        });

        expect(view.currentNode).toEqual({
            id: 'sect_entry_001',
            type: 'story',
            title: '初到青云宗山门',
            summary: '玩家随凡人队伍抵达青云宗山门，准备参加入宗试炼。',
            detail: '远山云雾缥缈，青云宗山门高立云间……（此处省略具体描写，可供 AI 扩写）',
            subtitle: '第一章·入宗 · 青云宗山门 · 白日',
            tags: ['门派', '入门试炼', '主线'],
            chapter: '第一章·入宗',
            location: '青云宗山门',
            timeHint: '白日',
            worldPrecondition: '玩家尚未进入任一宗门，未通过任何入宗考核。',
            worldEffectHint: '若完成本节点后，将正式开始入宗试炼线路。',
            aiHints: {
                tone: '仙气缥缈, 带一点庄严',
                theme: ['初入仙门', '凡人对仙道的向往'],
                forbid: ['直接给予过强的实力', '无缘由的金手指掉落'],
            },
        });
        expect(view.statusText).toBe('当前剧情：初到青云宗山门（第一章·入宗 · 青云宗山门 · 白日）。可见选项 2 个，推荐 1 个。');
        expect(view.choices.map((choice) => choice.text)).toEqual([
            '老老实实排队等待入宗考核',
            '注意到队伍中有一名体弱少女，主动上前搭话。',
        ]);
        expect(view.choices.every((choice) => choice.selectable)).toBe(true);
        expect(view.warnings).toEqual([]);
        expect(view.choices[0].conditionSummary).toBe('无特殊条件，所有玩家可见。');
        expect(view.choices[0].effectSummary).toBe('玩家在凡人弟子中名声平平，但留下稳重印象。 · 可能与同队凡人建立普通同伴关系。');
    });

    it('marks attribute-matching choices as recommended without hiding other visible choices', () => {
        const recommendedView = createStoryFlowViewModel(storyGraphJson, {
            worldState: structuredClone(initialWorldState),
        });
        const helpGirlChoice = recommendedView.choices.find((choice) => choice.id === 'sect_entry_001_choice_2');

        expect(helpGirlChoice?.visible).toBe(true);
        expect(helpGirlChoice?.recommended).toBe(true);
        expect(helpGirlChoice?.recommendationReason).toBe('满足推荐条件：心性 55 ≥ 50。');

        const cautiousWorldState = structuredClone(initialWorldState);
        cautiousWorldState.player.attributes['心性'] = 40;
        const notRecommendedView = createStoryFlowViewModel(storyGraphJson, {
            worldState: cautiousWorldState,
        });
        const notRecommendedChoice = notRecommendedView.choices.find((choice) => choice.id === 'sect_entry_001_choice_2');

        expect(notRecommendedChoice?.visible).toBe(true);
        expect(notRecommendedChoice?.recommended).toBe(false);
        expect(notRecommendedChoice?.recommendationReason).toBe('未满足推荐条件：心性 40 ≥ 50。');
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
        expect(createStoryChoiceTransition(view, 'start_to_trial')).toEqual({
            status: 'selected',
            choiceId: 'start_to_trial',
            fromNodeId: 'start',
            toNodeId: 'trial',
            nextVisitedNodeIds: ['start', 'trial'],
            nextSelectedChoiceIds: ['start_to_trial'],
        });
    });
});
