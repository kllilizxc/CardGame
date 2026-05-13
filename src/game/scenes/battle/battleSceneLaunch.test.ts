import { describe, expect, it } from 'bun:test';

import contentCatalogJson from '../../../../public/data/content-catalog.json';
import type { BattleLaunchPayload } from '../../types/expedition';
import type { StoryBattleSceneLaunchPayload } from '../../types/story';
import {
    BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY,
    BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY,
    createBattleDeckStartupPlan,
    getBattleDeckCacheKey,
    getBattleDeckFile,
    getBattleDeckStacks,
    getEncounterCacheKey,
    getEncounterFile,
    getEncounterUnits,
    normalizeBattleLaunchPayload,
    normalizeStoryBattleLaunchPayload,
    resolveBattleSharedRuntimeResources,
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


function createCatalogWithEntryOverride(resourceId: string, override: Record<string, unknown>): unknown {
    return {
        schemaVersion: 1,
        resources: contentCatalogJson.resources.map((entry) => (
            entry.resourceId === resourceId ? { ...entry, ...override } : entry
        )),
    };
}

function createCatalogWithoutRuntimeGradeConfigs(): unknown {
    return {
        schemaVersion: 1,
        resources: contentCatalogJson.resources.filter((entry) => (
            entry.resourceId !== 'config.combat-baseline'
            && entry.resourceId !== 'config.artifact-grade'
        )),
    };
}

describe('battleSceneLaunch', () => {
    it('normalizes a complete expedition battle launch payload', () => {
        expect(normalizeBattleLaunchPayload(payload)).toEqual(payload);
        expect(normalizeBattleLaunchPayload({})).toBeNull();
    });

    it('normalizes Expedition battle launch nested payload fields without sharing mutable references', () => {
        const richPayload: BattleLaunchPayload = {
            ...payload,
            carriedDeck: [{ id: 'AR_001', count: 1 }],
            rewardPreview: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [{ id: 'artifact.test', itemType: 'artifact', count: 1 }],
                spiritStones: 5,
            },
            targetConfig: {
                routeKey: 'expedition:expedition.test:map.test',
                expeditionId: 'expedition.test',
                mapId: 'map.test',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapFile: 'data/mijing/prototype-map.json',
                eventsFile: 'data/mijing/prototype-events.json',
                shopFile: 'data/mijing/prototype-shop.json',
            },
            deterministicBattleSetup: {
                deckOrder: 'preserve-json-order',
            },
        };

        const normalized = normalizeBattleLaunchPayload(richPayload);

        expect(normalized).toEqual(richPayload);
        expect(normalized?.runDeck).not.toBe(richPayload.runDeck);
        expect(normalized?.carriedDeck).not.toBe(richPayload.carriedDeck);
        expect(normalized?.rewardPreview).not.toBe(richPayload.rewardPreview);
        expect(normalized?.rewardPreview?.cards).not.toBe(richPayload.rewardPreview?.cards);
        expect(normalized?.rewardPreview?.items).not.toBe(richPayload.rewardPreview?.items);
        expect(normalized?.targetConfig).not.toBe(richPayload.targetConfig);
        expect(normalized?.deterministicBattleSetup).not.toBe(richPayload.deterministicBattleSetup);
    });

    it('falls back to starter deck and default encounter when no payload exists', () => {
        const starterDeck = { cards: [{ id: 'AR_001', count: 3 }] };

        expect(getBattleDeckStacks(null, starterDeck)).toEqual([{ id: 'AR_001', count: 3 }]);
        expect(getEncounterCacheKey(null)).toBe('currentEncounter');
        expect(getEncounterFile(null)).toBe('data/encounters/medium-enemy.json');
    });

    it('keeps direct/default, Expedition, and ordinary Story battle deck starts shuffled by default', () => {
        const starterDeck = {
            cards: [
                { id: 'SX_YJZ_001', count: 1 },
                { id: 'AR_001', count: 2 },
            ],
        };
        const storyPayload = createStoryPayload();

        expect(createBattleDeckStartupPlan(null, null, starterDeck)).toEqual({
            stacks: starterDeck.cards,
            shouldShuffle: true,
        });
        expect(createBattleDeckStartupPlan(payload, null, starterDeck)).toEqual({
            stacks: payload.runDeck,
            shouldShuffle: true,
        });
        expect(createBattleDeckStartupPlan(null, storyPayload, starterDeck)).toEqual({
            stacks: starterDeck.cards,
            shouldShuffle: true,
        });
    });

    it('lets tutorial Story battles opt in to preserving deck JSON stack order for predictable initial draws', () => {
        const starterDeck = {
            cards: [
                { id: 'SX_YJZ_001', count: 2 },
                { id: 'AR_001', count: 1 },
                { id: 'TL_002', count: 2 },
            ],
        };
        const tutorialStoryPayload = createStoryPayload();
        tutorialStoryPayload.battleLaunch.deterministicBattleSetup = {
            deckOrder: 'preserve-json-order',
        };

        const plan = createBattleDeckStartupPlan(null, tutorialStoryPayload, starterDeck);
        const initialDrawIds = plan.stacks.flatMap((stack) => Array.from(
            { length: stack.count },
            () => stack.id,
        )).slice(0, 5);

        expect(plan.shouldShuffle).toBe(false);
        expect(plan.stacks).toEqual(starterDeck.cards);
        expect(plan.stacks).not.toBe(starterDeck.cards);
        expect(initialDrawIds).toEqual(['SX_YJZ_001', 'SX_YJZ_001', 'AR_001', 'TL_002', 'TL_002']);
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

    it('resolves shared Battle card, gongfa, and status assets through stable catalog resource ids while preserving legacy cache keys', () => {
        const runtimeResources = resolveBattleSharedRuntimeResources(contentCatalogJson);

        expect(runtimeResources).toEqual({
            unitCards: {
                cacheKey: 'unitCards',
                resourceId: 'cards.units',
                publicPath: 'data/cards/units.json',
            },
            artifactCards: {
                cacheKey: 'artifactCards',
                resourceId: 'cards.artifacts',
                publicPath: 'data/cards/artifacts.json',
            },
            talismanCards: {
                cacheKey: 'talismanCards',
                resourceId: 'cards.talismans',
                publicPath: 'data/cards/talismans.json',
            },
            pillCards: {
                cacheKey: 'pillCards',
                resourceId: 'cards.pills',
                publicPath: 'data/cards/pills.json',
            },
            fieldCards: {
                cacheKey: 'fieldCards',
                resourceId: 'cards.fields',
                publicPath: 'data/cards/fields.json',
            },
            skillCards: {
                cacheKey: 'skillCards',
                resourceId: 'cards.skills',
                publicPath: 'data/cards/skills.json',
            },
            gongfaList: {
                cacheKey: 'gongfaList',
                resourceId: 'gongfa.list',
                publicPath: 'data/gongfa/gongfa-list.json',
            },
            statusDefinitions: {
                cacheKey: 'statusDefinitions',
                resourceId: 'status.definitions',
                publicPath: 'data/config/status-definitions.json',
            },
            combatBaselineConfig: {
                cacheKey: BATTLE_COMBAT_BASELINE_CONFIG_CACHE_KEY,
                resourceId: 'config.combat-baseline',
                publicPath: 'data/config/combat-baseline.json',
            },
            artifactGradeConfig: {
                cacheKey: BATTLE_ARTIFACT_GRADE_CONFIG_CACHE_KEY,
                resourceId: 'config.artifact-grade',
                publicPath: 'data/config/artifact-grade.json',
            },
        });
    });

    it('keeps runtime realm and grade configs optional so helpers can use static imports when catalog data is absent', () => {
        const runtimeResources = resolveBattleSharedRuntimeResources(createCatalogWithoutRuntimeGradeConfigs());

        expect(runtimeResources.combatBaselineConfig).toBeUndefined();
        expect(runtimeResources.artifactGradeConfig).toBeUndefined();
        expect(runtimeResources.unitCards).toEqual({
            cacheKey: 'unitCards',
            resourceId: 'cards.units',
            publicPath: 'data/cards/units.json',
        });
    });

    it('fails actionably when shared Battle catalog resources are missing, wrong-kind, or path-mismatched', () => {
        expect(() => resolveBattleSharedRuntimeResources({
            schemaVersion: 1,
            resources: [],
        })).toThrow(
            'contentCatalog.resources must contain at least one resource.',
        );

        expect(() => resolveBattleSharedRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'cards.artifacts',
                    kind: 'card',
                    schemaVersion: 1,
                    publicPath: 'data/cards/artifacts.json',
                },
            ],
        })).toThrow(
            'BattleScene could not resolve catalog resource cards.units: no catalog entry exists for that resource id.',
        );

        expect(() => resolveBattleSharedRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'cards.units',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/cards/units.json',
                },
            ],
        })).toThrow(
            'BattleScene could not resolve catalog resource cards.units: catalog resource has kind deck; expected card.',
        );

        expect(() => resolveBattleSharedRuntimeResources({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'cards.units',
                    kind: 'card',
                    schemaVersion: 1,
                    publicPath: 'data/cards/units-v2.json',
                },
            ],
        })).toThrow(
            'BattleScene shared runtime resource cards.units resolved to catalog publicPath data/cards/units-v2.json, but cache key unitCards must continue loading data/cards/units.json.',
        );
    });

    it('fails actionably when runtime realm and grade config catalog entries have wrong kind or publicPath', () => {
        expect(() => resolveBattleSharedRuntimeResources(createCatalogWithEntryOverride(
            'config.combat-baseline',
            { kind: 'deck' },
        ))).toThrow(
            'BattleScene could not resolve catalog resource config.combat-baseline: catalog resource has kind deck; expected config.',
        );

        expect(() => resolveBattleSharedRuntimeResources(createCatalogWithEntryOverride(
            'config.combat-baseline',
            { publicPath: 'data/config/combat-baseline-v2.json' },
        ))).toThrow(
            'BattleScene shared runtime resource config.combat-baseline resolved to catalog publicPath data/config/combat-baseline-v2.json, but cache key combatBaselineConfig must continue loading data/config/combat-baseline.json.',
        );

        expect(() => resolveBattleSharedRuntimeResources(createCatalogWithEntryOverride(
            'config.artifact-grade',
            { kind: 'deck' },
        ))).toThrow(
            'BattleScene could not resolve catalog resource config.artifact-grade: catalog resource has kind deck; expected config.',
        );

        expect(() => resolveBattleSharedRuntimeResources(createCatalogWithEntryOverride(
            'config.artifact-grade',
            { publicPath: 'data/config/artifact-grade-v2.json' },
        ))).toThrow(
            'BattleScene shared runtime resource config.artifact-grade resolved to catalog publicPath data/config/artifact-grade-v2.json, but cache key artifactGradeConfig must continue loading data/config/artifact-grade.json.',
        );
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

    it('normalizes tutorial deterministic battle setup without sharing mutable payload references', () => {
        const storyPayload = createStoryPayload();
        storyPayload.battleLaunch.deterministicBattleSetup = {
            deckOrder: 'preserve-json-order',
        };

        const normalized = normalizeStoryBattleLaunchPayload(storyPayload);

        expect(normalized?.battleLaunch.deterministicBattleSetup).toEqual({
            deckOrder: 'preserve-json-order',
        });
        expect(normalized?.battleLaunch.deterministicBattleSetup)
            .not.toBe(storyPayload.battleLaunch.deterministicBattleSetup);

        if (!normalized?.battleLaunch.deterministicBattleSetup) {
            throw new Error('Expected deterministic battle setup to normalize.');
        }

        normalized.battleLaunch.deterministicBattleSetup.deckOrder = 'mutated' as never;

        expect(storyPayload.battleLaunch.deterministicBattleSetup?.deckOrder).toBe('preserve-json-order');
    });

    it('rejects story battle launch payloads with unsupported deterministic deck setup values', () => {
        const storyPayload = createStoryPayload();
        storyPayload.battleLaunch.deterministicBattleSetup = {
            deckOrder: 'debug-no-shuffle' as never,
        };

        expect(normalizeStoryBattleLaunchPayload(storyPayload)).toBeNull();
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
