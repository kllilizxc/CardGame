import { GameObjects, Scene } from 'phaser';

import { INK, PX, hex } from '../../art/palette';
import { bake, snap } from '../../art/pix';
import { paintCardBack } from '../../art/cardArt';
import { pbutton, pchip, piconButton, pnum, ptext, ptoast, clip, type PButton } from '../../art/kit';
import { pxBurst } from '../../art/fx';
import {
    createPreparationSelectedLoadoutSummary,
    formatPreparationValidationLines,
    type PreparationDeckContext,
    type PreparationDeckHandoffSummary,
} from '../../scenes/expedition/entryFlowModel';
import { validateExpeditionLoadout } from '../../scenes/expedition/expeditionEntryFlow';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import { DECK_CARD_MAX, DECK_CARD_MIN } from '../../state/PersistentStashDecks';
import type { PersistentStash } from '../../types/expedition';
import type { EntryPanelFrame, EntryPanelFrameProvider } from './EntryPanelFrame';
import { getAdjacentPreparationDeckId, getPreparationKeyboardShortcut } from './preparationPanelKeyboard';

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

/**
 * 出发前确认 — one glance, one decision.
 *
 * The chosen deck sits in the middle as a fanned stack of card backs with its name and size;
 * a single line says whether it can go. Three buttons: 管理卡组, 行囊, and the big 出发 seal.
 * Keys: ← → switch deck · Enter 出发 · M 管理卡组.
 */
