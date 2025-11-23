import type { Scene } from 'phaser';
import type { PillCard } from '../../../public/data/types/cards/pill';

/**
 * 丹药提示框 UI
 * 负责显示丹药的详细信息
 */
export class PillTooltipUI {
    private scene: Scene;
    private tooltip: Phaser.GameObjects.Container | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * 显示丹药提示框
     */
    public show(pill: PillCard, x: number, y: number): void {
        // 先隐藏旧的 tooltip
        this.hide();

        // 创建 tooltip 容器
        this.tooltip = this.scene.add.container(x, y);
        // 使用布局配置的深度
        const battleScene = this.scene as any;
        const depth = battleScene.layout?.depth?.pillTooltip ?? 7000;
        this.tooltip.setDepth(depth);

        // 背景
        const bgWidth = 250;
        const bgHeight = 180;
        const bg = this.scene.add.rectangle(0, 0, bgWidth, bgHeight, 0x1a1a2e, 0.95);
        bg.setStrokeStyle(3, 0x2ecc71);
        this.tooltip.add(bg);

        // 丹药图标
        const icon = this.scene.add.text(0, -60, '💊', {
            fontSize: '40px'
        }).setOrigin(0.5);
        this.tooltip.add(icon);

        // 丹药名称
        const nameText = this.scene.add.text(0, -25, pill.name, {
            fontSize: '18px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.tooltip.add(nameText);

        // 品级
        const gradeColors: { [key: string]: string } = {
            '下品': '#95a5a6',
            '中品': '#3498db',
            '上品': '#9b59b6',
            '极品': '#f39c12'
        };
        const gradeText = this.scene.add.text(0, 0, `品级：${pill.grade}`, {
            fontSize: '14px',
            color: gradeColors[pill.grade] || '#95a5a6'
        }).setOrigin(0.5);
        this.tooltip.add(gradeText);

        // 效果描述
        const descText = this.scene.add.text(0, 25, pill.description, {
            fontSize: '12px',
            color: '#ecf0f1',
            align: 'center',
            wordWrap: { width: bgWidth - 20 }
        }).setOrigin(0.5);
        this.tooltip.add(descText);

        // 目标说明
        if (pill.target) {
            const targetLabels: { [key: string]: string } = {
                'self': '自身',
                'singleAlly': '单个友方',
                'allAllies': '全体友方'
            };
            const targetText = this.scene.add.text(0, 60, `目标：${targetLabels[pill.target] || pill.target}`, {
                fontSize: '11px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.tooltip.add(targetText);
        }

        // 淡入动画
        this.tooltip.setAlpha(0);
        this.scene.tweens.add({
            targets: this.tooltip,
            alpha: 1,
            duration: 150,
            ease: 'Power2'
        });
    }

    /**
     * 隐藏丹药提示框
     */
    public hide(): void {
        if (this.tooltip) {
            const tooltipToHide = this.tooltip;
            this.tooltip = null;

            // 停止动画
            this.scene.tweens.killTweensOf(tooltipToHide);

            // 淡出并销毁
            this.scene.tweens.add({
                targets: tooltipToHide,
                alpha: 0,
                duration: 100,
                onComplete: () => {
                    tooltipToHide.destroy();
                }
            });
        }
    }

    /**
     * 销毁
     */
    public destroy(): void {
        this.hide();
    }
}
