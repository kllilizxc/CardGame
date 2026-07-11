import { Scene } from 'phaser';
import { BaseCardSprite } from './BaseCardSprite';
import type { FieldCard } from '../../../data/types/cards/field';
import {
    battleColorToHex,
    getBattleCardPalette,
    getBattleCardTextStyle,
} from '../ui/battle/battleTheme';

/**
 * 场地卡精灵类
 * 场地卡改变战场环境，对双方或单方产生影响
 */
export class FieldSprite extends BaseCardSprite {
    private readonly palette = getBattleCardPalette('field');
    private cardData: FieldCard;
    private effectText!: Phaser.GameObjects.Text;

    constructor(scene: Scene, x: number, y: number, cardData: FieldCard, cardScale: number) {
        super(scene, x, y, cardScale);
        
        this.cardData = cardData;
        
        this.createVisuals();
    }

    private createVisuals(): void {
        // 创建场地卡背景 - 使用金色边框表示环境
        this.createBackground(this.palette.shell, this.palette.border);

        // 添加场地图标
        const iconBg = this.scene.add.circle(0, -82, 30, this.palette.accent, 0.24);
        this.add(iconBg);

        const iconText = this.scene.add.text(0, -82, '境', getBattleCardTextStyle('name', {
            fontSize: '28px',
            color: battleColorToHex(this.palette.accentSoft),
        })).setOrigin(0.5);
        this.add(iconText);

        // 卡牌名称
        this.nameText = this.scene.add.text(0, -36, this.cardData.name, getBattleCardTextStyle('name', {
            fontSize: '20px',
            color: battleColorToHex(this.palette.accent),
            align: 'center',
            wordWrap: { width: 150 },
        })).setOrigin(0.5);
        this.add(this.nameText);

        // 对称性标识
        if (this.cardData.symmetric) {
            this.createCardText(0, -6, '双方生效', 'meta', {
                fontSize: '18px',
                color: this.palette.supportText,
                fontStyle: 'italic',
            });
        }

        // 效果描述
        const effectDescription = this.getEffectDescription();
        this.effectText = this.scene.add.text(0, 42, effectDescription, getBattleCardTextStyle('body', {
            fontSize: '18px',
            color: this.palette.bodyText,
            align: 'center',
            wordWrap: { width: 146 },
        })).setOrigin(0.5);
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
        this.cardData.effects.forEach((effect) => {
            if (effect.text) {
                effectTexts.push(effect.text);
            }
        });

        return effectTexts.join('\n');
    }

    protected getDefaultStrokeColor(): number {
        return this.palette.border; // 金色
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
