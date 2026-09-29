import { GameObjects, Scene } from 'phaser';

import type { CardKind } from '@data/types/cards/core';
import { C, FONT, hex } from '../../art/palette';
import { drawPixelFrame, PANEL_BLOOD, PANEL_GOLD, PANEL_INK, PANEL_JADE, type PanelStyle } from '../../art/ui';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import {
    createPreparationDeckCardPreview,
    createPreparationSelectedLoadoutSummary,
    formatPreparationValidationLines,
    type PreparationDeckContext,
    type PreparationDeckHandoffSummary,
} from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import {
    countDeckCards,
    DECK_CARD_MAX,
    DECK_CARD_MIN,
    getSelectedSavedDeck,
} from '../../state/PersistentStashDecks';
import type { PersistentStash } from '../../types/expedition';
import type { EntryPanelFrame, EntryPanelFrameProvider } from './EntryPanelFrame';
import {
    getAdjacentPreparationDeckId,
    getPreparationKeyboardShortcut,
} from './preparationPanelKeyboard';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    metadata?: CardMetadataMap;
    onConfirm: () => void;
    onDeckSelect: (deckId: string) => void;
    onOpenDeckManager?: () => void;
    onOpenInventory?: () => void;
    deckHandoffSummary?: PreparationDeckHandoffSummary | null;
}

export interface PreparationPanelDeckSwitchFeedback {
    before: PreparationDeckContext;
    after: PreparationDeckContext;
}

interface Rect { x: number; y: number; w: number; h: number }
interface RenderOptions { deckSwitchFeedback?: PreparationPanelDeckSwitchFeedback }

const KIND_ORDER: CardKind[] = ['unit', 'artifact', 'talisman', 'field', 'skill', 'pill'];
const KIND_LABEL: Record<CardKind, string> = { unit: '生物', artifact: '神器', talisman: '护符', field: '场地', skill: '技能', pill: '丹药' };
const KIND_GLYPH: Record<CardKind, string> = { unit: '灵', artifact: '器', talisman: '符', field: '阵', skill: '诀', pill: '丹' };
const KIND_COLOR: Record<CardKind, number> = {
    unit: C.celadon, artifact: C.gold, talisman: C.petal, field: C.sky, skill: C.orchid, pill: C.lime,
};

const ROSTER_CARD_H = 104;
const ROSTER_GAP = 10;

const style = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra,
});

/**
 * 出发前确认 — the pre-departure loadout screen.
 *
 *   ┌ decks ┐ ┌──────────── selected deck ────────────┐ ┌── pack ─────┐
 *   │ card  │ │ 出发前确认                             │ │ 灵石 · 道具 │
 *   │ card  │ │ name          16 / 20–40  ▓▓▓░░       │ │             │
 *   │ card  │ │ kind bars                              │ │ [ 出发 ]    │
 *   └───────┘ └────────────────────────────────────────┘ │ [ 管理 ]    │
 *                                                        └─────────────┘
 * One decision, one glance: can we leave, and if not, what stands in the way.
 */
