import type { BattleAnimationManager } from './BattleAnimationManager';
import type { CardSprite } from '../objects/CardSprite';

/**
 * 特效管理器
 * 统一管理所有游戏特效（粒子、光效、动画等）
 * 实际动画由 BattleAnimationManager 处理
 */
export class EffectManager {
    private animationManager: BattleAnimationManager;

    constructor(animationManager: BattleAnimationManager) {
        this.animationManager = animationManager;
    }

    /**
     * 播放丹药使用特效
     */
    public playPillUseEffect(
        target: CardSprite | 'player' | undefined,
        onComplete?: () => void
    ): void {
        this.animationManager.playPillUseEffect(target, onComplete);
    }

    /**
     * 显示治疗特效
     */
    public showHealEffect(x?: number, y?: number, color?: number): void {
        this.animationManager.showHealEffect(x, y, color);
    }

    /**
     * 显示伤害特效
     */
    public showDamageEffect(target: CardSprite, color?: number): void {
        this.animationManager.showDamageEffect(target, color);
    }

    /**
     * 显示增益特效
     */
    public showBuffEffect(target: CardSprite, color?: number): void {
        this.animationManager.showBuffEffect(target, color);
    }

    /**
     * 显示减益特效
     */
    public showDebuffEffect(target: CardSprite, color?: number): void {
        this.animationManager.showDebuffEffect(target, color);
    }

    /**
     * 显示爆炸特效
     */
    public showExplosionEffect(
        x: number,
        y: number,
        color?: number,
        radius?: number
    ): void {
        this.animationManager.showExplosionEffect(x, y, color, radius);
    }

    /**
     * 显示文字飘动效果
     */
    public showFloatingText(
        x: number,
        y: number,
        text: string,
        color?: string,
        fontSize?: number
    ): void {
        this.animationManager.showFloatingText(x, y, text, color, fontSize);
    }

    /**
     * 播放献祭动画
     */
    public playSacrificeAnimation(
        sacrificeTargets: CardSprite[],
        onComplete: () => void
    ): void {
        this.animationManager.playSacrificeAnimation(sacrificeTargets, onComplete);
    }

    /**
     * 显示献祭特效
     */
    public showSacrificeEffect(x: number, y: number, count: number): void {
        this.animationManager.showSacrificeEffect(x, y, count);
    }

    /**
     * 播放符箓使用动画
     */
    public playTalismanUseAnimation(
        talisman: any,
        target: CardSprite,
        onComplete: () => void
    ): void {
        this.animationManager.playTalismanUseAnimation(talisman, target, onComplete);
    }

    /**
     * 显示回合切换动画
     */
    public showTurnAnimation(text: string, color: number, onComplete: () => void): void {
        this.animationManager.showTurnAnimation(text, color, onComplete);
    }

    /**
     * 卡牌返回原始位置动画
     */
    public returnCardToPosition(
        card: any,
        targetX: number,
        targetY: number,
        onComplete?: () => void
    ): void {
        this.animationManager.returnCardToPosition(card, targetX, targetY, onComplete);
    }
}
