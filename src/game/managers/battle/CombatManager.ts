import { getWenxinBattleStage } from '../../art/wenxin/battleStageRegistry';
import type { CardSprite } from '../../objects/CardSprite';
import type { ArtifactSprite } from '../../objects/ArtifactSprite';
import type { BattleContext } from '../../context/BattleContext';
import { getUnitStateId } from './unitIdentity';
import { isLegacyCardEffect, type LegacyEffectTiming } from '@data/types/cards/effects';

export class CombatManager {
    private battleContext: BattleContext;

    constructor(battleContext: BattleContext) {
        this.battleContext = battleContext;
    }

    // 战斗结算（带动画）
    public resolveCombat(
        isPlayerTurn: boolean,
        playerField: CardSprite[],
        enemyField: CardSprite[],
        onPlayerDamaged: (damage: number) => void,
        onComplete?: () => void
    ): number {
        const attackers = [...(isPlayerTurn ? playerField : enemyField)];
        const estimate = attackers.length * (getWenxinBattleStage(this.battleContext.scene) ? 1000 : 600);
        let index = 0;
        const next = () => {
            this.battleContext.battleTickManager.tick();
            const state = this.battleContext.battleState;
            const allies = state?.playerField ?? playerField;
            const enemies = state?.enemyField ?? enemyField;
            if (index >= attackers.length || (state && (state.playerHealth <= 0 || enemies.length === 0))) {
                onComplete?.();
                return;
            }
            const attacker = attackers[index++];
            if (!attacker.active || attacker.getCardData().health <= 0 || !(isPlayerTurn ? allies : enemies).includes(attacker)) {
                next();
                return;
            }
            const target = (isPlayerTurn ? enemies : allies).find(unit => unit.active && unit.getCardData().health > 0);
            const damage = attacker.getCardData().attack;
            if (target) {
                this.battleContext.battleLog.addLog(`【${attacker.getCardData().name}】攻击【${target.getCardData().name}】`, [attacker, target]);
                this.performSingleAttack(attacker, target, damage, 0, false, next);
            } else if (!isPlayerTurn) {
                this.battleContext.battleLog.addLog(`【${attacker.getCardData().name}】直接攻击你，造成${damage}点伤害！`, [attacker]);
                this.battleContext.animationManager.addAttackPlayerAnimation(attacker, damage, 0, onPlayerDamaged, next);
            } else {
                next();
            }
        };
        next();
        return estimate;
    }

    // 对单位造成伤害
    public damageUnit(unit: CardSprite, damage: number): void {
        // 检查单位是否还存活（未被销毁）
        if (!unit.active) {
            return;
        }
        
        const cardData = unit.getCardData();
        
        // 通过 StatusManager 处理伤害（会先消耗护甲）
        const finalDamage = this.battleContext.statusManager.processDamage(getUnitStateId(unit), damage);
        
        cardData.health -= finalDamage;
        
        // 生命值不能低于0
        if (cardData.health < 0) {
            cardData.health = 0;
        }

        console.log("damageUnit", unit.getCardData().name, cardData.health);
        
        // 实时更新卡牌显示（包括护甲状态）
        unit.updateStats();
        const statuses = this.battleContext.statusManager.getUnitStatuses(getUnitStateId(unit));
        unit.updateStatusDisplay(statuses);
    }

