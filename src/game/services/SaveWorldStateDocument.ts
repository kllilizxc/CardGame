import {
    createActiveRunCompatibilityKeys,
    SAVE_COMPATIBILITY_REGISTRY,
    type ActiveRunCompatibilityKeys,
    type ActiveRunSaveCompatibilityEntry,
    type FixedKeySaveCompatibilityEntry,
    type SaveCompatibilityOwner,
    type SaveCompatibilityRegistry,
} from './SaveCompatibility';
import { createActiveRunRouteKey } from './RunPersistence';
import {
    RUN_RESOLUTION_BOUNDARY_MODULE,
    RUN_RESOLUTION_TERMINAL_OUTCOMES,
} from './RunResolution';
import {
    createStoryRuntimeSessionStorageKey,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    type StoryHubSessionDocument,
} from './StoryHubSessionPersistence';
import type { SaveWorldStateSnapshot } from './SaveWorldStateSnapshot';
import type { PersistentStash, RunSnapshot, TerminalRunOutcome } from '../types/expedition';

export const SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION = 1;
export const SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE = 'application/vnd.cardgame.save-world-state-document+json';

const SAVE_WORLD_STATE_DOCUMENT_OWNERS: readonly SaveCompatibilityOwner[] = [
    'storyHubSession',
    'persistentStash',
    'activeRun',
];
const SAVE_WORLD_STATE_DOCUMENT_SOURCE = 'SaveWorldStateSnapshot';

export interface SaveWorldStateDocumentMigrationHookMetadata {
    readonly description: string;
}

export type SaveWorldStateDocumentFixedCompatibilityEntry = Omit<FixedKeySaveCompatibilityEntry, 'migrationHooks'> & {
    readonly migrationHooks: readonly SaveWorldStateDocumentMigrationHookMetadata[];
};

export type SaveWorldStateDocumentActiveRunCompatibilityEntry = Omit<ActiveRunSaveCompatibilityEntry, 'migrationHooks'> & {
    readonly migrationHooks: readonly SaveWorldStateDocumentMigrationHookMetadata[];
};

export interface SaveWorldStateDocumentContentMetadata {
    readonly source: typeof SAVE_WORLD_STATE_DOCUMENT_SOURCE;
    readonly snapshotSchemaVersion: null;
    readonly owners: readonly SaveCompatibilityOwner[];
}

export interface SaveWorldStateDocumentMigrationBoundary {
    readonly kind: 'no-op';
    readonly documentMigrationCount: 0;
    readonly ownerHookCounts: Record<SaveCompatibilityOwner, number>;
}

export interface SaveWorldStateDocumentFixedSlice<TDocument> {
    readonly compatibility: SaveWorldStateDocumentFixedCompatibilityEntry;
    readonly document: TDocument;
}

export interface SaveWorldStateDocumentNullableFixedSlice<TDocument> {
    readonly compatibility: SaveWorldStateDocumentFixedCompatibilityEntry;
    readonly document: TDocument | null;
}

export interface SaveWorldStateDocumentActiveRunSlice {
    readonly compatibility: SaveWorldStateDocumentActiveRunCompatibilityEntry;
    readonly keys: ActiveRunCompatibilityKeys;
    readonly document: RunSnapshot | null;
}

export interface SaveWorldStateDocumentRunResolutionSlice {
    readonly boundaryModule: typeof RUN_RESOLUTION_BOUNDARY_MODULE;
    readonly terminalOutcomes: readonly TerminalRunOutcome[];
}

export interface SaveWorldStateDocumentWorldState {
    readonly storyHubSession: SaveWorldStateDocumentFixedSlice<StoryHubSessionDocument>;
    readonly persistentStash: SaveWorldStateDocumentNullableFixedSlice<PersistentStash>;
    readonly activeRun: SaveWorldStateDocumentActiveRunSlice;
    readonly runResolution: SaveWorldStateDocumentRunResolutionSlice;
}

export interface SaveWorldStateDocument {
    readonly schemaVersion: typeof SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION;
    readonly contentType: typeof SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE;
    readonly content: SaveWorldStateDocumentContentMetadata;
    readonly migrationBoundary: SaveWorldStateDocumentMigrationBoundary;
    readonly worldState: SaveWorldStateDocumentWorldState;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
    return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
    return isRecord(value) && Object.values(value).every(isNumber);
}

function fail(reason: string): never {
    throw new Error(`Invalid SaveWorldStateDocument: ${reason}`);
}

