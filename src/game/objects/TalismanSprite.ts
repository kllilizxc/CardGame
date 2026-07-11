import { GameObjects } from 'phaser';
import type { TalismanCard } from '../../../data/types/cards/talisman';
import { BaseCardSprite } from './BaseCardSprite';
import {
    battleColorToHex,
    battleTheme,
    blendBattleColor,
    getBattleCardPalette,
    getBattleCardTextStyle,
} from '../ui/battle/battleTheme';
import { sceneTheme } from '../scenes/shared/sceneTheme';

export class TalismanSprite extends BaseCardSprite {
    private readonly palette = getBattleCardPalette('talisman');
    private cardData: TalismanCard;
    private descriptionText: GameObjects.Text;
    private iconObjects: GameObjects.GameObject[] = [];
    private summaryObjects: GameObjects.GameObject[] = [];

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: TalismanCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景（符箓卡用紫色边框）
        this.createBackground(this.palette.shell, this.palette.border);

        // 创建名称
        this.createNameText(cardData.name, -104);

        // 类型标签
        const typeLabel = cardData.isInstant ? '符箓·即时' : `符箓·${cardData.duration}回合`;
        this.createCardText(0, -84, typeLabel, 'meta', {
            fontSize: '18px',
            color: battleColorToHex(this.palette.accent),
        });

        // 图标占位符
        const iconBox = scene.add.rectangle(0, -14, 122, 122, this.palette.iconFill, 0.92);
        iconBox.setStrokeStyle(1, this.palette.accent, 0.24);
        this.add(iconBox);
        const iconText = scene.add.text(0, -16, '符', getBattleCardTextStyle('name', {
            fontSize: '40px',
            color: battleColorToHex(this.palette.accentSoft),
        })).setOrigin(0.5);
        this.add(iconText);
        this.iconObjects.push(iconBox, iconText);

        // 效果描述
        const effectDesc = this.getEffectDescription();
        const effectChip = this.createChip(
            0,
            62,
            146,
            34,
            blendBattleColor(sceneTheme.colors.ink, battleTheme.colors.danger, 0.52),
            this.palette.accentSoft,
            effectDesc,
            getBattleCardTextStyle('accent', {
                fontSize: '18px',
                color: battleColorToHex(this.palette.accentSoft),
            }),
        );
        this.summaryObjects.push(effectChip.background, effectChip.text);

        // 描述文字（默认隐藏）
        this.descriptionText = this.scene.add.text(0, 56, cardData.description, getBattleCardTextStyle('support', {
            fontSize: '18px',
            color: this.palette.supportText,
            align: 'center',
            wordWrap: { width: 148 },
        })).setOrigin(0.5);
        this.descriptionText.setVisible(false);
        this.add(this.descriptionText);

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置符箓卡专用的拖拽事件（使用统一的拖拽逻辑 + 自定义钩子）
        this.setupDragEvents({
            onDragStart: () => {
                // 通知场景开始拖拽符箓
                this.scene.events.emit('talismanDragStart', this);
            },
            onDragging: (pointer: Phaser.Input.Pointer) => {
                // 通知场景更新目标高亮（持续检测目标）
                this.scene.events.emit('talismanDragging', this, pointer);
            },
            onDragEnd: () => {
                // 通知场景结束拖拽
                this.scene.events.emit('talismanDragEnd', this);

                // 通知场景尝试使用符箓
                this.scene.events.emit('tryUseTalisman', this);
            },
            emitSceneEvents: false,
        });
    }

    private getEffectDescription(): string {
        if (!this.cardData.effects || this.cardData.effects.length === 0) {
            return '无效果';
        }

        const effect = this.cardData.effects[0];
        if (!effect.actions || effect.actions.length === 0) {
            return effect.text || '无效果';
        }

        const action = effect.actions[0];
        if (action.type === 'modifyHealth' && action.value !== undefined) {
            const damage = Math.abs(action.value);
            return `造成${damage}点伤害`;
        }
        if (action.type === 'modifyAttack' && action.value !== undefined) {
            return `攻击力${action.value > 0 ? '+' : ''}${action.value}`;
        }
        if (action.type === 'applyStatus') {
            return '施加状态';
        }

        return effect.text || '特殊效果';
    }

    protected getDefaultStrokeColor(): number {
        return this.palette.border;
    }

    public getCardData(): TalismanCard {
        return this.cardData;
    }

    protected updateDisplayMode(): void {
        const showExpandedDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(showExpandedDescription);
        this.iconObjects.forEach((object) => object.setVisible(!showExpandedDescription));
        this.summaryObjects.forEach((object) => object.setVisible(!showExpandedDescription));
    }
}
