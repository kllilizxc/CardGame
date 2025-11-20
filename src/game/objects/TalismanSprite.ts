import { GameObjects } from 'phaser';
import type { TalismanCard } from '../../../data/types/cards/talisman';
import { BaseCardSprite } from './BaseCardSprite';

export class TalismanSprite extends BaseCardSprite {
    private cardData: TalismanCard;
    private typeText: GameObjects.Text;
    private effectText: GameObjects.Text;
    private descriptionText: GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: TalismanCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（符箓卡用紫色边框）
        this.createBackground(0x2f2f3a, 0x9b59b6);

        // 创建名称
        this.createNameText(cardData.name);

        // 类型标签
        const typeLabel = cardData.isInstant ? '符箓·即时' : `符箓·${cardData.duration}回合`;
        this.typeText = scene.add.text(0, -85, typeLabel, {
            fontSize: '14px',
            color: '#9b59b6'
        }).setOrigin(0.5);
        this.add(this.typeText);

        // 图标占位符
        const iconBox = scene.add.rectangle(0, -20, 120, 120, 0x3f3a4a);
        this.add(iconBox);
        const iconText = scene.add.text(0, -20, '✨', {
            fontSize: '48px',
            color: '#b19cd9'
        }).setOrigin(0.5);
        this.add(iconText);

        // 效果描述
        const effectDesc = this.getEffectDescription();
        this.effectText = scene.add.text(0, 55, effectDesc, {
            fontSize: '14px',
            color: '#e74c3c',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.effectText);

        // 描述文字（默认隐藏）
        this.descriptionText = scene.add.text(0, 85, cardData.description, {
            fontSize: '11px',
            color: '#95a5a6',
            align: 'center',
            wordWrap: { width: 150 }
        }).setOrigin(0.5);
        this.descriptionText.setVisible(false);
        this.add(this.descriptionText);

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置符箓卡专用的拖拽事件
        this.setupTalismanDragEvents();
    }

    /**
     * 设置符箓卡专用的拖拽逻辑
     */
    private setupTalismanDragEvents(): void {
        // 复用基类的hover效果
        this.on('pointerover', () => {
            this.onPointerOver();
        });

        this.on('pointerout', () => {
            if (!this.isDragging) {
                this.onPointerOut();
            }
        });

        // 拖拽开始
        this.on('dragstart', () => {
            this.isDragging = true;
            this.originalX = this.x;
            this.originalY = this.y;
            this.setScale(this.cardScale * 1.2);
            this.setDepth(1000);
            
            // 通知场景开始拖拽符箓
            this.scene.events.emit('talismanDragStart', this);
        });

        // 拖拽中 - 持续检测目标
        this.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            this.x = dragX;
            this.y = dragY;
            
            // 通知场景更新目标高亮
            this.scene.events.emit('talismanDragging', this, pointer);
        });

        // 拖拽结束 - 触发使用符箓
        this.on('dragend', () => {
            this.isDragging = false;
            
            // 通知场景结束拖拽
            this.scene.events.emit('talismanDragEnd', this);
            
            // 通知场景尝试使用符箓
            this.scene.events.emit('tryUseTalisman', this);
        });
    }

    private getEffectDescription(): string {
        // 解析效果并生成简短描述
        if (!this.cardData.effects || this.cardData.effects.length === 0) {
            return '无效果';
        }

        const effect = this.cardData.effects[0];
        if (!effect.actions || effect.actions.length === 0) {
            return effect.text || '无效果';
        }

        const action = effect.actions[0];
        if (action.type === 'modifyHealth' && action.value !== undefined) {
            const damage = Math.abs(action.value);
            return `造成${damage}点伤害`;
        } else if (action.type === 'modifyAttack' && action.value !== undefined) {
            return `攻击力${action.value > 0 ? '+' : ''}${action.value}`;
        } else if (action.type === 'applyStatus') {
            return `施加状态`;
        }

        return effect.text || '特殊效果';
    }

    protected getDefaultStrokeColor(): number {
        return 0x9b59b6; // 紫色边框
    }

    public getCardData(): TalismanCard {
        return this.cardData;
    }

    public showDescription(show: boolean): void {
        this.descriptionText.setVisible(show);
    }
}
