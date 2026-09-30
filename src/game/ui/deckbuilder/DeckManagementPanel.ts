import { GameObjects, Scene } from 'phaser';

import type { CardKind } from '@data/types/cards/core';
import { INK, PX, hex } from '../../art/palette';
import { snap } from '../../art/pix';
import { PTooltip, clip, numberFont, panel, pbutton, piconButton, ptext, type FrameStyle } from '../../art/kit';
import { addIcon, type PixIcon } from '../../art/icons';
import { pxBurst } from '../../art/fx';
import { wenxinCardTexture } from '../../art/wenxin/WenxinArt';
import type { PreviewCardData } from '../../managers/common/cardPreviewProtocol';
import {
    computeCardCollectionViewModel,
    type CardCollectionRow,
    type CardCollectionSortField,
    type CardMetadata,
    type CardMetadataMap,
} from '../../state/CardCollectionViewModel';
import {
    addSavedDeckToStash,
    adjustDeckCardCount,
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    deleteSavedDeckFromStash,
    renameSavedDeckInStash,
    selectDeckInStash,
    updateSavedDeckInStash,
    topUpSavedDeckToMinimum,
    validateDeckAvailability,
} from '../../state/PersistentStashDecks';
import type { ExpeditionCardStack, PersistentStash, SavedDeck } from '../../types/expedition';
import { NativeTextEntryOverlay } from '../common/NativeTextEntryOverlay';
import { cardInfo } from '../common/cardInfo';
import type { EntryPanelFrame, EntryPanelFrameProvider } from '../expedition/EntryPanelFrame';
import { DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID, type DeckManagementCardPreviewResolver } from './DeckManagementCardPreview';

export interface DeckManagementPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    starterCards?: readonly ExpeditionCardStack[];
    previewResolver: DeckManagementCardPreviewResolver;
    initialKeyboardZone?: 'decks' | 'editor' | 'browser' | 'return';
    onStashChange: (stash: PersistentStash) => void;
    onClose: () => void;
}

