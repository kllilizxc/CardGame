import type { Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';

/**
 * 战场状态检查器
 * 统一检查和处理战场上所有单位的状态变化
 * 保留 scene 用于 UI 动画，使用 battleContext 访问战斗逻辑
 */
export class BattleStateChecker {
    private scene: Scene;
    private battleContext: BattleContext;
    private battleEnded = false;

    constructor(scene: Scene, battleContext: BattleContext) {
        this.scene = scene;
        this.battleContext = battleContext;
    }

    /**
     * 检查战场状态
     * 在任何可能改变单位状态的操作后调用
     */
    public checkBattleState(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        playerHealth: number,
        onUnitRemoved: (unit: CardSprite, isPlayer: boolean) => void,
        onBattleEnd?: (victory: boolean) => void
    ): void {
        // 1. 检查所有单位的生命值
        this.checkUnitHealth(playerField, enemyField, onUnitRemoved);

        // 2. 检查胜负条件
        if (onBattleEnd) {
            this.checkVictoryCondition(playerField, enemyField, playerHealth, onBattleEnd);
        }

        // 3. 可以添加其他检查...
        // - 检查场地效果
        // - 检查特殊状态
        // - 检查触发条件等
    }

    /**
     * 检查所有单位的生命值
     */
    private checkUnitHealth(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        onUnitRemoved: (unit: CardSprite, isPlayer: boolean) => void
    ): void {
        // 检查玩家单位
        const deadPlayerUnits = playerField.filter(unit => {
            const unitData = unit.getCardData();
            return unitData.health <= 0;
        });

        // 检查敌方单位
        const deadEnemyUnits = enemyField.filter(unit => {
            const unitData = unit.getCardData();
            return unitData.health <= 0;
        });

        // 处理死亡单位
        deadPlayerUnits.forEach(unit => {
            this.handleUnitDeath(unit, true, onUnitRemoved);
        });

        deadEnemyUnits.forEach(unit => {
            this.handleUnitDeath(unit, false, onUnitRemoved);
        });
    }

    /**
     * 处理单位死亡
     */
    private handleUnitDeath(
        unit: CardSprite,
        isPlayer: boolean,
        onUnitRemoved: (unit: CardSprite, isPlayer: boolean) => void
    ): void {
        const unitData = unit.getCardData();
        this.battleContext.battleLog.addLog(`【${unitData.name}】被击败了！`);

        // 播放死亡动画
        this.battleContext.animationManager.playDeathAnimation(unit);

        // 通知外部移除单位（包括清理状态等）
        onUnitRemoved(unit, isPlayer);

        // 延迟销毁
        this.scene.time.delayedCall(500, () => {
            if (unit.active) {
                unit.destroy();
            }
        });
    }

    /**
     * 检查胜负条件
     */
    private checkVictoryCondition(
        _playerField: CardSprite[],
        enemyField: CardSprite[],
        playerHealth: number,
        onBattleEnd: (victory: boolean) => void
    ): void {
        if (this.battleEnded) {
            return;
        }

        // 检查玩家是否失败（生命值归零）
        if (playerHealth <= 0) {
            this.battleEnded = true;
            this.scene.time.delayedCall(600, () => {
                this.battleContext.turnManager.showDefeat(() => {
                    onBattleEnd(false);
                });
            });
            return;
        }

        // 检查是否所有敌人都被击败
        if (enemyField.length === 0) {
            this.battleEnded = true;
            this.scene.time.delayedCall(600, () => {
                this.battleContext.turnManager.showVictory(() => {
                    onBattleEnd(true);
                });
            });
            return;
        }
    }

    /**
     * 快速检查（不触发动画，用于预判）
     */
    public quickCheck(
        playerField: CardSprite[],
        enemyField: CardSprite[]
    ): {
        hasDeadUnits: boolean;
        deadPlayerUnits: CardSprite[];
        deadEnemyUnits: CardSprite[];
        battleEnded: boolean;
        victory?: boolean;
    } {
        const deadPlayerUnits = playerField.filter(unit => unit.getCardData().health <= 0);
        const deadEnemyUnits = enemyField.filter(unit => unit.getCardData().health <= 0);

        const hasDeadUnits = deadPlayerUnits.length > 0 || deadEnemyUnits.length > 0;
        
        let battleEnded = false;
        let victory: boolean | undefined = undefined;

        if (enemyField.length === 0 || enemyField.every(u => u.getCardData().health <= 0)) {
            battleEnded = true;
            victory = true;
        } else if (playerField.length === 0 || playerField.every(u => u.getCardData().health <= 0)) {
            battleEnded = true;
            victory = false;
        }

        return {
            hasDeadUnits,
            deadPlayerUnits,
            deadEnemyUnits,
            battleEnded,
            victory
        };
    }
}
