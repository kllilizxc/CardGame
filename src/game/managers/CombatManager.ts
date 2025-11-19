import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { BattleLog } from '../ui/BattleLog';
import { BattleAnimationManager } from './BattleAnimationManager';

export class CombatManager {
    private scene: Scene;
    private animationManager: BattleAnimationManager;
    private battleLog: BattleLog;

    constructor(scene: Scene, animationManager: BattleAnimationManager, battleLog: BattleLog) {
        this.scene = scene;
        this.animationManager = animationManager;
        this.battleLog = battleLog;
    }

    // 战斗结算（带动画）
    public resolveCombat(
        isPlayerTurn: boolean,
        playerField: CardSprite[],
        enemyField: CardSprite[],
        onPlayerDamaged: (damage: number) => void
    ): void {
        const attackers = isPlayerTurn ? playerField : enemyField;
        const defenders = isPlayerTurn ? enemyField : playerField;

        console.log(`${isPlayerTurn ? '玩家' : '敌人'}方进行攻击`);

        // 创建攻击动画序列
        let delay = 0;

        attackers.forEach((attacker) => {
            const attackValue = attacker.getCardData().attack;
            
            if (defenders.length > 0) {
                // 攻击第一个敌方单位
                const target = defenders[0];
                const targetCard = target.getCardData();
                console.log(`${attacker.getCardData().name} 攻击 ${targetCard.name}，造成 ${attackValue} 点伤害`);
                
                // 记录攻击日志
                this.battleLog.addLog(
                    `【${attacker.getCardData().name}】攻击【${targetCard.name}】，造成${attackValue}点伤害`,
                    [attacker, target]
                );
                
                // 添加攻击动画到时间轴
                this.animationManager.addAttackAnimation(
                    attacker,
                    target,
                    attackValue,
                    delay,
                    (t, d) => this.damageUnit(t, d)
                );
                delay += 600; // 每个攻击间隔600ms
            } else {
                // 敌方无单位时，直接攻击玩家本体
                if (!isPlayerTurn) {
                    console.log(`${attacker.getCardData().name} 直接攻击你，造成 ${attackValue} 点伤害`);
                    
                    // 记录直击玩家日志
                    this.battleLog.addLog(
                        `【${attacker.getCardData().name}】直接攻击你，造成${attackValue}点伤害！`,
                        [attacker]
                    );
                    
                    // 添加攻击玩家的动画
                    this.animationManager.addAttackPlayerAnimation(
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
    }

    // 对单位造成伤害
    public damageUnit(unit: CardSprite, damage: number): void {
        const cardData = unit.getCardData();
        cardData.health -= damage;
        
        // 实时更新卡牌显示
        unit.updateStats();
    }

    // 移除死亡单位
    public removeDeadUnits(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        onArrange: () => void
    ): { playerField: CardSprite[]; enemyField: CardSprite[] } {
        // 检查玩家场地
        const newPlayerField = playerField.filter(unit => {
            if (unit.getCardData().health <= 0) {
                console.log(`${unit.getCardData().name} 被击败！`);
                this.battleLog.addLog(`【${unit.getCardData().name}】被击败！`);
                this.animationManager.playDeathAnimation(unit);
                this.scene.time.delayedCall(300, () => unit.destroy());
                return false;
            }
            return true;
        });

        // 检查敌人场地
        const newEnemyField = enemyField.filter(unit => {
            if (unit.getCardData().health <= 0) {
                console.log(`${unit.getCardData().name} 被击败！`);
                this.battleLog.addLog(`【${unit.getCardData().name}】被击败！`);
                this.animationManager.playDeathAnimation(unit);
                this.scene.time.delayedCall(300, () => unit.destroy());
                return false;
            }
            return true;
        });

        // 重新排列
        onArrange();

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
