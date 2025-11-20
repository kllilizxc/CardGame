import { Scene } from 'phaser';
import { TalismanSprite } from '../objects/TalismanSprite';
import { CardSprite } from '../objects/CardSprite';
import type { BattleLog } from '../ui/BattleLog';
import type { TalismanCard } from '../../../data/types/cards/talisman';

export class TalismanManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private selectedTalisman: TalismanSprite | null = null;
    private isSelectingTarget: boolean = false;

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 开始使用符箓（进入目标选择模式）
     */
    public startUseTalisman(talisman: TalismanSprite): void {
        this.selectedTalisman = talisman;
        this.isSelectingTarget = true;
        
        const talismanData = talisman.getCardData();
        this.battleLog.addLog(`选择【${talismanData.name}】的目标...`);
        
        // 高亮符箓卡
        talisman.setScale(talisman.scale * 1.2);
        talisman.setDepth(2000);
    }

    /**
     * 取消使用符箓
     */
    public cancelUseTalisman(): void {
        if (this.selectedTalisman) {
            this.selectedTalisman.setScale(this.selectedTalisman.scale / 1.2);
            this.selectedTalisman.setDepth(100);
            this.selectedTalisman = null;
        }
        this.isSelectingTarget = false;
    }

    /**
     * 尝试对目标使用符箓
     */
    public useTalismanOnTarget(target: CardSprite): boolean {
        if (!this.selectedTalisman || !this.isSelectingTarget) {
            return false;
        }

        const talismanData = this.selectedTalisman.getCardData();
        const targetData = target.getCardData();

        // 检查目标是否合法
        if (!this.isValidTarget(target, talismanData)) {
            this.battleLog.addLog(`无法对【${targetData.name}】使用【${talismanData.name}】`);
            return false;
        }
        // 应用效果
        this.applyTalismanEffect(this.selectedTalisman, target);

        // 重置状态
        this.cancelUseTalisman();

        return true;
    }

    /**
     * 检查目标是否合法
     */
    private isValidTarget(_target: CardSprite, talismanData: TalismanCard): boolean {
        if (!talismanData.effects || talismanData.effects.length === 0) {
            return false;
        }

        const effect = talismanData.effects[0];
        const targetScope = effect.target?.scope;

        // 根据目标范围判断
        // 这里简化处理，实际应该检查目标是敌人还是友军
        return targetScope === 'singleEnemy' || targetScope === 'singleAlly';
    }

    /**
     * 应用符箓效果
     */
    private applyTalismanEffect(talisman: TalismanSprite, target: CardSprite): void {
        const talismanData = talisman.getCardData();
        const targetData = target.getCardData();

        if (!talismanData.effects || talismanData.effects.length === 0) {
            return;
        }

        const effect = talismanData.effects[0];
        if (!effect.actions || effect.actions.length === 0) {
            return;
        }

        // 播放使用动画
        this.playUseTalismanAnimation(talisman, target, () => {
            // 动画完成后应用效果
            effect.actions?.forEach(action => {
                if (action.type === 'modifyHealth' && action.value !== undefined) {
                    targetData.health += action.value;
                    
                    // 生命值不能低于0
                    if (targetData.health < 0) {
                        targetData.health = 0;
                    }

                    // 更新显示
                    target.updateStats();

                    // 记录日志
                    if (action.value < 0) {
                        const damage = Math.abs(action.value);
                        this.battleLog.addLog(
                            `【${talismanData.name}】对【${targetData.name}】造成${damage}点伤害！`,
                            [target]
                        );
                    } else {
                        this.battleLog.addLog(
                            `【${talismanData.name}】为【${targetData.name}】恢复${action.value}点生命值！`,
                            [target]
                        );
                    }
                } else if (action.type === 'modifyAttack' && action.value !== undefined) {
                    targetData.attack += action.value;
                    target.updateStats();
                    this.battleLog.addLog(
                        `【${talismanData.name}】使【${targetData.name}】攻击力${action.value > 0 ? '+' : ''}${action.value}！`,
                        [target]
                    );
                }
            });

            // 效果应用完成后，触发通用的效果检查事件
            this.scene.events.emit('effectApplied');
        });
    }

    /**
     * 播放使用符箓动画
     */
    private playUseTalismanAnimation(
        talisman: TalismanSprite,
        target: CardSprite,
        onComplete: () => void
    ): void {

        // 符箓飞向目标
        this.scene.tweens.add({
            targets: talisman,
            x: target.x,
            y: target.y,
            scale: 0.5,
            alpha: 0.8,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                // 创建爆炸效果
                const explosion = this.scene.add.circle(target.x, target.y, 30, 0xff6b6b, 0.8);
                explosion.setDepth(1500);

                this.scene.tweens.add({
                    targets: explosion,
                    scale: 2,
                    alpha: 0,
                    duration: 300,
                    ease: 'Power2',
                    onComplete: () => {
                        explosion.destroy();
                        if (onComplete) onComplete();
                    }
                });
            }
        });
    }

    /**
     * 是否正在选择目标
     */
    public isSelectingTargetMode(): boolean {
        return this.isSelectingTarget;
    }

    /**
     * 获取当前选中的符箓
     */
    public getSelectedTalisman(): TalismanSprite | null {
        return this.selectedTalisman;
    }
}
