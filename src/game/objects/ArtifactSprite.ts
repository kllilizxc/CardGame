import { C, T } from '../art/palette';
import { GameObjects } from 'phaser';
import type { ArtifactCard } from '@data/types/cards/artifact';
import { BaseCardSprite } from './BaseCardSprite';
import { getArtifactStar, getGradeDisplayName, getElementsDisplayText, getElementColor } from '../utils/ArtifactHelper';

type BattleSceneArtifactDragBridge = Phaser.Scene & {
    tryEquipArtifact?: (artifact: ArtifactSprite) => boolean;
};

export class ArtifactSprite extends BaseCardSprite {
    private cardData: ArtifactCard;
    private starsText: GameObjects.Text;
    private gradeText: GameObjects.Text;
    private bonusText: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private currentDurability: number;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: ArtifactCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;
        this.currentDurability = cardData.durability ?? Infinity;

        // 创建背景（法器卡用金色边框）
        this.createBackground(C.umber, C.gold);

        // 创建名称
        this.createNameText(cardData.name);

        // 星级（从右往左排列）
        const star = getArtifactStar(cardData);
        const stars = '★'.repeat(star);
        this.starsText = scene.add.text(80, -87, stars, {
            fontSize: '12px',
            color: T.gold
        }).setOrigin(1, 0.5); // 设置原点为右侧中心，实现从右往左排列
        this.add(this.starsText);

        // 品级
        const gradeName = getGradeDisplayName(cardData.gradeId);
        this.gradeText = scene.add.text(-60, -87, gradeName, {
            fontSize: '12px',
            color: T.gold
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
        this.addIconPortrait('artifact');

        // 加成数值（移到类型标签下方）
        if (cardData.attackBonus || cardData.healthBonus) {
            const bonusText = [];
            if (cardData.attackBonus) bonusText.push(`攻+${cardData.attackBonus}`);
            if (cardData.healthBonus) bonusText.push(`命+${cardData.healthBonus}`);
            
            this.bonusText = scene.add.text(0, 70, bonusText.join('  '), {
                fontSize: '12px',
                color: T.gold,
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        } else {
            this.bonusText = scene.add.text(0, 70, '', {
                fontSize: '14px',
                color: '#ffc040'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        }

        // 描述（不在小卡上显示，只在预览时显示）
        this.descriptionText = scene.add.text(0, 105, cardData.description, {
            fontSize: '10px',
            color: '#cfc6dd',
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
                const battleScene = this.scene as BattleSceneArtifactDragBridge;
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

    public reduceDurability(): boolean {
        if (this.currentDurability === Infinity) return true;
        this.currentDurability--;
        return this.currentDurability > 0;
    }

    // 重写：获取默认边框颜色
    protected getDefaultStrokeColor(): number {
        return C.gold; // 金色
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        // 只有在hover模式下才显示描述
        const shouldShowDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(shouldShowDescription);
    }
}
