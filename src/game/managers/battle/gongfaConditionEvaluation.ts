import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import type {
    ArtifactEquippedCondition,
    EffectCondition,
} from '@data/types/gongfa';
import { EffectConditionType } from '@data/types/gongfa';
import { getStarFromGradeId } from '../../utils/ArtifactHelper';
import { getUnitStar } from '../../utils/RealmHelper';
import {
    evaluateGongfaNumberExpression,
    type GongfaExpressionContext
} from './gongfaExpression';
import { extractGongfaWeaponTypeFromLabels } from './gongfaCardFilter';

export interface GongfaConditionCardSource {
    getCardData(): {
        labels?: string[];
    };
}

export interface GongfaConditionUnitSource {
    getCardData(): UnitCard;
}

export interface GongfaConditionRuntimeContext {
    playerField: readonly GongfaConditionUnitSource[];
    hand: readonly GongfaConditionCardSource[];
    artifactUsage: Partial<Record<ArtifactWeaponType, number>>;
    triggerUnit?: GongfaConditionUnitSource;
    equippedArtifact?: ArtifactCard;
}

export function areGongfaConditionsSatisfied(
    conditions: readonly EffectCondition[],
    context: GongfaConditionRuntimeContext
): boolean {
    return conditions.every(condition => isGongfaConditionSatisfied(condition, context));
}

function isGongfaConditionSatisfied(
    condition: EffectCondition,
    context: GongfaConditionRuntimeContext
): boolean {
    switch (condition.type) {
        case EffectConditionType.ArtifactUsedThisTurn:
            return isArtifactUsageConditionSatisfied(condition.weaponType, condition.minimum, context);
        case EffectConditionType.UnitOnField:
            return isUnitOnFieldConditionSatisfied(condition, context);
        case EffectConditionType.CardInHand:
            return isCardInHandConditionSatisfied(condition, context);
        case EffectConditionType.ArtifactEquipped:
            return isArtifactEquippedConditionSatisfied(condition, context);
        case EffectConditionType.Custom:
            console.warn(`自定义功法条件暂未实现：${condition.scriptId}`);
            return false;
        default:
            return false;
    }
}

function isArtifactUsageConditionSatisfied(
    weaponType: ArtifactWeaponType | undefined,
    minimum: number | undefined,
    context: GongfaConditionRuntimeContext
): boolean {
    const requiredMinimum = minimum ?? 1;

    if (weaponType) {
        const count = context.artifactUsage[weaponType] ?? 0;
        return count >= requiredMinimum;
    }

    const total = Object.values(context.artifactUsage)
        .reduce((sum, value) => sum + value, 0);
    return total >= requiredMinimum;
}

function isUnitOnFieldConditionSatisfied(
    condition: Extract<EffectCondition, { type: EffectConditionType.UnitOnField }>,
    context: GongfaConditionRuntimeContext
): boolean {
    if (!condition.unitId && !condition.requiredLabelsAnyOf) {
        return true;
    }

    return context.playerField.some(fieldUnit => {
        const data = fieldUnit.getCardData();
        if (condition.unitId && data.id !== condition.unitId) {
            return false;
        }
        if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
            const labels = data.labels || [];
            return condition.requiredLabelsAnyOf.some(label => labels.includes(label));
        }
        return true;
    });
}

function isCardInHandConditionSatisfied(
    condition: Extract<EffectCondition, { type: EffectConditionType.CardInHand }>,
    context: GongfaConditionRuntimeContext
): boolean {
    const minimum = condition.minimum ?? 1;
    let count = 0;

    context.hand.forEach(cardSprite => {
        const data = cardSprite.getCardData();
        if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
            const labels = data.labels || [];
            if (condition.requiredLabelsAnyOf.some(label => labels.includes(label))) {
                count++;
            }
        } else {
            count++;
        }
    });

    return count >= minimum;
}

function isArtifactEquippedConditionSatisfied(
    condition: ArtifactEquippedCondition,
    context: GongfaConditionRuntimeContext
): boolean {
    if (!context.equippedArtifact) {
        return false;
    }

    if (condition.weaponType) {
        const weaponType = context.equippedArtifact.weaponType
            || extractGongfaWeaponTypeFromLabels(context.equippedArtifact.labels || []);
        if (weaponType !== condition.weaponType) {
            return false;
        }
    }

    if (condition.maxStar !== undefined) {
        const artifactStar = getStarFromGradeId(context.equippedArtifact.gradeId);
        const maxStarValue = typeof condition.maxStar === 'string'
            ? evaluateGongfaConditionExpression(condition.maxStar, context)
            : condition.maxStar;

        if (artifactStar > maxStarValue) {
            return false;
        }
    }

    return true;
}

function evaluateGongfaConditionExpression(
    expression: string,
    context: GongfaConditionRuntimeContext
): number {
    const expressionContext = buildGongfaConditionExpressionContext(context);
    if (!expressionContext) {
        console.warn(`表达式计算需要 triggerUnit: ${expression}`);
        return 0;
    }

    try {
        return evaluateGongfaNumberExpression(expression, expressionContext);
    } catch (error) {
        console.error(`表达式计算失败: ${expression}`, error);
        return 0;
    }
}

function buildGongfaConditionExpressionContext(
    context: GongfaConditionRuntimeContext
): GongfaExpressionContext | undefined {
    if (!context.triggerUnit) {
        return undefined;
    }

    const unitData = context.triggerUnit.getCardData();
    return {
        cardStar: getUnitStar(unitData),
        artifactStar: context.equippedArtifact
            ? getStarFromGradeId(context.equippedArtifact.gradeId)
            : 0
    };
}
