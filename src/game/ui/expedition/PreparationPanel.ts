import { GameObjects, Scene } from 'phaser';

import {
    createPreparationSummary,
    createPreparationSelectedLoadoutSummary,
    type PreparationDeckHandoffSummary,
    type PreparationSelectedLoadoutSummary,
} from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import {
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedSavedDeck,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
} from '../../state/PersistentStashDecks';
import type {
    ExpeditionCardStack,
    PersistentStash,
    SavedDeck,
} from '../../types/expedition';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    onConfirm: () => void;
    onDeckSelect: (deckId: string) => void;
    onOpenDeckManager?: () => void;
    deckHandoffSummary?: PreparationDeckHandoffSummary | null;
}

interface DeckDisplayState {
    valid: boolean;
    selectionLabel: string;
    statusLabel: string;
    detailText: string;
    footerText: string;
    fillColor: number;
    hoverFillColor: number;
    borderColor: number;
    accentColor: number;
    selectionBadgeColor: string;
    selectionBadgeBackgroundColor: string;
    statusBadgeColor: string;
    statusBadgeBackgroundColor: string;
    detailColor: string;
    footerFillColor: number;
    footerTextColor: string;
    shadowColor: number;
    shadowAlpha: number;
}

interface DeckHandoffBannerColors {
    fillColor: number;
    borderColor: number;
    badgeColor: string;
    badgeBackgroundColor: string;
    detailColor: string;
}

interface SelectedLoadoutColors {
    fillColor: number;
    borderColor: number;
    accentColor: number;
    badgeColor: string;
    badgeBackgroundColor: string;
    headlineColor: string;
    detailColor: string;
    mutedColor: string;
}

const DECK_CARD_WIDTH = 244;
const DECK_CARD_HEIGHT = 140;
const DECK_CARD_GAP = 14;
const LOADOUT_SUMMARY_HEIGHT = 188;

type DeckSizeIssue = Extract<DeckValidityReason, { kind: 'too-few-cards' | 'too-many-cards' }>;

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
        lines.push(formatSizeIssue(result.sizeIssue as DeckSizeIssue));
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

