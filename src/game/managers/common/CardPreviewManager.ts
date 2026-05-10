import type { Scene } from 'phaser';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';
import type { CardSprite } from '../../objects/CardSprite';
import type { ArtifactSprite } from '../../objects/ArtifactSprite';
import type { TalismanSprite } from '../../objects/TalismanSprite';
import type { FieldSprite } from '../../objects/FieldSprite';
import type { AnyCard } from '@data/types/cards/all';

type BattleScenePreviewLayout = {
    cardPreview?: {
        x: number;
        y: number;
    };
    depth?: {
        cardPreview?: number;
    };
};

type BattleSceneWithLayout = Phaser.Scene & {
    layout?: BattleScenePreviewLayout;
};

/**
 * 卡牌预览管理器
 * 负责显示卡牌的放大预览
 */
export class CardPreviewManager {
    private scene: Scene;
    private cardPreview: Phaser.GameObjects.Container | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * 显示卡牌预览
     */
    public showFromSprite(card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite): void {
        const cardData = card.getCardData();
        this.showFromData(cardData);
    }

    /**
     * 从卡牌数据显示预览
     */
    public showFromData(cardData: AnyCard): void {
        // 先隐藏旧的预览
        this.hide();

        const battleScene = this.scene as BattleSceneWithLayout;
        const layout = battleScene.layout;
        
        // 使用布局配置的位置，如果没有则使用默认值
        const previewX = layout?.cardPreview?.x ?? this.scene.scale.width * 0.15;
        const previewY = layout?.cardPreview?.y ?? this.scene.scale.height * 0.5;
        const previewScale = 1.8;

        // 使用工厂创建预览卡片
        const previewCard = CardSpriteFactory.createSprite(this.scene, cardData, 0, 0, 1);
        if (!previewCard) {
            return; // 不支持的卡牌类型
        }

        // 设置为 hover 模式，显示完整信息包括描述
        previewCard.setDisplayMode('hover');

        // 创建预览容器
        this.cardPreview = this.scene.add.container(previewX, previewY);
        // 使用布局配置的深度
        const depth = layout?.depth?.cardPreview ?? 6000;
        this.cardPreview.setDepth(depth);

        // 添加背景遮罩
        const bgMask = this.scene.add.rectangle(0, 0, 220, 300, 0x000000, 0.8);
        bgMask.setStrokeStyle(4, 0xffd700);
        this.cardPreview.add(bgMask);

        // 添加克隆的卡片
        this.cardPreview.add(previewCard);

        this.cardPreview.setScale(previewScale);
        this.cardPreview.setAlpha(0);
        this.scene.tweens.add({
            targets: this.cardPreview,
            alpha: 1,
            duration: 150,
            ease: 'Power2'
        });
    }

    /**
     * 隐藏卡牌预览
     */
    public hide(): void {
        if (this.cardPreview) {
            // 保存当前预览的引用
            const previewToHide = this.cardPreview;
            // 立即清空引用，避免竞态条件
            this.cardPreview = null;
            
            // 停止该容器上的所有动画
            this.scene.tweens.killTweensOf(previewToHide);
            
            // 淡出并销毁
            this.scene.tweens.add({
                targets: previewToHide,
                alpha: 0,
                duration: 100,
                onComplete: () => {
                    previewToHide.destroy();
                }
            });
        }
    }

    /**
     * 销毁
     */
    public destroy(): void {
        this.hide();
    }
}
