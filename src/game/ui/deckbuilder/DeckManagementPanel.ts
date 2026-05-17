import { GameObjects, Scene } from 'phaser';

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
    deleteSavedDeckFromStash,
    renameSavedDeckInStash,
    updateSavedDeckInStash,
    validateDeckSize,
} from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, PersistentStash, SavedDeck } from '../../types/expedition';

export interface DeckManagementPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    onStashChange: (stash: PersistentStash) => void;
    onClose: () => void;
}

const SCROLL_ITEM_HEIGHT = 34;
const DECK_LIST_VISIBLE = 10;
const BROWSER_VISIBLE = 10;

function createDeckId(): string {
    return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function addCardToStack(stacks: readonly ExpeditionCardStack[], cardId: string): ExpeditionCardStack[] {
    const existing = stacks.find((s) => s.id === cardId);
    if (existing) {
        return stacks.map((s) => (s.id === cardId ? { id: s.id, count: s.count + 1 } : { ...s }));
    }
    return [...stacks.map((s) => ({ ...s })), { id: cardId, count: 1 }];
}

function removeCardFromStack(stacks: readonly ExpeditionCardStack[], cardId: string): ExpeditionCardStack[] {
    return stacks
        .map((s) => (s.id === cardId ? { id: s.id, count: s.count - 1 } : { ...s }))
        .filter((s) => s.count > 0);
}

function computeAvailable(
    stashCards: readonly ExpeditionCardStack[],
    deckCards: readonly ExpeditionCardStack[],
    cardId: string,
): number {
    const stashCount = stashCards.find((c) => c.id === cardId)?.count ?? 0;
    const deckCount = deckCards.find((c) => c.id === cardId)?.count ?? 0;
    return stashCount - deckCount;
}

export class DeckManagementPanel extends GameObjects.Container {
    private stash: PersistentStash;
    private readonly config: DeckManagementPanelConfig;
    private selectedDeckId: string | null = null;

    private deckListScrollOffset = 0;
    private browserScrollOffset = 0;

    private filterQuery = '';
    private filterHideZero = true;
    private sortField: CardCollectionSortField = 'id';
    private sortDirection: 'asc' | 'desc' = 'asc';

    private renameMode = false;
    private renameBuffer = '';

    private deleteDeckBtn?: GameObjects.Rectangle;
    private deleteDeckLabel?: GameObjects.Text;

    private deckListOuter?: GameObjects.Container;
    private deckListInner?: GameObjects.Container;
    private editorContainer?: GameObjects.Container;
    private browserOuter?: GameObjects.Container;
    private browserInner?: GameObjects.Container;
    private queryText?: GameObjects.Text;

    private keydownHandler?: (event: KeyboardEvent) => void;

    constructor(scene: Scene, config: DeckManagementPanelConfig) {
        super(scene, 0, 0);
        this.stash = config.stash;
        this.config = config;
        this.selectedDeckId = config.stash.selectedDeckId ?? config.stash.savedDecks[0]?.id ?? null;

        this.createPanel();
        scene.add.existing(this);

        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);
    }

    destroy(fromScene?: boolean): void {
        if (this.keydownHandler) {
            this.scene.input.keyboard?.off('keydown', this.keydownHandler);
        }
        super.destroy(fromScene);
    }

    private getSelectedDeck(): SavedDeck | null {
        return this.stash.savedDecks.find((d) => d.id === this.selectedDeckId) ?? null;
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.renameMode) return;

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

    private applyStashChange(newStash: PersistentStash): void {
        this.stash = newStash;
        this.config.onStashChange(this.stash);
        this.selectedDeckId = this.stash.selectedDeckId ?? this.stash.savedDecks[0]?.id ?? null;
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(1040, width * 0.86);
        const panelHeight = Math.min(700, height * 0.82);
        const panelX = width / 2;
        const panelY = height / 2 + 24;

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 0.78);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.97);
        panel.setStrokeStyle(3, 0x7c3aed, 0.9);

        const title = this.scene.add.text(panelX - panelWidth / 2 + 40, panelY - panelHeight / 2 + 30, '卡组管理', {
            fontFamily: 'Arial',
            fontSize: '30px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const closeButton = this.createButton(
            panelX + panelWidth / 2 - 100,
            panelY - panelHeight / 2 + 30,
            120,
            40,
            '返回',
            0x334155,
            () => this.config.onClose(),
        );

        const leftColX = panelX - panelWidth / 2 + 28;
        const leftColW = 250;
        const centerColX = leftColX + leftColW + 18;
        const centerColW = 360;
        const rightColX = centerColX + centerColW + 18;
        const rightColW = panelWidth - (centerColW + leftColW + 36) - 28;
        const contentY = panelY - panelHeight / 2 + 88;

        this.add([overlay, panel, title, ...closeButton]);

        this.createDeckListColumn(leftColX, contentY, leftColW, panelHeight - 140);
        this.createEditorColumn(centerColX, contentY, centerColW, panelHeight - 140);
        this.createBrowserColumn(rightColX, contentY, rightColW, panelHeight - 140);

        this.setDepth(1200);
    }

    private createButton(
        x: number, y: number, w: number, h: number, label: string, fillColor: number, onClick: () => void, disabled = false,
    ): [GameObjects.Rectangle, GameObjects.Text] {
        const btn = this.scene.add.rectangle(x, y, w, h, fillColor, 1);
        btn.setStrokeStyle(2, 0xffffff, disabled ? 0.3 : 0.8);
        if (!disabled) {
            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setAlpha(0.84));
            btn.on('pointerout', () => btn.setAlpha(1));
            btn.on('pointerdown', onClick);
        } else {
            btn.setAlpha(0.55);
        }
        const txt = this.scene.add.text(x, y, label, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        return [btn, txt];
    }

    private createSmallButton(
        x: number, y: number, label: string, fillColor: number, onClick: () => void, disabled = false,
    ): [GameObjects.Rectangle, GameObjects.Text] {
        return this.createButton(x, y, 60, 26, label, fillColor, onClick, disabled);
    }

    // ─── Left column: Deck List ───────────────────────────────────

    private createDeckListColumn(x: number, y: number, colW: number, colH: number): void {
        const header = this.scene.add.text(x, y, '已有卡组', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        this.add([header]);

        const newDeckBtn = this.createButton(x + colW / 2, y + 40, colW - 12, 36, '＋ 新建卡组', 0x2563eb, () => {
            const id = createDeckId();
            const newStash = addSavedDeckToStash(this.stash, id, null, []);
            this.applyStashChange(newStash);
            this.refreshDeckList();
            this.refreshEditor();
            this.refreshBrowser();
        });
        this.add(newDeckBtn);

        const listTop = y + 80;
        const listH = colH - 160;
        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(x, listTop, colW, listH);

        this.deckListOuter = this.scene.add.container(x, listTop);
        this.deckListOuter.setMask(maskGraphics.createGeometryMask());
        this.deckListInner = this.scene.add.container(0, 0);
        this.deckListOuter.add(this.deckListInner);

        this.add([maskGraphics, this.deckListOuter]);

        const scrollBtnY = listTop + listH + 16;
        this.add(this.createSmallButton(x + colW / 2 - 34, scrollBtnY, '▲', 0x334155, () => {
            this.deckListScrollOffset = Math.max(0, this.deckListScrollOffset - 1);
            this.refreshDeckList();
        }));
        this.add(this.createSmallButton(x + colW / 2 + 34, scrollBtnY, '▼', 0x334155, () => {
            this.deckListScrollOffset += 1;
            this.refreshDeckList();
        }));

        const deleteY = scrollBtnY + 36;
        const canDelete = this.selectedDeckId !== null && this.stash.savedDecks.length > 1;
        const [delBtn, delLabel] = this.createButton(x + colW / 2, deleteY, colW - 12, 34, '删除选中卡组', canDelete ? 0xdc2626 : 0x475569, () => {
            if (!this.selectedDeckId) return;
            const newStash = deleteSavedDeckFromStash(this.stash, this.selectedDeckId);
            this.applyStashChange(newStash);
            this.refreshDeckList();
            this.refreshEditor();
            this.refreshBrowser();
        }, !canDelete);
        this.deleteDeckBtn = delBtn;
        this.deleteDeckLabel = delLabel;
        this.add([delBtn, delLabel]);

        this.refreshDeckList();
    }

    private refreshDeckList(): void {
        if (!this.deckListInner) return;
        this.deckListInner.removeAll(true);

        const decks = this.stash.savedDecks;
        const maxOffset = Math.max(0, decks.length - DECK_LIST_VISIBLE);
        this.deckListScrollOffset = Math.max(0, Math.min(this.deckListScrollOffset, maxOffset));

        for (let i = this.deckListScrollOffset; i < Math.min(decks.length, this.deckListScrollOffset + DECK_LIST_VISIBLE); i++) {
            const deck = decks[i];
            const rowY = (i - this.deckListScrollOffset) * SCROLL_ITEM_HEIGHT;
            const isSelected = deck.id === this.selectedDeckId;

            const bg = this.scene.add.rectangle(125, rowY + SCROLL_ITEM_HEIGHT / 2, 240, SCROLL_ITEM_HEIGHT - 2, isSelected ? 0x1e3a5f : 0x0f172a, 0.9);
            bg.setStrokeStyle(1, isSelected ? 0x3b82f6 : 0x334155, isSelected ? 0.8 : 0.4);

            const count = countDeckCards(deck.cards);
            const validity = validateDeckSize(deck.cards);
            const dotColor = validity === null ? '#4ade80' : '#f87171';
            const dot = this.scene.add.text(20, rowY + SCROLL_ITEM_HEIGHT / 2, '●', {
                fontFamily: 'Arial',
                fontSize: '12px',
                color: dotColor,
            }).setOrigin(0.5);

            const label = this.scene.add.text(38, rowY + SCROLL_ITEM_HEIGHT / 2, `${deck.name}  (${count})`, {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: isSelected ? '#f8fafc' : '#cbd5e1',
            }).setOrigin(0, 0.5);

            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', () => {
                this.selectedDeckId = deck.id;
                this.refreshDeckList();
                this.refreshEditor();
                this.refreshBrowser();
            });

            this.deckListInner.add([bg, dot, label]);
        }

        this.updateDeleteButton();
    }

    private updateDeleteButton(): void {
        if (!this.deleteDeckBtn || !this.deleteDeckLabel) return;
        const canDelete = this.selectedDeckId !== null && this.stash.savedDecks.length > 1;
        this.deleteDeckBtn.setFillStyle(canDelete ? 0xdc2626 : 0x475569);
        this.deleteDeckBtn.setStrokeStyle(2, 0xffffff, canDelete ? 0.8 : 0.3);
        this.deleteDeckBtn.setAlpha(canDelete ? 1 : 0.55);
        this.deleteDeckBtn.removeAllListeners();
        if (canDelete) {
            this.deleteDeckBtn.setInteractive({ useHandCursor: true });
            this.deleteDeckBtn.on('pointerover', () => this.deleteDeckBtn?.setAlpha(0.84));
            this.deleteDeckBtn.on('pointerout', () => this.deleteDeckBtn?.setAlpha(1));
            this.deleteDeckBtn.on('pointerdown', () => {
                if (!this.selectedDeckId) return;
                const newStash = deleteSavedDeckFromStash(this.stash, this.selectedDeckId);
                this.applyStashChange(newStash);
                this.refreshDeckList();
                this.refreshEditor();
                this.refreshBrowser();
            });
        }
    }

    // ─── Center column: Deck Editor ────────────────────────────────

    private createEditorColumn(x: number, y: number, colW: number, _colH: number): void {
        const header = this.scene.add.text(x, y, '卡组编辑', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        this.add([header]);

        this.editorContainer = this.scene.add.container(x, y + 42);
        this.add(this.editorContainer);
        this.refreshEditor();
    }

    private refreshEditor(): void {
        if (!this.editorContainer) return;
        this.editorContainer.removeAll(true);

        const deck = this.getSelectedDeck();
        if (!deck) {
            const placeholder = this.scene.add.text(0, 20, '请先在左侧选择或新建一个卡组', {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#94a3b8',
            });
            this.editorContainer.add(placeholder);
            return;
        }

        const count = countDeckCards(deck.cards);

        if (this.renameMode) {
            const renameLabel = this.scene.add.text(0, 0, '编辑名称 (Enter确认 / Esc取消):', {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: '#fde68a',
            });
            const renameText = this.scene.add.text(0, 24, this.renameBuffer + '|', {
                fontFamily: 'Courier New',
                fontSize: '18px',
                color: '#f8fafc',
                fontStyle: 'bold',
            });
            this.editorContainer.add([renameLabel, renameText]);
        } else {
            const nameText = this.scene.add.text(0, 0, `名称：${deck.name}`, {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#f8fafc',
                fontStyle: 'bold',
            });
            nameText.setInteractive({ useHandCursor: true });
            nameText.on('pointerdown', () => {
                this.renameMode = true;
                this.renameBuffer = deck.name;
                this.refreshEditor();
            });
            this.editorContainer.add(nameText);
        }

        const countY = this.renameMode ? 56 : 32;
        const countColor = count < 20 ? '#f87171' : count > DECK_CARD_MAX ? '#f87171' : '#4ade80';
        const countText = this.scene.add.text(0, countY, `卡片：${count} / 20-${DECK_CARD_MAX}`, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: countColor,
        });

        const separator = this.scene.add.text(0, countY + 30, '─'.repeat(32), {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: '#334155',
        });

        this.editorContainer.add([countText, separator]);

        if (deck.cards.length === 0) {
            const emptyText = this.scene.add.text(0, countY + 52, '卡组为空，请从右侧储物袋添加卡牌', {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: '#64748b',
            });
            this.editorContainer.add(emptyText);
            return;
        }

        const cardsStartY = countY + 52;
        deck.cards.forEach((stack, i) => {
            const rowY = cardsStartY + i * SCROLL_ITEM_HEIGHT;
            const cardLabel = this.scene.add.text(0, rowY, `${stack.id}  ×${stack.count}`, {
                fontFamily: 'Courier New',
                fontSize: '16px',
                color: '#e2e8f0',
            }).setOrigin(0, 0.5);

            const removeBtn = this.createSmallButton(240, rowY, '移除', 0xdc2626, () => {
                const newCards = removeCardFromStack(deck.cards, stack.id);
                const newStash = updateSavedDeckInStash(this.stash, deck.id, newCards);
                this.applyStashChange(newStash);
                this.refreshEditor();
                this.refreshDeckList();
                this.refreshBrowser();
            });
            this.editorContainer.add([cardLabel, ...removeBtn]);
        });
    }

    // ─── Right column: Card Browser ─────────────────────────────────

    private createBrowserColumn(x: number, y: number, colW: number, colH: number): void {
        const header = this.scene.add.text(x, y, '储物袋卡牌', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });
        this.add([header]);

        const queryLabel = this.scene.add.text(x, y + 36, '搜索:', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#cbd5e1',
        });
        const queryBg = this.scene.add.rectangle(x + 100, y + 36, 140, 24, 0x1e293b, 1);
        queryBg.setStrokeStyle(1, 0x475569, 0.8);
        queryBg.setInteractive({ useHandCursor: true });
        queryBg.on('pointerdown', () => {
            const input = prompt('输入卡牌 ID 搜索（留空清除）:', this.filterQuery);
            if (input !== null) {
                this.filterQuery = input;
                this.refreshBrowser();
            }
        });
        this.queryText = this.scene.add.text(x + 100, y + 36, this.filterQuery || '点击输入...', {
            fontFamily: 'Arial',
            fontSize: '14px',
            color: this.filterQuery ? '#f8fafc' : '#64748b',
        }).setOrigin(0.5);

        const hideZeroBtn = this.createButton(
            x + colW / 2, y + 64, colW - 16, 28,
            this.filterHideZero ? '✓ 隐藏零张' : '☐ 隐藏零张',
            this.filterHideZero ? 0x2563eb : 0x334155,
            () => {
                this.filterHideZero = !this.filterHideZero;
                this.refreshBrowser();
            },
        );

        const sortLabel = this.scene.add.text(x, y + 92, '排序:', {
            fontFamily: 'Arial',
            fontSize: '15px',
            color: '#cbd5e1',
        });
        const sortFieldBtn = this.createButton(x + 58, y + 92, 58, 24, this.sortField, 0x334155, () => {
            const fields: CardCollectionSortField[] = ['id', 'count', 'kind', 'name'];
            const idx = fields.indexOf(this.sortField);
            this.sortField = fields[(idx + 1) % fields.length];
            this.refreshBrowser();
        });
        const sortDirBtn = this.createButton(x + 124, y + 92, 58, 24, this.sortDirection === 'asc' ? '↑ 升序' : '↓ 降序', 0x334155, () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            this.refreshBrowser();
        });

        this.add([queryLabel, queryBg, this.queryText, ...hideZeroBtn, sortLabel, ...sortFieldBtn, ...sortDirBtn]);

        const listTop = y + 128;
        const listH = colH - 222;
        const maskGraphics = this.scene.make.graphics({});
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(x, listTop, colW, listH);

        this.browserOuter = this.scene.add.container(x, listTop);
        this.browserOuter.setMask(maskGraphics.createGeometryMask());
        this.browserInner = this.scene.add.container(0, 0);
        this.browserOuter.add(this.browserInner);

        this.add([maskGraphics, this.browserOuter]);

        const scrollBtnY = listTop + listH + 16;
        this.add(this.createSmallButton(x + colW / 2 - 34, scrollBtnY, '▲', 0x334155, () => {
            this.browserScrollOffset = Math.max(0, this.browserScrollOffset - 1);
            this.refreshBrowser();
        }));
        this.add(this.createSmallButton(x + colW / 2 + 34, scrollBtnY, '▼', 0x334155, () => {
            this.browserScrollOffset += 1;
            this.refreshBrowser();
        }));

        this.refreshBrowser();
    }

    private refreshBrowser(): void {
        if (!this.browserInner) return;

        if (this.queryText) {
            this.queryText.setText(this.filterQuery || '点击输入...');
            this.queryText.setColor(this.filterQuery ? '#f8fafc' : '#64748b');
        }

        this.browserInner.removeAll(true);

        const filters: CardCollectionFilters = {
            query: this.filterQuery || undefined,
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

        const maxOffset = Math.max(0, rows.length - BROWSER_VISIBLE);
        this.browserScrollOffset = Math.max(0, Math.min(this.browserScrollOffset, maxOffset));

        const selectedDeck = this.getSelectedDeck();
        const deckCards = selectedDeck?.cards ?? [];

        for (let i = this.browserScrollOffset; i < Math.min(rows.length, this.browserScrollOffset + BROWSER_VISIBLE); i++) {
            const row = rows[i];
            const rowY = (i - this.browserScrollOffset) * SCROLL_ITEM_HEIGHT;
            const available = computeAvailable(this.stash.cards, deckCards, row.id);
            const deckCount = countDeckCards(deckCards);
            const canAdd = available > 0 && deckCount < DECK_CARD_MAX;
            const displayName = row.name ?? row.id;

            const label = this.scene.add.text(0, rowY, `${displayName} 可用:${available}`, {
                fontFamily: 'Arial',
                fontSize: '15px',
                color: available > 0 ? '#e2e8f0' : '#64748b',
            }).setOrigin(0, 0.5);

            const addBtn = this.createSmallButton(220, rowY, '加入', canAdd ? 0x16a34a : 0x475569, () => {
                if (!selectedDeck) return;
                const newCards = addCardToStack(deckCards, row.id);
                const newStash = updateSavedDeckInStash(this.stash, selectedDeck.id, newCards);
                this.applyStashChange(newStash);
                this.refreshBrowser();
                this.refreshEditor();
                this.refreshDeckList();
            }, !canAdd);

            this.browserInner.add([label, ...addBtn]);
        }
    }
}
