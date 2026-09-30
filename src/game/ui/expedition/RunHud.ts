import { GameObjects, Scene } from 'phaser';

import { INK, PX } from '../../art/palette';
import { snap } from '../../art/pix';
import { PTooltip, clip, panel, pbar, pbutton, pchip, ptext, ptitle, ptoast } from '../../art/kit';
import { addIcon } from '../../art/icons';
import { pxBurst, pxShake } from '../../art/fx';
import { countOccupiedItemSlots, resolveItemSlotCapacity } from '../../state/ItemCapacity';
import {
    type ExpeditionArrivalCueSummary,
    type RunResolutionSummaryViewOptions,
    createRunResolutionSummaryView,
    createRunSummary,
} from '../../scenes/expedition/entryFlowModel';
import type { RunResolutionSummary, RunSnapshot } from '../../types/expedition';
import { getRunPlayerHealth, MAX_RUN_PLAYER_HEALTH } from '../../state/RunHealth';

type Chip = GameObjects.Container & { setValue(v: string): void };

/**
 * The expedition's only persistent HUD: a strip of chips along the top edge —
 * health bar, spirit stones, carried cards and a bag button. Everything else is on demand.
 */
export class RunHud extends GameObjects.Container {
    private hpBar!: ReturnType<typeof pbar>;
    private hpText!: GameObjects.Text;
    private nodeText!: GameObjects.Text;
    private stones!: Chip;
    private deck!: Chip;
    private bagText!: GameObjects.Text;
    private tooltip: PTooltip;
    private onInventory?: () => void;
    private summaryOverlay?: GameObjects.Container;
    private lastHp = -1;

    constructor(scene: Scene) {
        super(scene, 0, 0);
        this.tooltip = new PTooltip(scene, 440, 1600);
        this.createHud();
        scene.add.existing(this);
        this.setDepth(900);
    }

    private createHud(): void {
        const s = this.scene;
        const { width } = s.scale;
        const y = PX * 16;
        // health
        const heart = addIcon(s, PX * 16, y, 'heart');
        this.hpBar = pbar(s, PX * 26, y - PX * 5, PX * 70, PX * 10, INK.cinnabar);
        this.hpText = ptext(s, PX * 100, y, '100', { color: INK.paper, fx: 'outline', origin: [0, 0.5] });
        this.stones = pchip(s, PX * 132, y, 'stone', '0', INK.spirit);
        this.deck = pchip(s, PX * 178, y, 'deck', '0', INK.bone);
        this.nodeText = ptext(s, width / 2, y, '', { color: INK.bone, fx: 'outline', origin: [0.5, 0.5] });

        // bag button (right)
        const bagBtn = pbutton(s, { x: width - PX * 76, y, width: PX * 64, height: PX * 20, icon: 'bag', label: '0/0', style: 'slate', onClick: () => this.onInventory?.() });
        this.bagText = (bagBtn.list[1] as GameObjects.Container).list.find((o) => o instanceof GameObjects.Text) as GameObjects.Text;

        this.add([heart, this.hpBar.g, this.hpText, this.stones, this.deck, this.nodeText, bagBtn]);
        const tip = (o: GameObjects.GameObject, title: string, body: () => string) => {
            (o as GameObjects.Container).setSize?.(PX * 40, PX * 16);
            o.setInteractive?.();
            o.on('pointerover', (p: Phaser.Input.Pointer) => this.tooltip.show(p.x + PX * 6, p.y + PX * 8, title, body()));
            o.on('pointerout', () => this.tooltip.hide());
        };
        tip(this.stones, '灵石', () => `灵石：${this.stones.getData('v') ?? 0}`);
        tip(this.deck, '卡牌', () => `携带卡牌：${this.deck.getData('v') ?? 0}`);
    }

    public setInventoryOpenHandler(onOpen: () => void): void {
        this.onInventory = onOpen;
    }

    public updateFromRun(run: RunSnapshot, currentNodeLabel?: string): void {
        const summary = createRunSummary(run, { currentNodeLabel });
        this.updateRunStats(
            summary.currentNodeLabel,
            summary.carriedDeckCount,
            summary.carriedItemCount,
            summary.spiritStones,
            countOccupiedItemSlots(run.carriedItems),
            resolveItemSlotCapacity(run.itemSlotCapacity),
            getRunPlayerHealth(run.playerHealth),
        );
    }