const KIND_ORDER: CardKind[] = ['unit', 'artifact', 'talisman', 'field', 'skill', 'pill'];
const KIND_LABEL: Record<CardKind, string> = { unit: '灵契', artifact: '法器', talisman: '符箓', field: '场地', skill: '功法', pill: '丹药' };
const KIND_ICON: Record<CardKind, PixIcon> = { unit: 'star', artifact: 'sword', talisman: 'talisman', field: 'mountain', skill: 'scroll', pill: 'pill' };
const SORT_FIELDS: CardCollectionSortField[] = ['kind', 'name', 'count', 'id'];
const SORT_LABEL: Record<CardCollectionSortField, string> = { kind: '种类', name: '名称', count: '库存', id: '编号' };
const DEFAULT_LIMIT_PER_DECK = 3;
const SEARCH_SESSION = 'deck-search';
const NAME_SESSION = 'deck-name';
const createDeckId = () => `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Rect { x: number; y: number; w: number; h: number }
interface ScrollRegion { rect: Rect; content: GameObjects.Container; offset: number; height: number; mask: GameObjects.Graphics }

/**
 * 卡组工坊 — three columns over the expedition backdrop:
 *   decks (list + 新建 / 重命名 / 删除) · 储 物 袋 (pixel card grid; left-click adds, right-click removes)
 *   · the current deck (count, status, grouped list with −/+).
 * Hovering any card shows its full text in a pixel scroll.
 */
export class DeckManagementPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly config: DeckManagementPanelConfig;
    private readonly nativeText: NativeTextEntryOverlay;
    private readonly panelFrame: EntryPanelFrame;
    private railRect!: Rect;
    private collRect!: Rect;
    private deckRect!: Rect;
    private readonly railLayer: GameObjects.Container;
    private readonly collLayer: GameObjects.Container;
    private readonly deckLayer: GameObjects.Container;
    private railScroll!: ScrollRegion;
    private gridScroll!: ScrollRegion;
    private listScroll!: ScrollRegion;
    private toolbar!: GameObjects.Container;
    private deckHeader!: GameObjects.Container;
    private railFooter!: GameObjects.Container;
    private tip: PTooltip;
    private selectedDeckId: string | null;
    private query = '';
    private kindFilter: CardKind | undefined;
    private hideZero = true;
    private sortIndex = 0;
    private sortDesc = false;
    private deleteArmedAt = 0;
    private bound: Array<() => void> = [];

    constructor(scene: Scene, config: DeckManagementPanelConfig) {
        super(scene, 0, 0);
        this.config = config;
        this.stash = config.stash;
        this.selectedDeckId = config.stash.selectedDeckId ?? config.stash.savedDecks[0]?.id ?? null;
        this.nativeText = new NativeTextEntryOverlay(scene);
        this.tip = new PTooltip(scene, PX * 150, 1500);
        const { width: W, height: H } = scene.scale;
        this.panelFrame = { panelX: W / 2, panelY: H / 2, panelWidth: W, panelHeight: H };
        this.computeLayout();
        this.railLayer = scene.add.container(0, 0);
        this.collLayer = scene.add.container(0, 0);
        this.deckLayer = scene.add.container(0, 0);
        this.add([this.railLayer, this.collLayer, this.deckLayer]);
        scene.add.existing(this);
        this.setDepth(1200);
        this.buildFrames();
        this.buildRail();
        this.buildCollection();
        this.buildDeckPane();
        this.refreshAll();
        this.bindInput();
        this.setAlpha(0);
        scene.tweens.add({ targets: this, alpha: 1, duration: 160, ease: 'Stepped', easeParams: [3] });
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    // ------------------------------------------------------------------------------ layout
    private computeLayout() {
        const { width: W, height: H } = this.scene.scale;
        const top = PX * 52, bottom = H - PX * 8, gap = PX * 5;
        const railW = PX * 92, deckW = PX * 150;
        this.railRect = { x: PX * 8, y: top, w: railW, h: bottom - top };
        this.deckRect = { x: W - PX * 8 - deckW, y: top, w: deckW, h: bottom - top };
        this.collRect = { x: this.railRect.x + railW + gap, y: top, w: this.deckRect.x - gap - (this.railRect.x + railW + gap), h: bottom - top };
    }

    private framePanel(r: Rect, style: FrameStyle = 'ink') {
        return panel(this.scene, r.x + r.w / 2, r.y + r.h / 2, snap(r.w), snap(r.h), style);
    }

    private buildFrames() {
        this.railLayer.add(this.framePanel(this.railRect));
        this.collLayer.add(this.framePanel(this.collRect));
        this.deckLayer.add(this.framePanel(this.deckRect));
    }

    private makeScroll(rect: Rect, parent: GameObjects.Container): ScrollRegion {
        const content = this.scene.add.container(rect.x, rect.y);
        parent.add(content);
        const mask = this.scene.make.graphics({});
        mask.fillStyle(0xffffff).fillRect(rect.x, rect.y, rect.w, rect.h);
        content.setMask(mask.createGeometryMask());
        return { rect, content, offset: 0, height: rect.h, mask };
    }

    private setScroll(region: ScrollRegion, offset: number) {
        const max = Math.max(0, region.height - region.rect.h);
        region.offset = Phaser.Math.Clamp(offset, 0, max);
        region.content.y = snap(region.rect.y - region.offset);
    }

    private inside(rect: Rect, p: Phaser.Input.Pointer) {
        return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    }

    // ------------------------------------------------------------------------------ data helpers
    private get deck(): SavedDeck | null {
        return this.stash.savedDecks.find(d => d.id === this.selectedDeckId) ?? null;
    }
    private meta(id: string): CardMetadata { return this.config.metadata?.[id] ?? {}; }
    private nameOf(id: string) { return this.meta(id).name ?? id; }
    private owned(id: string) { return this.stash.cards.find(c => c.id === id)?.count ?? 0; }
    private inDeck(id: string, deck = this.deck) { return deck?.cards.find(c => c.id === id)?.count ?? 0; }
    private kindOf(id: string): CardKind | undefined { return this.meta(id).kind; }

    private commit(next: PersistentStash) {
        this.stash = next;
        this.config.onStashChange(next);
    }

    private setDeckCards(deckId: string, cards: ExpeditionCardStack[]) {
        this.commit(updateSavedDeckInStash(this.stash, deckId, cards));
    }

    private canAdd(id: string): { ok: boolean; reason?: string } {
        const deck = this.deck;
        if (!deck) return { ok: false, reason: '先新建或选择一套卡组' };
        if (countDeckCards(deck.cards) >= DECK_CARD_MAX) return { ok: false, reason: `卡组已满（${DECK_CARD_MAX} 张）` };
        if (this.owned(id) - this.inDeck(id) <= 0) return { ok: false, reason: '储物袋里没有更多了' };
        const limit = this.meta(id).limitPerDeck ?? DEFAULT_LIMIT_PER_DECK;
        if (this.inDeck(id) >= limit) return { ok: false, reason: `同名卡最多带 ${limit} 张` };
        return { ok: true };
    }

    // ------------------------------------------------------------------------------ actions
    private addCard(id: string, from?: { x: number; y: number }, amount = 1) {
        let added = 0;
        for (let i = 0; i < amount; i++) {
            const check = this.canAdd(id);
            if (!check.ok) {
                if (added === 0) this.toast(check.reason ?? '无法加入', 'warn');
                break;
            }
            const deck = this.deck!;
            this.setDeckCards(deck.id, adjustDeckCardCount(deck.cards, id, 1));
            added++;
        }
        if (!added) return;
        this.refreshAll();
        if (from) pxBurst(this.scene, from.x, from.y, { colors: [INK.gold, INK.paper], count: 8, speed: 140, size: 6, depth: 1600 });
    }

    private topUpDeck() {
        const deck = this.deck;
        if (!deck) return;
        const missing = DECK_CARD_MIN - countDeckCards(deck.cards);
        const next = topUpSavedDeckToMinimum(this.stash, deck.id, this.config.starterCards ?? [], this.config.metadata);
        if (next === this.stash) { this.toast('可用卡牌不足，暂时无法补齐', 'warn'); return; }
        this.commit(next);
        this.refreshAll();
        this.toast(`已补入 ${missing} 张，当前卡组共 ${DECK_CARD_MIN} 张`, 'ok');
    }

    private removeCard(id: string, amount = 1) {
        const deck = this.deck;
        if (!deck || this.inDeck(id) <= 0) return;
        this.setDeckCards(deck.id, adjustDeckCardCount(deck.cards, id, -Math.min(amount, this.inDeck(id))));
        this.refreshAll();
    }

    private selectDeck(id: string) {
        if (id === this.selectedDeckId) return;
        this.selectedDeckId = id;
        this.commit(selectDeckInStash(this.stash, id));
        this.refreshAll();
    }

    private newDeck() {
        const id = createDeckId();
        let next = addSavedDeckToStash(this.stash, id, null, []);
        next = selectDeckInStash(next, id);
        this.selectedDeckId = id;
        this.commit(next);
        this.refreshAll();
        this.setScroll(this.railScroll, 1e6);
        this.toast('已新建卡组，点选储物袋里的卡牌加入', 'ok');
        this.startRename();
    }

    private deleteDeck() {
        const deck = this.deck;
        if (!deck) return;
        if (this.stash.savedDecks.length <= 1) { this.toast('至少保留一套卡组', 'warn'); return; }
        const now = this.scene.time.now;
        if (now - this.deleteArmedAt > 2600) {
            this.deleteArmedAt = now;
            this.toast(`再点一次“删除”确认删除「${deck.name}」`, 'warn');
            return;
        }
        this.deleteArmedAt = 0;
        const next = deleteSavedDeckFromStash(this.stash, deck.id);
        this.selectedDeckId = next.selectedDeckId;
        this.commit(next);
        this.refreshAll();
        this.toast('卡组已删除', 'ok');
    }

    private startRename() {
        const deck = this.deck;
        if (!deck) return;
        this.nativeText.activate({
            id: NAME_SESSION,
            ariaLabel: '卡组名称输入',
            value: deck.name,
            selectAllOnFocus: true,
            getBounds: () => this.nameBounds(),
            style: { fontFamily: 'Zpix, monospace', fontSize: 36, color: '#fbf4df', caretColor: '#f5cf6a', lineHeight: 42 },
            onConfirm: (value) => this.finishRename(value),
            onCancel: () => this.nativeText.deactivate(NAME_SESSION),
            onBlur: () => this.finishRename(undefined),
        });
    }

    private finishRename(value: string | undefined) {
        const deck = this.deck;
        this.nativeText.deactivate(NAME_SESSION);
        if (!deck || value === undefined) return;
        const trimmed = value.trim();
        if (!trimmed || trimmed === deck.name) return;
        this.commit(renameSavedDeckInStash(this.stash, deck.id, trimmed));
        this.refreshAll();
    }

    private nameBounds() {
        const r = this.deckRect;
        return { x: r.x + PX * 8, y: r.y + PX * 6, width: r.w - PX * 16, height: PX * 16 };
    }

    private close() {
        this.nativeText.deactivate(NAME_SESSION);
        this.nativeText.deactivate(SEARCH_SESSION);
        this.config.onClose();
    }

    // ------------------------------------------------------------------------------ deck rail
    private buildRail() {
        const r = this.railRect;
        this.railLayer.add(pbutton(this.scene, { x: r.x + r.w / 2, y: r.y + PX * 14, width: r.w - PX * 12, height: PX * 20, icon: 'back', label: '返回', style: 'slate', onClick: () => this.close() }));
        this.railLayer.add(ptext(this.scene, r.x + PX * 8, r.y + PX * 30, '卡 组', { color: INK.gold }));
        const listRect = { x: r.x + PX * 4, y: r.y + PX * 46, w: r.w - PX * 8, h: r.h - PX * 46 - PX * 82 };
        this.railScroll = this.makeScroll(listRect, this.railLayer);
        this.railFooter = this.scene.add.container(0, 0);
        this.railLayer.add(this.railFooter);
        const fy = r.y + r.h - PX * 70;
        const bw = r.w - PX * 12;
        this.railFooter.add(pbutton(this.scene, { x: r.x + r.w / 2, y: fy, width: bw, height: PX * 20, label: '＋ 新建卡组', style: 'jade', onClick: () => this.newDeck() }));
        this.railFooter.add(pbutton(this.scene, { x: r.x + r.w / 2, y: fy + PX * 24, width: bw, height: PX * 20, label: '重命名', style: 'slate', onClick: () => this.startRename() }));
        this.railFooter.add(pbutton(this.scene, { x: r.x + r.w / 2, y: fy + PX * 48, width: bw, height: PX * 20, label: '删除', style: 'seal', onClick: () => this.deleteDeck() }));
    }

    private refreshRail() {
        const region = this.railScroll;
        region.content.removeAll(true);
        const w = region.rect.w;
        const rowH = PX * 30;
        this.stash.savedDecks.forEach((deck, i) => {
            const y = i * (rowH + PX * 3);
            const sel = deck.id === this.selectedDeckId;
            const count = countDeckCards(deck.cards);
            const ok = count >= DECK_CARD_MIN && count <= DECK_CARD_MAX && validateDeckAvailability(deck.cards, this.stash.cards).length === 0;
            const bg = panel(this.scene, w / 2, y + rowH / 2, w, rowH, sel ? 'gold' : 'slate');
            const name = ptext(this.scene, PX * 6, y + PX * 8, clip(deck.name, Math.floor((w - PX * 14) / 36)), { color: sel ? INK.gold : INK.paper, origin: [0, 0.5] });
            const dot = this.scene.add.rectangle(PX * 7, y + PX * 21, PX * 2, PX * 2, ok ? INK.spirit : INK.vermilion);
            const n = ptext(this.scene, PX * 12, y + PX * 21, `${count} 张`, { color: INK.mist, origin: [0, 0.5] });
            const hit = this.scene.add.rectangle(w / 2, y + rowH / 2, w, rowH, 0, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.inside(region.rect, p)) this.selectDeck(deck.id); });
            region.content.add([bg, name, dot, n, hit]);
        });
        region.height = this.stash.savedDecks.length * (rowH + PX * 3);
        this.setScroll(region, region.offset);
    }

    // ------------------------------------------------------------------------------ collection grid
    private buildCollection() {
        const r = this.collRect;
        this.toolbar = this.scene.add.container(0, 0);
        this.collLayer.add(this.toolbar);
        const gridRect = { x: r.x + PX * 4, y: r.y + PX * 52, w: r.w - PX * 8, h: r.h - PX * 56 };
        this.gridScroll = this.makeScroll(gridRect, this.collLayer);
        this.refreshToolbar();
    }

    private searchRect() {
        const r = this.collRect;
        const sw = Math.min(PX * 110, r.w * 0.4);
        return { x: r.x + r.w - sw - PX * 6, y: r.y + PX * 5, w: sw, h: PX * 18 };
    }

    private refreshToolbar() {
        this.toolbar.removeAll(true);
        const r = this.collRect;
        const t = this.toolbar;
        t.add(ptext(this.scene, r.x + PX * 8, r.y + PX * 8, '储 物 袋', { color: INK.gold }));
        // search box
        const sr = this.searchRect();
        const searching = this.nativeText.isActive(SEARCH_SESSION);
        t.add(panel(this.scene, sr.x + sr.w / 2, sr.y + sr.h / 2, snap(sr.w), sr.h, searching ? 'gold' : 'slate'));
        const has = this.query.trim().length > 0;
        if (!searching) t.add(ptext(this.scene, sr.x + PX * 16, sr.y + sr.h / 2 - PX, has ? clip(this.query, 8) : '搜索名称或编号', { color: has ? INK.paper : INK.mist, origin: [0, 0.5] }));
        t.add(addIcon(this.scene, sr.x + PX * 8, sr.y + sr.h / 2, 'eye'));
        const hit = this.scene.add.rectangle(sr.x + sr.w / 2, sr.y + sr.h / 2, sr.w, sr.h, 0, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.focusSearch());
        t.add(hit);
        if (has && !searching) t.add(piconButton(this.scene, sr.x + sr.w - PX * 8, sr.y + sr.h / 2, 'close', () => { this.query = ''; this.refreshToolbar(); this.refreshGrid(); }, 'slate', 12));

        // kind chips (icons) + sort + stock toggle
        const cy = r.y + PX * 36;
        const chips: Array<{ k: CardKind | undefined; label: string; icon?: PixIcon }> = [
            { k: undefined, label: '全部' },
            ...KIND_ORDER.map(k => ({ k, label: KIND_LABEL[k], icon: KIND_ICON[k] })),
        ];
        let x = r.x + PX * 6;
        chips.forEach((chip) => {
            const active = this.kindFilter === chip.k;
            const w = chip.icon ? PX * 20 : PX * 30;
            const b = pbutton(this.scene, { x: x + w / 2, y: cy, width: w, height: PX * 18, icon: chip.icon, label: chip.icon ? undefined : chip.label, style: active ? 'gold' : 'slate',
                onClick: () => { this.kindFilter = chip.k; this.refreshToolbar(); this.refreshGrid(); this.setScroll(this.gridScroll, 0); } });
            if (chip.icon) {
                b.on('pointerover', (p: Phaser.Input.Pointer) => this.tip.show(p.x + PX * 6, p.y + PX * 6, chip.label, ''));
                b.on('pointerout', () => this.tip.hide());
            }
            t.add(b);
            x += w + PX * 2;
        });
        const sortLabel = `${SORT_LABEL[SORT_FIELDS[this.sortIndex]]}${this.sortDesc ? '↓' : '↑'}`;
        const sortW = PX * 38;
        t.add(pbutton(this.scene, { x: x + PX * 4 + sortW / 2, y: cy, width: sortW, height: PX * 18, label: sortLabel, style: 'slate', onClick: () => {
            if (this.sortDesc) { this.sortDesc = false; this.sortIndex = (this.sortIndex + 1) % SORT_FIELDS.length; } else this.sortDesc = true;
            this.refreshToolbar(); this.refreshGrid();
        } }));
        x += PX * 6 + sortW;
        const zw = PX * 52;
        if (x + zw < r.x + r.w - PX * 4) {
            t.add(pbutton(this.scene, { x: x + PX * 2 + zw / 2, y: cy, width: zw, height: PX * 18, label: this.hideZero ? '仅有库存' : '含无库存', style: this.hideZero ? 'jade' : 'slate', onClick: () => {
                this.hideZero = !this.hideZero; this.refreshToolbar(); this.refreshGrid();
            } }));
        }
    }

    private focusSearch() {
        this.nativeText.activate({
            id: SEARCH_SESSION,
            ariaLabel: '储物袋搜索输入',
            value: this.query,
            placeholder: '搜索名称或编号…',
            getBounds: () => { const sr = this.searchRect(); return { x: sr.x + PX * 16, y: sr.y + PX * 2, width: sr.w - PX * 22, height: sr.h - PX * 4 }; },
            style: { fontFamily: 'Zpix, monospace', fontSize: 36, color: '#fbf4df', placeholderColor: '#7f93b2', caretColor: '#f5cf6a', lineHeight: 42 },
            onValueChange: (v) => { this.query = v; this.refreshGrid(); },
            onConfirm: (v) => { this.query = v; this.nativeText.deactivate(SEARCH_SESSION); this.refreshToolbar(); },
            onCancel: () => { this.nativeText.deactivate(SEARCH_SESSION); this.refreshToolbar(); },
            onBlur: () => { this.nativeText.deactivate(SEARCH_SESSION); this.refreshToolbar(); },
        });
        this.refreshToolbar();
    }

    private collectionRows(): CardCollectionRow[] {
        return computeCardCollectionViewModel(this.stash.cards, {
            metadata: this.config.metadata,
            filters: { query: this.query, kind: this.kindFilter, hideZeroCount: this.hideZero },
            sort: { field: SORT_FIELDS[this.sortIndex], direction: this.sortDesc ? 'desc' : 'asc' },
        });
    }

    private showCardTip(id: string, x: number, y: number) {
        const data = this.config.previewResolver(id) as PreviewCardData | null;
        const info = data ? cardInfo(this.scene, data as never) : { title: this.nameOf(id), sub: '', body: this.meta(id).description ?? '', gongfa: [] as Array<{ name: string; text: string }> };
        const extra = `库存 ${this.owned(id)} · 已带 ${this.inDeck(id)}`;
        this.tip.show(x, y, info.title, [info.sub, extra, info.body, ...info.gongfa.map((g) => `【${g.name}】${g.text}`)].filter(Boolean).join('\n'));
    }

    private refreshGrid() {
        const region = this.gridScroll;
        region.content.removeAll(true);
        const rows = this.collectionRows();
        const cw = 180, ch = 258, gap = PX * 5, labelH = PX * 12;
        const cols = Math.max(1, Math.floor((region.rect.w + gap) / (cw + gap)));
        const ox = snap((region.rect.w - (cols * cw + (cols - 1) * gap)) / 2);
        rows.forEach((row, i) => {
            const x = ox + (i % cols) * (cw + gap) + cw / 2;
            const y = PX * 4 + Math.floor(i / cols) * (ch + labelH + gap) + ch / 2;
            const id = row.id;
            const data = this.config.previewResolver(id);
            const key = wenxinCardTexture(this.scene, (data ?? { id, name: this.nameOf(id), kind: this.kindOf(id) }) as never);
            const inDeck = this.inDeck(id);
            const avail = row.count - inDeck;
            const img = key ? this.scene.add.image(x, y, key).setScale(PX) : this.scene.add.rectangle(x, y, cw, ch, INK.indigo);
            if (avail <= 0) img.setAlpha(0.45);
            region.content.add(img);
            if (data && data.kind === 'unit') {
                const u = data as { attack: number; health: number };
                const a = this.scene.add.bitmapText(x - 55, y + 108, numberFont(this.scene, INK.paper), `${u.attack}`).setOrigin(0.5).setScale(PX);
                const h = this.scene.add.bitmapText(x + 55, y + 108, numberFont(this.scene, INK.paper), `${u.health}`).setOrigin(0.5).setScale(PX);
                a.setLetterSpacing(-1); h.setLetterSpacing(-1);
                region.content.add([a, h]);
            }
            // stock line under the card: available / owned, and the in-deck tag
            region.content.add(ptext(this.scene, x, y + ch / 2 + PX * 6, `余 ${avail}/${row.count}`, { color: avail > 0 ? INK.spirit : INK.ash, origin: [0.5, 0.5] }));
            if (inDeck > 0) {
                region.content.add(panel(this.scene, x + cw / 2 - PX * 12, y - ch / 2 + PX * 8, PX * 22, PX * 14, 'gold'));
                region.content.add(this.scene.add.bitmapText(x + cw / 2 - PX * 12, y - ch / 2 + PX * 8, numberFont(this.scene, INK.gold), `x${inDeck}`).setOrigin(0.5).setScale(PX));
            }
            const hit = this.scene.add.rectangle(x, y, cw, ch, 0, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerover', (p: Phaser.Input.Pointer) => {
                if (!this.inside(region.rect, p)) return;
                img.y = y - PX * 3;
                this.showCardTip(id, Math.min(p.x + PX * 10, this.scene.scale.width - PX * 156), p.y - PX * 60);
            });
            hit.on('pointerout', () => { img.y = y; this.tip.hide(); });
            hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
                if (!this.inside(region.rect, p)) return;
                if (p.rightButtonDown()) this.removeCard(id, 1);
                else this.addCard(id, { x: p.x, y: p.y }, p.event && (p.event as MouseEvent).shiftKey ? 5 : 1);
            });
            region.content.add(hit);
        });
        region.height = PX * 8 + Math.ceil(rows.length / cols) * (ch + labelH + gap);
        this.setScroll(region, region.offset);
        if (rows.length === 0) region.content.add(ptext(this.scene, region.rect.w / 2, PX * 30, this.query || this.kindFilter ? '没有符合条件的卡牌' : '储物袋是空的', { color: INK.mist, origin: [0.5, 0.5] }));
    }

    // ------------------------------------------------------------------------------ deck pane
    private buildDeckPane() {
        const r = this.deckRect;
        this.deckHeader = this.scene.add.container(0, 0);
        this.deckLayer.add(this.deckHeader);
        const listRect = { x: r.x + PX * 4, y: r.y + PX * 72, w: r.w - PX * 8, h: r.h - PX * 72 - PX * 20 };
        this.listScroll = this.makeScroll(listRect, this.deckLayer);
        this.deckLayer.add(ptext(this.scene, r.x + r.w / 2, r.y + r.h - PX * 10, '左键加入 · 右键移出', { color: INK.slate, origin: [0.5, 0.5], fx: 'none' }).setColor(hex(INK.mist)));
    }

    private refreshDeckHeader() {
        const h = this.deckHeader;
        h.removeAll(true);
        const r = this.deckRect;
        const deck = this.deck;
        if (!deck) {
            h.add(ptext(this.scene, r.x + PX * 8, r.y + PX * 8, '未选择卡组', { color: INK.mist }));
            return;
        }
        const count = countDeckCards(deck.cards);
        const issues = validateDeckAvailability(deck.cards, this.stash.cards);
        const ok = count >= DECK_CARD_MIN && count <= DECK_CARD_MAX && issues.length === 0;
        if (!this.nativeText.isActive(NAME_SESSION)) {
            const name = ptext(this.scene, r.x + PX * 8, r.y + PX * 5, clip(deck.name, Math.floor((r.w - PX * 16) / 72)), { size: 2, color: INK.paper });
            name.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startRename());
            h.add(name);
        }
        const num = this.scene.add.bitmapText(r.x + PX * 8, r.y + PX * 42, numberFont(this.scene, ok ? INK.spirit : INK.amber), `${count}`).setOrigin(0, 0.5).setScale(PX * 2);
        num.setLetterSpacing(-1);
        h.add(num);
        h.add(ptext(this.scene, r.x + PX * 10 + num.displayWidth, r.y + PX * 42, `/ ${DECK_CARD_MIN}-${DECK_CARD_MAX}`, { color: INK.mist, origin: [0, 0.5] }));
        const status = count < DECK_CARD_MIN ? `还差 ${DECK_CARD_MIN - count} 张`
            : count > DECK_CARD_MAX ? `超出 ${count - DECK_CARD_MAX} 张`
                : issues.length ? `库存不足 ${issues.length} 种` : '卡组合格，可以出发';
        h.add(ptext(this.scene, r.x + PX * 8, r.y + PX * 60, status, { color: ok ? INK.spirit : INK.vermilion, origin: [0, 0.5] }));
        if (count < DECK_CARD_MIN) {
            h.add(pbutton(this.scene, { x: r.x + r.w - PX * 26, y: r.y + PX * 42, width: PX * 40, height: PX * 18, label: '补齐', style: 'jade', onClick: () => this.topUpDeck() }));
        }
    }

    private refreshList() {
        const region = this.listScroll;
        region.content.removeAll(true);
        const deck = this.deck;
        if (!deck) return;
        const w = region.rect.w;
        const rowH = PX * 20;
        let y = 0;
        const missing = new Set(validateDeckAvailability(deck.cards, this.stash.cards).map((issue) => (issue as { cardId?: string }).cardId));
        for (const kind of KIND_ORDER) {
            const stacks = deck.cards.filter((c) => c.count > 0 && (this.kindOf(c.id) ?? 'unit') === kind);
            if (!stacks.length) continue;
            const total = stacks.reduce((n, c) => n + c.count, 0);
            region.content.add(addIcon(this.scene, PX * 8, y + PX * 7, KIND_ICON[kind]));
            region.content.add(ptext(this.scene, PX * 16, y + PX * 7, `${KIND_LABEL[kind]}  ${total}`, { color: INK.gold, origin: [0, 0.5] }));
            y += PX * 15;
            for (const stack of stacks) {
                const bad = missing.has(stack.id);
                region.content.add(panel(this.scene, w / 2, y + rowH / 2, w, rowH, 'slate'));
                const nameChars = Math.floor((w - PX * 60) / 36);
                region.content.add(ptext(this.scene, PX * 6, y + rowH / 2 - PX, clip(this.nameOf(stack.id), nameChars), { color: bad ? INK.vermilion : INK.paper, origin: [0, 0.5] }));
                region.content.add(this.scene.add.bitmapText(w - PX * 44, y + rowH / 2, numberFont(this.scene, INK.bone), `x${stack.count}`).setOrigin(1, 0.5).setScale(PX));
                const minus = pbutton(this.scene, { x: w - PX * 30, y: y + rowH / 2 - PX, width: PX * 14, height: PX * 16, label: '-', style: 'slate', onClick: () => this.removeCard(stack.id) });
                const plus = pbutton(this.scene, { x: w - PX * 12, y: y + rowH / 2 - PX, width: PX * 14, height: PX * 16, label: '+', style: 'jade', onClick: () => this.addCard(stack.id) });
                const hit = this.scene.add.rectangle((w - PX * 44) / 2, y + rowH / 2, w - PX * 44, rowH, 0, 0.001).setInteractive({ useHandCursor: true });
                hit.on('pointerover', (p: Phaser.Input.Pointer) => this.showCardTip(stack.id, this.deckRect.x - PX * 156, p.y - PX * 30));
                hit.on('pointerout', () => this.tip.hide());
                hit.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.rightButtonDown()) this.removeCard(stack.id); });
                region.content.add([hit, minus, plus]);
                y += rowH + PX * 2;
            }
            y += PX * 4;
        }
        region.height = y;
        this.setScroll(region, region.offset);
    }

    // ------------------------------------------------------------------------------ feedback
    private toast(msg: string, tone: 'ok' | 'warn') {
        const { width, height } = this.scene.scale;
        const t = ptext(this.scene, 0, 0, msg, { color: tone === 'ok' ? INK.spirit : INK.amber, origin: [0.5, 0.5] });
        const bg = panel(this.scene, 0, 0, snap(t.width + PX * 20), PX * 20, 'ink');
        const c = this.scene.add.container(snap(width / 2), snap(height - PX * 30), [bg, t]).setDepth(1600);
        this.scene.tweens.add({ targets: c, y: c.y - PX * 6, alpha: { from: 1, to: 0 }, delay: 1600, duration: 400, onComplete: () => c.destroy() });
    }

    private refreshAll() {
        this.refreshRail();
        this.refreshToolbar();
        this.refreshGrid();
        this.refreshDeckHeader();
        this.refreshList();
    }

    private bindInput() {
        const onWheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
            const step = Math.sign(dy) * PX * 30;
            if (this.inside(this.gridScroll.rect, p)) this.setScroll(this.gridScroll, this.gridScroll.offset + step);
            else if (this.inside(this.listScroll.rect, p)) this.setScroll(this.listScroll, this.listScroll.offset + step);
            else if (this.inside(this.railScroll.rect, p)) this.setScroll(this.railScroll, this.railScroll.offset + step);
        };
        this.scene.input.on('wheel', onWheel);
        this.bound.push(() => this.scene.input.off('wheel', onWheel));
        this.scene.input.mouse?.disableContextMenu();
        const onKey = (e: KeyboardEvent) => {
            if (this.nativeText.isFocused(SEARCH_SESSION) || this.nativeText.isFocused(NAME_SESSION)) return;
            if (e.key === 'Escape') this.close();
            else if (e.key === 'n' || e.key === 'N') this.newDeck();
            else if (e.key === '/') { e.preventDefault(); this.focusSearch(); }
        };
        this.scene.input.keyboard?.on('keydown', onKey);
        this.bound.push(() => this.scene.input.keyboard?.off('keydown', onKey));
    }

    destroy(fromScene?: boolean): void {
        this.bound.forEach(f => f()); this.bound = [];
        this.nativeText.destroy();
        this.tip.destroy();
        [this.railScroll, this.gridScroll, this.listScroll].forEach(r => r?.mask?.destroy());
        this.scene?.events.emit('clearCardPreviewContext', DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID);
        super.destroy(fromScene);
    }
}

export type { PreviewCardData };
