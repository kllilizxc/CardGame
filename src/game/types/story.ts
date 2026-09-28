import type { DeterministicBattleSetup } from './battle';
import type { ExpeditionItemType } from './expedition';

export type StoryAttributeOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface StoryCardGrant {
    grantId: string;
    cardId: string;
    count: number;
}

export interface StoryItemTransaction {
    transactionId: string;
    itemId: string;
    itemType: ExpeditionItemType;
    /** Positive for a grant, negative for a consumption. */
    countDelta: number;
}

export interface StoryState {
    storyId: string;
    currentLocationId: string;
    currentSublocationId: string;
    currentNodeId: string;
    visitedNodeIds: string[];
    triggeredDialogueIds: string[];
    flags: Record<string, boolean>;
    attributes: Record<string, number>;
    /** Derived from currently equipped items; never copied into shared base attributes. */
    equipmentModifiers?: Record<string, number>;
    relations: Record<string, number>;
    /** Runtime abilities keyed by stable actor ID, seeded from the NPC catalog. */
    actorAbilities?: Record<string, Record<string, number>>;
    /** Legacy story-content location text, distinct from the runtime location ID. */
    currentLocationLabel?: string;
    knowledge?: Record<string, string[]>;
    questStages?: Record<string, string>;
    settledEventIds?: string[];
    cardGrants?: StoryCardGrant[];
    itemTransactions?: StoryItemTransaction[];
    /** Current stash quantities, refreshed before evaluating a choice. */
    itemCounts?: Record<string, number>;
    /** Current line in the active node; kept in the story session, not shared facts. */
    currentDialogueId?: string;
    /** Page within the current portrait reading passage; kept in the story session. */
    currentReadingPage?: number;
}

export interface StoryInitialStateSeed {
    storyId: string;
    locationId: string;
    sublocationId: string;
    nodeId: string;
    visitedNodeIds?: string[];
    triggeredDialogueIds?: string[];
    flags?: Record<string, boolean>;
    attributes?: Record<string, number>;
    relations?: Record<string, number>;
    actorAbilities?: Record<string, Record<string, number>>;
    knowledge?: Record<string, string[]>;
    questStages?: Record<string, string>;
    settledEventIds?: string[];
}

export interface StorySharedFacts {
    flags: Record<string, boolean>;
    attributes: Record<string, number>;
    relations: Record<string, number>;
    knowledge: Record<string, string[]>;
    questStages: Record<string, string>;
    settledEventIds: string[];
    cardGrants?: StoryCardGrant[];
    itemTransactions?: StoryItemTransaction[];
}

export interface StoryAttributeCondition {
    kind: 'attribute';
    attribute: string;
    operator: StoryAttributeOperator;
    value: number;
}

export interface StoryAlwaysCondition {
    kind: 'always';
}

export interface StoryRelationCondition {
    kind: 'relation';
    relationId: string;
    operator: StoryAttributeOperator;
    value: number;
}

export interface StoryItemCountCondition {
    kind: 'itemCount';
    itemId: string;
    operator: StoryAttributeOperator;
    value: number;
}

export interface StoryActorAbilityCondition {
    kind: 'actorAbility';
    actorId: string;
    ability: string;
    operator: StoryAttributeOperator;
    value: number;
}

export interface StoryKnowledgeCondition {
    kind: 'knowledge';
    actorId: string;
    knowledgeId: string;
    expected?: boolean;
}

export interface StoryQuestStageCondition {
    kind: 'questStage';
    questId: string;
    stage: string;
}

export interface StoryFlagCondition {
    kind: 'flag';
    flag: string;
    expected?: boolean;
}

export interface StoryVisitedNodeCondition {
    kind: 'visitedNode';
    nodeId: string;
    expected?: boolean;
}

export interface StoryTriggeredDialogueCondition {
    kind: 'triggeredDialogue';
    dialogueId: string;
    expected?: boolean;
}

export interface StoryAllCondition {
    kind: 'all';
    conditions: StoryCondition[];
}

export interface StoryAnyCondition {
    kind: 'any';
    conditions: StoryCondition[];
}

export interface StoryNotCondition {
    kind: 'not';
    condition: StoryCondition;
}

export type StoryCondition =
    | StoryAlwaysCondition
    | StoryAttributeCondition
    | StoryRelationCondition
    | StoryItemCountCondition
    | StoryActorAbilityCondition
    | StoryKnowledgeCondition
    | StoryQuestStageCondition
    | StoryFlagCondition
    | StoryVisitedNodeCondition
    | StoryTriggeredDialogueCondition
    | StoryAllCondition
    | StoryAnyCondition
    | StoryNotCondition;

export interface StorySetFlagEffect {
    kind: 'setFlag';
    flag: string;
    value?: boolean;
}

export interface StoryClearFlagEffect {
    kind: 'clearFlag';
    flag: string;
}

export interface StoryRecordVisitedNodeEffect {
    kind: 'recordVisitedNode';
    nodeId: string;
}

