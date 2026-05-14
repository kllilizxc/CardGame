import { describe, expect, it } from 'bun:test';

import {
    applyStoryChoice,
    applyStoryEffects,
    createInitialStoryState,
    evaluateStoryCondition,
    markDialogueTriggered,
    markStoryNodeVisited,
    setStoryFlag,
} from './StoryState';
import type { StoryCondition, StoryEffect, StoryState } from '../types/story';

function createTestState(): StoryState {
    return createInitialStoryState({
        storyId: 'story.qingyun-entry',
        locationId: 'location.qingyun-gate',
        sublocationId: 'sublocation.queue',
        nodeId: 'node.arrival',
        attributes: {
            compassion: 55,
            insight: 8,
        },
        relations: {
            'npc.gate-elder': 0,
            'faction.qingyun': 5,
        },
    });
}

describe('StoryState', () => {
    it('creates a deterministic initial story runtime snapshot', () => {
        const state = createTestState();

        expect(state.storyId).toBe('story.qingyun-entry');
        expect(state.currentLocationId).toBe('location.qingyun-gate');
        expect(state.currentSublocationId).toBe('sublocation.queue');
        expect(state.currentNodeId).toBe('node.arrival');
        expect(state.visitedNodeIds).toEqual(['node.arrival']);
        expect(state.triggeredDialogueIds).toEqual([]);
        expect(state.flags).toEqual({});
        expect(state.attributes.compassion).toBe(55);
        expect(state.relations['faction.qingyun']).toBe(5);
    });

    it('keeps visited nodes, triggered dialogues, and flags unique while preserving immutable snapshots', () => {
        const initial = createTestState();
        const afterVisit = markStoryNodeVisited(initial, 'node.notice-girl');
        const afterDuplicateVisit = markStoryNodeVisited(afterVisit, 'node.notice-girl');
        const afterDialogue = markDialogueTriggered(afterDuplicateVisit, 'dialogue.girl-intro');
        const afterFlag = setStoryFlag(afterDialogue, 'helped_girl', true);

        expect(initial.visitedNodeIds).toEqual(['node.arrival']);
        expect(afterDuplicateVisit.visitedNodeIds).toEqual(['node.arrival', 'node.notice-girl']);
        expect(afterDialogue.triggeredDialogueIds).toEqual(['dialogue.girl-intro']);
        expect(afterFlag.flags.helped_girl).toBe(true);
        expect(afterFlag).not.toBe(initial);
    });

    it('evaluates attribute thresholds and flag presence or absence', () => {
        const state = setStoryFlag(createTestState(), 'queued_patiently', true);

        expect(evaluateStoryCondition(state, {
            kind: 'attribute',
            attribute: 'compassion',
            operator: '>=',
            value: 50,
        })).toBe(true);
        expect(evaluateStoryCondition(state, {
            kind: 'attribute',
            attribute: 'insight',
            operator: '>',
            value: 10,
        })).toBe(false);
        expect(evaluateStoryCondition(state, {
            kind: 'flag',
            flag: 'queued_patiently',
        })).toBe(true);
        expect(evaluateStoryCondition(state, {
            kind: 'flag',
            flag: 'angered_guard',
            expected: false,
        })).toBe(true);
    });

    it('evaluates visited-node history, dialogue history, and all/any/not condition groups', () => {
        const state = markDialogueTriggered(
            markStoryNodeVisited(createTestState(), 'node.notice-girl'),
            'dialogue.girl-intro',
        );
        const condition: StoryCondition = {
            kind: 'all',
            conditions: [
                { kind: 'visitedNode', nodeId: 'node.notice-girl' },
                { kind: 'triggeredDialogue', dialogueId: 'dialogue.girl-intro' },
                {
                    kind: 'any',
                    conditions: [
                        { kind: 'flag', flag: 'has_recommendation' },
                        { kind: 'attribute', attribute: 'compassion', operator: '>=', value: 55 },
                    ],
                },
                {
                    kind: 'not',
                    condition: { kind: 'flag', flag: 'angered_guard' },
                },
            ],
        };

        expect(evaluateStoryCondition(state, condition)).toBe(true);
        expect(evaluateStoryCondition(state, {
            kind: 'not',
            condition: { kind: 'triggeredDialogue', dialogueId: 'dialogue.girl-intro' },
        })).toBe(false);
    });

    it('applies effects to update state and expose the selected next node', () => {
        const effects: StoryEffect[] = [
            { kind: 'setFlag', flag: 'helped_girl' },
            { kind: 'recordVisitedNode', nodeId: 'node.help-girl' },
            { kind: 'recordDialogue', dialogueId: 'dialogue.girl-thanks' },
            { kind: 'adjustAttribute', attribute: 'compassion', delta: 3 },
            { kind: 'adjustRelation', relationId: 'npc.girl', delta: 10 },
            {
                kind: 'moveTo',
                locationId: 'location.qingyun-gate',
                sublocationId: 'sublocation.registration-desk',
            },
            { kind: 'goToNode', nodeId: 'node.registration' },
        ];

        const result = applyStoryEffects(createTestState(), effects);

        expect(result.nextNodeId).toBe('node.registration');
        expect(result.state.currentLocationId).toBe('location.qingyun-gate');
        expect(result.state.currentSublocationId).toBe('sublocation.registration-desk');
        expect(result.state.currentNodeId).toBe('node.registration');
        expect(result.state.visitedNodeIds).toEqual(['node.arrival', 'node.help-girl', 'node.registration']);
        expect(result.state.triggeredDialogueIds).toEqual(['dialogue.girl-thanks']);
        expect(result.state.flags.helped_girl).toBe(true);
        expect(result.state.attributes.compassion).toBe(58);
        expect(result.state.relations['npc.girl']).toBe(10);
        expect(result.appliedEffectKinds).toEqual([
            'setFlag',
            'recordVisitedNode',
            'recordDialogue',
            'adjustAttribute',
            'adjustRelation',
            'moveTo',
            'goToNode',
        ]);
    });

    it('surfaces a story battle trigger as pending launch metadata without mutating story position', () => {
        const effects: StoryEffect[] = [
            {
                kind: 'startBattle',
                battle: {
                    battleId: 'story.qingyun.first-duel',
                    encounterId: 'test_encounter_01',
                    encounterFile: 'data/encounters/test-enemy.json',
                    deckFile: 'data/decks/starter-deck.json',
                    deterministicBattleSetup: {
                        deckOrder: 'preserve-json-order',
                    },
                    onVictoryNodeId: 'node.duel-victory',
                    onDefeatNodeId: 'node.duel-defeat',
                    launchText: '青云执事示意你以卡匣应战。',
                },
            },
        ];

        const result = applyStoryEffects(createTestState(), effects);

        expect(result.pendingBattle).toEqual({
            battleId: 'story.qingyun.first-duel',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            deterministicBattleSetup: {
                deckOrder: 'preserve-json-order',
            },
            onVictoryNodeId: 'node.duel-victory',
            onDefeatNodeId: 'node.duel-defeat',
            launchText: '青云执事示意你以卡匣应战。',
        });
        expect(result.pendingBattle?.deterministicBattleSetup)
            .not.toBe(effects[0].kind === 'startBattle'
                ? effects[0].battle.deterministicBattleSetup
                : undefined);
        expect(result.state.currentNodeId).toBe('node.arrival');
        expect(result.state.visitedNodeIds).toEqual(['node.arrival']);
        expect(result.appliedEffectKinds).toEqual(['startBattle']);
    });

    it('blocks choices when conditions fail and applies conditional choices when conditions pass', () => {
        const blockedResult = applyStoryChoice(createTestState(), {
            id: 'choice.ask-elder-private-question',
            condition: {
                kind: 'all',
                conditions: [
                    { kind: 'attribute', attribute: 'insight', operator: '>=', value: 12 },
                    { kind: 'flag', flag: 'elder_invited_private_chat' },
                ],
            },
            effects: [{ kind: 'goToNode', nodeId: 'node.private-chat' }],
        });

        expect(blockedResult.status).toBe('blocked');
        expect(blockedResult.state.currentNodeId).toBe('node.arrival');
        expect(blockedResult.nextNodeId).toBeUndefined();

        const unlockedState = setStoryFlag(
            applyStoryEffects(createTestState(), [
                { kind: 'setAttribute', attribute: 'insight', value: 12 },
            ]).state,
            'elder_invited_private_chat',
        );
        const appliedResult = applyStoryChoice(unlockedState, {
            id: 'choice.ask-elder-private-question',
            condition: {
                kind: 'all',
                conditions: [
                    { kind: 'attribute', attribute: 'insight', operator: '>=', value: 12 },
                    { kind: 'flag', flag: 'elder_invited_private_chat' },
                ],
            },
            effects: [
                { kind: 'adjustRelation', relationId: 'npc.gate-elder', delta: 2 },
                { kind: 'goToNode', nodeId: 'node.private-chat' },
            ],
        });

        expect(appliedResult.status).toBe('applied');
        expect(appliedResult.nextNodeId).toBe('node.private-chat');
        expect(appliedResult.state.currentNodeId).toBe('node.private-chat');
        expect(appliedResult.state.relations['npc.gate-elder']).toBe(2);
    });
});
