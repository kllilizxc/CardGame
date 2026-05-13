export type ExpeditionNodeType = 'entrance' | 'battle' | 'event' | 'shop' | 'extract' | 'boss';
export type ExpeditionEncounterNodeType = Extract<ExpeditionNodeType, 'battle' | 'boss'>;
export type ExpeditionContentNodeType = Extract<ExpeditionNodeType, 'event' | 'shop'>;
export type TerminalRunOutcome = 'defeat' | 'extract' | 'boss-clear';
export type RunStatus = 'inProgress' | TerminalRunOutcome;
export type RunNodeStatus = 'hidden' | 'reachable' | 'cleared';
export type ExpeditionItemType = 'artifact' | 'tool' | 'consumable' | 'quest';

export interface ExpeditionCardStack {
    id: string;
    count: number;
}

export interface ExpeditionItemStack {
    id: string;
    itemType: ExpeditionItemType;
    count: number;
}

export interface RunRewardBundle {
    cards: ExpeditionCardStack[];
    items: ExpeditionItemStack[];
    spiritStones: number;
}

export interface ExpeditionRouteIdentity {
    expeditionId: string;
    mapId: string;
}

export interface ExpeditionTargetConfig extends ExpeditionRouteIdentity {
    routeKey: string;
    worldStateResourceId?: string;
    worldStateFile: string;
    starterDeckResourceId?: string;
    starterDeckFile: string;
    mapResourceId?: string;
    mapFile: string;
    eventsResourceId?: string;
    eventsFile: string;
    shopResourceId?: string;
    shopFile: string;
}

export interface PersistentStash {
    stashId: string;
    deckRef?: string;
    deck: ExpeditionCardStack[];
    items: ExpeditionItemStack[];
    spiritStones: number;
    lastRunSummary?: RunResolutionSummary | null;
}

export interface RunNodeState {
    nodeId: string;
    status: RunNodeStatus;
    visited: boolean;
    rewardClaimed: boolean;
    purchasedOfferIds?: string[];
}

export interface RunTerminalResolutionIntent {
    kind: 'extract';
    nodeId: string;
    requestedAt: string;
}

export interface RunSnapshot {
    runId: string;
    routeKey?: string;
    expeditionId: string;
    mapId: string;
    status: RunStatus;
    currentNodeId: string;
    startingLoadout: RunRewardBundle;
    carriedDeck: ExpeditionCardStack[];
    carriedItems: ExpeditionItemStack[];
    spiritStones: number;
    visitedNodeIds: string[];
    nodeStates: Record<string, RunNodeState>;
    pendingEncounter?: BattleLaunchPayload | null;
    pendingTerminalResolution?: RunTerminalResolutionIntent | null;
    startedAt: string;
    resolvedAt?: string;
}

export interface BattleLaunchPayload {
    runId: string;
    nodeId: string;
    nodeType: ExpeditionEncounterNodeType;
    encounterId: string;
    encounterResourceId?: string;
    encounterFile: string;
    carriedDeck?: ExpeditionCardStack[];
    runDeck: ExpeditionCardStack[];
    rewardPreview?: RunRewardBundle;
    targetConfig?: ExpeditionTargetConfig;
}

export type ExpeditionBattleOutcome = 'battle-victory' | 'boss-clear' | 'defeat';

export interface ExpeditionBattleCompleteEvent {
    runId: string;
    nodeId: string;
    nodeType: ExpeditionEncounterNodeType;
    encounterId: string;
    encounterResourceId?: string;
    encounterFile: string;
    victory: boolean;
    outcome: ExpeditionBattleOutcome;
    completedAt: string;
    targetConfig?: ExpeditionTargetConfig;
}

export interface RunResolutionSummary {
    runId: string;
    outcome: TerminalRunOutcome;
    finalNodeId: string;
    kept: RunRewardBundle;
    lost: RunRewardBundle;
    endedAt: string;
}

export interface EntrancePayloadRef {
    kind: 'entrance';
    ref: string;
}

export interface EncounterPayloadRef {
    kind: 'encounter';
    ref: string;
    encounterResourceId?: string;
    encounterFile: string;
}

export interface EventPayloadRef {
    kind: 'event';
    ref: string;
    contentFile: string;
}

export interface ShopPayloadRef {
    kind: 'shop';
    ref: string;
    contentFile: string;
}

export interface ExtractPayloadRef {
    kind: 'extract';
    ref: string;
}

export type ExpeditionPayloadKind =
    | EntrancePayloadRef['kind']
    | EncounterPayloadRef['kind']
    | EventPayloadRef['kind']
    | ShopPayloadRef['kind']
    | ExtractPayloadRef['kind'];

export type ExpeditionNodePayloadRef =
    | EntrancePayloadRef
    | EncounterPayloadRef
    | EventPayloadRef
    | ShopPayloadRef
    | ExtractPayloadRef;

interface BaseExpeditionMapNode<TType extends ExpeditionNodeType, TPayload extends ExpeditionNodePayloadRef> {
    id: string;
    type: TType;
    layer: number;
    label: string;
    outgoingNodeIds: string[];
    payloadRef: TPayload;
}

export type EntranceMapNode = BaseExpeditionMapNode<'entrance', EntrancePayloadRef>;
export type BattleMapNode = BaseExpeditionMapNode<'battle', EncounterPayloadRef>;
export type BossMapNode = BaseExpeditionMapNode<'boss', EncounterPayloadRef>;
export type ExpeditionEncounterMapNode = BattleMapNode | BossMapNode;
export type EventMapNode = BaseExpeditionMapNode<'event', EventPayloadRef>;
export type ShopMapNode = BaseExpeditionMapNode<'shop', ShopPayloadRef>;
export type ExpeditionContentMapNode = EventMapNode | ShopMapNode;
export type ExtractMapNode = BaseExpeditionMapNode<'extract', ExtractPayloadRef>;
export type ExpeditionMapNode =
    | EntranceMapNode
    | ExpeditionEncounterMapNode
    | ExpeditionContentMapNode
    | ExtractMapNode;

export interface ExpeditionMapDefinition {
    id: string;
    name: string;
    description: string;
    entryNodeId: string;
    nodes: ExpeditionMapNode[];
}

export interface PrototypeEventOutcome {
    id: string;
    weight: number;
    label: string;
    description: string;
    rewards: RunRewardBundle;
}

export type ExpeditionEventOutcomeSelection =
    | { kind: 'weightedRandom' }
    | { kind: 'fixedOutcome'; outcomeId: string };

export interface PrototypeEventDefinition {
    nodeId: string;
    title: string;
    description: string;
    pool: PrototypeEventOutcome[];
}

export interface PrototypeEventCollection {
    id: string;
    eventsByNodeId: Record<string, PrototypeEventDefinition>;
}

export interface PrototypeShopOffer {
    id: string;
    label: string;
    description: string;
    cost: {
        spiritStones: number;
    };
    rewards: RunRewardBundle;
}

export interface PrototypeShopDefinition {
    nodeId: string;
    title: string;
    description: string;
    offers: PrototypeShopOffer[];
}

export interface PrototypeShopCollection {
    id: string;
    shopsByNodeId: Record<string, PrototypeShopDefinition>;
}
