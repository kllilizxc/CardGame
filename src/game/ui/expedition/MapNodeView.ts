import { GameObjects, Scene } from 'phaser';

import type { ExpeditionNodeType } from '../../types/expedition';
import type { VisibleExpeditionMapNode } from '../../scenes/expedition/mapTraversal';

export interface MapNodeViewConfig {
    node: VisibleExpeditionMapNode;
    x: number;
    y: number;
    onSelect: (nodeId: string) => void;
}

interface NodeTypeStyle {
    glyph: string;
    label: string;
    fillColor: number;
}

const NODE_TYPE_STYLES: Record<ExpeditionNodeType, NodeTypeStyle> = {
    entrance: { glyph: '入', label: 'entrance', fillColor: 0x0ea5e9 },
    battle: { glyph: '战', label: 'battle', fillColor: 0xef4444 },
    event: { glyph: '?', label: 'event', fillColor: 0xa855f7 },
    shop: { glyph: '商', label: 'shop', fillColor: 0xf59e0b },
    extract: { glyph: '撤', label: 'extract', fillColor: 0x22c55e },
    boss: { glyph: '王', label: 'boss', fillColor: 0xdc2626 },
};

function getStrokeColor(node: VisibleExpeditionMapNode): number {
    switch (node.visibility) {
        case 'cleared':
            return 0x93c5fd;
        case 'reachable':
            return 0xfacc15;
        case 'silhouette':
            return 0x64748b;
    }
}

export class MapNodeView extends GameObjects.Container {
    private readonly node: VisibleExpeditionMapNode;
    private readonly onSelect: (nodeId: string) => void;

    constructor(scene: Scene, config: MapNodeViewConfig) {
        super(scene, config.x, config.y);

        this.node = config.node;
        this.onSelect = config.onSelect;

        this.createNodeView();
        scene.add.existing(this);
    }

    private createNodeView(): void {
        const style = NODE_TYPE_STYLES[this.node.type];
        const isSilhouette = this.node.visibility === 'silhouette';
        const fillColor = isSilhouette ? 0x0f172a : style.fillColor;
        const fillAlpha = this.node.visibility === 'cleared' ? 0.92 : this.node.visibility === 'reachable' ? 1 : 0.34;
        const strokeAlpha = this.node.visibility === 'reachable' ? 1 : this.node.visibility === 'cleared' ? 0.9 : 0.58;

        const nodeCircle = this.scene.add.circle(0, 0, 34, fillColor, fillAlpha);
        nodeCircle.setStrokeStyle(this.node.visibility === 'reachable' ? 4 : 3, getStrokeColor(this.node), strokeAlpha);

        const glyph = this.scene.add.text(0, -1, style.glyph, {
            fontFamily: 'Arial',
            fontSize: '28px',
            color: isSilhouette ? '#94a3b8' : '#ffffff',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const nodeTypeLabel = this.scene.add.text(0, 47, style.label, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: this.node.visibility === 'reachable' ? '#fde68a' : '#cbd5e1',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        const nodeLabel = this.scene.add.text(0, 69, this.node.label, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: isSilhouette ? '#64748b' : '#f8fafc',
        }).setOrigin(0.5);

        if (this.node.selectable) {
            nodeCircle.setInteractive({ useHandCursor: true });
            nodeCircle.on('pointerover', () => nodeCircle.setScale(1.08));
            nodeCircle.on('pointerout', () => nodeCircle.setScale(1));
            nodeCircle.on('pointerdown', () => this.onSelect(this.node.id));
        }

        this.add([nodeCircle, glyph, nodeTypeLabel, nodeLabel]);
        this.setDepth(this.node.visibility === 'reachable' ? 70 : 60);
    }
}
