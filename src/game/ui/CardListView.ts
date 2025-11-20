import { GameObjects, Scene } from 'phaser';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import type { UnitCard } from '../../../data/types/cards/unit';
import type { ArtifactCard } from '../../../data/types/cards/artifact';
import type { TalismanCard } from '../../../data/types/cards/talisman';
import type { FieldCard } from '../../../data/types/cards/field';

/**
 * 通用的卡片列表视图
 * 用于展示卡组、弃牌堆等卡片列表
 */
export class CardListView extends GameObjects.Container {
    private title: string;
    private cards: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[];
    private background!: GameObjects.Rectangle;
    private titleText!: GameObjects.Text;
    private closeButton!: GameObjects.Rectangle;
    private scrollContainer!: GameObjects.Container;
    private cardSprites: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    private maskShape!: GameObjects.Graphics;
    
    private scrollY: number = 0;
    private maxScrollY: number = 0;
    private isDragging: boolean = false;
    private lastPointerY: number = 0;

    constructor(scene: Scene, title: string, cards: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[]) {
        super(scene, 0, 0);
        
        this.title = title;
        this.cards = cards;
        
        this.createView();
        this.setupInteraction();
        
        scene.add.existing(this);
    }

    private createView() {
        const { width, height } = this.scene.scale;
        
        // 半透明黑色背景遮罩（覆盖整个屏幕）
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());
        this.add(overlay);

        // 主面板
        const panelWidth = Math.min(800, width * 0.9);
        const panelHeight = Math.min(600, height * 0.85);
        const panelX = width / 2;
        const panelY = height / 2;

        this.background = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x2c3e50);
        this.background.setStrokeStyle(4, 0xf39c12);
        this.background.setInteractive(); // 阻止点击穿透
        this.add(this.background);

        // 标题
        this.titleText = this.scene.add.text(panelX, panelY - panelHeight / 2 + 30, this.title, {
            fontSize: '24px',
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.titleText);

        // 卡片数量
        const countText = this.scene.add.text(panelX, panelY - panelHeight / 2 + 60, `共 ${this.cards.length} 张卡牌`, {
            fontSize: '16px',
            color: '#ecf0f1'
        }).setOrigin(0.5);
        this.add(countText);

        // 关闭按钮
        const closeX = panelX + panelWidth / 2 - 40;
        const closeY = panelY - panelHeight / 2 + 30;
        this.closeButton = this.scene.add.rectangle(closeX, closeY, 60, 40, 0xe74c3c);
        this.closeButton.setStrokeStyle(2, 0xffffff);
        this.closeButton.setInteractive({ useHandCursor: true });
        this.closeButton.on('pointerover', () => this.closeButton.setFillStyle(0xff6b6b));
        this.closeButton.on('pointerout', () => this.closeButton.setFillStyle(0xe74c3c));
        this.closeButton.on('pointerdown', () => this.close());
        this.add(this.closeButton);

        const closeText = this.scene.add.text(closeX, closeY, '关闭', {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.add(closeText);

        // 创建滚动容器
        const contentY = panelY - panelHeight / 2 + 100;
        const contentHeight = panelHeight - 120;
        
        this.scrollContainer = this.scene.add.container(0, 0);
        this.add(this.scrollContainer);

        // 创建遮罩（在世界坐标系中）
        const maskX = panelX - panelWidth / 2 + 10;
        const maskY = contentY - contentHeight / 2;
        const maskWidth = panelWidth - 20;
        
        this.maskShape = this.scene.add.graphics();
        this.maskShape.fillStyle(0xffffff);
        this.maskShape.fillRect(maskX, maskY, maskWidth, contentHeight);
        const mask = this.maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);
        
        // 设置滚动容器的初始位置（相对于面板中心）
        this.scrollContainer.setPosition(panelX - panelWidth / 2 + 20, contentY);

        // 创建卡片网格
        this.createCardGrid(panelWidth - 40);

        // 滚动提示
        if (this.maxScrollY > 0) {
            const scrollHint = this.scene.add.text(panelX, panelY + panelHeight / 2 - 20, '↕ 滚动查看更多', {
                fontSize: '14px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.add(scrollHint);
        }

        this.setDepth(5000);
    }

    private createCardGrid(containerWidth: number) {
        const cardScale = 0.5;
        const cardWidth = 180 * cardScale;
        const cardHeight = 260 * cardScale;
        const spacing = 20;
        const cols = Math.floor(containerWidth / (cardWidth + spacing));
        
        this.cards.forEach((cardData, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            
            // 从左上角开始排列
            const x = col * (cardWidth + spacing) + cardWidth / 2;
            const y = row * (cardHeight + spacing) + cardHeight / 2;

            let sprite: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite;
            if (cardData.kind === 'unit') {
                sprite = new CardSprite(this.scene, x, y, cardData as UnitCard, cardScale);
            } else if (cardData.kind === 'artifact') {
                sprite = new ArtifactSprite(this.scene, x, y, cardData as ArtifactCard, cardScale);
            } else if (cardData.kind === 'talisman') {
                sprite = new TalismanSprite(this.scene, x, y, cardData as TalismanCard, cardScale);
            } else if (cardData.kind === 'field') {
                sprite = new FieldSprite(this.scene, x, y, cardData as FieldCard, cardScale);
            } else {
                return; // 暂不支持其他类型
            }

            // 禁用拖拽
            sprite.disableDragging();
            
            // 添加hover效果（预览在CardSprite/ArtifactSprite中已实现）
            
            this.scrollContainer.add(sprite);
            this.cardSprites.push(sprite);
        });

        // 计算最大滚动距离
        const rows = Math.ceil(this.cards.length / cols);
        const totalHeight = rows * (cardHeight + spacing);
        const { height } = this.scene.scale;
        const panelHeight = Math.min(600, height * 0.85);
        const contentHeight = panelHeight - 120;
        
        this.maxScrollY = Math.max(0, totalHeight - contentHeight);
    }

    private setupInteraction() {
        // 鼠标滚轮滚动
        this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
            this.scroll(deltaY * 0.5);
        });

        // 触摸拖动滚动
        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastPointerY = pointer.y;
        });

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
                const deltaY = this.lastPointerY - pointer.y;
                this.scroll(deltaY);
                this.lastPointerY = pointer.y;
            }
        });

        this.scene.input.on('pointerup', () => {
            this.isDragging = false;
        });

        // ESC键关闭
        this.scene.input.keyboard?.on('keydown-ESC', () => {
            this.close();
        });
    }

    private scroll(delta: number) {
        this.scrollY += delta;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
        
        // 更新滚动容器的 Y 偏移
        const { height } = this.scene.scale;
        const panelHeight = Math.min(600, height * 0.85);
        const panelY = height / 2;
        const contentY = panelY - panelHeight / 2 + 100;
        
        this.scrollContainer.setY(contentY - this.scrollY);
    }

    private close() {
        // 移除键盘监听
        this.scene.input.keyboard?.off('keydown-ESC');
        
        // 移除鼠标监听
        this.scene.input.off('wheel');
        this.scene.input.off('pointermove');
        this.scene.input.off('pointerup');
        
        // 销毁所有卡片精灵
        this.cardSprites.forEach(sprite => sprite.destroy());
        
        // 销毁遮罩
        if (this.maskShape) {
            this.maskShape.destroy();
        }
        
        // 销毁自己
        this.destroy();
    }
}
