import { GameObjects, Scene } from 'phaser';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import { INK, PX } from '../../art/palette';
import { snap } from '../../art/pix';
import { PTooltip, numberFont, panel, piconButton, ptext } from '../../art/kit';
import { wenxinCardTexture } from '../../art/wenxin/WenxinArt';
import { cardInfo } from './cardInfo';

type ListCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;

/**
 * A pile (deck, discard…) laid out as a grid of pixel card faces at 1x in a scrolling panel.
 * Hover a card for its full text. Click outside or ✕ to close.
 */
export class CardListView extends GameObjects.Container {
    private scroll!: GameObjects.Container;
    private tip: PTooltip;
    private scrollY = 0;
    private maxScrollY = 0;
    private readonly wheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.setScroll(this.scrollY + dy * 0.8);

    constructor(scene: Scene, title: string, cards: ListCard[]) {
        super(scene, 0, 0);
        this.tip = new PTooltip(scene, PX * 150, 5200);
        this.setDepth(5000);
        this.build(title, cards);
        scene.add.existing(this);
        scene.input.on('wheel', this.wheel);
    }

    private build(title: string, cards: ListCard[]): void {
        const s = this.scene;
        const { width, height } = s.scale;
        const pw = snap(Math.min(1500, width - PX * 40));
        const ph = snap(height - PX * 30);
        const cx = snap(width / 2), cy = snap(height / 2);
        const overlay = s.add.rectangle(width / 2, height / 2, width, height, INK.void, 0.75).setInteractive();
        overlay.on('pointerdown', () => this.close());
        const frame = panel(s, cx, cy, pw, ph, 'ink');
        const block = s.add.rectangle(cx, cy, pw, ph, 0, 0.001).setInteractive();
        const left = cx - pw / 2, top = cy - ph / 2;
        const heading = ptext(s, left + PX * 12, top + PX * 8, `${title} · ${cards.length}`, { size: 2, color: INK.paper });
        const close = piconButton(s, left + pw - PX * 16, top + PX * 16, 'close', () => this.close(), 'slate', 16);
        this.add([overlay, frame, block, heading, close]);

        const areaTop = top + PX * 40, areaH = ph - PX * 48, areaLeft = left + PX * 10, areaW = pw - PX * 20;
        const cw = 180, chh = 258, gap = PX * 6;
        const cols = Math.max(1, Math.floor((areaW + gap) / (cw + gap)));
        const gridW = cols * cw + (cols - 1) * gap;
        const gx = snap(areaLeft + (areaW - gridW) / 2 + cw / 2);
        this.scroll = s.add.container(0, 0);
        const sorted = [...cards].sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || String(a.name).localeCompare(String(b.name)));
        sorted.forEach((card, i) => {
            const x = gx + (i % cols) * (cw + gap);
            const y = snap(areaTop + chh / 2 + Math.floor(i / cols) * (chh + gap));
            const key = wenxinCardTexture(s, card as never);
            if (!key) return;
            const img = s.add.image(x, y, key).setScale(PX).setInteractive({ useHandCursor: true });
            this.scroll.add(img);
            if (card.kind === 'unit') {
                const u = card as UnitCard;
                const a = s.add.bitmapText(x - 55, y + 108, numberFont(s, INK.paper), `${u.attack}`).setOrigin(0.5).setScale(PX);
                const h = s.add.bitmapText(x + 55, y + 108, numberFont(s, INK.paper), `${u.health}`).setOrigin(0.5).setScale(PX);
                a.setLetterSpacing(-1); h.setLetterSpacing(-1);
                this.scroll.add([a, h]);
            }
            img.on('pointerover', (p: Phaser.Input.Pointer) => {
                img.y = y - PX * 3;
                const info = cardInfo(s, card as never);
                this.tip.show(p.x + PX * 10, p.y - PX * 40, info.title, [info.sub, info.body, ...info.gongfa.map((g) => `【${g.name}】${g.text}`)].filter(Boolean).join('\n'));
            });
            img.on('pointerout', () => { img.y = y; this.tip.hide(); });
        });
        const rows = Math.ceil(sorted.length / cols);
        this.maxScrollY = Math.max(0, rows * (chh + gap) - gap - areaH);
        const maskG = s.make.graphics({});
        maskG.fillStyle(0xffffff).fillRect(areaLeft, areaTop, areaW, areaH);
        this.scroll.setMask(maskG.createGeometryMask());
        this.add(this.scroll);
        if (!cards.length) this.add(ptext(s, cx, cy, '空 空 如 也', { color: INK.mist, origin: [0.5, 0.5] }));
    }

    private setScroll(v: number): void {
        this.scrollY = Phaser.Math.Clamp(v, 0, this.maxScrollY);
        this.scroll.y = -snap(this.scrollY);
    }

    public close(): void {
        this.scene.input.off('wheel', this.wheel);
        this.tip.destroy();
        this.destroy();
    }
}
