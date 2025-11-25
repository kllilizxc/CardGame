import type { CardSprite } from '../../objects/CardSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { BattleContext } from '../../context/BattleContext';
import { getUnitStar } from '../../utils/RealmHelper';

/**
 * 献祭召唤管理器
 * 处理高星单位的献祭召唤逻辑
 * 
 * 献祭规则：
 * - 1-2 星不需要献祭
 * - 3 星及以上需要献祭 1 张至少 (目标星级-1) 星的单位卡
 */
export class SacrificeManager {
    private battleContext: BattleContext;
    
    // 配置参数
    private readonly freeStarThreshold: number; // 免费召唤的星级上限（1-2星）

    constructor(battleContext: BattleContext, freeStarThreshold: number = 2) {
        this.battleContext = battleContext;
        this.freeStarThreshold = freeStarThreshold;
    }

    /**
     * 检查是否需要献祭
     * @param cardData 单位卡数据
     * @returns 需要献祭的单位数量（0表示不需要）
     * 
     * 新规则：
     * - 1-2 星: 0张祭品（可直接召唤）
     * - 3 星及以上: 1张祭品（需要献祭1张至少 (目标星级-1) 星的单位）
     * 
     * 示例：
     * - 1星: 0张祭品
     * - 2星: 0张祭品
     * - 3星: 1张祭品（需要2星或以上单位）
     * - 4星: 1张祭品（需要3星或以上单位）
     * - 5星: 1张祭品（需要4星或以上单位）
     */
    public getSacrificeRequired(cardData: UnitCard): number {
        const star = getUnitStar(cardData);
        
        if (star <= this.freeStarThreshold) {
            return 0; // 免费召唤
        }
        
        // 3星及以上统一需要1张祭品
        return 1;
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

        this.battleContext.battleLog.addLog(`献祭了${sacrificeTargets.length}只单位进行召唤`);

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
        this.battleContext.effectManager.playSacrificeAnimation(sacrificeTargets, onComplete);
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
