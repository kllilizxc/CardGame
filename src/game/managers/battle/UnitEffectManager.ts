import type { BattleContext } from '../../context/BattleContext';
import { getUnitStar } from '../../utils/RealmHelper';
import { getStarFromGradeId } from '../../utils/ArtifactHelper';
import type { CardSprite } from '../../objects/CardSprite';
import type {
    Gongfa,
    EffectAction,
    EffectCondition,
    EffectSchema,
    RecoverCardFromDiscardAction,
    SearchCardFromDeckAction,
    DrawAndFilterAction,
    ImmediateAttackAction,
    GainArmorAction,
    ArtifactEquippedCondition,
    CardFilter
} from '@data/types/gongfa';
import { EffectEventType, EffectEventSide, EffectConditionType, EffectActionType, EffectActionDestination } from '@data/types/gongfa';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import { describeGongfa } from '../../utils/GongfaDescriptionBuilder';
import { evaluateGongfaNumberExpression, type GongfaExpressionContext } from './gongfaExpression';
import {
    extractGongfaWeaponTypeFromLabels,
    isGongfaCardFilterMatch,
    type GongfaFilterCard
} from './gongfaCardFilter';

type AnyHandSprite = CardSprite | import('../../objects/ArtifactSprite').ArtifactSprite | import('../../objects/TalismanSprite').TalismanSprite | import('../../objects/FieldSprite').FieldSprite;

export interface GongfaRuntimeContext {
    playerField: CardSprite[];
    enemyField?: CardSprite[];
    discardPile: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[];
    deck?: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[]; // 卡组，用于抽牌筛选
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

    private executeActions(actions: EffectAction[], context: GongfaRuntimeContext): boolean {
        let executed = false;
        for (const action of actions) {
            switch (action.type) {
                case EffectActionType.RecoverCardFromDiscard: {
                    const recoverAction = action as RecoverCardFromDiscardAction;
                    const amount = recoverAction.amount ?? recoverAction.filter.amount ?? 1;
                    const recovered = this.recoverCardsFromDiscard(recoverAction, amount, context);
                    executed = executed || recovered;
                    break;
                }
                case EffectActionType.SearchCardFromDeck: {
                    const searchAction = action as SearchCardFromDeckAction;
                    const amount = searchAction.amount ?? searchAction.filter.amount ?? 1;
                    const searched = this.searchCardsFromDeck(searchAction, amount, context);
                    executed = executed || searched;
                    break;
                }
                case EffectActionType.DrawAndFilter: {
                    const drawFilterAction = action as DrawAndFilterAction;
                    const filtered = this.drawAndFilterCards(drawFilterAction, context);
                    executed = executed || filtered;
                    break;
                }
                case EffectActionType.ImmediateAttack: {
                    const attackAction = action as ImmediateAttackAction;
                    const attacked = this.executeImmediateAttack(attackAction, context);
                    executed = executed || attacked;
                    break;
                }
                case EffectActionType.GainArmor: {
                    const armorAction = action as GainArmorAction;
                    const gained = this.executeGainArmor(armorAction, context);
                    executed = executed || gained;
                    break;
                }
                case EffectActionType.DrawCards: {
                    console.warn('DrawCards 动作暂未实现');
                    break;
                }
                case EffectActionType.ModifyStats:
                case EffectActionType.DealDamage:
                case EffectActionType.ApplyStatus:
                case EffectActionType.AddLog: {
                    console.warn(`功法动作尚未实现：${action.type}`);
                    break;
                }
                case EffectActionType.Custom: {
                    const customAction = action as Extract<EffectAction, { type: EffectActionType.Custom }>;
                    console.warn(`自定义功法动作暂未实现：${customAction.scriptId}`);
                    break;
                }
                default:
                    break;
            }
        }
        return executed;
    }

