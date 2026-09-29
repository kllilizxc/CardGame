import { WenxinUnitView } from '../art/wenxin/WenxinUnitView';
import { unitArt, UNIT_ART, type BattleSide } from '../art/wenxin/presentation';
import { C, T } from '../art/palette';
import { iconTexture, STATUS_ICON } from '../art/sprites';
import { GameObjects } from 'phaser';
import type { UnitCard } from '@data/types/cards/unit';
import type { Gongfa } from '@data/types/gongfa';
import type { StatusInstance } from '@data/types/status';
import { BaseCardSprite } from './BaseCardSprite';
import {
    battleColorToHex,
    battleTheme,
    blendBattleColor,
    getBattleCardPalette,
    getBattleCardTextStyle,
} from '../ui/battle/battleTheme';
import { sceneTheme } from '../scenes/shared/sceneTheme';
import { GongfaTooltip } from '../ui/common/GongfaTooltip';
import { describeGongfa } from '../utils/GongfaDescriptionBuilder';
import { getUnitStar, getRealmConfig } from '../utils/RealmHelper';
import { getStatusCategoryColor, getStatusFullDescription } from '../utils/StatusHelper';
import { selectedCardFace, watchCardFace } from './cardFaceAppearance';
import { isPortraitGameViewport } from '../layout/gameViewport';

