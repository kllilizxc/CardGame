import type { CardSprite } from '../objects/CardSprite';
import type { ArtifactSprite } from '../objects/ArtifactSprite';
import type { BattleContext } from '../context/BattleContext';

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
        const attackers = isPlayerTurn ? playerField : enemyField;
        const defenders = isPlayerTurn ? enemyField : playerField;

        console.log(`${isPlayerTurn ? '玩家' : '敌人'}方进行攻击`);

        // 创建攻击动画序列
        let delay = 0;
        
        // 创建防御者的临时生命值映射，用于预判死亡
        const tempHealth = new Map<CardSprite, number>();
        defenders.forEach(d => tempHealth.set(d, d.getCardData().health));

        attackers.forEach((attacker) => {
            const attackValue = attacker.getCardData().attack;
            
            // 找到第一个还活着的敌方单位（基于临时生命值判断）
            const aliveDefenders = defenders.filter(d => (tempHealth.get(d) || 0) > 0);
            
            if (aliveDefenders.length > 0) {
                // 攻击第一个还活着的敌方单位
                const target = aliveDefenders[0];
                const targetCard = target.getCardData();
                
                // 预先扣除生命值（仅用于判断，实际伤害仍在动画回调中应用）
                const currentTempHealth = tempHealth.get(target) || 0;
                tempHealth.set(target, Math.max(0, currentTempHealth - attackValue));
                
                console.log(`${attacker.getCardData().name} 攻击 ${targetCard.name}，造成 ${attackValue} 点伤害`);
                
                // 记录攻击日志
                this.battleContext.battleLog.addLog(
                    `【${attacker.getCardData().name}】攻击【${targetCard.name}】，造成${attackValue}点伤害`,
                    [attacker, target]
                );
                
                // 复用 performSingleAttack
                this.performSingleAttack(attacker, target, attackValue, delay, false);
                delay += 600; // 每个攻击间隔600ms
            } else {
                // 没有存活的防御单位，直接攻击玩家本体（如果是敌人回合）
                if (!isPlayerTurn) {
                    console.log(`${attacker.getCardData().name} 直接攻击你，造成 ${attackValue} 点伤害`);
                    
                    // 记录直击玩家日志
                    this.battleContext.battleLog.addLog(
                        `【${attacker.getCardData().name}】直接攻击你，造成${attackValue}点伤害！`,
                        [attacker]
                    );
                    
                    // 添加攻击玩家的动画
                    this.battleContext.animationManager.addAttackPlayerAnimation(
                        attacker,
                        attackValue,
                        delay,
                        onPlayerDamaged
                    );
                    delay += 600;
                }
                // 玩家方无目标时不造成伤害（敌人没有本体生命）
            }
        });

        // 在所有攻击完成后调用回调
        if (onComplete) {
            const onCompleteWithTick = () => {
                onComplete!()
                this.battleContext.battleTickManager.tick()
            }
            if (delay > 0) {
                this.battleContext.scene.time.delayedCall(delay + 200, onCompleteWithTick);
            } else {
                // 如果没有任何攻击动画，立即调用回调
                this.battleContext.scene.time.delayedCall(100, onCompleteWithTick);
            }
        }

        return delay; // 返回总动画时长
    }

    // 对单位造成伤害
    public damageUnit(unit: CardSprite, damage: number): void {
        // 检查单位是否还存活（未被销毁）
        if (!unit.active) {
            return;
        }
        
        const cardData = unit.getCardData();
        
        // 通过 StatusManager 处理伤害（会先消耗护甲）
        const finalDamage = this.battleContext.statusManager.processDamage(cardData.id, damage);
        
        cardData.health -= finalDamage;
        
        // 生命值不能低于0
        if (cardData.health < 0) {
            cardData.health = 0;
        }

        console.log("damageUnit", unit.getCardData().name, cardData.health);
        
        // 实时更新卡牌显示（包括护甲状态）
        unit.updateStats();
        const statuses = this.battleContext.statusManager.getUnitStatuses(cardData.id);
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
        isAOE: boolean = false
    ): void {
        if (isAOE && Array.isArray(target)) {
            // AOE攻击：攻击所有目标
            target.forEach((t, index) => {
                const targetData = t.getCardData();
                if (targetData.health > 0) {
                    this.battleContext.animationManager.addAttackAnimation(
                        attacker,
                        t,
                        damage,
                        delay + index * 200, // 每个目标间隔200ms
                        (unit, dmg) => this.damageUnit(unit, dmg)
                    );
                }
            });
        } else if (!Array.isArray(target)) {
            // 单体攻击
            const targetData = target.getCardData();
            if (targetData.health > 0) {
                this.battleContext.animationManager.addAttackAnimation(
                    attacker,
                    target,
                    damage,
                    delay,
                    (unit, dmg) => this.damageUnit(unit, dmg)
                );
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
