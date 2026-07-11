import { GameObjects } from 'phaser';
import type { ArtifactCard } from '@data/types/cards/artifact';
import { BaseCardSprite } from './BaseCardSprite';
import {
    battleColorToHex,
    getBattleCardPalette,
    getBattleCardTextStyle,
} from '../ui/battle/battleTheme';
import { sceneTheme } from '../scenes/shared/sceneTheme';
import { getArtifactStar, getGradeDisplayName, getElementsDisplayText, getElementColor } from '../utils/ArtifactHelper';

export class ArtifactSprite extends BaseCardSprite {
    private readonly palette = getBattleCardPalette('artifact');
    private cardData: ArtifactCard;
    private descriptionText: GameObjects.Text;
    private iconObjects: GameObjects.GameObject[] = [];
    private summaryObjects: GameObjects.GameObject[] = [];

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: ArtifactCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（法器卡用金色边框）
        this.createBackground(this.palette.shell, this.palette.border);

        // 创建名称
        this.createNameText(cardData.name, -104);

        // 星级（从右往左排列）
        const star = getArtifactStar(cardData);
        const stars = '★'.repeat(star);
        const starsText = scene.add.text(76, -86, stars, getBattleCardTextStyle('accent', {
            fontSize: '18px',
            color: battleColorToHex(sceneTheme.colors.goldSoft),
        })).setOrigin(1, 0.5); // 设置原点为右侧中心，实现从右往左排列
        this.add(starsText);

        // 品级
        const gradeName = getGradeDisplayName(cardData.gradeId);
        this.createCardText(-58, -86, gradeName, 'meta', {
            fontSize: '18px',
            color: battleColorToHex(this.palette.accent),
        });

        // 属性显示
        if (cardData.elements && cardData.elements.length > 0) {
            const elementsText = getElementsDisplayText(cardData.elements);
            const firstElementColor = getElementColor(cardData.elements[0]);
            this.createCardText(0, -60, `[${elementsText}]`, 'tiny', {
                fontSize: '18px',
                color: `#${firstElementColor.toString(16).padStart(6, '0')}`,
            });
        }

        // 图标占位符（保持在中间位置）
        const iconBox = scene.add.rectangle(0, -12, 122, 122, this.palette.iconFill, 0.92);
        iconBox.setStrokeStyle(1, this.palette.accent, 0.22);
        this.add(iconBox);
        const iconText = scene.add.text(0, -14, '⚙', {
            fontSize: '46px',
            color: battleColorToHex(this.palette.accent),
        }).setOrigin(0.5);
        this.add(iconText);
        this.iconObjects.push(iconBox, iconText);

        // 加成数值（移到类型标签下方）
        if (cardData.attackBonus || cardData.healthBonus) {
            const bonusText = [];
            if (cardData.attackBonus) bonusText.push(`⚔+${cardData.attackBonus}`);
            if (cardData.healthBonus) bonusText.push(`❤+${cardData.healthBonus}`);
            
            const bonusChip = this.createChip(
                0,
                78,
                132,
                34,
                this.palette.chipFill,
                this.palette.chipStroke,
                bonusText.join('  '),
                getBattleCardTextStyle('stat', {
                    fontSize: '18px',
                    color: battleColorToHex(this.palette.accent),
                }),
            );
            this.summaryObjects.push(bonusChip.background, bonusChip.text);
        } else {
            const noBonusText = this.createCardText(0, 78, '无额外加成', 'support', {
                fontSize: '18px',
                color: this.palette.supportText,
            });
            this.summaryObjects.push(noBonusText);
        }

        // 描述（不在小卡上显示，只在预览时显示）
        this.descriptionText = scene.add.text(0, 54, cardData.description, getBattleCardTextStyle('support', {
            fontSize: '18px',
            color: this.palette.supportText,
            wordWrap: { width: 150 },
            align: 'center',
        })).setOrigin(0.5);
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
        return this.palette.border; // 金色
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        const showExpandedDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(showExpandedDescription);
        this.iconObjects.forEach((object) => object.setVisible(!showExpandedDescription));
        this.summaryObjects.forEach((object) => object.setVisible(!showExpandedDescription));
    }
}
