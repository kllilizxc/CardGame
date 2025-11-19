import { GameObjects } from 'phaser';
import type { UnitCard } from '../../../types/cards';

export class CardSprite extends GameObjects.Container {
    private cardData: UnitCard;
    private background: GameObjects.Rectangle;
    private nameText: GameObjects.Text;
    private starsText: GameObjects.Text;
    private realmText: GameObjects.Text;
    private attackText: GameObjects.Text;
    private healthText: GameObjects.Text;
    private descriptionText: GameObjects.Text;
    private isDragging: boolean = false;
    private originalX: number = 0;
    private originalY: number = 0;
    private cardScale: number = 1;

    constructor(scene: Phaser.Scene, x: number, y: number, cardData: UnitCard, scale: number = 0.7) {
        super(scene, x, y);
        this.cardData = cardData;
        this.cardScale = scale;

        // 卡牌尺寸
        const width = 180;
        const height = 260;

        // 背景
        this.background = scene.add.rectangle(0, 0, width, height, 0x2d2d2d);
        this.background.setStrokeStyle(3, 0xf39c12);
        this.add(this.background);

        // 卡牌名称
        this.nameText = scene.add.text(0, -110, cardData.name, {
            fontSize: '16px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.nameText);

        // 星级
        const stars = '★'.repeat(cardData.star);
        this.starsText = scene.add.text(0, -85, stars, {
            fontSize: '14px',
            color: '#f1c40f'
        }).setOrigin(0.5);
        this.add(this.starsText);

        // 境界
        const realmInfo = `${cardData.realm.stage} ${cardData.realm.phase}`;
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

        // 设置交互
        this.setSize(width, height);
        this.setInteractive({ draggable: true, useHandCursor: true });

        // 应用缩放
        this.setScale(this.cardScale);

        // 添加事件监听
        this.setupInteraction();

        scene.add.existing(this);
    }

    private setupInteraction() {
        // 悬停效果 - 创建放大预览
        this.on('pointerover', () => {
            this.background.setStrokeStyle(3, 0xffd700);
            // 通知场景显示预览
            this.scene.events.emit('showCardPreview', this);
        });

        this.on('pointerout', () => {
            if (!this.isDragging) {
                this.background.setStrokeStyle(3, 0xf39c12);
                // 通知场景隐藏预览
                this.scene.events.emit('hideCardPreview');
            }
        });

        // 拖拽开始
        this.on('dragstart', () => {
            this.isDragging = true;
            this.originalX = this.x;
            this.originalY = this.y;
            this.setScale(this.cardScale * 1.2);
            this.setDepth(1000);
        });

        // 拖拽中
        this.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            this.x = dragX;
            this.y = dragY;
        });

        // 拖拽结束
        this.on('dragend', () => {
            this.isDragging = false;
            this.setScale(this.cardScale);
            this.setDepth(0);

            // 检查是否在场地范围内
            const battleScene = this.scene as any; // BattleScene
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
        });
    }

    public getCardData(): UnitCard {
        return this.cardData;
    }

    public returnToOriginalPosition() {
        this.scene.tweens.add({
            targets: this,
            x: this.originalX,
            y: this.originalY,
            duration: 300,
            ease: 'Back.easeOut'
        });
    }

    public setOriginalPosition(x: number, y: number) {
        this.originalX = x;
        this.originalY = y;
    }

    // 更新卡牌数值显示
    public updateStats() {
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

    // 禁用拖拽但保留hover交互
    public disableDragging() {
        this.removeInteractive();
        // 重新设置为可交互但不可拖拽
        this.setInteractive({ useHandCursor: false });
        
        // 移除拖拽事件
        this.off('dragstart');
        this.off('drag');
        this.off('dragend');
        
        // 重新添加hover效果
        this.on('pointerover', () => {
            this.background.setStrokeStyle(3, 0xffd700);
            // 通知场景显示预览
            this.scene.events.emit('showCardPreview', this);
        });

        this.on('pointerout', () => {
            this.background.setStrokeStyle(3, 0xf39c12);
            // 通知场景隐藏预览
            this.scene.events.emit('hideCardPreview');
        });
    }
}
