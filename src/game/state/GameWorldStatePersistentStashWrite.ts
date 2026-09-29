import {
    savePersistentStash,
    STASH_STORAGE_KEY,
    type RunPersistenceStorageAdapter,
} from '../services/RunPersistence';
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
import { cloneSavedDecks } from './PersistentStashDecks';

export interface GameWorldStatePersistentStashWriteOptions extends Omit<GameWorldStateOptions, 'storage'> {
    readonly storage: RunPersistenceStorageAdapter;
}

export interface GameWorldStatePersistentStashWriteResult {
    readonly source: GameWorldStatePersistentStashSource;
    readonly storageKey: typeof STASH_STORAGE_KEY;
    readonly document: PersistentStash;
}

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
        cards: cloneCardStacks(stash.cards),
        savedDecks: cloneSavedDecks(stash.savedDecks),
        selectedDeckId: stash.selectedDeckId,
        items: cloneItemStacks(stash.items),
        ...(stash.equippedItems ? { equippedItems: { ...stash.equippedItems } } : {}),
        spiritStones: stash.spiritStones,
        ...(stash.itemSlotCapacity !== undefined ? { itemSlotCapacity: stash.itemSlotCapacity } : {}),
        ...(stash.claimedStoryGrantIds ? { claimedStoryGrantIds: [...stash.claimedStoryGrantIds] } : {}),
        ...(stash.settledStoryItemTransactionIds ? { settledStoryItemTransactionIds: [...stash.settledStoryItemTransactionIds] } : {}),
    };

    if ('lastRunSummary' in stash) {
        clonedStash.lastRunSummary = cloneRunResolutionSummary(stash.lastRunSummary);
    }

    return clonedStash;
}

function assertPersistentStashCompatibility(worldState: GameWorldState): void {
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

export function writeGameWorldStatePersistentStashFromView(
    worldState: GameWorldState,
    storage: RunPersistenceStorageAdapter,
): GameWorldStatePersistentStashWriteResult {
    assertPersistentStashCompatibility(worldState);

    const document = clonePersistentStashDocument(worldState.persistentStash.document);

    savePersistentStash(document, storage);

    return {
        source: worldState.persistentStash.source,
        storageKey: STASH_STORAGE_KEY,
        document: clonePersistentStashDocument(document),
    };
}

export function writeGameWorldStatePersistentStash(
    options: GameWorldStatePersistentStashWriteOptions,
): GameWorldStatePersistentStashWriteResult {
    return writeGameWorldStatePersistentStashFromView(
        createGameWorldState(options),
        options.storage,
    );
}
