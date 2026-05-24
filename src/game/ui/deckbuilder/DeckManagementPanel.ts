import { GameObjects, Scene } from 'phaser';

import type { CardKind } from '@data/types/cards/core';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    computeCardCollectionViewModel,
    type CardCollectionFilters,
    type CardCollectionSortConfig,
    type CardCollectionSortField,
} from '../../state/CardCollectionViewModel';
import {
    addSavedDeckToStash,
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    deleteSavedDeckFromStash,
    renameSavedDeckInStash,
    selectDeckInStash,
    updateSavedDeckInStash,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
} from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, PersistentStash, SavedDeck } from '../../types/expedition';

export interface DeckManagementPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    onStashChange: (stash: PersistentStash) => void;
    onClose: () => void;
}

const KIND_CYCLE: (CardKind | undefined)[] = [
    undefined,
    'unit',
    'artifact',
    'talisman',
    'field',
    'skill',
    'pill',
];

const KIND_LABEL: Record<string, string> = {
    undefined: '全部',
    unit: '生物',
    artifact: '神器',
    talisman: '护符',
    field: '场地',
    skill: '技能',
    pill: '丹药',
};

const DECK_ROW_HEIGHT = 58;
const EDITOR_ROW_HEIGHT = 58;
const BROWSER_ROW_HEIGHT = 58;

const PANEL_FILL = 0x0b1220;
const SECTION_FILL = 0x111827;
const SECTION_BORDER = 0x334155;
const PANEL_ACCENT = 0x8b5cf6;
const SELECTED_ACCENT = 0x60a5fa;
const VALID_ACCENT = 0x22c55e;
const WARNING_ACCENT = 0xf59e0b;
const INVALID_ACCENT = 0xef4444;

interface ButtonVisualOptions {
    hoverFillColor?: number;
    strokeColor?: number;
    textColor?: string;
    fontSize?: string;
    disabledFillColor?: number;
    disabledStrokeColor?: number;
    disabledTextColor?: string;
}

type DeckSizeIssue = Extract<DeckValidityReason, { kind: 'too-few-cards' | 'too-many-cards' }>;
type DeckAvailabilityIssue = Extract<DeckValidityReason, { kind: 'insufficient-copies' }>;

interface DeckStatusSummary {
    count: number;
    sizeIssue: DeckSizeIssue | null;
    availabilityIssues: DeckAvailabilityIssue[];
    isValid: boolean;
    accentColor: number;
    pillFillColor: number;
    pillTextColor: string;
    statusLabel: string;
    detailLabel: string;
}

interface ReturnCtaState {
    stripFillColor: number;
    stripTextColor: string;
    buttonFillColor: number;
    buttonHoverFillColor: number;
    buttonStrokeColor: number;
    buttonTextColor: string;
    buttonStatusLabel: string;
    summaryLabel: string;
}

function createDeckId(): string {
    return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function addCardToStack(stacks: readonly ExpeditionCardStack[], cardId: string): ExpeditionCardStack[] {
    const existing = stacks.find((stack) => stack.id === cardId);

    if (existing) {
        return stacks.map((stack) => (stack.id === cardId ? { id: stack.id, count: stack.count + 1 } : { ...stack }));
    }

    return [...stacks.map((stack) => ({ ...stack })), { id: cardId, count: 1 }];
}

function removeCardFromStack(stacks: readonly ExpeditionCardStack[], cardId: string): ExpeditionCardStack[] {
    return stacks
        .map((stack) => (stack.id === cardId ? { id: stack.id, count: stack.count - 1 } : { ...stack }))
        .filter((stack) => stack.count > 0);
}

function computeAvailable(
    stashCards: readonly ExpeditionCardStack[],
    deckCards: readonly ExpeditionCardStack[],
    cardId: string,
): number {
    const stashCount = stashCards.find((stack) => stack.id === cardId)?.count ?? 0;
    const deckCount = deckCards.find((stack) => stack.id === cardId)?.count ?? 0;
    return stashCount - deckCount;
}

function summarizeDeckStatus(
    deck: SavedDeck,
    stashCards: readonly ExpeditionCardStack[],
): DeckStatusSummary {
    const count = countDeckCards(deck.cards);
    const sizeIssue = validateDeckSize(deck.cards) as DeckSizeIssue | null;
    const availabilityIssues = validateDeckAvailability(deck.cards, stashCards) as DeckAvailabilityIssue[];

    if (availabilityIssues.length > 0) {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: INVALID_ACCENT,
            pillFillColor: 0x3f1d24,
            pillTextColor: '#fecaca',
            statusLabel: '缺卡',
            detailLabel: availabilityIssues.length === 1 ? '1 种卡牌库存不足' : `${availabilityIssues.length} 种卡牌库存不足`,
        };
    }

    if (sizeIssue?.kind === 'too-few-cards') {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: WARNING_ACCENT,
            pillFillColor: 0x3b2a0e,
            pillTextColor: '#fde68a',
            statusLabel: '未满',
            detailLabel: `还差 ${sizeIssue.min - sizeIssue.count} 张才能出征`,
        };
    }

    if (sizeIssue?.kind === 'too-many-cards') {
        return {
            count,
            sizeIssue,
            availabilityIssues,
            isValid: false,
            accentColor: INVALID_ACCENT,
            pillFillColor: 0x3f1d24,
            pillTextColor: '#fecaca',
            statusLabel: '超限',
            detailLabel: `超出 ${sizeIssue.count - sizeIssue.max} 张`,
        };
    }

    return {
        count,
        sizeIssue,
        availabilityIssues,
        isValid: true,
        accentColor: VALID_ACCENT,
        pillFillColor: 0x15372a,
        pillTextColor: '#bbf7d0',
        statusLabel: '就绪',
        detailLabel: '满足 20-40 张且库存充足',
    };
}

function formatDeckIssueLines(
    summary: DeckStatusSummary,
    maxAvailabilityLines = 2,
): string[] {
    const lines: string[] = [];

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        lines.push(`· 当前 ${summary.sizeIssue.count} 张，还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张。`);
    } else if (summary.sizeIssue?.kind === 'too-many-cards') {
        lines.push(`· 当前 ${summary.sizeIssue.count} 张，超出上限 ${summary.sizeIssue.count - summary.sizeIssue.max} 张。`);
    }

    if (summary.availabilityIssues.length > 0) {
        summary.availabilityIssues.slice(0, maxAvailabilityLines).forEach((issue) => {
            lines.push(`· ${issue.cardId} 缺 ${issue.required - issue.available} 张（需 ${issue.required} / 袋中 ${issue.available}）。`);
        });

        const overflow = summary.availabilityIssues.length - maxAvailabilityLines;
        if (overflow > 0) {
            lines.push(`· 另有 ${overflow} 种卡牌库存不足。`);
        }
    }

    if (lines.length === 0) {
        lines.push('· 当前卡组满足出征要求，可直接带入秘境。');
    }

    return lines;
}

function getCardDisplayName(cardId: string, metadata?: CardMetadataMap): string {
    return metadata?.[cardId]?.name ?? cardId;
}

function getCardMetaLabel(cardId: string, metadata?: CardMetadataMap): string {
    const parts: string[] = [];
    const name = metadata?.[cardId]?.name;
    const kind = metadata?.[cardId]?.kind;

    if (name && name !== cardId) {
        parts.push(cardId);
    }

    if (kind) {
        parts.push(KIND_LABEL[kind]);
    }

    return parts.length > 0 ? parts.join(' · ') : '未标注类别';
}

