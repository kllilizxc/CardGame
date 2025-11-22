import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { BattleLog } from '../ui/BattleLog';
import { getUnitStar } from '../utils/RealmHelper';

/**
 * 献祭召唤管理器
 * 处理高星单位的献祭召唤逻辑
 * 
 * 献祭规则：
 * - freeStarThreshold 及以下不需要献祭
 * - 每高一星需要 2 张低一星的卡作为祭品
 */
export class SacrificeManager {
    private scene: Scene;
    private battleLog: BattleLog;
    
    // 配置参数
    private readonly freeStarThreshold: number; // 免费召唤的星级上限
    private readonly sacrificePerStar: number;  // 每高一星需要的祭品数量

    constructor(scene: Scene, battleLog: BattleLog, freeStarThreshold: number = 2) {
        this.scene = scene;
        this.battleLog = battleLog;
        this.freeStarThreshold = freeStarThreshold;
        this.sacrificePerStar = 2; // 固定为2张祭品
    }

    /**
     * 检查是否需要献祭
     * @param cardData 单位卡数据
     * @returns 需要献祭的单位数量（0表示不需要）
     * 
     * 计算公式：
     * - star <= freeStarThreshold: 0张祭品
     * - star > freeStarThreshold: (star - freeStarThreshold) * sacrificePerStar 张祭品
     * 
     * 示例（freeStarThreshold = 2）：
     * - 1星: 0张祭品
     * - 2星: 0张祭品
     * - 3星: (3-2)*2 = 2张祭品
     * - 4星: (4-2)*2 = 4张祭品
     * - 5星: (5-2)*2 = 6张祭品
     */
    public getSacrificeRequired(cardData: UnitCard): number {
        const star = getUnitStar(cardData);
        
        if (star <= this.freeStarThreshold) {
            return 0; // 免费召唤
        }
        
        // 每高一星需要 sacrificePerStar 张祭品
        return (star - this.freeStarThreshold) * this.sacrificePerStar;
    }
    
    /**
     * 检查祭品是否满足星级要求
     * @param cardData 要召唤的单位
     * @param sacrificeTargets 选择的祭品
     * @returns 是否满足要求
     * 
     * 祭品规则：
     * - 推荐使用低一星的卡（targetStar - 1）
     * - 也可以使用同级或更高级的卡
     * - 即：祭品星级 >= targetStar - 1
     */
    public validateSacrificeStars(cardData: UnitCard, sacrificeTargets: CardSprite[]): boolean {
        const targetStar = getUnitStar(cardData);
        
        // 免费召唤不需要检查
        if (targetStar <= this.freeStarThreshold) {
            return true;
        }
        
        // 祭品必须是低一星或更高星级的卡
        const minSacrificeStar = targetStar - 1;
        
        return sacrificeTargets.every(sacrifice => {
            const sacrificeData = sacrifice.getCardData();
            const sacrificeStar = getUnitStar(sacrificeData);
            return sacrificeStar >= minSacrificeStar;
        });
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
     * @param cardData 要召唤的单位
     * @param requiredCount 需要的祭品数量
     */
    public getSacrificeText(cardData: UnitCard, requiredCount: number): string {
        if (requiredCount === 0) {
            return '';
        }
        
        const targetStar = getUnitStar(cardData);
        const minSacrificeStar = targetStar - 1;
        
        return `需要献祭${requiredCount}只${minSacrificeStar}星及以上单位`;
    }
    
    /**
     * 获取可用的祭品列表（符合星级要求的单位）
     * @param cardData 要召唤的单位
     * @param playerField 玩家场上单位
     */
    public getValidSacrifices(cardData: UnitCard, playerField: CardSprite[]): CardSprite[] {
        const targetStar = getUnitStar(cardData);
        
        // 免费召唤不需要祭品
        if (targetStar <= this.freeStarThreshold) {
            return [];
        }
        
        const minSacrificeStar = targetStar - 1;
        
        return playerField.filter(unit => {
            const unitData = unit.getCardData();
            const unitStar = getUnitStar(unitData);
            // 可以使用低一星或更高星级的卡
            return unitStar >= minSacrificeStar;
        });
    }
}
