import { GameObjects, Scene } from 'phaser';

import { createPreparationSummary } from '../../scenes/expedition/entryFlowModel';
import type { ExpeditionCardStack, ExpeditionItemStack, PersistentStash } from '../../types/expedition';

export interface PreparationPanelConfig {
    stash: PersistentStash;
    onConfirm: () => void;
}

function formatCardLine(stack: ExpeditionCardStack): string {
    return `${stack.id} ×${stack.count}`;
}

function formatItemLine(stack: ExpeditionItemStack): string {
    return `${stack.id} ×${stack.count}`;
}

export class PreparationPanel extends GameObjects.Container {
    private readonly stash: PersistentStash;
    private readonly onConfirm: () => void;
    private confirmButton!: GameObjects.Rectangle;

    constructor(scene: Scene, config: PreparationPanelConfig) {
        super(scene, 0, 0);

        this.stash = config.stash;
        this.onConfirm = config.onConfirm;

        this.createPanel();
        scene.add.existing(this);
    }

    private createPanel(): void {
        const { width, height } = this.scene.scale;
        const panelWidth = Math.min(920, width * 0.78);
        const panelHeight = Math.min(720, height * 0.78);
        const panelX = width / 2;
        const panelY = height / 2 + 24;
        const leftColumnX = panelX - panelWidth / 2 + 56;
        const summary = createPreparationSummary(this.stash);

        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x05070d, 0.76);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x7c3aed, 0.9);

        const title = this.scene.add.text(leftColumnX, panelY - panelHeight / 2 + 42, '秘境入口 · 储物袋确认', {
            fontFamily: 'Arial',
            fontSize: '34px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(leftColumnX, title.y + 46, 'Phase 01 暂不开放卡组构筑；确认当前 starter stash 后即可进入。', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            wordWrap: { width: panelWidth - 112 },
        });

        const loadoutSummaryText = this.scene.add.text(leftColumnX, subtitle.y + 52, `带入合计：${summary.deckCount} 张卡 · ${summary.itemCount} 件道具`, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#93c5fd',
        });

        const spiritStonesText = this.scene.add.text(leftColumnX, loadoutSummaryText.y + 38, `spiritStones：${summary.spiritStones}`, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#fde68a',
            fontStyle: 'bold',
        });

        const deckHeading = this.scene.add.text(leftColumnX, spiritStonesText.y + 52, 'Starter Deck', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#93c5fd',
            fontStyle: 'bold',
        });

        const deckList = this.scene.add.text(leftColumnX, deckHeading.y + 36, this.stash.deck.map(formatCardLine).join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '18px',
            color: '#e2e8f0',
            lineSpacing: 8,
        });

        const itemsHeading = this.scene.add.text(panelX + 110, spiritStonesText.y + 52, 'Starter Items', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#86efac',
            fontStyle: 'bold',
        });

        const itemsText = this.scene.add.text(panelX + 110, itemsHeading.y + 36, this.stash.items.map(formatItemLine).join('\n'), {
            fontFamily: 'Courier New',
            fontSize: '18px',
            color: '#e2e8f0',
            lineSpacing: 8,
        });

        this.confirmButton = this.scene.add.rectangle(panelX, panelY + panelHeight / 2 - 64, 280, 56, 0x2563eb, 1);
        this.confirmButton.setStrokeStyle(2, 0xffffff, 0.9);
        this.confirmButton.setInteractive({ useHandCursor: true });
        this.confirmButton.on('pointerover', () => this.confirmButton.setFillStyle(0x3b82f6));
        this.confirmButton.on('pointerout', () => this.confirmButton.setFillStyle(0x2563eb));
        this.confirmButton.on('pointerdown', () => this.confirmLoadout());

        const confirmLabel = this.scene.add.text(this.confirmButton.x, this.confirmButton.y, '确认带入当前储物袋', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add([
            overlay,
            panel,
            title,
            subtitle,
            loadoutSummaryText,
            spiritStonesText,
            deckHeading,
            deckList,
            itemsHeading,
            itemsText,
            this.confirmButton,
            confirmLabel,
        ]);

        this.setDepth(1000);
    }

    private confirmLoadout(): void {
        this.onConfirm();
    }
}
