import {
    clearActiveRun,
    loadActiveRun,
    loadPersistentStash,
    saveActiveRun,
    savePersistentStash,
} from '../services/RunPersistence';
import type {
    ExpeditionCardStack,
    ExpeditionItemStack,
    PersistentStash,
    RunRewardBundle,
    RunSnapshot,
} from '../types/expedition';

interface StarterDeckSeed {
    cards: ExpeditionCardStack[];
}

interface WorldStateStashSeed {
    stashId?: string;
    deckRef?: string;
    items?: ExpeditionItemStack[];
    spiritStones?: number;
}

export interface ExpeditionWorldStateSeed {
    stash?: WorldStateStashSeed;
}

export interface ExpeditionBootstrapSources {
    worldState: ExpeditionWorldStateSeed;
    starterDeck: StarterDeckSeed;
}

export interface CreateRunSnapshotParams {
    expeditionId: string;
    mapId: string;
    entryNodeId: string;
}

const DEFAULT_STARTER_ITEMS: ExpeditionItemStack[] = [
    { id: 'tool.return-rope', itemType: 'tool', count: 1 },
    { id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 },
];
const DEFAULT_STARTER_SPIRIT_STONES = 36;

function cloneCardStacks(stacks: ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function cloneItemStacks(stacks: ExpeditionItemStack[]): ExpeditionItemStack[] {
    return stacks.map((stack) => ({ ...stack }));
}

function mergeCardStacks(existing: ExpeditionCardStack[], incoming: ExpeditionCardStack[]): ExpeditionCardStack[] {
    const merged = new Map<string, ExpeditionCardStack>();

    for (const stack of existing) {
        merged.set(stack.id, { ...stack });
    }

    for (const stack of incoming) {
        const current = merged.get(stack.id);
        merged.set(stack.id, {
            id: stack.id,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

function mergeItemStacks(existing: ExpeditionItemStack[], incoming: ExpeditionItemStack[]): ExpeditionItemStack[] {
    const merged = new Map<string, ExpeditionItemStack>();

    for (const stack of existing) {
        merged.set(`${stack.itemType}:${stack.id}`, { ...stack });
    }

    for (const stack of incoming) {
        const key = `${stack.itemType}:${stack.id}`;
        const current = merged.get(key);
        merged.set(key, {
            ...stack,
            count: (current?.count ?? 0) + stack.count,
        });
    }

    return [...merged.values()];
}

function createStartingLoadout(stash: PersistentStash): RunRewardBundle {
    return {
        cards: cloneCardStacks(stash.deck),
        items: cloneItemStacks(stash.items),
        spiritStones: stash.spiritStones,
    };
}

function createSeedPersistentStash(worldState: ExpeditionWorldStateSeed, starterDeck: StarterDeckSeed): PersistentStash {
    const stashSeed = worldState.stash;

    return {
        stashId: stashSeed?.stashId ?? 'phase01.starter-stash',
        deckRef: stashSeed?.deckRef ?? 'starter-deck',
        deck: cloneCardStacks(starterDeck.cards),
        items: cloneItemStacks(stashSeed?.items ?? DEFAULT_STARTER_ITEMS),
        spiritStones: stashSeed?.spiritStones ?? DEFAULT_STARTER_SPIRIT_STONES,
        lastRunSummary: null,
    };
}

function createRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ExpeditionState {
    public persistentStash: PersistentStash;
    public activeRun: RunSnapshot | null;

    constructor(persistentStash: PersistentStash, activeRun: RunSnapshot | null) {
        this.persistentStash = persistentStash;
        this.activeRun = activeRun;
    }

    static bootstrap({ worldState, starterDeck }: ExpeditionBootstrapSources): ExpeditionState {
        const persistentStash = loadPersistentStash() ?? createSeedPersistentStash(worldState, starterDeck);
        const activeRun = loadActiveRun();

        savePersistentStash(persistentStash);

        return new ExpeditionState(persistentStash, activeRun);
    }

    createRunSnapshot({ expeditionId, mapId, entryNodeId }: CreateRunSnapshotParams): RunSnapshot {
        const startedAt = new Date().toISOString();
        const activeRun: RunSnapshot = {
            runId: createRunId(),
            expeditionId,
            mapId,
            status: 'inProgress',
            currentNodeId: entryNodeId,
            startingLoadout: createStartingLoadout(this.persistentStash),
            carriedDeck: cloneCardStacks(this.persistentStash.deck),
            carriedItems: cloneItemStacks(this.persistentStash.items),
            spiritStones: this.persistentStash.spiritStones,
            visitedNodeIds: [entryNodeId],
            nodeStates: {
                [entryNodeId]: {
                    nodeId: entryNodeId,
                    status: 'cleared',
                    visited: true,
                    rewardClaimed: true,
                },
            },
            startedAt,
        };

        this.activeRun = activeRun;
        saveActiveRun(activeRun);

        return activeRun;
    }

    applyNodeRewardPreview(rewards: RunRewardBundle): RunSnapshot | null {
        if (!this.activeRun) {
            return null;
        }

        this.activeRun = {
            ...this.activeRun,
            carriedDeck: mergeCardStacks(this.activeRun.carriedDeck, rewards.cards),
            carriedItems: mergeItemStacks(this.activeRun.carriedItems, rewards.items),
            spiritStones: this.activeRun.spiritStones + rewards.spiritStones,
        };

        saveActiveRun(this.activeRun);

        return this.activeRun;
    }

    resetToEntranceState(): void {
        clearActiveRun();
        this.activeRun = null;
        this.persistentStash = loadPersistentStash() ?? this.persistentStash;
    }
}
