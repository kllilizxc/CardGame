import { GameObjects, Scene } from 'phaser';

import type { CardKind, CardRarity } from '@data/types/cards/core';
import { C, FONT, hex } from '../../art/palette';
import { drawPixelFrame, PANEL_BLOOD, PANEL_INK, PANEL_JADE, type PanelStyle } from '../../art/ui';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import type { PreviewCardData } from '../../managers/common/cardPreviewProtocol';
import type { BaseCardSprite } from '../../objects/BaseCardSprite';
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

// ---------------------------------------------------------------------------------------------
// vocabulary
// ---------------------------------------------------------------------------------------------
const KIND_ORDER: CardKind[] = ['unit', 'artifact', 'talisman', 'field', 'skill', 'pill'];
const KIND_LABEL: Record<CardKind, string> = { unit: '生物', artifact: '神器', talisman: '护符', field: '场地', skill: '技能', pill: '丹药' };
const KIND_GLYPH: Record<CardKind, string> = { unit: '灵', artifact: '器', talisman: '符', field: '阵', skill: '诀', pill: '丹' };
const KIND_COLOR: Record<CardKind, number> = {
    unit: C.celadon, artifact: C.gold, talisman: C.petal, field: C.sky, skill: C.orchid, pill: C.lime,
};
const RARITY_COLOR: Record<CardRarity, number> = {
    common: C.mist, uncommon: C.lime, rare: C.sky, epic: C.orchid, legendary: C.glow,
};
const SORT_FIELDS: CardCollectionSortField[] = ['kind', 'name', 'count', 'id'];
const SORT_LABEL: Record<CardCollectionSortField, string> = { kind: '种类', name: '名称', count: '库存', id: '编号' };
const DEFAULT_LIMIT_PER_DECK = 3;

const SEARCH_SESSION = 'deck-search';
const NAME_SESSION = 'deck-name';

