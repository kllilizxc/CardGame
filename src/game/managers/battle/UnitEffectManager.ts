import type { BattleContext } from '../../context/BattleContext';
import { getUnitStar } from '../../utils/RealmHelper';
import { getStarFromGradeId } from '../../utils/ArtifactHelper';
import type { CardSprite } from '../../objects/CardSprite';
import type {
    Gongfa,
    GongfaAction,
    EffectCondition,
    EffectSchema,
    ArtifactEquippedCondition,
} from '@data/types/gongfa';
import { EffectEventType, EffectEventSide, EffectConditionType } from '@data/types/gongfa';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import { evaluateGongfaNumberExpression, type GongfaExpressionContext } from './gongfaExpression';
import { extractGongfaWeaponTypeFromLabels } from './gongfaCardFilter';
import type { GongfaCardOperationCard } from './gongfaCardOperations';
import {
    executeGongfaActions,
    type GongfaOperationDispatchContext
} from './gongfaOperationDispatch';

type AnyHandSprite = CardSprite | import('../../objects/ArtifactSprite').ArtifactSprite | import('../../objects/TalismanSprite').TalismanSprite | import('../../objects/FieldSprite').FieldSprite;

export interface GongfaRuntimeContext {
    playerField: CardSprite[];
    enemyField?: CardSprite[];
    discardPile: GongfaCardOperationCard[];
    deck?: GongfaCardOperationCard[]; // 卡组，用于抽牌筛选
    hand: AnyHandSprite[];
    discardPileButton?: Phaser.GameObjects.Rectangle;
    cardScale: number;
    artifactUsage: Partial<Record<ArtifactWeaponType, number>>;
    triggerUnit?: CardSprite; // 触发功法的单位，用于表达式计算和攻击
    equippedArtifact?: ArtifactCard; // 当前装备的法器，用于装备事件
    gameActionHandler?: any; // GameActionHandler 实例，用于选择卡牌等操作
    combatManager?: any; // CombatManager 实例，用于执行攻击
    battleStatusController?: any; // BattleStatusController 实例，用于应用状态
    battleTickManager?: any; // BattleTickManager 实例，用于状态检查
}

export class UnitEffectManager {
    private battleContext: BattleContext;
    private gongfaMap: Map<string, Gongfa> = new Map();

    constructor(
        battleContext: BattleContext,
        gongfaList: Gongfa[]
    ) {
        this.battleContext = battleContext;

        // 构建功法映射
        gongfaList.forEach(gongfa => {
            this.gongfaMap.set(gongfa.id, gongfa);
        });
    }

    public applyTurnEndEffectsForPlayerUnits(playerField: CardSprite[], context: GongfaRuntimeContext): void {
        playerField.forEach(unit => {
            this.executeUnitGongfa(unit, EffectEventType.TurnEnd, EffectEventSide.Ally, context);
        });
    }

    public applyOnSummonEffects(unit: CardSprite, context: GongfaRuntimeContext): void {
        this.executeUnitGongfa(unit, EffectEventType.OnSummon, EffectEventSide.Ally, context);
    }

    public applyOnEquipArtifactEffects(unit: CardSprite, artifact: ArtifactCard, context: GongfaRuntimeContext): void {
        const contextWithArtifact: GongfaRuntimeContext = {
            ...context,
            equippedArtifact: artifact
        };
        this.executeUnitGongfa(unit, EffectEventType.OnEquipArtifact, EffectEventSide.Ally, contextWithArtifact);
    }

    private executeUnitGongfa(
        unit: CardSprite,
        eventType: EffectEventType,
        side: EffectEventSide,
        context: GongfaRuntimeContext
    ): void {
        const cardData = unit.getCardData();
        const gongfaIds = cardData.gongfaIds || [];

        // 将触发单位添加到上下文中，用于表达式计算和攻击
        const contextWithUnit: GongfaRuntimeContext = {
            ...context,
            triggerUnit: unit
        };

        gongfaIds.forEach(id => {
            const gongfa = this.gongfaMap.get(id);
            if (!gongfa) {
                return;
            }

            if (!this.isEventMatch(gongfa.schema.event, eventType, side)) {
                return;
            }

            if (!this.areConditionsSatisfied(gongfa.schema.conditions || [], contextWithUnit)) {
                return;
            }

            const executed = this.executeActions(gongfa.schema.actions, contextWithUnit);
            if (executed) {
                const displayName = gongfa.name || id;
                const description = gongfa.description || '无描述';
                this.battleContext.battleLog.addGongfaLog(cardData.name, displayName, description, [unit]);
            }
        });
    }

