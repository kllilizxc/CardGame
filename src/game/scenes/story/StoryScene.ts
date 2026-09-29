import { WenxinStoryStage } from '../../art/wenxin/WenxinStoryStage';
import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { isPortraitGameViewport } from '../../layout/gameViewport';
import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';
import unitCardsJson from '../../../../public/data/cards/units.json';
import npcCatalogJson from '../../../../public/data/world/npcs.json';
import itemCatalogJson from '../../../../public/data/world/items.artifacts.json';
import { CONTENT_CATALOG_CACHE_KEY, CONTENT_CATALOG_PUBLIC_PATH, createContentCatalogResolver } from '../../content/contentCatalog';
import { attachStoryItemCounts, planStoryRewards, settleStoryRewards } from '../../services/StoryCardGrantPersistence';
import { InventoryCapacityError } from '../../state/ItemCapacity';
import { questJournalEntries, questStageStatusLabel, wrapQuestJournalText } from '../../state/QuestJournal';
import { QuestJournalOverlay, questCatalog } from '../shared/questJournalOverlay';
import { indexItemActionPolicies } from '../../state/ItemActionRules';
import { loadPersistentStash } from '../../services/RunPersistence';
import { createPersistentStashFromWorldStateSeed, type PersistentStashSeedSources } from '../../state/GameWorldStateSeed';
import {
    applySharedNarrativeFacts,
    clearStoryRuntimeSession,
    loadSharedNarrativeFacts,
    saveSharedNarrativeFacts,
    saveStoryRuntimeSession,
    saveStoryRuntimeSessionWithSharedFacts,
} from '../../services/StoryHubSessionPersistence';
import type { StoryState } from '../../types/story';
import { applyStoryEffects, attachStoryActorAbilities, attachStoryEquipmentModifiers, createInitialStoryState } from '../../state/StoryState';
import {
    createStoryChoiceTransition,
    createStoryFlowViewModel,
    indexStoryGraph,
    type StoryChoiceView,
    type StoryFlowViewModel,
    type StoryGraphIndex,
} from './storyFlowViewModel';
import type { StoryGraph } from './storyFlow';
import { validateStoryGraphResource } from './storyContentAdapter';
import { paginateReadableCopy } from '../shared/readableCopyPages';
import {
    applyStoryBattleResultToRuntime,
    cloneStoryState,
    createStorySceneTransitionIntent,
} from './storyBattleRoundTrip';
import {
    assertStorySceneCatalogResourceMatchesLoadedGraph,
    normalizeStorySceneLaunchData,
    resolveStorySceneCatalogResource,
    type NormalizedStorySceneLaunchData,
    type ResolvedStorySceneCatalogResource,
    type StorySceneLaunchData,
} from './storySceneLaunch';
import {
    createSceneBackdrop,
    createSceneButton,
    createScenePanel,
    createStatusLine,
    getSceneTextStyle,
    sceneTheme,
} from '../shared/sceneTheme';

const storySeedSources = { worldState: initialWorldState, starterDeck: starterDeckJson } as unknown as PersistentStashSeedSources;
const questItems = itemCatalogJson as typeof itemCatalogJson & { materials?: Array<{ id: string; name: string }>; quests?: Array<{ id: string; name: string }>; questItems?: Array<{ id: string; name: string }> };
const storyItems = [
    ...itemCatalogJson.artifacts.map(item => ({ ...item, itemType: 'artifact' as const })),
    ...itemCatalogJson.tools.map(item => ({ ...item, itemType: 'tool' as const })),
    ...itemCatalogJson.consumables.map(item => ({ ...item, itemType: 'consumable' as const })),
    ...(questItems.materials ?? []).map(item => ({ ...item, itemType: 'material' as const })),
    ...(questItems.quests ?? []).map(item => ({ ...item, itemType: 'quest' as const })),
    ...(questItems.questItems ?? []).map(item => ({ ...item, itemType: 'quest' as const })),
];
const currentStoryStash = () => loadPersistentStash() ?? createPersistentStashFromWorldStateSeed(storySeedSources);
const storyItemPolicies = indexItemActionPolicies(itemCatalogJson);
const attachStoryInventoryContext = (state: StoryState): StoryState => {
    const stash = currentStoryStash();
    return attachStoryEquipmentModifiers(attachStoryItemCounts(state, stash), stash, storyItemPolicies);
};

