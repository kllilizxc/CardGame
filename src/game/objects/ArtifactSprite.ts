import { GameObjects } from 'phaser';
import type { ArtifactCard } from '@data/types/cards/artifact';
import { BaseCardSprite } from './BaseCardSprite';
import { getArtifactStar, getGradeDisplayName } from '../utils/ArtifactHelper';

export class ArtifactSprite extends BaseCardSprite {
    private cardData: ArtifactCard;
    private starsText: GameObjects.Text;
    private gradeText: GameObjects.Text;
    private typeText: GameObjects.Text;
    private bonusText: GameObjects.Text;
    private durabilityText?: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private currentDurability: number;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: ArtifactCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;
        this.currentDurability = cardData.durability || -1; // -1 表示永久

        // 创建背景（法器卡用金色边框）
        this.createBackground(0x3a2f2f, 0xdaa520);

        // 创建名称
        this.createNameText(cardData.name);

        // 星级
        const star = getArtifactStar(cardData);
        const stars = '★'.repeat(star);
        this.starsText = scene.add.text(0, -85, stars, {
            fontSize: '14px',
            color: '#f1c40f'
        }).setOrigin(0.5);
        this.add(this.starsText);

        // 品级
        const gradeName = getGradeDisplayName(cardData.gradeId);
        this.gradeText = scene.add.text(0, -65, gradeName, {
            fontSize: '12px',
            color: '#daa520'
        }).setOrigin(0.5);
        this.add(this.gradeText);

        // 类型标签
        const typeLabel = this.getTypeLabel();
        this.typeText = scene.add.text(0, -45, typeLabel, {
            fontSize: '14px',
            color: '#daa520'
        }).setOrigin(0.5);
        this.add(this.typeText);

        // 图标占位符
        const iconBox = scene.add.rectangle(0, -20, 120, 120, 0x4a3f3f);
        this.add(iconBox);
        const iconText = scene.add.text(0, -20, '⚙', {
            fontSize: '48px',
            color: '#c9a959'
        }).setOrigin(0.5);
        this.add(iconText);

        // 加成数值
        if (cardData.attackBonus || cardData.healthBonus) {
            const bonusText = [];
            if (cardData.attackBonus) bonusText.push(`⚔+${cardData.attackBonus}`);
            if (cardData.healthBonus) bonusText.push(`❤+${cardData.healthBonus}`);
            
            this.bonusText = scene.add.text(0, 55, bonusText.join('  '), {
                fontSize: '14px',
                color: '#f1c40f',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        } else {
            this.bonusText = scene.add.text(0, 55, '', {
                fontSize: '14px',
                color: '#f1c40f'
            }).setOrigin(0.5);
            this.add(this.bonusText);
        }

        // 耐久度
        if (cardData.durability && cardData.durability > 0) {
            this.durabilityText = scene.add.text(0, 80, `耐久: ${this.currentDurability}/${cardData.durability}`, {
                fontSize: '12px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.add(this.durabilityText);
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

    private getTypeLabel(): string {
        const labels = this.cardData.labels || [];
        if (labels.includes('飞剑') || labels.includes('武器')) return '⚔ 武器';
        if (labels.includes('护甲') || labels.includes('防御')) return '🛡 护甲';
        if (labels.includes('饰品')) return '💎 饰品';
        if (labels.includes('法杖')) return '🔮 法杖';
        return '⚙ 法器';
    }

    public getCardData(): ArtifactCard {
        return this.cardData;
    }

    public reduceDurability() {
        if (this.currentDurability > 0) {
            this.currentDurability--;
            if (this.durabilityText) {
                this.durabilityText.setText(`耐久: ${this.currentDurability}/${this.cardData.durability}`);
                
                // 耐久度低时改变颜色
                if (this.currentDurability <= (this.cardData.durability || 0) * 0.3) {
                    this.durabilityText.setColor('#e74c3c');
                }
            }
            return this.currentDurability > 0; // 返回是否还有效
        }
        return true; // 永久法器总是有效
    }

    public getCurrentDurability(): number {
        return this.currentDurability;
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