    private isEventMatch(event: EffectSchema['event'], currentType: EffectEventType, currentSide: EffectEventSide): boolean {
        if (event.type === EffectEventType.Custom) {
            return event.type === currentType && event.side === currentSide;
        }

        if (event.type !== currentType) {
            return false;
        }

        if (!event.side || event.side === EffectEventSide.Any) {
            return true;
        }

        return event.side === currentSide;
    }

    private areConditionsSatisfied(conditions: EffectCondition[], context: GongfaRuntimeContext): boolean {
        return conditions.every(condition => {
            switch (condition.type) {
                case EffectConditionType.ArtifactUsedThisTurn: {
                    const weaponType = condition.weaponType;
                    const minimum = condition.minimum ?? 1;
                    if (weaponType) {
                        const count = context.artifactUsage[weaponType] ?? 0;
                        return count >= minimum;
                    }
                    const total = Object.values(context.artifactUsage).reduce((sum, value) => sum + value, 0);
                    return total >= minimum;
                }
                case EffectConditionType.UnitOnField: {
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
                case EffectConditionType.CardInHand: {
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
                case EffectConditionType.ArtifactEquipped: {
                    const artifactCondition = condition as ArtifactEquippedCondition;
                    if (!context.equippedArtifact) {
                        return false;
                    }
                    
                    // 检查武器类型
                    if (artifactCondition.weaponType) {
                        const weaponType = context.equippedArtifact.weaponType || 
                            extractGongfaWeaponTypeFromLabels(context.equippedArtifact.labels || []);
                        if (weaponType !== artifactCondition.weaponType) {
                            return false;
                        }
                    }
                    
                    // 检查星级限制
                    if (artifactCondition.maxStar !== undefined) {
                        const artifactStar = getStarFromGradeId(context.equippedArtifact.gradeId);
                        let maxStarValue: number;
                        
                        if (typeof artifactCondition.maxStar === 'string') {
                            // 解析表达式，如 "card.star + 1"
                            maxStarValue = this.evaluateExpression(artifactCondition.maxStar, context);
                        } else {
                            maxStarValue = artifactCondition.maxStar;
                        }
                        
                        if (artifactStar > maxStarValue) {
                            return false;
                        }
                    }
                    
                    return true;
                }
                case EffectConditionType.Custom:
                    console.warn(`自定义功法条件暂未实现：${condition.scriptId}`);
                    return false;
                default:
                    return false;
            }
        });
    }

    private executeActions(actions: GongfaAction[], context: GongfaRuntimeContext): boolean {
        return executeGongfaActions(
            actions,
            this.createOperationDispatchContext(context)
        );
    }

    private createOperationDispatchContext(context: GongfaRuntimeContext): GongfaOperationDispatchContext {
        return {
            card: {
                discardPile: context.discardPile,
                deck: context.deck,
                hand: context.hand,
                cardScale: context.cardScale,
                gameActionHandler: context.gameActionHandler,
                battleLog: this.battleContext.battleLog,
                expressionContext: this.buildExpressionContext(context) ?? {}
            },
            immediateAttack: {
                triggerUnit: context.triggerUnit,
                enemyField: context.enemyField,
                equippedArtifact: context.equippedArtifact,
                combatManager: context.combatManager,
                battleLog: this.battleContext.battleLog
            },
            armor: {
                triggerUnit: context.triggerUnit,
                battleStatusController: context.battleStatusController,
                battleLog: this.battleContext.battleLog,
                evaluateExpression: (expression: string) => this.evaluateExpression(expression, context)
            }
        };
    }

    /**
     * 计算表达式的值
     * 支持的表达式：
     * - "card.star + 1" - 单位星级 + 1
     * - "artifact.star * 2" - 法器星级 * 2
     */
    private evaluateExpression(expression: string, context: GongfaRuntimeContext): number {
        const expressionContext = this.buildExpressionContext(context);
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

    private buildExpressionContext(context: GongfaRuntimeContext): GongfaExpressionContext | undefined {
        if (!context.triggerUnit) {
            return undefined;
        }

        const unitData = context.triggerUnit.getCardData() as UnitCard;
        return {
            cardStar: getUnitStar(unitData),
            artifactStar: context.equippedArtifact
                ? getStarFromGradeId(context.equippedArtifact.gradeId)
                : 0
        };
    }
}
