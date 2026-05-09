import { describe, expect, it } from 'bun:test';

import contentCatalogJson from '../../../../public/data/content-catalog.json';
import type { BattleLaunchPayload } from '../../types/expedition';
import type { StoryBattleSceneLaunchPayload } from '../../types/story';
import {
    getBattleDeckCacheKey,
    getBattleDeckFile,
    getBattleDeckStacks,
    getEncounterCacheKey,
    getEncounterFile,
    getEncounterUnits,
    normalizeBattleLaunchPayload,
    normalizeStoryBattleLaunchPayload,
    resolveDefaultBattleRuntimeResources,
    resolveExpeditionBattleRuntimeResources,
    resolveStoryBattleRuntimeResources,
} from './battleSceneLaunch';

const payload: BattleLaunchPayload = {
    runId: 'run-test-001',
    nodeId: 'battle.mist-foxes',
    nodeType: 'battle',
    encounterId: 'test_encounter_01',
    encounterResourceId: 'test_encounter_01',
    encounterFile: 'data/encounters/test-enemy.json',
    runDeck: [{ id: 'SX_YJZ_001', count: 1 }],
};

function createStoryPayload(): StoryBattleSceneLaunchPayload {
    return {
        source: 'story',
        storyResourceId: 'story.test-battle',
        battleLaunch: {
            sceneKey: 'BattleScene',
            storyId: 'story.test-battle',
            sourceNodeId: 'start',
            sourceChoiceId: 'start_to_duel',
            targetNodeId: 'duel_pending',
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
        storyState: {
            storyId: 'story.test-battle',
            currentLocationId: 'location.test',
            currentSublocationId: 'sublocation.test.duel',
            currentNodeId: 'duel_pending',
            visitedNodeIds: ['start', 'duel_pending'],
            triggeredDialogueIds: [],
            flags: { 'story.test.started': true },
            attributes: { 心性: 55 },
            relations: {},
        },
        selectedChoiceIds: ['start_to_duel'],
    };
}

const storyBattleCatalog = {
    schemaVersion: 1,
    resources: [
        {
            resourceId: 'test_encounter_01',
            kind: 'encounter',
            schemaVersion: 1,
            publicPath: 'data/encounters/test-enemy.json',
        },
        {
            resourceId: 'deck.starter',
            kind: 'deck',
            schemaVersion: 1,
            publicPath: 'data/decks/starter-deck.json',
        },
    ],
};

describe('battleSceneLaunch', () => {
    it('normalizes a complete expedition battle launch payload', () => {
        expect(normalizeBattleLaunchPayload(payload)).toEqual(payload);
        expect(normalizeBattleLaunchPayload({})).toBeNull();
    });

    it('falls back to starter deck and default encounter when no payload exists', () => {
        const starterDeck = { cards: [{ id: 'AR_001', count: 3 }] };

        expect(getBattleDeckStacks(null, starterDeck)).toEqual([{ id: 'AR_001', count: 3 }]);
        expect(getEncounterCacheKey(null)).toBe('currentEncounter');
        expect(getEncounterFile(null)).toBe('data/encounters/medium-enemy.json');
    });

    it('resolves direct/default Battle encounter and starter deck through catalog resource ids while preserving cache keys', () => {
        const runtimeResources = resolveDefaultBattleRuntimeResources(contentCatalogJson, null, null);

        expect(runtimeResources).toEqual({
            encounterResourceId: 'test_encounter_02',
            encounterFile: 'data/encounters/medium-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
        });
        expect(getEncounterFile(null, null, null, null, runtimeResources)).toBe('data/encounters/medium-enemy.json');
        expect(getBattleDeckFile(null, null, runtimeResources)).toBe('data/decks/starter-deck.json');
        expect(getEncounterCacheKey(null)).toBe('currentEncounter');
        expect(getBattleDeckCacheKey(null)).toBe('starterDeck');
    });

    it('skips direct/default catalog resolution for Story and Expedition launches so their ownership rules stay isolated', () => {
        const storyPayload = createStoryPayload();

        expect(resolveDefaultBattleRuntimeResources(contentCatalogJson, payload, null)).toBeNull();
        expect(resolveDefaultBattleRuntimeResources(contentCatalogJson, null, storyPayload)).toBeNull();
    });

    it('fails actionably when direct/default Battle catalog defaults are missing, malformed, absent, wrong-kind, or path-mismatched', () => {
        expect(() => resolveDefaultBattleRuntimeResources(undefined, null, null)).toThrow(
            'BattleScene requires runtime content catalog data/content-catalog.json, but it was not loaded or is missing from the JSON cache.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: 'not-an-array',
        }, null, null)).toThrow(
            'BattleScene runtime content catalog data/content-catalog.json is malformed: contentCatalog.resources must be an array.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, null, null)).toThrow(
            'BattleScene could not resolve catalog resource test_encounter_02: no catalog entry exists for that resource id.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'test_encounter_02',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/medium-enemy.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, null, null)).toThrow(
            'BattleScene could not resolve catalog resource test_encounter_02: catalog resource has kind deck; expected encounter.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'test_encounter_02',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/medium-enemy.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, null, null)).toThrow(
            'BattleScene could not resolve catalog resource deck.starter: catalog resource has kind encounter; expected deck.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'test_encounter_02',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/other-medium-enemy.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, null, null)).toThrow(
            'BattleScene direct/default encounterResourceId test_encounter_02 resolved to catalog publicPath data/encounters/other-medium-enemy.json, but default encounterFile is data/encounters/medium-enemy.json.',
        );

        expect(() => resolveDefaultBattleRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'test_encounter_02',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/medium-enemy.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/other-starter-deck.json',
                },
            ],
        }, null, null)).toThrow(
            'BattleScene direct/default deckResourceId deck.starter resolved to catalog publicPath data/decks/other-starter-deck.json, but default deckFile is data/decks/starter-deck.json.',
        );
    });

    it('uses runDeck and a run-scoped encounter cache key for expedition launches', () => {
        const deck = getBattleDeckStacks(payload, { cards: [{ id: 'AR_001', count: 3 }] });

        expect(deck).toEqual([{ id: 'SX_YJZ_001', count: 1 }]);
        expect(deck).not.toBe(payload.runDeck);
        expect(getEncounterCacheKey(payload)).toBe('expeditionEncounter:run-test-001:battle.mist-foxes');
        expect(getEncounterFile(payload)).toBe('data/encounters/test-enemy.json');
    });

    it('keeps encounterResourceId optional for legacy expedition launch payloads', () => {
        const { encounterResourceId: _omitted, ...legacyPayload } = payload;

        expect(normalizeBattleLaunchPayload(legacyPayload)).toEqual(legacyPayload);
        expect(getEncounterFile(legacyPayload)).toBe('data/encounters/test-enemy.json');
    });

    it('accepts existing enemies arrays and prototype boss units arrays', () => {
        expect(getEncounterUnits({ enemies: [{ cardId: 'CR_001' }] })).toEqual([{ cardId: 'CR_001' }]);
        expect(getEncounterUnits({ units: [{ cardId: 'CR_002' }] })).toEqual([{ cardId: 'CR_002' }]);
    });

    it('normalizes a source-aware story battle launch payload with encounter and deck files', () => {
        const storyPayload = createStoryPayload();

        const normalized = normalizeStoryBattleLaunchPayload(storyPayload);

        expect(normalized).toEqual(storyPayload);
        expect(normalized).not.toBe(storyPayload);
        expect(normalized?.battleLaunch).not.toBe(storyPayload.battleLaunch);
        expect(normalized?.storyState).not.toBe(storyPayload.storyState);
        expect(normalized?.selectedChoiceIds).not.toBe(storyPayload.selectedChoiceIds);
        expect(normalized?.storyResourceId).toBe('story.test-battle');
        expect(getEncounterFile(null, normalized)).toBe('data/encounters/test-enemy.json');
        expect(getEncounterCacheKey(null, normalized)).toBe('storyEncounter:story.test-battle:story.test-battle.first-duel');
        expect(getBattleDeckFile(normalized)).toBe('data/decks/starter-deck.json');
        expect(getBattleDeckCacheKey(normalized)).toBe('storyDeck:story.test-battle:story.test-battle.first-duel');
    });

    it('resolves Story-sourced battle encounter and deck files through catalog resource ids while keeping cache keys and file aliases stable', () => {
        const storyPayload = createStoryPayload();
        const normalized = normalizeStoryBattleLaunchPayload(storyPayload);

        if (!normalized) {
            throw new Error('Expected story payload to normalize.');
        }

        const runtimeResources = resolveStoryBattleRuntimeResources(storyBattleCatalog, normalized);

        expect(runtimeResources).toEqual({
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckResourceId: 'deck.starter',
            deckFile: 'data/decks/starter-deck.json',
        });
        expect(getEncounterFile(null, normalized, runtimeResources)).toBe('data/encounters/test-enemy.json');
        expect(getBattleDeckFile(normalized, runtimeResources)).toBe('data/decks/starter-deck.json');
        expect(getEncounterCacheKey(null, normalized)).toBe('storyEncounter:story.test-battle:story.test-battle.first-duel');
        expect(getBattleDeckCacheKey(normalized)).toBe('storyDeck:story.test-battle:story.test-battle.first-duel');
        expect(normalized.battleLaunch.encounterFile).toBe('data/encounters/test-enemy.json');
        expect(normalized.battleLaunch.deckFile).toBe('data/decks/starter-deck.json');
    });

    it('resolves Expedition-sourced battle encounter files through catalog resource ids while keeping cache keys and file aliases stable', () => {
        const normalized = normalizeBattleLaunchPayload(payload);

        if (!normalized) {
            throw new Error('Expected expedition payload to normalize.');
        }

        const runtimeResources = resolveExpeditionBattleRuntimeResources(contentCatalogJson, normalized);

        expect(runtimeResources).toEqual({
            encounterResourceId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
        });
        expect(getEncounterFile(normalized, null, null, runtimeResources)).toBe('data/encounters/test-enemy.json');
        expect(getEncounterCacheKey(normalized)).toBe('expeditionEncounter:run-test-001:battle.mist-foxes');
        expect(normalized.encounterFile).toBe('data/encounters/test-enemy.json');
    });

    it('keeps legacy Expedition encounterFile loading when encounterResourceId is absent', () => {
        const { encounterResourceId: _omitted, ...legacyPayload } = payload;

        expect(resolveExpeditionBattleRuntimeResources(contentCatalogJson, legacyPayload)).toBeNull();
        expect(getEncounterFile(legacyPayload, null, null, null)).toBe('data/encounters/test-enemy.json');
    });

    it('rejects Expedition encounter resource ids whose catalog public paths do not match compatibility encounterFile aliases', () => {
        const mismatchPayload: BattleLaunchPayload = {
            ...payload,
            encounterFile: 'data/encounters/other-enemy.json',
        };

        expect(() => resolveExpeditionBattleRuntimeResources(contentCatalogJson, mismatchPayload)).toThrow(
            'BattleScene Expedition battle run-test-001/battle.mist-foxes encounterResourceId test_encounter_01 resolved to catalog publicPath data/encounters/test-enemy.json, but launch encounterFile is data/encounters/other-enemy.json.',
        );
    });
});
