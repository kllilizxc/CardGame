import { describe, expect, it } from 'bun:test';

import tutorialEntryStoryJson from '../../../../public/data/story/tutorial-qingyun-entry.json';
import { validatePlayableStoryGraph } from './storyFlow';
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

    it('preserves tutorial deterministic battle setup through StoryScene launch without sharing nested references', () => {
        const { transition } = createBattleTransition();
        transition.battleLaunch.deterministicBattleSetup = {
            deckOrder: 'preserve-json-order',
        };

        const startPayload = createStoryBattleSceneStartPayload(
            transition.battleLaunch,
            transition.nextStoryState,
            transition.nextSelectedChoiceIds,
        );
        const intent = createStorySceneTransitionIntent(transition, '以卡匣应战');

        expect(startPayload.battleLaunch.deterministicBattleSetup).toEqual({
            deckOrder: 'preserve-json-order',
        });
        expect(startPayload.battleLaunch.deterministicBattleSetup)
            .not.toBe(transition.battleLaunch.deterministicBattleSetup);

        expect(intent.kind).toBe('startBattleScene');
        if (intent.kind !== 'startBattleScene') {
            throw new Error('Expected battle scene start intent.');
        }

        expect(intent.payload.battleLaunch.deterministicBattleSetup).toEqual({
            deckOrder: 'preserve-json-order',
        });
        expect(intent.payload.battleLaunch.deterministicBattleSetup)
            .not.toBe(transition.battleLaunch.deterministicBattleSetup);
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
        expect(startPayload.battleLaunch).toMatchObject({
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
        });
        expect(result.storyResourceId).toBe(storyResourceId);
        expect(result.hubSession).toEqual(hubSession);
        expect(result).toMatchObject({
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
        });
        expect(intent.kind).toBe('startBattleScene');
        if (intent.kind !== 'startBattleScene') {
            throw new Error('Expected battle scene start intent.');
        }
        expect(intent.payload.storyResourceId).toBe(storyResourceId);
        expect(intent.payload.hubSession).toEqual(hubSession);
        expect(intent.payload.battleLaunch).toMatchObject({
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
        });
    });

    it('round-trips the tutorial Qingyun mind-duel battle payload and resumes at explicit result nodes', () => {
        const graph = validatePlayableStoryGraph(tutorialEntryStoryJson);
        let storyState = createInitialStoryRuntime(graph);
        let selectedChoiceIds: string[] = [];

        function choose(choiceId: string) {
            const view = createStoryFlowViewModel(graph, {
                storyState,
                selectedChoiceIds,
            });
            const transition = createStoryChoiceTransition(view, choiceId);

            expect(transition.status).toBe('selected');
            if (transition.status !== 'selected') {
                throw new Error(`Expected tutorial choice ${choiceId} to advance.`);
            }

            storyState = transition.nextStoryState;
            selectedChoiceIds = transition.nextSelectedChoiceIds;

            return transition;
        }

        choose('tutorial_entry_001_choice_join_queue');
        choose('tutorial_entry_002_choice_patient_line');
        const battleTransition = choose('tutorial_entry_003_patient_choice_mind_bell');

        expect(battleTransition.battleLaunch).toMatchObject({
            sceneKey: 'BattleScene',
            storyId: 'tutorial.qingyun-story-entry',
            sourceNodeId: 'tutorial_entry_003_patient_line',
            sourceChoiceId: 'tutorial_entry_003_patient_choice_mind_bell',
            targetNodeId: 'tutorial_entry_005_mind_bell_duel',
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
        });

        if (!battleTransition.battleLaunch) {
            throw new Error('Expected tutorial mind-duel choice to produce battle launch metadata.');
        }

        const hubSession = {
            hubId: 'tutorial.qingyun-hub-sect-gate',
            actionId: 'action.tutorial-qingyun-sect-gate.start-entry-story',
            storyGraphFile: 'data/story/tutorial-qingyun-entry.json',
        };
        const startPayload = createStoryBattleSceneStartPayload(
            battleTransition.battleLaunch,
            battleTransition.nextStoryState,
            battleTransition.nextSelectedChoiceIds,
            hubSession.storyGraphFile,
            hubSession,
            'tutorial.qingyun-story-entry',
        );

        expect(startPayload.battleLaunch.deterministicBattleSetup).toEqual({
            deckOrder: 'preserve-json-order',
        });
        expect(startPayload.battleLaunch.deterministicBattleSetup)
            .not.toBe(battleTransition.battleLaunch.deterministicBattleSetup);

        const victoryResult = createStoryBattleCompleteEvent(startPayload, true, '2026-05-14T09:00:00.000Z');
        const defeatResult = createStoryBattleCompleteEvent(startPayload, false, '2026-05-14T09:05:00.000Z');

        expect(routeStoryBattleResultNodeId(victoryResult)).toBe('tutorial_entry_006_mind_duel_victory');
        expect(routeStoryBattleResultNodeId(defeatResult)).toBe('tutorial_entry_006_mind_duel_defeat');
        expect(victoryResult).toMatchObject({
            storyResourceId: 'tutorial.qingyun-story-entry',
            storyGraphFile: 'data/story/tutorial-qingyun-entry.json',
            hubSession,
            resultNodeId: 'tutorial_entry_006_mind_duel_victory',
        });

        const victoryResume = applyStoryBattleResultToRuntime(graph, victoryResult);
        const defeatResume = applyStoryBattleResultToRuntime(graph, defeatResult);

        expect(victoryResume.storyState.currentNodeId).toBe('tutorial_entry_006_mind_duel_victory');
        expect(victoryResume.storyState.flags['tutorial.qingyun.entry.mind_echo_cleared']).toBe(true);
        expect(defeatResume.storyState.currentNodeId).toBe('tutorial_entry_006_mind_duel_defeat');
        expect(defeatResume.storyState.flags['tutorial.qingyun.entry.mind_echo_failed']).toBe(true);
    });
});
