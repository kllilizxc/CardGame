import { GameObjects, Scene } from 'phaser';

import { CardSprite } from '../../objects/CardSprite';
import { ArtifactSprite } from '../../objects/ArtifactSprite';
import { TalismanSprite } from '../../objects/TalismanSprite';
import { FieldSprite } from '../../objects/FieldSprite';
import { PillSprite } from '../../objects/PillSprite';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import { createSceneButton, createScenePanel, getSceneTextStyle } from '../../scenes/shared/sceneTheme';
import { battleTheme, createBattleOverlay } from '../battle/battleTheme';

type AnyCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;
type AnyCardSprite = CardSprite | ArtifactSprite | TalismanSprite | FieldSprite | PillSprite;

/**
 * 卡组选择UI
 * 用于从卡组中选择一张卡（技能"注定一抽"等）
 */
export class DeckSelectionUI extends GameObjects.Container {
    private readonly previewContextId = 'deck-selection';

    private cards: AnyCard[];
    private background!: GameObjects.Rectangle;
    private countText!: GameObjects.Text;
    private scrollContainer!: GameObjects.Container;
    private cardSprites: AnyCardSprite[] = [];
    private maskShape!: GameObjects.Graphics;
    private onCardSelected: ((card: AnyCard) => void) | null = null;
    private onCardsSelected: ((cards: AnyCard[]) => void) | null = null;
    private onCancel: (() => void) | null = null;
    private isMultiSelect = false;
    private maxSelectCount = 1;
    private selectedCards: Set<AnyCard> = new Set();