function createReturnCtaState(summary: DeckStatusSummary): ReturnCtaState {
    if (summary.availabilityIssues.length > 0) {
        return {
            stripFillColor: 0x29161b,
            stripTextColor: '#fecaca',
            buttonFillColor: 0xb91c1c,
            buttonHoverFillColor: 0xdc2626,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#fff1f2',
            buttonStatusLabel: '库存待补齐',
            summaryLabel: `${summary.count} 张 · ${summary.availabilityIssues.length} 种卡牌库存不足`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-few-cards') {
        return {
            stripFillColor: 0x271b0b,
            stripTextColor: '#fde68a',
            buttonFillColor: 0xb45309,
            buttonHoverFillColor: 0xd97706,
            buttonStrokeColor: 0xfcd34d,
            buttonTextColor: '#fff7ed',
            buttonStatusLabel: `还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
            summaryLabel: `${summary.count} 张 · 还差 ${summary.sizeIssue.min - summary.sizeIssue.count} 张`,
        };
    }

    if (summary.sizeIssue?.kind === 'too-many-cards') {
        return {
            stripFillColor: 0x29161b,
            stripTextColor: '#fecaca',
            buttonFillColor: 0xb91c1c,
            buttonHoverFillColor: 0xdc2626,
            buttonStrokeColor: 0xfca5a5,
            buttonTextColor: '#fff1f2',
            buttonStatusLabel: `超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
            summaryLabel: `${summary.count} 张 · 超出 ${summary.sizeIssue.count - summary.sizeIssue.max} 张`,
        };
    }

    return {
        stripFillColor: 0x10251a,
        stripTextColor: '#bbf7d0',
        buttonFillColor: 0x166534,
        buttonHoverFillColor: 0x15803d,
        buttonStrokeColor: 0x86efac,
        buttonTextColor: '#f0fdf4',
        buttonStatusLabel: '当前卡组已就绪',
        summaryLabel: `${summary.count} 张 · 已满足 20-40 张`,
    };
}

export class DeckManagementPanel extends GameObjects.Container {
    private stash: PersistentStash;
    private readonly config: DeckManagementPanelConfig;
    private selectedDeckId: string | null = null;

    private deckListScrollOffset = 0;
    private editorScrollOffset = 0;
    private browserScrollOffset = 0;

    private deckListVisibleRows = 1;
    private editorVisibleRows = 1;
    private browserVisibleRows = 1;

    private filterQuery = '';
    private filterHideZero = true;
    private filterKind: CardKind | undefined = undefined;
    private sortField: CardCollectionSortField = 'id';
    private sortDirection: 'asc' | 'desc' = 'asc';

    private renameMode = false;
    private renameBuffer = '';

    private searchFocus = false;
    private cursorVisible = true;
    private cursorTimer?: Phaser.Time.TimerEvent;

    private queryBg?: GameObjects.Rectangle;
    private queryText?: GameObjects.Text;
    private queryClearBtn?: GameObjects.Text;

    private deckListOuter?: GameObjects.Container;
    private deckListInner?: GameObjects.Container;
    private editorContainer?: GameObjects.Container;
    private browserOuter?: GameObjects.Container;
    private browserInner?: GameObjects.Container;

    private deckListSummaryText?: GameObjects.Text;
    private deckListPosText?: GameObjects.Text;
    private deleteDeckBtn?: GameObjects.Rectangle;
    private deleteDeckLabel?: GameObjects.Text;

    private kindBtnText?: GameObjects.Text;
    private hideZeroBtn?: GameObjects.Rectangle;
    private hideZeroBtnText?: GameObjects.Text;
    private sortFieldBtnText?: GameObjects.Text;
    private sortDirBtnText?: GameObjects.Text;
    private browserSummaryText?: GameObjects.Text;
    private browserPosText?: GameObjects.Text;

    private keydownHandler?: (event: KeyboardEvent) => void;
    private wheelHandler?: (pointer: Phaser.Input.Pointer, _gameObjects: unknown[], deltaX: number, deltaY: number) => void;

    private deckListArea = { x: 0, y: 0, w: 0, h: 0 };
    private editorArea = { x: 0, y: 0, w: 0, h: 0 };
    private browserArea = { x: 0, y: 0, w: 0, h: 0 };
    private editorContentWidth = 0;
    private editorContentHeight = 0;

    private dialogMode = false;
    private dialogObjects: GameObjects.GameObject[] = [];

    constructor(scene: Scene, config: DeckManagementPanelConfig) {
        super(scene, 0, 0);
        this.stash = config.stash;
        this.config = config;
        this.selectedDeckId = config.stash.selectedDeckId ?? config.stash.savedDecks[0]?.id ?? null;

        this.createPanel();
        scene.add.existing(this);

        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);

        this.wheelHandler = (pointer, _gameObjects, _deltaX, deltaY) => this.handleWheel(pointer, deltaY);
        scene.input.on('wheel', this.wheelHandler);
    }

    destroy(fromScene?: boolean): void {
        if (this.keydownHandler) {
            this.scene.input.keyboard?.off('keydown', this.keydownHandler);
        }

        if (this.cursorTimer) {
            this.cursorTimer.destroy();
            this.cursorTimer = undefined;
        }

        this.scene.input.off('pointerdown', this.handleSearchClickOutside, this);

        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
        }

        this.dialogObjects.forEach((obj) => obj.destroy());
        this.dialogObjects = [];
        super.destroy(fromScene);
    }

    private getSelectedDeck(): SavedDeck | null {
        return this.stash.savedDecks.find((deck) => deck.id === this.selectedDeckId) ?? null;
    }

    private getSelectedDeckStatus(): DeckStatusSummary | null {
        const deck = this.getSelectedDeck();
        return deck ? summarizeDeckStatus(deck, this.stash.cards) : null;
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (this.dialogMode) {
            if (event.key === 'Enter') {
                this.confirmDelete();
            } else if (event.key === 'Escape') {
                this.hideDeleteConfirmation();
            }
            return;
        }

        if (this.renameMode) {
            if (event.key === 'Enter') {
                this.confirmRename();
            } else if (event.key === 'Escape') {
                this.cancelRename();
            } else if (event.key === 'Backspace') {
                this.renameBuffer = this.renameBuffer.slice(0, -1);
                this.refreshEditor();
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                this.renameBuffer += event.key;
                this.refreshEditor();
            }
            return;
        }

        if (this.searchFocus) {
            if (event.key === 'Escape' || event.key === 'Enter') {
                this.setSearchFocus(false);
            } else if (event.key === 'Backspace') {
                this.filterQuery = this.filterQuery.slice(0, -1);
                this.refreshBrowser();
                this.updateSearchDisplay();
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                this.filterQuery += event.key;
                this.refreshBrowser();
                this.updateSearchDisplay();
            }
        }
    }

    private handleWheel(pointer: Phaser.Input.Pointer, deltaY: number): void {
        if (this.dialogMode) return;

        const direction = Math.sign(deltaY);
        if (direction === 0) return;

        const deckArea = this.deckListArea;
        if (pointer.x >= deckArea.x && pointer.x <= deckArea.x + deckArea.w && pointer.y >= deckArea.y && pointer.y <= deckArea.y + deckArea.h) {
            this.deckListScrollOffset += direction;
            this.refreshDeckList();
            return;
        }

        const editorArea = this.editorArea;
        if (pointer.x >= editorArea.x && pointer.x <= editorArea.x + editorArea.w && pointer.y >= editorArea.y && pointer.y <= editorArea.y + editorArea.h) {
            this.editorScrollOffset += direction;
            this.refreshEditor();
            return;
        }

        const browserArea = this.browserArea;
        if (pointer.x >= browserArea.x && pointer.x <= browserArea.x + browserArea.w && pointer.y >= browserArea.y && pointer.y <= browserArea.y + browserArea.h) {
            this.browserScrollOffset += direction;
            this.refreshBrowser();
        }
    }

    private confirmRename(): void {
        if (!this.renameMode || !this.selectedDeckId) return;

        const trimmed = this.renameBuffer.trim();
        if (trimmed.length > 0) {
            this.stash = renameSavedDeckInStash(this.stash, this.selectedDeckId, trimmed);
            this.config.onStashChange(this.stash);
        }

        this.renameMode = false;
        this.refreshEditor();
        this.refreshDeckList();
    }

    private cancelRename(): void {
        this.renameMode = false;
        this.refreshEditor();
    }

    private setSearchFocus(focused: boolean): void {
        if (this.searchFocus === focused) return;
        this.searchFocus = focused;

        if (focused) {
            if (this.renameMode) {
                this.cancelRename();
            }

            this.cursorVisible = true;
            this.cursorTimer = this.scene.time.addEvent({
                delay: 530,
                loop: true,
                callback: () => {
                    this.cursorVisible = !this.cursorVisible;
                    this.updateSearchDisplay();
                },
            });
            this.scene.input.on('pointerdown', this.handleSearchClickOutside, this);
        } else {
            if (this.cursorTimer) {
                this.cursorTimer.destroy();
                this.cursorTimer = undefined;
            }
            this.scene.input.off('pointerdown', this.handleSearchClickOutside, this);
        }

        this.updateSearchDisplay();
    }

    private handleSearchClickOutside(pointer: Phaser.Input.Pointer): void {
        if (!this.searchFocus) return;

        if (this.queryBg) {
            const bounds = this.queryBg.getBounds();
            if (bounds.contains(pointer.x, pointer.y)) {
                return;
            }
        }

        if (this.queryClearBtn && this.queryClearBtn.visible) {
            const bounds = this.queryClearBtn.getBounds();
            if (bounds.contains(pointer.x, pointer.y)) {
                return;
            }
        }

        this.setSearchFocus(false);
    }

    private updateSearchDisplay(): void {
        if (!this.queryText || !this.queryBg) return;

        if (this.searchFocus) {
            const cursor = this.cursorVisible ? '|' : '';
            this.queryText.setText(`${this.filterQuery}${cursor}`);
            this.queryText.setColor('#f8fafc');
            this.queryBg.setFillStyle(0x172554, 1);
            this.queryBg.setStrokeStyle(2, PANEL_ACCENT, 0.95);
        } else {
            this.queryText.setText(this.filterQuery || '搜索卡牌、编号或名称');
            this.queryText.setColor(this.filterQuery ? '#f8fafc' : '#64748b');
            this.queryBg.setFillStyle(0x0f172a, 1);
            this.queryBg.setStrokeStyle(1, SECTION_BORDER, 0.9);
        }

        if (this.queryClearBtn) {
            this.queryClearBtn.setVisible(this.filterQuery.length > 0);
        }
    }

    private applyStashChange(newStash: PersistentStash): void {
        this.stash = newStash;
        this.config.onStashChange(this.stash);
        this.selectedDeckId = this.stash.selectedDeckId ?? this.stash.savedDecks[0]?.id ?? null;
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(1120, width * 0.9);
        const panelHeight = Math.min(760, height * 0.86);
        const panelX = width / 2;
        const panelY = height / 2 + 18;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.82);
        overlay.setInteractive();

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, PANEL_FILL, 0.98);
        panel.setStrokeStyle(3, PANEL_ACCENT, 0.9);

        const titleX = panelX - panelWidth / 2 + 34;
        const titleTop = panelY - panelHeight / 2 + 24;

        const title = this.scene.add.text(titleX, titleTop, '卡组管理', {
            fontFamily: 'Arial',
            fontSize: '32px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(titleX, titleTop + 40, '整理远征卡组，当前选择、失效状态与可加入余量会即时更新。', {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#cbd5e1',
            wordWrap: { width: panelWidth - 220 },
        });

        const closeButton = this.createButton(
            panelX + panelWidth / 2 - 92,
            titleTop + 18,
            116,
            38,
            '返回',
            0x334155,
            () => this.config.onClose(),
            false,
            { hoverFillColor: 0x475569, strokeColor: 0x94a3b8 },
        );

        const columnGap = 18;
        const contentY = panelY - panelHeight / 2 + 108;
        const contentH = panelHeight - 136;
        const leftColX = panelX - panelWidth / 2 + 26;
        const leftColW = 274;
        const centerColX = leftColX + leftColW + columnGap;
        const centerColW = 388;
        const rightColX = centerColX + centerColW + columnGap;
        const rightColW = panelX + panelWidth / 2 - 26 - rightColX;

        this.add([overlay, panel, title, subtitle, ...closeButton]);

        this.createDeckListColumn(leftColX, contentY, leftColW, contentH);
        this.createEditorColumn(centerColX, contentY, centerColW, contentH);
        this.createBrowserColumn(rightColX, contentY, rightColW, contentH);

        this.setDepth(1200);
    }

    private createButton(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        fillColor: number,
        onClick: () => void,
        disabled = false,
        options: ButtonVisualOptions = {},
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const strokeColor = options.strokeColor ?? 0xffffff;
        const hoverFillColor = options.hoverFillColor ?? fillColor;
        const disabledFillColor = options.disabledFillColor ?? 0x334155;
        const disabledStrokeColor = options.disabledStrokeColor ?? 0x475569;
        const textColor = options.textColor ?? '#f8fafc';
        const disabledTextColor = options.disabledTextColor ?? '#94a3b8';

        const button = this.scene.add.rectangle(
            x,
            y,
            w,
            h,
            disabled ? disabledFillColor : fillColor,
            1,
        );
        button.setStrokeStyle(1, disabled ? disabledStrokeColor : strokeColor, disabled ? 0.9 : 0.95);

        if (!disabled) {
            button.setInteractive({ useHandCursor: true });
            button.on('pointerover', () => button.setFillStyle(hoverFillColor, 1));
            button.on('pointerout', () => button.setFillStyle(fillColor, 1));
            button.on('pointerdown', onClick);
        } else {
            button.setAlpha(0.78);
        }

        const text = this.scene.add.text(x, y, label, {
            fontFamily: 'Arial',
            fontSize: options.fontSize ?? '15px',
            color: disabled ? disabledTextColor : textColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);

        return [button, text];
    }

    private createPill(
        x: number,
        y: number,
        label: string,
        fillColor: number,
        textColor = '#f8fafc',
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const text = this.scene.add.text(x + 10, y, label, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: textColor,
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);

        const width = Math.max(56, text.width + 20);
        const bg = this.scene.add.rectangle(x + width / 2, y, width, 22, fillColor, 1);
        bg.setStrokeStyle(1, 0xffffff, 0.08);
        return [bg, text];
    }

    private createSectionFrame(
        x: number,
        y: number,
        w: number,
        h: number,
        title: string,
        subtitle: string,
        accentColor: number,
    ): Phaser.GameObjects.GameObject[] {
        const background = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, SECTION_FILL, 0.96);
        background.setStrokeStyle(1, SECTION_BORDER, 0.9);

        const accent = this.scene.add.rectangle(x + 18, y + 25, 6, 26, accentColor, 1);
        const titleText = this.scene.add.text(x + 32, y + 14, title, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const subtitleText = this.scene.add.text(x + 32, y + 43, subtitle, {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#94a3b8',
            wordWrap: { width: w - 52 },
        });

        return [background, accent, titleText, subtitleText];
    }

    private createDeckListColumn(x: number, y: number, colW: number, colH: number): void {
        this.add(this.createSectionFrame(x, y, colW, colH, '卡组列表', '选择要编辑与带入远征的卡组。', SELECTED_ACCENT));

        const innerX = x + 16;
        const innerW = colW - 32;
        const newDeckY = y + 86;
        const deleteY = y + colH - 28;
        const scrollBtnY = deleteY - 42;
        const listTop = newDeckY + 34;
        const listBottom = scrollBtnY - 18;
        const listH = Math.max(120, listBottom - listTop);

        this.deckListArea = { x: innerX, y: listTop, w: innerW, h: listH };
        this.deckListVisibleRows = Math.max(1, Math.floor(listH / DECK_ROW_HEIGHT));

        this.deckListSummaryText = this.scene.add.text(innerX, y + 68, '', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#cbd5e1',
        });
        this.add(this.deckListSummaryText);

        const newDeckButton = this.createButton(
            innerX + innerW / 2,
            newDeckY,
            innerW,
            34,
            '＋ 新建卡组',
            0x2563eb,
            () => {
                const id = createDeckId();
                const createdStash = addSavedDeckToStash(this.stash, id, null, []);
                const selectedStash = selectDeckInStash(createdStash, id);
                this.applyStashChange(selectedStash);
                this.deckListScrollOffset = Math.max(0, selectedStash.savedDecks.length - this.deckListVisibleRows);
                this.refreshDeckList();
                this.refreshEditor();
                this.refreshBrowser();
            },
            false,
            {
                hoverFillColor: 0x3b82f6,
                strokeColor: 0x93c5fd,
                fontSize: '15px',
            },
        );
        this.add(newDeckButton);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(innerX, listTop, innerW, listH);

        this.deckListOuter = this.scene.add.container(innerX, listTop);
        this.deckListOuter.setMask(maskGraphics.createGeometryMask());
        this.deckListInner = this.scene.add.container(0, 0);
        this.deckListOuter.add(this.deckListInner);
        this.add([maskGraphics, this.deckListOuter]);

        const scrollUpButton = this.createButton(
            innerX + innerW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.deckListScrollOffset = Math.max(0, this.deckListScrollOffset - 1);
                this.refreshDeckList();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            innerX + innerW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.deckListScrollOffset += 1;
                this.refreshDeckList();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.add([...scrollUpButton, ...scrollDownButton]);

        this.deckListPosText = this.scene.add.text(innerX, scrollBtnY, '', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(0, 0.5);
        this.add(this.deckListPosText);

        const [deleteButton, deleteLabel] = this.createButton(
            innerX + innerW / 2,
            deleteY,
            innerW,
            34,
            '删除当前卡组',
            0xb91c1c,
            () => this.showDeleteConfirmation(),
            false,
            {
                hoverFillColor: 0xdc2626,
                strokeColor: 0xfca5a5,
                fontSize: '15px',
            },
        );
        this.deleteDeckBtn = deleteButton;
        this.deleteDeckLabel = deleteLabel;
        this.add([deleteButton, deleteLabel]);

        this.refreshDeckList();
    }

    private refreshDeckList(): void {
        if (!this.deckListInner) return;
        this.deckListInner.removeAll(true);

        const decks = this.stash.savedDecks;
        const maxOffset = Math.max(0, decks.length - this.deckListVisibleRows);
        this.deckListScrollOffset = Phaser.Math.Clamp(this.deckListScrollOffset, 0, maxOffset);

        const selectedDeck = this.getSelectedDeck();
        if (this.deckListSummaryText) {
            const selectedSummary = selectedDeck ? summarizeDeckStatus(selectedDeck, this.stash.cards) : null;
            this.deckListSummaryText.setText(
                selectedDeck
                    ? `共 ${decks.length} 套 · 当前 ${selectedSummary?.count ?? 0} 张 · ${selectedSummary?.statusLabel ?? '未选择'}`
                    : `共 ${decks.length} 套 · 请选择或新建卡组`,
            );
        }

        if (decks.length === 0) {
            const emptyCard = this.scene.add.rectangle(this.deckListArea.w / 2, 76, this.deckListArea.w, 116, 0x0f172a, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);

            const emptyTitle = this.scene.add.text(this.deckListArea.w / 2, 54, '还没有保存的卡组', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            const emptyBody = this.scene.add.text(this.deckListArea.w / 2, 84, '点击上方“新建卡组”开始整理本次远征配置。', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: this.deckListArea.w - 40 },
            }).setOrigin(0.5);

            this.deckListInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const start = this.deckListScrollOffset;
            const end = Math.min(start + this.deckListVisibleRows, decks.length);

            for (let index = start; index < end; index += 1) {
                const deck = decks[index];
                const rowY = (index - start) * DECK_ROW_HEIGHT;
                const isSelected = deck.id === this.selectedDeckId;
                const summary = summarizeDeckStatus(deck, this.stash.cards);
                const bgFill = isSelected ? 0x172554 : 0x0f172a;
                const borderColor = isSelected ? SELECTED_ACCENT : SECTION_BORDER;
                const secondaryColor = summary.isValid ? '#93c5fd' : summary.pillTextColor;

                const bg = this.scene.add.rectangle(
                    this.deckListArea.w / 2,
                    rowY + DECK_ROW_HEIGHT / 2,
                    this.deckListArea.w,
                    DECK_ROW_HEIGHT - 6,
                    bgFill,
                    0.98,
                );
                bg.setStrokeStyle(1, borderColor, isSelected ? 0.95 : 0.65);

                const accent = this.scene.add.rectangle(5, rowY + DECK_ROW_HEIGHT / 2, 6, DECK_ROW_HEIGHT - 14, summary.accentColor, 1)
                    .setOrigin(0, 0.5);

                const name = this.scene.add.text(16, rowY + 18, deck.name, {
                    fontFamily: 'Arial',
                    fontSize: '16px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });

                const detail = this.scene.add.text(16, rowY + 39, `${summary.count} 张 · ${summary.detailLabel}`, {
                    fontFamily: 'Arial',
                    fontSize: '12px',
                    color: secondaryColor,
                });

                const [statusPillBg, statusPillText] = this.createPill(
                    this.deckListArea.w - 76,
                    rowY + 18,
                    summary.statusLabel,
                    summary.pillFillColor,
                    summary.pillTextColor,
                );

                let selectedBadge: [GameObjects.Rectangle, GameObjects.Text] | null = null;
                if (isSelected) {
                    selectedBadge = this.createPill(
                        this.deckListArea.w - 100,
                        rowY + 40,
                        '当前选中',
                        0x1d4ed8,
                        '#dbeafe',
                    );
                }

                bg.setInteractive({ useHandCursor: true });
                bg.on('pointerover', () => bg.setFillStyle(isSelected ? 0x1e3a8a : 0x172033, 1));
                bg.on('pointerout', () => bg.setFillStyle(bgFill, 1));
                bg.on('pointerdown', () => {
                    this.applyStashChange(selectDeckInStash(this.stash, deck.id));
                    this.refreshDeckList();
                    this.refreshEditor();
                    this.refreshBrowser();
                });

                this.deckListInner.add([
                    bg,
                    accent,
                    name,
                    detail,
                    statusPillBg,
                    statusPillText,
                    ...(selectedBadge ?? []),
                ]);
            }
        }

        this.updateDeleteButton();

        if (this.deckListPosText) {
            const total = decks.length;
            const start = total === 0 ? 0 : this.deckListScrollOffset + 1;
            const end = total === 0 ? 0 : Math.min(this.deckListScrollOffset + this.deckListVisibleRows, total);
            this.deckListPosText.setText(`显示 ${start}-${end} / ${total}`);
        }
    }

    private updateDeleteButton(): void {
        if (!this.deleteDeckBtn || !this.deleteDeckLabel) return;

        const canDelete = this.selectedDeckId !== null && this.stash.savedDecks.length > 1;
        this.deleteDeckBtn.removeAllListeners();

        if (canDelete) {
            this.deleteDeckBtn.setFillStyle(0xb91c1c, 1);
            this.deleteDeckBtn.setStrokeStyle(1, 0xfca5a5, 0.95);
            this.deleteDeckBtn.setAlpha(1);
            this.deleteDeckBtn.setInteractive({ useHandCursor: true });
            this.deleteDeckBtn.on('pointerover', () => this.deleteDeckBtn?.setFillStyle(0xdc2626, 1));
            this.deleteDeckBtn.on('pointerout', () => this.deleteDeckBtn?.setFillStyle(0xb91c1c, 1));
            this.deleteDeckBtn.on('pointerdown', () => this.showDeleteConfirmation());
            this.deleteDeckLabel.setText('删除当前卡组');
            this.deleteDeckLabel.setColor('#f8fafc');
        } else {
            this.deleteDeckBtn.disableInteractive();
            this.deleteDeckBtn.setFillStyle(0x1f2937, 1);
            this.deleteDeckBtn.setStrokeStyle(1, 0x334155, 0.95);
            this.deleteDeckBtn.setAlpha(0.82);
            this.deleteDeckLabel.setText('至少保留 1 套卡组');
            this.deleteDeckLabel.setColor('#94a3b8');
        }
    }

    private createEditorColumn(x: number, y: number, colW: number, colH: number): void {
        this.add(this.createSectionFrame(x, y, colW, colH, '卡组编辑', '重命名、校验并逐张调整当前卡组；摘要区可直接返回远征准备。', PANEL_ACCENT));
        this.editorContentWidth = colW - 32;
        this.editorContentHeight = colH - 72;
        this.editorContainer = this.scene.add.container(x + 16, y + 70);
        this.add(this.editorContainer);
        this.refreshEditor();
    }

    private refreshEditor(): void {
        if (!this.editorContainer) return;
        this.editorContainer.removeAll(true);

        const localX = 0;
        const summaryW = this.editorContentWidth;
        const contentH = this.editorContentHeight;
        const summaryH = this.renameMode ? 214 : 202;
        const listHeaderY = summaryH + 10;
        const scrollBtnY = contentH - 12;
        const listTop = listHeaderY + 34;
        const listBottom = scrollBtnY - 12;
        const listH = Math.max(118, listBottom - listTop);

        this.editorArea = {
            x: this.editorContainer.x,
            y: this.editorContainer.y + listTop,
            w: summaryW,
            h: listH,
        };
        this.editorVisibleRows = Math.max(1, Math.floor(listH / EDITOR_ROW_HEIGHT));

        const deck = this.getSelectedDeck();

        if (!deck) {
            const emptyCard = this.scene.add.rectangle(localX + summaryW / 2, 84, summaryW, 168, 0x0f172a, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(localX + summaryW / 2, 62, '先选择一个卡组', {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#f8fafc',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(localX + summaryW / 2, 102, '左侧可以选择已有卡组，或新建一套用于本次远征的配置。', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: summaryW - 40 },
            }).setOrigin(0.5);
            this.editorContainer.add([emptyCard, emptyTitle, emptyBody]);
            return;
        }

        const summary = this.getSelectedDeckStatus() ?? summarizeDeckStatus(deck, this.stash.cards);
        const summaryCard = this.scene.add.rectangle(localX + summaryW / 2, summaryH / 2, summaryW, summaryH, 0x0f172a, 0.98);
        summaryCard.setStrokeStyle(1, summary.accentColor, 0.9);
        this.editorContainer.add(summaryCard);

        const eyebrow = this.scene.add.text(localX + 16, 16, '当前卡组', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        this.editorContainer.add(eyebrow);

        if (this.renameMode) {
            const renameHint = this.scene.add.text(localX + summaryW - 16, 18, 'Enter 确认 · Esc 取消', {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: '#fde68a',
            }).setOrigin(1, 0);
            const inputBg = this.scene.add.rectangle(localX + summaryW / 2, 58, summaryW - 32, 36, 0x111827, 1);
            inputBg.setStrokeStyle(1, PANEL_ACCENT, 0.95);
            const inputText = this.scene.add.text(localX + 18, 58, `${this.renameBuffer}|`, {
                fontFamily: 'Courier New',
                fontSize: '20px',
                color: '#f8fafc',
                fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            this.editorContainer.add([renameHint, inputBg, inputText]);
        } else {
            const nameText = this.scene.add.text(localX + 16, 38, deck.name, {
                fontFamily: 'Arial',
                fontSize: '25px',
                color: '#f8fafc',
                fontStyle: 'bold',
            });
            const renameButton = this.createButton(
                localX + summaryW - 54,
                34,
                88,
                28,
                '重命名',
                0x312e81,
                () => {
                    this.renameMode = true;
                    this.renameBuffer = deck.name;
                    this.refreshEditor();
                },
                false,
                {
                    hoverFillColor: 0x4338ca,
                    strokeColor: 0xa5b4fc,
                    fontSize: '13px',
                },
            );
            nameText.setInteractive({ useHandCursor: true });
            nameText.on('pointerdown', () => {
                this.renameMode = true;
                this.renameBuffer = deck.name;
                this.refreshEditor();
            });
            this.editorContainer.add([nameText, ...renameButton]);
        }

        const detailY = this.renameMode ? 86 : 66;
        const countText = this.scene.add.text(localX + 16, detailY, `${summary.count} / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: summary.isValid ? '#86efac' : summary.pillTextColor,
            fontStyle: 'bold',
        });
        const [statusPillBg, statusPillText] = this.createPill(
            localX + 170,
            detailY + 10,
            summary.statusLabel,
            summary.pillFillColor,
            summary.pillTextColor,
        );
        const detailText = this.scene.add.text(localX + 16, detailY + 26, summary.detailLabel, {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: summary.isValid ? '#93c5fd' : summary.pillTextColor,
        });
        this.editorContainer.add([countText, statusPillBg, statusPillText, detailText]);

        const issueLines = formatDeckIssueLines(summary, 1);
        const issueText = this.scene.add.text(localX + 16, detailY + 48, issueLines.join('\n'), {
            fontFamily: 'Arial',
            fontSize: '11px',
            color: summary.isValid ? '#cbd5e1' : '#f8d2d2',
            lineSpacing: 4,
            wordWrap: { width: summaryW - 176 },
        });
        this.editorContainer.add(issueText);

        const returnCta = createReturnCtaState(summary);
        const exitStripX = localX + 16;
        const exitStripY = summaryH - 54;
        const exitStripW = summaryW - 32;
        const exitStripH = 48;
        const exitStrip = this.scene.add.rectangle(
            exitStripX + exitStripW / 2,
            exitStripY + exitStripH / 2,
            exitStripW,
            exitStripH,
            returnCta.stripFillColor,
            0.98,
        );
        exitStrip.setStrokeStyle(1, summary.accentColor, 0.9);

        const exitHeader = this.scene.add.text(exitStripX + 14, exitStripY + 8, '返回前摘要', {
            fontFamily: 'Arial',
            fontSize: '11px',
            color: returnCta.stripTextColor,
            fontStyle: 'bold',
        });

        const exitSummary = this.scene.add.text(exitStripX + 14, exitStripY + 24, returnCta.summaryLabel, {
            fontFamily: 'Arial',
            fontSize: '11px',
            color: '#e2e8f0',
            wordWrap: { width: exitStripW - 184 },
        }).setOrigin(0, 0.5);

        const ctaButtonWidth = 150;
        const ctaButtonHeight = 36;
        const ctaButtonX = exitStripX + exitStripW - ctaButtonWidth / 2 - 8;
        const ctaButtonY = exitStripY + exitStripH / 2;
        const ctaButton = this.scene.add.rectangle(
            ctaButtonX,
            ctaButtonY,
            ctaButtonWidth,
            ctaButtonHeight,
            returnCta.buttonFillColor,
            1,
        );
        ctaButton.setStrokeStyle(1, returnCta.buttonStrokeColor, 0.95);
        ctaButton.setInteractive({ useHandCursor: true });
        ctaButton.on('pointerover', () => ctaButton.setFillStyle(returnCta.buttonHoverFillColor, 1));
        ctaButton.on('pointerout', () => ctaButton.setFillStyle(returnCta.buttonFillColor, 1));
        ctaButton.on('pointerdown', () => this.config.onClose());

        const ctaLabel = this.scene.add.text(ctaButtonX, ctaButtonY - 6, '返回远征准备', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: returnCta.buttonTextColor,
            fontStyle: 'bold',
        }).setOrigin(0.5);
        const ctaSubLabel = this.scene.add.text(ctaButtonX, ctaButtonY + 8, returnCta.buttonStatusLabel, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: returnCta.buttonTextColor,
        }).setOrigin(0.5);
        this.editorContainer.add([exitStrip, exitHeader, exitSummary, ctaButton, ctaLabel, ctaSubLabel]);

        const cardListTitle = this.scene.add.text(localX, listHeaderY, `卡牌清单 · ${deck.cards.length} 个条目 / ${summary.count} 张`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const cardListSubtitle = this.scene.add.text(localX + summaryW, listHeaderY + 2, '右侧加入，列表内可移除 1 张', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(1, 0);
        this.editorContainer.add([cardListTitle, cardListSubtitle]);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(this.editorContainer.x, this.editorContainer.y + listTop, summaryW, listH);
        const cardsOuter = this.scene.add.container(localX, listTop);
        cardsOuter.setMask(maskGraphics.createGeometryMask());
        const cardsInner = this.scene.add.container(0, 0);
        cardsOuter.add(cardsInner);
        this.editorContainer.add([maskGraphics, cardsOuter]);

        const maxOffset = Math.max(0, deck.cards.length - this.editorVisibleRows);
        this.editorScrollOffset = Phaser.Math.Clamp(this.editorScrollOffset, 0, maxOffset);

        if (deck.cards.length === 0) {
            const emptyCard = this.scene.add.rectangle(summaryW / 2, 72, summaryW, 116, 0x111827, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const emptyTitle = this.scene.add.text(summaryW / 2, 52, '卡组还是空的', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
            }).setOrigin(0.5);
            const emptyBody = this.scene.add.text(summaryW / 2, 82, '从右侧储物袋挑选卡牌加入这里，合法性会实时更新。', {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: summaryW - 36 },
            }).setOrigin(0.5);
            cardsInner.add([emptyCard, emptyTitle, emptyBody]);
        } else {
            const start = this.editorScrollOffset;
            const end = Math.min(start + this.editorVisibleRows, deck.cards.length);

            for (let index = start; index < end; index += 1) {
                const stack = deck.cards[index];
                const rowY = (index - start) * EDITOR_ROW_HEIGHT;
                const displayName = getCardDisplayName(stack.id, this.config.metadata);
                const metaLabel = getCardMetaLabel(stack.id, this.config.metadata);

                const rowBg = this.scene.add.rectangle(summaryW / 2, rowY + EDITOR_ROW_HEIGHT / 2, summaryW, EDITOR_ROW_HEIGHT - 6, 0x111827, 0.98);
                rowBg.setStrokeStyle(1, SECTION_BORDER, 0.82);

                const nameText = this.scene.add.text(14, rowY + 14, displayName, {
                    fontFamily: 'Arial',
                    fontSize: '15px',
                    color: '#f8fafc',
                    fontStyle: 'bold',
                });
                const metaText = this.scene.add.text(14, rowY + 35, metaLabel, {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: '#94a3b8',
                });

                const [countPillBg, countPillText] = this.createPill(summaryW - 152, rowY + 18, `×${stack.count}`, 0x1d4ed8, '#dbeafe');
                const removeButton = this.createButton(
                    summaryW - 54,
                    rowY + EDITOR_ROW_HEIGHT / 2,
                    82,
                    28,
                    '移除 1',
                    0x7f1d1d,
                    () => {
                        const newCards = removeCardFromStack(deck.cards, stack.id);
                        const newStash = updateSavedDeckInStash(this.stash, deck.id, newCards);
                        this.applyStashChange(newStash);
                        this.refreshEditor();
                        this.refreshDeckList();
                        this.refreshBrowser();
                    },
                    false,
                    {
                        hoverFillColor: 0x991b1b,
                        strokeColor: 0xfca5a5,
                        fontSize: '13px',
                    },
                );

                cardsInner.add([
                    rowBg,
                    nameText,
                    metaText,
                    countPillBg,
                    countPillText,
                    ...removeButton,
                ]);
            }
        }

        const total = deck.cards.length;
        const start = total === 0 ? 0 : this.editorScrollOffset + 1;
        const end = total === 0 ? 0 : Math.min(this.editorScrollOffset + this.editorVisibleRows, total);
        const posText = this.scene.add.text(localX, scrollBtnY, `显示 ${start}-${end} / ${total}`, {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(0, 0.5);

        const scrollUpButton = this.createButton(
            summaryW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.editorScrollOffset = Math.max(0, this.editorScrollOffset - 1);
                this.refreshEditor();
            },
            this.editorScrollOffset <= 0,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            summaryW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.editorScrollOffset += 1;
                this.refreshEditor();
            },
            this.editorScrollOffset >= maxOffset,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );

        this.editorContainer.add([posText, ...scrollUpButton, ...scrollDownButton]);
    }

    private createBrowserColumn(x: number, y: number, colW: number, colH: number): void {
        this.add(this.createSectionFrame(x, y, colW, colH, '储物袋浏览', '筛选库存卡牌并加入当前卡组。', VALID_ACCENT));

        const innerX = x + 16;
        const innerW = colW - 32;
        const searchY = y + 84;
        const toggleY = y + 120;
        const sortY = y + 156;
        const summaryY = y + 192;
        const deleteY = y + colH - 28;
        const scrollBtnY = deleteY - 42;
        const listTop = summaryY + 28;
        const listBottom = scrollBtnY - 18;
        const listH = Math.max(120, listBottom - listTop);

        this.browserArea = { x: innerX, y: listTop, w: innerW, h: listH };
        this.browserVisibleRows = Math.max(1, Math.floor(listH / BROWSER_ROW_HEIGHT));

        this.queryBg = this.scene.add.rectangle(innerX + innerW / 2, searchY, innerW, 30, 0x0f172a, 1);
        this.queryBg.setStrokeStyle(1, SECTION_BORDER, 0.9);
        this.queryBg.setInteractive({ useHandCursor: true });
        this.queryBg.on('pointerdown', () => this.setSearchFocus(true));

        this.queryText = this.scene.add.text(innerX + 14, searchY, this.filterQuery || '搜索卡牌、编号或名称', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: this.filterQuery ? '#f8fafc' : '#64748b',
        }).setOrigin(0, 0.5);

        this.queryClearBtn = this.scene.add.text(innerX + innerW - 14, searchY, '✕', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#94a3b8',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.queryClearBtn.setInteractive({ useHandCursor: true });
        this.queryClearBtn.on('pointerdown', () => {
            this.filterQuery = '';
            this.setSearchFocus(false);
            this.refreshBrowser();
            this.updateSearchDisplay();
        });
        this.queryClearBtn.setVisible(this.filterQuery.length > 0);

        const kindButton = this.createButton(
            innerX + 78,
            toggleY,
            156,
            28,
            `种类: ${KIND_LABEL[String(this.filterKind)]}`,
            0x312e81,
            () => {
                const idx = KIND_CYCLE.indexOf(this.filterKind);
                this.filterKind = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length];
                this.refreshBrowser();
            },
            false,
            {
                hoverFillColor: 0x4338ca,
                strokeColor: 0xa5b4fc,
                fontSize: '13px',
            },
        );
        this.kindBtnText = kindButton[1];

        const hideZeroButton = this.createButton(
            innerX + innerW - 76,
            toggleY,
            152,
            28,
            this.filterHideZero ? '✓ 隐藏零张' : '☐ 显示零张',
            this.filterHideZero ? 0x1d4ed8 : 0x1f2937,
            () => {
                this.filterHideZero = !this.filterHideZero;
                this.refreshBrowser();
            },
            false,
            {
                hoverFillColor: this.filterHideZero ? 0x2563eb : 0x334155,
                strokeColor: this.filterHideZero ? 0x93c5fd : 0x475569,
                fontSize: '13px',
            },
        );
        this.hideZeroBtn = hideZeroButton[0];
        this.hideZeroBtnText = hideZeroButton[1];

        const sortFieldButton = this.createButton(
            innerX + 60,
            sortY,
            120,
            28,
            `排序: ${this.sortField}`,
            0x1f2937,
            () => {
                const fields: CardCollectionSortField[] = ['id', 'count', 'kind', 'name'];
                const idx = fields.indexOf(this.sortField);
                this.sortField = fields[(idx + 1) % fields.length];
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.sortFieldBtnText = sortFieldButton[1];

        const sortDirButton = this.createButton(
            innerX + innerW - 62,
            sortY,
            124,
            28,
            this.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序',
            0x1f2937,
            () => {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.sortDirBtnText = sortDirButton[1];

        this.browserSummaryText = this.scene.add.text(innerX, summaryY, '', {
            fontFamily: 'Arial',
            fontSize: '13px',
            color: '#cbd5e1',
        });

        this.add([
            this.queryBg,
            this.queryText,
            this.queryClearBtn,
            ...kindButton,
            ...hideZeroButton,
            ...sortFieldButton,
            ...sortDirButton,
            this.browserSummaryText,
        ]);

        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(innerX, listTop, innerW, listH);

        this.browserOuter = this.scene.add.container(innerX, listTop);
        this.browserOuter.setMask(maskGraphics.createGeometryMask());
        this.browserInner = this.scene.add.container(0, 0);
        this.browserOuter.add(this.browserInner);
        this.add([maskGraphics, this.browserOuter]);

        const scrollUpButton = this.createButton(
            innerX + innerW - 70,
            scrollBtnY,
            52,
            26,
            '▲',
            0x1f2937,
            () => {
                this.browserScrollOffset = Math.max(0, this.browserScrollOffset - 1);
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        const scrollDownButton = this.createButton(
            innerX + innerW - 16,
            scrollBtnY,
            52,
            26,
            '▼',
            0x1f2937,
            () => {
                this.browserScrollOffset += 1;
                this.refreshBrowser();
            },
            false,
            { hoverFillColor: 0x334155, strokeColor: 0x475569, fontSize: '13px' },
        );
        this.add([...scrollUpButton, ...scrollDownButton]);

        this.browserPosText = this.scene.add.text(innerX, scrollBtnY, '', {
            fontFamily: 'Arial',
            fontSize: '12px',
            color: '#94a3b8',
        }).setOrigin(0, 0.5);
        this.add(this.browserPosText);

        this.refreshBrowser();
    }

    private refreshBrowser(): void {
        if (!this.browserInner) return;

        this.updateSearchDisplay();

        if (this.kindBtnText) {
            this.kindBtnText.setText(`种类: ${KIND_LABEL[String(this.filterKind)]}`);
        }

        if (this.hideZeroBtn) {
            this.hideZeroBtn.setFillStyle(this.filterHideZero ? 0x1d4ed8 : 0x1f2937, 1);
            this.hideZeroBtn.setStrokeStyle(1, this.filterHideZero ? 0x93c5fd : 0x475569, 0.95);
        }

        if (this.hideZeroBtnText) {
            this.hideZeroBtnText.setText(this.filterHideZero ? '✓ 隐藏零张' : '☐ 显示零张');
        }

        if (this.sortFieldBtnText) {
            this.sortFieldBtnText.setText(`排序: ${this.sortField}`);
        }

        if (this.sortDirBtnText) {
            this.sortDirBtnText.setText(this.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序');
        }

        this.browserInner.removeAll(true);

        const filters: CardCollectionFilters = {
            query: this.filterQuery || undefined,
            kind: this.filterKind,
            hideZeroCount: this.filterHideZero,
        };
        const sort: CardCollectionSortConfig = {
            field: this.sortField,
            direction: this.sortDirection,
        };

        const rows = computeCardCollectionViewModel(this.stash.cards, {
            metadata: this.config.metadata,
            filters,
            sort,
        });

        const maxOffset = Math.max(0, rows.length - this.browserVisibleRows);
        this.browserScrollOffset = Phaser.Math.Clamp(this.browserScrollOffset, 0, maxOffset);

        const selectedDeck = this.getSelectedDeck();
        const deckCards = selectedDeck?.cards ?? [];
        const selectedSummary = this.getSelectedDeckStatus();

        if (this.browserSummaryText) {
            const summaryParts = [`显示 ${rows.length} 张库存条目`];
            if (selectedDeck) {
                summaryParts.push(`当前卡组：${selectedSummary?.count ?? 0} 张 · ${selectedSummary?.statusLabel ?? '未选择'}`);
            } else {
                summaryParts.push('未选择卡组');
            }
            this.browserSummaryText.setText(summaryParts.join(' · '));
        }

        if (rows.length === 0) {
            const emptyTitle = this.filterQuery
                ? '没有匹配当前搜索的卡牌'
                : this.filterHideZero
                    ? '没有符合筛选的可用卡牌'
                    : '储物袋中还没有卡牌';
            const emptyBody = !selectedDeck
                ? '先在左侧创建并选择一个卡组，再决定要加入哪些卡牌。'
                : '试试切换种类、排序或零张显示方式。';

            const emptyCard = this.scene.add.rectangle(this.browserArea.w / 2, 78, this.browserArea.w, 124, 0x0f172a, 0.98);
            emptyCard.setStrokeStyle(1, SECTION_BORDER, 0.9);
            const title = this.scene.add.text(this.browserArea.w / 2, 56, emptyTitle, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#e2e8f0',
                fontStyle: 'bold',
                align: 'center',
                wordWrap: { width: this.browserArea.w - 40 },
            }).setOrigin(0.5);
            const body = this.scene.add.text(this.browserArea.w / 2, 92, emptyBody, {
                fontFamily: 'Arial',
                fontSize: '13px',
                color: '#94a3b8',
                align: 'center',
                wordWrap: { width: this.browserArea.w - 40 },
            }).setOrigin(0.5);
            this.browserInner.add([emptyCard, title, body]);
        } else {
            const start = this.browserScrollOffset;
            const end = Math.min(start + this.browserVisibleRows, rows.length);

            for (let index = start; index < end; index += 1) {
                const row = rows[index];
                const rowY = (index - start) * BROWSER_ROW_HEIGHT;
                const inDeck = deckCards.find((stack) => stack.id === row.id)?.count ?? 0;
                const available = computeAvailable(this.stash.cards, deckCards, row.id);
                const deckCount = countDeckCards(deckCards);
                const hasDeck = selectedDeck !== null;
                const deckFull = deckCount >= DECK_CARD_MAX;
                const canAdd = hasDeck && available > 0 && !deckFull;
                const displayName = row.name ?? row.id;
                const borderColor = canAdd ? 0x1f8a4c : SECTION_BORDER;
                const fillColor = available > 0 ? 0x0f172a : 0x111827;

                const secondaryParts: string[] = [];
                if (displayName !== row.id) {
                    secondaryParts.push(row.id);
                }
                if (row.kind) {
                    secondaryParts.push(KIND_LABEL[row.kind]);
                }
                secondaryParts.push(`袋中 ${row.count}`);
                secondaryParts.push(`卡组 ${inDeck}`);
                secondaryParts.push(`余量 ${Math.max(available, 0)}`);

                let buttonLabel = '加入';
                if (!hasDeck) {
                    buttonLabel = '未选';
                } else if (deckFull) {
                    buttonLabel = '已满';
                } else if (available <= 0) {
                    buttonLabel = '无余量';
                }

                const rowBg = this.scene.add.rectangle(this.browserArea.w / 2, rowY + BROWSER_ROW_HEIGHT / 2, this.browserArea.w, BROWSER_ROW_HEIGHT - 6, fillColor, 0.98);
                rowBg.setStrokeStyle(1, borderColor, canAdd ? 0.9 : 0.65);

                const nameText = this.scene.add.text(14, rowY + 14, displayName, {
                    fontFamily: 'Arial',
                    fontSize: '15px',
                    color: available > 0 ? '#f8fafc' : '#94a3b8',
                    fontStyle: 'bold',
                });
                const detailText = this.scene.add.text(14, rowY + 35, secondaryParts.join(' · '), {
                    fontFamily: 'Arial',
                    fontSize: '11px',
                    color: available > 0 ? '#cbd5e1' : '#64748b',
                });

                const addButton = this.createButton(
                    this.browserArea.w - 46,
                    rowY + BROWSER_ROW_HEIGHT / 2,
                    84,
                    30,
                    buttonLabel,
                    0x166534,
                    () => {
                        if (!selectedDeck) return;
                        const newCards = addCardToStack(deckCards, row.id);
                        const newStash = updateSavedDeckInStash(this.stash, selectedDeck.id, newCards);
                        this.applyStashChange(newStash);
                        this.refreshBrowser();
                        this.refreshEditor();
                        this.refreshDeckList();
                    },
                    !canAdd,
                    {
                        hoverFillColor: 0x15803d,
                        strokeColor: 0x86efac,
                        disabledFillColor: 0x1f2937,
                        disabledStrokeColor: 0x334155,
                        fontSize: '12px',
                    },
                );

                this.browserInner.add([rowBg, nameText, detailText, ...addButton]);
            }
        }

        if (this.browserPosText) {
            const total = rows.length;
            const start = total === 0 ? 0 : this.browserScrollOffset + 1;
            const end = total === 0 ? 0 : Math.min(this.browserScrollOffset + this.browserVisibleRows, total);
            this.browserPosText.setText(`显示 ${start}-${end} / ${total}`);
        }
    }

    private showDeleteConfirmation(): void {
        if (this.dialogMode) return;
        const deck = this.getSelectedDeck();
        if (!deck || !this.selectedDeckId) return;

        this.dialogMode = true;

        const { width, height } = this.scene.scale;
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.62)
            .setInteractive()
            .setDepth(1500);

        const boxW = 452;
        const boxH = 214;
        const box = this.scene.add.rectangle(width / 2, height / 2, boxW, boxH, 0x111827, 0.99)
            .setStrokeStyle(2, INVALID_ACCENT, 0.92)
            .setDepth(1501);

        const title = this.scene.add.text(width / 2, height / 2 - 68, '确认删除当前卡组', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(1501);

        const body = this.scene.add.text(width / 2, height / 2 - 18, `确定要删除卡组「${deck.name}」吗？\n删除后无法撤销，请谨慎确认。`, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#cbd5e1',
            align: 'center',
        }).setOrigin(0.5).setDepth(1501);

        const [cancelBtn, cancelLabel] = this.createButton(
            width / 2 - 88,
            height / 2 + 58,
            130,
            36,
            '取消',
            0x334155,
            () => this.hideDeleteConfirmation(),
            false,
            { hoverFillColor: 0x475569, strokeColor: 0x94a3b8 },
        );
        cancelBtn.setDepth(1501);
        cancelLabel.setDepth(1501);

        const [confirmBtn, confirmLabel] = this.createButton(
            width / 2 + 88,
            height / 2 + 58,
            130,
            36,
            '确认删除',
            0xb91c1c,
            () => this.confirmDelete(),
            false,
            { hoverFillColor: 0xdc2626, strokeColor: 0xfca5a5 },
        );
        confirmBtn.setDepth(1501);
        confirmLabel.setDepth(1501);

        this.dialogObjects = [overlay, box, title, body, cancelBtn, cancelLabel, confirmBtn, confirmLabel];
    }

    private hideDeleteConfirmation(): void {
        this.dialogMode = false;
        this.dialogObjects.forEach((obj) => obj.destroy());
        this.dialogObjects = [];
    }

    private confirmDelete(): void {
        if (!this.selectedDeckId) return;

        const newStash = deleteSavedDeckFromStash(this.stash, this.selectedDeckId);
        this.applyStashChange(newStash);
        this.refreshDeckList();
        this.refreshEditor();
        this.refreshBrowser();
        this.hideDeleteConfirmation();
    }
}