export class PreparationPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly metadata?: CardMetadataMap;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private readonly onOpenInventory?: () => void;
    private deckHandoffSummary?: PreparationDeckHandoffSummary | null;
    private readonly portrait: boolean;
    private readonly frameRect: Rect;
    private readonly panelFrame: EntryPanelFrame;

    private rosterScroll = 0;
    private rosterMaxScroll = 0;
    private rosterRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
    private rosterContent?: GameObjects.Container;
    private rosterMask?: GameObjects.Graphics;
    private countText?: GameObjects.Text;
    private keydownHandler?: (event: KeyboardEvent) => void;
    private wheelHandler?: (pointer: Phaser.Input.Pointer, objs: unknown[], dx: number, dy: number) => void;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.metadata = config.metadata;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;
        this.onOpenInventory = config.onOpenInventory;
        this.deckHandoffSummary = config.deckHandoffSummary;
        this.portrait = isPortraitGameViewport(scene.scale.width, scene.scale.height);

        const { width: W, height: H } = scene.scale;
        this.frameRect = this.portrait
            ? { x: 8, y: 56, w: W - 16, h: H - 64 }
            : { x: 24, y: 76, w: W - 48, h: H - 100 };
        this.panelFrame = {
            panelX: this.frameRect.x + this.frameRect.w / 2,
            panelY: this.frameRect.y + this.frameRect.h / 2,
            panelWidth: this.frameRect.w,
            panelHeight: this.frameRect.h,
        };

        this.render();

        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);
        this.wheelHandler = (pointer, _objs, _dx, dy) => {
            if (!this.visible || this.rosterMaxScroll <= 0) return;
            const r = this.rosterRect;
            if (pointer.x < r.x || pointer.x > r.x + r.w || pointer.y < r.y || pointer.y > r.y + r.h) return;
            this.setRosterScroll(this.rosterScroll + dy * 0.6);
        };
        scene.input.on('wheel', this.wheelHandler);
        this.once(Phaser.GameObjects.Events.DESTROY, () => this.teardown());
        scene.add.existing(this);
    }

    updateStash(stash: PersistentStash, deckSwitchFeedback?: PreparationPanelDeckSwitchFeedback): void {
        this.stash = stash;
        this.deckHandoffSummary = null;
        this.render({ deckSwitchFeedback });
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    // ---------------------------------------------------------------------------------------
    // drawing helpers
    // ---------------------------------------------------------------------------------------
    private text(x: number, y: number, s: string, size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
        return this.scene.add.text(x, y, s, style(size, color, extra));
    }

    private frame(rect: Rect, s: PanelStyle) {
        const g = this.scene.add.graphics().setPosition(rect.x, rect.y);
        drawPixelFrame(g, rect.w, rect.h, { shadow: false, ...s });
        return g;
    }

    private fit(t: GameObjects.Text, maxW: number) {
        if (t.width > maxW) t.setScale(maxW / t.width);
        return t;
    }

    private meter(x: number, y: number, w: number, h: number, count: number, color: number) {
        const g = this.scene.add.graphics().setPosition(x, y);
        g.fillStyle(C.void, 1).fillRect(0, 0, w, h);
        g.fillStyle(C.ink, 1).fillRect(3, 3, w - 6, h - 6);
        const fill = Math.round(((w - 6) * Math.min(1, count / DECK_CARD_MAX)) / 4) * 4;
        g.fillStyle(color, 1).fillRect(3, 3, fill, h - 6);
        g.fillStyle(C.paper, 0.3).fillRect(3, 3, fill, 3);
        const minX = 3 + Math.round(((w - 6) * DECK_CARD_MIN) / DECK_CARD_MAX);
        g.fillStyle(C.glow, 1).fillRect(minX - 2, -4, 4, h + 8);
        g.fillStyle(C.void, 0.4);
        for (let i = 5; i < DECK_CARD_MAX; i += 5) g.fillRect(3 + Math.round(((w - 6) * i) / DECK_CARD_MAX), 3, 2, h - 6);
        return { g, minX };
    }

    private button(
        parent: GameObjects.Container,
        rect: Rect,
        label: string,
        opts: { style: PanelStyle; enabled: boolean; size?: number; sub?: string; onClick: () => void },
    ) {
        const c = this.scene.add.container(rect.x, rect.y);
        const g = this.scene.add.graphics();
        const base = opts.style;
        const draw = (hot: boolean) => {
            g.clear();
            if (!opts.enabled) {
                drawPixelFrame(g, rect.w, rect.h, { shadow: false, fill: C.ink, edge: C.void, border: C.dusk, hi: C.twilight, lo: C.void, stud: null });
            } else {
                drawPixelFrame(g, rect.w, rect.h, hot ? { ...base, fill: base.border, shadow: false } : { ...base, shadow: false });
            }
        };
        draw(false);
        c.add(g);
        const size = opts.size ?? 24;
        const t = this.text(rect.w / 2, opts.sub ? rect.h / 2 - 10 : rect.h / 2, label, size, opts.enabled ? C.paper : C.mist, { stroke: hex(C.void), strokeThickness: 3 }).setOrigin(0.5);
        this.fit(t, rect.w - 24);
        c.add(t);
        if (opts.sub) c.add(this.text(rect.w / 2, rect.h / 2 + 22, opts.sub, 12, opts.enabled ? C.glow : C.haze).setOrigin(0.5));
        if (opts.enabled) {
            const hit = this.scene.add.rectangle(rect.w / 2, rect.h / 2, rect.w, rect.h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerover', () => draw(true));
            hit.on('pointerout', () => draw(false));
            hit.on('pointerdown', opts.onClick);
            c.add(hit);
        }
        parent.add(c);
        return c;
    }

    // ---------------------------------------------------------------------------------------
    // render
    // ---------------------------------------------------------------------------------------
    private render(options: RenderOptions = {}): void {
        this.removeAll(true);
        this.rosterMask?.destroy();
        this.rosterMask = undefined;
        this.rosterContent = undefined;
        this.countText = undefined;

        const fr = this.frameRect;
        const validation = validateExpeditionLoadout(this.stash);
        const summary = createPreparationSelectedLoadoutSummary(this.stash, this.metadata);
        const ok = validation.valid;
        const deck = getSelectedSavedDeck(this.stash);
        const count = deck ? countDeckCards(deck.cards) : 0;
        const tone = ok ? C.celadon : count > DECK_CARD_MAX ? C.cinnabar : C.gold;

        this.add(this.frame(fr, { ...PANEL_INK, fill: C.ink, border: C.dusk, hi: C.haze, lo: C.void }));

        const pad = 16, gap = 14;
        const inner: Rect = { x: fr.x + pad, y: fr.y + pad, w: fr.w - pad * 2, h: fr.h - pad * 2 };

        if (this.portrait) {
            this.renderPortrait(inner, summary, validation, ok, count, tone, deck?.cards ?? [], options);
            return;
        }

        const rosterW = 340, packW = 440;
        const roster: Rect = { x: inner.x, y: inner.y, w: rosterW, h: inner.h };
        const pack: Rect = { x: inner.x + inner.w - packW, y: inner.y, w: packW, h: inner.h };
        const main: Rect = { x: roster.x + rosterW + gap, y: inner.y, w: pack.x - gap - (roster.x + rosterW + gap), h: inner.h };

        this.renderRoster(roster);
        this.renderMain(main, summary, validation, ok, count, tone, deck?.cards ?? [], options);
        this.renderPack(pack, summary, ok);
    }

    private renderRoster(rect: Rect) {
        this.add(this.frame(rect, { ...PANEL_INK, fill: C.night }));
        this.add(this.text(rect.x + 20, rect.y + 16, '候 选 卡 组', 24, C.glow));
        const decks = this.stash.savedDecks;
        const readyCount = decks.filter(d => createPreparationDeckCardPreview(d, this.stash.cards, this.metadata).readiness === 'ready').length;
        this.add(this.text(rect.x + 20, rect.y + 52, `${decks.length} 套 · ${readyCount} 套可带入`, 12, C.fog));

        const view: Rect = { x: rect.x + 10, y: rect.y + 84, w: rect.w - 20, h: rect.h - 84 - 56 };
        this.rosterRect = view;
        const content = this.scene.add.container(view.x, view.y);
        this.rosterContent = content;
        this.add(content);

        const maskG = this.scene.make.graphics({}, false);
        maskG.fillStyle(0xffffff).fillRect(view.x, view.y, view.w, view.h);
        content.setMask(maskG.createGeometryMask());
        this.rosterMask = maskG;

        const selectedId = this.stash.selectedDeckId;
        decks.forEach((d, i) => {
            const y = i * (ROSTER_CARD_H + ROSTER_GAP);
            const sel = d.id === selectedId;
            const preview = createPreparationDeckCardPreview(d, this.stash.cards, this.metadata);
            const good = preview.readiness === 'ready';
            const n = preview.deckCount;
            const w = view.w - 8;
            const c = this.scene.add.container(0, y);
            const g = this.scene.add.graphics();
            const draw = (hot: boolean) => {
                g.clear();
                drawPixelFrame(g, w, ROSTER_CARD_H, {
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
            c.add(this.fit(this.text(18, 14, d.name, 24, sel ? C.paper : C.fog, { stroke: hex(C.void), strokeThickness: 3 }), w - 36));
            const col = good ? C.celadon : n > DECK_CARD_MAX ? C.cinnabar : C.gold;
            c.add(this.text(18, 54, `${n} 张 · ${preview.uniqueCardCount} 种`, 12, col));
            c.add(this.text(w - 16, 54, preview.readinessLabel, 12, good ? C.celadon : C.ember).setOrigin(1, 0));
            const m = this.meter(18, 80, w - 36, 12, n, col);
            c.add(m.g);
            if (sel) c.add(this.text(w - 16, 14, '当前带入', 12, C.glow).setOrigin(1, 0));
            c.setSize(w, ROSTER_CARD_H).setInteractive(new Phaser.Geom.Rectangle(w / 2, ROSTER_CARD_H / 2, w, ROSTER_CARD_H), Phaser.Geom.Rectangle.Contains);
            if (c.input) c.input.cursor = 'pointer';
            c.on('pointerover', () => draw(true));
            c.on('pointerout', () => draw(false));
            c.on('pointerup', (p: Phaser.Input.Pointer) => {
                if (p.y < view.y || p.y > view.y + view.h) return;
                if (d.id !== this.stash.selectedDeckId) this.onDeckSelect(d.id);
            });
            content.add(c);
        });

        const total = decks.length * (ROSTER_CARD_H + ROSTER_GAP) - ROSTER_GAP;
        this.rosterMaxScroll = Math.max(0, total - view.h);
        this.rosterScroll = Math.min(this.rosterScroll, this.rosterMaxScroll);
        content.y = view.y - this.rosterScroll;

        this.add(this.text(rect.x + 20, rect.y + rect.h - 40, '← → 选择卡组', 12, C.haze));
        if (this.rosterMaxScroll > 0) this.add(this.text(rect.x + rect.w - 20, rect.y + rect.h - 40, '滚轮浏览', 12, C.haze).setOrigin(1, 0));
    }

    private setRosterScroll(v: number) {
        this.rosterScroll = Math.max(0, Math.min(this.rosterMaxScroll, v));
        if (this.rosterContent) this.rosterContent.y = this.rosterRect.y - this.rosterScroll;
    }

    private kindCounts(cards: readonly { id: string; count: number }[]) {
        const map = new Map<CardKind, number>();
        let unknown = 0;
        for (const s of cards) {
            const k = this.metadata?.[s.id]?.kind;
            if (!k) { unknown += s.count; continue; }
            map.set(k, (map.get(k) ?? 0) + s.count);
        }
        return { map, unknown };
    }

    private renderMain(
        rect: Rect,
        summary: ReturnType<typeof createPreparationSelectedLoadoutSummary>,
        validation: ReturnType<typeof validateExpeditionLoadout>,
        ok: boolean,
        count: number,
        tone: number,
        cards: readonly { id: string; count: number }[],
        options: RenderOptions,
    ) {
        this.add(this.frame(rect, { ...PANEL_INK, fill: C.night }));
        const x = rect.x + 28;
        const w = rect.w - 56;
        let y = rect.y + 22;

        this.add(this.text(x, y, '出发前确认', 36, C.paper, { stroke: hex(C.void), strokeThickness: 5 }));
        this.add(this.text(x, y + 52, '能出发就确认；不能就管理卡组。', 12, C.fog));

        const seal: Rect = { x: rect.x + rect.w - 28 - 168, y: y + 4, w: 168, h: 48 };
        this.add(this.frame(seal, ok ? PANEL_JADE : PANEL_BLOOD));
        this.add(this.text(seal.x + seal.w / 2, seal.y + seal.h / 2, ok ? '可以出发' : summary.focusChip.value, 24, C.paper).setOrigin(0.5));
        y += 92;

        const handoff = this.deckHandoffSummary;
        if (handoff) {
            const hc = handoff.tone === 'positive' ? PANEL_JADE : handoff.tone === 'warning' ? PANEL_BLOOD : PANEL_GOLD;
            this.add(this.frame({ x, y, w, h: 72 }, hc));
            this.add(this.text(x + 18, y + 12, handoff.title, 24, C.paper));
            this.add(this.fit(this.text(x + 18, y + 46, handoff.detail, 12, C.fog), w - 36));
            y += 88;
        }

        // hero: current deck
        const hero: Rect = { x, y, w, h: 236 };
        this.add(this.frame(hero, { ...PANEL_INK, fill: C.ink, border: ok ? C.olive : C.dusk }));
        this.add(this.text(hero.x + 22, hero.y + 16, '当前带入', 12, C.glow));
        this.add(this.fit(this.text(hero.x + 22, hero.y + 40, summary.selectedDeckName, 36, C.paper, { stroke: hex(C.void), strokeThickness: 5 }), w - 300));
        this.countText = this.text(hero.x + hero.w - 112, hero.y + 58, `${count}`, 48, tone, { stroke: hex(C.void), strokeThickness: 6 }).setOrigin(1, 0.5);
        this.add(this.countText);
        this.add(this.text(hero.x + hero.w - 104, hero.y + 72, `/ ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, 12, C.mist).setOrigin(0, 0.5));
        const mw = hero.w - 44;
        const m = this.meter(hero.x + 22, hero.y + 112, mw, 24, count, tone);
        this.add(m.g);
        this.add(this.text(hero.x + 22 + m.minX, hero.y + 112 + 24 + 8, `${DECK_CARD_MIN}`, 12, C.glow).setOrigin(0.5, 0));
        this.add(this.text(hero.x + 22, hero.y + 176, summary.headline, 24, ok ? C.celadon : C.gold));
        this.add(this.fit(this.text(hero.x + 22, hero.y + 208, `${summary.detail}  ${summary.uniqueCardCount} 种卡`, 12, C.fog), mw));

        if (options.deckSwitchFeedback && this.countText) {
            const t = this.countText;
            t.setScale(1.5);
            this.scene.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.Out' });
            const flash = this.scene.add.rectangle(hero.x + hero.w / 2, hero.y + hero.h / 2, hero.w, hero.h, C.glow, 0.22);
            this.add(flash);
            this.scene.tweens.add({ targets: flash, alpha: 0, duration: 420, onComplete: () => flash.destroy() });
        }
        y += hero.h + 14;

        // blocker / ok box
        const boxH = ok ? 64 : 34 + Math.max(1, formatPreparationValidationLines(validation, this.metadata).length) * 28 + 20;
        const box: Rect = { x, y, w, h: Math.min(boxH, 150) };
        this.add(this.frame(box, ok ? PANEL_JADE : PANEL_BLOOD));
        if (ok) {
            this.add(this.text(box.x + 22, box.y + box.h / 2, '卡组符合要求，可以带入秘境。', 24, C.paper).setOrigin(0, 0.5));
        } else {
            this.add(this.text(box.x + 22, box.y + 12, '当前阻塞', 12, C.petal));
            formatPreparationValidationLines(validation, this.metadata).slice(0, 3).forEach((line, i) => {
                this.add(this.fit(this.text(box.x + 22, box.y + 34 + i * 28, `· ${line}`, 24, C.paper), box.w - 44));
            });
        }
        y += box.h + 14;

        // composition
        const compH = rect.y + rect.h - 22 - y;
        if (compH > 120) {
            const comp: Rect = { x, y, w, h: compH };
            this.add(this.frame(comp, { ...PANEL_INK, fill: C.ink }));
            this.add(this.text(comp.x + 22, comp.y + 14, '卡组总览', 12, C.glow));
            const { map, unknown } = this.kindCounts(cards);
            const rows = KIND_ORDER.filter(k => map.has(k));
            const rowH = Math.min(40, Math.floor((comp.h - 48) / Math.max(1, rows.length + (unknown ? 1 : 0))));
            const barX = comp.x + 190, barW = comp.w - 190 - 90;
            const maxN = Math.max(1, ...rows.map(k => map.get(k) ?? 0), unknown);
            rows.forEach((k, i) => {
                const ry = comp.y + 42 + i * rowH;
                const n = map.get(k) ?? 0;
                this.add(this.text(comp.x + 22, ry + rowH / 2, KIND_GLYPH[k], 24, KIND_COLOR[k]).setOrigin(0, 0.5));
                this.add(this.text(comp.x + 62, ry + rowH / 2, KIND_LABEL[k], 24, C.paper).setOrigin(0, 0.5));
                const g = this.scene.add.graphics();
                g.fillStyle(C.void, 1).fillRect(barX, ry + rowH / 2 - 8, barW, 16);
                g.fillStyle(KIND_COLOR[k], 1).fillRect(barX + 2, ry + rowH / 2 - 6, Math.max(4, Math.round(((barW - 4) * n) / maxN / 4) * 4), 12);
                this.add(g);
                this.add(this.text(comp.x + comp.w - 22, ry + rowH / 2, `${n}`, 24, C.glow).setOrigin(1, 0.5));
            });
            const listTop = comp.y + 42 + (rows.length + (unknown ? 1 : 0)) * rowH + 18;
            if (rows.length > 0 && comp.y + comp.h - listTop > 80) {
                const dv = this.scene.add.graphics();
                dv.fillStyle(C.dusk, 1).fillRect(comp.x + 22, listTop - 10, comp.w - 44, 2);
                this.add(dv);
                this.add(this.text(comp.x + 22, listTop + 4, '带入清单', 12, C.glow));
                const colW = Math.floor((comp.w - 44) / 3);
                const perCol = Math.max(1, Math.floor((comp.y + comp.h - listTop - 40) / 28));
                summary.deckPreviewLines.slice(0, perCol * 3).forEach((line, i) => {
                    const cx = comp.x + 22 + Math.floor(i / perCol) * colW;
                    const cy = listTop + 34 + (i % perCol) * 28;
                    this.add(this.fit(this.text(cx, cy, line, 12, C.fog), colW - 16));
                });
            }
            if (rows.length === 0) {
                this.add(this.fit(this.text(comp.x + 22, comp.y + 48, summary.compositionLine, 12, C.fog), comp.w - 44));
            }
        }
    }

    private renderPack(rect: Rect, summary: ReturnType<typeof createPreparationSelectedLoadoutSummary>, ok: boolean) {
        this.add(this.frame(rect, { ...PANEL_INK, fill: C.night }));
        const x = rect.x + 24, w = rect.w - 48;
        this.add(this.text(x, rect.y + 20, '行 囊', 24, C.glow));

        // spirit stones
        const stones: Rect = { x, y: rect.y + 62, w, h: 88 };
        this.add(this.frame(stones, PANEL_GOLD));
        this.add(this.text(stones.x + 20, stones.y + 14, '灵石', 12, C.glow));
        this.add(this.text(stones.x + stones.w - 20, stones.y + stones.h / 2 + 8, `${summary.spiritStones}`, 48, C.glow, { stroke: hex(C.void), strokeThickness: 6 }).setOrigin(1, 0.5));

        // items
        const itemsTop = stones.y + stones.h + 14;
        const itemsH = 56 + Math.min(7, summary.itemPreviewLines.length) * 28 + (this.onOpenInventory ? 72 : 24);
        const items: Rect = { x, y: itemsTop, w, h: itemsH };
        this.add(this.frame(items, { ...PANEL_INK, fill: C.ink }));
        this.add(this.text(items.x + 20, items.y + 14, `物资：${summary.itemCount} 件道具`, 24, C.paper));
        const lines = summary.itemPreviewLines.slice(0, 7);
        lines.forEach((line, i) => {
            this.add(this.fit(this.text(items.x + 20, items.y + 56 + i * 28, line === '无' ? '暂无道具' : `· ${line}`, 12, C.fog), items.w - 40));
        });
        if (summary.itemPreviewLines.length > 7) {
            this.add(this.text(items.x + 20, items.y + 56 + 7 * 28, `…另有 ${summary.itemPreviewLines.length - 7} 项`, 12, C.haze));
        }
        if (this.onOpenInventory) {
            this.button(this, { x: items.x + 16, y: items.y + items.h - 56, w: items.w - 32, h: 40 }, '整理道具', {
                style: PANEL_INK, enabled: true, size: 24, onClick: () => this.onOpenInventory?.(),
            });
        }

        // actions
        const bottom = rect.y + rect.h - 24;
        this.add(this.text(rect.x + rect.w / 2, bottom - 4, '快捷键：Enter 主操作 · M 管理卡组', 12, C.haze).setOrigin(0.5, 1));
        const manageH = 64, goH = 104;
        const manageY = bottom - 30 - manageH;
        const goY = manageY - 16 - goH;
        this.button(this, { x, y: goY, w, h: goH }, ok ? '确认带入并出发' : '暂不可确认带入', {
            style: PANEL_BLOOD, enabled: ok, size: 36, sub: ok ? '现在可以直接确认带入并进入秘境。' : summary.focusSummaryLine, onClick: () => this.confirmLoadout(),
        });
        this.button(this, { x, y: manageY, w, h: manageH }, ok ? '管理卡组' : '去管理卡组补足', {
            style: ok ? PANEL_INK : PANEL_GOLD, enabled: !!this.onOpenDeckManager, size: 24, onClick: () => this.openDeckManager(),
        });
    }

    private renderPortrait(
        inner: Rect,
        summary: ReturnType<typeof createPreparationSelectedLoadoutSummary>,
        validation: ReturnType<typeof validateExpeditionLoadout>,
        ok: boolean,
        count: number,
        tone: number,
        cards: readonly { id: string; count: number }[],
        options: RenderOptions,
    ) {
        const x = inner.x + 8, w = inner.w - 16;
        let y = inner.y + 8;
        this.add(this.text(x, y, '出发前确认', 36, C.paper, { stroke: hex(C.void), strokeThickness: 5 }));
        this.add(this.text(x, y + 50, '能出发就确认；不能就管理卡组。', 12, C.fog));
        y += 84;

        // deck switcher
        const decks = this.stash.savedDecks;
        const idx = Math.max(0, decks.findIndex(d => d.id === this.stash.selectedDeckId));
        const sw: Rect = { x, y, w, h: 64 };
        this.add(this.frame(sw, { ...PANEL_INK, fill: C.ink }));
        const arrow = (ax: number, label: string, dir: -1 | 1, on: boolean) => {
            this.button(this, { x: ax, y: sw.y + 8, w: 48, h: 48 }, label, { style: PANEL_INK, enabled: on, size: 24, onClick: () => this.selectAdjacentDeck(dir) });
        };
        arrow(sw.x + 8, '<', -1, idx > 0);
        arrow(sw.x + sw.w - 56, '>', 1, idx < decks.length - 1);
        this.add(this.fit(this.text(sw.x + sw.w / 2, sw.y + 22, summary.selectedDeckName, 24, C.paper), sw.w - 140).setOrigin(0.5));
        this.add(this.text(sw.x + sw.w / 2, sw.y + 46, `第 ${idx + 1} / ${decks.length} 套`, 12, C.fog).setOrigin(0.5));
        y += sw.h + 12;

        // count + meter
        this.countText = this.text(x + 4, y, `${count}`, 48, tone, { stroke: hex(C.void), strokeThickness: 6 });
        this.add(this.countText);
        this.add(this.text(x + 4 + this.countText.width + 10, y + 32, `/ ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, 12, C.mist));
        this.add(this.text(x + w, y + 10, ok ? '可以出发' : summary.focusChip.value, 24, ok ? C.celadon : C.ember).setOrigin(1, 0));
        y += 64;
        this.add(this.meter(x, y, w, 20, count, tone).g);
        y += 44;
        if (options.deckSwitchFeedback && this.countText) {
            this.countText.setScale(1.4);
            this.scene.tweens.add({ targets: this.countText, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.Out' });
        }

        // status box
        const lines = ok ? ['卡组符合要求，可以带入秘境。'] : formatPreparationValidationLines(validation, this.metadata).slice(0, 2);
        const box: Rect = { x, y, w, h: 24 + lines.length * 52 };
        this.add(this.frame(box, ok ? PANEL_JADE : PANEL_BLOOD));
        lines.forEach((line, i) => {
            this.add(this.text(box.x + 16, box.y + 14 + i * 52, line, 12, C.paper, { wordWrap: { width: box.w - 32 } }));
        });
        y += box.h + 14;

        // kinds (compact, two per row)
        const { map } = this.kindCounts(cards);
        KIND_ORDER.filter(k => map.has(k)).forEach((k, i) => {
            const cx = x + (i % 2) * (w / 2), cy = y + Math.floor(i / 2) * 36;
            this.add(this.text(cx + 8, cy, `${KIND_GLYPH[k]} ${KIND_LABEL[k]}`, 24, KIND_COLOR[k]));
            this.add(this.text(cx + w / 2 - 20, cy, `${map.get(k)}`, 24, C.glow).setOrigin(1, 0));
        });
        y += Math.ceil(KIND_ORDER.filter(k => map.has(k)).length / 2) * 36 + 12;

        this.add(this.text(x + 4, y, `物资：${summary.itemCount} 件道具 · 灵石 ${summary.spiritStones}`, 12, C.fog));

        // actions
        const bottom = inner.y + inner.h - 8;
        const manageY = bottom - 56;
        const goY = manageY - 12 - 88;
        this.button(this, { x, y: goY, w, h: 88 }, ok ? '确认带入并出发' : '暂不可确认带入', {
            style: PANEL_BLOOD, enabled: ok, size: 36, onClick: () => this.confirmLoadout(),
        });
        this.button(this, { x, y: manageY, w: this.onOpenInventory ? w * 0.62 : w, h: 56 }, ok ? '管理卡组' : '去管理卡组补足', {
            style: ok ? PANEL_INK : PANEL_GOLD, enabled: !!this.onOpenDeckManager, size: 24, onClick: () => this.openDeckManager(),
        });
        if (this.onOpenInventory) {
            this.button(this, { x: x + w * 0.62 + 10, y: manageY, w: w * 0.38 - 10, h: 56 }, '道具', {
                style: PANEL_INK, enabled: true, size: 24, onClick: () => this.onOpenInventory?.(),
            });
        }
    }

    // ---------------------------------------------------------------------------------------
    // input
    // ---------------------------------------------------------------------------------------
    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.visible) return;
        const shortcut = getPreparationKeyboardShortcut(event);
        if (!shortcut) return;
        if (event.repeat && shortcut !== 'previous-deck' && shortcut !== 'next-deck') return;
        event.preventDefault();

        switch (shortcut) {
            case 'previous-deck': this.selectAdjacentDeck(-1); return;
            case 'next-deck': this.selectAdjacentDeck(1); return;
            case 'primary-action': this.triggerPrimaryAction(); return;
            case 'manage': this.openDeckManager(); return;
            default: return;
        }
    }

    private teardown(): void {
        this.rosterMask?.destroy();
        this.rosterMask = undefined;
        if (this.keydownHandler) {
            this.scene.input.keyboard?.off('keydown', this.keydownHandler);
            this.keydownHandler = undefined;
        }
        if (this.wheelHandler) {
            this.scene.input.off('wheel', this.wheelHandler);
            this.wheelHandler = undefined;
        }
    }

    private selectAdjacentDeck(direction: -1 | 1): void {
        const nextDeckId = getAdjacentPreparationDeckId(this.stash.savedDecks, this.stash.selectedDeckId, direction);
        if (!nextDeckId || nextDeckId === this.stash.selectedDeckId) return;
        this.onDeckSelect(nextDeckId);
    }

    private canConfirmLoadout(): boolean {
        return validateExpeditionLoadout(this.stash).valid;
    }

    private triggerPrimaryAction(): void {
        if (this.canConfirmLoadout()) {
            this.confirmLoadout();
            return;
        }
        this.openDeckManager();
    }

    private confirmLoadout(): void {
        if (!this.canConfirmLoadout()) return;
        this.onConfirm();
    }

    private openDeckManager(): void {
        this.onOpenDeckManager?.();
    }
}