export class StoryScene extends Scene {
    private wenxinStage?: WenxinStoryStage;
    private storyGraph!: StoryGraph;
    private storyGraphIndex?: StoryGraphIndex;
    private storyState!: StoryState;
    private selectedChoiceIds: string[] = [];
    private storyContainer?: Phaser.GameObjects.Container;
    private questContainer?: Phaser.GameObjects.Container;
    private questOverlay?: QuestJournalOverlay;
    private questPage = 0;
    private statusText?: Phaser.GameObjects.Text;
    private storyTitleText?: Phaser.GameObjects.Text;
    private storyBackground?: Phaser.GameObjects.Image;
    private storyBackgroundShade?: Phaser.GameObjects.Rectangle;
    private readonly loadingBackgrounds = new Set<string>();
    private choicePage = 0;
    private choicePageNodeId?: string;
    private launchData: NormalizedStorySceneLaunchData = normalizeStorySceneLaunchData();
    private storyResource?: ResolvedStorySceneCatalogResource;

    constructor() {
        super('StoryScene');
    }

    init(data?: StorySceneLaunchData): void {
        this.launchData = normalizeStorySceneLaunchData(data);
    }

    preload(): void {
        const storyResource = resolveStorySceneCatalogResource(
            this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
            this.launchData,
        );
        this.storyResource = storyResource;

        this.load.json(this.launchData.storyGraphCacheKey, storyResource.publicPath);
    }

    create(): void {
        this.storyBackground = undefined;
        this.storyBackgroundShade = undefined;
        this.loadingBackgrounds.clear();
        this.choicePage = 0;
        this.choicePageNodeId = undefined;
        this.questPage = 0;
        this.questOverlay = new QuestJournalOverlay(this);
        this.storyGraph = this.readValidatedStoryGraph();
        this.storyGraphIndex = indexStoryGraph(this.storyGraph);
        assertStorySceneCatalogResourceMatchesLoadedGraph(this.storyGraph, this.getResolvedStoryResource());
        const initialStatusText = this.applyLaunchData();
        const persistedStatusText = this.persistStorySession(initialStatusText);

        this.renderSceneFrame();
        this.renderCurrentNode(persistedStatusText);

        EventBus.emit('current-scene-ready', this);
    }

    private readValidatedStoryGraph(): StoryGraph {
        const rawStoryGraph = this.cache.json.get(this.launchData.storyGraphCacheKey);
        const storyResource = this.getResolvedStoryResource();

        if (rawStoryGraph === undefined) {
            throw new Error(
                `StoryScene failed to load catalog resource ${storyResource.resourceId} from public/${storyResource.publicPath} for launch storyGraphFile ${this.launchData.storyGraphFile}: JSON cache key ${this.launchData.storyGraphCacheKey} is missing after preload.`,
            );
        }

        try {
            const graph = validateStoryGraphResource(rawStoryGraph);
            const knownSpeakers = new Set(npcCatalogJson.npcs.map(npc => npc.id));
            for (const line of graph.nodes.flatMap(node => node.dialogues ?? [])) {
                if (line.speakerId !== 'player' && !knownSpeakers.has(line.speakerId)) {
                    throw new Error(`Story dialogue ${line.id} references unknown speaker ${line.speakerId}.`);
                }
            }
            return graph;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(
                `StoryScene failed to validate catalog resource ${storyResource.resourceId} from public/${storyResource.publicPath}: ${message}`,
            );
        }
    }

    private getResolvedStoryResource(): ResolvedStorySceneCatalogResource {
        if (!this.storyResource) {
            this.storyResource = resolveStorySceneCatalogResource(
                this.cache.json.get(CONTENT_CATALOG_CACHE_KEY),
                this.launchData,
            );
        }

        return this.storyResource;
    }

