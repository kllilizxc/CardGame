import {
    savePersistentStash,
    STASH_STORAGE_KEY,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
import { SAVE_COMPATIBILITY_REGISTRY } from '../services/SaveCompatibility';
import type { PersistentStash, RunResolutionSummary, RunRewardBundle } from '../types/expedition';
import {
    createGameWorldState,
    type DeepReadonly,
    type GameWorldState,
    type GameWorldStateOptions,
    type GameWorldStatePersistentStashSource,
} from './GameWorldState';
import {
    cloneCardStacks,
    cloneItemStacks,
} from './GameWorldStateStashOperations';

export interface GameWorldStatePersistentStashWriteOptions extends Omit<GameWorldStateOptions, 'storage'> {
    readonly storage: RunPersistenceStorageAdapter;
}

export interface GameWorldStatePersistentStashDocumentWriteOptions {
    readonly source: GameWorldStatePersistentStashSource;
    readonly document: DeepReadonly<PersistentStash>;
    readonly storage?: RunPersistenceStorageAdapter;
}

export interface GameWorldStatePersistentStashWritePlan {
    readonly source: GameWorldStatePersistentStashSource;
    readonly storageKey: typeof STASH_STORAGE_KEY;
    readonly document: PersistentStash;
}

export interface GameWorldStatePersistentStashWriteResult extends GameWorldStatePersistentStashWritePlan {}

function cloneRewardBundle(bundle: DeepReadonly<RunRewardBundle>): RunRewardBundle {
    return {
        cards: cloneCardStacks(bundle.cards),
        items: cloneItemStacks(bundle.items),
        spiritStones: bundle.spiritStones,
    };
}

function cloneRunResolutionSummary(
    summary: DeepReadonly<RunResolutionSummary> | null | undefined,
): RunResolutionSummary | null | undefined {
    if (summary === null) {
        return null;
    }

    if (summary === undefined) {
        return undefined;
    }

    return {
        runId: summary.runId,
        outcome: summary.outcome,
        finalNodeId: summary.finalNodeId,
        kept: cloneRewardBundle(summary.kept),
        lost: cloneRewardBundle(summary.lost),
        endedAt: summary.endedAt,
    };
}

function clonePersistentStashDocument(stash: DeepReadonly<PersistentStash>): PersistentStash {
    const clonedStash: PersistentStash = {
        stashId: stash.stashId,
        deck: cloneCardStacks(stash.deck),
        items: cloneItemStacks(stash.items),
        spiritStones: stash.spiritStones,
    };

    if (stash.deckRef !== undefined) {
        clonedStash.deckRef = stash.deckRef;
    }

    if ('lastRunSummary' in stash) {
        clonedStash.lastRunSummary = cloneRunResolutionSummary(stash.lastRunSummary);
    }

    return clonedStash;
}

function assertPersistentStashCompatibility(worldState: Pick<GameWorldState, 'persistentStash'>): void {
    const compatibility = worldState.persistentStash.compatibility;

    if (
        compatibility.owner === 'persistentStash'
        && compatibility.persistedShape === 'PersistentStash'
        && compatibility.storageKey === STASH_STORAGE_KEY
    ) {
        return;
    }

    throw new Error('GameWorldState persistent-stash write attempted to use an incompatible storage boundary.');
}

function assertExplicitStorageAdapter(storage: RunPersistenceStorageAdapter): void {
    const candidate = storage as Partial<RunPersistenceStorageAdapter> | null | undefined;

    if (
        candidate
        && typeof candidate.getItem === 'function'
        && typeof candidate.setItem === 'function'
        && typeof candidate.removeItem === 'function'
    ) {
        return;
    }

    throw new Error(
        'GameWorldState persistent-stash write requires an explicit storage adapter with getItem, setItem, and removeItem.',
    );
}

function assertPersistentStashWritePlan(plan: GameWorldStatePersistentStashWritePlan): void {
    if (plan.storageKey === STASH_STORAGE_KEY) {
        return;
    }

    throw new Error('GameWorldState persistent-stash write plan uses an incompatible storage key.');
}

function cloneWritePlan(
    plan: GameWorldStatePersistentStashWritePlan,
): GameWorldStatePersistentStashWritePlan {
    return {
        source: plan.source,
        storageKey: plan.storageKey,
        document: clonePersistentStashDocument(plan.document),
    };
}

export function planGameWorldStatePersistentStashWriteFromView(
    worldState: Pick<GameWorldState, 'persistentStash'>,
): GameWorldStatePersistentStashWritePlan {
    assertPersistentStashCompatibility(worldState);

    const document = clonePersistentStashDocument(worldState.persistentStash.document);

    return {
        source: worldState.persistentStash.source,
        storageKey: STASH_STORAGE_KEY,
        document,
    };
}

export function planGameWorldStatePersistentStashWrite(
    options: GameWorldStatePersistentStashWriteOptions,
): GameWorldStatePersistentStashWritePlan {
    assertExplicitStorageAdapter(options.storage);

    return planGameWorldStatePersistentStashWriteFromView(createGameWorldState(options));
}

export function planGameWorldStatePersistentStashWriteFromDocument({
    source,
    document,
}: Pick<GameWorldStatePersistentStashDocumentWriteOptions, 'source' | 'document'>): GameWorldStatePersistentStashWritePlan {
    return planGameWorldStatePersistentStashWriteFromView({
        persistentStash: {
            source,
            compatibility: SAVE_COMPATIBILITY_REGISTRY.persistentStash,
            document: clonePersistentStashDocument(document),
        },
    });
}

export function writeGameWorldStatePersistentStashPlan(
    plan: GameWorldStatePersistentStashWritePlan,
    storage: RunPersistenceStorageAdapter,
): GameWorldStatePersistentStashWriteResult {
    return writeGameWorldStatePersistentStashPlanWithStorage(plan, storage, true);
}

function writeGameWorldStatePersistentStashPlanWithStorage(
    plan: GameWorldStatePersistentStashWritePlan,
    storage: RunPersistenceStorageAdapter | undefined,
    requireExplicitStorage: boolean,
): GameWorldStatePersistentStashWriteResult {
    assertPersistentStashWritePlan(plan);

    if (storage !== undefined) {
        assertExplicitStorageAdapter(storage as RunPersistenceStorageAdapter);
    } else if (requireExplicitStorage) {
        assertExplicitStorageAdapter(storage as unknown as RunPersistenceStorageAdapter);
    }

    const document = clonePersistentStashDocument(plan.document);
    savePersistentStash(document, storage);

    return cloneWritePlan({
        ...plan,
        document,
    });
}

export function writeGameWorldStatePersistentStashFromView(
    worldState: GameWorldState,
    storage: RunPersistenceStorageAdapter,
): GameWorldStatePersistentStashWriteResult {
    return writeGameWorldStatePersistentStashPlan(
        planGameWorldStatePersistentStashWriteFromView(worldState),
        storage,
    );
}

export function writeGameWorldStatePersistentStash(
    options: GameWorldStatePersistentStashWriteOptions,
): GameWorldStatePersistentStashWriteResult {
    return writeGameWorldStatePersistentStashPlan(
        planGameWorldStatePersistentStashWrite(options),
        options.storage,
    );
}

export function writeGameWorldStatePersistentStashDocumentWithFallbackStorage(
    options: GameWorldStatePersistentStashDocumentWriteOptions,
): GameWorldStatePersistentStashWriteResult {
    return writeGameWorldStatePersistentStashPlanWithStorage(
        planGameWorldStatePersistentStashWriteFromDocument(options),
        options.storage,
        false,
    );
}
