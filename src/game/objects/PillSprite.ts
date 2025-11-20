import { GameObjects } from 'phaser';
import type { PillCard } from '../../../data/types/cards/pill';
import { BaseCardSprite } from './BaseCardSprite';
import { CardEffectFormatter } from '../utils/CardEffectFormatter';

/**
 * 丹药卡精灵类
 * 丹药是一次性消耗道具，类似杀戮尖塔的药水
 */
export class PillSprite extends BaseCardSprite {
    private cardData: PillCard;
    private gradeText: GameObjects.Text;
    private effectText: GameObjects.Text;
    private targetText: GameObjects.Text;
    private descriptionText: GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: PillCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（丹药卡用青色/绿色边框，表示药物/回复属性）
        this.createBackground(0x2f3a2f, 0x27ae60);

        // 创建名称
        this.createNameText(cardData.name);

        // 品阶显示
        const gradeLabel = this.getGradeLabel(cardData.grade);
        this.gradeText = scene.add.text(0, -85, gradeLabel, {
            fontSize: '14px',
            color: '#27ae60'
        }).setOrigin(0.5);
        this.add(this.gradeText);

        // 丹药图标
        const iconBox = scene.add.rectangle(0, -20, 120, 120, 0x3a4a3a);
        this.add(iconBox);
        const iconText = scene.add.text(0, -20, '💊', {
            fontSize: '48px'
        }).setOrigin(0.5);
        this.add(iconText);

        // 目标范围显示
        const targetLabel = this.getTargetLabel();
        this.targetText = scene.add.text(0, 45, targetLabel, {
            fontSize: '12px',
            color: '#95a5a6',
            fontStyle: 'italic'
        }).setOrigin(0.5);
        this.add(this.targetText);

        // 效果描述（简短）
        const effectDesc = CardEffectFormatter.formatShort(cardData.effects);
        this.effectText = scene.add.text(0, 65, effectDesc, {
            fontSize: '13px',
            color: '#2ecc71',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 150 }
        }).setOrigin(0.5);
        this.add(this.effectText);

        // 持续时间显示（如果有）
        if (cardData.duration && cardData.duration > 0) {
            const durationText = scene.add.text(0, 95, `持续${cardData.duration}回合`, {
                fontSize: '11px',
                color: '#f39c12'
            }).setOrigin(0.5);
            this.add(durationText);
        }

        // 描述文字（默认隐藏，预览时显示）
        this.descriptionText = scene.add.text(0, 110, cardData.description, {
            fontSize: '10px',
            color: '#bdc3c7',
            align: 'center',
            wordWrap: { width: 160 }
        }).setOrigin(0.5);
        this.descriptionText.setVisible(false);
        this.add(this.descriptionText);

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置丹药专用拖拽事件
        this.setupDragEvents({
            onDragEnd: () => {
                // 通知场景尝试使用丹药
                this.scene.events.emit('tryUsePill', this);
            },
            emitSceneEvents: false // 丹药使用自己的事件
        });
    }

    /**
     * 获取品阶标签
     */
    private getGradeLabel(grade: number): string {
        const gradeNames = ['', '一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品'];
        return `${gradeNames[grade] || grade}丹药`;
    }

    /**
     * 获取目标范围标签
     */
    private getTargetLabel(): string {
        const target = this.cardData.target;
        const targetMap: Record<string, string> = {
            'player': '→ 玩家',
            'singleAlly': '→ 单个友方',
            'singleEnemy': '→ 单个敌方',
            'allyUnits': '→ 全体友方',
            'enemyUnits': '→ 全体敌方',
            'allUnits': '→ 全部单位',
            'self': '→ 自身'
        };
        return targetMap[target] || '→ 目标';
    }

    protected getDefaultStrokeColor(): number {
        return 0x27ae60; // 绿色边框
    }

    public getCardData(): PillCard {
        return this.cardData;
    }

    public showDescription(show: boolean): void {
        this.descriptionText.setVisible(show);
    }
}
