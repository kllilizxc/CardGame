import { GameObjects } from 'phaser';

/**
 * 卡片显示模式
 * - field: 战场模式（基本信息）
 * - hover: 悬停预览模式（完整信息，包含描述）
 * - deck: 卡组查看模式（完整信息，不包含描述）
 */
export type CardDisplayMode = 'field' | 'hover' | 'deck';

export abstract class BaseCardSprite extends GameObjects.Container {
    protected background!: GameObjects.Rectangle;
    protected nameText!: GameObjects.Text;
    protected cardScale: number;
    protected isDragging: boolean = false;
    protected originalX: number = 0;
    protected originalY: number = 0;
    protected currentDisplayMode: CardDisplayMode = 'field';
    protected isDraggingDisabled: boolean = false;

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
        // 只发送预览事件，不改变原卡片的显示模式
        this.scene.events.emit('showCardPreview', this);
    }

    /**
     * 离开时的处理（子类可重写）
     */
    protected onPointerOut(): void {
        this.background.setStrokeStyle(3, this.getDefaultStrokeColor());
        // 不再触发隐藏预览，让预览面板保持显示
        // this.scene.events.emit('hideCardPreview');
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
        // 尝试通过 BattleScene 获取 battleContext
        const battleScene = this.scene as any;
        if (battleScene.battleContext?.effectManager) {
            battleScene.battleContext.effectManager.returnCardToPosition(
                this,
                this.originalX,
                this.originalY
            );
        } else {
            // 降级处理：如果没有 battleContext，直接使用 tweens
            this.scene.tweens.add({
                targets: this,
                x: this.originalX,
                y: this.originalY,
                duration: 300,
                ease: 'Back.easeOut'
            });
        }
    }

    /**
     * 设置原始位置
     */
    public setOriginalPosition(x: number, y: number): void {
        this.originalX = x;
        this.originalY = y;
    }

    /**
     * 获取原始位置
     */
    public getOriginalPosition(): { x: number; y: number } {
        return { x: this.originalX, y: this.originalY };
    }

    /**
     * 获取卡牌原始缩放
     */
    public getCardBaseScale(): number {
        return this.cardScale;
    }

    /**
     * 禁用拖拽但保留hover交互
     */
    public disableDragging(): void {
        // 如果已经禁用过，直接返回避免重复操作
        if (this.isDraggingDisabled) {
            return;
        }
        
        this.isDraggingDisabled = true;
        
        // 移除拖拽相关的监听器
        this.off('dragstart');
        this.off('drag');
        this.off('dragend');
        
        // 重新设置为非拖拽的交互模式，但保持hitArea
        if (this.input) {
            this.input.draggable = false;
            this.input.cursor = 'default';
        }
        
        // 确保hover事件存在
        this.on('pointerover', () => {
            this.onPointerOver();
        });

        this.on('pointerout', () => {
            this.onPointerOut();
        });
    }

    /**
     * 设置卡片显示模式（子类需实现具体逻辑）
     * @param mode 显示模式
     */
    public setDisplayMode(mode: CardDisplayMode): void {
        this.currentDisplayMode = mode;
        this.updateDisplayMode();
    }

    /**
     * 更新显示模式（子类需重写此方法来控制UI元素显隐）
     */
    protected abstract updateDisplayMode(): void;

    /**
     * 获取当前显示模式
     */
    public getDisplayMode(): CardDisplayMode {
        return this.currentDisplayMode;
    }
}
