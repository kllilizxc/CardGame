// 卡牌效果相关类型

// ========================= 新的结构化 Effect Schema =========================

export enum EffectEventType {
  TurnStart = 'TurnStart',
  TurnEnd = 'TurnEnd',
  OnSummon = 'OnSummon',
  OnDeath = 'OnDeath',
  OnAttack = 'OnAttack',
  OnKill = 'OnKill',
  Custom = 'Custom'
}

export enum EffectEventSide {
  Ally = 'Ally',
  Enemy = 'Enemy',
  Any = 'Any'
}

export interface EffectEvent {
  type: EffectEventType;
  side?: EffectEventSide;
  scriptId?: string; // Custom 时使用
}

export enum EffectConditionType {
  ArtifactUsedThisTurn = 'ArtifactUsedThisTurn',
  UnitOnField = 'UnitOnField',
  CardInHand = 'CardInHand',
  Custom = 'Custom'
}

export interface ArtifactUsedCondition {
  type: EffectConditionType.ArtifactUsedThisTurn;
  artifactTag?: string;
  minimum?: number;
}

export interface UnitOnFieldCondition {
  type: EffectConditionType.UnitOnField;
  unitId?: string;
  requiredLabelsAnyOf?: string[];
}

export interface CardInHandCondition {
  type: EffectConditionType.CardInHand;
  requiredLabelsAnyOf?: string[];
  minimum?: number;
}

export interface CustomCondition {
  type: EffectConditionType.Custom;
  scriptId: string;
}

export type EffectCondition =
  | ArtifactUsedCondition
  | UnitOnFieldCondition
  | CardInHandCondition
  | CustomCondition;

export enum EffectActionType {
  RecoverCardFromDiscard = 'RecoverCardFromDiscard',
  DrawCards = 'DrawCards',
  ModifyStats = 'ModifyStats',
  DealDamage = 'DealDamage',
  ApplyStatus = 'ApplyStatus',
  AddLog = 'AddLog',
  Custom = 'Custom'
}

export enum EffectActionDestination {
  Hand = 'Hand',
  Field = 'Field',
  DeckTop = 'DeckTop'
}

export interface CardFilter {
  kind?: Array<'unit' | 'artifact' | 'talisman' | 'field'>;
  labelsAnyOf?: string[];
  maxStar?: number;
  amount?: number;
}

export interface RecoverCardFromDiscardAction {
  type: EffectActionType.RecoverCardFromDiscard;
  filter: CardFilter;
  destination: EffectActionDestination;
  amount?: number;
}

export interface DrawCardsAction {
  type: EffectActionType.DrawCards;
  value: number;
}

export interface ModifyStatsAction {
  type: EffectActionType.ModifyStats;
  attackDelta?: number;
  healthDelta?: number;
}

export interface DealDamageAction {
  type: EffectActionType.DealDamage;
  value: number;
  target: 'singleEnemy' | 'allEnemies' | 'randomEnemy';
}

export interface AddLogAction {
  type: EffectActionType.AddLog;
  message: string;
}

export interface CustomAction {
  type: EffectActionType.Custom;
  scriptId: string;
}

export type EffectAction =
  | RecoverCardFromDiscardAction
  | DrawCardsAction
  | ModifyStatsAction
  | DealDamageAction
  | AddLogAction
  | CustomAction;

export interface EffectSchema {
  event: EffectEvent;
  conditions?: EffectCondition[];
  actions: EffectAction[];
}

// ========================= 旧版兼容结构 =========================

// 旧的卡牌效果触发时机（兼容旧数据）
export type EffectTiming =
  | 'permanent'
  | 'onSummon'
  | 'onDeath'
  | 'onAttack'
  | 'onKill'
  | 'onDamaged'
  | 'turnStart'
  | 'turnEnd'
  | 'reaction';

// 旧的目标定义
export type EffectTargetScope =
  | 'self'
  | 'ownerPlayer'
  | 'allyUnits'
  | 'allAllies'
  | 'enemyUnits'
  | 'allEnemies'
  | 'singleAlly'
  | 'singleEnemy'
  | 'attackTarget'
  | 'damageSource'
  | 'allUnits'
  | 'none';

export interface EffectTarget {
  scope: EffectTargetScope;
  requiredLabelsAllOf?: string[];
  requiredLabelsAnyOf?: string[];
}

export type LegacyEffectConditionType =
  | 'hasLabel'
  | 'realmDiffAtLeast'
  | 'unitCountAtLeast'
  | 'hasCardInHand'
  | 'custom';

export interface LegacyEffectCondition {
  type: LegacyEffectConditionType;
  labels?: string[];
  value?: number;
  scriptId?: string;
}

export type LegacyEffectActionType =
  | 'modifyAttack'
  | 'modifyHealth'
  | 'dealDamage'
  | 'heal'
  | 'drawCards'
  | 'searchDeck'
  | 'healPlayer'
  | 'damagePlayer'
  | 'applyStatus'
  | 'removeDebuffs'
  | 'destroyUnit'
  | 'custom';

interface LegacyEffectActionBase {
  statusId?: string;
  stacks?: number;
  scriptId?: string;
}

type LegacyValueEffectActionType =
  | 'modifyAttack'
  | 'modifyHealth'
  | 'dealDamage'
  | 'heal'
  | 'drawCards'
  | 'searchDeck'
  | 'healPlayer'
  | 'damagePlayer';

export interface LegacyValueEffectAction extends LegacyEffectActionBase {
  type: LegacyValueEffectActionType;
  value: number;
}

export interface LegacyApplyStatusEffectAction extends LegacyEffectActionBase {
  type: 'applyStatus';
  statusId: string;
  value?: number;
}

export interface LegacyRemoveDebuffsEffectAction extends LegacyEffectActionBase {
  type: 'removeDebuffs';
  value?: number;
}

export interface LegacyDestroyUnitEffectAction extends LegacyEffectActionBase {
  type: 'destroyUnit';
  value?: number;
}

export interface LegacyCustomEffectAction extends LegacyEffectActionBase {
  type: 'custom';
  value?: number;
}

export type LegacyEffectAction =
  | LegacyValueEffectAction
  | LegacyApplyStatusEffectAction
  | LegacyRemoveDebuffsEffectAction
  | LegacyDestroyUnitEffectAction
  | LegacyCustomEffectAction;

// 兼容结构：旧字段 + 新 schema
export interface CardEffect {
  id?: string;
  timing?: EffectTiming;
  target?: EffectTarget;
  conditions?: LegacyEffectCondition[];
  actions?: LegacyEffectAction[];
  text?: string;
  scriptId?: string;
  schema?: EffectSchema;
}
