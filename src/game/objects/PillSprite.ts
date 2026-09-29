import { GameObjects } from 'phaser';
import type { PillCard } from '@data/types/cards/pill';
import { BaseCardSprite } from './BaseCardSprite';
import { CardEffectFormatter } from '../utils/CardEffectFormatter';
import {
    battleColorToHex,
    getBattleCardPalette,
    getBattleCardTextStyle,
} from '../ui/battle/battleTheme';

/**
 * 丹药卡精灵类
 * 丹药是一次性消耗道具，类似杀戮尖塔的药水
 */
export class PillSprite extends BaseCardSprite {
    private readonly palette = getBattleCardPalette('pill');
    private cardData: PillCard;
    private effectText: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private iconObjects: GameObjects.GameObject[] = [];
    private summaryObjects: GameObjects.GameObject[] = [];

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: PillCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（丹药卡用青色/绿色边框，表示药物/回复属性）
        this.createBackground(this.palette.shell, this.palette.border);

        // 创建名称
        this.createNameText(cardData.name, -104);

        // 品阶显示
        const gradeLabel = this.getGradeLabel(cardData.grade);
        this.createCardText(0, -84, gradeLabel, 'meta', {
            fontSize: '18px',
            color: battleColorToHex(this.palette.accent),
        });

        // 丹药图标
        this.iconObjects.push(...this.addIconPortrait('pill'));

        // 目标范围显示
        const targetLabel = this.getTargetLabel();
        const targetText = this.createCardText(0, 46, targetLabel, 'meta', {
            fontSize: '18px',
            color: this.palette.supportText,
            fontStyle: 'italic',
        });
        this.summaryObjects.push(targetText);

        // 效果描述（简短）
        const effectDesc = CardEffectFormatter.formatShort(cardData.effects);
        this.effectText = this.scene.add.text(0, 72, effectDesc, getBattleCardTextStyle('body', {
            fontSize: '18px',
            color: this.palette.bodyText,
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 148 },
        })).setOrigin(0.5);
        this.add(this.effectText);
        this.summaryObjects.push(this.effectText);

        // 持续时间显示（如果有）
        if (cardData.duration && cardData.duration > 0) {
            const durationText = this.createCardText(0, 100, `持续 ${cardData.duration} 回合`, 'tiny', {
                fontSize: '18px',
                color: battleColorToHex(this.palette.accentSoft),
            });
            this.summaryObjects.push(durationText);
        }

        // 描述文字（默认隐藏，预览时显示）
        this.descriptionText = scene.add.text(0, 58, cardData.description, getBattleCardTextStyle('support', {
            fontSize: '18px',
            color: this.palette.supportText,
            align: 'center',
            wordWrap: { width: 150 },
        })).setOrigin(0.5);
        this.descriptionText.setVisible(false);
        this.add(this.descriptionText);

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置丹药专用拖拽事件
        this.setupDragEvents({
            onDragEnd: () => {
                this.scene.events.emit('tryUsePill', this);
            },
            emitSceneEvents: false,
        });
        this.attachCardFace(cardData);
    }

    private getGradeLabel(grade: number): string {
        const gradeNames = ['', '一品', '二品', '三品', '四品', '五品', '六品', '七品', '八品', '九品'];
        return `${gradeNames[grade] || grade}丹药`;
    }

    private getTargetLabel(): string {
        const target = this.cardData.target;
        const targetMap: Record<string, string> = {
            player: '→ 玩家',
            unit: '→ 单个单位',
            all: '→ 全体目标',
            singleAlly: '→ 单个友方',
            singleEnemy: '→ 单个敌方',
            allyUnits: '→ 全体友方',
            enemyUnits: '→ 全体敌方',
            allUnits: '→ 全部单位',
            self: '→ 自身',
        };
        return targetMap[target] || '→ 目标';
    }

    protected getDefaultStrokeColor(): number {
        return this.palette.border;
    }

    public getCardData(): PillCard {
        return this.cardData;
    }

    protected updateDisplayMode(): void {
        const showExpandedDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(showExpandedDescription);
        this.iconObjects.forEach((object) => (object as GameObjects.GameObject & { setVisible(visible: boolean): unknown }).setVisible(!showExpandedDescription));
        this.summaryObjects.forEach((object) => (object as GameObjects.GameObject & { setVisible(visible: boolean): unknown }).setVisible(!showExpandedDescription));
    }
}