    /**
     * 执行单次攻击（用于技能、功法等触发的即时攻击）
     * @param attacker 攻击者
     * @param target 目标（单体攻击）或目标数组（AOE攻击）
     * @param damage 伤害值
     * @param delay 延迟时间（ms）
     * @param isAOE 是否为AOE攻击
     */
    public performSingleAttack(
        attacker: CardSprite,
        target: CardSprite | CardSprite[],
        damage: number,
        delay: number = 0,
        isAOE: boolean = false,
        onComplete?: () => void
    ): void {
        const targets = (Array.isArray(target) ? (isAOE ? target : []) : [target])
            .filter(unit => unit.active && unit.getCardData().health > 0);
        if (!targets.length) { onComplete?.(); return; }
        let remaining = targets.length;
        targets.forEach((unit, index) => {
            let applied = false;
            this.battleContext.animationManager.addAttackAnimation(attacker, unit, damage, delay + index * 200,
                (victim, amount) => {
                    if (applied || !attacker.active || !victim.active || victim.getCardData().health <= 0) return;
                    applied = true;
                    const before = victim.getCardData().health;
                    const battleScene = this.battleContext.scene as typeof this.battleContext.scene & {
                        artifactManager?: { onUnitAttack: (unit: CardSprite, target: CardSprite) => void; onUnitDamaged: (unit: CardSprite, source: CardSprite) => void };
                    };
                    this.applyUnitTimingEffects(attacker, 'onAttack', victim);
                    battleScene.artifactManager?.onUnitAttack(attacker, victim);
                    if (victim.getCardData().health > 0) this.damageUnit(victim, amount);
                    if (victim.getCardData().health < before) {
                        this.applyUnitTimingEffects(victim, 'onDamaged', undefined, attacker);
                        battleScene.artifactManager?.onUnitDamaged(victim, attacker);
                    }
                    if (before > 0 && victim.getCardData().health <= 0) {
                        this.applyUnitTimingEffects(attacker, 'onKill', victim);
                        const state = this.battleContext.battleState;
                        const scene = this.battleContext.scene as typeof this.battleContext.scene & { playerField?: CardSprite[]; enemyField?: CardSprite[] };
                        const allies = state?.playerField ?? scene.playerField ?? [];
                        if (allies.includes(attacker)) this.battleContext.fieldManager?.onPlayerUnitKill(attacker, allies, state?.enemyField ?? scene.enemyField ?? []);
                    }
                },
                () => { if (--remaining === 0) onComplete?.(); });
        });
    }

    public applyUnitTimingEffects(unit: CardSprite, timing: LegacyEffectTiming, attackTarget?: CardSprite, damageSource?: CardSprite): void {
        const state = this.battleContext.battleState;
        const scene = this.battleContext.scene as typeof this.battleContext.scene & { playerField?: CardSprite[]; enemyField?: CardSprite[] };
        const playerField = state?.playerField ?? scene.playerField ?? [];
        const enemyField = state?.enemyField ?? scene.enemyField ?? [];
        const ownSide = playerField.includes(unit);
        for (const effect of unit.getCardData().effects ?? []) {
            if (isLegacyCardEffect(effect) && effect.timing === timing) {
                this.battleContext.effectResolver.executeEffect(effect, {
                    playerField: ownSide ? playerField : enemyField,
                    enemyField: ownSide ? enemyField : playerField,
                    triggerUnit: unit, sourceCard: unit, sourceName: unit.getCardData().name,
                    attackTarget, damageSource,
                });
            }
        }
    }

    /**
     * 统一的死亡判断方法
     */
    public isDead(unit: CardSprite): boolean {
        return unit.getCardData().health <= 0;
    }

    /**
     * 检查是否有单位需要死亡处理
     */
    public hasDeadUnits(playerField: CardSprite[], enemyField: CardSprite[]): boolean {
        return playerField.some(unit => this.isDead(unit)) || 
               enemyField.some(unit => this.isDead(unit));
    }

