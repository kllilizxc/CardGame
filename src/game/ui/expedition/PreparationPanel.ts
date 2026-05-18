import { GameObjects, Scene } from 'phaser';

import { createPreparationSummary } from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import {
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedDeckCards,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
} from '../../state/PersistentStashDecks';
import type {
    ExpeditionCardStack,
    ExpeditionItemStack,
    PersistentStash,
    SavedDeck,
} from '../../types/expedition';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    onConfirm: () => void;
    onDeckSelect: (deckId: string) => void;
    onOpenDeckManager?: () => void;
}

function formatCardLine(stack: ExpeditionCardStack): string {
    return `${stack.id} ×${stack.count}`;
}

function formatItemLine(stack: ExpeditionItemStack): string {
    return `${stack.id} ×${stack.count}`;
}

function validateDeckForDisplay(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
): { valid: boolean } {
    const sizeIssue = validateDeckSize(deck.cards);
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards);

    return { valid: !sizeIssue && availabilityIssues.length === 0 };
}

function formatValidationStatusText(
    result: ReturnType<typeof validateExpeditionLoadout>,
): string {
    if (result.valid) {
        return '卡组符合要求，可以带入秘境。';
    }

    const lines: string[] = [];

    if (result.sizeIssue) {
        lines.push(formatSizeIssue(result.sizeIssue));
    }

    for (const issue of result.availabilityIssues) {
        lines.push(formatAvailabilityIssue(issue));
    }

    return lines.join('\n');
}

function formatSizeIssue(issue: DeckValidityReason): string {
    if (issue.kind === 'too-few-cards') {
        return `卡组数量不足（当前 ${issue.count} 张，需要至少 ${issue.min} 张）`;
    }

    return `卡组数量超限（当前 ${issue.count} 张，最多 ${issue.max} 张）`;
}

function formatAvailabilityIssue(issue: DeckValidityReason): string {
    if (issue.kind === 'insufficient-copies') {
        return `卡牌 ${issue.cardId} 数量不足（需要 ${issue.required} 张，储物袋中仅有 ${issue.available} 张）`;
    }

    return '';
}

const SELECTED_BORDER_COLOR = 0x7c3aed;
const VALID_INDICATOR_COLOR = 0x22c55e;
const INVALID_INDICATOR_COLOR = 0xef4444;

export class PreparationPanel extends GameObjects.Container {
    private readonly stash: PersistentStash;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private confirmButton!: GameObjects.Rectangle;

    private scrollX = 0;
    private maxScrollX = 0;
    private isDragging = false;
    private dragStartX = 0;
    private dragMoved = false;
    private pendingDeckClick: string | null = null;
    private scrollContainer?: GameObjects.Container;
    private leftIndicator?: GameObjects.Text;
    private rightIndicator?: GameObjects.Text;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;

