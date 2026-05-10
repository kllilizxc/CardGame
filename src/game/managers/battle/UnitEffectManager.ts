import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';
import type {
    Gongfa,
    GongfaAction,
} from '@data/types/gongfa';
import { EffectEventType, EffectEventSide } from '@data/types/gongfa';
import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import { evaluateGongfaNumberExpression } from './gongfaExpression';
import { buildGongfaExpressionContext } from './gongfaExpressionContext';
import type { GongfaCardOperationCard } from './gongfaCardOperations';
import { areGongfaConditionsSatisfied } from './gongfaConditionEvaluation';
import {
    executeGongfaActions,
    type GongfaOperationDispatchContext
} from './gongfaOperationDispatch';
import { isGongfaEventMatch } from './gongfaEventMatching';

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
        gongfaList: readonly Gongfa[]
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

            if (!isGongfaEventMatch(gongfa.schema.event, { type: eventType, side })) {
                return;
            }

            if (!areGongfaConditionsSatisfied(gongfa.schema.conditions || [], contextWithUnit)) {
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
                expressionContext: this.createExpressionContext(context) ?? {}
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
        const expressionContext = this.createExpressionContext(context);
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

    private createExpressionContext(context: GongfaRuntimeContext) {
        return buildGongfaExpressionContext({
            triggerUnit: context.triggerUnit?.getCardData(),
            equippedArtifact: context.equippedArtifact
        });
    }
}