function cloneJsonDocument<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function createMigrationHookMetadata(
    hooks: FixedKeySaveCompatibilityEntry['migrationHooks'] | ActiveRunSaveCompatibilityEntry['migrationHooks'],
): readonly SaveWorldStateDocumentMigrationHookMetadata[] {
    return hooks.map((hook) => ({ description: hook.description }));
}

function createFixedCompatibilityDocument(
    entry: FixedKeySaveCompatibilityEntry,
): SaveWorldStateDocumentFixedCompatibilityEntry {
    return {
        owner: entry.owner,
        boundaryModule: entry.boundaryModule,
        storageKey: entry.storageKey,
        storageKeyVersion: entry.storageKeyVersion,
        documentSchemaVersion: entry.documentSchemaVersion,
        persistedShape: entry.persistedShape,
        migrationHooks: createMigrationHookMetadata(entry.migrationHooks),
    };
}

function createActiveRunCompatibilityDocument(
    entry: ActiveRunSaveCompatibilityEntry,
): SaveWorldStateDocumentActiveRunCompatibilityEntry {
    return {
        owner: entry.owner,
        boundaryModule: entry.boundaryModule,
        storageKeyVersion: entry.storageKeyVersion,
        documentSchemaVersion: entry.documentSchemaVersion,
        persistedShape: entry.persistedShape,
        canonicalStorageKeyPrefix: entry.canonicalStorageKeyPrefix,
        legacyUnscopedStorageKey: entry.legacyUnscopedStorageKey,
        routeKeyFormat: entry.routeKeyFormat,
        migrationHooks: createMigrationHookMetadata(entry.migrationHooks),
    };
}

function createOwnerHookCounts(registry: SaveCompatibilityRegistry): Record<SaveCompatibilityOwner, number> {
    return {
        storyHubSession: registry.storyHubSession.migrationHooks.length,
        persistentStash: registry.persistentStash.migrationHooks.length,
        activeRun: registry.activeRun.migrationHooks.length,
    };
}

function createDocumentFromSnapshot(snapshot: SaveWorldStateSnapshot): SaveWorldStateDocument {
    return {
        schemaVersion: SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION,
        contentType: SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE,
        content: {
            source: SAVE_WORLD_STATE_DOCUMENT_SOURCE,
            snapshotSchemaVersion: null,
            owners: [...SAVE_WORLD_STATE_DOCUMENT_OWNERS],
        },
        migrationBoundary: {
            kind: 'no-op',
            documentMigrationCount: 0,
            ownerHookCounts: createOwnerHookCounts(snapshot.registry),
        },
        worldState: {
            storyHubSession: {
                compatibility: createFixedCompatibilityDocument(snapshot.storyHubSession.compatibility),
                document: cloneJsonDocument(snapshot.storyHubSession.document),
            },
            persistentStash: {
                compatibility: createFixedCompatibilityDocument(snapshot.persistentStash.compatibility),
                document: snapshot.persistentStash.document ? cloneJsonDocument(snapshot.persistentStash.document) : null,
            },
            activeRun: {
                compatibility: createActiveRunCompatibilityDocument(snapshot.activeRun.compatibility),
                keys: cloneJsonDocument(snapshot.activeRun.keys),
                document: snapshot.activeRun.document ? cloneJsonDocument(snapshot.activeRun.document) : null,
            },
            runResolution: {
                boundaryModule: snapshot.runResolution.boundaryModule,
                terminalOutcomes: [...snapshot.runResolution.terminalOutcomes],
            },
        },
    };
}

export function createSaveWorldStateDocument(snapshot: SaveWorldStateSnapshot): SaveWorldStateDocument {
    return createDocumentFromSnapshot(snapshot);
}

function validateOwners(value: unknown): readonly SaveCompatibilityOwner[] {
    if (!Array.isArray(value)
        || value.length !== SAVE_WORLD_STATE_DOCUMENT_OWNERS.length
        || !SAVE_WORLD_STATE_DOCUMENT_OWNERS.every((owner, index) => value[index] === owner)) {
        fail('content owners must match current save owners.');
    }

    return value as readonly SaveCompatibilityOwner[];
}

function isNonNegativeInteger(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0;
}

