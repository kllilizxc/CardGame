import { GameObjects, Scene } from 'phaser';
import type { PillSlot } from '../../managers/battle/PillManager';
import type { PillCard } from '@data/types/cards/pill';

/**
 * 丹药槽位UI组件
 * 显示玩家的丹药槽位，类似杀戮尖塔的药水瓶界面
 */
export class PillSlotUI extends GameObjects.Container {
    private slotContainers: GameObjects.Container[] = [];
    private slotBackgrounds: GameObjects.Rectangle[] = [];
    private pillIcons: GameObjects.Text[] = [];
    private pillNames: GameObjects.Text[] = [];
    private emptyTexts: GameObjects.Text[] = [];
    private onSlotClick: ((slotIndex: number) => void) | null = null;

    constructor(
        scene: Scene,
        x: number,
        y: number,
        onSlotClick?: (slotIndex: number) => void
    ) {
        super(scene, x, y);
        this.onSlotClick = onSlotClick || null;

        scene.add.existing(this);
        this.setDepth(100);

        // 监听槽位更新事件
        scene.events.on('pillSlotsUpdated', this.updateSlots, this);
    }

    /**
     * 创建槽位UI
     */
    public createSlots(slots: PillSlot[]): void {
        // 清空现有UI
        this.clearSlots();

        const slotSize = 70;
        const slotSpacing = 10;
        const startX = -(slots.length * (slotSize + slotSpacing)) / 2 + slotSize / 2;

        slots.forEach((slot, index) => {
            const slotX = startX + index * (slotSize + slotSpacing);
            const slotContainer = this.createSlot(slotX, 0, slot, index);
            this.slotContainers.push(slotContainer);
            this.add(slotContainer);
        });
    }

    /**
     * 创建单个槽位
     */
    private createSlot(
        x: number,
        y: number,
        slot: PillSlot,
        index: number
    ): GameObjects.Container {
        const container = this.scene.add.container(x, y);
        const slotSize = 70;

        // 槽位背景
        const bg = this.scene.add.rectangle(0, 0, slotSize, slotSize, 0x2f3a2f, 0.8);
        bg.setStrokeStyle(2, slot.isEmpty ? 0x555555 : 0x27ae60);
        container.add(bg);
        this.slotBackgrounds[index] = bg;

        // 空槽位提示
        const emptyText = this.scene.add.text(0, 0, '空', {
            fontSize: '14px',
            color: '#666666'
        }).setOrigin(0.5);
        emptyText.setVisible(slot.isEmpty);
        container.add(emptyText);
        this.emptyTexts[index] = emptyText;

        // 丹药图标（如果有）
        if (!slot.isEmpty && slot.pill) {
            const icon = this.scene.add.text(0, -5, '💊', {
                fontSize: '32px'
            }).setOrigin(0.5);
            container.add(icon);
            this.pillIcons[index] = icon;

            // 丹药名称（简短）
            const name = this.scene.add.text(0, 25, this.getShortName(slot.pill.name), {
                fontSize: '10px',
                color: '#2ecc71'
            }).setOrigin(0.5);
            container.add(name);
            this.pillNames[index] = name;
        }

        // 设置交互
        bg.setInteractive({ useHandCursor: true });
        
        // 点击使用丹药
        bg.on('pointerdown', () => {
            if (!slot.isEmpty && this.onSlotClick) {
                this.onSlotClick(index);
            }
        });

        // 悬停效果
        bg.on('pointerover', () => {
            if (!slot.isEmpty) {
                bg.setStrokeStyle(3, 0xffd700);
                container.setScale(1.1);
                
                // 显示详细信息
                if (slot.pill) {
                    this.showPillTooltip(slot.pill, x, y);
                }
            }
        });

        bg.on('pointerout', () => {
            bg.setStrokeStyle(2, slot.isEmpty ? 0x555555 : 0x27ae60);
            container.setScale(1.0);
            this.hidePillTooltip();
        });

        return container;
    }

    /**
     * 获取简短名称（最多4个字符）
     */
    private getShortName(name: string): string {
        if (name.length <= 4) return name;
        return name.substring(0, 4);
    }

    /**
     * 更新槽位显示
     */
    public updateSlots(slots: PillSlot[]): void {
        // 重新创建所有槽位
        this.createSlots(slots);
    }

    /**
     * 清空槽位UI
     */
    private clearSlots(): void {
        this.slotContainers.forEach(container => container.destroy());
        this.slotContainers = [];
        this.slotBackgrounds = [];
        this.pillIcons = [];
        this.pillNames = [];
        this.emptyTexts = [];
    }

    /**
     * 显示丹药详情提示
     */
    private showPillTooltip(pill: PillCard, x: number, y: number): void {
        // 发送事件到场景显示详细预览
        this.scene.events.emit('showPillTooltip', pill, this.x + x, this.y + y - 100);
    }

    /**
     * 隐藏丹药详情提示
     */
    private hidePillTooltip(): void {
        this.scene.events.emit('hidePillTooltip');
    }

    /**
     * 销毁时清理
     */
    public destroy(fromScene?: boolean): void {
        this.scene.events.off('pillSlotsUpdated', this.updateSlots, this);
        super.destroy(fromScene);
    }
}
