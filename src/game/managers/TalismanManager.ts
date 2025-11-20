import { Scene } from 'phaser';
import { TalismanSprite } from '../objects/TalismanSprite';
import { CardSprite } from '../objects/CardSprite';
import { GameActionHandler } from '../handlers/GameActionHandler';
import type { BattleLog } from '../ui/BattleLog';
import type { TalismanCard } from '../../../public/data/types/cards/talisman';

export class TalismanManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private selectedTalisman: TalismanSprite | null = null;
    private isSelectingTarget: boolean = false;
    private gameActionHandler: GameActionHandler | null = null;

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 设置游戏动作处理器
     */
    public setGameActionHandler(handler: GameActionHandler): void {
        this.gameActionHandler = handler;
    }

    /**
     * 开始使用符箓（进入目标选择模式）
     */
    public startUseTalisman(talisman: TalismanSprite): void {
        this.selectedTalisman = talisman;
        this.isSelectingTarget = true;
        
        const talismanData = talisman.getCardData();
        this.battleLog.addLog(`选择【${talismanData.name}】的目标...`, [talisman]);
        
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
    public useTalismanOnTarget(target: CardSprite, targetSide: 'ally' | 'enemy'): boolean {
        if (!this.selectedTalisman || !this.isSelectingTarget) {
            return false;
        }

        const talismanData = this.selectedTalisman.getCardData();
        const targetData = target.getCardData();

        // 检查目标是否合法
        if (!this.isValidTarget(target, talismanData, targetSide)) {
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
    private isValidTarget(_target: CardSprite, talismanData: TalismanCard, targetSide: 'ally' | 'enemy'): boolean {
        if (!talismanData.effects || talismanData.effects.length === 0) {
            return false;
        }

        const effect = talismanData.effects[0];
        const targetScope = effect.target?.scope;

        // 单体目标
        if (targetScope === 'singleAlly') {
            return targetSide === 'ally';
        }
        if (targetScope === 'singleEnemy') {
            return targetSide === 'enemy';
        }
        
        // 群体目标（点击任意单位触发）
        // 注意：talismans.json 中使用的是 "allEnemies" / "allAllies" 而不是 "enemyUnits"
        if (targetScope === 'allyUnits' || (targetScope as any) === 'allAllies') {
            return targetSide === 'ally';
        }
        if (targetScope === 'enemyUnits' || (targetScope as any) === 'allEnemies') {
            return targetSide === 'enemy';
        }
        if (targetScope === 'allUnits') {
            return true; // 全体目标，点击任意单位都可以
        }
        
        return false;
    }

    /**
     * 应用符箓效果
     */
    private applyTalismanEffect(talisman: TalismanSprite, target: CardSprite): void {
        const talismanData = talisman.getCardData();

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
            if (this.gameActionHandler) {
                const targetScope = effect.target?.scope || 'singleEnemy';
                const targets = this.gameActionHandler.getTargetsByScope(targetScope, target);

                effect.actions?.forEach((action: any) => {
                    // 使用统一的效果处理器
                    this.gameActionHandler!.applyEffect(
                        action,
                        talismanData.name,
                        talisman,  // 传入符箓精灵作为源卡片
                        targets.length === 1 ? targets[0] : undefined,
                        targets.length > 1 ? targets : undefined
                    );
                });
            }

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
