import type { Scene } from 'phaser';
import { CardSpriteFactory } from '../factories/CardSpriteFactory';
import type { BaseCardSprite } from '../objects/BaseCardSprite';
import { GongfaTooltip } from './GongfaTooltip';
import type { PanelConfig } from '../config/LayoutConfig';

/**
 * 固定的卡牌预览面板
 * 显示在屏幕左侧，hover 卡牌时更新内容而不消失
 */
export class CardPreviewPanel {
    private scene: Scene;
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Rectangle;
    private titleText: Phaser.GameObjects.Text;
    private currentPreviewCard: BaseCardSprite | null = null;
    private gongfaTooltip: GongfaTooltip;
    private isVisible: boolean = false;

    private readonly PANEL_WIDTH: number;
    private readonly PANEL_HEIGHT: number;
    private readonly PANEL_X: number;
    private readonly PANEL_Y: number;

    constructor(scene: Scene, config: PanelConfig) {
        this.scene = scene;

        // 使用传入的配置
        this.PANEL_WIDTH = config.width;
        this.PANEL_HEIGHT = config.height;
        this.PANEL_X = config.x;
        this.PANEL_Y = config.y;

        // 创建容器
        this.container = scene.add.container(this.PANEL_X, this.PANEL_Y);
        this.container.setDepth(6000);
        this.container.setVisible(false);

        // 背景
        this.background = scene.add.rectangle(0, 0, this.PANEL_WIDTH, this.PANEL_HEIGHT, 0x1a1a2e, 0.95);
        this.background.setStrokeStyle(4, 0xffd700);
        this.container.add(this.background);

        // 标题
        this.titleText = scene.add.text(0, -this.PANEL_HEIGHT / 2 + 25, '卡牌详情', {
            fontSize: Math.floor(scene.scale.height * 0.022) + 'px',
            color: '#ffd700',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(this.titleText);

        // 初始化功法提示框
        this.gongfaTooltip = new GongfaTooltip(scene);
    }

    /**
     * 显示卡牌预览
     */
    public showCard(card: BaseCardSprite): void {
        const cardData = card.getCardData();
        this.showCardFromData(cardData);
    }

    /**
     * 从卡牌数据显示预览
     */
    public showCardFromData(cardData: any): void {
        // 清除旧的预览卡片
        if (this.currentPreviewCard) {
            this.currentPreviewCard.destroy();
            this.currentPreviewCard = null;
        }

        // 创建新的预览卡片
        const previewCard = CardSpriteFactory.createSprite(this.scene, cardData, 0, 0);
        if (!previewCard) {
            return;
        }

        // 设置为hover模式，显示完整信息
        previewCard.setDisplayMode('hover');
        previewCard.setPosition(0, 20);

        // 计算合适的缩放比例
        const cardHeight = 200; // 假设卡牌原始高度
        const availableHeight = this.PANEL_HEIGHT; // 留出标题和边距
        const scale = Math.min(1.8, availableHeight / cardHeight);
        previewCard.setScale(scale);

        this.container.add(previewCard);
        this.currentPreviewCard = previewCard;

        // 显示面板
        if (!this.isVisible) {
            this.isVisible = true;
            this.container.setVisible(true);
            this.container.setAlpha(0);
            this.scene.tweens.add({
                targets: this.container,
                alpha: 1,
                duration: 200,
                ease: 'Power2'
            });
        }
    }

    /**
     * 隐藏面板
     */
    public hide(): void {
        if (!this.isVisible) {
            return;
        }

        this.isVisible = false;
        this.gongfaTooltip.hide();

        this.scene.tweens.add({
            targets: this.container,
            alpha: 0,
            duration: 150,
            ease: 'Power2',
            onComplete: () => {
                this.container.setVisible(false);
                if (this.currentPreviewCard) {
                    this.currentPreviewCard.destroy();
                    this.currentPreviewCard = null;
                }
            }
        });
    }

    /**
     * 获取功法提示框（供外部使用）
     */
    public getGongfaTooltip(): GongfaTooltip {
        return this.gongfaTooltip;
    }

    /**
     * 销毁面板
     */
    public destroy(): void {
        this.gongfaTooltip.destroy();
        if (this.currentPreviewCard) {
            this.currentPreviewCard.destroy();
        }
        this.container.destroy();
    }
}
