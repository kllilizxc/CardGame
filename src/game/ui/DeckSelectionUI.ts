import { GameObjects, Scene } from 'phaser';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import { PillSprite } from '../objects/PillSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';

type AnyCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;
type AnyCardSprite = CardSprite | ArtifactSprite | TalismanSprite | FieldSprite | PillSprite;

/**
 * 卡组选择UI
 * 用于从卡组中选择一张卡（技能"注定一抽"等）
 */
export class DeckSelectionUI extends GameObjects.Container {
    private cards: AnyCard[];
    private background!: GameObjects.Rectangle;
    private overlay!: GameObjects.Rectangle;
    private titleText!: GameObjects.Text;
    private closeButton!: GameObjects.Rectangle;
    private scrollContainer!: GameObjects.Container;
    private cardSprites: AnyCardSprite[] = [];
    private maskShape!: GameObjects.Graphics;
    private onCardSelected: ((card: AnyCard) => void) | null = null;
    private onCancel: (() => void) | null = null;
    
    private scrollY: number = 0;
    private maxScrollY: number = 0;
    private isDragging: boolean = false;
    private lastPointerY: number = 0;
    private panelWidth: number = 0;
    private panelHeight: number = 0;
    private panelX: number = 0;
    private panelY: number = 0;
    private contentLeft: number = 0;
    private contentTop: number = 0;
    private contentWidth: number = 0;
    private contentHeight: number = 0;

    constructor(scene: Scene) {
        super(scene, 0, 0);
        this.cards = [];
        this.setVisible(false);
        scene.add.existing(this);
    }

    /**
     * 显示选择界面
     */
    public show(cards: AnyCard[], onCardSelected: (card: AnyCard) => void, onCancel?: () => void): void {
        this.cards = cards;
        this.onCardSelected = onCardSelected;
        this.onCancel = onCancel || null;
        
        this.createView();
        this.setupInteraction();
        this.setVisible(true);
    }