        this.createPanel();
        scene.add.existing(this);
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(920, width * 0.78);
        const panelHeight = Math.min(720, height * 0.78);
        const panelX = width / 2;
        const panelY = height / 2 + 24;
        const leftColumnX = panelX - panelWidth / 2 + 56;
        const summary = createPreparationSummary(this.stash);
        const validation = validateExpeditionLoadout(this.stash);
        const isDeckValid = validation.valid;
        const selectedDeckId = this.stash.selectedDeckId;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 0.76);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x7c3aed, 0.9);

        const title = this.scene.add.text(leftColumnX, panelY - panelHeight / 2 + 42, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(leftColumnX, title.y + 46, '选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: panelWidth - 112 },
        });

        const deckSelectorY = subtitle.y + 52;
        const deckCardElements = this.createDeckCardRow(
            leftColumnX,
            deckSelectorY,
            panelWidth - 112,
            selectedDeckId,
        );

        const validationY = deckSelectorY + 100;
        const validationColor = isDeckValid ? '#86efac' : '#fca5a5';
        const validationText = this.scene.add.text(leftColumnX, validationY, formatValidationStatusText(validation), {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: validationColor,
            wordWrap: { width: panelWidth - 112 },
        });

        const loadoutSummaryY = validationY + 46;
        const loadoutSummaryText = this.scene.add.text(leftColumnX, loadoutSummaryY, `带入合计：${summary.deckCount} 张卡 · ${summary.itemCount} 件道具`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#93c5fd',
        });

        const spiritStonesY = loadoutSummaryY + 38;
        const spiritStonesText = this.scene.add.text(leftColumnX, spiritStonesY, `灵石：${summary.spiritStones}`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#fde68a',
            fontStyle: 'bold',
        });

        const deckHeadingY = spiritStonesY + 52;
        const deckHeading = this.scene.add.text(leftColumnX, deckHeadingY, '初始卡组', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });

        const deckListY = deckHeadingY + 36;
        const deckList = this.scene.add.text(leftColumnX, deckListY, getSelectedDeckCards(this.stash).map(formatCardLine).join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '18px',
            color: '#e2e8f0',
            lineSpacing: 8,
        });

        const rightColumnX = panelX + 110;
        const itemsHeading = this.scene.add.text(rightColumnX, deckHeadingY, '初始道具', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#86efac',
            fontStyle: 'bold',
        });

        const itemsText = this.scene.add.text(rightColumnX, itemsHeading.y + 36, this.stash.items.map(formatItemLine).join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '18px',
            color: '#e2e8f0',
            lineSpacing: 8,
        });

        const buttonY = panelY + panelHeight / 2 - 64;
        const deckManagerButtonX = panelX - 120;

        const deckManagerButton = this.scene.add.rectangle(deckManagerButtonX, buttonY, 180, 56, 0x7c3aed, 1);
        deckManagerButton.setStrokeStyle(2, 0xffffff, 0.9);
        deckManagerButton.setInteractive({ useHandCursor: true });
        deckManagerButton.on('pointerover', () => deckManagerButton.setFillStyle(0x8b5cf6));
        deckManagerButton.on('pointerout', () => deckManagerButton.setFillStyle(0x7c3aed));
        deckManagerButton.on('pointerdown', () => this.openDeckManager());

        const deckManagerLabel = this.scene.add.text(deckManagerButtonX, buttonY, '管理卡组', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const confirmButtonX = panelX + 120;
        const buttonColor = isDeckValid ? 0x2563eb : 0x374151;
        const buttonStrokeAlpha = isDeckValid ? 0.9 : 0.35;

        this.confirmButton = this.scene.add.rectangle(confirmButtonX, buttonY, 200, 56, buttonColor, 1);
        this.confirmButton.setStrokeStyle(2, 0xffffff, buttonStrokeAlpha);

        if (isDeckValid) {
            this.confirmButton.setInteractive({ useHandCursor: true });
            this.confirmButton.on('pointerover', () => this.confirmButton.setFillStyle(0x3b82f6));
            this.confirmButton.on('pointerout', () => this.confirmButton.setFillStyle(0x2563eb));
            this.confirmButton.on('pointerdown', () => this.confirmLoadout());
        } else {
            this.confirmButton.setAlpha(0.55);
        }

        const confirmLabel = this.scene.add.text(confirmButtonX, buttonY, '确认带入', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add([
            overlay,
            panel,
            title,
            subtitle,
            ...deckCardElements,
            validationText,
            loadoutSummaryText,
            spiritStonesText,
            deckHeading,
            deckList,
            itemsHeading,
            itemsText,
            deckManagerButton,
            deckManagerLabel,
            this.confirmButton,
            confirmLabel,
        ]);

        if (this.maxScrollX > 0) {
            this.setupScrollInteraction();
        }

        this.setDepth(1000);
    }

    private createDeckCardRow(
        startX: number,
        y: number,
        maxWidth: number,
        selectedDeckId: string | null,
    ): Phaser.GameObjects.GameObject[] {
        const elements: Phaser.GameObjects.GameObject[] = [];
        const decks = this.stash.savedDecks;
        const cardWidth = 200;
        const cardHeight = 80;
        const cardGap = 12;
        const totalContentWidth = decks.length * cardWidth + (decks.length - 1) * cardGap;
        const needsScroll = totalContentWidth > maxWidth;

        this.maxScrollX = Math.max(0, totalContentWidth - maxWidth);
        this.scrollX = 0;

        // Mask for clipping the visible scroll area
        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(startX, y, maxWidth, cardHeight);
        const mask = maskGraphics.createGeometryMask();
        elements.push(maskGraphics);

        // Inner container holds all deck cards, positioned relative to 0
        const innerContainer = this.scene.add.container(0, 0);
        this.scrollContainer = innerContainer;

        // Outer container positioned at the scroll area origin, masked
        const outerContainer = this.scene.add.container(startX, y);
        outerContainer.add(innerContainer);
        outerContainer.setMask(mask);
        elements.push(outerContainer);

        decks.forEach((deck, index) => {
            const cardX = index * (cardWidth + cardGap) + cardWidth / 2;
            const cardY = cardHeight / 2;
            const isSelected = deck.id === selectedDeckId;
            const displayValidation = validateDeckForDisplay(deck, this.stash.cards);
            const indicatorColor = displayValidation.valid ? VALID_INDICATOR_COLOR : INVALID_INDICATOR_COLOR;

            const bg = this.scene.add.rectangle(cardX, cardY, cardWidth, cardHeight, 0x1e293b, 0.94);
            bg.setStrokeStyle(2, isSelected ? SELECTED_BORDER_COLOR : 0x475569, 1);

            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(0x334155, 1));
            bg.on('pointerout', () => bg.setFillStyle(0x1e293b, 0.94));
            bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                this.pendingDeckClick = deck.id;
                this.dragStartX = pointer.x;
                this.isDragging = true;
                this.dragMoved = false;
            });

            const deckName = this.scene.add.text(cardX - cardWidth / 2 + 12, cardY - 20, deck.name, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#f8fafc',
                fontStyle: 'bold',
            });

            const cardCount = countDeckCards(deck.cards);
            const countText = this.scene.add.text(
                cardX - cardWidth / 2 + 12,
                cardY + 8,
                `${cardCount} / ${DECK_CARD_MIN}-${DECK_CARD_MAX}`,
                {
                    fontFamily: 'Arial',
                    fontSize: '14px',
                    color: '#94a3b8',
                },
            );

            const indicator = this.scene.add.rectangle(cardX + cardWidth / 2 - 18, cardY - cardHeight / 2 + 18, 12, 12, indicatorColor, 1);

            innerContainer.add([bg, deckName, countText, indicator]);
        });

        // Scroll overflow indicators
        if (needsScroll) {
            this.leftIndicator = this.scene.add.text(startX + 8, y + cardHeight / 2, '◀', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#7c3aed',
            }).setOrigin(0.5).setAlpha(0);
            this.rightIndicator = this.scene.add.text(startX + maxWidth - 8, y + cardHeight / 2, '▶', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#7c3aed',
            }).setOrigin(0.5).setAlpha(0);
            this.updateScrollIndicators();
            elements.push(this.leftIndicator, this.rightIndicator);
        }

        return elements;
    }

    private setupScrollInteraction(): void {
        this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
            if (!this.visible) return;
            this.applyScroll(this.scrollX + deltaY * 0.5);
        });

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.visible || !this.isDragging) return;
            const dx = this.dragStartX - pointer.x;
            if (!this.dragMoved && Math.abs(dx) > 3) {
                this.dragMoved = true;
            }
            if (this.dragMoved) {
                this.applyScroll(this.scrollX + dx);
                this.dragStartX = pointer.x;
            }
        });

        this.scene.input.on('pointerup', () => {
            if (!this.isDragging) return;
            if (!this.dragMoved && this.pendingDeckClick !== null) {
                this.onDeckSelect(this.pendingDeckClick);
            }
            this.isDragging = false;
            this.dragMoved = false;
            this.pendingDeckClick = null;
        });
    }

    private applyScroll(desired: number): void {
        this.scrollX = Phaser.Math.Clamp(desired, 0, this.maxScrollX);
        if (this.scrollContainer) {
            this.scrollContainer.setX(-this.scrollX);
        }
        this.updateScrollIndicators();
    }

    private updateScrollIndicators(): void {
        if (this.leftIndicator) {
            this.leftIndicator.setAlpha(this.scrollX > 1 ? 1 : 0);
        }
        if (this.rightIndicator) {
            this.rightIndicator.setAlpha(this.scrollX < this.maxScrollX - 1 ? 1 : 0);
        }
    }

    private confirmLoadout(): void {
        this.onConfirm();
    }

    private openDeckManager(): void {
        this.onOpenDeckManager?.();
    }
}
