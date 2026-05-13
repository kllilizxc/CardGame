import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';
import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import type {
    LegacyCardEffect,
    LegacyEffectAction,
    LegacyEffectTargetScope,
} from '@data/types/cards/effects';

/**
 * 效果执行上下文 — 调用方提供场上状态与触发来源
 */
export interface EffectExecutionContext {
    playerField: CardSprite[];
    enemyField: CardSprite[];
    triggerUnit?: CardSprite;
    sourceCard?: BaseCardSprite;
    sourceName: string;
    attackTarget?: CardSprite;
    damageSource?: CardSprite;
}

/**
 * 追踪的场地永久效果修改，用于移除场地时回退
 */
interface TrackedFieldMod {
    unitId: string;
    attackDelta: number;
    healthDelta: number;
    statusIds: string[];
}

/**
 * EffectResolver — 统一的卡牌效果执行引擎
 *
 * 负责：
 * 1. 解析 LegacyCardEffect.target.scope → 目标单位集合
 * 2. 执行 LegacyEffectAction 动作（modifyAttack / dealDamage / applyStatus 等）
 * 3. applyStatus 委托 StatusManager / BattleStatusController
 * 4. 场地永续效果的施加与回退追踪
 */
export class EffectResolver {
    private battleContext: BattleContext;
    private activeFieldMods: Map<string, TrackedFieldMod> = new Map();

    constructor(battleContext: BattleContext) {
        this.battleContext = battleContext;
    }

    // ==================== 目标解析 ====================

    resolveTargets(scope: LegacyEffectTargetScope, context: EffectExecutionContext): CardSprite[] {
        const { playerField, enemyField, triggerUnit, attackTarget, damageSource } = context;

        switch (scope) {
            case 'self':
                return triggerUnit ? [triggerUnit] : [];

            case 'ownerPlayer':
                return [];

            case 'allyUnits':
            case 'allAllies':
                return [...playerField];

            case 'enemyUnits':
            case 'allEnemies':
                return [...enemyField];

            case 'singleAlly':
                if (triggerUnit && playerField.includes(triggerUnit)) return [triggerUnit];
                return playerField.length > 0 ? [playerField[0]] : [];

            case 'singleEnemy':
                return enemyField.length > 0 ? [enemyField[0]] : [];

            case 'attackTarget':
                return attackTarget ? [attackTarget] : [];

            case 'damageSource':
                return damageSource ? [damageSource] : [];

            case 'allUnits':
                return [...playerField, ...enemyField];

            case 'none':
                return [];

            default:
                return [];
        }
    }

    // ==================== 动作执行 ====================

