import { GameObjects, Scene } from 'phaser';
import type { PillSlot } from '../../managers/battle/PillManager';
import type { PillCard } from '../../../data/types/cards/pill';
import { getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import { battleColorToHex, battleTheme, blendBattleColor } from './battleTheme';

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
    
    private slots: PillSlot[] = [];
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
        this.setDepth(140);

        // 监听槽位更新事件
        scene.events.on('pillSlotsUpdated', this.updateSlots, this);
    }

    /**
     * 创建槽位UI
     */
    public createSlots(slots: PillSlot[]): void {
        this.slots = slots;

        // 清空现有UI
        this.clearSlots();

        const slotSize = 90;
        const slotSpacing = 16;
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
        const slotSize = 90;
        const accent = slot.isEmpty ? sceneTheme.colors.parchmentSoft : battleTheme.colors.positiveSoft;
        const fill = slot.isEmpty
            ? blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.slate, 0.18)
            : blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.28);
        const hoverFill = slot.isEmpty
            ? blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.slate, 0.26)
            : blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jadeBright, 0.34);

        const shadow = this.scene.add.rectangle(4, 6, slotSize, slotSize, sceneTheme.colors.shadow, 0.22);
        container.add(shadow);

        const bg = this.scene.add.rectangle(0, 0, slotSize, slotSize, fill, 0.96);
        bg.setStrokeStyle(2, accent, slot.isEmpty ? 0.28 : 0.68);
        container.add(bg);

        const sheen = this.scene.add.rectangle(
            0,
            -slotSize / 2 + 12,
            slotSize - 12,
            14,
            blendBattleColor(sceneTheme.colors.banner, accent, 0.12),
            0.72,
        );
        sheen.setStrokeStyle(1, accent, 0.22);
        container.add(sheen);
        this.slotBackgrounds[index] = bg;

        // 空槽位提示
        const emptyText = this.scene.add.text(0, 2, '空囊', getSceneTextStyle('panelEyebrow', {
            fontSize: '18px',
            color: battleTheme.colors.textMuted,
        })).setOrigin(0.5);
        emptyText.setVisible(slot.isEmpty);
        container.add(emptyText);
        this.emptyTexts[index] = emptyText;

        // 丹药图标（如果有）
        if (!slot.isEmpty && slot.pill) {
            const icon = this.scene.add.text(0, -10, '丹', {
                fontFamily: sceneTheme.fonts.display,
                fontSize: '30px',
                color: battleTheme.colors.textPositive,
            }).setOrigin(0.5);
            container.add(icon);
            this.pillIcons[index] = icon;

            // 丹药名称（简短）
            const name = this.scene.add.text(0, 25, this.getShortName(slot.pill.name), {
                ...getSceneTextStyle('panelEyebrow', {
                    fontSize: '18px',
                    color: battleColorToHex(battleTheme.colors.positiveSoft),
                }),
                wordWrap: { width: slotSize - 18 },
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
                bg.setFillStyle(hoverFill, 1);
                bg.setStrokeStyle(3, sceneTheme.colors.goldSoft, 0.92);
                container.setScale(1.06);
                
                // 显示详细信息
                if (slot.pill) {
                    this.showPillTooltip(slot.pill, x, y);
                }
            }
        });

        bg.on('pointerout', () => {
            bg.setFillStyle(fill, 0.96);
            bg.setStrokeStyle(2, accent, slot.isEmpty ? 0.28 : 0.68);
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
        this.slots = slots;
        
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
        this.scene.events.emit('showPillTooltip', pill, this.x + x, this.y + y - 104);
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
