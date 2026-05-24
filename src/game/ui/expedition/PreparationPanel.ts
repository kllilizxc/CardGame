import { GameObjects, Scene } from 'phaser';

import { createPreparationSummary } from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import {
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedDeckCards,
    getSelectedSavedDeck,
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

interface DeckDisplayState {
    valid: boolean;
    statusLabel: string;
    detailText: string;
    fillColor: number;
    hoverFillColor: number;
    borderColor: number;
    accentColor: number;
    badgeColor: string;
    badgeBackgroundColor: string;
    detailColor: string;
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
): { valid: boolean; sizeIssue: DeckValidityReason | null; availabilityIssues: DeckValidityReason[] } {
    const sizeIssue = validateDeckSize(deck.cards);
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards);

    return {
        valid: !sizeIssue && availabilityIssues.length === 0,
        sizeIssue,
        availabilityIssues,
    };
}

function formatValidationLines(
    result: ReturnType<typeof validateExpeditionLoadout>,
): string[] {
    if (result.valid) {
        return ['卡组符合要求，可以带入秘境。'];
    }

    const lines: string[] = [];

    if (result.sizeIssue) {
        lines.push(formatSizeIssue(result.sizeIssue));
    }

    for (const issue of result.availabilityIssues) {
        lines.push(formatAvailabilityIssue(issue));
    }

    if (lines.length === 0) {
        lines.push('请先在管理卡组中创建或选择一套可用卡组。');
    }

    return lines;
}

