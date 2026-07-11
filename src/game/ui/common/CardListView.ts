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

type ListCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;
type ListCardSprite = CardSprite | ArtifactSprite | TalismanSprite | FieldSprite | PillSprite;

/**
 * 通用的卡片列表视图
 * 用于展示卡组、弃牌堆等卡片列表
 */
export class CardListView extends GameObjects.Container {
    private title: string;
    private cards: ListCard[];
    private background!: GameObjects.Rectangle;
    private scrollContainer!: GameObjects.Container;
    private cardSprites: ListCardSprite[] = [];
    private maskShape!: GameObjects.Graphics;

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

    constructor(scene: Scene, title: string, cards: ListCard[]) {
        super(scene, 0, 0);

        this.title = title;
        this.cards = cards;

        this.createView();
        this.setupInteraction();

        scene.add.existing(this);
    }

    private createView(): void {
        const { width, height } = this.scene.scale;

        const overlay = createBattleOverlay(this.scene, 0.84);
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());
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

        const titleText = this.scene.add.text(contentX, panelTop + 48, this.title, getSceneTextStyle('panelTitle', {
            fontSize: '34px',
        }));
        this.add(titleText);

        const countText = this.scene.add.text(
            contentX,
            panelTop + 96,
            `共 ${this.cards.length} 张卡牌`,
            getSceneTextStyle('support', {
                fontSize: '18px',
                color: battleTheme.colors.textSupport,
            }),
        );
        this.add(countText);

        const closeButton = createSceneButton(this.scene, {
            x: this.panelX + this.panelWidth / 2 - 114,
            y: panelTop + 62,
            width: 148,
            height: 56,
            label: '收起',
            variant: 'secondary',
            onClick: () => this.close(),
        });
        this.add(closeButton.objects);

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

        this.setDepth(5000);
    }

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

            let sprite: ListCardSprite;
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

            this.scrollContainer.add(sprite);
            this.cardSprites.push(sprite);
        });

        const rows = Math.ceil(this.cards.length / cols);
        const totalHeight = rows * (cardHeight + spacing);
        this.maxScrollY = Math.max(0, totalHeight - this.contentHeight);
    }

    private setupInteraction(): void {
        this.wheelHandler = (_pointer, _gameObjects, _deltaX, deltaY) => {
            this.scroll(deltaY * 0.5);
        };
        this.scene.input.on('wheel', this.wheelHandler);

        this.background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.lastPointerY = pointer.y;
        });

        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (this.isDragging) {
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

        this.escHandler = () => this.close();
        this.scene.input.keyboard?.on('keydown-ESC', this.escHandler);
    }

    private scroll(delta: number): void {
        this.scrollY += delta;
        this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScrollY);
        this.scrollContainer.setY(this.contentTop - this.scrollY);
    }

    private close(): void {
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

        this.cardSprites.forEach((sprite) => sprite.destroy());
        this.cardSprites = [];
        this.maskShape?.destroy();
        this.destroy();
    }
}