export interface StoryRecordDialogueEffect {
    kind: 'recordDialogue';
    dialogueId: string;
}

export interface StorySetAttributeEffect {
    kind: 'setAttribute';
    attribute: string;
    value: number;
}

export interface StoryAdjustAttributeEffect {
    kind: 'adjustAttribute';
    attribute: string;
    delta: number;
}

export interface StorySetRelationEffect {
    kind: 'setRelation';
    relationId: string;
    value: number;
}

export interface StoryAdjustRelationEffect {
    kind: 'adjustRelation';
    relationId: string;
    delta: number;
}

export interface StoryMoveToEffect {
    kind: 'moveTo';
    locationId: string;
    sublocationId: string;
    nodeId?: string;
}

export interface StoryGoToNodeEffect {
    kind: 'goToNode';
    nodeId: string;
}

export interface StorySetLocationLabelEffect {
    kind: 'setLocationLabel';
    location: string;
}

export interface StoryLearnKnowledgeEffect {
    kind: 'learnKnowledge';
    actorId: string;
    knowledgeId: string;
}

export interface StorySetQuestStageEffect {
    kind: 'setQuestStage';
    questId: string;
    stage: string;
}

export interface StoryGrantCardEffect extends StoryCardGrant {
    kind: 'grantCard';
}

export interface StoryGrantItemEffect {
    kind: 'grantItem';
    transactionId: string;
    itemId: string;
    itemType: ExpeditionItemType;
    count: number;
}

export interface StoryConsumeItemEffect {
    kind: 'consumeItem';
    transactionId: string;
    itemId: string;
    itemType: ExpeditionItemType;
    count: number;
}

export interface StoryOnceEffect {
    kind: 'once';
    eventId: string;
    effects: StoryEffect[];
}

export interface StoryBattleTrigger {
    battleId: string;
    encounterResourceId?: string;
    encounterId: string;
    encounterFile: string;
    deckResourceId?: string;
    deckFile: string;
    deterministicBattleSetup?: DeterministicBattleSetup;
    onVictoryNodeId: string;
    onDefeatNodeId: string;
    launchText?: string;
}

export interface StoryBattleLaunchMetadata extends StoryBattleTrigger {
    sceneKey: 'BattleScene';
    storyId: string;
    sourceNodeId: string;
    sourceChoiceId?: string;
    targetNodeId: string;
}

export interface StoryHubSessionKey {
    hubId: string;
    actionId: string;
    storyGraphFile: string;
}

export interface StoryBattleSceneLaunchPayload {
    source: 'story';
    storyResourceId?: string;
    battleLaunch: StoryBattleLaunchMetadata;
    storyState: StoryState;
    selectedChoiceIds: string[];
    storyGraphFile?: string;
    hubSession?: StoryHubSessionKey;
    tutorial?: boolean;
}

export type StoryBattleOutcome = 'victory' | 'defeat';

export interface StoryBattleCompleteEvent {
    source: 'story';
    storyId: string;
    battleId: string;
    encounterResourceId?: string;
    encounterId: string;
    encounterFile: string;
    deckResourceId?: string;
    deckFile: string;
    storyResourceId?: string;
    storyGraphFile?: string;
    victory: boolean;
    outcome: StoryBattleOutcome;
    sourceNodeId: string;
    sourceChoiceId?: string;
    pendingNodeId: string;
    onVictoryNodeId: string;
    onDefeatNodeId: string;
    resultNodeId: string;
    hubSession?: StoryHubSessionKey;
    storyState: StoryState;
    selectedChoiceIds: string[];
    completedAt: string;
}

export interface StoryStartBattleEffect {
    kind: 'startBattle';
    battle: StoryBattleTrigger;
}

export type StoryEffect =
    | StorySetFlagEffect
    | StoryClearFlagEffect
    | StoryRecordVisitedNodeEffect
    | StoryRecordDialogueEffect
    | StorySetAttributeEffect
    | StoryAdjustAttributeEffect
    | StorySetRelationEffect
    | StoryAdjustRelationEffect
    | StoryMoveToEffect
    | StoryGoToNodeEffect
    | StorySetLocationLabelEffect
    | StoryLearnKnowledgeEffect
    | StorySetQuestStageEffect
    | StoryGrantCardEffect
    | StoryGrantItemEffect
    | StoryConsumeItemEffect
    | StoryOnceEffect
    | StoryStartBattleEffect;

export type StoryEffectKind = StoryEffect['kind'];

export interface StoryChoiceRuntimeDefinition {
    id: string;
    condition?: StoryCondition;
    effects?: StoryEffect[];
    nextNodeId?: string;
}

export interface ApplyStoryEffectsResult {
    state: StoryState;
    nextNodeId?: string;
    pendingBattle?: StoryBattleTrigger;
    appliedEffectKinds: StoryEffectKind[];
}

export interface ApplyStoryChoiceResult extends ApplyStoryEffectsResult {
    status: 'applied' | 'blocked';
    choiceId: string;
    unmetCondition?: StoryCondition;
}