function formatSizeIssue(issue: DeckSizeIssue): string {
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

function formatPreviewBulletList(lines: string[], maxLines: number): string {
    if (lines.length === 0) {
        return '• 无';
    }

    if (lines.length === 1 && lines[0] === '无') {
        return '• 无';
    }

    return formatPreviewList(lines.map((line) => `• ${line}`), maxLines);
}

function createDeckDisplayState(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
    isSelected: boolean,
): DeckDisplayState {
    const validation = validateDeckForDisplay(deck, stashCards);
    const selectionLabel = isSelected ? '已选定' : '备选卡组';
    const selectionBadgeColor = isSelected ? '#dbeafe' : '#e2e8f0';
    const selectionBadgeBackgroundColor = isSelected ? '#1d4ed8' : '#334155';

    if (validation.valid && isSelected) {
        return {
            valid: true,
            selectionLabel,
            statusLabel: '可出发',
            detailText: '满足 20-40 张且库存充足。',
            footerText: '确认后会按这套卡组创建本次秘境快照。',
            fillColor: 0x14264a,
            hoverFillColor: 0x1a3571,
            borderColor: 0x93c5fd,
            accentColor: 0x38bdf8,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#dbeafe',
            statusBadgeBackgroundColor: '#166534',
            detailColor: '#bfdbfe',
            footerFillColor: 0x0f1d38,
            footerTextColor: '#dbeafe',
            shadowColor: 0x1d4ed8,
            shadowAlpha: 0.24,
        };
    }

    if (validation.valid) {
        return {
            valid: true,
            selectionLabel,
            statusLabel: '可带入',
            detailText: '张数和库存均已满足要求。',
            footerText: '点按即可切换为本次带入卡组。',
            fillColor: 0x12201d,
            hoverFillColor: 0x163123,
            borderColor: 0x365314,
            accentColor: 0x22c55e,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#dcfce7',
            statusBadgeBackgroundColor: '#166534',
            detailColor: '#bbf7d0',
            footerFillColor: 0x0e1c17,
            footerTextColor: '#dcfce7',
            shadowColor: 0x020617,
            shadowAlpha: 0.18,
        };
    }

    if (validation.sizeIssue?.kind === 'too-few-cards') {
        const missingCount = validation.sizeIssue.min - validation.sizeIssue.count;

        return {
            valid: false,
            selectionLabel,
            statusLabel: '张数不足',
            detailText: `还差 ${missingCount} 张才能达到 ${DECK_CARD_MIN} 张。`,
            footerText: isSelected ? '当前已选定；补足后即可确认带入。' : '点按可切换，但仍需先补足牌数。',
            fillColor: isSelected ? 0x372215 : 0x2f1d12,
            hoverFillColor: isSelected ? 0x46301e : 0x3b2416,
            borderColor: isSelected ? 0x93c5fd : 0xf59e0b,
            accentColor: 0xf59e0b,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#fef3c7',
            statusBadgeBackgroundColor: '#92400e',
            detailColor: '#fde68a',
            footerFillColor: 0x291d0e,
            footerTextColor: '#fde68a',
            shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
            shadowAlpha: isSelected ? 0.22 : 0.18,
        };
    }

    if (validation.sizeIssue?.kind === 'too-many-cards') {
        const excessCount = validation.sizeIssue.count - validation.sizeIssue.max;

        return {
            valid: false,
            selectionLabel,
            statusLabel: '超出上限',
            detailText: `超出 ${excessCount} 张卡，请精简后再出发。`,
            footerText: isSelected ? '当前已选定；精简后即可确认带入。' : '点按可切换，但仍需先精简卡组。',
            fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
            hoverFillColor: isSelected ? 0x4c1d30 : 0x3a1822,
            borderColor: isSelected ? 0x93c5fd : 0xf87171,
            accentColor: 0xef4444,
            selectionBadgeColor,
            selectionBadgeBackgroundColor,
            statusBadgeColor: '#fee2e2',
            statusBadgeBackgroundColor: '#b91c1c',
            detailColor: '#fecaca',
            footerFillColor: 0x29131b,
            footerTextColor: '#fecaca',
            shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
            shadowAlpha: isSelected ? 0.22 : 0.18,
        };
    }

    const shortageCount = validation.availabilityIssues.reduce(
        (sum, issue) => issue.kind === 'insufficient-copies' ? sum + Math.max(0, issue.required - issue.available) : sum,
        0,
    );
    const availabilityText = validation.availabilityIssues.length === 1
        ? `1 种卡牌库存不足，共缺 ${shortageCount} 张。`
        : `${validation.availabilityIssues.length} 种卡牌库存不足，共缺 ${shortageCount} 张。`;

    return {
        valid: false,
        selectionLabel,
        statusLabel: '库存不足',
        detailText: availabilityText,
        footerText: isSelected ? '当前已选定；补齐库存后即可确认带入。' : '点按可切换，但仍需先补齐库存。',
        fillColor: isSelected ? 0x3f1d2e : 0x2f1721,
        hoverFillColor: isSelected ? 0x4c1d30 : 0x3f1d2e,
        borderColor: isSelected ? 0x93c5fd : 0xf87171,
        accentColor: 0xef4444,
        selectionBadgeColor,
        selectionBadgeBackgroundColor,
        statusBadgeColor: '#fee2e2',
        statusBadgeBackgroundColor: '#b91c1c',
        detailColor: '#fecaca',
        footerFillColor: 0x29131b,
        footerTextColor: '#fecaca',
        shadowColor: isSelected ? 0x1d4ed8 : 0x020617,
        shadowAlpha: isSelected ? 0.22 : 0.18,
    };
}

function getSelectedLoadoutColors(
    summary: PreparationSelectedLoadoutSummary,
): SelectedLoadoutColors {
    switch (summary.readiness) {
        case 'ready':
            return {
                fillColor: 0x132949,
                borderColor: 0x60a5fa,
                accentColor: 0x38bdf8,
                badgeColor: '#dbeafe',
                badgeBackgroundColor: '#1d4ed8',
                headlineColor: '#eff6ff',
                detailColor: '#bfdbfe',
                mutedColor: '#93c5fd',
            };
        case 'too-few-cards':
            return {
                fillColor: 0x31210f,
                borderColor: 0xf59e0b,
                accentColor: 0xf59e0b,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                headlineColor: '#fffbeb',
                detailColor: '#fde68a',
                mutedColor: '#fcd34d',
            };
        case 'too-many-cards':
        case 'insufficient-copies':
            return {
                fillColor: 0x311725,
                borderColor: 0xef4444,
                accentColor: 0xf97316,
                badgeColor: '#fee2e2',
                badgeBackgroundColor: '#b91c1c',
                headlineColor: '#fff1f2',
                detailColor: '#fecaca',
                mutedColor: '#fda4af',
            };
        case 'none':
            return {
                fillColor: 0x111827,
                borderColor: 0x64748b,
                accentColor: 0x94a3b8,
                badgeColor: '#e2e8f0',
                badgeBackgroundColor: '#334155',
                headlineColor: '#f8fafc',
                detailColor: '#cbd5e1',
                mutedColor: '#94a3b8',
            };
    }
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

function createMetricChip(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    colors: { fill: number; stroke: number; value: string },
): Phaser.GameObjects.GameObject[] {
    const background = scene.add.rectangle(x, y, width, 32, colors.fill, 0.96);
    background.setStrokeStyle(1, colors.stroke, 0.85);
    const text = scene.add.text(x - width / 2 + 12, y, `${label} ${value}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: colors.value,
        fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    return [background, text];
}

function getDeckHandoffBannerColors(
    tone: PreparationDeckHandoffSummary['tone'],
): DeckHandoffBannerColors {
    switch (tone) {
        case 'positive':
            return {
                fillColor: 0x10261d,
                borderColor: 0x22c55e,
                badgeColor: '#dcfce7',
                badgeBackgroundColor: '#166534',
                detailColor: '#bbf7d0',
            };
        case 'warning':
            return {
                fillColor: 0x2a1420,
                borderColor: 0xf59e0b,
                badgeColor: '#fef3c7',
                badgeBackgroundColor: '#92400e',
                detailColor: '#fde68a',
            };
        case 'neutral':
            return {
                fillColor: 0x111827,
                borderColor: 0x64748b,
                badgeColor: '#e2e8f0',
                badgeBackgroundColor: '#334155',
                detailColor: '#cbd5e1',
            };
    }
}

export class PreparationPanel extends GameObjects.Container {
    private readonly stash: PersistentStash;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private readonly deckHandoffSummary?: PreparationDeckHandoffSummary | null;

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
        this.deckHandoffSummary = config.deckHandoffSummary;

        this.createPanel();
        this.once(Phaser.GameObjects.Events.DESTROY, () => this.teardownScrollInteraction());
        scene.add.existing(this);
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(980, width * 0.82);
        const panelHeight = Math.min(820, height * 0.88);
        const panelX = width / 2;
        const panelY = height / 2 + 24;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentLeft = panelLeft + 48;
        const contentWidth = panelWidth - 96;
        const summary = createPreparationSummary(this.stash);
        const selectedLoadoutSummary = createPreparationSelectedLoadoutSummary(this.stash);
        const validation = validateExpeditionLoadout(this.stash);
        const validationLines = formatValidationLines(validation);
        const validationHeight = Math.max(104, 86 + (validationLines.length - 1) * 24);
        const isDeckValid = validation.valid;
        const selectedDeck = getSelectedSavedDeck(this.stash);
        const selectedDeckId = selectedDeck?.id ?? null;
        const selectedLoadoutColors = getSelectedLoadoutColors(selectedLoadoutSummary);
        const deckPreviewText = formatPreviewBulletList(selectedLoadoutSummary.deckPreviewLines, 3);
        const itemPreviewText = formatPreviewBulletList(selectedLoadoutSummary.itemPreviewLines, 3);

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

        let deckSelectorY = subtitle.y + 46;
        const handoffSummary = this.deckHandoffSummary;
        const handoffElements: Phaser.GameObjects.GameObject[] = [];

        if (handoffSummary) {
            const bannerColors = getDeckHandoffBannerColors(handoffSummary.tone);
            const bannerTop = subtitle.y + subtitle.height + 16;
            const bannerHeight = 84;
            const banner = this.scene.add.rectangle(
                panelX,
                bannerTop + bannerHeight / 2,
                contentWidth,
                bannerHeight,
                bannerColors.fillColor,
                0.96,
            );
            banner.setStrokeStyle(2, bannerColors.borderColor, 0.92);
            const bannerTitle = this.scene.add.text(contentLeft + 18, bannerTop + 14, handoffSummary.title, {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: bannerColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: bannerColors.badgeBackgroundColor,
                padding: { left: 12, right: 12, top: 6, bottom: 6 },
            });
            const bannerDetail = this.scene.add.text(contentLeft + 18, bannerTitle.y + 38, handoffSummary.detail, {
                fontFamily: 'Arial',
                fontSize: '17px',
                color: bannerColors.detailColor,
                wordWrap: { width: contentWidth - 36 },
                lineSpacing: 4,
            });

            handoffElements.push(banner, bannerTitle, bannerDetail);
            deckSelectorY = bannerTop + bannerHeight + 18;
        }

        const deckCardElements = this.createDeckCardRow(
            contentLeft,
            deckSelectorY,
            contentWidth,
            selectedDeckId,
        );

        const scrollHint = this.maxScrollX > 0
            ? this.scene.add.text(contentLeft, deckSelectorY + DECK_CARD_HEIGHT + 10, '拖动或滚轮浏览更多卡组，点按卡片即可切换本次带入卡组。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#a78bfa',
            })
            : this.scene.add.text(contentLeft, deckSelectorY + DECK_CARD_HEIGHT + 10, '点按卡片即可切换本次带入卡组。', {
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

        const loadoutTop = validationTop + validationHeight + 16;
        const loadoutGap = 18;
        const selectedDeckSummaryWidth = 308;
        const carriedLoadoutWidth = contentWidth - selectedDeckSummaryWidth - loadoutGap;
        const selectedDeckSummaryCard = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            loadoutTop + LOADOUT_SUMMARY_HEIGHT / 2,
            selectedDeckSummaryWidth,
            LOADOUT_SUMMARY_HEIGHT,
            selectedLoadoutColors.fillColor,
            0.98,
        );
        selectedDeckSummaryCard.setStrokeStyle(2, selectedLoadoutColors.borderColor, 0.92);
        const selectedDeckSummaryAccent = this.scene.add.rectangle(
            contentLeft + selectedDeckSummaryWidth / 2,
            loadoutTop + 5,
            selectedDeckSummaryWidth - 16,
            5,
            selectedLoadoutColors.accentColor,
            1,
        ).setOrigin(0.5, 0);
        const selectedDeckHeading = this.scene.add.text(contentLeft + 18, loadoutTop + 14, '当前带入卡组', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
        });
        const selectedDeckStatusBadge = this.scene.add.text(
            contentLeft + selectedDeckSummaryWidth - 18,
            loadoutTop + 16,
            selectedLoadoutSummary.readinessLabel,
            {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: selectedLoadoutColors.badgeColor,
                fontStyle: 'bold',
                backgroundColor: selectedLoadoutColors.badgeBackgroundColor,
                padding: { left: 10, right: 10, top: 5, bottom: 5 },
            },
        ).setOrigin(1, 0);
        const selectedDeckNameText = this.scene.add.text(contentLeft + 18, selectedDeckHeading.y + 34, selectedLoadoutSummary.selectedDeckName, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
            wordWrap: { width: selectedDeckSummaryWidth - 36 },
        });
        const selectedDeckCount = this.scene.add.text(contentLeft + 18, selectedDeckNameText.y + selectedDeckNameText.height + 8, `${selectedLoadoutSummary.deckCount} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: selectedLoadoutColors.mutedColor,
        });
        const selectedDeckHeadline = this.scene.add.text(contentLeft + 18, selectedDeckCount.y + 28, selectedLoadoutSummary.headline, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: selectedLoadoutColors.headlineColor,
            fontStyle: 'bold',
            wordWrap: { width: selectedDeckSummaryWidth - 36 },
        });
        const selectedDeckDetail = this.scene.add.text(contentLeft + 18, selectedDeckHeadline.y + selectedDeckHeadline.height + 8, selectedLoadoutSummary.detail, {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: selectedLoadoutColors.detailColor,
            wordWrap: { width: selectedDeckSummaryWidth - 36 },
            lineSpacing: 4,
        });
        const selectedDeckFooter = this.scene.add.text(
            contentLeft + 18,
            loadoutTop + LOADOUT_SUMMARY_HEIGHT - 18,
            selectedLoadoutSummary.footer,
            {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: selectedLoadoutColors.mutedColor,
                wordWrap: { width: selectedDeckSummaryWidth - 36 },
            },
        ).setOrigin(0, 1);

        const carriedLoadoutLeft = contentLeft + selectedDeckSummaryWidth + loadoutGap;
        const carriedLoadoutCard = this.scene.add.rectangle(
            carriedLoadoutLeft + carriedLoadoutWidth / 2,
            loadoutTop + LOADOUT_SUMMARY_HEIGHT / 2,
            carriedLoadoutWidth,
            LOADOUT_SUMMARY_HEIGHT,
            0x111827,
            0.98,
        );
        carriedLoadoutCard.setStrokeStyle(2, 0x334155, 0.9);
        const carriedLoadoutAccent = this.scene.add.rectangle(
            carriedLoadoutLeft + carriedLoadoutWidth / 2,
            loadoutTop + 5,
            carriedLoadoutWidth - 16,
            5,
            0x8b5cf6,
            1,
        ).setOrigin(0.5, 0);
        const carriedLoadoutHeading = this.scene.add.text(carriedLoadoutLeft + 18, loadoutTop + 14, '本次携带一览', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const metricChipWidth = (carriedLoadoutWidth - 36 - 12 * 2) / 3;
        const metricChipY = carriedLoadoutHeading.y + 40;
        const carriedDeckChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth / 2, metricChipY, metricChipWidth, '卡牌', `${summary.deckCount} 张`, {
            fill: 0x132949,
            stroke: 0x3b82f6,
            value: '#dbeafe',
        });
        const carriedItemsChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth * 1.5 + 12, metricChipY, metricChipWidth, '道具', `${summary.itemCount} 件`, {
            fill: 0x10261d,
            stroke: 0x22c55e,
            value: '#dcfce7',
        });
        const carriedStonesChip = createMetricChip(this.scene, carriedLoadoutLeft + 18 + metricChipWidth * 2.5 + 24, metricChipY, metricChipWidth, '灵石', `${summary.spiritStones}`, {
            fill: 0x2a220f,
            stroke: 0xf59e0b,
            value: '#fef3c7',
        });
        const previewTop = metricChipY + 18;
        const previewGap = 18;
        const deckPreviewWidth = Math.floor((carriedLoadoutWidth - 36 - previewGap) * 0.6);
        const itemPreviewWidth = carriedLoadoutWidth - 36 - previewGap - deckPreviewWidth;
        const carriedDeckHeading = this.scene.add.text(carriedLoadoutLeft + 18, previewTop, '卡组预览', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        const carriedDeckPreview = this.scene.add.text(carriedLoadoutLeft + 18, carriedDeckHeading.y + 22, deckPreviewText, {
            fontFamily: 'Courier New',
            fontSize: '14px',
            color: '#e2e8f0',
            lineSpacing: 4,
            wordWrap: { width: deckPreviewWidth },
        });
        const carriedItemsHeading = this.scene.add.text(carriedLoadoutLeft + 18 + deckPreviewWidth + previewGap, previewTop, '携带道具', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#86efac',
            fontStyle: 'bold',
        });
        const carriedItemsPreview = this.scene.add.text(carriedItemsHeading.x, carriedItemsHeading.y + 22, itemPreviewText, {
            fontFamily: 'Courier New',
            fontSize: '14px',
            color: '#e2e8f0',
            lineSpacing: 4,
            wordWrap: { width: itemPreviewWidth },
        });

        const actionTop = loadoutTop + LOADOUT_SUMMARY_HEIGHT + 16;
        const actionHeight = 82;
        const actionBar = this.scene.add.rectangle(panelX, actionTop + actionHeight / 2, contentWidth, actionHeight, 0x111827, 0.98);
        actionBar.setStrokeStyle(2, 0x334155, 0.88);
        const actionTitle = this.scene.add.text(contentLeft + 20, actionTop + 18, `当前带入：${selectedLoadoutSummary.selectedDeckName}`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const actionSummary = this.scene.add.text(contentLeft + 20, actionTitle.y + 32, `${selectedLoadoutSummary.readinessLabel} · ${summary.deckCount} 张卡 · ${summary.itemCount} 件道具 · ${summary.spiritStones} 枚灵石`, {
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
            ...handoffElements,
            ...deckCardElements,
            scrollHint,
            validationCard,
            validationBadge,
            validationText,
            validationSubtext,
            selectedDeckSummaryCard,
            selectedDeckSummaryAccent,
            selectedDeckHeading,
            selectedDeckStatusBadge,
            selectedDeckNameText,
            selectedDeckCount,
            selectedDeckHeadline,
            selectedDeckDetail,
            selectedDeckFooter,
            carriedLoadoutCard,
            carriedLoadoutAccent,
            carriedLoadoutHeading,
            ...carriedDeckChip,
            ...carriedItemsChip,
            ...carriedStonesChip,
            carriedDeckHeading,
            carriedDeckPreview,
            carriedItemsHeading,
            carriedItemsPreview,
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
        const cardWidth = DECK_CARD_WIDTH;
        const cardHeight = DECK_CARD_HEIGHT;
        const cardGap = DECK_CARD_GAP;

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
        const selectedDeckIndex = Math.max(0, decks.findIndex((deck) => deck.id === selectedDeckId));

        this.maxScrollX = Math.max(0, totalContentWidth - maxWidth);
        this.scrollX = this.maxScrollX > 0
            ? Phaser.Math.Clamp(
                selectedDeckIndex * (cardWidth + cardGap) - (maxWidth - cardWidth) / 2,
                0,
                this.maxScrollX,
            )
            : 0;

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(startX, y, maxWidth, cardHeight);
        const mask = maskGraphics.createGeometryMask();
        elements.push(maskGraphics);

        const innerContainer = this.scene.add.container(0, 0);
        innerContainer.setX(-this.scrollX);
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

            const shadow = this.scene.add.rectangle(
                cardX + 4,
                cardY + 6,
                cardWidth,
                cardHeight,
                displayState.shadowColor,
                displayState.shadowAlpha,
            );
            const bg = this.scene.add.rectangle(cardX, cardY, cardWidth, cardHeight, displayState.fillColor, 0.98);
            bg.setStrokeStyle(isSelected ? 3 : 2, displayState.borderColor, 1);

            const accent = this.scene.add.rectangle(cardX, cardY - cardHeight / 2 + 5, cardWidth - 12, 6, displayState.accentColor, 1).setOrigin(0.5, 0);
            const selection = this.scene.add.text(cardX - cardWidth / 2 + 16, cardY - cardHeight / 2 + 16, displayState.selectionLabel, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: displayState.selectionBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.selectionBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            });
            const status = this.scene.add.text(cardX + cardWidth / 2 - 16, cardY - cardHeight / 2 + 16, displayState.statusLabel, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: displayState.statusBadgeColor,
                fontStyle: 'bold',
                backgroundColor: displayState.statusBadgeBackgroundColor,
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            }).setOrigin(1, 0);
            const deckName = this.scene.add.text(cardX - cardWidth / 2 + 16, selection.y + 28, deck.name, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#f8fafc',
                fontStyle: 'bold',
                wordWrap: { width: cardWidth - 32 },
            });
            const countText = this.scene.add.text(
                cardX - cardWidth / 2 + 16,
                deckName.y + deckName.height + 6,
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
            const footerBg = this.scene.add.rectangle(
                cardX,
                cardY + cardHeight / 2 - 15,
                cardWidth - 2,
                28,
                displayState.footerFillColor,
                0.95,
            );
            const footerText = this.scene.add.text(cardX - cardWidth / 2 + 16, footerBg.y, displayState.footerText, {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: displayState.footerTextColor,
            }).setOrigin(0, 0.5);
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerover', () => bg.setFillStyle(displayState.hoverFillColor, 1));
            bg.on('pointerout', () => bg.setFillStyle(displayState.fillColor, 0.98));
            bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                this.pendingDeckClick = deck.id;
                this.dragStartX = pointer.x;
                this.isDragging = true;
                this.dragMoved = false;
            });

            innerContainer.add([shadow, bg, accent, selection, status, deckName, countText, detailText, footerBg, footerText]);
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
