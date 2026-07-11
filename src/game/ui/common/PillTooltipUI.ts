import type { Scene } from 'phaser';
import type { PillCard } from '../../../../public/data/types/cards/pill';
import { battleTheme, blendBattleColor } from '../battle/battleTheme';
import { sceneTheme } from '../../scenes/shared/sceneTheme';

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
        const bgWidth = 320;
        const bgHeight = pill.target ? 256 : 228;
        const shadow = this.scene.add.rectangle(8, 10, bgWidth, bgHeight, sceneTheme.colors.shadow, 0.22);
        const bg = this.scene.add.rectangle(0, 0, bgWidth, bgHeight, sceneTheme.colors.panel, 0.96);
        bg.setStrokeStyle(2, sceneTheme.colors.gold, 0.68);
        const inner = this.scene.add.rectangle(
            0,
            12,
            bgWidth - 20,
            bgHeight - 30,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.1),
            0.96,
        );
        inner.setStrokeStyle(1, sceneTheme.colors.jadeBright, 0.22);
        const banner = this.scene.add.rectangle(
            0,
            -bgHeight / 2 + 30,
            bgWidth - 28,
            40,
            blendBattleColor(sceneTheme.colors.banner, sceneTheme.colors.jade, 0.16),
            0.9,
        );
        banner.setStrokeStyle(1, sceneTheme.colors.goldSoft, 0.24);
        this.tooltip.add([shadow, bg, inner, banner]);

        // 丹药图标
        const icon = this.scene.add.text(0, -76, '丹', {
            fontFamily: sceneTheme.fonts.display,
            fontSize: '36px',
            color: battleTheme.colors.textPositive,
        }).setOrigin(0.5);
        this.tooltip.add(icon);

        // 丹药名称
        const nameText = this.scene.add.text(0, -34, pill.name, {
            fontFamily: sceneTheme.fonts.display,
            fontSize: '28px',
            color: battleTheme.colors.textPrimary,
        }).setOrigin(0.5);
        this.tooltip.add(nameText);

        // 品级
        const gradeColors: { [key: string]: string } = {
            下品: battleTheme.colors.textMuted,
            中品: '#8cb6d8',
            上品: '#d8c08c',
            极品: battleTheme.colors.textPositive,
        };
        const gradeText = this.scene.add.text(0, 2, `品级：${pill.grade}`, {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: gradeColors[pill.grade] || battleTheme.colors.textMuted,
        }).setOrigin(0.5);
        this.tooltip.add(gradeText);

        // 效果描述
        const descText = this.scene.add.text(0, 52, pill.description, {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: battleTheme.colors.textBody,
            align: 'center',
            wordWrap: { width: bgWidth - 48 },
        }).setOrigin(0.5);
        this.tooltip.add(descText);

        // 目标说明
        if (pill.target) {
            const targetLabels: { [key: string]: string } = {
                self: '自身',
                player: '玩家',
                unit: '单个单位',
                all: '全部目标',
                singleAlly: '单个友方',
                allyUnits: '全体友方',
                singleEnemy: '单个敌方',
                enemyUnits: '全体敌方',
                allUnits: '全部单位',
            };
            const targetText = this.scene.add.text(0, 102, `目标：${targetLabels[pill.target] || pill.target}`, {
                fontFamily: sceneTheme.fonts.ui,
                fontSize: '18px',
                color: battleTheme.colors.textSupport,
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
