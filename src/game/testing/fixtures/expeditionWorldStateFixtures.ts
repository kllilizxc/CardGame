import { createActiveRunRouteKey } from '../../services/RunPersistence';
import type { StoryHubSessionDocument } from '../../services/StoryHubSessionPersistence';
import { STORY_HUB_SESSION_SCHEMA_VERSION } from '../../services/StoryHubSessionPersistence';
import type {
    ExpeditionItemStack,
    ExpeditionItemType,
    ExpeditionRouteIdentity,
    PersistentStash,
    PrototypeEventDefinition,
    PrototypeShopDefinition,
    PrototypeShopOffer,
    RunRewardBundle,
    RunSnapshot,
} from '../../types/expedition';

export type NullableRunId = string | null;

interface WorldStateSeedItemStack {
    id: string;
    itemType: string;
    count: number;
}

export const DEFAULT_EXPEDITION_TARGET: ExpeditionRouteIdentity = {
    expeditionId: 'phase01-first-playable-expedition',
    mapId: 'phase01-prototype-map',
};

export const SYNTHETIC_EXPEDITION_TARGET: ExpeditionRouteIdentity = {
    expeditionId: 'synthetic-expedition',
    mapId: 'synthetic-map',
};

export const OTHER_EXPEDITION_TARGET: ExpeditionRouteIdentity = {
    expeditionId: 'other-expedition',
    mapId: 'other-map',
};

export const DEFAULT_EXPEDITION_TARGET_ROUTE_KEY = createActiveRunRouteKey(DEFAULT_EXPEDITION_TARGET);
export const SYNTHETIC_EXPEDITION_TARGET_ROUTE_KEY = createActiveRunRouteKey(SYNTHETIC_EXPEDITION_TARGET);

export const DEFAULT_STORY_HUB_SESSION_UPDATED_AT = '2026-05-10T00:00:00.000Z';
export const DEFAULT_WORLD_RUN_STARTED_AT = '2026-05-10T00:01:00.000Z';

export function createRunId(seed = 'run'): string {
    return `${seed}-${Date.now()}`;
}

export function createItemStack(
    id: string,
    itemType: ExpeditionItemType,
    count: number,
): ExpeditionItemStack {
    return { id, itemType, count };
}

export function createItemStacksFromSeed(stacks: readonly WorldStateSeedItemStack[]): ExpeditionItemStack[] {
    return stacks.map((stack) => createItemStack(
        stack.id,
        stack.itemType as ExpeditionItemType,
        stack.count,
    ));
}

export function createTestStoryHubDocument(
    statusText: string,
    updatedAt = DEFAULT_STORY_HUB_SESSION_UPDATED_AT,
): StoryHubSessionDocument {
    return {
        schemaVersion: STORY_HUB_SESSION_SCHEMA_VERSION,
        hubs: {
            'hub.source': {
                hubId: 'hub.source',
                currentLocationId: 'location.source',
                statusText,
                updatedAt,
            },
        },
        stories: {},
    };
}

export function createTestPersistentStash(overrides: Partial<PersistentStash> = {}): PersistentStash {
    const base: PersistentStash = {
        stashId: 'test-stash',
        deckRef: 'test-deck',
        deck: [{ id: 'TEST_CARD', count: 2 }],
        items: [createItemStack('tool.return-rope', 'tool', 1)],
        spiritStones: 10,
        lastRunSummary: null,
        ...overrides,
    };

    return base satisfies PersistentStash;
}

export function createTestRewardBundle(overrides: Partial<RunRewardBundle> = {}): RunRewardBundle {
    const base: RunRewardBundle = {
        cards: [{ id: 'CARD_A', count: 1 }],
        items: [
            createItemStack('item.rope', 'tool', 1),
        ],
        spiritStones: 0,
        ...overrides,
    };

    return base satisfies RunRewardBundle;
}

