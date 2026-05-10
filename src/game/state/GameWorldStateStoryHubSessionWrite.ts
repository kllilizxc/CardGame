import {
    cloneStoryHubSessionDocumentSnapshot,
    createStoryRuntimeSessionStorageKey,
    loadStoryHubSessionDocumentSnapshot,
    resolveStoryHubSessionStorageAdapter,
    saveStoryHubSessionDocumentSnapshot,
    type HubSessionSnapshot,
    STORY_HUB_SESSION_SCHEMA_VERSION,
    STORY_HUB_SESSION_STORAGE_KEY,
    type StoryHubSessionDocument,
    type StoryHubSessionStorageAdapter,
    type StoryRuntimeSessionSnapshot,
} from '../services/StoryHubSessionPersistence';
import { SAVE_COMPATIBILITY_REGISTRY } from '../services/SaveCompatibility';
import type { StoryHubSessionKey } from '../types/story';
import {
    createGameWorldState,
    type DeepReadonly,
    type GameWorldState,
    type GameWorldStateOptions,
} from './GameWorldState';

export interface GameWorldStateStoryHubSessionWriteOptions extends Omit<GameWorldStateOptions, 'storage'> {
    readonly storage: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateStoryHubSessionDocumentWriteOptions {
    readonly document: DeepReadonly<StoryHubSessionDocument>;
    readonly storage: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateStoryHubSessionDocumentFallbackWriteOptions {
    readonly document: DeepReadonly<StoryHubSessionDocument>;
    readonly storage?: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateHubSessionSnapshotWriteOptions {
    readonly snapshot: DeepReadonly<HubSessionSnapshot>;
    readonly storage?: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateStoryRuntimeSessionWriteOptions {
    readonly snapshot: DeepReadonly<StoryRuntimeSessionSnapshot>;
    readonly storage?: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateStoryRuntimeSessionClearOptions {
    readonly key: DeepReadonly<StoryHubSessionKey>;
    readonly storage?: StoryHubSessionStorageAdapter;
}

export interface GameWorldStateStoryHubSessionWritePlan {
    readonly owner: 'storyHubSession';
    readonly storageKey: typeof STORY_HUB_SESSION_STORAGE_KEY;
    readonly schemaVersion: typeof STORY_HUB_SESSION_SCHEMA_VERSION;
    readonly document: StoryHubSessionDocument;
}

export interface GameWorldStateStoryHubSessionWriteResult extends GameWorldStateStoryHubSessionWritePlan {}

function cloneJsonDocument<TDocument>(document: DeepReadonly<TDocument>): TDocument {
    return JSON.parse(JSON.stringify(document)) as TDocument;
}

function cloneStoryHubSessionDocument(
    document: DeepReadonly<StoryHubSessionDocument>,
): StoryHubSessionDocument {
    return cloneStoryHubSessionDocumentSnapshot(cloneJsonDocument(document));
}

function cloneHubSessionSnapshot(snapshot: DeepReadonly<HubSessionSnapshot>): HubSessionSnapshot {
    return cloneJsonDocument(snapshot);
}

function cloneStoryRuntimeSessionSnapshot(
    snapshot: DeepReadonly<StoryRuntimeSessionSnapshot>,
): StoryRuntimeSessionSnapshot {
    return cloneJsonDocument(snapshot);
}

function cloneStoryHubSessionKey(key: DeepReadonly<StoryHubSessionKey>): StoryHubSessionKey {
    return {
        hubId: key.hubId,
        actionId: key.actionId,
        storyGraphFile: key.storyGraphFile,
    };
}

function assertExplicitStorageAdapter(storage: StoryHubSessionStorageAdapter): void {
    const candidate = storage as Partial<StoryHubSessionStorageAdapter> | null | undefined;

    if (
        candidate
        && typeof candidate.getItem === 'function'
        && typeof candidate.setItem === 'function'
        && typeof candidate.removeItem === 'function'
    ) {
        return;
    }

    throw new Error(
        'GameWorldState storyHubSession write requires an explicit storage adapter with getItem, setItem, and removeItem.',
    );
}

function assertStoryHubSessionCompatibility(worldState: Pick<GameWorldState, 'storyHubSession'>): void {
    const compatibility = worldState.storyHubSession.compatibility;
    const registryEntry = SAVE_COMPATIBILITY_REGISTRY.storyHubSession;

    if (
        compatibility.owner === registryEntry.owner
        && compatibility.persistedShape === registryEntry.persistedShape
        && compatibility.storageKey === registryEntry.storageKey
        && compatibility.storageKeyVersion === registryEntry.storageKeyVersion
        && compatibility.documentSchemaVersion === registryEntry.documentSchemaVersion
    ) {
        return;
    }

    throw new Error('GameWorldState storyHubSession write attempted to use an incompatible storage boundary.');
}

function createWritePlan(
    document: DeepReadonly<StoryHubSessionDocument>,
): GameWorldStateStoryHubSessionWritePlan {
    const clonedDocument = cloneStoryHubSessionDocument(document);

    return {
        owner: 'storyHubSession',
        storageKey: STORY_HUB_SESSION_STORAGE_KEY,
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        document: clonedDocument,
    };
}

function assertStoryHubSessionWritePlan(plan: GameWorldStateStoryHubSessionWritePlan): void {
    if (plan.owner !== 'storyHubSession') {
        throw new Error('GameWorldState storyHubSession plan must target the storyHubSession owner.');
    }

    if (plan.storageKey !== STORY_HUB_SESSION_STORAGE_KEY) {
        throw new Error('GameWorldState storyHubSession write plan uses an incompatible storage key.');
    }

    if (plan.schemaVersion !== STORY_HUB_SESSION_SCHEMA_VERSION) {
        throw new Error('GameWorldState storyHubSession write plan uses an incompatible schema version.');
    }
}

function cloneWritePlan(
    plan: GameWorldStateStoryHubSessionWritePlan,
): GameWorldStateStoryHubSessionWritePlan {
    return {
        owner: plan.owner,
        storageKey: plan.storageKey,
        schemaVersion: plan.schemaVersion,
        document: cloneStoryHubSessionDocument(plan.document),
    };
}

export function planGameWorldStateStoryHubSessionWriteFromView(
    worldState: Pick<GameWorldState, 'storyHubSession'>,
): GameWorldStateStoryHubSessionWritePlan {
    assertStoryHubSessionCompatibility(worldState);

    return createWritePlan(worldState.storyHubSession.document);
}

export function planGameWorldStateStoryHubSessionWrite(
    options: GameWorldStateStoryHubSessionWriteOptions,
): GameWorldStateStoryHubSessionWritePlan {
    assertExplicitStorageAdapter(options.storage);

    return planGameWorldStateStoryHubSessionWriteFromView(createGameWorldState(options));
}

export function planGameWorldStateStoryHubSessionWriteFromDocument({
    document,
}: Pick<GameWorldStateStoryHubSessionDocumentWriteOptions, 'document'>): GameWorldStateStoryHubSessionWritePlan {
    return createWritePlan(document);
}

export function planGameWorldStateHubSessionSnapshotWrite({
    snapshot,
    storage,
}: GameWorldStateHubSessionSnapshotWriteOptions): GameWorldStateStoryHubSessionWritePlan {
    const document = loadStoryHubSessionDocumentSnapshot(storage);
    const clonedSnapshot = cloneHubSessionSnapshot(snapshot);

    document.hubs[clonedSnapshot.hubId] = clonedSnapshot;

    return planGameWorldStateStoryHubSessionWriteFromDocument({ document });
}

export function planGameWorldStateStoryRuntimeSessionWrite({
    snapshot,
    storage,
}: GameWorldStateStoryRuntimeSessionWriteOptions): GameWorldStateStoryHubSessionWritePlan {
    const document = loadStoryHubSessionDocumentSnapshot(storage);
    const clonedSnapshot = cloneStoryRuntimeSessionSnapshot(snapshot);

    document.stories[createStoryRuntimeSessionStorageKey(clonedSnapshot)] = clonedSnapshot;

    return planGameWorldStateStoryHubSessionWriteFromDocument({ document });
}

export function planGameWorldStateStoryRuntimeSessionClear({
    key,
    storage,
}: GameWorldStateStoryRuntimeSessionClearOptions): GameWorldStateStoryHubSessionWritePlan {
    const document = loadStoryHubSessionDocumentSnapshot(storage);

    delete document.stories[createStoryRuntimeSessionStorageKey(cloneStoryHubSessionKey(key))];

    return planGameWorldStateStoryHubSessionWriteFromDocument({ document });
}

export function writeGameWorldStateStoryHubSessionPlan(
    plan: GameWorldStateStoryHubSessionWritePlan,
    storage: StoryHubSessionStorageAdapter,
): GameWorldStateStoryHubSessionWriteResult {
    return writeGameWorldStateStoryHubSessionPlanWithStorage(plan, storage, true);
}

function writeGameWorldStateStoryHubSessionPlanWithStorage(
    plan: GameWorldStateStoryHubSessionWritePlan,
    storage: StoryHubSessionStorageAdapter | undefined,
    requireExplicitStorage: boolean,
): GameWorldStateStoryHubSessionWriteResult {
    assertStoryHubSessionWritePlan(plan);

    if (storage !== undefined) {
        assertExplicitStorageAdapter(storage);
    } else if (requireExplicitStorage) {
        assertExplicitStorageAdapter(storage as unknown as StoryHubSessionStorageAdapter);
    }

    const clonedDocument = cloneStoryHubSessionDocument(plan.document);
    saveStoryHubSessionDocumentSnapshot(clonedDocument, storage);

    return cloneWritePlan({
        ...plan,
        document: clonedDocument,
    });
}

export const applyGameWorldStateStoryHubSessionPlan = writeGameWorldStateStoryHubSessionPlan;

export function writeGameWorldStateStoryHubSessionFromView(
    worldState: Pick<GameWorldState, 'storyHubSession'>,
    storage: StoryHubSessionStorageAdapter,
): GameWorldStateStoryHubSessionWriteResult {
    return writeGameWorldStateStoryHubSessionPlan(
        planGameWorldStateStoryHubSessionWriteFromView(worldState),
        storage,
    );
}

export function writeGameWorldStateStoryHubSession(
    options: GameWorldStateStoryHubSessionWriteOptions,
): GameWorldStateStoryHubSessionWriteResult {
    return writeGameWorldStateStoryHubSessionPlan(
        planGameWorldStateStoryHubSessionWrite(options),
        options.storage,
    );
}

export function writeGameWorldStateStoryHubSessionDocument(
    options: GameWorldStateStoryHubSessionDocumentWriteOptions,
): GameWorldStateStoryHubSessionWriteResult {
    return writeGameWorldStateStoryHubSessionPlan(
        planGameWorldStateStoryHubSessionWriteFromDocument(options),
        options.storage,
    );
}

export function writeGameWorldStateStoryHubSessionDocumentWithFallbackStorage(
    options: GameWorldStateStoryHubSessionDocumentFallbackWriteOptions,
): GameWorldStateStoryHubSessionWriteResult {
    const storage = resolveStoryHubSessionStorageAdapter(options.storage);

    return writeGameWorldStateStoryHubSessionPlanWithStorage(
        planGameWorldStateStoryHubSessionWriteFromDocument(options),
        storage,
        true,
    );
}

export function writeGameWorldStateHubSessionSnapshotWithFallbackStorage(
    options: GameWorldStateHubSessionSnapshotWriteOptions,
): GameWorldStateStoryHubSessionWriteResult {
    const storage = resolveStoryHubSessionStorageAdapter(options.storage);

    return writeGameWorldStateStoryHubSessionPlanWithStorage(
        planGameWorldStateHubSessionSnapshotWrite({
            ...options,
            storage,
        }),
        storage,
        true,
    );
}

export function writeGameWorldStateStoryRuntimeSessionWithFallbackStorage(
    options: GameWorldStateStoryRuntimeSessionWriteOptions,
): GameWorldStateStoryHubSessionWriteResult {
    const storage = resolveStoryHubSessionStorageAdapter(options.storage);

    return writeGameWorldStateStoryHubSessionPlanWithStorage(
        planGameWorldStateStoryRuntimeSessionWrite({
            ...options,
            storage,
        }),
        storage,
        true,
    );
}

export function clearGameWorldStateStoryRuntimeSessionWithFallbackStorage(
    options: GameWorldStateStoryRuntimeSessionClearOptions,
): GameWorldStateStoryHubSessionWriteResult {
    const storage = resolveStoryHubSessionStorageAdapter(options.storage);

    return writeGameWorldStateStoryHubSessionPlanWithStorage(
        planGameWorldStateStoryRuntimeSessionClear({
            ...options,
            storage,
        }),
        storage,
        true,
    );
}