    private applyLaunchData(): string {
        if (this.launchData.storyBattleResult) {
            const resume = applyStoryBattleResultToRuntime(this.storyGraph, this.launchData.storyBattleResult);

            this.storyState = attachStoryInventoryContext(
                attachStoryActorAbilities(resume.storyState, npcCatalogJson.npcs as { id: string; abilities?: Record<string, number> }[]),
            );
            this.selectedChoiceIds = resume.selectedChoiceIds;

            return resume.statusText;
        }

        const shared = this.storyGraph.shareFactsAcrossStories ? loadSharedNarrativeFacts() : null;
        if (this.launchData.storyState) {
            this.storyState = applySharedNarrativeFacts(cloneStoryState(this.launchData.storyState), shared);
        } else {
            const seeded = attachStoryInventoryContext(applySharedNarrativeFacts(createInitialStoryState(this.storyGraph.initialState), shared));
            const entry = this.storyGraph.nodes.find(node => node.id === this.storyGraph.entryNodeId)!;
            this.storyState = applyStoryEffects(seeded, entry.onEnter).state;
        }
        this.storyState = attachStoryActorAbilities(this.storyState, npcCatalogJson.npcs as { id: string; abilities?: Record<string, number> }[]);
        this.storyState = attachStoryInventoryContext(this.storyState);
        this.selectedChoiceIds = [...(this.launchData.selectedChoiceIds ?? [])];

        return this.launchData.statusText ?? '请选择你的行动。';
    }

    private renderSceneFrame(): void {
        const { width, height } = this.scale;
        const portrait = isPortraitGameViewport(width, height);

        this.cameras.main.setBackgroundColor(sceneTheme.colors.night);
        for (const layer of createSceneBackdrop(this)) {
            (layer as Phaser.GameObjects.GameObject & { setDepth(depth: number): unknown }).setDepth(-20);
        }

        this.wenxinStage = new WenxinStoryStage(this);
        this.storyTitleText = this.add.text(width / 2, portrait ? 112 : 76, this.storyGraph.title ?? '主线故事', getSceneTextStyle('sceneTitle', {
            fontSize: portrait ? '36px' : '48px',
            align: 'center',
            wordWrap: { width: portrait ? width - 36 : width - 400 },
        })).setOrigin(0.5);

        this.add.text(
            width / 2,
            portrait ? 166 : 132,
            '顺着剧情选择前行；若引出战斗，结果会带回此处继续。',
            getSceneTextStyle('sceneSubtitle', {
                stroke: '#14201c', strokeThickness: 5,
                ...(portrait ? { fontSize: '18px', align: 'center', wordWrap: { width: width - 54 } } : {}),
            }),
        ).setOrigin(0.5);

        if (this.launchData.hubSession) {
            const back = createSceneButton(this, { x: portrait ? 103 : 185, y: portrait ? 62 : 82,
                width: portrait ? 166 : 230, height: 52,
                label: '返回据点', variant: 'secondary', onClick: () => this.returnToHub() });
            this.add.container(0, 0, back.objects);
        }

        const status = createStatusLine(this, {
            x: width / 2,
            y: height - (portrait ? 54 : 72),
            width: width - (portrait ? 54 : 260),
            text: '',
            align: 'center',
        });
        this.statusText = status.text;
    }

    private renderCurrentNode(statusText: string): void {
        this.storyState = attachStoryInventoryContext(this.storyState);
        const viewModel = createStoryFlowViewModel(this.storyGraph, {
            storyState: this.storyState,
            selectedChoiceIds: this.selectedChoiceIds,
        }, this.storyGraphIndex);

        this.storyState = viewModel.storyState;
        this.selectedChoiceIds = viewModel.selectedChoiceIds;
        this.renderStoryNode(viewModel, statusText);
    }

