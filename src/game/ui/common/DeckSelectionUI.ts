import { GameObjects, Scene } from 'phaser';
import { CardSprite } from '../../objects/CardSprite';
import { ArtifactSprite } from '../../objects/ArtifactSprite';
import { TalismanSprite } from '../../objects/TalismanSprite';
import { FieldSprite } from '../../objects/FieldSprite';
import { PillSprite } from '../../objects/PillSprite';
import type { AnyCard } from '@data/types/cards/all';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import { INK, PX } from '../../art/palette';
import { snap } from '../../art/pix';
import { panel, pbutton, piconButton, ptext } from '../../art/kit';

type AnyCardSprite = CardSprite | ArtifactSprite | TalismanSprite | FieldSprite | PillSprite;

/**
 * 卡组选择UI
 * 用于从卡组中选择一张卡（技能"注定一抽"等）
 */
export class DeckSelectionUI extends GameObjects.Container {
    private cards: readonly AnyCard[];
    private background!: GameObjects.Rectangle;
    private overlay!: GameObjects.Rectangle;
    private titleText!: GameObjects.Text;
    private scrollContainer!: GameObjects.Container;
    private cardSprites: AnyCardSprite[] = [];
    private maskShape!: GameObjects.Graphics;
    private onCardSelected: ((card: AnyCard) => void) | null = null;
    private onCardsSelected: ((cards: readonly AnyCard[]) => void) | null = null;
    private onCancel: (() => void) | null = null;
    private isMultiSelect: boolean = false;
    private maxSelectCount: number = 1;
    private selectedCards: Set<AnyCard> = new Set();
    
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
     * @param cards 可选卡牌列表
     * @param count 选择数量（1为单选，>1为多选）
     * @param onSelected 选择完成回调（单选返回单张卡，多选返回数组）
     * @param onCancel 取消回调
     */
    public show(
        cards: readonly AnyCard[], 
        count: number = 1,
        onSelected: ((card: AnyCard) => void) | ((cards: readonly AnyCard[]) => void),
        onCancel?: () => void
    ): void {
        this.cards = cards;
        this.onCancel = onCancel || null;
        this.isMultiSelect = count > 1;
        this.maxSelectCount = count;
        this.selectedCards.clear();

        if (this.isMultiSelect) {
            // 多选模式
            this.onCardsSelected = onSelected as (cards: readonly AnyCard[]) => void;
            this.onCardSelected = null;
        } else {
            // 单选模式
            this.onCardSelected = onSelected as (card: AnyCard) => void;
            this.onCardsSelected = null;
        }
        
        this.createView();
        this.setupInteraction();
        this.setVisible(true);
    }

    /**
     * @deprecated 使用 show(cards, count, onSelected, onCancel) 代替
     */
    public showMultiSelect(cards: readonly AnyCard[], maxCount: number, onCardsSelected: (cards: readonly AnyCard[]) => void, onCancel?: () => void): void {
        this.show(cards, maxCount, onCardsSelected, onCancel);
    }

    /**
     * 创建UI
     */
    private createView(): void {
        const { width, height } = this.scene.scale;
        this.overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, INK.void, 0.78);
        this.overlay.setInteractive();
        this.overlay.on('pointerdown', () => this.hide(true));
        this.add(this.overlay);

        this.panelWidth = snap(Math.min(1400, width - PX * 60));
        this.panelHeight = snap(height - PX * 40);
        this.panelX = snap(width / 2);
        this.panelY = snap(height / 2);
        const left = this.panelX - this.panelWidth / 2, top = this.panelY - this.panelHeight / 2;
        this.add(panel(this.scene, this.panelX, this.panelY, this.panelWidth, this.panelHeight, 'ink'));
        this.background = this.scene.add.rectangle(this.panelX, this.panelY, this.panelWidth, this.panelHeight, 0, 0.001);
        this.background.setInteractive();
        this.add(this.background);

