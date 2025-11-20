import { GameObjects, Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';

/**
 * 献祭选择UI
 * 让玩家选择要献祭的单位
 */
export class SacrificeSelectionUI extends GameObjects.Container {
    private background: GameObjects.Rectangle;
    private titleText: GameObjects.Text;
    private instructionText: GameObjects.Text;
    private confirmButton: GameObjects.Container;
    private cancelButton: GameObjects.Container;
    
    private availableUnits: CardSprite[] = [];
    private selectedUnits: CardSprite[] = [];
    private requiredCount: number = 0;
    private unitHighlights: Map<CardSprite, GameObjects.Graphics> = new Map();
    
    private onConfirm: ((selected: CardSprite[]) => void) | null = null;
    private onCancel: (() => void) | null = null;

    constructor(scene: Scene) {
        super(scene, 0, 0);
        
        const { width, height } = scene.scale;
        
        // 半透明黑色背景（设置交互以阻止穿透到UI下层）
        this.background = scene.add.rectangle(
            width / 2,
            height / 2,
            width,
            height,
            0x000000,
            0.8
        );
        // 必须设置交互，否则用户可以继续操作其他卡牌
        this.background.setInteractive();
        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 阻止事件传播，但不做任何操作
            pointer.event.stopPropagation();
        });
        this.add(this.background);

        // 标题
        this.titleText = scene.add.text(width / 2, height * 0.2, '献祭召唤', {
            fontSize: '32px',
            color: '#9b59b6',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.titleText);

        // 说明文字
        this.instructionText = scene.add.text(
            width / 2,
            height * 0.28,
            '请选择要献祭的单位',
            {
                fontSize: '18px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);
        this.add(this.instructionText);

        // 确认按钮
        this.confirmButton = this.createButton(
            width / 2 - 100,
            height * 0.75,
            '确认献祭',
            () => this.handleConfirm()
        );
        this.add(this.confirmButton);

        // 取消按钮
        this.cancelButton = this.createButton(
            width / 2 + 100,
            height * 0.75,
            '取消',
            () => this.handleCancel()
        );
        this.add(this.cancelButton);

        this.setDepth(5000);
        this.setVisible(false);
        scene.add.existing(this);
    }

    /**
     * 创建按钮
     */
    private createButton(
        x: number,
        y: number,
        text: string,
        onClick: () => void
    ): GameObjects.Container {
        const container = this.scene.add.container(x, y);

        const bg = this.scene.add.rectangle(0, 0, 150, 50, 0x2c3e50);
        bg.setStrokeStyle(2, 0xffffff);
        bg.setInteractive({ useHandCursor: true });
        container.add(bg);

        const label = this.scene.add.text(0, 0, text, {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);
        container.add(label);

        bg.on('pointerover', () => {
            bg.setFillStyle(0x34495e);
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(0x2c3e50);
        });

        bg.on('pointerdown', onClick);

        return container;
    }

    /**
     * 显示献祭选择界面
     */
    public show(
        availableUnits: CardSprite[],
        requiredCount: number,
        onConfirm: (selected: CardSprite[]) => void,
        onCancel: () => void
    ): void {
        this.availableUnits = availableUnits;
        this.selectedUnits = [];
        this.requiredCount = requiredCount;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;

        this.instructionText.setText(
            `请选择${requiredCount}只要献祭的单位 (${this.selectedUnits.length}/${requiredCount})`
        );

        this.setVisible(true);
        this.setupUnitSelection();
        this.updateConfirmButton();
    }

    /**
     * 设置单位选择交互
     */
    private setupUnitSelection(): void {
        // 清除之前的高亮
        this.unitHighlights.forEach(highlight => highlight.destroy());
        this.unitHighlights.clear();

        this.availableUnits.forEach(unit => {
            // 提升单位深度到UI之上，确保可点击
            unit.setDepth(5001);
            
            // 禁用拖拽（保留input配置）
            (unit.input as any).draggable = false;
            
            // 添加献祭选择专用的点击事件（使用once确保只触发一次，用prependListener确保优先级最高）
            const sacrificeClickHandler = (pointer: Phaser.Input.Pointer) => {
                // 阻止默认行为和事件传播
                if (pointer.event) {
                    pointer.event.stopPropagation();
                    pointer.event.preventDefault();
                }
                this.toggleUnitSelection(unit);
            };
            
            const hoverHandler = () => {
                if (!this.selectedUnits.includes(unit)) {
                    this.highlightUnit(unit, 0xffd700, 0.5);
                }
            };
            
            const outHandler = () => {
                if (!this.selectedUnits.includes(unit)) {
                    this.removeHighlight(unit);
                }
            };
            
            // 保存处理器以便后续移除
            (unit as any).__sacrificeHandlers = {
                click: sacrificeClickHandler,
                hover: hoverHandler,
                out: outHandler
            };
            
            // 添加事件监听
            unit.on('pointerdown', sacrificeClickHandler, unit);
            unit.on('pointerover', hoverHandler, unit);
            unit.on('pointerout', outHandler, unit);
        });
    }

    /**
     * 切换单位选择状态
     */
    private toggleUnitSelection(unit: CardSprite): void {
        const index = this.selectedUnits.indexOf(unit);
        
        if (index > -1) {
            // 取消选择
            this.selectedUnits.splice(index, 1);
            this.highlightUnit(unit, 0xffd700, 0.5); // 悬停色
        } else {
            // 选择单位
            if (this.selectedUnits.length < this.requiredCount) {
                this.selectedUnits.push(unit);
                this.highlightUnit(unit, 0x9b59b6, 0.8); // 紫色选中
            }
        }

        this.instructionText.setText(
            `请选择${this.requiredCount}只要献祭的单位 (${this.selectedUnits.length}/${this.requiredCount})`
        );

        this.updateConfirmButton();
    }

    /**
     * 高亮单位
     */
    private highlightUnit(unit: CardSprite, color: number, alpha: number): void {
        this.removeHighlight(unit);

        const bounds = unit.getBounds();
        const highlight = this.scene.add.graphics();
        highlight.lineStyle(4, color, alpha);
        highlight.strokeRoundedRect(
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            8
        );
        highlight.setDepth(5002); // 高亮在卡片之上

        this.unitHighlights.set(unit, highlight);
    }

    /**
     * 移除高亮
     */
    private removeHighlight(unit: CardSprite): void {
        const highlight = this.unitHighlights.get(unit);
        if (highlight) {
            highlight.destroy();
            this.unitHighlights.delete(unit);
        }
    }

    /**
     * 更新确认按钮状态
     */
    private updateConfirmButton(): void {
        const canConfirm = this.selectedUnits.length === this.requiredCount;
        const buttonBg = this.confirmButton.list[0] as GameObjects.Rectangle;
        
        if (canConfirm) {
            buttonBg.setFillStyle(0x27ae60);
        } else {
            buttonBg.setFillStyle(0x95a5a6);
        }
    }

    /**
     * 确认献祭
     */
    private handleConfirm(): void {
        if (this.selectedUnits.length !== this.requiredCount) {
            return;
        }

        // 保存选中的单位（hide会清空）
        const selected = [...this.selectedUnits];
        
        this.hide();

        if (this.onConfirm) {
            this.onConfirm(selected);
        }
    }

    /**
     * 取消献祭
     */
    private handleCancel(): void {
        this.hide();

        if (this.onCancel) {
            this.onCancel();
        }
    }

    /**
     * 隐藏界面
     */
    public hide(): void {
        this.setVisible(false);

        // 清除所有高亮
        this.unitHighlights.forEach(highlight => highlight.destroy());
        this.unitHighlights.clear();

        // 移除单位的交互监听并恢复深度和拖拽功能
        this.availableUnits.forEach(unit => {
            // 移除献祭UI添加的监听器
            const handlers = (unit as any).__sacrificeHandlers;
            if (handlers) {
                unit.off('pointerdown', handlers.click, unit);
                unit.off('pointerover', handlers.hover, unit);
                unit.off('pointerout', handlers.out, unit);
                delete (unit as any).__sacrificeHandlers;
            }
            
            // 恢复单位原始深度
            unit.setDepth(0);
            
            // 恢复拖拽功能
            if (unit.input) {
                (unit.input as any).draggable = true;
            }
        });

        this.availableUnits = [];
        this.selectedUnits = [];
    }

    /**
     * 销毁时清理
     */
    public destroy(fromScene?: boolean): void {
        this.hide();
        super.destroy(fromScene);
    }
}
