import { Scene } from 'phaser';

import { isPortraitGameViewport } from '../../layout/gameViewport';
import questCatalogJson from '../../../../public/data/world/quests.json';
import { loadSharedNarrativeFacts } from '../../services/StoryHubSessionPersistence';
import { parseQuestCatalog, questJournalEntries, questStageStatusLabel, wrapQuestJournalText,
    type QuestJournalEntry } from '../../state/QuestJournal';
import { createSceneButton, createScenePanel, getSceneTextStyle } from './sceneTheme';

export const questCatalog = parseQuestCatalog(questCatalogJson);

export function savedQuestJournalEntries(): QuestJournalEntry[] {
    return questJournalEntries(questCatalog, loadSharedNarrativeFacts()?.questStages ?? {});
}

/** Map and hub use the same saved quest facts as StoryScene's in-scene journal. */
export class QuestJournalOverlay {
    private container?: Phaser.GameObjects.Container;
    private page = 0;

    constructor(private readonly scene: Scene) {}

    isOpen(): boolean { return Boolean(this.container?.active); }

    close(): void {
        this.container?.destroy();
        this.container = undefined;
    }

    open(): void {
        const entries = savedQuestJournalEntries();
        if (!entries.length) return;
        this.page = Math.min(this.page, entries.length - 1);
        this.render(entries);
    }

    private render(entries: QuestJournalEntry[]): void {
        this.close();
        const { width, height } = this.scene.scale;
        const portrait = isPortraitGameViewport(width, height);
        const panelWidth = portrait ? width - 32 : 680;
        const panelHeight = portrait ? Math.min(690, height - 180) : 690;
        const panelX = width / 2;
        const panelY = height / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelX - panelWidth / 2 + (portrait ? 32 : 52);
        const entry = entries[this.page]!;
        const container = this.scene.add.container(0, 0).setDepth(100);
        const backdrop = this.scene.add.rectangle(panelX, panelY, width, height, 0x000000, 0.72)
            .setInteractive({ useHandCursor: true });
        backdrop.on('pointerdown', (_pointer: unknown, _localX: unknown, _localY: unknown, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            this.close();
        });
        container.add(backdrop);
        container.add(createScenePanel(this.scene, { x: panelX, y: panelY, width: panelWidth, height: panelHeight }));
        const panelHitArea = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x000000, 0)
            .setInteractive();
        panelHitArea.on('pointerdown', (_pointer: unknown, _localX: unknown, _localY: unknown, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
        });
        container.add(panelHitArea);

        const heading = this.scene.add.text(contentX, panelTop + 28,
            `任务日志 · ${this.page + 1}/${entries.length}`,
            getSceneTextStyle('panelEyebrow', { fontSize: '23px' }));
        const title = this.scene.add.text(contentX, panelTop + 96,
            wrapQuestJournalText(entry.title, portrait ? 30 : 40),
            getSceneTextStyle('panelTitle', { fontSize: '28px', wordWrap: { width: panelWidth - (portrait ? 64 : 104) } }));
        const stage = this.scene.add.text(contentX, title.y + title.height + 24,
            wrapQuestJournalText(`${questStageStatusLabel(entry.status)} · ${entry.stageLabel}`, portrait ? 30 : 40),
            getSceneTextStyle('support', { fontSize: '23px', wordWrap: { width: panelWidth - (portrait ? 64 : 104) } }));
        const goal = this.scene.add.text(contentX, stage.y + stage.height + 42, '当前目标',
            getSceneTextStyle('panelEyebrow', { fontSize: '20px' }));
        const objective = this.scene.add.text(contentX, goal.y + goal.height + 14,
            wrapQuestJournalText(entry.objective, portrait ? 30 : 40),
            getSceneTextStyle('body', { fontSize: '23px', wordWrap: { width: panelWidth - (portrait ? 64 : 104) } }));
        container.add([heading, title, stage, goal, objective]);
        const close = createSceneButton(this.scene, { x: panelX + (portrait ? 140 : 240), y: panelTop + 48,
            width: portrait ? 120 : 140, height: 48, label: '关闭', variant: 'secondary', onClick: () => this.close() });
        container.add(close.objects);
        if (entries.length > 1) {
            const previous = createSceneButton(this.scene, { x: panelX - (portrait ? 105 : 150), y: panelTop + panelHeight - 55,
                width: portrait ? 170 : 220, height: 52, label: '上一项', variant: 'option',
                onClick: () => { this.page = (this.page - 1 + entries.length) % entries.length; this.render(entries); } });
            const next = createSceneButton(this.scene, { x: panelX + (portrait ? 105 : 150), y: panelTop + panelHeight - 55,
                width: portrait ? 170 : 220, height: 52, label: '下一项', variant: 'option',
                onClick: () => { this.page = (this.page + 1) % entries.length; this.render(entries); } });
            container.add([...previous.objects, ...next.objects]);
        }
        this.container = container;
    }
}