export class CardSprite extends BaseCardSprite {
    public battleView?: WenxinUnitView;
    private cardVisibility = new Map<GameObjects.GameObject, boolean>();
    private readonly palette = getBattleCardPalette('unit');
    private cardData: UnitCard;
    private attackText: GameObjects.Text;
    private healthText: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private raceBox: GameObjects.Rectangle;
    private raceText: GameObjects.Text;
    private gongfaContainer: GameObjects.Container;
    private gongfaTexts: GameObjects.Text[] = [];
    private gongfaTooltip: GongfaTooltip;
    private gongfaData: Map<string, Gongfa> = new Map();
    private statusContainer?: GameObjects.Container;
    private statusTooltip?: GameObjects.Container;
    private faceImage?: GameObjects.Image;
    private faceRealmText?: GameObjects.Text;
    private releaseFace?: () => void;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: UnitCard, scale: number = 1) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景
        this.createBackground(this.palette.shell, this.palette.border);

        // 创建名称
        this.createNameText(cardData.name, -104);

        // 星级
        const star = getUnitStar(cardData);
        const stars = '★'.repeat(star);
        this.createCardText(0, -82, stars, 'accent', {
            fontSize: '18px',
            color: battleColorToHex(sceneTheme.colors.goldSoft),
        });

        // 境界
        const realmConfig = getRealmConfig(cardData.realmId);
        const realmInfo = realmConfig ? `${realmConfig.stage} ${realmConfig.phase}`.trim() : '';
        this.createCardText(0, -60, realmInfo, 'meta', {
            fontSize: '18px',
            color: battleColorToHex(this.palette.accentSoft),
        });

        // 种族牌面
        this.raceBox = scene.add.rectangle(0, -2, 140, 76, this.palette.iconFill, 0.92);
        this.raceBox.setStrokeStyle(1, this.palette.accent, 0.26);
        this.add(this.raceBox);
        this.raceText = this.scene.add.text(0, -6, cardData.race, getBattleCardTextStyle('body', {
            fontSize: '18px',
            color: this.palette.bodyText,
            wordWrap: { width: 126 },
        })).setOrigin(0.5);
        this.add(this.raceText);

        // 描述（默认隐藏，只在预览时显示）
        this.descriptionText = this.scene.add.text(0, 54, cardData.description, getBattleCardTextStyle('support', {
            fontSize: '18px',
            color: this.palette.supportText,
            wordWrap: { width: 146 },
        })).setOrigin(0.5);
        this.descriptionText.setVisible(false); // 默认隐藏
        this.add(this.descriptionText);

        // 攻击力
        this.attackText = this.createChip(
            -48,
            104,
            72,
            34,
            blendBattleColor(sceneTheme.colors.ink, battleTheme.colors.danger, 0.58),
            battleTheme.colors.dangerSoft,
            `攻 ${cardData.attack}`,
            getBattleCardTextStyle('stat', {
                fontSize: '18px',
                resolution: 3,
                color: battleTheme.colors.textDanger,
            }),
        ).text;

        // 生命值
        this.healthText = this.createChip(
            48,
            104,
            72,
            34,
            blendBattleColor(sceneTheme.colors.ink, this.palette.accent, 0.42),
            this.palette.accentSoft,
            `命 ${cardData.health}`,
            getBattleCardTextStyle('stat', {
                fontSize: '18px',
                resolution: 3,
                color: battleTheme.colors.textPositive,
            }),
        ).text;

        // 初始化功法提示框
        this.gongfaTooltip = new GongfaTooltip(scene);

        // 创建功法列表容器
        this.gongfaContainer = scene.add.container(0, 0);
        this.add(this.gongfaContainer);

        // 加载功法数据并渲染
        this.loadAndRenderGongfa();

        // 设置交互和缩放
        this.setupInteractivity();

        // 设置拖拽事件
        this.setupDragEvents({
            onDragEnd: () => {
                // 拖拽结束后的处理
                const battleScene = this.scene as any; // BattleScene
                
                // 检查是否拖拽到己方场地上的其他单位（用于换位）
                if (battleScene.swapPlayerFieldCards) {
                    const swapped = battleScene.swapPlayerFieldCards(this, this.x, this.y);
                    if (swapped) {
                        // 交换成功，不需要其他操作
                        return;
                    }
                }
                
                // 检查是否是从手牌拖到场地
                if (battleScene.isCardInPlayerField && battleScene.isCardInPlayerField(this.x, this.y)) {
                    // 尝试打出卡牌
                    const success = battleScene.playCardToField(this);
                    if (!success) {
                        // 如果打出失败（比如场地已满），返回原位置
                        this.returnToOriginalPosition();
                    }
                } else {
                    // 不在场地范围内，返回原位置
                    this.returnToOriginalPosition();
                }
            }
        });
        const original = this.list.map(object => ({ object: object as any, visible: (object as any).visible }));
        this.releaseFace = watchCardFace(scene, cardData, key => {
            if (!this.active) return;
            this.faceImage?.destroy();
            this.faceRealmText?.destroy();
            this.faceImage = undefined;
            this.faceRealmText = undefined;
            for (const { object, visible } of original) if (object.active) object.setVisible(visible);
            this.background.setFillStyle(this.palette.shell, .98);
            if (key) {
                this.faceImage = scene.add.image(0, 0, key).setDisplaySize(180, 260);
                this.addAt(this.faceImage, 0);
                for (const { object } of original) if (object !== this.attackText && object !== this.healthText) object.setVisible(false);
                this.background.setVisible(true).setFillStyle(this.palette.shell, 0);
                const scroll = selectedCardFace(cardData.id, cardData.cardFace) === 'scroll';
                const realm = getRealmConfig(cardData.realmId);
                this.faceRealmText = scene.add.text(0, scroll ? -92 : -103, `${realm?.stage ?? ''}${realm?.phase ?? ''} ${'★'.repeat(getUnitStar(cardData))}`, {
                    fontFamily: sceneTheme.fonts.ui, fontSize: '9px', resolution: 3, color: scroll ? '#655f4c' : '#d8cba5',
                }).setOrigin(.5);
                this.add(this.faceRealmText);
                // Keep the original interactive gongfa names/tooltips available.
                this.gongfaContainer.setScale(.5).setPosition(0, 83);
                this.gongfaTexts.forEach(text => text.setColor('#425d57'));
                this.attackText.setPosition(-67, 112).setFontSize(12).setStroke('', 0);
                this.healthText.setPosition(67, 112).setFontSize(12).setStroke('', 0);
            } else {
                this.gongfaTexts.forEach(text => text.setColor(battleColorToHex(sceneTheme.colors.goldSoft)));
                this.gongfaContainer.setScale(1).setPosition(0, 0);
                this.attackText.setPosition(-48, 104).setFontSize(18);
                this.healthText.setPosition(48, 104).setFontSize(18);
            }
            this.updateDisplayMode();
            this.updateStats();
        });
    }

    public setBattlePresentation(side?: BattleSide): void {
        if (side && this.battleView?.side === side) return;
        if (this.battleView) {
            this.battleView.destroy(); this.battleView = undefined;
            for (const [object, visible] of this.cardVisibility) if (object.active && 'setVisible' in object) (object as GameObjects.Image).setVisible(visible);
            this.cardVisibility.clear();
            if (this.input) this.input.hitArea.setTo(0, 0, 180, 260);
        }
        const key = unitArt(this.cardData.id);
        if (!side || !key) { this.updateDisplayMode(); return; }
        for (const object of this.list) if ('visible' in object) {
            this.cardVisibility.set(object, (object as GameObjects.Image).visible);
            (object as GameObjects.Image).setVisible(false);
        }
        this.battleView = new WenxinUnitView(this.scene, this, key, side);
        this.add(this.battleView);
        const m = UNIT_ART[key];
        const artScale = isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height) ? 1.6 : 3;
        if (this.input) this.input.hitArea.setTo(90 - (side === 'me' ? m.w - m.ax : m.ax) * artScale, 130 - m.ay * artScale, m.w * artScale, m.h * artScale + 70);
    }

    public getCardData(): UnitCard {
        return this.cardData;
    }

    // 更新卡牌数值显示
    public updateStats() {
        // 检查对象是否已被销毁
        if (!this.active || !this.attackText || !this.healthText) {
            return;
        }
        
        // 更新攻击力
        this.battleView?.refreshStats();
        this.attackText.setText(`攻 ${this.cardData.attack}`);
        
        // 更新生命值
        this.healthText.setText(`命 ${this.cardData.health}`);
        this.attackText.setColor(this.faceImage ? '#673b39' : battleTheme.colors.textDanger);
        
        // 如果生命值过低，改变颜色提示
        if (this.cardData.health <= 0) {
            this.healthText.setColor(battleTheme.colors.textMuted);
        } else if (this.cardData.health <= this.getOriginalHealth() * 0.3) {
            this.healthText.setColor(battleTheme.colors.textDanger); // 低血量红色
        } else {
            this.healthText.setColor(this.faceImage ? '#2b4440' : battleTheme.colors.textPositive);
        }
    }

    // 获取原始生命值（从卡牌数据中）
    private getOriginalHealth(): number {
        // 简单实现：假设初始生命值存在realm对应的combat baseline中
        // 这里暂时返回一个估算值
        return this.cardData.health > 10 ? 10 : this.cardData.health;
    }

    // 重写：获取默认边框颜色
    protected getDefaultStrokeColor(): number {
        return this.palette.border;
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        if (this.battleView) {
            for (const object of this.list) if (object !== this.battleView && 'setVisible' in object) (object as GameObjects.Image).setVisible(false);
            this.battleView.setVisible(true);
            return;
        }
        if (this.faceImage) {
            this.descriptionText.setVisible(false);
            this.gongfaContainer.setVisible(true);
            this.raceBox.setVisible(false);
            this.raceText.setVisible(false);
            return;
        }
        const showExpandedDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(showExpandedDescription);
        this.gongfaContainer.setVisible(!showExpandedDescription);
        this.raceBox.setVisible(!showExpandedDescription);
        this.raceText.setVisible(!showExpandedDescription);
    }

    /**
     * 加载功法数据并渲染功法列表
     */
    private loadAndRenderGongfa(): void {
        const gongfaIds = this.cardData.gongfaIds || [];
        if (gongfaIds.length === 0) {
            return;
        }

        // 从缓存加载功法数据，并生成描述
        const gongfaListData = this.scene.cache.json.get('gongfaList') as { gongfa: Gongfa[] } | undefined;
        if (gongfaListData && gongfaListData.gongfa) {
            gongfaListData.gongfa.forEach(gongfa => {
                // 如果没有描述，从 schema 自动生成
                const description = gongfa.description ?? describeGongfa(gongfa.schema);
                this.gongfaData.set(gongfa.id, { ...gongfa, description });
            });
        }

        // 渲染功法列表
        this.renderGongfaList(gongfaIds);
    }

    /**
     * 渲染功法列表
     */
    private renderGongfaList(gongfaIds: string[]): void {
        // 清除旧的功法文本
        this.gongfaTexts.forEach(text => text.destroy());
        this.gongfaTexts = [];

        const startY = 30;
        const lineHeight = 20;

        gongfaIds.forEach((gongfaId, index) => {
            const gongfa = this.gongfaData.get(gongfaId);
            if (!gongfa) {
                return;
            }

            const y = startY + index * lineHeight;
            
            // 创建功法名文本
            const gongfaText = this.scene.add.text(0, y, `【${gongfa.name}】`, {
                ...getBattleCardTextStyle('tiny', {
                    fontSize: '18px',
                    color: battleColorToHex(sceneTheme.colors.goldSoft),
                    fontStyle: 'bold',
                }),
            }).setOrigin(0.5);
            
            this.gongfaContainer.add(gongfaText);
            this.gongfaTexts.push(gongfaText);

            // 创建交互区域
            const hitArea = this.scene.add.rectangle(
                0,
                y,
                gongfaText.width + 10,
                lineHeight,
                sceneTheme.colors.goldSoft,
                0
            );
            hitArea.setInteractive({ useHandCursor: true });
            hitArea.setOrigin(0.5);
            this.gongfaContainer.add(hitArea);

            // 下划线（默认隐藏）
            const underline = this.scene.add.rectangle(
                0,
                y + 6,
                gongfaText.width,
                1,
                sceneTheme.colors.goldSoft,
                0
            );
            this.gongfaContainer.add(underline);

            // hover 事件
            hitArea.on('pointerover', () => {
                underline.setAlpha(1);
                // 计算提示框位置（世界坐标）
                const worldPos = this.getWorldTransformMatrix();
                const worldX = worldPos.tx;
                const worldY = worldPos.ty + y * this.scale;
                
                const gongfaName = gongfa.name || gongfaId;
                const description = gongfa.description || '无描述';
                this.gongfaTooltip.show(worldX + 120, worldY, gongfaName, description);
            });

            hitArea.on('pointerout', () => {
                underline.setAlpha(0);
                this.gongfaTooltip.hide();
            });
        });
    }

    /**
     * 更新状态显示
     */
    public updateStatusDisplay(statuses: StatusInstance[]): void {
        // 清除旧的状态显示
        if (this.statusContainer) {
            this.statusContainer.destroy();
            this.statusContainer = undefined;
        }
        
        if (this.statusTooltip) {
            this.statusTooltip.destroy();
            this.statusTooltip = undefined;
        }

        // 如果没有状态，直接返回
        if (!statuses || statuses.length === 0) {
            return;
        }

        // 创建新的状态容器（显示在卡片左侧，避免与功法重合）
        this.statusContainer = this.scene.add.container(-86, -40);
        this.add(this.statusContainer);

        // 显示每个状态
        statuses.forEach((status, index) => {
            const categoryColor = getStatusCategoryColor(status.statusId);
            
            const yPos = index * 28;
            
            // 像素状态徽章：图标 + 层数/回合数，避免长文案挤压卡面。
            const bg = this.scene.add.rectangle(6, yPos, 78, 24, categoryColor, 0.85);
            bg.setStrokeStyle(2, C.void);
            this.statusContainer!.add(bg);

            const icon = this.scene.add.image(-24, yPos, iconTexture(this.scene, STATUS_ICON[status.statusId] ?? 'star')).setScale(1.5);
            this.statusContainer!.add(icon);
            const stackText = status.stacks > 1 ? `${status.stacks}` : '';
            const durationText = status.duration && status.duration > 0 ? `${stackText ? '·' : ''}${status.duration}回` : '';
            const text = this.scene.add.text(-8, yPos, `${stackText}${durationText}`, {
                fontSize: '12px',
                color: T.paper,
                stroke: T.void,
                strokeThickness: 3,
            }).setOrigin(0, 0.5);
            this.statusContainer!.add(text);

            // 添加交互（悬停显示详细信息）
            bg.setInteractive();
            bg.on('pointerover', () => {
                this.showStatusTooltip(status, bg);
            });
            bg.on('pointerout', () => {
                this.hideStatusTooltip();
            });
        });
    }

    /**
     * 显示状态提示框
     */
    private showStatusTooltip(status: StatusInstance, targetBg: GameObjects.Rectangle): void {
        // 隐藏之前的提示框
        this.hideStatusTooltip();

        const fullDesc = getStatusFullDescription(status);
        
        // 先创建临时文本来测量实际大小
        const padding = 12;
        const maxWidth = 320;
        
        const tempText = this.scene.add.text(0, 0, fullDesc, {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            lineSpacing: 4,
            color: battleTheme.colors.textBody,
            wordWrap: { width: maxWidth - padding * 2 }
        });
        
        // 获取文本的实际尺寸
        const textBounds = tempText.getBounds();
        const width = Math.max(textBounds.width + padding * 2, 220);
        const height = textBounds.height + padding * 2;
        
        // 销毁临时文本
        tempText.destroy();
        
        // 获取世界坐标
        const bgWorldPos = targetBg.getWorldTransformMatrix();
        
        // 创建提示框（显示在状态图标右侧）
        // 注意：不要添加到 this，而是直接添加到场景，这样图层更高
        this.statusTooltip = this.scene.add.container(
            bgWorldPos.tx + 60,
            bgWorldPos.ty
        );
        // 设置非常高的深度，确保在所有卡片之上
        this.statusTooltip.setDepth(99999);
        
        // 背景（根据文本实际大小调整）
        const tooltipBg = this.scene.add.rectangle(
            0,
            0,
            width,
            height,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.08),
            0.98,
        );
        tooltipBg.setStrokeStyle(2, sceneTheme.colors.goldSoft, 0.78);
        this.statusTooltip.add(tooltipBg);
        
        // 文本（增大字体）
        const tooltipText = this.scene.add.text(-width/2 + padding, -height/2 + padding, fullDesc, {
            fontFamily: sceneTheme.fonts.body,
            fontSize: '18px',
            color: battleTheme.colors.textBody,
            lineSpacing: 4,
            wordWrap: { width: maxWidth - padding * 2 }
        }).setOrigin(0, 0);
        this.statusTooltip.add(tooltipText);
    }

    /**
     * 隐藏状态提示框
     */
    private hideStatusTooltip(): void {
        if (this.statusTooltip) {
            this.statusTooltip.destroy();
            this.statusTooltip = undefined;
        }
    }

    /**
     * 清除状态显示
     */
    public clearStatusDisplay(): void {
        if (this.statusContainer) {
            this.statusContainer.destroy();
            this.statusContainer = undefined;
        }
        this.hideStatusTooltip();
    }

    /**
     * 销毁时清理功法提示框和状态显示
     */
    public destroy(fromScene?: boolean): void {
        this.releaseFace?.();
        this.gongfaTooltip.destroy();
        this.clearStatusDisplay();
        super.destroy(fromScene);
    }
}