    private renderStoryNode(view: StoryFlowViewModel, statusText: string): void {
        this.storyContainer?.destroy();
        if (this.choicePageNodeId !== view.currentNodeId) {
            this.choicePage = 0;
            this.choicePageNodeId = view.currentNodeId;
        }
        this.updateStoryBackground(view.currentNode.backgroundAsset);
        this.storyTitleText?.setText(view.currentNode.chapter ?? this.storyGraph.title ?? '主线故事');
        this.statusText?.setText(this.createRuntimeStatusText(statusText, view));

        const { width, height } = this.scale;
        const portrait = isPortraitGameViewport(width, height);
        const panelWidth = portrait ? width - 32 : Math.min(1500, width - 220);
        const panelHeight = portrait ? 480 : 240;
        const panelX = width / 2;
        const panelY = portrait ? 430 : 830;
        const contentX = panelX - panelWidth / 2 + (portrait ? 26 : 60);
        const container = this.add.container(0, 0);

        container.add(createScenePanel(this, {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
        }));

        const dialogues = view.currentNode.dialogues ?? [];
        const dialogueStart = Math.max(0, dialogues.findIndex(line => line.id === this.storyState.currentDialogueId));
        const pageLines: typeof dialogues = [];
        let nextDialogueIndex = dialogueStart;
        let pageCharacters = 0;
        while (nextDialogueIndex < dialogues.length && (pageLines.length === 0 || pageLines.length < 1 && pageCharacters + dialogues[nextDialogueIndex]!.text.length <= 320)) {
            const line = dialogues[nextDialogueIndex]!;
            pageLines.push(line);
            pageCharacters += line.text.length;
            nextDialogueIndex += 1;
        }
        const hasMoreDialogues = nextDialogueIndex < dialogues.length;
        const baseMetadataLine = (view.currentNode.tags.length > 0
            ? `${view.currentNode.subtitle} · ${view.currentNode.tags.join(' / ')}`
            : view.currentNode.subtitle) + (dialogues.length ? ` · 对话 ${dialogueStart + 1}–${nextDialogueIndex}/${dialogues.length}` : '');
        const { summary, detail } = view.currentNode;
        const storyCopy = detail === summary || detail.startsWith(`${summary}\n`)
            ? detail
            : `${summary}\n${detail}`;
        const displayedCopy = dialogues.length
            ? `${summary}\n\n${pageLines.map(line => `${npcCatalogJson.npcs.find(npc => npc.id === line.speakerId)?.name ?? line.speakerName}${line.emotion ? `（${line.emotion}）` : ''}：${line.text}`).join('\n\n')}`
            : storyCopy;
        const copyPages = paginateReadableCopy(displayedCopy, portrait ? 150 : 190);
        const readingPage = Math.min(this.storyState.currentReadingPage ?? 0, copyPages.length - 1);
        const hasMoreCopy = readingPage < copyPages.length - 1;
        const visibleCopy = copyPages[readingPage]!;
        const metadataLine = `${baseMetadataLine}${copyPages.length > 1
            ? ` · 阅读 ${readingPage + 1}/${copyPages.length}` : ''}`;
        const metadataReservedWidth = portrait ? 186 : readingPage > 0 ? 300 : 120;

        const speaker = npcCatalogJson.npcs.find(npc => npc.id === pageLines[0]?.speakerId) as
            | { id: string; portraitAsset?: string }
            | undefined;
        this.wenxinStage?.setNode(`${view.currentNode.title} ${visibleCopy}`, pageLines[0]?.speakerId, pageLines[0]?.emotion, speaker?.portraitAsset);
        const metadata = this.add.text(contentX, panelY - panelHeight / 2 + 25, metadataLine, getSceneTextStyle('panelEyebrow', {
            fontSize: portrait ? '17px' : '18px',
            wordWrap: { width: panelWidth - metadataReservedWidth },
        }));
        const title = this.add.text(contentX, metadata.y + metadata.height + 9, view.currentNode.title, getSceneTextStyle('panelTitle', {
            fontSize: portrait ? '27px' : '28px',
            wordWrap: { width: panelWidth - (portrait ? 52 : 120) },
        }));
        const body = this.add.text(contentX, title.y + title.height + 12, visibleCopy, getSceneTextStyle('body', {
            fontSize: portrait ? '21px' : '20px',
            wordWrap: { width: panelWidth - (portrait ? 52 : 120) },
        }));

        const availableBodyHeight = panelY + panelHeight / 2 - body.y - 24;
        if (body.height > availableBodyHeight) {
            body.setFontSize(Math.max(portrait ? 18 : 16,
                (portrait ? 21 : 20) * availableBodyHeight / body.height));
        }
        container.add([metadata, title, body]);
        if (readingPage > 0) {
            container.add(this.createButton({ x: portrait ? width - 100 : panelX + panelWidth / 2 - 125,
                y: panelY - panelHeight / 2 + 35,
                width: portrait ? 142 : 190, height: 42, label: '上一段', onClick: () => {
                    this.storyState = { ...this.storyState, currentReadingPage: readingPage - 1 };
                    const status = this.persistStorySession('已返回上一段。');
                    this.renderCurrentNode(status);
                } }));
        }

        const visibleChoices = view.choices.filter((choice) => choice.visible);

        if (hasMoreCopy) {
            container.add(this.createButton({ x: panelX, y: height - (portrait ? 150 : 610),
                width: portrait ? width - 100 : 300, height: 60, label: '继续阅读', onClick: () => {
                    this.storyState = { ...this.storyState, currentReadingPage: readingPage + 1 };
                    const status = this.persistStorySession(`已读至第 ${readingPage + 2} 段。`);
                    this.renderCurrentNode(status);
                } }));
        } else if (hasMoreDialogues) {
            container.add(this.createButton({
                x: panelX,
                y: height - (portrait ? 150 : 610),
                width: portrait ? width - 100 : 300,
                height: 60,
                label: '继续对话',
                onClick: () => {
                    this.storyState = { ...this.storyState,
                        currentDialogueId: dialogues[nextDialogueIndex]!.id, currentReadingPage: 0 };
                    const statusText = this.persistStorySession(`已读至第 ${nextDialogueIndex + 1} 条对白。`);
                    this.renderCurrentNode(statusText);
                },
            }));
        } else if (visibleChoices.length === 0) {
            const terminal = this.add.text(panelX, height - (portrait ? 238 : 700), '这段行程暂告一段落，眼下已抵达当前故事终点。', getSceneTextStyle('support', {
                fontSize: '20px',
                color: '#d9c6a2',
                align: 'center',
                wordWrap: { width: portrait ? width - 80 : width - 400 },
            })).setOrigin(0.5);
            const restartButton = this.createButton({
                x: panelX,
                y: height - (portrait ? 150 : 610),
                width: portrait ? width - 100 : 300,
                height: 60,
                label: '重新开始故事',
                onClick: () => {
                    const initial = createInitialStoryState(this.storyGraph.initialState);
                    this.storyState = this.storyGraph.shareFactsAcrossStories
                        ? applySharedNarrativeFacts(initial, loadSharedNarrativeFacts())
                        : initial;
                    this.storyState = attachStoryActorAbilities(this.storyState, npcCatalogJson.npcs as { id: string; abilities?: Record<string, number> }[]);
                    this.storyState = attachStoryInventoryContext(this.storyState);
                    this.storyState = applyStoryEffects(this.storyState,
                        this.storyGraph.nodes.find(node => node.id === this.storyGraph.entryNodeId)?.onEnter).state;
                    this.selectedChoiceIds = [];
                    this.choicePage = 0;
                    this.resetStorySession();
                    const statusText = this.persistStorySession('故事已重新开始。');
                    this.renderCurrentNode(statusText);
                },
            });

            container.add([terminal, ...restartButton]);
        } else {
            const pageSize = portrait ? 1 : 2;
            const pageCount = Math.ceil(visibleChoices.length / pageSize);
            this.choicePage = Math.min(this.choicePage, pageCount - 1);
            if (pageCount > 1) {
                const first = this.choicePage * pageSize + 1;
                const last = Math.min(first + pageSize - 1, visibleChoices.length);
                const paginationY = height - (portrait ? 342 : 780);
                const indicator = this.add.text(panelX, paginationY, `选项 ${first}–${last} / ${visibleChoices.length}`, getSceneTextStyle('support', {
                    fontSize: portrait ? '16px' : '18px', align: 'center',
                })).setOrigin(0.5);
                container.add(indicator);
                if (this.choicePage > 0) container.add(this.createButton({
                    x: panelX - (portrait ? 132 : 250), y: paginationY,
                    width: portrait ? 145 : 180, height: 42, label: '上一组',
                    onClick: () => { this.choicePage -= 1; this.renderCurrentNode(statusText); },
                }));
                if (this.choicePage < pageCount - 1) container.add(this.createButton({
                    x: panelX + (portrait ? 132 : 250), y: paginationY,
                    width: portrait ? 145 : 180, height: 42, label: '下一组',
                    onClick: () => { this.choicePage += 1; this.renderCurrentNode(statusText); },
                }));
            }
            visibleChoices.slice(this.choicePage * pageSize, (this.choicePage + 1) * pageSize).forEach((choice, index) => {
                container.add(this.createChoiceButton(choice, index));
            });
        }

        this.storyContainer = container;
        this.renderQuestJournal();
    }

