import { C, T } from '../art/palette';
import { Scene } from 'phaser';
import { BaseCardSprite } from './BaseCardSprite';
import type { FieldCard } from '@data/types/cards/field';
import type { CardEffect } from '@data/types/cards/effects';

/**
 * 场地卡精灵类
 * 场地卡改变战场环境，对双方或单方产生影响
 */
export class FieldSprite extends BaseCardSprite {
    private cardData: FieldCard;
    private effectText!: Phaser.GameObjects.Text;
    private symmetricIcon?: Phaser.GameObjects.Text;

    constructor(scene: Scene, x: number, y: number, cardData: FieldCard, cardScale: number) {
        super(scene, x, y, cardScale);
        
        this.cardData = cardData;
        
        this.createVisuals();
    }

    private createVisuals(): void {
        // 创建场地卡背景 - 使用金色边框表示环境
        this.createBackground(C.night, C.gold); // 夜色背景，金色边框

        // 添加场地图标
        this.addIconPortrait('mountain');

        // 卡牌名称
        this.createNameText(this.cardData.name);

        // 对称性标识
        if (this.cardData.symmetric) {
            this.symmetricIcon = this.scene.add.text(0, 38, '◆ 双方生效', {
                fontSize: '12px',
                color: T.dim,
                fontStyle: 'italic'
            }).setOrigin(0.5);
            this.add(this.symmetricIcon);
        }

        // 效果描述
        const effectDescription = this.getEffectDescription();
        this.effectText = this.scene.add.text(0, 78, effectDescription, {
            fontSize: '12px',
            color: T.fog,
            align: 'center',
            wordWrap: { width: 150 }
        }).setOrigin(0.5);
        this.add(this.effectText);

        // 设置交互（使用拖拽）
        this.setupInteractivity();
        
        // 设置拖拽事件
        this.setupDragEvents();
    }

    private getEffectDescription(): string {
        if (!this.cardData.effects || this.cardData.effects.length === 0) {
            return '无效果';
        }

        const effectTexts: string[] = [];
        this.cardData.effects.forEach((effect: CardEffect) => {
            if (effect.text) {
                effectTexts.push(effect.text);
            }
        });

        return effectTexts.join('\n');
    }

    protected getDefaultStrokeColor(): number {
        return C.gold; // 金色
    }

    /**
     * 获取卡牌数据
     */
    public getCardData(): FieldCard {
        return this.cardData;
    }

    /**
     * 更新显示（场地卡通常不需要更新数值）
     */
    public updateDisplay(): void {
        // 场地卡没有动态数值，不需要更新
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        // 场地卡没有description字段，所有模式下显示一致
    }
}
