import { describe, expect, it } from 'bun:test';

import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
} from '../config/ExpeditionDefaults';
import {
    ACTIVE_RUN_STORAGE_KEY,
    ACTIVE_RUN_STORAGE_KEY_PREFIX,
    createActiveRunRouteKey,
    createActiveRunStorageKey,
    STASH_STORAGE_KEY,
} from './RunPersistence';
import {
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
} from './StoryHubSessionPersistence';
import {
    applySaveCompatibilityMigrations,
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
} from './SaveCompatibility';

describe('SaveCompatibility', () => {
    it('inventories current save owners using existing storage constants and schema versions', () => {
        expect(SAVE_COMPATIBILITY_REGISTRY.storyHubSession).toMatchObject({
            owner: 'storyHubSession',
            storageKey: STORY_HUB_SESSION_STORAGE_KEY,
            storageKeyVersion: 1,
            documentSchemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            persistedShape: 'StoryHubSessionDocument',
            migrationHooks: [],
        });

        expect(SAVE_COMPATIBILITY_REGISTRY.persistentStash).toMatchObject({
            owner: 'persistentStash',
            storageKey: STASH_STORAGE_KEY,
            storageKeyVersion: 1,
            documentSchemaVersion: null,
            persistedShape: 'PersistentStash',
            migrationHooks: [],
        });

        expect(SAVE_COMPATIBILITY_REGISTRY.activeRun).toMatchObject({
            owner: 'activeRun',
            storageKeyVersion: 1,
            documentSchemaVersion: null,
            persistedShape: 'RunSnapshot',
            canonicalStorageKeyPrefix: ACTIVE_RUN_STORAGE_KEY_PREFIX,
            legacyUnscopedStorageKey: ACTIVE_RUN_STORAGE_KEY,
            migrationHooks: [],
        });
    });

    it('derives active-run canonical storage keys from normalized expedition route identity', () => {
        const compatibilityKeys = createActiveRunCompatibilityKeys({
            expeditionId: ' phase01-jade-cave-expedition ',
            mapId: ' phase01-jade-cave-map ',
        });

        expect(compatibilityKeys.normalizedIdentity).toEqual({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        });
        expect(compatibilityKeys.routeKey).toBe(createActiveRunRouteKey({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        }));
        expect(compatibilityKeys.canonicalStorageKey).toBe(createActiveRunStorageKey({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        }));
        expect(compatibilityKeys.legacyUnscopedStorageKey).toBe(ACTIVE_RUN_STORAGE_KEY);
        expect(compatibilityKeys.legacyRouteStorageKeys).toEqual([]);
    });

    it('documents default route identity fallback and legacy route-key compatibility storage', () => {
        const defaultKeys = createActiveRunCompatibilityKeys({
            expeditionId: ' ',
            mapId: '',
        });

        expect(defaultKeys.normalizedIdentity).toEqual({
            expeditionId: DEFAULT_EXPEDITION_ID,
            mapId: DEFAULT_EXPEDITION_MAP_ID,
        });
        expect(defaultKeys.routeKey).toBe(createActiveRunRouteKey());
        expect(defaultKeys.canonicalStorageKey).toBe(createActiveRunStorageKey());

        const legacyRouteKey = 'expedition: phase01-jade-cave-expedition : phase01-jade-cave-map ';
        const compatibilityKeys = createActiveRunCompatibilityKeys(legacyRouteKey);

        expect(compatibilityKeys.normalizedIdentity).toEqual({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        });
        expect(compatibilityKeys.routeKey).toBe(createActiveRunRouteKey({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        }));
        expect(compatibilityKeys.canonicalStorageKey).toBe(createActiveRunStorageKey({
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
        }));
        expect(compatibilityKeys.legacyRouteStorageKeys).toEqual([
            `${ACTIVE_RUN_STORAGE_KEY_PREFIX}${legacyRouteKey.trim()}`,
        ]);
    });

    it('keeps migration hooks as no-op placeholders until a future schema changes shape', () => {
        const storyDocument = {
            schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
            hubs: {},
            stories: {},
        };
        const stashDocument = {
            stashId: 'starter-stash',
            deck: [],
            items: [],
            spiritStones: 0,
        };
        const activeRunDocument = {
            runId: 'run-001',
        };

        expect(applySaveCompatibilityMigrations('storyHubSession', storyDocument)).toBe(storyDocument);
        expect(applySaveCompatibilityMigrations('persistentStash', stashDocument)).toBe(stashDocument);
        expect(applySaveCompatibilityMigrations('activeRun', activeRunDocument)).toBe(activeRunDocument);
        expect(Object.values(SAVE_COMPATIBILITY_REGISTRY).flatMap((entry) => entry.migrationHooks)).toEqual([]);
    });
});