const createDeckId = () => `deck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Rect { x: number; y: number; w: number; h: number }
interface ScrollRegion {
    rect: Rect;
    content: GameObjects.Container;
    offset: number;
    height: number;
    mask: GameObjects.Graphics;
}

const style = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra,
});

/**
 * 卡组编成 — the deck workshop.
 *
 *   ┌ decks ┐ ┌───────────── collection ─────────────┐ ┌──── current deck ────┐
 *   │ list  │ │ search · kind · sort                  │ │ name  27 / 20–40     │
 *   │       │ │  [card][card][card][card]...         │ │ ▓▓▓▓▓▓▓░░░ meter      │
 *   │ + new │ │  click = add · right-click = remove  │ │ grouped rows  − +    │
 *   └───────┘ └──────────────────────────────────────┘ │ ┌ preview ─────────┐ │
 *                                                       └─└──────────────────┘─┘
 *
 * All state changes flow through the existing stash helpers; nothing here invents rules.
 */
export class DeckManagementPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly config: DeckManagementPanelConfig;
    private readonly portrait: boolean;
    private readonly nativeText: NativeTextEntryOverlay;
    private readonly panelFrame: EntryPanelFrame;

    // regions
    private frameRect!: Rect;
    private railRect!: Rect;
    private collRect!: Rect;
    private deckRect!: Rect;

    // layers
    private readonly railLayer: GameObjects.Container;
    private readonly collLayer: GameObjects.Container;
    private readonly deckLayer: GameObjects.Container;
    private readonly toastLayer: GameObjects.Container;

    // dynamic containers
    private railScroll!: ScrollRegion;
    private gridScroll!: ScrollRegion;
    private listScroll!: ScrollRegion;
    private railItems: GameObjects.Container[] = [];
    private deckHeader!: GameObjects.Container;
    private previewBox!: GameObjects.Container;
    private toolbar!: GameObjects.Container;
    private tileCache = new Map<string, GameObjects.Container>();

    // state
    private selectedDeckId: string | null;
    private query = '';
    private kindFilter: CardKind | undefined;
    private hideZero = true;
    private sortIndex = 0;
    private sortDesc = false;
    private hoverCardId: string | null = null;
    private portraitTab: 'collection' | 'deck' = 'collection';
    private deleteArmedAt = 0;
    private countPopTarget?: GameObjects.Text;
    private bound: Array<() => void> = [];
    private lastPreviewId: string | null = null;

    constructor(scene: Scene, config: DeckManagementPanelConfig) {
        super(scene, 0, 0);
        this.config = config;
        this.stash = config.stash;
        this.portrait = isPortraitGameViewport(scene.scale.width, scene.scale.height);
        this.selectedDeckId = config.stash.selectedDeckId ?? config.stash.savedDecks[0]?.id ?? null;
        this.nativeText = new NativeTextEntryOverlay(scene);
        this.computeLayout();
        this.panelFrame = {
            panelX: this.frameRect.x + this.frameRect.w / 2,
            panelY: this.frameRect.y + this.frameRect.h / 2,
            panelWidth: this.frameRect.w,
            panelHeight: this.frameRect.h,
        };
        this.railLayer = scene.add.container(0, 0);
        this.collLayer = scene.add.container(0, 0);
        this.deckLayer = scene.add.container(0, 0);
        this.toastLayer = scene.add.container(0, 0);
        this.add([this.railLayer, this.collLayer, this.deckLayer, this.toastLayer]);
        scene.add.existing(this);
        this.setDepth(1200);

        this.buildFrames();
        this.buildRail();
        this.buildCollection();
        this.buildDeckPane();
        this.refreshAll();
        this.bindInput();
        this.playEntrance();
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    // ---------------------------------------------------------------------------------------
    // layout
    // ---------------------------------------------------------------------------------------
    private computeLayout() {
        const { width: W, height: H } = this.scene.scale;
        if (this.portrait) {
            this.frameRect = { x: 8, y: 56, w: W - 16, h: H - 64 };
            const inner = { x: 20, y: 68, w: W - 40, h: H - 84 };
            this.railRect = { x: inner.x, y: inner.y, w: inner.w, h: 72 };
            this.collRect = { x: inner.x, y: inner.y + 132, w: inner.w, h: inner.h - 132 };
            this.deckRect = { x: inner.x, y: inner.y + 132, w: inner.w, h: inner.h - 132 };
            return;
        }
        this.frameRect = { x: 24, y: 76, w: W - 48, h: H - 100 };
        const pad = 16, gap = 14;
        const x0 = this.frameRect.x + pad, y0 = this.frameRect.y + pad, h = this.frameRect.h - pad * 2;
        this.railRect = { x: x0, y: y0, w: 292, h };
        this.deckRect = { x: this.frameRect.x + this.frameRect.w - pad - 500, y: y0, w: 500, h };
        this.collRect = { x: this.railRect.x + this.railRect.w + gap, y: y0, w: this.deckRect.x - gap - (this.railRect.x + this.railRect.w + gap), h };
    }

    private panel(rect: Rect, s: PanelStyle) {
        const g = this.scene.add.graphics().setPosition(rect.x, rect.y);
        drawPixelFrame(g, rect.w, rect.h, { shadow: false, ...s });
        return g;
    }

    private text(x: number, y: number, s: string, size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
        return this.scene.add.text(x, y, s, style(size, color, extra));
    }

    private buildFrames() {
        const back = this.panel(this.frameRect, { ...PANEL_INK, fill: C.ink, border: C.dusk, hi: C.haze, lo: C.void });
        this.addAt(back, 0);
        if (this.portrait) {
            this.collLayer.add(this.panel(this.collRect, { ...PANEL_INK, fill: C.night }));
            this.deckLayer.add(this.panel(this.deckRect, { ...PANEL_INK, fill: C.night, border: C.olive }));
            return;
        }
        this.railLayer.add(this.panel(this.railRect, { ...PANEL_INK, fill: C.night, border: C.dusk, hi: C.haze }));
        this.collLayer.add(this.panel(this.collRect, { ...PANEL_INK, fill: C.night, border: C.dusk, hi: C.haze }));
        this.deckLayer.add(this.panel(this.deckRect, { ...PANEL_INK, fill: C.night, border: C.olive, hi: C.lime }));
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
        region.content.y = region.rect.y - region.offset;
        this.updateScrollbar(region);
    }

    private scrollbars = new Map<ScrollRegion, GameObjects.Rectangle>();
    private updateScrollbar(region: ScrollRegion) {
        let bar = this.scrollbars.get(region);
        if (!bar) {
            bar = this.scene.add.rectangle(0, 0, 6, 40, C.gold, 0.7).setOrigin(0.5, 0);
            this.add(bar);
            this.scrollbars.set(region, bar);
        }
        const max = Math.max(0, region.height - region.rect.h);
        if (max <= 0) { bar.setVisible(false); return; }
        const th = Math.max(40, (region.rect.h * region.rect.h) / region.height);
        bar.setVisible(true).setSize(6, th).setPosition(region.rect.x + region.rect.w - 5, region.rect.y + (region.offset / max) * (region.rect.h - th));
    }

    private inside(rect: Rect, p: Phaser.Input.Pointer) {
        return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
    }

    // ---------------------------------------------------------------------------------------
    // data helpers
    // ---------------------------------------------------------------------------------------
    private get deck(): SavedDeck | null {
        return this.stash.savedDecks.find(d => d.id === this.selectedDeckId) ?? null;
    }
    private meta(id: string): CardMetadata {
        return this.config.metadata?.[id] ?? {};
    }
    private nameOf(id: string) { return this.meta(id).name ?? id; }
    private owned(id: string) { return this.stash.cards.find(c => c.id === id)?.count ?? 0; }
    private inDeck(id: string, deck = this.deck) { return deck?.cards.find(c => c.id === id)?.count ?? 0; }
    private rarityColor(id: string) { return RARITY_COLOR[this.meta(id).rarity ?? 'common'] ?? C.mist; }
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

    // ---------------------------------------------------------------------------------------
    // actions
    // ---------------------------------------------------------------------------------------
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
        this.flyToken(id, from, true);
        this.popCount(1);
    }

    private topUpDeck() {
        const deck = this.deck;
        if (!deck) return;
        const missing = DECK_CARD_MIN - countDeckCards(deck.cards);
        const next = topUpSavedDeckToMinimum(this.stash, deck.id, this.config.starterCards ?? [], this.config.metadata);
        if (next === this.stash) {
            this.toast('可用卡牌不足，暂时无法补齐', 'warn');
            return;
        }
        this.commit(next);
        this.refreshAll();
        this.popCount(1);
        this.toast(`已补入 ${missing} 张，当前卡组共 ${DECK_CARD_MIN} 张`, 'ok');
    }

    private removeCard(id: string, amount = 1, to?: { x: number; y: number }) {
        const deck = this.deck;
        if (!deck || this.inDeck(id) <= 0) return;
        this.setDeckCards(deck.id, adjustDeckCardCount(deck.cards, id, -Math.min(amount, this.inDeck(id))));
        this.refreshAll();
        if (to) this.flyToken(id, to, false);
        this.popCount(-1);
    }

    private selectDeck(id: string) {
        if (id === this.selectedDeckId) return;
        this.selectedDeckId = id;
        this.commit(selectDeckInStash(this.stash, id));
        this.refreshAll();
        this.pulse(this.deckHeader);
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
            this.refreshRail();
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
        const b = this.nameBounds();
        this.nativeText.activate({
            id: NAME_SESSION,
            ariaLabel: '卡组名称输入',
            value: deck.name,
            selectAllOnFocus: true,
            getBounds: () => this.nameBounds(),
            style: { fontFamily: 'Zpix, monospace', fontSize: 24, color: '#f3ead3', caretColor: '#f2d98d', lineHeight: 30 },
            onConfirm: (value) => this.finishRename(value),
            onCancel: () => this.nativeText.deactivate(NAME_SESSION),
            onBlur: () => this.finishRename(undefined),
        });
        void b;
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
        return { x: r.x + 18, y: r.y + 14, width: r.w - 120, height: 40 };
    }

    private close() {
        this.nativeText.deactivate(NAME_SESSION);
        this.nativeText.deactivate(SEARCH_SESSION);
        this.config.onClose();
    }

    // ---------------------------------------------------------------------------------------
    // building: deck rail
    // ---------------------------------------------------------------------------------------
    private buildRail() {
        const r = this.railRect;
        if (this.portrait) {
            // compact deck bar (◀ name ▶ ＋) and two tabs; rebuilt by refreshRail()
            const bar = this.scene.add.container(0, 0);
            this.railLayer.add(bar);
            this.railScroll = { rect: r, content: bar, offset: 0, height: r.h, mask: this.scene.make.graphics({}) };
            return;
        }
        this.railLayer.add(this.text(r.x + 20, r.y + 16, '卡  组', 24, C.gold, { stroke: hex(C.void), strokeThickness: 4 }));
        const listRect = { x: r.x + 10, y: r.y + 62, w: r.w - 20, h: r.h - 62 - 152 };
        this.railScroll = this.makeScroll(listRect, this.railLayer);
        // footer actions
        const fy = r.y + r.h - 138;
        this.railLayer.add(this.button(r.x + 12, fy, r.w - 24, 52, '＋ 新建卡组', PANEL_JADE, 24, () => this.newDeck()));
        this.railLayer.add(this.button(r.x + 12, fy + 62, (r.w - 32) / 2, 46, '重命名', PANEL_INK, 24, () => this.startRename()));
        const del = this.button(r.x + 20 + (r.w - 32) / 2, fy + 62, (r.w - 32) / 2, 46, '删除', PANEL_BLOOD, 24, () => this.deleteDeck());
        this.railLayer.add(del);
        this.railLayer.add(this.text(r.x + 20, fy + 118, '双击卡组名可直接改名', 12, C.mist));
    }

    private refreshRail() {
        this.railItems.forEach(i => i.destroy());
        this.railItems = [];
        const decks = this.stash.savedDecks;
        if (this.portrait) { this.refreshPortraitBar(); return; }
        const region = this.railScroll;
        const H = 96, G = 10;
        decks.forEach((d, i) => {
            const y = i * (H + G);
            const c = this.scene.add.container(0, y);
            const sel = d.id === this.selectedDeckId;
            const count = countDeckCards(d.cards);
            const ok = count >= DECK_CARD_MIN && count <= DECK_CARD_MAX;
            const w = region.rect.w - 8;
            const g = this.scene.add.graphics();
            const draw = (hot: boolean) => {
                g.clear();
                drawPixelFrame(g, w, H, {
                    shadow: false,
                    fill: sel ? C.pine : C.ink,
                    edge: C.void,
                    border: sel ? C.gold : hot ? C.haze : C.dusk,
                    hi: sel ? C.glow : C.haze,
                    lo: C.void,
                    stud: sel ? C.gold : null,
                });
            };
            draw(false);
            c.add(g);
            const name = this.text(18, 14, d.name, 24, sel ? C.paper : C.fog, { stroke: hex(C.void), strokeThickness: 3 });
            if (name.width > w - 110) name.setScale((w - 110) / name.width);
            c.add(name);
            c.add(this.text(18, 50, `${count} 张`, 12, ok ? C.celadon : count > DECK_CARD_MAX ? C.cinnabar : C.gold));
            c.add(this.text(w - 16, 50, ok ? '可出发' : count < DECK_CARD_MIN ? `差${DECK_CARD_MIN - count}` : `超${count - DECK_CARD_MAX}`, 12, ok ? C.celadon : C.ember).setOrigin(1, 0));
            // kind pips
            const kinds = new Map<CardKind, number>();
            d.cards.forEach(s => { const k = this.kindOf(s.id); if (k) kinds.set(k, (kinds.get(k) ?? 0) + s.count); });
            let px = 18;
            KIND_ORDER.forEach(k => {
                const n = kinds.get(k);
                if (!n) return;
                const pip = this.scene.add.rectangle(px + 5, 78, 10, 10, KIND_COLOR[k]).setOrigin(0.5);
                c.add(pip);
                c.add(this.text(px + 14, 72, `${n}`, 12, C.fog));
                px += 44;
            });
            // meter line
            const mw = w - 36;
            const meter = this.scene.add.graphics().setPosition(18, 44 + 2);
            meter.fillStyle(C.void, 1).fillRect(0, 0, mw, 3);
            meter.fillStyle(ok ? C.celadon : count > DECK_CARD_MAX ? C.cinnabar : C.gold, 1).fillRect(0, 0, Math.round(mw * Math.min(1, count / DECK_CARD_MAX) / 4) * 4, 3);
            c.add(meter);
            c.setSize(w, H).setInteractive(new Phaser.Geom.Rectangle(w / 2, H / 2, w, H), Phaser.Geom.Rectangle.Contains);
            c.input!.cursor = 'pointer';
            let lastClick = 0;
            c.on('pointerover', () => { draw(true); });
            c.on('pointerout', () => { draw(false); });
            c.on('pointerdown', () => {
                if (!this.inside(region.rect, this.scene.input.activePointer)) return;
                const now = this.scene.time.now;
                if (sel && now - lastClick < 380) this.startRename();
                lastClick = now;
                this.selectDeck(d.id);
            });
            region.content.add(c);
            this.railItems.push(c);
        });
        region.height = decks.length * (H + G);
        this.setScroll(region, region.offset);
    }

    private refreshPortraitBar() {
        const bar = this.railScroll.content;
        bar.removeAll(true);
        const r = this.railRect;
        const decks = this.stash.savedDecks;
        const idx = Math.max(0, decks.findIndex(d => d.id === this.selectedDeckId));
        const deck = decks[idx];
        bar.add(this.panel({ x: r.x, y: r.y, w: r.w, h: 64 }, { ...PANEL_INK, fill: C.night }));
        const step = (dir: number) => {
            if (!decks.length) return;
            this.selectDeck(decks[(idx + dir + decks.length) % decks.length].id);
        };
        bar.add(this.button(r.x + 6, r.y + 8, 48, 48, '<', PANEL_INK, 24, () => step(-1)));
        const name = this.text(r.x + r.w / 2 - 20, r.y + 32, deck?.name ?? '无卡组', 24, C.paper, { stroke: hex(C.void), strokeThickness: 4 }).setOrigin(0.5);
        if (name.width > r.w - 200) name.setScale((r.w - 200) / name.width);
        name.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startRename());
        bar.add(name);
        bar.add(this.button(r.x + r.w - 110, r.y + 8, 48, 48, '>', PANEL_INK, 24, () => step(1)));
        bar.add(this.button(r.x + r.w - 56, r.y + 8, 48, 48, '＋', PANEL_JADE, 24, () => this.newDeck()));
        const count = deck ? countDeckCards(deck.cards) : 0;
        const tabs: Array<['collection' | 'deck', string]> = [['collection', '储物袋'], ['deck', `卡组 ${count}/${DECK_CARD_MAX}`]];
        tabs.forEach(([key, label], i) => {
            const active = this.portraitTab === key;
            bar.add(this.button(r.x + i * (r.w / 2 + 2), r.y + 72, r.w / 2 - 2, 52, label, active ? PANEL_JADE : PANEL_INK, 24, () => {
                this.portraitTab = key; this.applyPortraitTab(); this.refreshPortraitBar();
            }));
        });
        this.applyPortraitTab();
    }

    private applyPortraitTab() {
        if (!this.portrait) return;
        this.collLayer.setVisible(this.portraitTab === 'collection');
        this.deckLayer.setVisible(this.portraitTab === 'deck');
        this.gridScroll.content.setVisible(this.portraitTab === 'collection');
        this.listScroll.content.setVisible(this.portraitTab === 'deck');
    }

    // ---------------------------------------------------------------------------------------
    // building: collection
    // ---------------------------------------------------------------------------------------
    private buildCollection() {
        const r = this.collRect;
        this.toolbar = this.scene.add.container(0, 0);
        this.collLayer.add(this.toolbar);
        const toolbarH = this.portrait ? 200 : 122;
        if (!this.portrait) {
            this.collLayer.add(this.text(r.x + 20, r.y + 16, '储 物 袋', 24, C.gold, { stroke: hex(C.void), strokeThickness: 4 }));
        }
        const gridRect = this.portrait
            ? { x: r.x + 4, y: r.y + toolbarH, w: r.w - 8, h: r.h - toolbarH - 8 }
            : { x: r.x + 10, y: r.y + toolbarH, w: r.w - 20, h: r.h - toolbarH - 46 };
        this.gridScroll = this.makeScroll(gridRect, this.collLayer);
        this.refreshToolbar();
    }

    private refreshToolbar() {
        this.toolbar.removeAll(true);
        const r = this.collRect;
        const t = this.toolbar;
        const y0 = this.portrait ? r.y + 8 : r.y + 12;
        // search field
        const sw = this.portrait ? r.w - 24 : 320;
        const sx = this.portrait ? r.x + 12 : r.x + r.w - sw - 20;
        const sg = this.scene.add.graphics().setPosition(sx, y0);
        const searching = this.nativeText.isActive(SEARCH_SESSION);
        drawPixelFrame(sg, sw, 44, { shadow: false, fill: searching ? C.pine : C.ink, edge: C.void, border: searching ? C.gold : C.dusk, hi: C.haze, lo: C.void, stud: null });
        t.add(sg);
        const has = this.query.trim().length > 0;
        const label = this.text(sx + 16, y0 + 10, has ? this.query : '搜索名称或编号…', 24, has ? C.paper : C.mist);
        if (label.width > sw - 60) label.setScale((sw - 60) / label.width);
        label.setVisible(!searching);
        t.add(label);
        const hit = this.scene.add.rectangle(sx + sw / 2, y0 + 22, sw, 44, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.focusSearch());
        t.add(hit);
        if (has) {
            const x = this.text(sx + sw - 26, y0 + 10, '×', 24, C.fog).setInteractive({ useHandCursor: true });
            x.on('pointerdown', () => { this.query = ''; this.nativeText.deactivate(SEARCH_SESSION); this.refreshToolbar(); this.refreshGrid(); });
            t.add(x);
        }
        // kind chips
        const chips: Array<{ k: CardKind | undefined; label: string }> = [{ k: undefined, label: '全部' }, ...KIND_ORDER.map(k => ({ k, label: KIND_LABEL[k] }))];
        const cw = 76, cg = 8;
        const cy = this.portrait ? y0 + 56 : y0 + 56;
        const perRow = this.portrait ? 4 : chips.length;
        chips.forEach((chip, i) => {
            const cx = (this.portrait ? r.x + 12 : r.x + 20) + (i % perRow) * (cw + cg);
            const cyy = cy + Math.floor(i / perRow) * 48;
            const active = this.kindFilter === chip.k;
            const g = this.scene.add.graphics().setPosition(cx, cyy);
            drawPixelFrame(g, cw, 40, { shadow: false, fill: active ? C.pine : C.ink, edge: C.void, border: active ? (chip.k ? KIND_COLOR[chip.k] : C.gold) : C.dusk, hi: active ? C.glow : C.haze, lo: C.void, stud: null });
            t.add(g);
            t.add(this.text(cx + cw / 2, cyy + 20, chip.label, 24, active ? C.paper : C.fog).setOrigin(0.5));
            const hit2 = this.scene.add.rectangle(cx + cw / 2, cyy + 20, cw, 40, 0x000000, 0.001).setInteractive({ useHandCursor: true });
            hit2.on('pointerdown', () => { this.kindFilter = chip.k; this.refreshToolbar(); this.refreshGrid(); this.setScroll(this.gridScroll, 0); });
            t.add(hit2);
        });
        // sort + zero toggles
        const bx = r.x + 20 + chips.length * (cw + cg) + 12;
        const by = this.portrait ? cy + 104 : cy;
        const sortLabel = `${SORT_LABEL[SORT_FIELDS[this.sortIndex]]}${this.sortDesc ? '↓' : '↑'}`;
        const sortBtn = this.button(this.portrait ? r.x + 12 : bx, by, 116, 40, sortLabel, PANEL_INK, 24, () => {
            if (this.sortDesc) { this.sortDesc = false; this.sortIndex = (this.sortIndex + 1) % SORT_FIELDS.length; } else this.sortDesc = true;
            this.refreshToolbar(); this.refreshGrid();
        });
        const zeroBtn = this.button(this.portrait ? r.x + 12 + 128 : bx + 128, by, 132, 40, this.hideZero ? '仅有库存' : '含无库存', this.hideZero ? PANEL_JADE : PANEL_INK, 24, () => {
            this.hideZero = !this.hideZero; this.refreshToolbar(); this.refreshGrid();
        });
        t.add([sortBtn, zeroBtn]);
    }

    private focusSearch() {
        this.nativeText.activate({
            id: SEARCH_SESSION,
            ariaLabel: '储物袋搜索输入',
            value: this.query,
            placeholder: '搜索名称或编号…',
            getBounds: () => {
                const r = this.collRect;
                const sw = this.portrait ? r.w - 24 : 320;
                const sx = this.portrait ? r.x + 12 : r.x + r.w - sw - 20;
                const y0 = this.portrait ? r.y + 8 : r.y + 12;
                return { x: sx + 10, y: y0 + 6, width: sw - 56, height: 32 };
            },
            style: { fontFamily: 'Zpix, monospace', fontSize: 24, color: '#f3ead3', placeholderColor: '#7d8c98', caretColor: '#f2d98d', lineHeight: 30 },
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

    private tileScale() { return this.portrait ? 0.5 : 0.8; }
    private tileSize() {
        const s = this.tileScale();
        return { w: Math.round(180 * s) + 16, h: Math.round(260 * s) + 30 };
    }

    private makeTile(id: string): GameObjects.Container {
        const cached = this.tileCache.get(id);
        if (cached) return cached;
        const s = this.tileScale();
        const { w, h } = this.tileSize();
        const c = this.scene.add.container(0, 0);
        const data = this.config.previewResolver(id);
        let face: BaseCardSprite | null = null;
        if (data) {
            face = CardSpriteFactory.createSprite(this.scene, data as never, 0, 0, s);
            if (face) {
                face.disableDragging(); face.disableInteractive(); face.setDisplayMode('deck');
                face.setPosition(w / 2, 10 + (260 * s) / 2);
            }
        }
        if (face) c.add(face);
        else c.add(this.fallbackFace(id, w, h));
        c.setData('meta', { w, h });
        this.tileCache.set(id, c);
        return c;
    }

    private fallbackFace(id: string, w: number, _h: number) {
        const s = this.tileScale();
        const c = this.scene.add.container(w / 2, 10 + (260 * s) / 2);
        const kind = this.kindOf(id);
        const color = kind ? KIND_COLOR[kind] : C.mist;
        const g = this.scene.add.graphics().setPosition(-(180 * s) / 2, -(260 * s) / 2);
        drawPixelFrame(g, 180 * s, 260 * s, { shadow: false, fill: C.pine, edge: C.void, border: color, hi: C.haze, lo: C.void, stud: C.gold });
        c.add(g);
        c.add(this.text(0, -20, kind ? KIND_GLYPH[kind] : '牌', 36, color).setOrigin(0.5));
        const n = this.text(0, 30, this.nameOf(id), 12, C.paper, { align: 'center', wordWrap: { width: 180 * s - 16 } }).setOrigin(0.5);
        c.add(n);
        return c;
    }

    private refreshGrid() {
        const region = this.gridScroll;
        // detach cached tiles from the scroll content without destroying them
        region.content.removeAll(false);
        this.gridOverlays.forEach(o => o.destroy());
        this.gridOverlays = [];
        const rows = this.collectionRows();
        const { w, h } = this.tileSize();
        const gap = 6;
        const cols = Math.max(1, Math.floor((region.rect.w - 8) / (w + gap)));
        const offsetX = Math.max(0, Math.floor((region.rect.w - cols * (w + gap) + gap) / 2));
        rows.forEach((row, i) => {
            const cx = offsetX + (i % cols) * (w + gap);
            const cy = 8 + Math.floor(i / cols) * (h + gap);
            const tile = this.makeTile(row.id);
            tile.setPosition(cx, cy).setVisible(true);
            region.content.add(tile);
            this.decorateTile(row, cx, cy, w, region);
        });
        region.height = 8 + Math.ceil(rows.length / cols) * (h + gap) + 8;
        this.setScroll(region, region.offset);
        if (rows.length === 0) {
            const empty = this.text(region.rect.w / 2, 90, this.query || this.kindFilter ? '没有符合条件的卡牌' : '储物袋是空的', 24, C.mist).setOrigin(0.5);
            region.content.add(empty);
            this.gridOverlays.push(empty);
        }
        const foot = `共 ${rows.length} 种 · 库存 ${this.stash.cards.reduce((n, c) => n + c.count, 0)} 张`;
        this.footText?.setText(foot);
    }

    private gridOverlays: GameObjects.GameObject[] = [];
    private footText?: GameObjects.Text;

    /** badges, dim and hit-area are rebuilt every refresh (cheap) on top of the cached card face */
    private decorateTile(row: CardCollectionRow, cx: number, cy: number, w: number, region: ScrollRegion) {
        const id = row.id;
        const deck = this.deck;
        const inDeck = this.inDeck(id, deck);
        const avail = row.count - inDeck;
        const s = this.tileScale();
        const cardH = 260 * s;
        const layer = this.scene.add.container(cx, cy);
        const dim = avail <= 0 && inDeck === 0;
        if (dim || avail <= 0) layer.add(this.scene.add.rectangle(w / 2, 10 + cardH / 2, 180 * s, cardH, C.void, 0.38));
        // owned badge
        const badge = this.scene.add.graphics().setPosition(w / 2 - 34, 10 + cardH - 2);
        drawPixelFrame(badge, 68, 26, { shadow: false, fill: C.void, edge: C.void, border: avail > 0 ? C.celadon : C.mist, hi: C.haze, lo: C.void, stud: null });
        layer.add(badge);
        layer.add(this.text(w / 2, 10 + cardH + 11, `${avail}/${row.count}`, 12, avail > 0 ? C.celadon : C.mist).setOrigin(0.5));
        if (inDeck > 0) {
            const chip = this.scene.add.graphics().setPosition(4, 4);
            drawPixelFrame(chip, 44, 28, { shadow: false, fill: C.umber, edge: C.void, border: C.glow, hi: C.glow, lo: C.void, stud: null });
            layer.add(chip);
            layer.add(this.text(26, 18, `×${inDeck}`, 12, C.glow).setOrigin(0.5));
        }
        const hit = this.scene.add.rectangle(w / 2, 10 + cardH / 2, 180 * s, cardH, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        const ring = this.scene.add.graphics().setPosition(w / 2 - (180 * s) / 2 - 3, 7);
        ring.setVisible(false);
        ring.lineStyle(4, C.glow, 1).strokeRect(0, 0, 180 * s + 6, cardH + 6);
        layer.add([ring, hit]);
        hit.on('pointerover', () => {
            if (!this.inside(region.rect, this.scene.input.activePointer)) return;
            ring.setVisible(true);
            this.scene.tweens.add({ targets: layer, y: cy - 6, duration: 90 });
            this.setPreview(id);
        });
        hit.on('pointerout', () => { ring.setVisible(false); this.scene.tweens.add({ targets: layer, y: cy, duration: 90 }); });
        hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
            if (!this.inside(region.rect, p)) return;
            const wp = { x: region.rect.x + cx + w / 2, y: region.rect.y - region.offset + cy + 10 + cardH / 2 };
            if (p.rightButtonDown()) this.removeCard(id, 1);
            else this.addCard(id, wp, p.event && (p.event as MouseEvent).shiftKey ? 5 : 1);
        });
        region.content.add(layer);
        this.gridOverlays.push(layer);
    }

    // ---------------------------------------------------------------------------------------
    // building: deck pane
    // ---------------------------------------------------------------------------------------
    private buildDeckPane() {
        const r = this.deckRect;
        this.deckHeader = this.scene.add.container(0, 0);
        this.deckLayer.add(this.deckHeader);
        const headerH = 180;
        const previewH = this.portrait ? 0 : 300;
        const footerH = 74;
        const listRect = this.portrait
            ? { x: r.x + 8, y: r.y + headerH, w: r.w - 16, h: r.h - headerH - footerH }
            : { x: r.x + 10, y: r.y + headerH, w: r.w - 20, h: r.h - headerH - previewH - footerH - 8 };
        this.listScroll = this.makeScroll(listRect, this.deckLayer);
        this.previewBox = this.scene.add.container(0, 0);
        this.deckLayer.add(this.previewBox);
        // footer: back button
        const fx = r.x + 12, fy = r.y + r.h - footerH + 10;
        this.deckLayer.add(this.button(fx, fy, r.w - 24, 54, '←  返回远征准备', PANEL_JADE, 24, () => this.close()));
        this.footText = this.text(this.collRect.x + 20, this.collRect.y + this.collRect.h - 32, '', 12, C.mist);
        if (!this.portrait) this.collLayer.add(this.footText);
        else this.footText.destroy(), (this.footText = undefined);
        if (!this.portrait) this.collLayer.add(this.text(this.collRect.x + this.collRect.w - 20, this.collRect.y + this.collRect.h - 32, '左键加入 · 右键移出 · Shift 一次加多张', 12, C.mist).setOrigin(1, 0));
    }

    private refreshDeckHeader() {
        const h = this.deckHeader;
        h.removeAll(true);
        const r = this.deckRect;
        const deck = this.deck;
        if (!deck) {
            h.add(this.text(r.x + 20, r.y + 20, '尚无卡组', 24, C.mist));
            return;
        }
        const count = countDeckCards(deck.cards);
        const ok = count >= DECK_CARD_MIN && count <= DECK_CARD_MAX;
        const col = ok ? C.celadon : count > DECK_CARD_MAX ? C.cinnabar : C.gold;
        const name = this.text(r.x + 18, r.y + 16, deck.name, 24, C.paper, { stroke: hex(C.void), strokeThickness: 4 });
        if (name.width > r.w - 150) name.setScale((r.w - 150) / name.width);
        name.setInteractive({ useHandCursor: true });
        name.on('pointerdown', () => this.startRename());
        h.add(name);
        this.countPopTarget = this.text(r.x + r.w - 96, r.y + 30, `${count}`, 36, col, { stroke: hex(C.void), strokeThickness: 6 }).setOrigin(1, 0.5);
        h.add(this.countPopTarget);
        h.add(this.text(r.x + r.w - 92, r.y + 40, `/ ${DECK_CARD_MIN}–${DECK_CARD_MAX}`, 12, C.mist).setOrigin(0, 0.5));
        // meter with min marker
        const mx = r.x + 18, my = r.y + 66, mw = r.w - 36, mh = 22;
        const g = this.scene.add.graphics().setPosition(mx, my);
        g.fillStyle(C.void, 1).fillRect(0, 0, mw, mh);
        g.fillStyle(C.ink, 1).fillRect(3, 3, mw - 6, mh - 6);
        const fill = Math.round(((mw - 6) * Math.min(1, count / DECK_CARD_MAX)) / 4) * 4;
        g.fillStyle(col, 1).fillRect(3, 3, fill, mh - 6);
        g.fillStyle(C.paper, 0.3).fillRect(3, 3, fill, 3);
        const minX = 3 + Math.round(((mw - 6) * DECK_CARD_MIN) / DECK_CARD_MAX);
        g.fillStyle(C.glow, 1).fillRect(minX - 2, -4, 4, mh + 8);
        g.fillStyle(C.void, 0.4);
        for (let i = 1; i < DECK_CARD_MAX; i++) if (i % 5 === 0) g.fillRect(3 + Math.round(((mw - 6) * i) / DECK_CARD_MAX), 3, 2, mh - 6);
        h.add(g);
        h.add(this.text(mx + minX, my + mh + 8, `${DECK_CARD_MIN}`, 12, C.glow).setOrigin(0.5, 0));
        // status line
        const issues = validateDeckAvailability(deck.cards, this.stash.cards);
        const status = issues.length ? `有 ${issues.length} 种卡的库存不足，请调整`
            : count < DECK_CARD_MIN ? `还差 ${DECK_CARD_MIN - count} 张才能出发`
                : count > DECK_CARD_MAX ? `超出上限 ${count - DECK_CARD_MAX} 张`
                    : '卡组合格，可以出发';
        h.add(this.text(mx, my + mh + 30, status, 12, issues.length ? C.cinnabar : col));
        if (count < DECK_CARD_MIN) {
            h.add(this.button(mx, r.y + 134, mw, 38, '补齐至 20 张', PANEL_JADE, 20, () => this.topUpDeck()));
        }
    }

    private refreshList() {
        const region = this.listScroll;
        region.content.removeAll(true);
        const deck = this.deck;
        if (!deck) { region.height = 0; this.setScroll(region, 0); return; }
        const issues = new Set(validateDeckAvailability(deck.cards, this.stash.cards).map(i => (i.kind === 'insufficient-copies' ? i.cardId : '')));
        const groups = new Map<string, ExpeditionCardStack[]>();
        deck.cards.forEach(stack => {
            const k = this.kindOf(stack.id) ?? 'unit';
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k)!.push(stack);
        });
        let y = 4;
        const w = region.rect.w - 12;
        KIND_ORDER.forEach(kind => {
            const stacks = groups.get(kind);
            if (!stacks?.length) return;
            const total = stacks.reduce((n, s) => n + s.count, 0);
            region.content.add(this.scene.add.rectangle(4, y + 12, 6, 16, KIND_COLOR[kind]).setOrigin(0, 0.5));
            region.content.add(this.text(18, y + 12, `${KIND_LABEL[kind]}  ${total}`, 12, KIND_COLOR[kind]).setOrigin(0, 0.5));
            y += 30;
            stacks.sort((a, b) => this.nameOf(a.id).localeCompare(this.nameOf(b.id), 'zh-Hans-CN')).forEach(stack => {
                region.content.add(this.buildRow(stack, kind, 0, y, w, issues.has(stack.id)));
                y += 50;
            });
            y += 6;
        });
        if (!deck.cards.length) {
            region.content.add(this.text(w / 2, 60, '空空如也\n从左侧储物袋点选卡牌加入', 24, C.mist, { align: 'center', lineSpacing: 10 }).setOrigin(0.5, 0));
            y = 200;
        }
        region.height = y + 8;
        this.setScroll(region, region.offset);
    }

    private buildRow(stack: ExpeditionCardStack, kind: CardKind, x: number, y: number, w: number, bad: boolean) {
        const c = this.scene.add.container(x, y);
        const g = this.scene.add.graphics();
        const rc = this.rarityColor(stack.id);
        const draw = (hot: boolean) => {
            g.clear();
            drawPixelFrame(g, w, 44, { shadow: false, fill: bad ? C.blood : hot ? C.olive : C.ink, edge: C.void, border: bad ? C.cinnabar : hot ? C.lime : C.dusk, hi: C.haze, lo: C.void, stud: null });
            g.fillStyle(rc, 1).fillRect(8, 8, 6, 28);
        };
        draw(false);
        c.add(g);
        c.add(this.text(28, 22, KIND_GLYPH[kind], 24, KIND_COLOR[kind]).setOrigin(0, 0.5));
        const name = this.text(66, 22, this.nameOf(stack.id), 24, C.paper).setOrigin(0, 0.5);
        if (name.width > w - 66 - 130) name.setScale((w - 66 - 130) / name.width);
        c.add(name);
        c.add(this.text(w - 92, 22, `×${stack.count}`, 24, C.glow).setOrigin(1, 0.5));
        const btn = (bx: number, label: string, cb: () => void) => {
            const b = this.scene.add.graphics().setPosition(bx, 6);
            b.fillStyle(C.night, 1).fillRect(0, 0, 32, 32);
            b.lineStyle(2, C.haze, 1).strokeRect(1, 1, 30, 30);
            b.fillStyle(C.paper, 1).fillRect(8, 14, 16, 4);
            if (label === '+') b.fillRect(14, 8, 4, 16);
            c.add(b);
            const hit = this.scene.add.rectangle(bx + 16, 22, 32, 32, 0x000000, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
                if (!this.inside(this.listScroll.rect, p)) return;
                cb();
            });
            c.add(hit);
        };
        btn(w - 84, '-', () => this.removeCard(stack.id, 1, { x: this.collRect.x + this.collRect.w / 2, y: this.collRect.y + this.collRect.h / 2 }));
        btn(w - 44, '+', () => this.addCard(stack.id, { x: this.deckRect.x + w - 30, y: this.listScroll.rect.y + y - this.listScroll.offset + 22 }));
        const area = this.scene.add.rectangle(w / 2 - 50, 22, w - 110, 44, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        area.on('pointerover', () => { draw(true); this.setPreview(stack.id); });
        area.on('pointerout', () => draw(false));
        c.add(area);
        return c;
    }

    // ---------------------------------------------------------------------------------------
    // preview
    // ---------------------------------------------------------------------------------------
    private setPreview(id: string) {
        this.hoverCardId = id;
        if (this.portrait) return;
        if (this.lastPreviewId === id) return;
        this.lastPreviewId = id;
        this.renderPreview();
    }

    private renderPreview() {
        const box = this.previewBox;
        box.removeAll(true);
        const r = this.deckRect;
        const ph = 300;
        const px = r.x + 10, py = r.y + r.h - ph - 74 - 4;
        const g = this.scene.add.graphics().setPosition(px, py);
        drawPixelFrame(g, r.w - 20, ph, { shadow: false, fill: C.ink, edge: C.void, border: C.dusk, hi: C.haze, lo: C.void, stud: C.gold });
        box.add(g);
        const id = this.hoverCardId ?? this.deck?.cards[0]?.id ?? this.stash.cards[0]?.id;
        if (!id) { box.add(this.text(px + (r.w - 20) / 2, py + ph / 2, '悬停卡牌查看详情', 24, C.mist).setOrigin(0.5)); return; }
        const data = this.config.previewResolver(id);
        const meta = this.meta(id);
        if (data) {
            const sprite = CardSpriteFactory.createSprite(this.scene, data as never, px + 16 + 102, py + ph / 2, 0.92);
            if (sprite) {
                sprite.disableDragging(); sprite.disableInteractive(); sprite.setDisplayMode('hover');
                box.add(sprite);
                sprite.setAlpha(0); this.scene.tweens.add({ targets: sprite, alpha: 1, y: sprite.y, duration: 120 });
            }
        }
        const tx = px + 230, tw = r.w - 20 - 230 - 14;
        box.add(this.text(tx, py + 18, meta.name ?? id, 24, C.paper, { wordWrap: { width: tw }, stroke: hex(C.void), strokeThickness: 4 }));
        const kind = meta.kind;
        const tags = [kind ? KIND_LABEL[kind] : null, meta.gradeLabel, meta.rarity ? { common: '凡品', uncommon: '良品', rare: '珍品', epic: '极品', legendary: '传说' }[meta.rarity] : null, meta.race].filter(Boolean).join(' · ');
        box.add(this.text(tx, py + 58, tags, 12, kind ? KIND_COLOR[kind] : C.mist, { wordWrap: { width: tw } }));
        const stats: string[] = [];
        if (meta.attack !== undefined) stats.push(`攻 ${meta.attack}`);
        if (meta.health !== undefined) stats.push(`命 ${meta.health}`);
        if (meta.attackBonus) stats.push(`攻+${meta.attackBonus}`);
        if (meta.healthBonus) stats.push(`命+${meta.healthBonus}`);
        if (stats.length) box.add(this.text(tx, py + 82, stats.join('   '), 24, C.ember));
        const desc = meta.effectSummary ?? meta.description ?? '';
        box.add(this.text(tx, py + (stats.length ? 120 : 92), desc, 12, C.fog, { wordWrap: { width: tw, useAdvancedWrap: true }, lineSpacing: 6 }));
        const own = this.owned(id), used = this.inDeck(id);
        box.add(this.text(tx, py + ph - 30, `库存 ${own}   已带 ${used}   同名上限 ${meta.limitPerDeck ?? DEFAULT_LIMIT_PER_DECK}`, 12, C.celadon));
    }

    // ---------------------------------------------------------------------------------------
    // feedback
    // ---------------------------------------------------------------------------------------
    private button(x: number, y: number, w: number, h: number, label: string, s: PanelStyle, size: number, onClick: () => void) {
        const c = this.scene.add.container(x, y);
        const g = this.scene.add.graphics();
        const draw = (hot: boolean) => { g.clear(); drawPixelFrame(g, w, h, hot ? { ...s, border: C.gold, hi: C.glow, shadow: false } : { ...s, shadow: false }); };
        draw(false);
        const t = this.text(w / 2, h / 2, label, size, C.paper, { stroke: hex(C.void), strokeThickness: 4 }).setOrigin(0.5);
        if (t.width > w - 16) t.setScale((w - 16) / t.width);
        const hit = this.scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => draw(true));
        hit.on('pointerout', () => draw(false));
        hit.on('pointerdown', () => { this.scene.tweens.add({ targets: c, y: y + 3, duration: 60, yoyo: true }); onClick(); });
        c.add([g, t, hit]);
        return c;
    }

    private toast(msg: string, tone: 'ok' | 'warn') {
        const r = this.collRect;
        this.toastLayer.removeAll(true);
        const t = this.text(r.x + r.w / 2, r.y + r.h - 64, msg, 24, tone === 'ok' ? C.celadon : C.ember, { stroke: hex(C.void), strokeThickness: 6 }).setOrigin(0.5);
        const bg = this.scene.add.rectangle(t.x, t.y, t.width + 40, 44, C.void, 0.8).setStrokeStyle(2, tone === 'ok' ? C.jade : C.ember);
        this.toastLayer.add([bg, t]);
        this.toastLayer.setAlpha(0).setY(10);
        this.scene.tweens.killTweensOf(this.toastLayer);
        this.scene.tweens.add({
            targets: this.toastLayer, alpha: 1, y: 0, duration: 140, ease: 'Cubic.easeOut',
            onComplete: () => this.scene.tweens.add({ targets: this.toastLayer, alpha: 0, duration: 300, delay: 1600 }),
        });
    }

    private pulse(o: GameObjects.Container) {
        this.scene.tweens.add({ targets: o, alpha: { from: 0.4, to: 1 }, duration: 160 });
    }

    private popCount(direction: 1 | -1) {
        const t = this.countPopTarget;
        if (!t || !t.active) return;
        t.setScale(direction > 0 ? 1.5 : 0.75);
        this.scene.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }

    /** A small kind-coloured card token that flies between the collection and the deck list. */
    private flyToken(id: string, at: { x: number; y: number } | undefined, adding: boolean) {
        if (!at) return;
        const kind = this.kindOf(id);
        const color = kind ? KIND_COLOR[kind] : C.mist;
        const token = this.scene.add.container(at.x, at.y);
        token.add(this.scene.add.rectangle(0, 0, 40, 56, C.night).setStrokeStyle(4, color));
        token.add(this.text(0, 0, kind ? KIND_GLYPH[kind] : '牌', 24, color).setOrigin(0.5));
        this.add(token);
        token.setDepth(50);
        const dst = this.countPopTarget ? { x: this.countPopTarget.x - 30, y: this.countPopTarget.y } : { x: this.deckRect.x + 200, y: this.deckRect.y + 40 };
        const from = adding ? at : dst;
        const to = adding ? dst : at;
        token.setPosition(from.x, from.y);
        this.scene.tweens.add({
            targets: token, x: to.x, y: to.y, scale: adding ? 0.5 : 1.2, alpha: { from: 1, to: 0.15 },
            duration: 380, ease: 'Cubic.easeInOut', onComplete: () => token.destroy(),
        });
    }

    private playEntrance() {
        if (this.portrait) return;
        const slide = (layer: GameObjects.Container, dx: number, delay: number) => {
            layer.setAlpha(0).setX(dx);
            this.scene.tweens.add({ targets: layer, alpha: 1, x: 0, duration: 280, delay, ease: 'Cubic.easeOut' });
        };
        slide(this.railLayer, -40, 40);
        slide(this.collLayer, 0, 100);
        this.collLayer.y = 24; this.scene.tweens.add({ targets: this.collLayer, y: 0, duration: 300, delay: 100, ease: 'Cubic.easeOut' });
        slide(this.deckLayer, 40, 160);
    }

    // ---------------------------------------------------------------------------------------
    // refresh + input
    // ---------------------------------------------------------------------------------------
    private refreshAll() {
        this.refreshRail();
        this.refreshGrid();
        this.refreshDeckHeader();
        this.refreshList();
        if (!this.portrait) this.renderPreviewIfChanged();
    }

    private renderPreviewIfChanged() {
        // stats such as "已带 n" change on every edit, so always refresh, but keep the same card
        this.lastPreviewId = this.hoverCardId;
        this.renderPreview();
    }

    private bindInput() {
        const onWheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
            const step = Math.sign(dy) * 70;
            if (this.gridScroll.content.visible && this.inside(this.gridScroll.rect, p)) this.setScroll(this.gridScroll, this.gridScroll.offset + step);
            else if (this.listScroll.content.visible && this.inside(this.listScroll.rect, p)) this.setScroll(this.listScroll, this.listScroll.offset + step);
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
        [this.railScroll, this.gridScroll, this.listScroll].forEach(r => r?.mask?.destroy());
        this.tileCache.clear();
        this.scene.tweens.killTweensOf(this.toastLayer);
        this.scene.events.emit('clearCardPreviewContext', DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID);
        super.destroy(fromScene);
    }
}

export type { PreviewCardData };
