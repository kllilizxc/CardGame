import type { DeterministicBattleSetup } from './battle';

export type StoryAttributeOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface StoryState {
    storyId: string;
    currentLocationId: string;
    currentSublocationId: string;
    currentNodeId: string;
    visitedNodeIds: string[];
    triggeredDialogueIds: string[];
    flags: Record<string, boolean>;
    attributes: Record<string, number>;
    relations: Record<string, number>;
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
}

export interface StoryAttributeCondition {
    kind: 'attribute';
    attribute: string;
    operator: StoryAttributeOperator;
    value: number;
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
    | StoryAttributeCondition
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
