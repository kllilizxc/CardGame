import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { BattleLog } from '../ui/BattleLog';
import { getUnitStar } from '../utils/RealmHelper';

/**
 * 献祭召唤管理器
 * 处理高星单位的献祭召唤逻辑
 */
export class SacrificeManager {
    private scene: Scene;
    private battleLog: BattleLog;

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 检查是否需要献祭
     * @param cardData 单位卡数据
     * @returns 需要献祭的单位数量（0表示不需要）
     */
    public getSacrificeRequired(cardData: UnitCard): number {
        const star = getUnitStar(cardData);
        
        if (star >= 8) {
            return 2; // 8星及以上需要献祭2只
        } else if (star >= 5) {
            return 1; // 5-7星需要献祭1只
        }
        
        return 0; // 4星及以下不需要献祭
    }

    /**
     * 检查是否有足够的单位可以献祭
     * @param playerField 玩家场上单位
     * @param requiredCount 需要献祭的数量
     * @returns 是否有足够的单位
     */
    public canSacrifice(playerField: CardSprite[], requiredCount: number): boolean {
        return playerField.length >= requiredCount;
    }

    /**
     * 执行献祭
     * @param sacrificeTargets 要献祭的单位
     * @param playerField 玩家场上单位数组
     * @param onComplete 献祭完成回调
     */
    public performSacrifice(
        sacrificeTargets: CardSprite[],
        playerField: CardSprite[],
        onComplete: (remainingField: CardSprite[]) => void
    ): void {
        if (sacrificeTargets.length === 0) {
            onComplete(playerField);
            return;
        }

        this.battleLog.addLog(`献祭了${sacrificeTargets.length}只灵兽进行召唤`);

        // 播放献祭动画
        this.playSacrificeAnimation(sacrificeTargets, () => {
            // 从场上移除献祭的单位
            const remainingField = playerField.filter(
                unit => !sacrificeTargets.includes(unit)
            );

            // 销毁献祭的单位精灵
            sacrificeTargets.forEach(unit => {
                if (unit.active) {
                    unit.destroy();
                }
            });

            onComplete(remainingField);
        });
    }

    /**
     * 播放献祭动画
     */
    private playSacrificeAnimation(
        sacrificeTargets: CardSprite[],
        onComplete: () => void
    ): void {
        const { width, height } = this.scene.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        let completedCount = 0;
        const totalCount = sacrificeTargets.length;

        sacrificeTargets.forEach((unit, index) => {
            // 单位飞向中心并消失
            this.scene.tweens.add({
                targets: unit,
                x: centerX,
                y: centerY,
                scale: unit.scale * 0.3,
                alpha: 0,
                duration: 600,
                delay: index * 100,
                ease: 'Power2',
                onComplete: () => {
                    completedCount++;
                    if (completedCount === totalCount && onComplete) {
                        onComplete();
                    }
                }
            });
        });

        // 添加献祭光效
        this.createSacrificeEffect(centerX, centerY, totalCount);
    }

    /**
     * 创建献祭特效
     */
    private createSacrificeEffect(x: number, y: number, count: number): void {
        // 紫色献祭光环
        const circle = this.scene.add.circle(x, y, 0, 0x9b59b6, 0.6);
        circle.setDepth(999);

        this.scene.tweens.add({
            targets: circle,
            radius: 150,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                circle.destroy();
            }
        });

        // 粒子效果
        for (let i = 0; i < count * 8; i++) {
            const angle = (Math.PI * 2 * i) / (count * 8);
            const particle = this.scene.add.circle(x, y, 3, 0x9b59b6, 0.8);
            particle.setDepth(1000);

            this.scene.tweens.add({
                targets: particle,
                x: x + Math.cos(angle) * 120,
                y: y + Math.sin(angle) * 120,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }

    /**
     * 获取献祭提示文本
     */
    public getSacrificeText(requiredCount: number): string {
        if (requiredCount === 1) {
            return '需要献祭1只场上单位';
        } else if (requiredCount === 2) {
            return '需要献祭2只场上单位';
        }
        return '';
    }
}