    private questExpanded = false;
    private renderQuestJournal(): void {
        this.questContainer?.destroy();
        const entries = questJournalEntries(questCatalog, this.storyState.questStages);
        if (!entries.length) return;
        this.questPage = Math.min(this.questPage, entries.length - 1);
        const entry = entries[this.questPage]!;
        const { width } = this.scale;
        if (isPortraitGameViewport(this.scale.width, this.scale.height)) {
            const toggle = createSceneButton(this, { x: width - 102, y: 62,
                width: 166, height: 52, label: '任务日志', variant: 'secondary',
                onClick: () => this.questOverlay?.open() });
            this.questContainer = this.add.container(0, 0, toggle.objects).setDepth(20);
            return;
        }
        if (!this.questExpanded) {
            const toggle = createSceneButton(this, { x: width - 165, y: 190, width: 240, height: 52,
                label: '任务日志', variant: 'secondary', onClick: () => { this.questExpanded = true; this.renderQuestJournal(); } });
            this.questContainer = this.add.container(0, 0, toggle.objects).setDepth(20);
            return;
        }
        const panelWidth = 250;
        const panelX = width - 150;
        const top = 165;
        const left = panelX - panelWidth / 2 + 20;
        const container = this.add.container(0, 0);
        const heading = this.add.text(left, top + 22, `任务日志 · ${this.questPage + 1}/${entries.length}`,
            getSceneTextStyle('panelEyebrow', { fontSize: '19px' }));
        const title = this.add.text(left, top + 66, wrapQuestJournalText(entry.title),
            getSceneTextStyle('panelTitle', { fontSize: '25px', wordWrap: { width: panelWidth - 40 } }));
        const stage = this.add.text(left, title.y + title.height + 14, wrapQuestJournalText(`${questStageStatusLabel(entry.status)} · ${entry.stageLabel}`),
            getSceneTextStyle('support', { fontSize: '19px', wordWrap: { width: panelWidth - 40 } }));
        const objective = this.add.text(left, stage.y + stage.height + 22, wrapQuestJournalText(entry.objective),
            getSceneTextStyle('body', { fontSize: '19px', wordWrap: { width: panelWidth - 40 } }));
        const bottom = Math.max(top + 510, objective.y + objective.height + (entries.length > 1 ? 100 : 40));
        container.add(createScenePanel(this, { x: panelX, y: (top + bottom) / 2, width: panelWidth, height: bottom - top }));
        container.add([heading, title, stage, objective]);
        if (entries.length > 1) {
            const previous = createSceneButton(this, { x: panelX - 60, y: bottom - 34, width: 105, height: 42,
                label: '上一项', onClick: () => { this.questPage = (this.questPage - 1 + entries.length) % entries.length; this.renderQuestJournal(); },
                variant: 'option' });
            const next = createSceneButton(this, { x: panelX + 60, y: bottom - 34, width: 105, height: 42,
                label: '下一项', onClick: () => { this.questPage = (this.questPage + 1) % entries.length; this.renderQuestJournal(); },
                variant: 'option' });
            container.add([...previous.objects, ...next.objects]);
        }
        const close = createSceneButton(this, { x: panelX, y: top - 32, width: 220, height: 44,
            label: '收起日志', variant: 'secondary', onClick: () => { this.questExpanded = false; this.renderQuestJournal(); } });
        container.add(close.objects).setDepth(20);
        this.questContainer = container;
    }