    private scrollY = 0;
    private maxScrollY = 0;
    private isDragging = false;
    private lastPointerY = 0;
    private panelWidth = 0;
    private panelHeight = 0;
    private panelX = 0;
    private panelY = 0;
    private contentLeft = 0;
    private contentTop = 0;
    private contentWidth = 0;
    private contentHeight = 0;
    private wheelHandler?: (_pointer: Phaser.Input.Pointer, _gameObjects: any[], _deltaX: number, deltaY: number) => void;
    private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerUpHandler?: () => void;
    private escHandler?: () => void;
    private previewSourceLabel = '选卡弹层';

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
        cards: AnyCard[],
        count: number = 1,
        onSelected: ((card: AnyCard) => void) | ((cards: AnyCard[]) => void),
        onCancel?: () => void,
    ): void {
        if (this.visible) {
            this.hide(true);
        }

        this.cards = cards;
        this.onCancel = onCancel || null;
        this.isMultiSelect = count > 1;
        this.maxSelectCount = count;
        this.selectedCards.clear();
        this.scrollY = 0;
        this.maxScrollY = 0;
        this.previewSourceLabel = this.isMultiSelect ? '多选弹层' : '选卡弹层';

        if (this.isMultiSelect) {
            this.onCardsSelected = onSelected as (cards: AnyCard[]) => void;
            this.onCardSelected = null;
        } else {
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
    public showMultiSelect(cards: AnyCard[], maxCount: number, onCardsSelected: (cards: AnyCard[]) => void, onCancel?: () => void): void {
        this.show(cards, maxCount, onCardsSelected, onCancel);
    }

    /**
     * 创建UI
     */
    private createView(): void {
        const { width, height } = this.scene.scale;

        const overlay = createBattleOverlay(this.scene, 0.84);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.hide(true));
        this.add(overlay);

        this.panelWidth = Math.min(1320, width * 0.88);
        this.panelHeight = Math.min(820, height * 0.82);
        this.panelX = width / 2;
        this.panelY = height / 2;

        const panelObjects = createScenePanel(this.scene, {
            x: this.panelX,
            y: this.panelY,
            width: this.panelWidth,
            height: this.panelHeight,
        });
        this.add(panelObjects);

        this.background = panelObjects[1] as GameObjects.Rectangle;
        this.background.setInteractive();

        const panelTop = this.panelY - this.panelHeight / 2;
        const panelLeft = this.panelX - this.panelWidth / 2;
        const contentX = panelLeft + 56;

        const titleText = this.isMultiSelect
            ? `从牌库中选择 ${this.maxSelectCount} 张卡`
            : '从牌库中选择一张卡';
        const titleLabel = this.scene.add.text(contentX, panelTop + 48, titleText, getSceneTextStyle('panelTitle', {
            fontSize: '34px',
        }));
        this.add(titleLabel);

        this.countText = this.scene.add.text(contentX, panelTop + 96, '', getSceneTextStyle('support', {
            fontSize: '18px',
            color: battleTheme.colors.textSupport,
        }));
        this.add(this.countText);
        this.refreshCountText();

        const closeButton = createSceneButton(this.scene, {
            x: this.panelX + this.panelWidth / 2 - 114,
            y: panelTop + 62,
            width: 148,
            height: 56,
            label: '取消',
            variant: 'secondary',
            onClick: () => this.hide(true),
        });
        this.add(closeButton.objects);

        if (this.isMultiSelect) {
            const confirmButton = createSceneButton(this.scene, {
                x: this.panelX + this.panelWidth / 2 - 292,
                y: panelTop + 62,
                width: 164,
                height: 56,
                label: '确认选择',
                variant: 'primary',
                onClick: () => this.confirmSelection(),
            });
            this.add(confirmButton.objects);
        }

        this.contentLeft = panelLeft + 40;
        this.contentTop = panelTop + 142;
        this.contentWidth = this.panelWidth - 80;
        this.contentHeight = this.panelHeight - 224;

        const contentBackground = this.scene.add.rectangle(
            this.panelX,
            this.contentTop + this.contentHeight / 2,
            this.contentWidth,
            this.contentHeight,
            0x000000,
            0,
        );
        contentBackground.setStrokeStyle(2, 0xd9c6a2, 0.16);
        this.add(contentBackground);

        this.scrollContainer = this.scene.add.container(0, 0);
        this.add(this.scrollContainer);

        this.maskShape = this.scene.add.graphics();
        this.maskShape.fillStyle(0xffffff);
        this.maskShape.fillRect(this.contentLeft, this.contentTop, this.contentWidth, this.contentHeight);
        this.scrollContainer.setMask(this.maskShape.createGeometryMask());
        this.scrollContainer.setPosition(this.contentLeft, this.contentTop);

        this.createCardGrid(this.contentWidth);

        if (this.maxScrollY > 0) {
            const scrollHint = this.scene.add.text(
                this.panelX,
                this.panelY + this.panelHeight / 2 - 34,
                '滚动以查看更多卡牌',
                getSceneTextStyle('support', {
                    fontSize: '18px',
                    color: battleTheme.colors.textSupport,
                }),
            ).setOrigin(0.5);
            this.add(scrollHint);
        }

        this.setDepth(6000);
    }

    /**
     * 创建卡片网格
     */
    private createCardGrid(containerWidth: number): void {
        const cardScale = 1;
        const cardWidth = 180 * cardScale;
        const cardHeight = 260 * cardScale;
        const spacing = 28;
        const cols = Math.max(1, Math.floor((containerWidth + spacing) / (cardWidth + spacing)));

        this.cards.forEach((cardData, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
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
            } else {
                sprite = new PillSprite(this.scene, x, y, cardData as PillCard, cardScale);
            }

            sprite.disableDragging();
            sprite.setDisplayMode('deck');
            sprite.setPreviewMetadata({
                contextId: this.previewContextId,
                sourceLabel: this.previewSourceLabel,
            });

            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                if (this.isMultiSelect) {
                    this.toggleCardSelection(cardData, sprite);
                } else {
                    if (this.onCardSelected) {
                        this.onCardSelected(cardData);
                    }
                    this.hide(false);
                }
            });

            sprite.on('pointerover', () => {
                if (!this.selectedCards.has(cardData)) {
                    sprite.setScale(cardScale * 1.04);
                }
            });

            sprite.on('pointerout', () => {
                sprite.setScale(this.selectedCards.has(cardData) ? cardScale * 0.98 : cardScale);
            });

            this.scrollContainer.add(sprite);
            this.cardSprites.push(sprite);
        });

        const rows = Math.ceil(this.cards.length / cols);
        const totalHeight = rows * (cardHeight + spacing);
        this.maxScrollY = Math.max(0, totalHeight - this.contentHeight);
    }

    /**
     * 设置交互
     */
    private setupInteraction(): void {
        this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
            if (this.visible) {
                this.scroll(deltaY * 0.5);
            }
        };
        this.scene.input.on('wheel', this.wheelHandler);

        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastPointerY = pointer.y;
        });

        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging && this.visible) {
                const deltaY = this.lastPointerY - pointer.y;
                this.scroll(deltaY);
                this.lastPointerY = pointer.y;
            }
        };
        this.scene.input.on('pointermove', this.pointerMoveHandler);

        this.pointerUpHandler = () => {
            this.isDragging = false;
        };
        this.scene.input.on('pointerup', this.pointerUpHandler);

        this.escHandler = () => this.hide(true);
        this.scene.input.keyboard?.on('keydown-ESC', this.escHandler);
    }

    /**
     * 滚动
     */
    private scroll(delta: number): void {
        this.scrollY += delta;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
        this.scrollContainer.setY(this.contentTop - this.scrollY);
    }

    /**
     * 切换卡片选中状态（多选模式）
     */
    private toggleCardSelection(card: AnyCard, sprite: AnyCardSprite): void {
        const selectedScale = sprite.getCardBaseScale() * 0.98;

        if (this.selectedCards.has(card)) {
            this.selectedCards.delete(card);
            sprite.setAlpha(1);
            sprite.setScale(sprite.getCardBaseScale());
        } else {
            if (this.selectedCards.size >= this.maxSelectCount) {
                return;
            }
            this.selectedCards.add(card);
            sprite.setAlpha(0.74);
            sprite.setScale(selectedScale);
        }

        this.refreshCountText();
    }

    /**
     * 确认选择（多选模式）
     */
    private confirmSelection(): void {
        if (this.selectedCards.size === 0) {
            return;
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
        this.scene.events.emit('clearCardPreviewContext', this.previewContextId);

        if (cancelled && this.onCancel) {
            this.onCancel();
        }

        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
            this.wheelHandler = undefined;
        }
        if (this.pointerMoveHandler) {
            this.scene.input.off('pointermove', this.pointerMoveHandler);
            this.pointerMoveHandler = undefined;
        }
        if (this.pointerUpHandler) {
            this.scene.input.off('pointerup', this.pointerUpHandler);
            this.pointerUpHandler = undefined;
        }
        if (this.escHandler) {
            this.scene.input.keyboard?.off('keydown-ESC', this.escHandler);
            this.escHandler = undefined;
        }

        this.setVisible(false);

        this.cardSprites.forEach((sprite) => sprite.destroy());
        this.cardSprites = [];

        if (this.maskShape) {
            this.maskShape.destroy();
        }

        this.removeAll(true);

        this.onCardSelected = null;
        this.onCardsSelected = null;
        this.onCancel = null;
        this.selectedCards.clear();
        this.isMultiSelect = false;
    }

    private refreshCountText(): void {
        if (!this.countText) {
            return;
        }

        if (this.isMultiSelect) {
            this.countText.setText(`共 ${this.cards.length} 张卡牌 · 已选择 ${this.selectedCards.size}/${this.maxSelectCount}`);
        } else {
            this.countText.setText(`共 ${this.cards.length} 张卡牌`);
        }
    }
}
