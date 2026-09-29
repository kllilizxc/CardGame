import type { Scene } from 'phaser';
import type { BaseCardSprite } from '../../../objects/BaseCardSprite';
import { CardSpriteFactory } from '../../../factories/CardSpriteFactory';
import type { CardPreviewMetadata, PreviewCardData } from '../../../managers/common/cardPreviewProtocol';
import { C } from '../../../art/palette';

/**
 * Battle-side card inspector: a single enlarged card that pops in beside whatever you point at,
 * on the empty flank of the screen — no title bar, no source line, no close button.
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

    /** Hover from a live sprite. Hand cards raise themselves, so only field units use this. */
    showFromSprite(sprite: BaseCardSprite, meta: CardPreviewMetadata = {}) {
        const w = this.scene.scale.width, h = this.scene.scale.height;
        const onRight = sprite.x > w / 2;
        this.present(sprite.getCardData() as PreviewCardData, onRight ? w - 236 : 236, h * 0.4, meta);
        this.detachOwner();
        this.owner = sprite;
        this.ownerOut = () => this.hide();
        sprite.on('pointerout', this.ownerOut);
    }

    showFromData(data: PreviewCardData, meta: CardPreviewMetadata = {}) {
        const w = this.scene.scale.width, h = this.scene.scale.height;
        this.present(data, w * 0.2, h * 0.42, meta);
    }

    private present(data: PreviewCardData, x: number, y: number, meta: CardPreviewMetadata) {
        const s = this.scene;
        this.destroyCard();
        const card = CardSpriteFactory.createSprite(s, data as never, 0, 0, 1);
        if (!card) return;
        card.setDisplayMode('hover');
        card.disableDragging();
        card.disableInteractive();
        this.contextId = meta.contextId;
        const shadow = s.add.rectangle(10, 14, 190, 270, C.void, 0.5);
        this.host.add([shadow, card]);
        this.host.setPosition(x, y).setVisible(true).setAlpha(0).setScale(1.05);
        const t = ++this.token;
        s.tweens.killTweensOf(this.host);
        s.tweens.add({ targets: this.host, alpha: 1, scale: 1.32, duration: 140, ease: 'Back.easeOut', onComplete: () => { void t; } });
    }

    hide() {
        if (!this.host.visible) return;
        const s = this.scene;
        const token = ++this.token;
        s.tweens.killTweensOf(this.host);
        s.tweens.add({
            targets: this.host, alpha: 0, scale: 1.1, duration: 90,
            onComplete: () => { if (token === this.token) { this.host.setVisible(false); this.destroyCard(); } },
        });
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
