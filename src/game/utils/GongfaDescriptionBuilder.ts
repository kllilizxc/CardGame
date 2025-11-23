import type { EffectSchema, EffectCondition, GongfaAction } from '@data/types/gongfa';
import { EffectEventType, EffectConditionType, EffectActionType } from '@data/types/gongfa';

export function describeGongfa(schema: EffectSchema): string {
    const eventText = describeEvent(schema.event.type);
    const conditionText = schema.conditions && schema.conditions.length > 0
        ? describeConditions(schema.conditions)
        : '';
    const actionText = describeActions(schema.actions);

    if (conditionText) {
        return `${eventText}：${conditionText}，${actionText}。`;
    }
    return `${eventText}：${actionText}。`;
}

function describeEvent(eventType: EffectEventType): string {
    switch (eventType) {
        case EffectEventType.TurnStart:
            return '回合开始时';
        case EffectEventType.TurnEnd:
            return '回合结束时';
        case EffectEventType.OnSummon:
            return '登场时';
        case EffectEventType.OnDeath:
            return '离场时';
        case EffectEventType.OnAttack:
            return '攻击时';
        case EffectEventType.OnKill:
            return '击杀敌人时';
        default:
            return '发动时';
    }
}

function describeConditions(conditions: EffectCondition[]): string {
    return conditions.map(condition => {
        switch (condition.type) {
            case EffectConditionType.ArtifactUsedThisTurn: {
                const weaponText = condition.weaponType ? `${condition.weaponType}器` : '法器';
                const minText = condition.minimum && condition.minimum > 1 ? `${condition.minimum}次` : '至少1次';
                return `若本回合你使用过${minText}${weaponText}`;
            }
            case EffectConditionType.ArtifactEquipped: {
                const weaponText = condition.weaponType ? `${condition.weaponType}器` : '法器';
                return `装备${weaponText}时`;
            }
            case EffectConditionType.UnitOnField: {
                if (condition.unitId) {
                    return `若场上存在【${condition.unitId}】`;
                }
                if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
                    return `若场上存在${condition.requiredLabelsAnyOf.join('或')}单位`;
                }
                return '若场上有友方单位';
            }
            case EffectConditionType.CardInHand: {
                const countText = condition.minimum && condition.minimum > 1 ? `${condition.minimum}张` : '至少1张';
                if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
                    return `若手牌中有${countText}${condition.requiredLabelsAnyOf.join('或')}卡牌`;
                }
                return `若手牌中有${countText}卡牌`;
            }
            default:
                return '满足特定条件';
        }
    }).join('，');
}

/**
 * 翻译表达式中的变量为中文
 */
function translateExpression(expression: string): string {
    return expression
        .replace(/artifact\.star/g, '法器星级')
        .replace(/card\.star/g, '单位星级');
}

function describeActions(actions: GongfaAction[]): string {
    return actions.map(action => {
        switch (action.type) {
            case EffectActionType.RecoverCardFromDiscard: {
                const amountText = action.amount && action.amount > 1 ? `${action.amount}张` : '1张';
                const weaponText = action.filter.weaponTypesAnyOf && action.filter.weaponTypesAnyOf.length > 0
                    ? action.filter.weaponTypesAnyOf.join('或') + '器'
                    : action.filter.labelsAnyOf && action.filter.labelsAnyOf.length > 0
                        ? action.filter.labelsAnyOf.join('或') + '卡牌'
                        : '卡牌';
                return `从弃牌堆选择${amountText}${weaponText}加入手牌`;
            }
            case EffectActionType.SearchCardFromDeck: {
                const amountText = action.amount && action.amount > 1 ? `${action.amount}张` : '1张';
                const weaponText = action.filter.weaponTypesAnyOf && action.filter.weaponTypesAnyOf.length > 0
                    ? action.filter.weaponTypesAnyOf.join('或') + '器'
                    : action.filter.labelsAnyOf && action.filter.labelsAnyOf.length > 0
                        ? action.filter.labelsAnyOf.join('或') + '卡牌'
                        : '卡牌';
                return `从牌库检索${amountText}${weaponText}`;
            }
            case EffectActionType.ImmediateAttack: {
                const targetText = action.target === 'allEnemies' ? '所有敌人' : '单个敌人';
                const multiplierText = action.damageMultiplier && action.damageMultiplier !== 1.0
                    ? `造成${Math.floor(action.damageMultiplier * 100)}%攻击力的伤害`
                    : '立即攻击';
                return `对${targetText}${multiplierText}`;
            }
            case EffectActionType.GainArmor: {
                const valueText = typeof action.value === 'string'
                    ? translateExpression(action.value)
                    : `${action.value}点`;
                return `获得${valueText}护甲`;
            }
            case EffectActionType.DrawCards:
                return `抽${action.value}张牌`;
            case EffectActionType.ModifyStats:
                return '调整单位属性';
            case EffectActionType.DealDamage:
                return '造成伤害';
            case EffectActionType.AddLog:
                return '记录战斗日志';
            case EffectActionType.ApplyStatus:
                return '施加状态';
            case EffectActionType.Custom:
                return '触发自定义效果';
            default:
                return '执行效果';
        }
    }).join('，');
}
