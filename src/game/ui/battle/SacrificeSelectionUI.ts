import { GameObjects, Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import { createSceneButton, createScenePanel, getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import { battleColorToHex, battleTheme, createBattleOverlay } from './battleTheme';

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
    private confirmButtonBackground!: GameObjects.Rectangle;
    private unitOriginalDepths: Map<CardSprite, number> = new Map();
    
    private availableUnits: CardSprite[] = [];
    private selectedUnits: CardSprite[] = [];
    private requiredCount: number = 0;
    private unitHighlights: Map<CardSprite, GameObjects.Graphics> = new Map();
    private unitOverlays: Map<CardSprite, GameObjects.Rectangle> = new Map();
    
    private onConfirm: ((selected: CardSprite[]) => void) | null = null;
    private onCancel: (() => void) | null = null;

    constructor(scene: Scene) {
        super(scene, 0, 0);
        
        const { width, height } = scene.scale;

        this.background = createBattleOverlay(scene, 0.84);
        // 必须设置交互，否则用户可以继续操作其他卡牌
        this.background.setInteractive();
        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // 阻止事件传播，但不做任何操作
            pointer.event.stopPropagation();
        });
        this.add(this.background);

        const panelY = height * 0.14;
        const panelObjects = createScenePanel(scene, {
            x: width / 2,
            y: panelY,
            width: Math.min(860, width * 0.7),
            height: 170,
        });
        this.add(panelObjects);

        // 标题
        this.titleText = scene.add.text(width / 2, panelY - 28, '献祭召唤', getSceneTextStyle('panelTitle', {
            fontSize: '38px',
            color: battleColorToHex(sceneTheme.colors.goldSoft),
        })).setOrigin(0.5);
        this.add(this.titleText);

        // 说明文字
        this.instructionText = scene.add.text(
            width / 2,
            panelY + 18,
            '请选择要献祭的单位',
            getSceneTextStyle('support', {
                fontSize: '20px',
                color: battleTheme.colors.textBody,
                align: 'center',
                wordWrap: { width: Math.min(760, width * 0.62) },
            }),
        ).setOrigin(0.5);
        this.add(this.instructionText);

        // 确认按钮
        this.confirmButton = this.createButton(
            width / 2 - 100,
            height * 0.85,
            '确认献祭',
            '选满后执行',
            'primary',
            () => this.handleConfirm()
        );
        this.add(this.confirmButton);

        // 取消按钮
        this.cancelButton = this.createButton(
            width / 2 + 100,
            height * 0.85,
            '取消',
            '返回斗法',
            'secondary',
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
        description: string,
        variant: 'primary' | 'secondary',
        onClick: () => void
    ): GameObjects.Container {
        const button = createSceneButton(this.scene, {
            x,
            y,
            width: 176,
            height: 64,
            label: text,
            description,
            variant,
            onClick,
        });

        const container = this.scene.add.container(0, 0, button.objects);
        if (text === '确认献祭') {
            this.confirmButtonBackground = button.background;
        }

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
     * 使用透明遮罩层来处理点击，避免干扰卡牌原有的事件
     */
    private setupUnitSelection(): void {
        // 清除之前的高亮和遮罩
        this.unitHighlights.forEach(highlight => highlight.destroy());
        this.unitHighlights.clear();
        this.unitOverlays.forEach(overlay => overlay.destroy());
        this.unitOverlays.clear();
        this.unitOriginalDepths.clear();

        this.availableUnits.forEach(unit => {
            this.unitOriginalDepths.set(unit, unit.depth);
            // 提升单位深度到UI之上
            unit.setDepth(5001);
            
            // 获取卡牌的原始尺寸（不受scale影响）
            const cardWidth = unit.width;
            const cardHeight = unit.height;
            
            // 创建透明遮罩层（完全透明，但可交互）
            const overlay = this.scene.add.rectangle(
                unit.x,
                unit.y,
                cardWidth,
                cardHeight,
                0xffffff,
                0.001 // 几乎完全透明，但必须有一点alpha才能交互
            );
            overlay.setDepth(5002); // 在卡牌之上
            overlay.setInteractive({ useHandCursor: true });
            
            // 遮罩层点击事件
            overlay.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                pointer.event?.stopPropagation();
                this.toggleUnitSelection(unit);
            });
            
            // 遮罩层悬停事件
            overlay.on('pointerover', () => {
                if (!this.selectedUnits.includes(unit)) {
                    this.highlightUnit(unit, sceneTheme.colors.goldSoft, 0.62);
                }
            });
            
            overlay.on('pointerout', () => {
                if (!this.selectedUnits.includes(unit)) {
                    this.removeHighlight(unit);
                }
            });
            
            // 保存遮罩层引用
            this.unitOverlays.set(unit, overlay);
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
            this.highlightUnit(unit, sceneTheme.colors.goldSoft, 0.62);
        } else {
            // 选择单位
            if (this.selectedUnits.length < this.requiredCount) {
                // 还没选满，直接添加
                this.selectedUnits.push(unit);
                this.highlightUnit(unit, battleTheme.colors.dangerSoft, 0.9);
            } else {
                // 已经选满，移除第一个选择的单位，添加新的
                const firstSelected = this.selectedUnits.shift();
                if (firstSelected) {
                    // 恢复第一个单位的高亮为未选中状态
                    this.removeHighlight(firstSelected);
                }
                // 添加新选择的单位
                this.selectedUnits.push(unit);
                this.highlightUnit(unit, battleTheme.colors.dangerSoft, 0.9);
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

        // 获取卡牌的原始尺寸（不受scale影响）
        const cardWidth = unit.width;
        const cardHeight = unit.height;
        
        const highlight = this.scene.add.graphics();
        highlight.lineStyle(4, color, alpha);
        // 使用固定的内边距，确保所有卡牌高亮宽度一致
        const width = cardWidth;
        const height = cardHeight;
        
        highlight.strokeRoundedRect(
            unit.x - width / 2,
            unit.y - height / 2,
            width,
            height,
            8
        );
        highlight.setDepth(5003); // 高亮在遮罩层之上

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
        
        if (canConfirm) {
            this.confirmButtonBackground.setFillStyle(sceneTheme.colors.ember, 0.96);
            this.confirmButtonBackground.setStrokeStyle(2, sceneTheme.colors.goldSoft, 0.68);
            if (this.confirmButtonBackground.input) {
                this.confirmButtonBackground.input.enabled = true;
            }
        } else {
            this.confirmButtonBackground.setFillStyle(0x403730, 0.86);
            this.confirmButtonBackground.setStrokeStyle(2, 0x9f9687, 0.28);
            if (this.confirmButtonBackground.input) {
                this.confirmButtonBackground.input.enabled = false;
            }
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

        // 清除所有遮罩层
        this.unitOverlays.forEach(overlay => overlay.destroy());
        this.unitOverlays.clear();

        // 恢复单位原始深度（不需要移除事件监听器，因为我们没有修改卡牌的事件）
        this.availableUnits.forEach(unit => {
            unit.setDepth(this.unitOriginalDepths.get(unit) ?? 0);
        });

        this.availableUnits = [];
        this.selectedUnits = [];
        this.unitOriginalDepths.clear();
    }

    /**
     * 销毁时清理
     */
    public destroy(fromScene?: boolean): void {
        this.hide();
        super.destroy(fromScene);
    }
}