function validateMigrationBoundary(value: unknown): SaveWorldStateDocumentMigrationBoundary {
    if (!isRecord(value) || value.kind !== 'no-op' || value.documentMigrationCount !== 0) {
        fail('migrationBoundary must be the current no-op boundary.');
    }

    const ownerHookCounts = value.ownerHookCounts;
    const expectedOwnerHookCounts = createOwnerHookCounts(SAVE_COMPATIBILITY_REGISTRY);

    if (!isRecord(ownerHookCounts)
        || !isNonNegativeInteger(ownerHookCounts.storyHubSession)
        || !isNonNegativeInteger(ownerHookCounts.persistentStash)
        || !isNonNegativeInteger(ownerHookCounts.activeRun)
        || ownerHookCounts.storyHubSession !== expectedOwnerHookCounts.storyHubSession
        || ownerHookCounts.persistentStash !== expectedOwnerHookCounts.persistentStash
        || ownerHookCounts.activeRun !== expectedOwnerHookCounts.activeRun) {
        fail('migrationBoundary ownerHookCounts do not match the compatibility registry.');
    }

    return value as unknown as SaveWorldStateDocumentMigrationBoundary;
}

function validateMigrationHookMetadata(
    value: unknown,
    expected: FixedKeySaveCompatibilityEntry['migrationHooks'] | ActiveRunSaveCompatibilityEntry['migrationHooks'],
): readonly SaveWorldStateDocumentMigrationHookMetadata[] {
    const expectedMetadata = createMigrationHookMetadata(expected);

    if (!Array.isArray(value)
        || value.length !== expectedMetadata.length
        || !value.every((hook, index) => isRecord(hook)
            && hook.description === expectedMetadata[index]?.description)) {
        fail('compatibility migrationHooks must match the compatibility registry metadata.');
    }

    return value as readonly SaveWorldStateDocumentMigrationHookMetadata[];
}

function validateFixedCompatibility(
    value: unknown,
    expected: FixedKeySaveCompatibilityEntry,
): SaveWorldStateDocumentFixedCompatibilityEntry {
    if (!isRecord(value)
        || value.owner !== expected.owner
        || value.boundaryModule !== expected.boundaryModule
        || value.storageKey !== expected.storageKey
        || value.storageKeyVersion !== expected.storageKeyVersion
        || value.documentSchemaVersion !== expected.documentSchemaVersion
        || value.persistedShape !== expected.persistedShape) {
        fail(`compatibility metadata for ${expected.owner} does not match the registry.`);
    }

    validateMigrationHookMetadata(value.migrationHooks, expected.migrationHooks);

    return value as unknown as SaveWorldStateDocumentFixedCompatibilityEntry;
}

function validateActiveRunCompatibility(value: unknown): SaveWorldStateDocumentActiveRunCompatibilityEntry {
    const expected = SAVE_COMPATIBILITY_REGISTRY.activeRun;

    if (!isRecord(value)
        || value.owner !== expected.owner
        || value.boundaryModule !== expected.boundaryModule
        || value.storageKeyVersion !== expected.storageKeyVersion
        || value.documentSchemaVersion !== expected.documentSchemaVersion
        || value.persistedShape !== expected.persistedShape
        || value.canonicalStorageKeyPrefix !== expected.canonicalStorageKeyPrefix
        || value.legacyUnscopedStorageKey !== expected.legacyUnscopedStorageKey
        || value.routeKeyFormat !== expected.routeKeyFormat) {
        fail('compatibility metadata for activeRun does not match the registry.');
    }

    validateMigrationHookMetadata(value.migrationHooks, expected.migrationHooks);

    return value as unknown as SaveWorldStateDocumentActiveRunCompatibilityEntry;
}

function validateStoryStateShape(value: unknown): boolean {
    return isRecord(value)
        && isNonEmptyString(value.storyId)
        && isNonEmptyString(value.currentLocationId)
        && isNonEmptyString(value.currentSublocationId)
        && isNonEmptyString(value.currentNodeId)
        && isStringArray(value.visitedNodeIds)
        && isStringArray(value.triggeredDialogueIds)
        && isBooleanRecord(value.flags)
        && isNumberRecord(value.attributes)
        && isNumberRecord(value.relations);
}

