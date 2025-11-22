// 新的“功法”概念：抽象化的卡牌效果 Schema

import type { ArtifactWeaponType } from './cards/artifact';

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
  weaponType?: ArtifactWeaponType;
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
  weaponTypesAnyOf?: ArtifactWeaponType[];
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

export interface ApplyStatusAction {
  type: EffectActionType.ApplyStatus;
  statusId: string;
  duration?: number;
  target: 'self' | 'singleAlly' | 'singleEnemy' | 'allEnemies';
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
  | ApplyStatusAction
  | AddLogAction
  | CustomAction;

export interface EffectSchema {
  event: EffectEvent;
  conditions?: EffectCondition[];
  actions: EffectAction[];
}

// 功法：可以被多张卡牌复用的效果定义
export interface Gongfa {
  id: string;
  name?: string;
  schema: EffectSchema;
  description?: string;
}
