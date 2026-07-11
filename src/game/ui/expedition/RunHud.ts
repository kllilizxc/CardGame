import { GameObjects, Scene } from 'phaser';

import {
    type ExpeditionArrivalCueSummary,
    createRunResolutionSummaryView,
    createRunSummary,
} from '../../scenes/expedition/entryFlowModel';
import type { RunResolutionSummary, RunSnapshot } from '../../types/expedition';
import { expeditionUiTheme } from '../common/expeditionUiTheme';

export class RunHud extends GameObjects.Container {
    private currentNodeValue!: GameObjects.Text;
    private carriedDeckValue!: GameObjects.Text;
    private carriedItemsValue!: GameObjects.Text;
    private spiritStonesValue!: GameObjects.Text;
    private arrivalCueOverlay?: GameObjects.Container;
    private summaryOverlay?: GameObjects.Container;

    constructor(scene: Scene) {
        super(scene, 0, 0);

        this.createHud();
        scene.add.existing(this);
    }

    private createHud(): void {
        const { width } = this.scene.scale;
        const background = this.scene.add.rectangle(width / 2, 60, width - 96, 92, expeditionUiTheme.colors.overlay, 0.9);
        background.setStrokeStyle(2, expeditionUiTheme.colors.jadeBright, 0.85);

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
        return this.scene.add.text(x, 60, initialText, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '26px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0, 0.5);
    }

    private measureTextHeight(
        text: string,
        style: Phaser.Types.GameObjects.Text.TextStyle,
    ): number {
        const probe = this.scene.add.text(-10000, -10000, text, style);
        const height = probe.height;
        probe.destroy();
        return height;
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

    private createArrivalSupportLine(summary: ExpeditionArrivalCueSummary): string {
        const routePreview = summary.routeLine.startsWith('首层：')
            ? summary.routeLine.slice('首层：'.length)
            : summary.routeLine;

        return `${summary.detail}：${routePreview}`;
    }

    public showArrivalCue(summary: ExpeditionArrivalCueSummary): void {
        this.hideArrivalCue();

        const { width } = this.scene.scale;
        const panelWidth = Math.max(320, Math.min(width - 180, 520));
        const panelX = width / 2;
        const panelY = 126;
        const panelLeft = panelX - panelWidth / 2 + 18;
        const contentWidth = panelWidth - 36;
        const headlineLine = `${summary.badgeLabel} · ${summary.headline}`;
        const supportLine = this.createArrivalSupportLine(summary);
        const headlineHeight = this.measureTextHeight(headlineLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            fontStyle: 'bold',
            wordWrap: { width: contentWidth },
        });
        const supportHeight = this.measureTextHeight(supportLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: contentWidth },
        });
        const loadoutHeight = this.measureTextHeight(summary.loadoutLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            wordWrap: { width: contentWidth },
        });
        const panelHeight = Math.max(
            86,
            12
            + headlineHeight
            + 4
            + supportHeight
            + 4
            + loadoutHeight
            + 12,
        );
        const panelTop = panelY - panelHeight / 2;
        const overlay = this.scene.add.container(0, 0);
        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x07111f, 0.74);
        panel.setStrokeStyle(1, expeditionUiTheme.colors.slate, 0.42);
        const accent = this.scene.add.rectangle(panelX - panelWidth / 2 + 3, panelY, 3, panelHeight - 18, expeditionUiTheme.colors.jadeBright, 0.28);
        const headline = this.scene.add.text(panelLeft, panelTop + 12, headlineLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#f3ead3',
            fontStyle: 'bold',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);
        const supportText = this.scene.add.text(panelLeft, headline.y + headline.height + 4, supportLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#bca785',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);
        const loadoutLine = this.scene.add.text(panelLeft, supportText.y + supportText.height + 4, summary.loadoutLine, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#e6f3ea',
            wordWrap: { width: contentWidth },
        }).setOrigin(0, 0);

        overlay.add([panel, accent, headline, supportText, loadoutLine]);
        overlay.setAlpha(0);
        overlay.setY(8);

        this.add(overlay);
        this.arrivalCueOverlay = overlay;

        this.scene.tweens.add({
            targets: overlay,
            alpha: 1,
            y: 0,
            duration: 220,
            ease: 'Cubic.easeOut',
        });
    }

    public hideArrivalCue(animate = false): void {
        if (!this.arrivalCueOverlay) {
            return;
        }

        const overlay = this.arrivalCueOverlay;
        this.arrivalCueOverlay = undefined;
        this.scene.tweens.killTweensOf(overlay);

        if (!animate) {
            overlay.destroy();
            return;
        }

        this.scene.tweens.add({
            targets: overlay,
            alpha: 0,
            y: -10,
            duration: 160,
            ease: 'Cubic.easeIn',
            onComplete: () => overlay.destroy(),
        });
    }

    public showPostRunSummary(summary: RunResolutionSummary, onAcknowledge: () => void): void {
        this.hideArrivalCue();
        this.hidePostRunSummary();

        const { width, height } = this.scene.scale;
        const view = createRunResolutionSummaryView(summary);
        const overlay = this.scene.add.container(0, 0);
        const background = this.scene.add.rectangle(width / 2, height / 2, width, height, expeditionUiTheme.colors.overlay, 0.86);
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

        const panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, expeditionUiTheme.colors.panelInner, 0.98);
        panel.setStrokeStyle(3, view.outcome === 'defeat' ? expeditionUiTheme.colors.emberBright : expeditionUiTheme.colors.jade, 0.95);

        const title = this.scene.add.text(leftX, panelY - panelHeight / 2 + 42, view.title, {
            fontFamily: expeditionUiTheme.fonts.display,
            fontSize: '40px',
            color: view.outcome === 'defeat' ? '#f3d0c3' : '#e6f3ea',
            fontStyle: 'bold',
        });

        const subtitle = this.scene.add.text(leftX, title.y + 52, view.subtitle, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '22px',
            color: '#f3ead3',
            wordWrap: { width: panelWidth - 112 },
        });

        const nodeText = this.scene.add.text(leftX, subtitle.y + 44, `终点节点：${view.finalNodeId}`, {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '18px',
            color: '#e8d5ab',
        });

        const keptHeading = this.scene.add.text(leftX, nodeText.y + 58, '保留 / 存入永久仓库', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#e6f3ea',
            fontStyle: 'bold',
        });

        const keptText = this.scene.add.text(
            leftX,
            keptHeading.y + 40,
            `Cards\n${keptCards}\n\nItems\n${keptItems}\n\nspiritStones\n${view.keptSpiritStones}`,
            {
                fontFamily: expeditionUiTheme.fonts.mono,
                fontSize: '18px',
                color: '#f3ead3',
                lineSpacing: 6,
            },
        );

        const lostHeading = this.scene.add.text(rightX, keptHeading.y, '遗失 / 从本次探索中失去', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '28px',
            color: '#fca5a5',
            fontStyle: 'bold',
        });

        const lostText = this.scene.add.text(
            rightX,
            lostHeading.y + 40,
            `Cards\n${lostCards}\n\nItems\n${lostItems}\n\nspiritStones\n${view.lostSpiritStones}`,
            {
                fontFamily: expeditionUiTheme.fonts.mono,
                fontSize: '18px',
                color: '#f3ead3',
                lineSpacing: 6,
            },
        );

        const acknowledgeButton = this.scene.add.rectangle(panelX, panelY + panelHeight / 2 - 64, 320, 56, expeditionUiTheme.colors.jade, 1);
        acknowledgeButton.setStrokeStyle(2, expeditionUiTheme.colors.goldSoft, 0.9);
        acknowledgeButton.setInteractive({ useHandCursor: true });
        acknowledgeButton.on('pointerover', () => acknowledgeButton.setFillStyle(expeditionUiTheme.colors.jadeBright));
        acknowledgeButton.on('pointerout', () => acknowledgeButton.setFillStyle(expeditionUiTheme.colors.jade));
        acknowledgeButton.on('pointerdown', onAcknowledge);

        const acknowledgeLabel = this.scene.add.text(acknowledgeButton.x, acknowledgeButton.y, '确认并返回入口', {
            fontFamily: expeditionUiTheme.fonts.ui,
            fontSize: '22px',
            color: '#f3ead3',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        overlay.add([
            background,
            panel,
            title,
            subtitle,
            nodeText,
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
