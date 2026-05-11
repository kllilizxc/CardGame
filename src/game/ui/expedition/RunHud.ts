import { GameObjects, Scene } from 'phaser';

import {
    createRunResolutionSummaryView,
    createRunSummary,
} from '../../scenes/expedition/entryFlowModel';
import type { RunResolutionSummary, RunSnapshot } from '../../types/expedition';

export class RunHud extends GameObjects.Container {
    private currentNodeValue!: GameObjects.Text;
    private carriedDeckValue!: GameObjects.Text;
    private carriedItemsValue!: GameObjects.Text;
    private spiritStonesValue!: GameObjects.Text;
    private summaryOverlay?: GameObjects.Container;

    constructor(scene: Scene) {
        super(scene, 0, 0);

        this.createHud();
        scene.add.existing(this);
    }

    private createHud(): void {
        const { width } = this.scene.scale;
        const background = this.scene.add.rectangle(width / 2, 56, width - 96, 84, 0x020617, 0.9);
        background.setStrokeStyle(2, 0x38bdf8, 0.85);

        this.currentNodeValue = this.createValueText(150, '当前节点：-');
        this.carriedDeckValue = this.createValueText(560, '携带卡牌：0');
        this.carriedItemsValue = this.createValueText(920, '携带道具：0');
        this.spiritStonesValue = this.createValueText(1280, '灵石：0');

        this.add([
            background,
            this.currentNodeValue,
            this.carriedDeckValue,
            this.carriedItemsValue,
            this.spiritStonesValue,
        ]);

        this.setDepth(900);
    }

    private createValueText(x: number, initialText: string): GameObjects.Text {
        return this.scene.add.text(x, 56, initialText, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#e2e8f0',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
    }

    public updateFromRun(run: RunSnapshot, currentNodeLabel?: string): void {
        const summary = createRunSummary(run, { currentNodeLabel });

        this.updateRunStats(
            summary.currentNodeLabel,
            summary.carriedDeckCount,
            summary.carriedItemCount,
            summary.spiritStones,
        );
    }

    public updateRunStats(
        currentNodeLabel: string,
        carriedDeckCount: number,
        carriedItemCount: number,
        spiritStones: number,
    ): void {
        this.currentNodeValue.setText(`当前节点：${currentNodeLabel}`);
        this.carriedDeckValue.setText(`携带卡牌：${carriedDeckCount}`);
        this.carriedItemsValue.setText(`携带道具：${carriedItemCount}`);
        this.spiritStonesValue.setText(`灵石：${spiritStones}`);
    }

    public showPostRunSummary(summary: RunResolutionSummary, onAcknowledge: () => void): void {
        this.hidePostRunSummary();

        const { width, height } = this.scene.scale;
        const view = createRunResolutionSummaryView(summary);
        const overlay = this.scene.add.container(0, 0);
        const background = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0.86);
        const panelWidth = Math.min(980, width * 0.78);
        const panelHeight = Math.min(760, height * 0.78);
        const panelX = width / 2;
        const panelY = height / 2 + 24;
        const leftX = panelX - panelWidth / 2 + 56;
        const rightX = panelX + 40;
        const keptCards = view.keptCards.join('\n');
        const keptItems = view.keptItems.join('\n');
        const lostCards = view.lostCards.join('\n');
        const lostItems = view.lostItems.join('\n');

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.98);
        panel.setStrokeStyle(3, view.outcome === 'defeat' ? 0xef4444 : 0x22c55e, 0.95);

        const title = this.scene.add.text(leftX, panelY - panelHeight / 2 + 42, view.title, {
            fontFamily: 'Arial',
            fontSize: '38px',
            color: view.outcome === 'defeat' ? '#fecaca' : '#bbf7d0',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(leftX, title.y + 52, view.subtitle, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#e2e8f0',
            wordWrap: { width: panelWidth - 112 },
        });

        const keptHeading = this.scene.add.text(leftX, subtitle.y + 58, '保留 / 存入永久仓库', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#86efac',
            fontStyle: 'bold',
        });

        const keptText = this.scene.add.text(
            leftX,
            keptHeading.y + 40,
            `Cards\n${keptCards}\n\nItems\n${keptItems}\n\nspiritStones\n${view.keptSpiritStones}`,
            {
                fontFamily: 'Courier New',
                fontSize: '18px',
                color: '#e2e8f0',
                lineSpacing: 6,
            },
        );

        const lostHeading = this.scene.add.text(rightX, keptHeading.y, '遗失 / 从本次探索中失去', {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#fca5a5',
            fontStyle: 'bold',
        });

        const lostText = this.scene.add.text(
            rightX,
            lostHeading.y + 40,
            `Cards\n${lostCards}\n\nItems\n${lostItems}\n\nspiritStones\n${view.lostSpiritStones}`,
            {
                fontFamily: 'Courier New',
                fontSize: '18px',
                color: '#e2e8f0',
                lineSpacing: 6,
            },
        );

        const acknowledgeButton = this.scene.add.rectangle(panelX, panelY + panelHeight / 2 - 64, 320, 56, 0x2563eb, 1);
        acknowledgeButton.setStrokeStyle(2, 0xffffff, 0.9);
        acknowledgeButton.setInteractive({ useHandCursor: true });
        acknowledgeButton.on('pointerover', () => acknowledgeButton.setFillStyle(0x3b82f6));
        acknowledgeButton.on('pointerout', () => acknowledgeButton.setFillStyle(0x2563eb));
        acknowledgeButton.on('pointerdown', onAcknowledge);

        const acknowledgeLabel = this.scene.add.text(acknowledgeButton.x, acknowledgeButton.y, '确认并返回入口', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        overlay.add([
            background,
            panel,
            title,
            subtitle,
            keptHeading,
            keptText,
            lostHeading,
            lostText,
            acknowledgeButton,
            acknowledgeLabel,
        ]);
        overlay.setDepth(1500);

        this.summaryOverlay = overlay;
    }

    public hidePostRunSummary(): void {
        this.summaryOverlay?.destroy();
        this.summaryOverlay = undefined;
    }
}
