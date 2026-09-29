import { GameObjects } from 'phaser';

import { auraTexture, cardFrameTexture, iconTexture, CARD_ART_W, type IconName } from '../art/sprites';
import type { CardPreviewMetadata } from '../managers/common/cardPreviewProtocol';
import { sceneTheme } from '../scenes/shared/sceneTheme';
import { blendBattleColor, getBattleCardTextStyle } from '../ui/battle/battleTheme';
import { watchCardFace, type CardFaceAppearance } from './cardFaceAppearance';

/**
 * 卡片显示模式
 * - field: 战场模式（基本信息）
 * - hover: 悬停预览模式（完整信息，包含描述）
 * - deck: 卡组查看模式（完整信息，不包含描述）
 */
export type CardDisplayMode = 'field' | 'hover' | 'deck';
type VisibleCardPart = GameObjects.GameObject & { visible: boolean; setVisible(visible: boolean): unknown };
const hasVisibility = (object: GameObjects.GameObject): object is VisibleCardPart => 'visible' in object && 'setVisible' in object;

export abstract class BaseCardSprite extends GameObjects.Container {
    protected background!: GameObjects.Rectangle;
    protected nameText!: GameObjects.Text;
    protected cardScale: number;
    protected isDragging: boolean = false;
    protected originalX: number = 0;
    protected originalY: number = 0;
    protected currentDisplayMode: CardDisplayMode = 'field';
    protected isDraggingDisabled: boolean = false;
    private previewMetadata: CardPreviewMetadata = {};
    private genericFaceImage?: GameObjects.Image;
    private genericFaceOriginal?: Array<{ object: VisibleCardPart; visible: boolean }>;
    private genericFaceRelease?: () => void;

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
        const shadow = this.scene.add.rectangle(6, 8, this.CARD_WIDTH, this.CARD_HEIGHT, sceneTheme.colors.shadow, 0.24);
        this.add(shadow);

        this.background = this.scene.add.rectangle(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, color, 0.98);
        this.background.setStrokeStyle(3, strokeColor, 0.82);
        this.add(this.background);

        const inner = this.scene.add.rectangle(
            0,
            8,
            this.CARD_WIDTH - 16,
            this.CARD_HEIGHT - 28,
            blendBattleColor(color, sceneTheme.colors.panelInner, 0.46),
            0.94,
        );
        inner.setStrokeStyle(1, blendBattleColor(strokeColor, sceneTheme.colors.parchmentSoft, 0.24), 0.24);
        this.add(inner);

        const banner = this.scene.add.rectangle(
            0,
            -this.CARD_HEIGHT / 2 + 25,
            this.CARD_WIDTH - 20,
            30,
            blendBattleColor(sceneTheme.colors.banner, strokeColor, 0.16),
            0.9,
        );
        banner.setStrokeStyle(1, strokeColor, 0.24);
        this.add(banner);

        // The procedural frame sits below card content and keeps the 4px pixel grid
        // visible without replacing the existing interactive background rectangle.
        const frame = this.scene.add.image(0, 0, cardFrameTexture(this.scene, strokeColor, color));
        frame.setScale(this.CARD_WIDTH / CARD_ART_W);
        this.add(frame);
    }

    /** Add a small procedural pixel portrait to non-unit cards. */
    protected addIconPortrait(icon: IconName): GameObjects.GameObject[] {
        const y = -10;
        const aura = this.scene.add.image(0, y, auraTexture(this.scene, this.getDefaultStrokeColor())).setScale(4);
        const image = this.scene.add.image(0, y, iconTexture(this.scene, icon)).setScale(4);
        this.add([aura, image]);
        this.scene.tweens.add({
            targets: image,
            y: y - 4,
            duration: 1100,
            yoyo: true,
            repeat: -1,
            ease: 'Stepped',
            easeParams: [2],
        });
        return [aura, image];
    }

    /**
     * 创建卡牌名称文本
     */
    protected createNameText(name: string, y: number = -110): void {
        this.nameText = this.scene.add.text(0, y, name, getBattleCardTextStyle('name', {
            wordWrap: { width: 148 },
        })).setOrigin(0.5);
        this.add(this.nameText);
    }

    protected createCardText(
        x: number,
        y: number,
        text: string,
        role: 'meta' | 'body' | 'support' | 'accent' | 'stat' | 'tiny',
        overrides: Phaser.Types.GameObjects.Text.TextStyle = {},
    ): GameObjects.Text {
        const textObject = this.scene.add.text(x, y, text, getBattleCardTextStyle(role, overrides)).setOrigin(0.5);
        this.add(textObject);

        return textObject;
    }

    protected createChip(
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: number,
        strokeColor: number,
        label: string,
        textStyle: Phaser.Types.GameObjects.Text.TextStyle,
    ): { background: GameObjects.Rectangle; text: GameObjects.Text } {
        const background = this.scene.add.rectangle(x, y, width, height, fillColor, 0.94);
        background.setStrokeStyle(1, strokeColor, 0.72);
        this.add(background);

        const text = this.scene.add.text(x, y, label, textStyle).setOrigin(0.5);
        this.add(text);

        return { background, text };
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

    /** Shared themed surface for non-unit card sprites; keeps their drag and preview behavior. */
    protected attachCardFace(card: { id: string; cardFace?: CardFaceAppearance }): void {
        this.genericFaceOriginal = this.list.filter(hasVisibility).map(object => ({ object, visible: object.visible }));
        this.genericFaceRelease?.();
        this.genericFaceRelease = watchCardFace(this.scene, card, key => {
            if (!this.active) return;
            this.genericFaceImage?.destroy();
            this.genericFaceImage = undefined;
            for (const { object, visible } of this.genericFaceOriginal ?? []) if (object.active) object.setVisible(visible);
            this.updateDisplayMode();
            if (key) {
                for (const { object } of this.genericFaceOriginal ?? []) if (object.active) object.setVisible(false);
                this.genericFaceImage = this.scene.add.image(0, 0, key).setDisplaySize(this.CARD_WIDTH, this.CARD_HEIGHT);
                this.addAt(this.genericFaceImage, 0);
            }
        });
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
        this.background.setStrokeStyle(4, sceneTheme.colors.goldSoft, 0.92);
        this.scene.events.emit('showCardPreview', this, this.getPreviewMetadata());
    }

    /**
     * 离开时的处理（子类可重写）
     */
    protected onPointerOut(): void {
        this.background.setStrokeStyle(3, this.getDefaultStrokeColor(), 0.82);
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

    public setPreviewMetadata(metadata: CardPreviewMetadata): void {
        this.previewMetadata = { ...metadata };
    }

    public getPreviewMetadata(): CardPreviewMetadata {
        return { ...this.previewMetadata };
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
        
        // 重新设置为非拖拽的交互模式，但保持 hit area
        if (this.input) {
            this.scene.input.setDraggable(this, false);
            this.input.cursor = 'pointer';
        }
    }

    /**
     * 设置卡片显示模式（子类需实现具体逻辑）
     * @param mode 显示模式
     */
    public setDisplayMode(mode: CardDisplayMode): void {
        this.currentDisplayMode = mode;
        this.updateDisplayMode();
        if (this.genericFaceImage) for (const { object } of this.genericFaceOriginal ?? []) if (object.active) object.setVisible(false);
    }

    public destroy(fromScene?: boolean): void {
        this.genericFaceRelease?.();
        this.genericFaceRelease = undefined;
        super.destroy(fromScene);
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