export class PreparationPanel extends GameObjects.Container implements EntryPanelFrameProvider {
    private stash: PersistentStash;
    private readonly metadata?: CardMetadataMap;
    private readonly onConfirm: () => void;
    private readonly onDeckSelect: (deckId: string) => void;
    private readonly onOpenDeckManager?: () => void;
    private readonly onOpenInventory?: () => void;
    private readonly panelFrame: EntryPanelFrame;
    private keydownHandler?: (event: KeyboardEvent) => void;
    private go?: PButton;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);
        this.stash = config.stash;
        this.metadata = config.metadata;
        this.onConfirm = config.onConfirm;
        this.onDeckSelect = config.onDeckSelect;
        this.onOpenDeckManager = config.onOpenDeckManager;
        this.onOpenInventory = config.onOpenInventory;
        const { width: W, height: H } = scene.scale;
        this.panelFrame = { panelX: W / 2, panelY: H / 2, panelWidth: W, panelHeight: H };
        this.setDepth(100);
        this.render();
        if (config.deckHandoffSummary && config.deckHandoffSummary.tone !== 'neutral') {
            scene.time.delayedCall(300, () => ptoast(scene, `${config.deckHandoffSummary!.title}`, config.deckHandoffSummary!.tone === 'warning' ? INK.amber : INK.spirit));
        }
        this.keydownHandler = this.handleKeyDown.bind(this);
        scene.input.keyboard?.on('keydown', this.keydownHandler);
        this.once(Phaser.GameObjects.Events.DESTROY, () => {
            if (this.keydownHandler) scene.input.keyboard?.off('keydown', this.keydownHandler);
        });
        scene.add.existing(this);
    }

    updateStash(stash: PersistentStash, _deckSwitchFeedback?: PreparationPanelDeckSwitchFeedback): void {
        this.stash = stash;
        this.render();
    }

    public getEntryPanelFrame(): EntryPanelFrame | null {
        return this.panelFrame;
    }

    private canConfirm(): boolean {
        return validateExpeditionLoadout(this.stash).valid;
    }

    private render(): void {
        this.removeAll(true);
        const scene = this.scene;
        const { width: W, height: H } = scene.scale;
        const validation = validateExpeditionLoadout(this.stash);
        const ok = validation.valid;
        const summary = createPreparationSelectedLoadoutSummary(this.stash, this.metadata);
        const cx = snap(W * 0.42);
        const cy = snap(H * 0.46);

        // --- the deck: a fanned stack of card backs
        const back = bake(scene, 'px:cardback', () => paintCardBack());
        const shown = Math.max(1, Math.min(7, Math.ceil(summary.deckCount / 4)));
        for (let i = 0; i < shown; i++) {
            const t = shown === 1 ? 0 : i / (shown - 1) - 0.5;
            const card = scene.add.image(snap(cx + t * PX * 60), snap(cy + Math.abs(t) * PX * 10), back)
                .setScale(PX).setAngle(t * 24).setOrigin(0.5, 0.8).setAlpha(summary.deckCount === 0 ? 0.3 : 1);
            this.add(card);
            scene.tweens.add({ targets: card, y: card.y - PX * 2, duration: 1100 + i * 90, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        }

        // name + count
        const nameY = cy + PX * 58;
        this.add(ptext(scene, cx, nameY, clip(summary.selectedDeckName, 10), { size: 2, color: INK.paper, fx: 'outline', origin: [0.5, 0.5] }));
        const count = pnum(scene, 0, 0, `${summary.deckCount}`, ok ? INK.paper : INK.vermilion, 2);
        const range = ptext(scene, 0, 0, ` / ${DECK_CARD_MIN}-${DECK_CARD_MAX} 张`, { color: INK.mist, fx: 'outline', origin: [0, 0.5] });
        const rowW = count.width + range.width;
        count.setPosition(snap(cx - rowW / 2), snap(nameY + PX * 24 - count.height / 2));
        range.setPosition(snap(cx - rowW / 2 + count.width), snap(nameY + PX * 24));
        this.add([count, range]);
        const status = ok ? '卡组符合要求，可以带入秘境。' : formatPreparationValidationLines(validation, this.metadata)[0] ?? '';
        this.add(ptext(scene, cx, nameY + PX * 44, `${ok ? '✓' : '✗'} ${clip(status, 26)}`, { color: ok ? INK.spirit : INK.vermilion, fx: 'outline', origin: [0.5, 0.5] }));

        // deck switcher
        const decks = this.stash.savedDecks;
        if (decks.length > 1) {
            const idx = Math.max(0, decks.findIndex((d) => d.id === this.stash.selectedDeckId));
            const left = piconButton(scene, cx - PX * 110, cy - PX * 10, 'back', () => this.switchDeck(-1), 'slate');
            const right = piconButton(scene, cx + PX * 110, cy - PX * 10, 'back', () => this.switchDeck(1), 'slate');
            (right.list[1] as Phaser.GameObjects.Container).list.forEach((o) => (o as Phaser.GameObjects.Image).setFlipX?.(true));
            this.add([left, right]);
            this.add(ptext(scene, cx, cy - PX * 104, `${idx + 1} / ${decks.length}`, { color: INK.mist, fx: 'outline', origin: [0.5, 0.5] }));
        }

        // --- right column: pouch + actions
        const rx = snap(W * 0.78);
        this.add(pchip(scene, rx - PX * 50, snap(H * 0.3), 'stone', `灵石 ${summary.spiritStones}`, INK.spirit));
        this.add(pchip(scene, rx - PX * 50, snap(H * 0.3) + PX * 18, 'bag', `物资：${summary.itemCount} 件道具`, INK.bone));

        const bw = PX * 100;
        if (this.onOpenDeckManager) {
            this.add(pbutton(scene, { x: rx, y: snap(H * 0.48), width: bw, height: PX * 22, label: '管理卡组', icon: 'deck', style: 'slate', onClick: () => this.onOpenDeckManager?.() }));
        }
        if (this.onOpenInventory) {
            this.add(pbutton(scene, { x: rx, y: snap(H * 0.48) + PX * 28, width: bw, height: PX * 22, label: '行 囊', icon: 'bag', style: 'slate', onClick: () => this.onOpenInventory?.() }));
        }
        this.go = pbutton(scene, {
            x: rx, y: snap(H * 0.72), width: bw, height: PX * 34, label: ok ? '出 发' : '暂不可出发', size: ok ? 2 : 1,
            style: ok ? 'seal' : 'grey', disabled: !ok, cursor: ok,
            onClick: () => this.confirm(),
        });
        this.add(this.go);
        if (ok) scene.tweens.add({ targets: this.go, scale: { from: 1, to: 1.03 }, duration: 700, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        this.add(ptext(scene, rx, snap(H * 0.72) + PX * 26, 'Enter 出发 · M 管理卡组', { color: INK.slate, fx: 'none', origin: [0.5, 0.5] }).setColor(hex(INK.mist)));
    }

    private confirm(): void {
        if (!this.canConfirm()) return;
        if (this.go) pxBurst(this.scene, this.go.x, this.go.y, { colors: [INK.gold, INK.vermilion, INK.paper], count: 18, speed: 240, size: 6, depth: 2000 });
        this.onConfirm();
    }

    private switchDeck(direction: -1 | 1): void {
        const next = getAdjacentPreparationDeckId(this.stash.savedDecks, this.stash.selectedDeckId, direction);
        if (next && next !== this.stash.selectedDeckId) this.onDeckSelect(next);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (!this.visible || !this.active) return;
        switch (getPreparationKeyboardShortcut(event)) {
            case 'previous-deck': this.switchDeck(-1); break;
            case 'next-deck': this.switchDeck(1); break;
            case 'primary-action': this.confirm(); break;
            case 'manage': this.onOpenDeckManager?.(); break;
            default: return;
        }
        event.preventDefault?.();
    }
}
