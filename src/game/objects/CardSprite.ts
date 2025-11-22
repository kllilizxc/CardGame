import { GameObjects } from 'phaser';
import type { UnitCard } from '@data/types/cards/unit';
import type { Gongfa } from '@data/types/gongfa';
import { BaseCardSprite } from './BaseCardSprite';
import { GongfaTooltip } from '../ui/GongfaTooltip';
import { describeGongfa } from '../utils/GongfaDescriptionBuilder';
import { getUnitStar, getRealmConfig } from '../utils/RealmHelper';

export class CardSprite extends BaseCardSprite {
    private cardData: UnitCard;
    private starsText: GameObjects.Text;
    private realmText: GameObjects.Text;
    private attackText: GameObjects.Text;
    private healthText: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private gongfaContainer: GameObjects.Container;
    private gongfaTexts: GameObjects.Text[] = [];
    private gongfaTooltip: GongfaTooltip;
    private gongfaData: Map<string, Gongfa> = new Map();

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: UnitCard, scale: number = 0.7) {
        super(scene, x, y, scale);
        this.cardData = cardData;

        // 创建背景
        this.createBackground(0x2d2d2d, 0xf39c12);

        // 创建名称
        this.createNameText(cardData.name);

        // 星级
        const star = getUnitStar(cardData);
        const stars = '★'.repeat(star);
        this.starsText = scene.add.text(0, -85, stars, {
            fontSize: '14px',
            color: '#f1c40f'
        }).setOrigin(0.5);
        this.add(this.starsText);

        // 境界
        const realmConfig = getRealmConfig(cardData.realmId);
        const realmInfo = realmConfig ? `${realmConfig.stage} ${realmConfig.phase}`.trim() : '';
        this.realmText = scene.add.text(0, -60, realmInfo, {
            fontSize: '12px',
            color: '#9b59b6'
        }).setOrigin(0.5);
        this.add(this.realmText);

        // 种族占位符
        const raceBox = scene.add.rectangle(0, 0, 150, 80, 0x34495e);
        this.add(raceBox);
        const raceText = scene.add.text(0, 0, cardData.race, {
            fontSize: '14px',
            color: '#95a5a6'
        }).setOrigin(0.5);
        this.add(raceText);

        // 描述（默认隐藏，只在预览时显示）
        this.descriptionText = scene.add.text(0, 60, cardData.description, {
            fontSize: '11px',
            color: '#bdc3c7',
            wordWrap: { width: 160 }
        }).setOrigin(0.5);
        this.descriptionText.setVisible(false); // 默认隐藏
        this.add(this.descriptionText);

        // 攻击力
        const attackBg = scene.add.rectangle(-50, 100, 60, 30, 0x4d1a1a);
        this.add(attackBg);
        this.attackText = scene.add.text(-50, 100, `⚔${cardData.attack}`, {
            fontSize: '14px',
            color: '#e74c3c',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.attackText);

        // 生命值
        const healthBg = scene.add.rectangle(50, 100, 60, 30, 0x1a4d2e);
        this.add(healthBg);
        this.healthText = scene.add.text(50, 100, `❤${cardData.health}`, {
            fontSize: '14px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.healthText);

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
        this.attackText.setText(`⚔${this.cardData.attack}`);
        
        // 更新生命值
        this.healthText.setText(`❤${this.cardData.health}`);
        
        // 如果生命值过低，改变颜色提示
        if (this.cardData.health <= 0) {
            this.healthText.setColor('#666666');
        } else if (this.cardData.health <= this.getOriginalHealth() * 0.3) {
            this.healthText.setColor('#e74c3c'); // 低血量红色
        } else {
            this.healthText.setColor('#2ecc71'); // 正常绿色
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
        return 0xf39c12;
    }

    // 重写：更新显示模式
    protected updateDisplayMode(): void {
        // 只有在hover模式下才显示描述
        const shouldShowDescription = this.currentDisplayMode === 'hover';
        this.descriptionText.setVisible(shouldShowDescription);
        
        // 功法列表始终显示（如果有的话）
        this.gongfaContainer.setVisible(true);
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

        const startY = 30; // 功法列表起始 Y 坐标
        const lineHeight = 16; // 每行高度

        gongfaIds.forEach((gongfaId, index) => {
            const gongfa = this.gongfaData.get(gongfaId);
            if (!gongfa) {
                return;
            }

            const y = startY + index * lineHeight;
            
            // 创建功法名文本
            const gongfaText = this.scene.add.text(0, y, `【${gongfa.name}】`, {
                fontSize: '10px',
                color: '#f39c12',
                fontStyle: 'bold'
            }).setOrigin(0.5);
            
            this.gongfaContainer.add(gongfaText);
            this.gongfaTexts.push(gongfaText);

            // 创建交互区域
            const hitArea = this.scene.add.rectangle(
                0,
                y,
                gongfaText.width + 10,
                lineHeight,
                0xffd700,
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
                0xffd700,
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
     * 销毁时清理功法提示框
     */
    public destroy(fromScene?: boolean): void {
        this.gongfaTooltip.destroy();
        super.destroy(fromScene);
    }
}