    private recoverCardsFromDiscard(
        action: RecoverCardFromDiscardAction,
        amount: number,
        context: GongfaRuntimeContext
    ): boolean {
        if (action.destination !== EffectActionDestination.Hand) {
            console.warn(`暂不支持的功法回收目的地：${action.destination}`);
            return false;
        }

        if (!context.gameActionHandler) {
            console.warn('GameActionHandler 未提供，无法回收卡牌');
            return false;
        }

        const filterFunc = this.createCardFilterPredicate(action.filter, context);

        // 调用 GameActionHandler 的弃牌堆选择方法
        context.gameActionHandler.recoverFromDiscardPile(amount, filterFunc);

        return true; // 返回true表示已触发选择UI
    }

    private searchCardsFromDeck(
        action: SearchCardFromDeckAction,
        amount: number,
        context: GongfaRuntimeContext
    ): boolean {
        if (!context.gameActionHandler) {
            console.warn('GameActionHandler 未提供，无法检索卡牌');
            return false;
        }

        const filterFunc = this.createCardFilterPredicate(action.filter, context);

        // 根据目的地调用不同的方法
        if (action.destination === EffectActionDestination.Hand) {
            // 检索到手牌
            context.gameActionHandler.searchDeck(amount, filterFunc);
        } else if (action.destination === EffectActionDestination.DiscardPile) {
            // 检索到弃牌堆（不需要UI，直接添加）
            context.gameActionHandler.searchDeckToDiscard(amount, filterFunc);
        } else {
            console.warn(`暂不支持的功法检索目的地：${action.destination}`);
            return false;
        }

        return true;
    }

    /**
     * 抽牌并筛选
     */
    private drawAndFilterCards(
        action: DrawAndFilterAction,
        context: GongfaRuntimeContext
    ): boolean {
        if (!context.deck || context.deck.length === 0) {
            console.warn('[DrawAndFilter] 卡组为空或未提供');
            return false;
        }

        if (!context.gameActionHandler) {
            console.warn('[DrawAndFilter] gameActionHandler 未提供');
            return false;
        }

        const { amount, filter, matchDestination, nonMatchDestination } = action;
        const drawnCards: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[] = [];

        // 从卡组顶部抽取指定数量的卡牌
        for (let i = 0; i < amount && context.deck.length > 0; i++) {
            const card = context.deck.shift();
            if (card) {
                drawnCards.push(card);
            }
        }

        if (drawnCards.length === 0) {
            return false;
        }

        // 筛选卡牌
        const matchedCards: typeof drawnCards = [];
        const nonMatchedCards: typeof drawnCards = [];

        const filterFunc = this.createCardFilterPredicate(filter, context);
        for (const card of drawnCards) {
            if (filterFunc(card)) {
                matchedCards.push(card);
            } else {
                nonMatchedCards.push(card);
            }
        }

        // 将匹配的卡牌放到指定位置
        this.moveCardsToDestination(matchedCards, matchDestination, context);
        // 将不匹配的卡牌放到指定位置
        this.moveCardsToDestination(nonMatchedCards, nonMatchDestination, context);

        this.battleContext.battleLog.addLog(
            `抽取${drawnCards.length}张卡牌，其中${matchedCards.length}张符合条件`
        );

        return true;
    }

    /**
     * 将卡牌移动到指定位置
     */
    private moveCardsToDestination(
        cards: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[],
        destination: EffectActionDestination,
        context: GongfaRuntimeContext
    ): void {
        for (const card of cards) {
            switch (destination) {
                case EffectActionDestination.Hand:
                    // 添加到手牌
                    if (context.gameActionHandler) {
                        context.gameActionHandler.addCardToHand(card, context.cardScale);
                    }
                    break;
                case EffectActionDestination.DiscardPile:
                    // 添加到弃牌堆
                    context.discardPile.push(card);
                    break;
                case EffectActionDestination.DeckTop:
                    // 放回卡组顶部
                    if (context.deck) {
                        context.deck.unshift(card);
                    }
                    break;
                default:
                    console.warn(`不支持的目标位置：${destination}`);
                    break;
            }
        }
    }

