import { GameObjects, Scene } from 'phaser';

import { INK, PX } from '../../art/palette';
import { Pix, bake } from '../../art/pix';
import { iconPix, type PixIcon } from '../../art/icons';
import { ptext, clip } from '../../art/kit';
import type { ExpeditionNodeType } from '../../types/expedition';
import type { VisibleExpeditionMapNode } from '../../scenes/expedition/mapTraversal';

export interface MapNodeViewConfig {
    node: VisibleExpeditionMapNode;
    x: number;
    y: number;
    current?: boolean;
    onSelect: (nodeId: string) => void;
}

const NODE_STYLE: Record<ExpeditionNodeType, { icon: PixIcon; ring: number; face: number; r: number }> = {
    entrance: { icon: 'flag', ring: INK.bone, face: INK.indigo, r: 11 },
    battle: { icon: 'sword', ring: INK.vermilion, face: INK.wine, r: 11 },
    event: { icon: 'scroll', ring: INK.gold, face: INK.umber, r: 11 },
    shop: { icon: 'cup', ring: INK.teal, face: INK.pine, r: 11 },
    extract: { icon: 'map', ring: INK.spirit, face: INK.jade, r: 11 },
    boss: { icon: 'skull', ring: INK.gold, face: INK.cinnabar, r: 15 },
};

type Look = 'reachable' | 'cleared' | 'silhouette' | 'current';

/** Medallion texture: ringed disc with the type icon (or a ? for unseen nodes). */
function medallion(type: ExpeditionNodeType, look: Look): Pix {
    const st = NODE_STYLE[type];
    const r = st.r;
    const size = r * 2 + 5;
    const p = new Pix(size, size);
    const c = r + 2;
    const dim = look === 'cleared' || look === 'silhouette';
    p.disc(c, c + 1, r, INK.void);                      // drop shadow
    p.disc(c, c, r, INK.void);
    p.disc(c, c, r - 1, look === 'silhouette' ? INK.slate : dim ? INK.grey : st.ring);
    p.disc(c, c, r - 3, look === 'silhouette' ? INK.ink : dim ? INK.indigo : st.face);
    if (look !== 'silhouette') {
        const ic = iconPix(st.icon);
        if (dim) for (let i = 0; i < ic.buf.length; i++) if (ic.buf[i] !== -1 && ic.buf[i] !== INK.void) ic.buf[i] = INK.ash;
        p.blit(ic, c - 5, c - 5);
    } else {
        // ?
        p.rect(c - 2, c - 4, 4, 1, INK.dusk).px(c + 2, c - 3, INK.dusk).px(c + 2, c - 2, INK.dusk).px(c + 1, c - 1, INK.dusk).px(c, c, INK.dusk).px(c, c + 3, INK.dusk);
    }
    if (look === 'cleared') {
        // check mark
        p.px(c + r - 6, c + r - 4, INK.spirit).px(c + r - 5, c + r - 3, INK.spirit).px(c + r - 4, c + r - 4, INK.spirit).px(c + r - 3, c + r - 5, INK.spirit).px(c + r - 2, c + r - 6, INK.spirit);
    }
    return p;
}

export class MapNodeView extends GameObjects.Container {
    private readonly node: VisibleExpeditionMapNode;
    private readonly onSelect: (nodeId: string) => void;

    constructor(scene: Scene, config: MapNodeViewConfig) {
        super(scene, config.x, config.y);
        this.node = config.node;
        this.onSelect = config.onSelect;
        this.createNodeView(Boolean(config.current));
        scene.add.existing(this);
        this.setDepth(45);
    }

    private createNodeView(current: boolean): void {
        const n = this.node;
        const look: Look = current ? 'current' : n.visibility;
        const key = bake(this.scene, `pxnode:${n.type}:${look}`, () => medallion(n.type, look));
        const art = this.scene.add.image(0, 0, key).setScale(PX);
        this.add(art);

        if (n.visibility === 'reachable') {
            // pulsing selection ring
            const ring = this.scene.add.rectangle(0, 0, art.displayWidth + PX * 8, art.displayHeight + PX * 8).setStrokeStyle(PX, INK.gold, 1);
            this.addAt(ring, 0);
            this.scene.tweens.add({ targets: ring, scale: { from: 0.85, to: 1.15 }, alpha: { from: 1, to: 0 }, duration: 900, repeat: -1, ease: 'Stepped', easeParams: [4] });
            this.scene.tweens.add({ targets: art, y: -PX * 2, duration: 500, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        }
        if (n.visibility !== 'silhouette') {
            const label = ptext(this.scene, 0, art.displayHeight / 2 + PX * 8, clip(n.label, 7), {
                color: n.visibility === 'reachable' ? INK.gold : current ? INK.paper : INK.ash, fx: 'outline', origin: [0.5, 0.5],
            });
            this.add(label);
        }

        const interactive = n.selectable || n.visibility === 'cleared';
        if (interactive) {
            art.setInteractive({ useHandCursor: n.selectable });
            art.on('pointerover', () => art.setScale(PX * 1.12));
            art.on('pointerout', () => art.setScale(PX));
            art.on('pointerdown', () => this.onSelect(n.id));
        }
    }
}