    private updateStoryBackground(path?: string): void {
        if (!path) {
            this.storyBackground?.destroy();
            this.storyBackgroundShade?.destroy();
            this.storyBackground = undefined;
            this.storyBackgroundShade = undefined;
            return;
        }
        const key = `story-background:${path}`;
        if (this.storyBackground?.texture.key !== key) {
            this.storyBackground?.destroy();
            this.storyBackgroundShade?.destroy();
            this.storyBackground = undefined;
            this.storyBackgroundShade = undefined;
        }
        if (!this.textures.exists(key)) {
            if (!this.loadingBackgrounds.has(key)) {
                this.loadingBackgrounds.add(key);
                this.load.image(key, `/${path}`);
                this.load.once(`filecomplete-image-${key}`, () => {
                    this.loadingBackgrounds.delete(key);
                    if (this.storyGraph.nodes.find(node => node.id === this.storyState.currentNodeId)?.backgroundAsset === path) {
                        this.updateStoryBackground(path);
                    }
                });
                this.load.start();
            }
            return;
        }
        if (this.storyBackground?.active && this.storyBackground.texture.key === key) return;
        this.storyBackground?.destroy();
        this.storyBackgroundShade?.destroy();
        const { width, height } = this.scale;
        const texture = this.textures.get(key).getSourceImage();
        const scale = Math.max(width / texture.width, height / texture.height);
        this.storyBackground = this.add.image(width / 2, height / 2, key).setScale(scale).setDepth(-18);
        this.storyBackgroundShade = this.add.rectangle(width / 2, height / 2, width, height, 0x0d1320, 0.22).setDepth(-17);
    }

