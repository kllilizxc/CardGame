import { GameObjects, Scene } from 'phaser';

import { countOccupiedItemSlots, resolveItemSlotCapacity } from '../../state/ItemCapacity';
import {
    type ExpeditionArrivalCueSummary,
    type RunResolutionSummaryView,
    type RunResolutionSummaryViewOptions,
    createRunResolutionSummaryView,
    createRunSummary,
} from '../../scenes/expedition/entryFlowModel';
import type { RunResolutionSummary, RunSnapshot } from '../../types/expedition';
import { expeditionUiTheme } from '../common/expeditionUiTheme';
import { getRunPlayerHealth, MAX_RUN_PLAYER_HEALTH } from '../../state/RunHealth';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import { wrapQuestJournalText } from '../../state/QuestJournal';

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
        this.carriedItemsValue = this.createValueText(920, '携带道具：0').setFontSize(22);
        this.spiritStonesValue = this.createValueText(1280, '生命：100/100 · 灵石：0').setFontSize(20);

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

    public setInventoryOpenHandler(onOpen: () => void): void {
        this.carriedItemsValue.setInteractive({ useHandCursor: true });
        this.carriedItemsValue.on('pointerdown', onOpen);
        this.carriedItemsValue.on('pointerover', () => this.carriedItemsValue.setColor('#f6e2b1'));
        this.carriedItemsValue.on('pointerout', () => this.carriedItemsValue.setColor('#f3ead3'));
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
        this.currentNodeValue.setText(`当前节点：${currentNodeLabel}`);
        this.carriedDeckValue.setText(`携带卡牌：${carriedDeckCount}`);
        this.carriedItemsValue.setText(`携带道具：${carriedItemCount}${occupiedItemSlots !== undefined && itemSlotCapacity !== undefined ? ` · ${occupiedItemSlots}/${itemSlotCapacity}格（整理）` : ''}`);
        this.spiritStonesValue.setText(`生命：${playerHealth ?? MAX_RUN_PLAYER_HEALTH}/${MAX_RUN_PLAYER_HEALTH} · 灵石：${spiritStones}`);
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

    public showPostRunSummary(
        summary: RunResolutionSummary,
        onAcknowledge: () => void,
        options: RunResolutionSummaryViewOptions = {},
    ): void {
        this.hideArrivalCue();
        this.hidePostRunSummary();

        const { width, height } = this.scene.scale;
        const view = createRunResolutionSummaryView(summary, options);
        if (isPortraitGameViewport(width, height)) {
            this.showPortraitPostRunSummary(view, onAcknowledge);
            return;
        }
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

        const nodeText = this.scene.add.text(leftX, subtitle.y + 44, `终点节点：${view.finalNodeLabel ?? view.finalNodeId}`, {
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
            `卡牌\n${keptCards}\n\n道具\n${keptItems}\n\n灵石\n${view.keptSpiritStones}`,
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
            `卡牌\n${lostCards}\n\n道具\n${lostItems}\n\n灵石\n${view.lostSpiritStones}`,
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

    private showPortraitPostRunSummary(view: RunResolutionSummaryView, onAcknowledge: () => void): void {
        const { width, height } = this.scene.scale;
        let selectedTab: 'kept' | 'lost' = view.outcome === 'defeat' ? 'lost' : 'kept';
        let page = 0;
        const render = () => {
            this.summaryOverlay?.destroy();
            const overlay = this.scene.add.container(0, 0);
            const addButton = (x: number, y: number, buttonWidth: number, label: string,
                onClick: () => void, disabled = false, selected = false) => {
                const background = this.scene.add.rectangle(x, y, buttonWidth, 48,
                    selected ? expeditionUiTheme.colors.jade : expeditionUiTheme.colors.slate, 1);
                background.setStrokeStyle(1, expeditionUiTheme.colors.goldSoft, disabled ? 0.35 : 0.9);
                if (disabled) background.setAlpha(0.68);
                else background.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
                const text = this.scene.add.text(x, y, label, {
                    fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px',
                    color: '#f3ead3', fontStyle: 'bold',
                }).setOrigin(0.5);
                overlay.add([background, text]);
            };
            const background = this.scene.add.rectangle(width / 2, height / 2, width, height,
                expeditionUiTheme.colors.overlay, 0.88).setInteractive();
            const panel = this.scene.add.rectangle(width / 2, height / 2, width - 44, height - 100,
                expeditionUiTheme.colors.panelInner, 0.99);
            panel.setStrokeStyle(3, view.outcome === 'defeat'
                ? expeditionUiTheme.colors.emberBright : expeditionUiTheme.colors.jade, 0.95);
            const left = 46;
            const copyWidth = width - left * 2;
            const title = this.scene.add.text(left, 91, view.title, {
                fontFamily: expeditionUiTheme.fonts.display, fontSize: '34px',
                color: view.outcome === 'defeat' ? '#f3d0c3' : '#e6f3ea', fontStyle: 'bold',
            });
            const subtitle = this.scene.add.text(left, title.y + title.height + 16,
                wrapQuestJournalText(view.subtitle, 38), {
                    fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px', color: '#f3ead3',
                    wordWrap: { width: copyWidth }, lineSpacing: 5,
                });
            const node = this.scene.add.text(left, subtitle.y + subtitle.height + 15,
                `终点：${view.finalNodeLabel ?? view.finalNodeId}`, {
                    fontFamily: expeditionUiTheme.fonts.ui, fontSize: '17px', color: '#e8d5ab',
                    wordWrap: { width: copyWidth },
                });
            overlay.add([background, panel, title, subtitle, node]);

            addButton(135, 285, 168, '存入仓库', () => { selectedTab = 'kept'; page = 0; render(); },
                false, selectedTab === 'kept');
            addButton(width - 135, 285, 168, '遗失', () => { selectedTab = 'lost'; page = 0; render(); },
                false, selectedTab === 'lost');

            const cards = (selectedTab === 'kept' ? view.keptCards : view.lostCards).filter(line => line !== '无');
            const items = (selectedTab === 'kept' ? view.keptItems : view.lostItems).filter(line => line !== '无');
            const stones = selectedTab === 'kept' ? view.keptSpiritStones : view.lostSpiritStones;
            const rows = [
                ...cards.map(line => `卡牌 · ${line}`),
                ...items.map(line => `道具 · ${line}`),
                `灵石 · ${stones}`,
            ];
            const pageSize = 6;
            const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
            page = Math.min(page, pageCount - 1);
            const frame = this.scene.add.rectangle(width / 2, 542, width - 78, 420,
                expeditionUiTheme.colors.panel, 1);
            frame.setStrokeStyle(1, expeditionUiTheme.colors.goldSoft, 0.6);
            const totals = this.scene.add.text(left + 10, 352,
                `卡牌 ${cards.length} 种 · 道具 ${items.length} 种 · 灵石 ${stones}`, {
                    fontFamily: expeditionUiTheme.fonts.ui, fontSize: '17px', color: '#f6e2b1',
                    wordWrap: { width: copyWidth - 20 },
                });
            overlay.add([frame, totals]);
            rows.slice(page * pageSize, (page + 1) * pageSize).forEach((line, index) => {
                overlay.add(this.scene.add.text(left + 10, 395 + index * 52,
                    wrapQuestJournalText(line, 34), {
                        fontFamily: expeditionUiTheme.fonts.ui, fontSize: '18px', color: '#f3ead3',
                        wordWrap: { width: copyWidth - 20 }, lineSpacing: 3,
                    }));
            });
            overlay.add(this.scene.add.text(width / 2, 768, `${page + 1}/${pageCount} 页`, {
                fontFamily: expeditionUiTheme.fonts.ui, fontSize: '17px', color: '#f3ead3',
            }).setOrigin(0.5));
            addButton(136, 813, 142, '上一页', () => { page -= 1; render(); }, page === 0);
            addButton(width - 136, 813, 142, '下一页', () => { page += 1; render(); },
                page >= pageCount - 1);
            addButton(width / 2, 895, 310, '确认并返回入口', onAcknowledge, false, true);
            overlay.setDepth(1500);
            this.summaryOverlay = overlay;
        };
        render();
    }

    public hidePostRunSummary(): void {
        this.summaryOverlay?.destroy();
        this.summaryOverlay = undefined;
    }
}