function validateStoryHubDocument(value: unknown): StoryHubSessionDocument {
    if (!isRecord(value) || value.schemaVersion !== STORY_HUB_SESSION_SCHEMA_VERSION) {
        fail('storyHubSession document has an unsupported schemaVersion.');
    }

    if (!isRecord(value.hubs) || !isRecord(value.stories)) {
        fail('storyHubSession document must contain hubs and stories records.');
    }

    for (const [hubId, hub] of Object.entries(value.hubs)) {
        if (!isRecord(hub)
            || hub.hubId !== hubId
            || !isNonEmptyString(hub.currentLocationId)
            || !isOptionalString(hub.statusText)
            || !isNonEmptyString(hub.updatedAt)) {
            fail('storyHubSession hubs contain malformed entries.');
        }
    }

    for (const [sessionKey, story] of Object.entries(value.stories)) {
        if (!isRecord(story)
            || !isNonEmptyString(story.hubId)
            || !isNonEmptyString(story.actionId)
            || !isNonEmptyString(story.storyGraphFile)
            || !validateStoryStateShape(story.storyState)
            || !isStringArray(story.selectedChoiceIds)
            || !isOptionalString(story.statusText)
            || !isNonEmptyString(story.updatedAt)
            || createStoryRuntimeSessionStorageKey({
                hubId: story.hubId,
                actionId: story.actionId,
                storyGraphFile: story.storyGraphFile,
            }) !== sessionKey) {
            fail('storyHubSession stories contain malformed entries.');
        }
    }

    return value as unknown as StoryHubSessionDocument;
}

function validateCardStacks(value: unknown): boolean {
    return Array.isArray(value)
        && value.every((stack) => isRecord(stack) && isNonEmptyString(stack.id) && isNumber(stack.count));
}

function validateItemStacks(value: unknown): boolean {
    return Array.isArray(value)
        && value.every((stack) => isRecord(stack)
            && isNonEmptyString(stack.id)
            && typeof stack.itemType === 'string'
            && isNumber(stack.count));
}

function validateRewardBundle(value: unknown): boolean {
    return isRecord(value)
        && validateCardStacks(value.cards)
        && validateItemStacks(value.items)
        && isNumber(value.spiritStones);
}

function validateRunResolutionSummary(value: unknown): boolean {
    return value === null || (isRecord(value)
        && isNonEmptyString(value.runId)
        && (value.outcome === 'defeat' || value.outcome === 'extract' || value.outcome === 'boss-clear')
        && isNonEmptyString(value.finalNodeId)
        && validateRewardBundle(value.kept)
        && validateRewardBundle(value.lost)
        && isNonEmptyString(value.endedAt));
}

function validatePersistentStash(value: unknown): PersistentStash | null {
    if (value === null) {
        return null;
    }

    if (!isRecord(value)
        || !isNonEmptyString(value.stashId)
        || !validateCardStacks(value.deck)
        || !validateItemStacks(value.items)
        || !isNumber(value.spiritStones)
        || !isOptionalString(value.deckRef)
        || (value.lastRunSummary !== undefined && !validateRunResolutionSummary(value.lastRunSummary))) {
        fail('persistentStash document is malformed.');
    }

    return value as unknown as PersistentStash;
}

function validateRunNodeStates(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }

    return Object.entries(value).every(([nodeId, state]) => isRecord(state)
        && state.nodeId === nodeId
        && (state.status === 'hidden' || state.status === 'reachable' || state.status === 'cleared')
        && typeof state.visited === 'boolean'
        && typeof state.rewardClaimed === 'boolean'
        && (state.purchasedOfferIds === undefined || isStringArray(state.purchasedOfferIds)));
}

function validateRunSnapshot(value: unknown): RunSnapshot | null {
    if (value === null) {
        return null;
    }

    if (!isRecord(value)
        || !isNonEmptyString(value.runId)
        || !isNonEmptyString(value.expeditionId)
        || !isNonEmptyString(value.mapId)
        || value.status !== 'inProgress'
        || !isNonEmptyString(value.currentNodeId)
        || !validateRewardBundle(value.startingLoadout)
        || !validateCardStacks(value.carriedDeck)
        || !validateItemStacks(value.carriedItems)
        || !isNumber(value.spiritStones)
        || !isStringArray(value.visitedNodeIds)
        || !validateRunNodeStates(value.nodeStates)
        || !isNonEmptyString(value.startedAt)
        || !isOptionalString(value.resolvedAt)
        || (value.routeKey !== undefined && value.routeKey !== createActiveRunRouteKey({
            expeditionId: value.expeditionId,
            mapId: value.mapId,
        }))) {
        fail('activeRun document is malformed.');
    }

    return value as unknown as RunSnapshot;
}

function validateActiveRunDocumentMatchesKeys(
    document: RunSnapshot | null,
    keys: ActiveRunCompatibilityKeys,
): void {
    if (!document) {
        return;
    }

    if (document.expeditionId !== keys.normalizedIdentity.expeditionId
        || document.mapId !== keys.normalizedIdentity.mapId
        || document.routeKey !== keys.routeKey) {
        fail('activeRun document does not match activeRun keys.');
    }
}