    public updateRunStats(
        currentNodeLabel: string,
        carriedDeckCount: number,
        carriedItemCount: number,
        spiritStones: number,
        occupiedItemSlots?: number,
        itemSlotCapacity?: number,
        playerHealth?: number,
    ): void {
        const hp = playerHealth ?? MAX_RUN_PLAYER_HEALTH;
        this.hpBar.draw(hp / MAX_RUN_PLAYER_HEALTH, hp / MAX_RUN_PLAYER_HEALTH < 0.3 ? INK.vermilion : INK.cinnabar);
        this.hpText.setText(`${hp}`);
        if (this.lastHp >= 0 && hp < this.lastHp) pxShake(this.scene, 6, 160);
        this.lastHp = hp;
        this.stones.setValue(`${spiritStones}`);
        this.stones.setData('v', spiritStones);
        this.deck.setValue(`${carriedDeckCount}`);
        this.deck.setData('v', carriedDeckCount);
        this.nodeText.setText(currentNodeLabel ? `◆ ${clip(currentNodeLabel, 14)}` : '');
        this.bagText?.setText(occupiedItemSlots !== undefined && itemSlotCapacity !== undefined ? `${occupiedItemSlots}/${itemSlotCapacity}` : `${carriedItemCount}`);
    }

    /** Arrival is a one-line banner, not a panel. */
    public showArrivalCue(summary: ExpeditionArrivalCueSummary): void {
        ptoast(this.scene, `${summary.badgeLabel} · ${summary.headline}`, INK.gold, 2800);
    }

    public hideArrivalCue(_animate = false): void {
        // banners dismiss themselves
    }

    public showPostRunSummary(
        summary: RunResolutionSummary,
        onAcknowledge: () => void,
        options: RunResolutionSummaryViewOptions = {},
    ): void {
        this.hidePostRunSummary();
        const s = this.scene;
        const { width, height } = s.scale;
        const view = createRunResolutionSummaryView(summary, options);
        const lost = view.outcome === 'defeat';
        const overlay = s.add.container(0, 0).setDepth(1500);
        const dim = s.add.rectangle(width / 2, height / 2, width, height, INK.void, 0.82).setInteractive();
        overlay.add(dim);

        const title = ptitle(s, width / 2, snap(height * 0.18), view.title, 4, lost
            ? { face: INK.haze, lower: INK.mist, extrude: INK.wine }
            : { face: INK.paper, lower: INK.gold, extrude: INK.cinnabar });
        title.setScale(0);
        s.tweens.add({ targets: title, scale: PX, duration: 320, ease: 'Back.easeOut', onComplete: () => {
            pxBurst(s, width / 2, height * 0.18, { colors: lost ? [INK.ash, INK.mist] : [INK.gold, INK.paper, INK.vermilion], count: 26, speed: 300, size: 9, depth: 1600 });
        } });
        overlay.add(title);
        overlay.add(ptext(s, width / 2, snap(height * 0.18) + PX * 32, clip(view.subtitle, 40), { color: INK.bone, origin: [0.5, 0.5], fx: 'outline' }));

        const colW = snap(Math.min(600, width * 0.34));
        const colH = snap(height * 0.46);
        const colY = snap(height * 0.56);
        const col = (x: number, heading: string, color: number, cards: string[], items: string[], stones: string) => {
            overlay.add(panel(s, x, colY, colW, colH, 'ink'));
            overlay.add(ptext(s, x - colW / 2 + PX * 10, colY - colH / 2 + PX * 8, heading, { color, fx: 'shadow' }));
            const lines = [
                ...cards.map((c) => `卡 ${c}`),
                ...items.map((i) => `物 ${i}`),
            ];
            const max = Math.floor((colH - PX * 50) / 42);
            const shown = lines.slice(0, max);
            if (lines.length > max) shown[max - 1] = `…另有 ${lines.length - max + 1} 项`;
            overlay.add(ptext(s, x - colW / 2 + PX * 10, colY - colH / 2 + PX * 26, shown.join('\n') || '—', { color: INK.bone, lineGap: PX * 2 }));
            const chip = pchip(s, x - colW / 2 + PX * 10, colY + colH / 2 - PX * 12, 'stone', stones, INK.spirit);
            overlay.add(chip);
        };
        col(width / 2 - colW / 2 - PX * 8, '保 留', INK.spirit, view.keptCards, view.keptItems, view.keptSpiritStones);
        col(width / 2 + colW / 2 + PX * 8, '遗 失', INK.vermilion, view.lostCards, view.lostItems, view.lostSpiritStones);

        overlay.add(pbutton(s, { x: width / 2, y: snap(height * 0.88), width: PX * 90, height: PX * 24, label: '返回入口', style: lost ? 'slate' : 'seal', onClick: onAcknowledge }));
        if (!lost) pxShake(s, 6, 200);
        this.summaryOverlay = overlay;
    }

    public hidePostRunSummary(): void {
        this.summaryOverlay?.destroy();
        this.summaryOverlay = undefined;
    }
}
