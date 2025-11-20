import { Scene } from 'phaser';
import { BaseCardSprite } from './BaseCardSprite';
import type { FieldCard } from '../../../data/types/cards/field';

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
        this.createBackground(0x1a1a2e, 0xf39c12); // 深蓝背景，金色边框

        // 添加场地图标
        const iconBg = this.scene.add.circle(0, -80, 30, 0xf39c12, 0.3);
        this.add(iconBg);

        const iconText = this.scene.add.text(0, -80, '🏞️', {
            fontSize: '32px'
        }).setOrigin(0.5);
        this.add(iconText);

        // 卡牌名称
        this.nameText = this.scene.add.text(0, -40, this.cardData.name, {
            fontSize: '18px',
            color: '#f39c12',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 150 }
        }).setOrigin(0.5);
        this.add(this.nameText);

        // 对称性标识
        if (this.cardData.symmetric) {
            this.symmetricIcon = this.scene.add.text(0, -10, '⚖️ 双方生效', {
                fontSize: '12px',
                color: '#95a5a6',
                fontStyle: 'italic'
            }).setOrigin(0.5);
            this.add(this.symmetricIcon);
        }

        // 效果描述
        const effectDescription = this.getEffectDescription();
        this.effectText = this.scene.add.text(0, 40, effectDescription, {
            fontSize: '13px',
            color: '#ecf0f1',
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
        this.cardData.effects.forEach(effect => {
            if (effect.text) {
                effectTexts.push(effect.text);
            }
        });

        return effectTexts.join('\n');
    }

    protected getDefaultStrokeColor(): number {
        return 0xf39c12; // 金色
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
