import type { Scene } from 'phaser';
import type { BaseCardSprite } from '../../../objects/BaseCardSprite';
import { CardSpriteFactory } from '../../../factories/CardSpriteFactory';
import type { CardPreviewMetadata, PreviewCardData } from '../../../managers/common/cardPreviewProtocol';
import { INK, PX } from '../../../art/palette';
import { snap } from '../../../art/pix';
import { panel, ptext } from '../../../art/kit';
import { cardInfo } from '../../common/cardInfo';

/**
 * Battle-side card inspector. Board units: the card at exactly 2x on the empty flank with an
 * info scroll beside it. Hand cards (already face-up in the fan): just the info scroll above them.
 */
export class HoverCard {
    private host: Phaser.GameObjects.Container;
    private contextId?: string;
    private owner?: { off: (e: string, fn: () => void) => void };
    private ownerOut?: () => void;
    private token = 0;

    constructor(private readonly scene: Scene, depth = 6000) {
        this.host = scene.add.container(0, 0).setDepth(depth).setVisible(false);
        scene.events.once('shutdown', () => this.destroy());
    }

    showFromSprite(sprite: BaseCardSprite, meta: CardPreviewMetadata = {}) {
        const w = this.scene.scale.width, h = this.scene.scale.height;
        const inHand = sprite.y > h * 0.7;
        if (inHand) this.present(sprite.getCardData() as PreviewCardData, sprite.x, sprite.y - PX * 70, meta, false);
        else {
            const onRight = sprite.x > w / 2;
            this.present(sprite.getCardData() as PreviewCardData, onRight ? w * 0.2 : w * 0.8, h * 0.44, meta, true);
        }
        this.detachOwner();
        this.owner = sprite;
        this.ownerOut = () => this.hide();
        sprite.on('pointerout', this.ownerOut);
    }

    showFromData(data: PreviewCardData, meta: CardPreviewMetadata = {}) {
        const w = this.scene.scale.width, h = this.scene.scale.height;
        this.present(data, w * 0.22, h * 0.44, meta, true);
    }

    private present(data: PreviewCardData, x: number, y: number, meta: CardPreviewMetadata, withCard: boolean) {
        const s = this.scene;
        this.destroyCard();
        this.contextId = meta.contextId;
        const info = cardInfo(s, data as never);
        const pw = PX * 150;
        const lines: Phaser.GameObjects.GameObject[] = [];
        let cy = PX * 8;
        const add = (t: Phaser.GameObjects.Text) => { lines.push(t); cy += t.height + PX * 3; return t; };
        add(ptext(s, PX * 8, cy, info.title, { color: INK.gold }));
        add(ptext(s, PX * 8, cy, info.sub, { color: INK.mist }));
        if (info.stats) add(ptext(s, PX * 8, cy, `攻 ${info.stats.attack}   命 ${info.stats.health}`, { color: INK.bone }));
        if (info.body) add(ptext(s, PX * 8, cy, info.body, { color: INK.paper, wrap: pw - PX * 16 }));
        for (const g of info.gongfa) add(ptext(s, PX * 8, cy, `【${g.name}】${g.text}`, { color: INK.spirit, wrap: pw - PX * 16 }));
        if (meta.contextSection?.lines?.length) add(ptext(s, PX * 8, cy, meta.contextSection.lines.join('\n'), { color: INK.amber, wrap: pw - PX * 16 }));
        const ph = snap(cy + PX * 5);
        const scroll = s.add.container(0, 0, [panel(s, pw / 2, ph / 2, pw, ph, 'ink'), ...lines]);

        if (withCard) {
            const card = CardSpriteFactory.createSprite(s, data as never, 0, 0, 1);
            if (card) {
                card.setDisplayMode('hover');
                card.disableDragging();
                card.disableInteractive();
                card.setScale(2);
                this.host.add(card);
            }
            const left = x > s.scale.width / 2;
            scroll.setPosition(left ? -PX * 60 - pw - PX * 6 : PX * 66, -ph / 2);
        } else {
            scroll.setPosition(-pw / 2, -ph);
        }
        this.host.add(scroll);
        const W = s.scale.width;
        const bx = withCard ? x : Phaser.Math.Clamp(x, pw / 2 + PX * 4, W - pw / 2 - PX * 4);
        const by = withCard ? y : Math.max(ph + PX * 4, y);
        this.host.setPosition(snap(bx), snap(by)).setVisible(true).setAlpha(0);
        ++this.token;
        s.tweens.killTweensOf(this.host);
        s.tweens.add({ targets: this.host, alpha: 1, duration: 100, ease: 'Stepped', easeParams: [3] });
    }

    hide() {
        if (!this.host.visible) return;
        const token = ++this.token;
        this.scene.tweens.killTweensOf(this.host);
        this.host.setVisible(false);
        if (token === this.token) this.destroyCard();
    }

    clearContext(id: string) { if (this.contextId === id) this.hide(); }

    private detachOwner() {
        if (this.owner && this.ownerOut) this.owner.off('pointerout', this.ownerOut);
        this.owner = undefined; this.ownerOut = undefined;
    }

    private destroyCard() {
        this.detachOwner();
        this.host.removeAll(true);
    }

    destroy() {
        this.scene.tweens.killTweensOf(this.host);
        this.destroyCard();
        this.host.destroy();
    }
}