    private executeImmediateAttack(
        action: ImmediateAttackAction,
        context: GongfaRuntimeContext
    ): boolean {
        if (!context.triggerUnit) {
            console.warn('立即攻击需要触发单位信息');
            return false;
        }

        if (!context.enemyField || context.enemyField.length === 0) {
            console.warn('没有敌方单位可以攻击');
            return false;
        }

        if (!context.combatManager) {
            console.warn('CombatManager 未提供，无法执行立即攻击');
            return false;
        }

        // 获取攻击者的攻击力
        const attackerData = context.triggerUnit.getCardData() as UnitCard;
        let attackPower = attackerData.attack || 0;

        // 如果装备了法器，加上法器的攻击加成
        if (context.equippedArtifact && context.equippedArtifact.attackBonus) {
            attackPower += context.equippedArtifact.attackBonus;
        }

        // 应用伤害倍率
        const damageMultiplier = action.damageMultiplier ?? 1.0;
        const finalDamage = Math.floor(attackPower * damageMultiplier);

        // 记录日志
        this.battleContext.battleLog.addLog(`【${attackerData.name}】触发控剑术，立即发动攻击（${finalDamage}点伤害）`);

        // 根据目标类型执行攻击
        if (action.target === 'singleEnemy') {
            // 单体攻击：攻击第一个存活的敌人
            const target = context.enemyField.find(enemy => {
                const enemyData = enemy.getCardData();
                return enemyData.health > 0;
            });

            if (target) {
                // 使用 CombatManager 的攻击逻辑
                context.combatManager.performSingleAttack(
                    context.triggerUnit,
                    target,
                    finalDamage,
                    0, // 立即执行，无延迟
                    false // 单体攻击
                );
            }
        } else if (action.target === 'allEnemies') {
            // AOE攻击：攻击所有敌人
            const aliveEnemies = context.enemyField.filter(enemy => {
                return enemy.getCardData().health > 0;
            });
            
            if (aliveEnemies.length > 0) {
                context.combatManager.performSingleAttack(
                    context.triggerUnit,
                    aliveEnemies,
                    finalDamage,
                    0, // 立即执行，无延迟
                    true // AOE攻击
                );
                // tick 由 BattleAnimationManager 自动调用
            }
        }

        return true;
    }

    private executeGainArmor(action: GainArmorAction, context: GongfaRuntimeContext): boolean {
        if (!context.triggerUnit) {
            console.warn('获得护甲需要触发单位信息');
            return false;
        }

        // 计算护甲值
        let armorValue = 0;
        if (typeof action.value === 'number') {
            armorValue = action.value;
        } else if (typeof action.value === 'string') {
            armorValue = this.evaluateExpression(action.value, context);
        }

        if (armorValue <= 0) {
            console.warn(`护甲值无效: ${armorValue}`);
            return false;
        }

        // 确定目标
        let target: CardSprite | null = null;
        if (action.target === 'self') {
            target = context.triggerUnit;
        }

        if (!target) {
            console.warn('未找到护甲目标');
            return false;
        }

        const targetData = target.getCardData();
        this.battleContext.battleLog.addLog(`【${targetData.name}】获得 ${armorValue} 点护甲`);

        // 应用护甲状态
        if (context.battleStatusController) {
            context.battleStatusController.applyStatusToUnit(
                targetData.id,
                'armor',
                armorValue,
                target // 传递单位精灵以更新显示
            );
        } else {
            console.warn('battleStatusController 未提供，无法应用护甲状态');
        }

        return true;
    }

    private createCardFilterPredicate(
        filter: CardFilter,
        context: GongfaRuntimeContext
    ): (card: GongfaFilterCard) => boolean {
        const expressionContext = this.buildExpressionContext(context) ?? {};
        return (card: GongfaFilterCard) => {
            try {
                return isGongfaCardFilterMatch(card, filter, expressionContext);
            } catch (error) {
                console.error(`卡牌筛选表达式计算失败: ${filter.maxStar}`, error);
                return false;
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