function validateActiveRunKeys(value: unknown): ActiveRunCompatibilityKeys {
    if (!isRecord(value) || !isRecord(value.normalizedIdentity)) {
        fail('activeRun keys are malformed.');
    }

    const normalizedIdentity = value.normalizedIdentity;

    if (!isNonEmptyString(normalizedIdentity.expeditionId) || !isNonEmptyString(normalizedIdentity.mapId)) {
        fail('activeRun normalizedIdentity is malformed.');
    }

    const expectedKeys = createActiveRunCompatibilityKeys(undefined, {
        expeditionId: normalizedIdentity.expeditionId,
        mapId: normalizedIdentity.mapId,
    });

    if (value.routeKey !== expectedKeys.routeKey
        || value.canonicalStorageKey !== expectedKeys.canonicalStorageKey
        || value.legacyUnscopedStorageKey !== expectedKeys.legacyUnscopedStorageKey
        || !Array.isArray(value.legacyRouteStorageKeys)
        || !value.legacyRouteStorageKeys.every((entry) => typeof entry === 'string')) {
        fail('activeRun keys do not match the normalized route identity.');
    }

    return value as unknown as ActiveRunCompatibilityKeys;
}

function validateRunResolution(value: unknown): SaveWorldStateDocumentRunResolutionSlice {
    if (!isRecord(value)
        || value.boundaryModule !== RUN_RESOLUTION_BOUNDARY_MODULE
        || !Array.isArray(value.terminalOutcomes)
        || value.terminalOutcomes.length !== RUN_RESOLUTION_TERMINAL_OUTCOMES.length
        || !RUN_RESOLUTION_TERMINAL_OUTCOMES.every((outcome, index) => value.terminalOutcomes[index] === outcome)) {
        fail('runResolution metadata is malformed.');
    }

    return value as unknown as SaveWorldStateDocumentRunResolutionSlice;
}

function validateWorldState(value: unknown): SaveWorldStateDocumentWorldState {
    if (!isRecord(value)
        || !isRecord(value.storyHubSession)
        || !isRecord(value.persistentStash)
        || !isRecord(value.activeRun)) {
        fail('worldState must contain all save owner slices.');
    }

    validateFixedCompatibility(value.storyHubSession.compatibility, SAVE_COMPATIBILITY_REGISTRY.storyHubSession);
    validateStoryHubDocument(value.storyHubSession.document);
    validateFixedCompatibility(value.persistentStash.compatibility, SAVE_COMPATIBILITY_REGISTRY.persistentStash);
    validatePersistentStash(value.persistentStash.document);
    validateActiveRunCompatibility(value.activeRun.compatibility);
    const activeRunKeys = validateActiveRunKeys(value.activeRun.keys);
    const activeRunDocument = validateRunSnapshot(value.activeRun.document);
    validateActiveRunDocumentMatchesKeys(activeRunDocument, activeRunKeys);
    validateRunResolution(value.runResolution);

    return value as unknown as SaveWorldStateDocumentWorldState;
}

export function validateSaveWorldStateDocument(value: unknown): SaveWorldStateDocument {
    if (!isRecord(value)) {
        fail('top-level value must be an object.');
    }

    if (value.schemaVersion !== SAVE_WORLD_STATE_DOCUMENT_SCHEMA_VERSION) {
        fail('schemaVersion is unsupported.');
    }

    if (value.contentType !== SAVE_WORLD_STATE_DOCUMENT_CONTENT_TYPE) {
        fail('contentType is unsupported.');
    }

    if (!isRecord(value.content)
        || value.content.source !== SAVE_WORLD_STATE_DOCUMENT_SOURCE
        || value.content.snapshotSchemaVersion !== null) {
        fail('content metadata is malformed.');
    }

    validateOwners(value.content.owners);
    validateMigrationBoundary(value.migrationBoundary);
    validateWorldState(value.worldState);

    return cloneJsonDocument(value) as SaveWorldStateDocument;
}

export function parseSaveWorldStateDocument(rawValue: string): SaveWorldStateDocument {
    try {
        return validateSaveWorldStateDocument(JSON.parse(rawValue));
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid SaveWorldStateDocument JSON: ${error.message}`);
        }

        throw error;
    }
}

export function cloneSaveWorldStateDocument(document: SaveWorldStateDocument): SaveWorldStateDocument {
    return validateSaveWorldStateDocument(document);
}

export function migrateSaveWorldStateDocument(document: SaveWorldStateDocument): SaveWorldStateDocument {
    return cloneSaveWorldStateDocument(document);
}

