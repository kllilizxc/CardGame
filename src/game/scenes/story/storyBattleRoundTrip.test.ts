import { describe, expect, it } from 'bun:test';

import { createInitialStoryRuntime, createStoryChoiceTransition, createStoryFlowViewModel, type StoryGraphDefinition } from './storyFlowViewModel';
import {
    applyStoryBattleResultToRuntime,
    createStoryBattleCompleteEvent,
    createStoryBattleSceneStartPayload,
    createStorySceneTransitionIntent,
    routeStoryBattleResultNodeId,
} from './storyBattleRoundTrip';

function createBattleGraph(): StoryGraphDefinition {
    return {
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
                locationId: 'location.test',
                sublocationId: 'sublocation.test.start',
            },
            {
                id: 'duel_pending',
                type: 'story',
                title: '演武台前',
                summary: '执事点名要求玩家切磋。',
                detail: '战斗即将开始。',
                tags: ['战斗'],
                locationId: 'location.test',
                sublocationId: 'sublocation.test.duel',
            },
            {
                id: 'duel_victory',
                type: 'story',
                title: '胜利',
                summary: '赢下切磋。',
                detail: '胜利后继续剧情。',
                tags: ['战斗'],
                locationId: 'location.test',
                sublocationId: 'sublocation.test.victory',
                onEnter: [
                    {
                        kind: 'setFlag',
                        flag: 'story.test-battle.won_duel',
                    },
                ],
            },
            {
                id: 'duel_defeat',
                type: 'story',
                title: '失败',
                summary: '输掉切磋。',
                detail: '失败后继续剧情。',
                tags: ['战斗'],
                locationId: 'location.test',
                sublocationId: 'sublocation.test.defeat',
                onEnter: [
                    {
                        kind: 'setFlag',
                        flag: 'story.test-battle.lost_duel',
                    },
                ],
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
                            encounterResourceId: 'test_encounter_01',
                            encounterId: 'test_encounter_01',
                            encounterFile: 'data/encounters/test-enemy.json',
                            deckResourceId: 'deck.starter',
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
}

function createBattleTransition() {
    const graph = createBattleGraph();
    const view = createStoryFlowViewModel(graph, {
        storyState: createInitialStoryRuntime(graph),
        selectedChoiceIds: [],
    });
    const transition = createStoryChoiceTransition(view, 'start_to_duel');

    if (transition.status !== 'selected' || !transition.battleLaunch) {
        throw new Error('Expected start_to_duel to produce battle launch metadata.');
    }

    return { graph, transition };
}

describe('storyBattleRoundTrip', () => {
    it('creates a StoryScene transition intent that starts BattleScene from pure battleLaunch metadata', () => {
        const { transition } = createBattleTransition();
        const intent = createStorySceneTransitionIntent(transition, '以卡匣应战');

        expect(intent).toEqual({
            kind: 'startBattleScene',
            sceneKey: 'BattleScene',
            statusText: '执事示意你以卡匣应战。',
            payload: {
                source: 'story',
                battleLaunch: transition.battleLaunch,
                storyState: transition.nextStoryState,
                selectedChoiceIds: transition.nextSelectedChoiceIds,
            },
        });
        expect(intent.payload.battleLaunch).not.toBe(transition.battleLaunch);
        expect(intent.payload.storyState).not.toBe(transition.nextStoryState);
        expect(intent.payload.selectedChoiceIds).not.toBe(transition.nextSelectedChoiceIds);
    });

    it('routes story battle results to the declared victory or defeat continuation nodes', () => {
        const { graph, transition } = createBattleTransition();
        const startPayload = createStoryBattleSceneStartPayload(
            transition.battleLaunch,
            transition.nextStoryState,
            transition.nextSelectedChoiceIds,
        );

        const victoryResult = createStoryBattleCompleteEvent(startPayload, true, '2026-05-09T04:00:00.000Z');
        const defeatResult = createStoryBattleCompleteEvent(startPayload, false, '2026-05-09T04:05:00.000Z');

        expect(routeStoryBattleResultNodeId(victoryResult)).toBe('duel_victory');
        expect(routeStoryBattleResultNodeId(defeatResult)).toBe('duel_defeat');
        expect(victoryResult).toMatchObject({
            source: 'story',
            storyId: 'story.test-battle',
            battleId: 'story.test-battle.first-duel',
            encounterResourceId: 'test_encounter_01',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
            victory: true,
            outcome: 'victory',
            pendingNodeId: 'duel_pending',
            resultNodeId: 'duel_victory',
            completedAt: '2026-05-09T04:00:00.000Z',
        });

        const victoryResume = applyStoryBattleResultToRuntime(graph, victoryResult);
        const defeatResume = applyStoryBattleResultToRuntime(graph, defeatResult);

        expect(victoryResume.storyState.currentNodeId).toBe('duel_victory');
        expect(victoryResume.storyState.flags['story.test-battle.won_duel']).toBe(true);
        expect(victoryResume.selectedChoiceIds).toEqual(['start_to_duel']);
        expect(defeatResume.storyState.currentNodeId).toBe('duel_defeat');
        expect(defeatResume.storyState.flags['story.test-battle.lost_duel']).toBe(true);
    });

    it('preserves the Hub story session key through battle launch and completion so resume can save the result snapshot', () => {
        const { transition } = createBattleTransition();
        const hubSession = {
            hubId: 'hub.qingyun-town',
            actionId: 'action.start-qingyun-entry-story',
            storyGraphFile: 'data/story/story-graph.json',
        };
        const storyResourceId = 'story.qingyun-entry';

        const startPayload = createStoryBattleSceneStartPayload(
            transition.battleLaunch,
            transition.nextStoryState,
            transition.nextSelectedChoiceIds,
            hubSession.storyGraphFile,
            hubSession,
            storyResourceId,
        );
        const result = createStoryBattleCompleteEvent(startPayload, true, '2026-05-09T06:03:00.000Z');
        const intent = createStorySceneTransitionIntent(
            transition,
            '以卡匣应战',
            hubSession.storyGraphFile,
            hubSession,
            storyResourceId,
        );

        expect(startPayload.storyResourceId).toBe(storyResourceId);
        expect(startPayload.hubSession).toEqual(hubSession);
        expect(result.storyResourceId).toBe(storyResourceId);
        expect(result.hubSession).toEqual(hubSession);
        expect(intent.kind).toBe('startBattleScene');
        if (intent.kind !== 'startBattleScene') {
            throw new Error('Expected battle scene start intent.');
        }
        expect(intent.payload.storyResourceId).toBe(storyResourceId);
        expect(intent.payload.hubSession).toEqual(hubSession);
    });
});
