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

type NullableRunId = string | null;

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

export function createTestStoryHubDocument(statusText: string, updatedAt = DEFAULT_STORY_HUB_SESSION_UPDATED_AT): StoryHubSessionDocument {
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
    return {
        stashId: 'test-stash',
        deckRef: 'test-deck',
        deck: [{ id: 'TEST_CARD', count: 2 }],
        items: [{ id: 'tool.return-rope', itemType: 'tool', count: 1 }],
        spiritStones: 10,
        lastRunSummary: null,
        ...overrides,
    };
}

export function createTestRewardBundle(overrides: Partial<RunRewardBundle> = {}): RunRewardBundle {
    return {
        cards: [
            { id: 'CARD_A', count: 1 },
        ],
        items: [
            createItemStack('item.rope', 'tool', 1),
        ],
        spiritStones: 0,
        ...overrides,
    };
}

export function createTestShopOffer(overrides: Partial<PrototypeShopOffer> = {}): PrototypeShopOffer {
    return {
        id: 'offer.default',
        label: '默认商店奖励',
        description: '用于测试场景的默认商店奖励。',
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
}

export function createTestShopDefinition(overrides: Partial<PrototypeShopDefinition> = {}): PrototypeShopDefinition {
    return {
        nodeId: 'shop.test',
        title: '测试商店',
        description: '用于世界状态测试输入统一的默认商店。',
        offers: [createTestShopOffer()],
        ...overrides,
    };
}

export function createTestEventDefinition(overrides: Partial<PrototypeEventDefinition> = {}): PrototypeEventDefinition {
    return {
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
}

export interface RunSnapshotBuilderOptions extends Omit<Partial<RunSnapshot>, 'expeditionId' | 'mapId' | 'routeKey' | 'runId'> {
    runId?: string;
}

export interface RunSnapshotStorageBuilderOptions extends Omit<Partial<RunSnapshot>, 'expeditionId' | 'mapId' | 'routeKey'> {
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

    return {
        runId,
        routeKey: createActiveRunRouteKey(identity),
        expeditionId: identity.expeditionId,
        mapId: identity.mapId,
        status: 'inProgress',
        currentNodeId,
        startingLoadout: {
            cards: [{ id: 'CARD_A', count: 2 }],
            items: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
            spiritStones: 0,
        },
        carriedDeck: [{ id: 'CARD_A', count: 3 }],
        carriedItems: [{ id: 'item.rope', itemType: 'tool', count: 1 }],
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
    };
}

export function createRunSnapshot(
    identity: ExpeditionRouteIdentity = DEFAULT_EXPEDITION_TARGET,
    options: RunSnapshotBuilderOptions = {},
): RunSnapshot {
    const fixture = createRunSnapshotFixture(identity, options as RunSnapshotStorageBuilderOptions);

    return {
        ...fixture,
        runId: fixture.runId ?? createRunId('run'),
    };
}
