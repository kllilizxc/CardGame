// 新的“功法”概念：抽象化的卡牌效果 Schema

import type { ArtifactWeaponType } from './cards/artifact';

export enum EffectEventType {
  TurnStart = 'TurnStart',
  TurnEnd = 'TurnEnd',
  OnSummon = 'OnSummon',
  OnDeath = 'OnDeath',
  OnAttack = 'OnAttack',
  OnKill = 'OnKill',
  OnEquipArtifact = 'OnEquipArtifact',
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
  ArtifactEquipped = 'ArtifactEquipped',
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

export interface ArtifactEquippedCondition {
  type: EffectConditionType.ArtifactEquipped;
  weaponType?: ArtifactWeaponType;
  maxStar?: number | string; // 支持表达式，如 "card.star + 1"
}

export interface CustomCondition {
  type: EffectConditionType.Custom;
  scriptId: string;
}

export type EffectCondition =
  | ArtifactUsedCondition
  | UnitOnFieldCondition
  | CardInHandCondition
  | ArtifactEquippedCondition
  | CustomCondition;

export enum EffectActionType {
  RecoverCardFromDiscard = 'RecoverCardFromDiscard',
  SearchCardFromDeck = 'SearchCardFromDeck',
  DrawCards = 'DrawCards',
  DrawAndFilter = 'DrawAndFilter',
  ModifyStats = 'ModifyStats',
  DealDamage = 'DealDamage',
  ApplyStatus = 'ApplyStatus',
  ImmediateAttack = 'ImmediateAttack',
  GainArmor = 'GainArmor',
  AddLog = 'AddLog',
  Custom = 'Custom'
}

export enum EffectActionDestination {
  Hand = 'Hand',
  Field = 'Field',
  DeckTop = 'DeckTop',
  DiscardPile = 'DiscardPile'
}

export interface CardFilter {
  kind?: Array<'unit' | 'artifact' | 'talisman' | 'field'>;
  labelsAnyOf?: string[];
  maxStar?: number | string; // 支持数字或表达式字符串，如 "card.star + 2"
  amount?: number;
  weaponTypesAnyOf?: ArtifactWeaponType[];
}

export interface RecoverCardFromDiscardAction {
  type: EffectActionType.RecoverCardFromDiscard;
  filter: CardFilter;
  destination: EffectActionDestination;
  amount?: number;
}

export interface SearchCardFromDeckAction {
  type: EffectActionType.SearchCardFromDeck;
  filter: CardFilter;
  destination: EffectActionDestination;
  amount?: number;
}

export interface DrawCardsAction {
  type: EffectActionType.DrawCards;
  value: number;
}

export interface DrawAndFilterAction {
  type: EffectActionType.DrawAndFilter;
  amount: number; // 抽取的卡牌数量
  filter: CardFilter; // 筛选条件
  matchDestination: EffectActionDestination; // 匹配的卡牌去向
  nonMatchDestination: EffectActionDestination; // 不匹配的卡牌去向
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

export interface ImmediateAttackAction {
  type: EffectActionType.ImmediateAttack;
  target: 'singleEnemy' | 'allEnemies';
  damageMultiplier?: number; // 伤害倍率，默认1.0
}

export interface GainArmorAction {
  type: EffectActionType.GainArmor;
  target: 'self' | 'singleAlly' | 'allAllies';
  value: number | string; // 可以是数字或表达式，如 "artifact.star * 2"
}

export interface AddLogAction {
  type: EffectActionType.AddLog;
  message: string;
}

export interface CustomAction {
  type: EffectActionType.Custom;
  scriptId: string;
}

export type GongfaAction =
  | RecoverCardFromDiscardAction
  | SearchCardFromDeckAction
  | DrawCardsAction
  | DrawAndFilterAction
  | ModifyStatsAction
  | DealDamageAction
  | ApplyStatusAction
  | ImmediateAttackAction
  | GainArmorAction
  | AddLogAction
  | CustomAction;

export interface EffectSchema {
  event: EffectEvent;
  conditions?: EffectCondition[];
  actions: GongfaAction[];
}

// 功法：可以被多张卡牌复用的效果定义
export interface Gongfa {
  id: string;
  name?: string;
  schema: EffectSchema;
  description?: string;
}
