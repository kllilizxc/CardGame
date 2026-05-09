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
    | StoryGoToNodeEffect;

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
    appliedEffectKinds: StoryEffectKind[];
}

export interface ApplyStoryChoiceResult extends ApplyStoryEffectsResult {
    status: 'applied' | 'blocked';
    choiceId: string;
    unmetCondition?: StoryCondition;
}