    private createChoiceButton(choice: StoryChoiceView, index: number): Phaser.GameObjects.GameObject[] {
        const { width, height } = this.scale;
        const portrait = isPortraitGameViewport(width, height);
        const buttonWidth = portrait ? width - 52 : Math.min(730, width - 360);
        const buttonHeight = portrait ? 120 : 108;
        const x = width / 2;
        const y = portrait ? height - 205 + index * 132 : height - 670 + index * 140;
        const variant = !choice.selectable ? 'disabled' : choice.recommended ? 'primary' : 'option';

        return createSceneButton(this, {
            x,
            y,
            width: buttonWidth,
            height: buttonHeight,
            label: choice.text,
            description: this.createChoiceDescription(choice),
            onClick: () => this.handleChoice(choice.id),
            variant,
            align: 'left',
        }).objects;
    }

    private createChoiceDescription(choice: StoryChoiceView): string {
        const description = choice.description && choice.description !== choice.text ? `${choice.description}｜` : '';

        if (!choice.selectable) {
            let reason = choice.disabledReason ?? '当前不可选择';
            for (const item of storyItems) reason = reason.split(item.id).join(item.name);
            for (const npc of npcCatalogJson.npcs) reason = reason.split(npc.id).join(npc.name);
            reason = reason.replace(/player 已知道 [A-Za-z0-9._:-]+/gu, '主角需要先掌握相关线索')
                .replace(/player 尚不知道 [A-Za-z0-9._:-]+/gu, '主角需要避开相关线索');
            return `${description}${reason}`;
        }

        return `${description}效果：${choice.effectSummary}`;
    }