    executeAction(
        action: LegacyEffectAction,
        targets: CardSprite[],
        context: EffectExecutionContext,
    ): void {
        const { battleLog, animationManager, effectManager, statusManager, battleStatusController } =
            this.battleContext;
        const sourceName = context.sourceName;
        const sourceCard = context.sourceCard;

        switch (action.type) {
            case 'modifyAttack': {
                const value = action.value ?? 0;
                for (const unit of targets) {
                    const data = unit.getCardData();
                    data.attack += value;
                    unit.updateStats();
                    const sign = value >= 0 ? '+' : '';
                    battleLog.addLog(
                        `【${sourceName}】使【${data.name}】攻击力${sign}${value}`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                    if (value > 0) {
                        effectManager.showBuffEffect(unit);
                    } else {
                        effectManager.showDebuffEffect(unit);
                    }
                }
                break;
            }

            case 'modifyHealth':
            case 'heal': {
                const value = Math.abs(action.value ?? 0);
                for (const unit of targets) {
                    const data = unit.getCardData();
                    data.health += value;
                    unit.updateStats();
                    battleLog.addLog(
                        `【${sourceName}】为【${data.name}】恢复${value}点生命值`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                    animationManager.playHealAnimation(unit);
                }
                break;
            }

            case 'dealDamage': {
                const rawDamage = Math.abs(action.value ?? 0);
                for (const unit of targets) {
                    const data = unit.getCardData();
                    const finalDamage = statusManager.processDamage(data.id, rawDamage);
                    data.health -= finalDamage;
                    if (data.health < 0) data.health = 0;
                    unit.updateStats();
                    const statuses = statusManager.getUnitStatuses(data.id);
                    unit.updateStatusDisplay(statuses);
                    battleLog.addLog(
                        `【${sourceName}】对【${data.name}】造成${finalDamage}点伤害`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                    animationManager.playHitAnimation(unit);
                }
                break;
            }

            case 'loseHealth': {
                const value = Math.abs(action.value ?? 0);
                for (const unit of targets) {
                    const data = unit.getCardData();
                    data.health -= value;
                    if (data.health < 0) data.health = 0;
                    unit.updateStats();
                    battleLog.addLog(
                        `【${data.name}】失去${value}点生命值`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                    animationManager.playHitAnimation(unit);
                }
                break;
            }

            case 'applyStatus': {
                if (!action.statusId) {
                    console.warn('EffectResolver: applyStatus missing statusId');
                    break;
                }
                const stacks = (action.stacks && action.stacks > 0) ? action.stacks : (action.value ?? 1);
                for (const unit of targets) {
                    const data = unit.getCardData();
                    battleStatusController.applyStatusToUnit(
                        data.id,
                        action.statusId,
                        stacks,
                        unit,
                        sourceName,
                    );
                    battleLog.addLog(
                        `【${sourceName}】对【${data.name}】施加了状态`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                }
                break;
            }

            case 'removeDebuffs': {
                for (const unit of targets) {
                    const data = unit.getCardData();
                    statusManager.clearDebuffs(data.id);
                    battleLog.addLog(
                        `【${sourceName}】移除了【${data.name}】的减益状态`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                }
                break;
            }

            case 'destroyUnit': {
                for (const unit of targets) {
                    const data = unit.getCardData();
                    data.health = 0;
                    unit.updateStats();
                    battleLog.addLog(
                        `【${sourceName}】摧毁了【${data.name}】`,
                        sourceCard ? [sourceCard, unit] : [unit],
                    );
                }
                break;
            }

            case 'healPlayer': {
                const amount = action.value ?? 0;
                if (amount > 0) {
                    this.battleContext.scene.events.emit('healPlayer', amount);
                    battleLog.addLog(`【${sourceName}】为玩家回复${amount}点生命值`);
                    effectManager.showHealEffect();
                }
                break;
            }

            case 'damagePlayer': {
                const amount = action.value ?? 0;
                if (amount > 0) {
                    this.battleContext.scene.events.emit('damagePlayer', amount);
                    battleLog.addLog(`【${sourceName}】对玩家造成${amount}点伤害`);
                }
                break;
            }

            case 'drawCards': {
                const count = Math.max(1, action.value ?? 1);
                this.battleContext.scene.events.emit('drawCards', count);
                battleLog.addLog(`【${sourceName}】使玩家抽取${count}张卡牌`);
                break;
            }

            case 'searchDeck': {
                battleLog.addLog(`【${sourceName}】触发了搜索牌库效果（暂未实现）`);
                break;
            }

            case 'custom': {
                console.log(
                    `EffectResolver: custom action (scriptId: ${action.scriptId}) from ${sourceName}`,
                );
                battleLog.addLog(`【${sourceName}】触发了自定义效果`);
                break;
            }

            default:
                console.log(`EffectResolver: unhandled action type: ${(action as any).type}`);
        }
    }

    // ==================== 完整效果执行 ====================

    executeEffect(effect: LegacyCardEffect, context: EffectExecutionContext): void {
        if (!effect.actions || effect.actions.length === 0) return;

        const scope = effect.target?.scope;
        if (!scope) return;

        // none / ownerPlayer 作用域不产生单位目标
        if (scope === 'none' || scope === 'ownerPlayer') {
            for (const action of effect.actions) {
                this.executeAction(action, [], context);
            }
            return;
        }

        const targets = this.resolveTargets(scope, context);
        if (targets.length === 0) return;

        for (const action of effect.actions) {
            this.executeAction(action, targets, context);
        }

        if (effect.text) {
            this.battleContext.battleLog.addLog(`【${context.sourceName}】：${effect.text}`);
        }

        this.battleContext.battleTickManager.tick();
    }

    // ==================== 场地永续效果 ====================

    /**
     * 应用场地永续效果并记录修改以便回退
     */
    applyFieldPermanentEffects(effects: LegacyCardEffect[], context: EffectExecutionContext): void {
        this.activeFieldMods.clear();

        for (const effect of effects) {
            if (effect.timing !== 'permanent') continue;
            if (!effect.actions || effect.actions.length === 0) continue;

            const scope = effect.target?.scope;
            if (!scope || scope === 'none' || scope === 'ownerPlayer') continue;

            const targets = this.resolveTargets(scope, context);
            if (targets.length === 0) continue;

            for (const action of effect.actions) {
                this.executeAction(action, targets, context);

                // 记录数值修改，用于移除场地时回退
                for (const unit of targets) {
                    const unitId = unit.getCardData().id;
                    let mod = this.activeFieldMods.get(unitId);
                    if (!mod) {
                        mod = { unitId, attackDelta: 0, healthDelta: 0, statusIds: [] };
                        this.activeFieldMods.set(unitId, mod);
                    }

                    if (action.type === 'modifyAttack') {
                        mod.attackDelta += action.value ?? 0;
                    } else if (action.type === 'modifyHealth' || action.type === 'heal' || action.type === 'dealDamage' || action.type === 'loseHealth') {
                        const val = action.value ?? 0;
                        if (action.type === 'dealDamage' || action.type === 'loseHealth') {
                            mod.healthDelta -= Math.abs(val);
                        } else {
                            mod.healthDelta += Math.abs(val);
                        }
                    } else if (action.type === 'applyStatus' && action.statusId) {
                        mod.statusIds.push(action.statusId);
                    }
                }
            }

            if (effect.text) {
                this.battleContext.battleLog.addLog(`【${context.sourceName}】：${effect.text}`);
            }
        }
    }

    /**
     * 移除场地永续效果（回退所有已记录的修改）
     */
    removeFieldPermanentEffects(context: EffectExecutionContext): void {
        const { battleLog, statusManager } = this.battleContext;

        for (const [unitId, mod] of this.activeFieldMods) {
            const unit = [...context.playerField, ...context.enemyField].find(
                (u) => u.getCardData().id === unitId,
            );
            if (!unit) continue;

            const data = unit.getCardData();

            if (mod.attackDelta !== 0) {
                data.attack -= mod.attackDelta;
            }
            if (mod.healthDelta !== 0) {
                data.health -= mod.healthDelta;
                if (data.health < 0) data.health = 0;
            }
            unit.updateStats();

            for (const statusId of mod.statusIds) {
                statusManager.removeStatus(unitId, statusId);
            }

            battleLog.addLog(`移除场地效果：【${data.name}】恢复原始数值`);
        }

        this.activeFieldMods.clear();
    }
}