    // 移除死亡单位
    public removeDeadUnits(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        onArrange: (newPlayerField: CardSprite[], newEnemyField: CardSprite[]) => void
    ): { playerField: CardSprite[]; enemyField: CardSprite[] } {
        const battleScene = this.battleContext.scene as any;
        
        // 检查玩家场地
        const newPlayerField = playerField.filter(unit => {
            if (this.isDead(unit)) {
                this.battleContext.battleStatusController?.cleanupUnitStatuses(getUnitStateId(unit));
                console.log(`${unit.getCardData().name} 被击败！`);
                this.battleContext.battleLog.addLog(`【${unit.getCardData().name}】被击败！`);
                
                // 获取装备的法器（在清理前）
                const equippedArtifacts = battleScene.artifactManager 
                    ? battleScene.artifactManager.getEquippedArtifacts(unit)
                    : [];
                
                // 将单位卡数据添加到弃牌堆
                if (battleScene.addToDiscardPile) {
                    battleScene.addToDiscardPile(unit.getCardData());
                }
                
                // 将装备的法器数据添加到弃牌堆
                equippedArtifacts.forEach((artifact: ArtifactSprite) => {
                    if (battleScene.addToDiscardPile) {
                        battleScene.addToDiscardPile(artifact.getCardData());
                    }
                });
                
                // 播放死亡动画
                this.battleContext.animationManager.playDeathAnimation(unit);
                
                // 延迟后播放飞向弃牌堆的动画
                this.battleContext.scene.time.delayedCall(300, () => {
                    // 计算需要等待的动画数量
                    let animationCount = 1 + equippedArtifacts.length;
                    const onAnimationComplete = () => {
                        animationCount--;
                        if (animationCount === 0) {
                            // 所有动画完成后清理装备记录
                            if (battleScene.artifactManager) {
                                battleScene.artifactManager.cleanupUnitArtifacts(unit);
                            }
                        }
                    };
                    
                    // 单位卡飞向弃牌堆
                    if (battleScene.playCardToDiscardPileAnimation) {
                        battleScene.playCardToDiscardPileAnimation(unit, onAnimationComplete);
                    } else {
                        unit.destroy();
                        onAnimationComplete();
                    }
                    
                    // 法器卡飞向弃牌堆
                    equippedArtifacts.forEach((artifact: ArtifactSprite) => {
                        if (battleScene.playCardToDiscardPileAnimation) {
                            battleScene.playCardToDiscardPileAnimation(artifact, onAnimationComplete);
                        } else {
                            artifact.destroy();
                            onAnimationComplete();
                        }
                    });
                });
                
                return false;
            }
            return true;
        });

        // 检查敌人场地（敌人的卡不进入弃牌堆）
        const newEnemyField = enemyField.filter(unit => {
            if (this.isDead(unit)) {
                this.battleContext.battleStatusController?.cleanupUnitStatuses(getUnitStateId(unit));
                console.log(`${unit.getCardData().name} 被击败！`);
                this.battleContext.battleLog.addLog(`【${unit.getCardData().name}】被击败！`);
                
                // 获取装备的法器并销毁（敌人不进入弃牌堆）
                const equippedArtifacts = battleScene.artifactManager 
                    ? battleScene.artifactManager.getEquippedArtifacts(unit)
                    : [];
                
                this.battleContext.animationManager.playDeathAnimation(unit);
                this.battleContext.scene.time.delayedCall(300, () => {
                    // 销毁装备的法器
                    equippedArtifacts.forEach((artifact: ArtifactSprite) => {
                        artifact.destroy();
                    });
                    
                    // 销毁单位
                    unit.destroy();
                    
                    // 清理装备记录
                    if (battleScene.artifactManager) {
                        battleScene.artifactManager.cleanupUnitArtifacts(unit);
                    }
                });
                return false;
            }
            return true;
        });

        // 重新排列（传入过滤后的新数组）
        onArrange(newPlayerField, newEnemyField);

        return { playerField: newPlayerField, enemyField: newEnemyField };
    }

    // 检查战斗是否结束
    public checkBattleEnd(
        playerHealth: number,
        enemyFieldCount: number,
        onVictory: () => void,
        onDefeat: () => void
    ): boolean {
        // 胜利条件：敌方场上所有单位被击败
        if (enemyFieldCount === 0) {
            console.log('胜利！所有敌人已被击败！');
            onVictory();
            return true;
        }

        // 失败条件：玩家生命值归零
        if (playerHealth <= 0) {
            console.log('失败！你的生命值已归零！');
            onDefeat();
            return true;
        }

        return false;
    }
}
