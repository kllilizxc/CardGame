import { GameObjects } from 'phaser';
import type { ArtifactCard } from '@data/types/cards/artifact';
import { BaseCardSprite } from './BaseCardSprite';
import { getArtifactStar, getGradeDisplayName, getElementsDisplayText, getElementColor } from '../utils/ArtifactHelper';

export class ArtifactSprite extends BaseCardSprite {
    private cardData: ArtifactCard;
    private starsText: GameObjects.Text;
    private gradeText: GameObjects.Text;
    private bonusText: GameObjects.Text;
    private descriptionText: GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: ArtifactCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（法器卡用金色边框）
        this.createBackground(0x3a2f2f, 0xdaa520);

        // 创建名称
        this.createNameText(cardData.name);

        // 星级（从右往左排列）
        const star = getArtifactStar(cardData);
        const stars = '★'.repeat(star);
        this.starsText = scene.add.text(80, -90, stars, {
            fontSize: '14px',
            color: '#f1c40f'
        }).setOrigin(1, 0.5); // 设置原点为右侧中心，实现从右往左排列
        this.add(this.starsText);

        // 品级
        const gradeName = getGradeDisplayName(cardData.gradeId);
        this.gradeText = scene.add.text(-60, -90, gradeName, {
            fontSize: '12px',
            color: '#daa520'
        }).setOrigin(0.5);
        this.add(this.gradeText);

        // 属性显示
        if (cardData.elements && cardData.elements.length > 0) {
            const elementsText = getElementsDisplayText(cardData.elements);
            const firstElementColor = getElementColor(cardData.elements[0]);
            const elementsDisplay = scene.add.text(75, -120, `[${elementsText}]`, {
                fontSize: '12px',
                color: `#${firstElementColor.toString(16).padStart(6, '0')}`
            }).setOrigin(0.5);
            this.add(elementsDisplay);
        }

        // 图标占位符（保持在中间位置）
        const iconBox = scene.add.rectangle(0, -20, 120, 120, 0x4a3f3f);
        this.add(iconBox);
        const iconText = scene.add.text(0, -20, '⚙', {
            fontSize: '48px',
            color: '#c9a959'
        }).setOrigin(0.5);
        this.add(iconText);

        // 加成数值（移到类型标签下方）
        if (cardData.attackBonus || cardData.healthBonus) {
            const bonusText = [];
            if (cardData.attackBonus) bonusText.push(`⚔+${cardData.attackBonus}`);
            if (cardData.healthBonus) bonusText.push(`❤+${cardData.healthBonus}`);
            
            this.bonusText = scene.add.text(0, 70, bonusText.join('  '), {
                fontSize: '14px',
                color: '#f1c40f',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        } else {
            this.bonusText = scene.add.text(0, 70, '', {
                fontSize: '14px',
                color: '#f1c40f'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        }

        // 描述（不在小卡上显示，只在预览时显示）
        this.descriptionText = scene.add.text(0, 105, cardData.description, {
            fontSize: '10px',
            color: '#bdc3c7',
            wordWrap: { width: 160 },
            align: 'center'
        }).setOrigin(0.5);
        this.descriptionText.setVisible(false); // 默认隐藏
        this.add(this.descriptionText);

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置拖拽事件
        this.setupDragEvents({
            onDragEnd: () => {
                // 拖拽结束后的处理
                const battleScene = this.scene as any;
                if (battleScene.tryEquipArtifact) {
                    const success = battleScene.tryEquipArtifact(this);
                    if (!success) {
                        this.returnToOriginalPosition();
                    }
                } else {
                    this.returnToOriginalPosition();
                }
            }
        });
    }

    public getCardData(): ArtifactCard {
        return this.cardData;
    }

    // 重写：获取默认边框颜色
    protected getDefaultStrokeColor(): number {
        return 0xdaa520; // 金色
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        // 只有在hover模式下才显示描述
        const shouldShowDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(shouldShowDescription);
    }
}
