// 卡牌效果相关类型

// ========================= 新（目标收敛）结构化 Effect Schema =========================
// 说明：
// 1) 这是“新域”结构，用于后续独立演进的结构化效果表达。
// 2) 当前玩法运行时仍以 legacy 域为主；该域先只用于类型表达与过渡期工具。

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

export interface ApplyStatusAction {
  type: EffectActionType.ApplyStatus;
  statusId: string;
  target: 'self' | 'singleAlly' | 'singleEnemy' | 'allEnemies';
  duration?: number;
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

// ========================= 旧版兼容结构（现网语义来源） =========================
// 说明：
// 目前仍以 legacy 域为主要执行语义边界；新域 schema 主要用于后续迁移阶段的平行演进。

export type LegacyEffectTiming =
  | 'permanent'
  | 'onSummon'
  | 'onDeath'
  | 'onAttack'
  | 'onKill'
  | 'onDamaged'
  | 'turnStart'
  | 'turnEnd'
  | 'reaction';

export type LegacyEffectTargetScope =
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

export interface LegacyEffectTarget {
  scope: LegacyEffectTargetScope;
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
  | 'loseHealth'
  | 'drawCards'
  | 'searchDeck'
  | 'heal'
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
  | 'loseHealth'
  | 'drawCards'
  | 'searchDeck'
  | 'heal'
  | 'healPlayer'
  | 'damagePlayer';

export interface LegacyValueEffectAction extends LegacyEffectActionBase {
  type: LegacyValueEffectActionType;
  value?: number;
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

// ========================= CardEffect 边界分拆 =========================
// 历史事实：现有内容/运行时主要使用 legacy 域；
// 结构化 schema 域用于后续迁移，不参与现网执行。

interface CardEffectEnvelopeBase {
  id?: string;
  text?: string;
  scriptId?: string;
}

export interface LegacyCardEffect extends CardEffectEnvelopeBase {
  timing?: LegacyEffectTiming;
  target?: LegacyEffectTarget;
  conditions?: LegacyEffectCondition[];
  actions?: LegacyEffectAction[];
  schema?: never;
}

export interface SchemaCardEffect extends CardEffectEnvelopeBase {
  schema: EffectSchema;
  timing?: never;
  target?: never;
  conditions?: never;
  actions?: never;
}

export type CardEffect = LegacyCardEffect | SchemaCardEffect;

export type CardEffectDomain = 'legacy' | 'schema';

// Legacy 新域收敛辅助工具（不改变运行行为，仅用于迁移评估）
export interface CardEffectMigrationWarning {
  code: string;
  detail: string;
}

export interface CardActionMigrationResult {
  original: LegacyEffectAction;
  status: 'migrated' | 'blocked';
  mappedAction?: EffectAction;
  warnings: CardEffectMigrationWarning[];
}

export interface CardEffectMigrationReport {
  domain: 'legacy';
  targetEvent?: EffectEvent;
  schemaConditions: EffectCondition[];
  migratedActions: EffectAction[];
  actionMigration: CardActionMigrationResult[];
  warnings: CardEffectMigrationWarning[];
  complete: boolean;
}

export interface LegacyEffectDomainAdapter {
  (effect: LegacyCardEffect): CardEffectMigrationReport;
}

const legacyTimingToSchemaEvent: Record<LegacyEffectTiming, EffectEventType | null> = {
  permanent: null,
  onSummon: EffectEventType.OnSummon,
  onDeath: EffectEventType.OnDeath,
  onAttack: EffectEventType.OnAttack,
  onKill: EffectEventType.OnKill,
  onDamaged: null,
  turnStart: EffectEventType.TurnStart,
  turnEnd: EffectEventType.TurnEnd,
  reaction: EffectEventType.Custom
};

const isSchemaCardEffect = (effect: CardEffect): effect is SchemaCardEffect => 'schema' in effect;

export function getCardEffectDomain(effect: CardEffect): CardEffectDomain {
  return isSchemaCardEffect(effect) ? 'schema' : 'legacy';
}

export function isLegacyCardEffect(effect: CardEffect): effect is LegacyCardEffect {
  return !isSchemaCardEffect(effect);
}

function migrateLegacyCondition(condition: LegacyEffectCondition): { migrated?: EffectCondition; warnings: CardEffectMigrationWarning[] } {
  if (condition.type === 'hasCardInHand') {
    return {
      migrated: {
        type: EffectConditionType.CardInHand,
        requiredLabelsAnyOf: condition.labels ?? undefined,
        minimum: condition.value ?? 1
      },
      warnings: []
    };
  }

  if (condition.type === 'custom' && condition.scriptId) {
    return {
      migrated: {
        type: EffectConditionType.Custom,
        scriptId: condition.scriptId
      },
      warnings: []
    };
  }

  if (condition.type === 'hasLabel') {
    return {
      migrated: {
        type: EffectConditionType.UnitOnField,
        requiredLabelsAnyOf: condition.labels ?? undefined
      },
      warnings: []
    };
  }

  return {
    warnings: [{
      code: 'legacy-condition-not-migrated',
      detail: `Legacy condition "${condition.type}" has no schema-equivalent mapping in current EffectCondition domain.`
    }]
  };
}

function migrateLegacyAction(action: LegacyEffectAction): CardActionMigrationResult {
  switch (action.type) {
    case 'modifyAttack': {
      const value = action.value ?? 0;
      return {
        original: action,
        status: 'migrated',
        mappedAction: {
          type: EffectActionType.ModifyStats,
          attackDelta: value
        },
        warnings: []
      };
    }

    case 'modifyHealth':
    case 'heal': {
      const value = action.value ?? 0;
      return {
        original: action,
        status: 'migrated',
        mappedAction: {
          type: EffectActionType.ModifyStats,
          healthDelta: value
        },
        warnings: []
      };
    }

    case 'loseHealth': {
      const value = action.value ?? 0;
      return {
        original: action,
        status: 'migrated',
        mappedAction: {
          type: EffectActionType.ModifyStats,
          healthDelta: -Math.abs(value)
        },
        warnings: []
      };
    }

    case 'drawCards': {
      return {
        original: action,
        status: 'migrated',
        mappedAction: {
          type: EffectActionType.DrawCards,
          value: Math.max(1, action.value ?? 1)
        },
        warnings: []
      };
    }

    case 'dealDamage': {
      const value = action.value ?? 0;
      return {
        original: action,
        status: 'migrated',
        mappedAction: {
          type: EffectActionType.DealDamage,
          value,
          target: 'singleEnemy'
        },
        warnings: [{
          code: 'legacy-action-target-defaulted',
          detail: 'Legacy dealDamage has no target in current legacy card schema; migration defaults to singleEnemy.'
        }]
      };
    }

    case 'searchDeck':
      return {
        original: action,
        status: 'blocked',
        warnings: [{
          code: 'legacy-action-blocked',
          detail: 'searchDeck is legacy-only and has no direct equivalent in current EffectAction domain.'
        }]
      };

    case 'applyStatus':
      return {
        original: action,
        status: 'blocked',
        warnings: [{
          code: 'legacy-action-blocked',
          detail: 'applyStatus is blocked because target semantics differ between legacy and schema domain.'
        }]
      };

    case 'removeDebuffs':
    case 'destroyUnit':
    case 'custom':
    case 'healPlayer':
    case 'damagePlayer':
    default:
      return {
        original: action,
        status: 'blocked',
        warnings: [{
          code: 'legacy-action-blocked',
          detail: `Legacy action "${action.type}" has no schema-equivalent in current EffectActionType domain.`
        }]
      };
  }
}

export const adaptLegacyCardEffectToSchema: LegacyEffectDomainAdapter = (effect) => {
  const warnings: CardEffectMigrationWarning[] = [];
  const conditions: EffectCondition[] = [];
  const actionMigration = (effect.conditions ?? []).map((c) => migrateLegacyCondition(c));

  for (const info of actionMigration) {
    if (info.migrated) {
      conditions.push(info.migrated);
    }
    if (info.warnings) {
      warnings.push(...info.warnings);
    }
  }

  const actionAdapters = (effect.actions ?? []).map((action) => migrateLegacyAction(action));
  const migratedActions: EffectAction[] = [];
  const actionWarnings: CardActionMigrationResult[] = [];
  for (const item of actionAdapters) {
    if (item.mappedAction) {
      migratedActions.push(item.mappedAction);
    }
    actionWarnings.push(item);
    if (item.status === 'blocked') {
      warnings.push(...item.warnings);
    }
  }

  const eventType = effect.timing ? legacyTimingToSchemaEvent[effect.timing] : null;
  const targetEvent = eventType
    ? (eventType === EffectEventType.Custom
      ? { type: EffectEventType.Custom, scriptId: effect.scriptId }
      : { type: eventType, side: EffectEventSide.Any })
    : undefined;
  const isComplete = Boolean(targetEvent) && warnings.length === 0;

  if (!targetEvent) {
    warnings.push({
      code: 'legacy-timing-not-migrated',
      detail: `Legacy timing "${effect.timing ?? 'undefined'}" has no direct schema event mapping.`
    });
  }

  return {
    domain: 'legacy',
    targetEvent,
    schemaConditions: conditions,
    migratedActions,
    actionMigration: actionWarnings,
    warnings,
    complete: isComplete
  };
};