export function createTestShopOffer(overrides: Partial<PrototypeShopOffer> = {}): PrototypeShopOffer {
    const base: PrototypeShopOffer = {
        id: 'offer.default',
        label: '默认商店奖励',
        description: '用于世界状态测试输入统一的默认商店。',
        cost: {
            spiritStones: 0,
        },
        rewards: {
            cards: [{ id: 'CARD_A', count: 1 }],
            items: [createItemStack('item.rope', 'tool', 1)],
            spiritStones: 0,
        },
        ...overrides,
    };

    return base satisfies PrototypeShopOffer;
}

export function createTestShopDefinition(overrides: Partial<PrototypeShopDefinition> = {}): PrototypeShopDefinition {
    const base: PrototypeShopDefinition = {
        nodeId: 'shop.test',
        title: '测试商店',
        description: '用于世界状态测试输入统一的默认商店。',
        offers: [createTestShopOffer()],
        ...overrides,
    };

    return base satisfies PrototypeShopDefinition;
}

export function createTestEventDefinition(overrides: Partial<PrototypeEventDefinition> = {}): PrototypeEventDefinition {
    const base: PrototypeEventDefinition = {
        nodeId: 'event.test',
        title: '测试事件',
        description: '用于世界状态测试输入统一的默认事件。',
        pool: [
            {
                id: 'outcome.test',
                weight: 1,
                label: '测试奖励',
                description: '可复用测试事件输出。',
                rewards: createTestRewardBundle(),
            },
        ],
        ...overrides,
    };

    return base satisfies PrototypeEventDefinition;
}

export interface RunSnapshotBuilderOptions extends Omit<Partial<RunSnapshot>, 'expeditionId' | 'mapId' | 'routeKey' | 'runId'> {
    runId?: string;
}

export interface RunSnapshotStorageBuilderOptions
    extends Omit<Partial<RunSnapshot>, 'expeditionId' | 'mapId' | 'routeKey'> {
    runId?: NullableRunId;
}

export interface RunSnapshotStorageFixture extends Omit<RunSnapshot, 'runId'> {
    runId: NullableRunId;
}

export function createRunSnapshotFixture(
    identity: ExpeditionRouteIdentity = DEFAULT_EXPEDITION_TARGET,
    options: RunSnapshotStorageBuilderOptions = {},
): RunSnapshotStorageFixture {
    const {
        runId = createRunId('run'),
        currentNodeId = identity.expeditionId === DEFAULT_EXPEDITION_TARGET.expeditionId && identity.mapId === DEFAULT_EXPEDITION_TARGET.mapId
            ? 'entrance.mountain-gate'
            : 'entrance.synthetic',
        ...overrides
    } = options;

    const fixture = {
        runId,
        routeKey: createActiveRunRouteKey(identity),
        expeditionId: identity.expeditionId,
        mapId: identity.mapId,
        status: 'inProgress',
        currentNodeId,
        startingLoadout: {
            cards: [{ id: 'CARD_A', count: 2 }],
            items: [createItemStack('item.rope', 'tool', 1)],
            spiritStones: 0,
        },
        carriedDeck: [{ id: 'CARD_A', count: 3 }],
        carriedItems: [createItemStack('item.rope', 'tool', 1)],
        spiritStones: 12,
        visitedNodeIds: [currentNodeId],
        nodeStates: {
            [currentNodeId]: {
                nodeId: currentNodeId,
                status: 'cleared',
                visited: true,
                rewardClaimed: true,
            },
        },
        startedAt: DEFAULT_WORLD_RUN_STARTED_AT,
        ...overrides,
    } satisfies RunSnapshotStorageFixture;

    return fixture;
}

export function createRunSnapshot(
    identity: ExpeditionRouteIdentity = DEFAULT_EXPEDITION_TARGET,
    options: RunSnapshotBuilderOptions = {},
): RunSnapshot {
    const fixture = createRunSnapshotFixture(identity, options as RunSnapshotStorageBuilderOptions);

    const snapshot = {
        ...fixture,
        runId: fixture.runId ?? createRunId('run'),
    } satisfies RunSnapshot;

    return snapshot;
}
