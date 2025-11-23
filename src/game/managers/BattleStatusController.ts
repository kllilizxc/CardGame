import type { CardSprite } from '../objects/CardSprite';
import type { StatusManager } from './StatusManager';
import type { BattleLog } from '../ui/BattleLog';
import type { BattleAnimationManager } from './BattleAnimationManager';

/**
 * 战斗状态控制器
 * 负责在战斗中触发和处理状态效果
 */
export class BattleStatusController {
    private statusManager: StatusManager;
    private battleLog: BattleLog;
    private animationManager: BattleAnimationManager;

    constructor(
        statusManager: StatusManager,
        battleLog: BattleLog,
        animationManager: BattleAnimationManager
    ) {
        this.statusManager = statusManager;
        this.battleLog = battleLog;
        this.animationManager = animationManager;
    }

    /**
     * 触发回合开始时的状态效果
     * 注意：不再手动处理死亡，由外部统一检查
     */
    public triggerTurnStartStatuses(
        playerField: CardSprite[],
        enemyField: CardSprite[]
    ): void {
        const allUnits = [...playerField, ...enemyField];
        
        for (const unit of allUnits) {
            const unitData = unit.getCardData();
            const unitId = unitData.id;
            
            // 触发回合开始状态
            const damage = this.statusManager.triggerStatuses(unitId, 'turnStart', {
                onHeal: (amount: number) => {
                    // 处理再生效果
                    unitData.health += amount;
                    unit.updateStats();
                    this.battleLog.addLog(`【${unitData.name}】恢复了 ${amount} 点生命值`);
                    this.animationManager.playHealAnimation(unit);
                }
            });
            
            if (damage > 0) {
                // 中毒伤害不受护甲影响，直接扣血
                unitData.health -= damage;
                unit.updateStats();
                this.battleLog.addLog(`【${unitData.name}】受到 ${damage} 点中毒伤害`);
                this.animationManager.playHitAnimation(unit);
            }
            
            // 更新状态显示
            const statuses = this.statusManager.getUnitStatuses(unitId);
            unit.updateStatusDisplay(statuses);
        }
    }

    /**
     * 触发回合结束时的状态效果
     * 注意：不再手动处理死亡，由外部统一检查
     */
    public triggerTurnEndStatuses(
        playerField: CardSprite[],
        enemyField: CardSprite[]
    ): void {
        const allUnits = [...playerField, ...enemyField];
        
        for (const unit of allUnits) {
            const unitData = unit.getCardData();
            const unitId = unitData.id;
            
            // 触发回合结束状态
            const damage = this.statusManager.triggerStatuses(unitId, 'turnEnd');
            
            if (damage > 0) {
                // 燃烧伤害会被护甲抵消
                const finalDamage = this.statusManager.processDamage(unitId, damage);
                unitData.health -= finalDamage;
                unit.updateStats();
                this.battleLog.addLog(`【${unitData.name}】受到 ${finalDamage} 点燃烧伤害`);
                this.animationManager.playHitAnimation(unit);
            }
            
            // 更新状态显示
            const statuses = this.statusManager.getUnitStatuses(unitId);
            unit.updateStatusDisplay(statuses);
        }
        
        // 更新持续时间类状态
        this.statusManager.updateTurnEndStatuses();
    }

    /**
     * 应用状态到单位
     * @param unitId 单位ID
     * @param statusId 状态ID
     * @param stacks 层数
     * @param unit 单位精灵（可选，用于更新显示）
     * @param sourceId 来源ID（可选）
     * @param duration 持续时间（可选）
     */
    public applyStatusToUnit(
        unitId: string, 
        statusId: string, 
        stacks: number, 
        unit?: CardSprite,
        sourceId?: string, 
        duration?: number
    ): void {
        const success = this.statusManager.applyStatus(unitId, statusId, stacks, sourceId, duration);
        
        // 如果成功应用状态且提供了单位精灵，更新状态显示
        if (success && unit) {
            const statuses = this.statusManager.getUnitStatuses(unitId);
            unit.updateStatusDisplay(statuses);
        }
    }

    /**
     * 清理单位状态
     */
    public cleanupUnitStatuses(unitId: string): void {
        this.statusManager.cleanupUnit(unitId);
    }
}