        const title = this.isMultiSelect ? `选择 ${this.maxSelectCount} 张卡` : '选择一张卡';
        this.titleText = ptext(this.scene, left + PX * 12, top + PX * 8, title, { size: 2, color: INK.paper });
        this.add(this.titleText);
        this.add(ptext(this.scene, left + PX * 12, top + PX * 34, `共 ${this.cards.length} 张`, { color: INK.mist }));
        this.add(piconButton(this.scene, left + this.panelWidth - PX * 16, top + PX * 16, 'close', () => this.hide(true), 'slate', 16));

        if (this.isMultiSelect) {
            this.add(pbutton(this.scene, { x: this.panelX, y: top + this.panelHeight - PX * 18, width: PX * 80, height: PX * 22, label: '确认选择', style: 'seal', onClick: () => this.confirmSelection() }));
        }

        this.contentLeft = left + PX * 10;
        this.contentTop = top + PX * 50;
        this.contentWidth = this.panelWidth - PX * 20;
        this.contentHeight = this.panelHeight - PX * (this.isMultiSelect ? 86 : 58);
        this.scrollContainer = this.scene.add.container(0, 0);
        this.add(this.scrollContainer);
        this.maskShape = this.scene.make.graphics({});
        this.maskShape.fillStyle(0xffffff).fillRect(this.contentLeft, this.contentTop, this.contentWidth, this.contentHeight);
        this.scrollContainer.setMask(this.maskShape.createGeometryMask());
        this.scrollContainer.setPosition(this.contentLeft, this.contentTop);
        this.createCardGrid(this.contentWidth);
        this.setDepth(6000);
    }

    /**
     * 创建卡片网格
     */
    private createCardGrid(containerWidth: number): void {
        const cardScale = 1;
        const cardWidth = 180;
        const cardHeight = 258;
        const spacing = PX * 6;
        const cols = Math.max(1, Math.floor((containerWidth + spacing) / (cardWidth + spacing)));
        const offsetX = snap((containerWidth - (cols * cardWidth + (cols - 1) * spacing)) / 2);
        
        this.cards.forEach((cardData, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            
            // 从左上角开始排列
            const x = offsetX + col * (cardWidth + spacing) + cardWidth / 2;
            const y = PX * 4 + row * (cardHeight + spacing) + cardHeight / 2;

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
                if (this.isMultiSelect) {
                    // 多选模式：切换选中状态
                    this.toggleCardSelection(cardData, sprite);
                } else {
                    // 单选模式：直接选择并关闭
                    if (this.onCardSelected) {
                        this.onCardSelected(cardData);
                    }
                    this.hide(false);
                }
            });

            // hover高亮
            sprite.on('pointerover', () => { sprite.y = y - PX * 4; });
            sprite.on('pointerout', () => { sprite.y = y; });
            
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
        this.scene.input.on('wheel', (
            _pointer: Phaser.Input.Pointer,
            _gameObjects: Phaser.GameObjects.GameObject[],
            _deltaX: number,
            deltaY: number
        ) => {
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
     * 切换卡片选中状态（多选模式）
     */
    private toggleCardSelection(card: AnyCard, sprite: AnyCardSprite): void {
        if (this.selectedCards.has(card)) {
            // 取消选中
            this.selectedCards.delete(card);
            sprite.setAlpha(1.0); // 恢复不透明
        } else {
            // 选中
            if (this.selectedCards.size >= this.maxSelectCount) {
                // 已达到最大选择数量，不能再选
                return;
            }
            this.selectedCards.add(card);
            sprite.setAlpha(0.6); // 半透明表示已选中
        }
    }

    /**
     * 确认选择（多选模式）
     */
    private confirmSelection(): void {
        if (this.selectedCards.size === 0) {
            return; // 没有选择任何卡片
        }

        if (this.onCardsSelected) {
            this.onCardsSelected(Array.from(this.selectedCards));
        }
        this.hide(false);
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
        
        // 清空回调和选中状态
        this.onCardSelected = null;
        this.onCardsSelected = null;
        this.onCancel = null;
        this.selectedCards.clear();
        this.isMultiSelect = false;
    }
}