function formatValidationStatusText(
    result: ReturnType<typeof validateExpeditionLoadout>,
): string {
    return formatValidationLines(result).join('\n');
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

function formatPreviewList(lines: string[], maxLines: number): string {
    if (lines.length === 0) {
        return '无';
    }

    if (lines.length <= maxLines) {
        return lines.join('\n');
    }

    return [...lines.slice(0, maxLines), `……另 ${lines.length - maxLines} 项`].join('\n');
}

function createDeckDisplayState(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
    isSelected: boolean,
): DeckDisplayState {
    const validation = validateDeckForDisplay(deck, stashCards);
    const cardCount = countDeckCards(deck.cards);

    if (validation.valid && isSelected) {
        return {
            valid: true,
            statusLabel: '当前带入',
            detailText: `${cardCount} 张卡已就绪，可直接出发。`,
            fillColor: 0x172554,
            hoverFillColor: 0x1d4ed8,
            borderColor: 0x60a5fa,
            accentColor: 0x3b82f6,
            badgeColor: '#dbeafe',
            badgeBackgroundColor: '#2563eb',
            detailColor: '#bfdbfe',
        };
    }

    if (validation.valid) {
        return {
            valid: true,
            statusLabel: '可带入',
            detailText: `${cardCount} 张卡满足当前带入要求。`,
            fillColor: 0x12201d,
            hoverFillColor: 0x163123,
            borderColor: 0x365314,
            accentColor: 0x22c55e,
            badgeColor: '#dcfce7',
            badgeBackgroundColor: '#166534',
            detailColor: '#bbf7d0',
        };
    }

    if (validation.sizeIssue?.kind === 'too-few-cards') {
        const missingCount = validation.sizeIssue.min - validation.sizeIssue.count;

        return {
            valid: false,
            statusLabel: isSelected ? '当前带入 · 需调整' : '需调整',
            detailText: `还差 ${missingCount} 张卡才能出发。`,
            fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
            hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
            borderColor: 0xf87171,
            accentColor: 0xef4444,
            badgeColor: '#fee2e2',
            badgeBackgroundColor: '#b91c1c',
            detailColor: '#fecaca',
        };
    }

    if (validation.sizeIssue?.kind === 'too-many-cards') {
        const excessCount = validation.sizeIssue.count - validation.sizeIssue.max;

        return {
            valid: false,
            statusLabel: isSelected ? '当前带入 · 需调整' : '需调整',
            detailText: `超出 ${excessCount} 张卡，请精简后再出发。`,
            fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
            hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
            borderColor: 0xf87171,
            accentColor: 0xef4444,
            badgeColor: '#fee2e2',
            badgeBackgroundColor: '#b91c1c',
            detailColor: '#fecaca',
        };
    }

    const shortageCount = validation.availabilityIssues.reduce(
        (sum, issue) => issue.kind === 'insufficient-copies' ? sum + Math.max(0, issue.required - issue.available) : sum,
        0,
    );
    const availabilityText = validation.availabilityIssues.length === 1
        ? '1 项卡牌数量不足。'
        : `${validation.availabilityIssues.length} 项卡牌数量不足，共缺少 ${shortageCount} 张。`;

    return {
        valid: false,
        statusLabel: isSelected ? '当前带入 · 需调整' : '需调整',
        detailText: availabilityText,
        fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
        hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
        borderColor: 0xf87171,
        accentColor: 0xef4444,
        badgeColor: '#fee2e2',
        badgeBackgroundColor: '#b91c1c',
        detailColor: '#fecaca',
    };
}

function createActionButton(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    colors: { fill: number; hover: number; stroke: number; text: string },
    onClick: () => void,
    enabled = true,
): { background: GameObjects.Rectangle; label: GameObjects.Text } {
    const background = scene.add.rectangle(x, y, width, height, colors.fill, 1);
    background.setStrokeStyle(2, colors.stroke, enabled ? 0.95 : 0.38);

    if (enabled) {
        background.setInteractive({ useHandCursor: true });
        background.on('pointerover', () => background.setFillStyle(colors.hover, 1));
        background.on('pointerout', () => background.setFillStyle(colors.fill, 1));
        background.on('pointerdown', onClick);
    } else {
        background.setAlpha(0.55);
    }

    const text = scene.add.text(x, y, label, {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: colors.text,
        fontStyle: 'bold',
    }).setOrigin(0.5);

    if (!enabled) {
        text.setAlpha(0.76);
    }

    return { background, label: text };
}

export class PreparationPanel extends GameObjects.Container {
    private readonly stash: PersistentStash;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;

    private scrollX = 0;
    private maxScrollX = 0;
    private isDragging = false;
    private dragStartX = 0;
    private dragMoved = false;
    private pendingDeckClick: string | null = null;
    private scrollContainer?: GameObjects.Container;
    private leftIndicator?: GameObjects.Text;
    private rightIndicator?: GameObjects.Text;
    private wheelHandler?: (
        pointer: Phaser.Input.Pointer,
        gameObjects: unknown[],
        deltaX: number,
        deltaY: number,
    ) => void;
    private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
    private pointerUpHandler?: () => void;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;

        this.createPanel();
        this.once(Phaser.GameObjects.Events.DESTROY, () => this.teardownScrollInteraction());
        scene.add.existing(this);
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(980, width * 0.82);
        const panelHeight = Math.min(760, height * 0.84);
        const panelX = width / 2;
        const panelY = height / 2 + 24;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentLeft = panelLeft + 48;
        const contentWidth = panelWidth - 96;
        const summary = createPreparationSummary(this.stash);
        const validation = validateExpeditionLoadout(this.stash);
        const validationLines = formatValidationLines(validation);
        const validationHeight = Math.max(104, 86 + (validationLines.length - 1) * 24);
        const isDeckValid = validation.valid;
        const selectedDeckId = this.stash.selectedDeckId;
        const selectedDeck = getSelectedSavedDeck(this.stash);
        const selectedDeckName = selectedDeck?.name ?? '未选择卡组';
        const selectedDeckCards = getSelectedDeckCards(this.stash);
        const deckPreviewText = formatPreviewList(selectedDeckCards.map(formatCardLine), 6);
        const itemPreviewText = formatPreviewList(this.stash.items.map(formatItemLine), 6);

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x030712, 0.8);
        const shadow = this.scene.add.rectangle(panelX, panelY + 12, panelWidth + 16, panelHeight + 16, 0x020617, 0.42);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x0f172a, 0.98);
        panel.setStrokeStyle(3, 0x60a5fa, 0.82);
        const panelAccent = this.scene.add.rectangle(panelX, panelTop + 6, panelWidth - 36, 6, 0x7c3aed, 0.96).setOrigin(0.5, 0);

        const title = this.scene.add.text(contentLeft, panelTop + 34, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(contentLeft, title.y + 48, '选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: contentWidth },
        });

        const deckSelectorY = subtitle.y + 46;
        const deckCardElements = this.createDeckCardRow(
            contentLeft,
            deckSelectorY,
            contentWidth,
            selectedDeckId,
        );

        const scrollHint = this.maxScrollX > 0
            ? this.scene.add.text(contentLeft, deckSelectorY + 138, '拖动或滚轮浏览更多卡组，点按卡片即可切换本次带入卡组。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#a78bfa',
            })
            : this.scene.add.text(contentLeft, deckSelectorY + 138, '点按卡片即可切换本次带入卡组。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#94a3b8',
            });

        const validationTop = scrollHint.y + 24;
        const validationCard = this.scene.add.rectangle(
            panelX,
            validationTop + validationHeight / 2,
            contentWidth,
            validationHeight,
            isDeckValid ? 0x10261d : 0x2a1420,
            0.96,
        );
        validationCard.setStrokeStyle(2, isDeckValid ? 0x22c55e : 0xef4444, 0.92);
        const validationBadge = this.scene.add.text(contentLeft + 18, validationTop + 16, isDeckValid ? '已满足带入要求' : '出发前仍需调整', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: isDeckValid ? '#bbf7d0' : '#fecaca',
            fontStyle: 'bold',
            backgroundColor: isDeckValid ? '#14532d' : '#7f1d1d',
            padding: { left: 12, right: 12, top: 6, bottom: 6 },
        });
        const validationText = this.scene.add.text(contentLeft + 18, validationBadge.y + 40, formatValidationStatusText(validation), {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: isDeckValid ? '#dcfce7' : '#fee2e2',
            wordWrap: { width: contentWidth - 36 },
            lineSpacing: 6,
        });
        const validationSubtext = this.scene.add.text(contentLeft + 18, validationCard.y + validationHeight / 2 - 24, isDeckValid
            ? '确认带入后会按当前所选卡组创建本次秘境快照。'
            : '确认带入会保持禁用，直到当前所选卡组满足带入条件。', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: isDeckValid ? '#86efac' : '#fca5a5',
            wordWrap: { width: contentWidth - 36 },
        });

        const statsTop = validationTop + validationHeight + 16;
        const statsGap = 16;
        const statWidth = (contentWidth - statsGap * 2) / 3;
        const statHeight = 78;
        const loadoutCard = this.scene.add.rectangle(contentLeft + statWidth / 2, statsTop + statHeight / 2, statWidth, statHeight, 0x111827, 0.96);
        loadoutCard.setStrokeStyle(2, 0x334155, 0.85);
        const itemsCard = this.scene.add.rectangle(contentLeft + statWidth + statsGap + statWidth / 2, statsTop + statHeight / 2, statWidth, statHeight, 0x111827, 0.96);
        itemsCard.setStrokeStyle(2, 0x334155, 0.85);
        const stonesCard = this.scene.add.rectangle(contentLeft + (statWidth + statsGap) * 2 + statWidth / 2, statsTop + statHeight / 2, statWidth, statHeight, 0x111827, 0.96);
        stonesCard.setStrokeStyle(2, 0x334155, 0.85);

        const loadoutLabel = this.scene.add.text(contentLeft + 20, statsTop + 16, '带入卡牌', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#94a3b8',
        });
        const loadoutValue = this.scene.add.text(contentLeft + 20, loadoutLabel.y + 26, `${summary.deckCount} 张`, {
            fontFamily: 'Arial',
            fontSize: '26px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });

        const itemsLabel = this.scene.add.text(contentLeft + statWidth + statsGap + 20, statsTop + 16, '携带道具', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#94a3b8',
        });
        const itemsValue = this.scene.add.text(itemsLabel.x, itemsLabel.y + 26, `${summary.itemCount} 件`, {
            fontFamily: 'Arial',
            fontSize: '26px',
            color: '#86efac',
            fontStyle: 'bold',
        });

        const stonesLabel = this.scene.add.text(contentLeft + (statWidth + statsGap) * 2 + 20, statsTop + 16, '灵石：', {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#94a3b8',
        });
        const stonesValue = this.scene.add.text(stonesLabel.x, stonesLabel.y + 26, `${summary.spiritStones}`, {
            fontFamily: 'Arial',
            fontSize: '26px',
            color: '#fde68a',
            fontStyle: 'bold',
        });

        const infoTop = statsTop + statHeight + 16;
        const infoGap = 18;
        const infoWidth = (contentWidth - infoGap) / 2;
        const infoHeight = 148;
        const deckInfoCard = this.scene.add.rectangle(contentLeft + infoWidth / 2, infoTop + infoHeight / 2, infoWidth, infoHeight, 0x111827, 0.96);
        deckInfoCard.setStrokeStyle(2, 0x334155, 0.85);
        const itemsInfoCard = this.scene.add.rectangle(contentLeft + infoWidth + infoGap + infoWidth / 2, infoTop + infoHeight / 2, infoWidth, infoHeight, 0x111827, 0.96);
        itemsInfoCard.setStrokeStyle(2, 0x334155, 0.85);

        const deckHeading = this.scene.add.text(contentLeft + 20, infoTop + 16, '初始卡组', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        const deckMeta = this.scene.add.text(contentLeft + infoWidth - 20, infoTop + 20, selectedDeckName, {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#bfdbfe',
        }).setOrigin(1, 0);
        const deckList = this.scene.add.text(contentLeft + 20, deckHeading.y + 38, deckPreviewText, {
            fontFamily: 'Courier New',
            fontSize: '16px',
            color: '#e2e8f0',
            lineSpacing: 6,
            wordWrap: { width: infoWidth - 40 },
        });

        const itemsHeading = this.scene.add.text(contentLeft + infoWidth + infoGap + 20, infoTop + 16, '初始道具', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#86efac',
            fontStyle: 'bold',
        });
        const itemsMeta = this.scene.add.text(contentLeft + infoWidth + infoGap + infoWidth - 20, infoTop + 20, summary.itemCount > 0 ? '本次会随卡组一起带入' : '当前未携带道具', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#bbf7d0',
        }).setOrigin(1, 0);
        const itemsText = this.scene.add.text(contentLeft + infoWidth + infoGap + 20, itemsHeading.y + 38, itemPreviewText, {
            fontFamily: 'Courier New',
            fontSize: '16px',
            color: '#e2e8f0',
            lineSpacing: 6,
            wordWrap: { width: infoWidth - 40 },
        });

        const actionTop = infoTop + infoHeight + 16;
        const actionHeight = 82;
        const actionBar = this.scene.add.rectangle(panelX, actionTop + actionHeight / 2, contentWidth, actionHeight, 0x111827, 0.98);
        actionBar.setStrokeStyle(2, 0x334155, 0.88);
        const actionTitle = this.scene.add.text(contentLeft + 20, actionTop + 18, `当前带入：${selectedDeckName}`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const actionSummary = this.scene.add.text(contentLeft + 20, actionTitle.y + 32, `带入合计：${summary.deckCount} 张卡 · ${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#94a3b8',
            wordWrap: { width: contentWidth - 420 },
        });

        const deckManagerButton = createActionButton(
            this.scene,
            panelX + contentWidth / 2 - 288,
            actionBar.y,
            180,
            56,
            '管理卡组',
            {
                fill: 0x1e293b,
                hover: 0x334155,
                stroke: 0x94a3b8,
                text: '#f8fafc',
            },
            () => this.openDeckManager(),
        );

        const confirmButton = createActionButton(
            this.scene,
            panelX + contentWidth / 2 - 110,
            actionBar.y,
            220,
            60,
            '确认带入',
            {
                fill: isDeckValid ? 0x2563eb : 0x374151,
                hover: isDeckValid ? 0x3b82f6 : 0x374151,
                stroke: isDeckValid ? 0xbfdbfe : 0x6b7280,
                text: '#f8fafc',
            },
            () => this.confirmLoadout(),
            isDeckValid,
        );

        this.add([
            overlay,
            shadow,
            panel,
            panelAccent,
            title,
            subtitle,
            ...deckCardElements,
            scrollHint,
            validationCard,
            validationBadge,
            validationText,
            validationSubtext,
            loadoutCard,
            itemsCard,
            stonesCard,
            loadoutLabel,
            loadoutValue,
            itemsLabel,
            itemsValue,
            stonesLabel,
            stonesValue,
            deckInfoCard,
            itemsInfoCard,
            deckHeading,
            deckMeta,
            deckList,
            itemsHeading,
            itemsMeta,
            itemsText,
            actionBar,
            actionTitle,
            actionSummary,
            deckManagerButton.background,
            deckManagerButton.label,
            confirmButton.background,
            confirmButton.label,
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
        const cardWidth = 236;
        const cardHeight = 132;
        const cardGap = 14;

        if (decks.length === 0) {
            this.maxScrollX = 0;
            this.scrollX = 0;

            const emptyState = this.scene.add.rectangle(startX + maxWidth / 2, y + cardHeight / 2, maxWidth, cardHeight, 0x111827, 0.94);
            emptyState.setStrokeStyle(2, 0x475569, 0.82);
            const emptyTitle = this.scene.add.text(startX + 20, y + 20, '暂无可带入卡组', {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            });
            const emptyBody = this.scene.add.text(startX + 20, emptyTitle.y + 38, '请先点击“管理卡组”整理一套满足要求的卡组，再开始秘境探索。', {
                fontFamily: 'Arial',
                fontSize: '17px',
                color: '#94a3b8',
                wordWrap: { width: maxWidth - 40 },
            });
            elements.push(emptyState, emptyTitle, emptyBody);
            return elements;
        }

        const totalContentWidth = decks.length * cardWidth + Math.max(0, decks.length - 1) * cardGap;
        const needsScroll = totalContentWidth > maxWidth;

        this.maxScrollX = Math.max(0, totalContentWidth - maxWidth);
        this.scrollX = 0;

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(startX, y, maxWidth, cardHeight);
        const mask = maskGraphics.createGeometryMask();
        elements.push(maskGraphics);

        const innerContainer = this.scene.add.container(0, 0);
        this.scrollContainer = innerContainer;

        const outerContainer = this.scene.add.container(startX, y);
        outerContainer.add(innerContainer);
        outerContainer.setMask(mask);
        elements.push(outerContainer);

        decks.forEach((deck, index) => {
            const cardX = index * (cardWidth + cardGap) + cardWidth / 2;
            const cardY = cardHeight / 2;
            const isSelected = deck.id === selectedDeckId;
            const displayState = createDeckDisplayState(deck, this.stash.cards, isSelected);
            const cardCount = countDeckCards(deck.cards);

            const bg = this.scene.add.rectangle(cardX, cardY, cardWidth, cardHeight, displayState.fillColor, 0.98);
            bg.setStrokeStyle(isSelected ? 3 : 2, displayState.borderColor, 1);

            const accent = this.scene.add.rectangle(cardX, cardY - cardHeight / 2 + 5, cardWidth - 12, 6, displayState.accentColor, 1).setOrigin(0.5, 0);
            const status = this.scene.add.text(cardX - cardWidth / 2 + 16, cardY - cardHeight / 2 + 18, displayState.statusLabel, {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: displayState.badgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.badgeBackgroundColor,
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            });
            const deckName = this.scene.add.text(cardX - cardWidth / 2 + 16, status.y + 32, deck.name, {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#f8fafc',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 32 },
            });
            const countText = this.scene.add.text(
                cardX - cardWidth / 2 + 16,
                deckName.y + 34,
                `${cardCount} / ${DECK_CARD_MIN}-${DECK_CARD_MAX}`,
                {
                    fontFamily: 'Arial',
                    fontSize: '14px',
                    color: '#94a3b8',
                },
            );
            const detailText = this.scene.add.text(cardX - cardWidth / 2 + 16, countText.y + 24, displayState.detailText, {
                fontFamily: 'Arial',
                fontSize: '14px',
                color: displayState.detailColor,
                wordWrap: { width: cardWidth - 32 },
            });
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(displayState.hoverFillColor, 1));
            bg.on('pointerout', () => bg.setFillStyle(displayState.fillColor, 0.98));
            bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                this.pendingDeckClick = deck.id;
                this.dragStartX = pointer.x;
                this.isDragging = true;
                this.dragMoved = false;
            });

            innerContainer.add([bg, accent, status, deckName, countText, detailText]);
        });

        if (needsScroll) {
            this.leftIndicator = this.scene.add.text(startX + 10, y + cardHeight / 2, '◀', {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#c4b5fd',
                backgroundColor: '#111827',
                padding: { left: 8, right: 8, top: 8, bottom: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.leftIndicator.on('pointerdown', () => this.applyScroll(this.scrollX - (cardWidth + cardGap)));

            this.rightIndicator = this.scene.add.text(startX + maxWidth - 10, y + cardHeight / 2, '▶', {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#c4b5fd',
                backgroundColor: '#111827',
                padding: { left: 8, right: 8, top: 8, bottom: 8 },
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.rightIndicator.on('pointerdown', () => this.applyScroll(this.scrollX + (cardWidth + cardGap)));

            this.updateScrollIndicators();
            elements.push(this.leftIndicator, this.rightIndicator);
        }

        return elements;
    }

    private setupScrollInteraction(): void {
        this.teardownScrollInteraction();

        this.wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: unknown[], _deltaX: number, deltaY: number) => {
            if (!this.visible) {
                return;
            }

            this.applyScroll(this.scrollX + deltaY * 0.65);
        };
        this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (!this.visible || !this.isDragging) {
                return;
            }

            const dx = this.dragStartX - pointer.x;

            if (!this.dragMoved && Math.abs(dx) > 4) {
                this.dragMoved = true;
            }

            if (this.dragMoved) {
                this.applyScroll(this.scrollX + dx);
                this.dragStartX = pointer.x;
            }
        };
        this.pointerUpHandler = () => {
            if (!this.isDragging) {
                return;
            }

            if (!this.dragMoved && this.pendingDeckClick !== null) {
                this.onDeckSelect(this.pendingDeckClick);
            }

            this.isDragging = false;
            this.dragMoved = false;
            this.pendingDeckClick = null;
        };

        this.scene.input.on('wheel', this.wheelHandler);
        this.scene.input.on('pointermove', this.pointerMoveHandler);
        this.scene.input.on('pointerup', this.pointerUpHandler);
    }

    private teardownScrollInteraction(): void {
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
            this.leftIndicator.setAlpha(this.scrollX > 1 ? 1 : 0.25);
        }

        if (this.rightIndicator) {
            this.rightIndicator.setAlpha(this.scrollX < this.maxScrollX - 1 ? 1 : 0.25);
        }
    }

    private confirmLoadout(): void {
        this.onConfirm();
    }

    private openDeckManager(): void {
        this.onOpenDeckManager?.();
    }
}