    private createButton(config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        onClick: () => void;
    }): Phaser.GameObjects.GameObject[] {
        return createSceneButton(this, {
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            label: config.label,
            onClick: config.onClick,
            variant: 'secondary',
        }).objects;
    }

    private handleChoice(choiceId: string): void {
        this.storyState = attachStoryInventoryContext(this.storyState);
        const currentView = createStoryFlowViewModel(this.storyGraph, {
            storyState: this.storyState,
            selectedChoiceIds: this.selectedChoiceIds,
        }, this.storyGraphIndex);
        let result: ReturnType<typeof createStoryChoiceTransition>;
        try {
            result = createStoryChoiceTransition(currentView, choiceId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.startsWith('Not enough story item: ')) throw error;
            const itemId = message.slice('Not enough story item: '.length);
            this.renderCurrentNode(`道具不足：${storyItems.find(item => item.id === itemId)?.name ?? itemId}。`);
            return;
        }

        if (result.status === 'blocked') {
            this.renderCurrentNode(result.reason);
            return;
        }

        try {
            planStoryRewards(
                currentStoryStash(),
                result.nextStoryState.cardGrants ?? [],
                result.nextStoryState.itemTransactions ?? [],
            );
        } catch (error) {
            if (!(error instanceof InventoryCapacityError)) throw error;
            this.renderCurrentNode(`背包已满（${error.occupied}/${error.capacity}），暂无法获得道具。`);
            return;
        }

        this.storyState = result.nextStoryState;
        this.selectedChoiceIds = result.nextSelectedChoiceIds;

        const selectedChoice = currentView.choices.find((choice) => choice.id === choiceId);
        const intent = createStorySceneTransitionIntent(
            result,
            selectedChoice?.text ?? choiceId,
            this.launchData.storyGraphFile,
            this.launchData.hubSession,
            this.launchData.storyResourceId,
        );

        if (intent.kind === 'startBattleScene') {
            this.statusText?.setText(intent.statusText);
            this.scene.start(intent.sceneKey, intent.payload);
            return;
        }

        const statusText = this.persistStorySession(intent.statusText);
        this.renderCurrentNode(statusText);
    }

    private persistStorySession(statusText: string): string {
        if ((this.storyState.cardGrants?.length || this.storyState.itemTransactions?.length) && !this.storyGraph.shareFactsAcrossStories) {
            throw new Error('Story inventory changes require shared narrative facts.');
        }
        const stash = currentStoryStash();
        planStoryRewards(stash, this.storyState.cardGrants ?? [], this.storyState.itemTransactions ?? []);
        const claimed = new Set(stash.claimedStoryGrantIds ?? []);
        const settledItems = new Set(stash.settledStoryItemTransactionIds ?? []);
        const pendingCards = this.storyState.cardGrants?.filter(grant => !claimed.has(grant.grantId)) ?? [];
        const pendingItems = this.storyState.itemTransactions?.filter(item => !settledItems.has(item.transactionId)) ?? [];
        const settleRewards = () => {
            if (this.storyState.cardGrants?.length || this.storyState.itemTransactions?.length) {
                settleStoryRewards(this.storyState.cardGrants ?? [], this.storyState.itemTransactions ?? [], storySeedSources);
            }
        };
        const completedStatus = () => [statusText,
            ...(pendingCards.length ? [`获得卡牌：${pendingCards.map(grant => `${unitCardsJson.units.find(card => card.id === grant.cardId)?.name ?? grant.cardId} ×${grant.count}`).join('、')}，已收入牌库。`] : []),
            ...pendingItems.map(item => `${item.countDelta > 0 ? '获得' : '消耗'}道具：${storyItems.find(definition => definition.id === item.itemId)?.name ?? item.itemId} ×${Math.abs(item.countDelta)}。`),
        ].join('｜');
        if (!this.launchData.hubSession) {
            if (this.storyGraph.shareFactsAcrossStories) {
                saveSharedNarrativeFacts(this.storyState);
                settleRewards();
            }
            return completedStatus();
        }

        const snapshot = {
            ...this.launchData.hubSession,
            storyState: cloneStoryState(this.storyState),
            selectedChoiceIds: [...this.selectedChoiceIds],
            statusText,
            updatedAt: new Date().toISOString(),
        };
        if (this.storyGraph.shareFactsAcrossStories) {
            saveStoryRuntimeSessionWithSharedFacts(snapshot);
            settleRewards();
        }
        else saveStoryRuntimeSession(snapshot);
        return completedStatus();
    }

    private resetStorySession(): void {
        if (!this.launchData.hubSession) {
            return;
        }

        clearStoryRuntimeSession(this.launchData.hubSession);
    }

    private returnToHub(): void {
        const hubId = this.launchData.hubSession?.hubId;
        if (!hubId) return;
        const hubResource = createContentCatalogResolver(this.cache.json.get(CONTENT_CATALOG_CACHE_KEY), {
            context: 'StoryScene', sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        }).resolveJsonResource({ resourceId: hubId, expectedKind: 'hub' });
        this.scene.start('HubScene', { hubId, hubResourceId: hubId, hubFile: hubResource.publicPath,
            statusText: '已返回据点；再次进入会继续当前剧情。' });
    }

    private createRuntimeStatusText(statusText: string, view: StoryFlowViewModel): string {
        const place = [view.currentNode.location, view.currentNode.sublocation].filter(Boolean).join(' · ');
        const parts = [statusText, ...(place ? [`位置：${place}`] : [])];

        if (view.warnings.length > 0) {
            parts.push(...view.warnings);
        }

        return parts.join(' ｜ ');
    }
}