    /**
     * 创建UI
     */
    private createView(): void {
        const { width, height } = this.scene.scale;
        
        // 半透明黑色背景遮罩（覆盖整个屏幕）
        this.overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
        this.overlay.setInteractive();
        this.overlay.on('pointerdown', () => this.hide(true)); // 点击背景取消
        this.add(this.overlay);

        // 主面板
        this.panelWidth = Math.min(800, width * 0.9);
        this.panelHeight = Math.min(600, height * 0.85);
        this.panelX = width / 2;
        this.panelY = height / 2;

        this.background = this.scene.add.rectangle(this.panelX, this.panelY, this.panelWidth, this.panelHeight, 0x2c3e50);
        this.background.setStrokeStyle(4, 0x3498db);
        this.background.setInteractive(); // 阻止点击穿透
        this.add(this.background);

        // 标题
        this.titleText = this.scene.add.text(this.panelX, this.panelY - this.panelHeight / 2 + 30, '从卡组中选择一张卡', {
            fontSize: '24px',
            color: '#3498db',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.add(this.titleText);

        // 卡片数量
        const countText = this.scene.add.text(this.panelX, this.panelY - this.panelHeight / 2 + 60, `共 ${this.cards.length} 张卡牌`, {
            fontSize: '16px',
            color: '#ecf0f1'
        }).setOrigin(0.5);
        this.add(countText);

        // 关闭按钮
        const closeX = this.panelX + this.panelWidth / 2 - 40;
        const closeY = this.panelY - this.panelHeight / 2 + 30;
        this.closeButton = this.scene.add.rectangle(closeX, closeY, 60, 40, 0xe74c3c);
        this.closeButton.setStrokeStyle(2, 0xffffff);
        this.closeButton.setInteractive({ useHandCursor: true });
        this.closeButton.on('pointerover', () => this.closeButton.setFillStyle(0xff6b6b));
        this.closeButton.on('pointerout', () => this.closeButton.setFillStyle(0xe74c3c));
        this.closeButton.on('pointerdown', () => this.hide(true)); // 点击关闭按钮取消
        this.add(this.closeButton);

        const closeText = this.scene.add.text(closeX, closeY, '取消', {
            fontSize: '16px',
            color: '#ffffff'
        }).setOrigin(0.5);
        this.add(closeText);

        // 创建滚动容器
        this.contentLeft = this.panelX - this.panelWidth / 2 + 20;
        this.contentTop = this.panelY - this.panelHeight / 2 + 110;
        this.contentWidth = this.panelWidth - 40;
        this.contentHeight = this.panelHeight - 160;

        this.scrollContainer = this.scene.add.container(0, 0);
        this.add(this.scrollContainer);

        // 创建遮罩（在世界坐标系中）
        this.maskShape = this.scene.add.graphics();
        this.maskShape.fillStyle(0xffffff);
        this.maskShape.fillRect(this.contentLeft, this.contentTop, this.contentWidth, this.contentHeight);
        const mask = this.maskShape.createGeometryMask();
        this.scrollContainer.setMask(mask);
        
        // 设置滚动容器的初始位置（左上角）
        this.scrollContainer.setPosition(this.contentLeft, this.contentTop);

        // 创建卡片网格
        this.createCardGrid(this.contentWidth);

        // 滚动提示
        if (this.maxScrollY > 0) {
            const scrollHint = this.scene.add.text(this.panelX, this.panelY + this.panelHeight / 2 - 20, '↕ 滚动查看更多', {
                fontSize: '14px',
                color: '#95a5a6'
            }).setOrigin(0.5);
            this.add(scrollHint);
        }

        this.setDepth(6000);
    }

    /**
     * 创建卡片网格
     */
    private createCardGrid(containerWidth: number): void {
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

            let sprite: AnyCardSprite;
            if (cardData.kind === 'unit') {
                sprite = new CardSprite(this.scene, x, y, cardData as UnitCard, cardScale);
            } else if (cardData.kind === 'artifact') {
                sprite = new ArtifactSprite(this.scene, x, y, cardData as ArtifactCard, cardScale);
            } else if (cardData.kind === 'talisman') {
                sprite = new TalismanSprite(this.scene, x, y, cardData as TalismanCard, cardScale);
            } else if (cardData.kind === 'field') {
                sprite = new FieldSprite(this.scene, x, y, cardData as FieldCard, cardScale);
            } else if (cardData.kind === 'pill') {
                sprite = new PillSprite(this.scene, x, y, cardData as PillCard, cardScale);
            } else {
                return; // 暂不支持其他类型
            }

            // 禁用拖拽
            sprite.disableDragging();

            // 设置为deck模式
            sprite.setDisplayMode('deck');

            // 点击选择
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                if (this.onCardSelected) {
                    this.onCardSelected(cardData);
                }
                this.hide(false); // 选择了卡片，不是取消
            });

            // hover高亮
            sprite.on('pointerover', () => {
                sprite.setScale(cardScale * 1.1);
            });

            sprite.on('pointerout', () => {
                sprite.setScale(cardScale);
            });
            
            this.scrollContainer.add(sprite);
            this.cardSprites.push(sprite);
        });

        // 计算最大滚动距离
        const rows = Math.ceil(this.cards.length / cols);
        const totalHeight = rows * (cardHeight + spacing);
        this.maxScrollY = Math.max(0, totalHeight - this.contentHeight);
    }

    /**
     * 设置交互
     */
    private setupInteraction(): void {
        // 鼠标滚轮滚动
        this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => {
            if (this.visible) {
                this.scroll(deltaY * 0.5);
            }
        });

        // 触摸拖动滚动
        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastPointerY = pointer.y;
        });

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging && this.visible) {
                const deltaY = this.lastPointerY - pointer.y;
                this.scroll(deltaY);
                this.lastPointerY = pointer.y;
            }
        });

        this.scene.input.on('pointerup', () => {
            this.isDragging = false;
        });
    }

    /**
     * 滚动
     */
    private scroll(delta: number): void {
        this.scrollY += delta;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
        
        // 更新滚动容器的 Y 偏移
        this.scrollContainer.setY(this.contentTop - this.scrollY);
    }

    /**
     * 隐藏界面
     * @param cancelled 是否是取消操作（未选择卡片）
     */
    public hide(cancelled: boolean = false): void {
        // 如果是取消且有取消回调，调用它
        if (cancelled && this.onCancel) {
            this.onCancel();
        }
        
        this.setVisible(false);
        
        // 销毁所有卡片精灵
        this.cardSprites.forEach(sprite => sprite.destroy());
        this.cardSprites = [];
        
        // 销毁遮罩
        if (this.maskShape) {
            this.maskShape.destroy();
        }
        
        // 清空所有子元素
        this.removeAll(true);
        
        // 清空回调
        this.onCardSelected = null;
        this.onCancel = null;
    }
}
