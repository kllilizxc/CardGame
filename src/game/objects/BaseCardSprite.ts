import { GameObjects } from 'phaser';

export abstract class BaseCardSprite extends GameObjects.Container {
    protected background!: GameObjects.Rectangle;
    protected nameText!: GameObjects.Text;
    protected isDragging: boolean = false;
    protected originalX: number = 0;
    protected originalY: number = 0;
    protected cardScale: number = 1;

    // 卡牌标准尺寸
    protected readonly CARD_WIDTH = 180;
    protected readonly CARD_HEIGHT = 260;

    constructor(scene: Phaser.Scene, x: number, y: number, scale: number = 0.7) {
        super(scene, x, y);
        this.cardScale = scale;
    }

    /**
     * 创建卡牌背景
     */
    protected createBackground(color: number, strokeColor: number): void {
        this.background = this.scene.add.rectangle(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, color);
        this.background.setStrokeStyle(3, strokeColor);
        this.add(this.background);
    }

    /**
     * 创建卡牌名称文本
     */
    protected createNameText(name: string, y: number = -110): void {
        this.nameText = this.scene.add.text(0, y, name, {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.nameText);
    }

    /**
     * 设置交互和应用缩放
     */
    protected setupInteractivity(): void {
        this.setSize(this.CARD_WIDTH, this.CARD_HEIGHT);
        this.setInteractive({ draggable: true, useHandCursor: true });
        this.setScale(this.cardScale);
        this.scene.add.existing(this);
    }

    /**
     * 设置通用的拖拽事件
     * @param config 可选配置，支持自定义拖拽各阶段的行为
     */
    protected setupDragEvents(config?: {
        onDragStart?: () => void;
        onDragging?: (pointer: Phaser.Input.Pointer) => void;
        onDragEnd?: () => void;
        emitSceneEvents?: boolean; // 是否发送场景事件（默认true）
    }): void {
        const {
            onDragStart,
            onDragging,
            onDragEnd,
            emitSceneEvents = true
        } = config || {};

        // 悬停效果
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
            
            // 执行自定义钩子
            if (onDragStart) {
                onDragStart();
            }
        });

        // 拖拽中
        this.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            this.x = dragX;
            this.y = dragY;
            
            // 执行自定义钩子
            if (onDragging) {
                onDragging(pointer);
            }
        });

        // 拖拽结束
        this.on('dragend', () => {
            this.isDragging = false;
            this.setScale(this.cardScale);
            this.setDepth(0);
            
            // 通知场景卡牌拖拽结束（用于场地卡等特殊处理）
            if (emitSceneEvents) {
                this.scene.events.emit('cardDragEnd', this);
            }
            
            // 执行自定义钩子
            if (onDragEnd) {
                onDragEnd();
            }
        });
    }

    /**
     * 悬停时的处理（子类可重写）
     */
    protected onPointerOver(): void {
        this.background.setStrokeStyle(3, 0xffd700);
        this.scene.events.emit('showCardPreview', this);
    }

    /**
     * 离开时的处理（子类可重写）
     */
    protected onPointerOut(): void {
        this.background.setStrokeStyle(3, this.getDefaultStrokeColor());
        this.scene.events.emit('hideCardPreview');
    }

    /**
     * 获取默认边框颜色（子类需实现）
     */
    protected abstract getDefaultStrokeColor(): number;

    /**
     * 获取卡牌数据（子类需实现）
     * 返回具体的卡牌数据对象，用于类型安全的数据访问
     */
    public abstract getCardData(): any;

    /**
     * 返回原始位置
     */
    public returnToOriginalPosition(): void {
        this.scene.tweens.add({
            targets: this,
            x: this.originalX,
            y: this.originalY,
            duration: 300,
            ease: 'Back.easeOut'
        });
    }

    /**
     * 设置原始位置
     */
    public setOriginalPosition(x: number, y: number): void {
        this.originalX = x;
        this.originalY = y;
    }

    /**
     * 禁用拖拽但保留hover交互
     */
    public disableDragging(): void {
        this.removeInteractive();
        this.setInteractive({ useHandCursor: false });
        
        this.off('dragstart');
        this.off('drag');
        this.off('dragend');
        
        // 重新添加hover效果
        this.on('pointerover', () => {
            this.onPointerOver();
        });

        this.on('pointerout', () => {
            this.onPointerOut();
        });
    }
}
