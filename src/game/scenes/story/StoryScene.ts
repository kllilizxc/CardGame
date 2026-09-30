import { WenxinStoryStage } from '../../art/wenxin/WenxinStoryStage';
import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { INK, PX } from '../../art/palette';
import { addIcon } from '../../art/icons';
import { pixelateImage, snap } from '../../art/pix';
import { addBackdrop, addMotes, type BackdropKind, type PBackdrop, type SkyMood } from '../../art/scenery';
import { PTooltip, clip, panel, pbutton, piconButton, ptext, ptoast } from '../../art/kit';
import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';
import unitCardsJson from '../../../../public/data/cards/units.json';
import npcCatalogJson from '../../../../public/data/world/npcs.json';
import itemCatalogJson from '../../../../public/data/world/items.artifacts.json';
import { CONTENT_CATALOG_CACHE_KEY, CONTENT_CATALOG_PUBLIC_PATH, createContentCatalogResolver } from '../../content/contentCatalog';
import { attachStoryItemCounts, planStoryRewards, settleStoryRewards } from '../../services/StoryCardGrantPersistence';
import { InventoryCapacityError } from '../../state/ItemCapacity';
import { questJournalEntries } from '../../state/QuestJournal';
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
    private questOverlay?: QuestJournalOverlay;
    private storyTitleText?: Phaser.GameObjects.Text;
    private placeText?: Phaser.GameObjects.Text;
    private storyBackground?: Phaser.GameObjects.Image;
    private storyBackgroundShade?: Phaser.GameObjects.Rectangle;
    private backdrop?: PBackdrop;
    private backdropKind?: string;
    private hudContainer?: Phaser.GameObjects.Container;
    private tooltip?: PTooltip;
    private lastToast = '';
    private typing?: Phaser.Time.TimerEvent;
    private advance?: () => void;
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

    private static readonly BOX_H = PX * 84;

    private renderSceneFrame(): void {
        const { width, height } = this.scale;
        this.cameras.main.setBackgroundColor(INK.ink);
        this.backdrop = undefined;
        this.backdropKind = undefined;
        this.lastToast = '';
        this.tooltip = new PTooltip(this, 560, 9000);

        const boxTop = height - StoryScene.BOX_H - PX * 8;
        this.wenxinStage = new WenxinStoryStage(this, boxTop + PX * 10);

        // chapter plate (top-left) + place line
        this.storyTitleText = ptext(this, width / 2, PX * 8, this.storyGraph.title ?? '主线故事', { size: 2, color: INK.paper, fx: 'outline', origin: [0.5, 0] }).setDepth(40);
        this.placeText = ptext(this, width / 2, PX * 36, '', { color: INK.bone, fx: 'outline', origin: [0.5, 0] }).setDepth(40);

        const hud = this.add.container(0, 0).setDepth(40);
        let x = width - PX * 16;
        if (this.launchData.hubSession) {
            hud.add(piconButton(this, x, PX * 16, 'back', () => this.returnToHub(), 'slate'));
            x -= PX * 28;
        }
        this.hudContainer = hud;
        (this.hudContainer as Phaser.GameObjects.Container & { nextX?: number }).nextX = x;

        this.input.keyboard?.on('keydown-SPACE', () => this.advance?.());
        this.input.keyboard?.on('keydown-ENTER', () => this.advance?.());
    }

    /** Pick a painted backdrop from the node's place words when no background art is given. */
    private applyBackdropFor(view: StoryFlowViewModel): void {
        const words = [view.currentNode.location, view.currentNode.sublocation, view.currentNode.chapter, view.currentNode.title].filter(Boolean).join(' ');
        let kind: BackdropKind = 'peaks';
        let mood: SkyMood = 'dusk';
        if (/雾|林|药/.test(words)) { kind = 'forest'; mood = 'dawn'; }
        else if (/洞|窟|矿/.test(words)) { kind = 'cave'; mood = 'night'; }
        else if (/殿|堂|屋|室|铺|茶/.test(words)) { kind = 'hall'; mood = 'night'; }
        else if (/夜|月/.test(words)) { kind = 'peaks'; mood = 'night'; }
        const id = `${kind}:${mood}`;
        if (this.backdropKind === id) return;
        this.backdrop?.destroy();
        this.backdrop = addBackdrop(this, kind, mood, { depth: -1000 });
        this.backdropKind = id;
        if (kind === 'forest') addMotes(this, 'firefly', -30, 500);
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

    private speakerName(line?: { speakerId: string; speakerName?: string }): string {
        if (!line) return '';
        if (line.speakerId === 'player') return line.speakerName ?? '你';
        return npcCatalogJson.npcs.find(npc => npc.id === line.speakerId)?.name ?? line.speakerName ?? '';
    }

    private renderStoryNode(view: StoryFlowViewModel, statusText: string): void {
        this.storyContainer?.destroy();
        this.typing?.remove();
        this.tooltip?.hide();
        if (this.choicePageNodeId !== view.currentNodeId) {
            this.choicePage = 0;
            this.choicePageNodeId = view.currentNodeId;
        }
        this.applyBackdropFor(view);
        this.updateStoryBackground(view.currentNode.backgroundAsset);
        this.storyTitleText?.setText(view.currentNode.chapter ?? this.storyGraph.title ?? '主线故事');
        this.placeText?.setText([view.currentNode.location, view.currentNode.sublocation].filter(Boolean).join(' · '));
        this.showStatus(statusText);
        if (view.warnings.length > 0) console.warn('[StoryScene]', ...view.warnings);

        const { width, height } = this.scale;
        const boxW = snap(Math.min(1680, width - PX * 16));
        const boxH = StoryScene.BOX_H;
        const boxX = snap(width / 2);
        const boxY = snap(height - boxH / 2 - PX * 8);
        const container = this.add.container(0, 0).setDepth(20);

        // --- build the reading pages for this node: narration first, then the current line
        const dialogues = view.currentNode.dialogues ?? [];
        const dialogueStart = Math.max(0, dialogues.findIndex(line => line.id === this.storyState.currentDialogueId));
        const line = dialogues[dialogueStart];
        const nextDialogueIndex = dialogues.length ? dialogueStart + 1 : 0;
        const hasMoreDialogues = nextDialogueIndex < dialogues.length;
        const { summary, detail } = view.currentNode;
        const storyCopy = detail === summary || detail.startsWith(`${summary}\n`) ? detail : `${summary}\n${detail}`;
        const charsPerPage = Math.floor((boxW - PX * 28) / 36) * 3;
        type Page = { speaker: string; text: string };
        const pages: Page[] = [];
        if (dialogues.length) {
            if (dialogueStart === 0 && summary) paginateReadableCopy(summary, charsPerPage).forEach((t) => pages.push({ speaker: '', text: t }));
            paginateReadableCopy(`${line!.emotion ? `（${line!.emotion}）` : ''}${line!.text}`, charsPerPage).forEach((t) => pages.push({ speaker: this.speakerName(line), text: t }));
        } else {
            paginateReadableCopy(storyCopy, charsPerPage).forEach((t) => pages.push({ speaker: '', text: t }));
        }
        const readingPage = Math.min(this.storyState.currentReadingPage ?? 0, pages.length - 1);
        const page = pages[readingPage]!;
        const hasMoreCopy = readingPage < pages.length - 1;

        const speaker = npcCatalogJson.npcs.find(npc => npc.id === (page.speaker ? line?.speakerId : undefined)) as
            | { id: string; portraitAsset?: string }
            | undefined;
        this.wenxinStage?.setNode(`${view.currentNode.title} ${page.text}`, page.speaker ? line?.speakerId : undefined, line?.emotion, speaker?.portraitAsset);

        // --- dialogue box
        const box = panel(this, boxX, boxY, boxW, boxH, 'ink');
        const hit = this.add.rectangle(boxX, boxY, boxW, boxH, 0, 0.001).setInteractive({ useHandCursor: true });
        container.add([box, hit]);
        const textLeft = boxX - boxW / 2 + PX * 14;
        const textTop = boxY - boxH / 2 + PX * 16;
        if (page.speaker) {
            const name = ptext(this, 0, 0, page.speaker, { color: INK.paper, origin: [0.5, 0.5] });
            const tagW = snap(name.width + PX * 16);
            const tag = this.add.container(snap(boxX - boxW / 2 + PX * 10 + tagW / 2), snap(boxY - boxH / 2), [panel(this, 0, 0, tagW, PX * 18, 'seal'), name]);
            name.setY(-PX);
            container.add(tag);
        } else {
            container.add(ptext(this, snap(boxX - boxW / 2 + PX * 14), snap(boxY - boxH / 2 + PX * 5), view.currentNode.title, { color: INK.gold }));
        }
        const body = ptext(this, textLeft, textTop + (page.speaker ? 0 : PX * 4), '', {
            color: page.speaker ? INK.paper : INK.bone, wrap: boxW - PX * 28, lineGap: PX * 4,
        });
        container.add(body);
        const more = ptext(this, boxX + boxW / 2 - PX * 12, boxY + boxH / 2 - PX * 8, '▼', { color: INK.vermilion, origin: [1, 1] }).setVisible(false);
        this.tweens.add({ targets: more, y: more.y + PX * 2, duration: 300, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
        container.add(more);

        // typewriter
        const full = page.text;
        const chars = [...full];
        let shown = 0;
        const done = () => shown >= chars.length;
        const finish = () => { this.typing?.remove(); shown = chars.length; body.setText(full); onTyped(); };
        this.typing = this.time.addEvent({ delay: 22, loop: true, callback: () => {
            shown = Math.min(chars.length, shown + 2);
            body.setText(chars.slice(0, shown).join(''));
            if (done()) { this.typing?.remove(); onTyped(); }
        } });

        const visibleChoices = view.choices.filter((choice) => choice.visible);
        let next: (() => void) | undefined;
        if (hasMoreCopy) {
            next = () => {
                this.storyState = { ...this.storyState, currentReadingPage: readingPage + 1 };
                this.renderCurrentNode(this.persistStorySession(`已读至第 ${readingPage + 2} 段。`));
            };
        } else if (hasMoreDialogues) {
            next = () => {
                this.storyState = { ...this.storyState, currentDialogueId: dialogues[nextDialogueIndex]!.id, currentReadingPage: 0 };
                this.renderCurrentNode(this.persistStorySession(`已读至第 ${nextDialogueIndex + 1} 条对白。`));
            };
        }
        const onTyped = () => {
            if (next) { more.setVisible(true); return; }
            if (visibleChoices.length === 0) this.renderTerminal(container, boxX, boxY - boxH / 2);
            else this.renderChoices(container, visibleChoices, boxX, boxY - boxH / 2, statusText);
        };
        this.advance = () => { if (!done()) finish(); else next?.(); };
        hit.on('pointerup', () => this.advance?.());

        // back one page
        if (readingPage > 0) {
            container.add(piconButton(this, boxX + boxW / 2 - PX * 16, boxY - boxH / 2 + PX * 2, 'back', () => {
                this.storyState = { ...this.storyState, currentReadingPage: readingPage - 1 };
                this.renderCurrentNode(this.persistStorySession('已返回上一段。'));
            }, 'slate', 16));
        }

        this.storyContainer = container;
        this.renderQuestJournal();
    }

    private renderChoices(container: Phaser.GameObjects.Container, choices: StoryChoiceView[], cx: number, bottom: number, statusText: string): void {
        const pageSize = 4;
        const pageCount = Math.ceil(choices.length / pageSize);
        this.choicePage = Math.min(this.choicePage, pageCount - 1);
        const shown = choices.slice(this.choicePage * pageSize, (this.choicePage + 1) * pageSize);
        const w = snap(Math.min(1260, this.scale.width - PX * 60));
        const h = PX * 22;
        const gap = PX * 5;
        const total = shown.length * (h + gap) - gap;
        const top = bottom - PX * 10 - total;
        shown.forEach((choice, i) => {
            const y = top + i * (h + gap) + h / 2;
            const label = `${choice.recommended ? '◆ ' : ''}${clip(choice.text, Math.floor((w - PX * 30) / 36))}`;
            const b = pbutton(this, {
                x: cx, y, width: w, height: h, label,
                style: !choice.selectable ? 'grey' : choice.recommended ? 'gold' : 'slate',
                textColor: choice.recommended ? INK.gold : undefined,
                disabled: !choice.selectable, cursor: true,
                onClick: () => this.handleChoice(choice.id),
            });
            const tip = this.createChoiceDescription(choice);
            if (tip) {
                b.setInteractive();
                b.on('pointerover', () => this.tooltip?.show(snap(cx + w / 2 + PX * 6), snap(y - h), choice.selectable ? '' : '未满足条件', tip));
                b.on('pointerout', () => this.tooltip?.hide());
            }
            if (!choice.selectable) b.add(addIcon(this, -w / 2 + PX * 12, -PX, 'lock'));
            b.setAlpha(0);
            this.tweens.add({ targets: b, alpha: 1, x: { from: cx - PX * 10, to: cx }, duration: 160, delay: i * 60, ease: 'Stepped', easeParams: [3] });
            container.add(b);
        });
        if (pageCount > 1) {
            const y = top - PX * 12;
            container.add(ptext(this, cx, y, `${this.choicePage + 1} / ${pageCount}`, { color: INK.mist, origin: [0.5, 0.5], fx: 'outline' }));
            container.add(piconButton(this, cx - PX * 30, y, 'back', () => { this.choicePage = (this.choicePage - 1 + pageCount) % pageCount; this.renderCurrentNode(statusText); }, 'slate', 14));
            const fwd = piconButton(this, cx + PX * 30, y, 'back', () => { this.choicePage = (this.choicePage + 1) % pageCount; this.renderCurrentNode(statusText); }, 'slate', 14);
            (fwd.list[1] as Phaser.GameObjects.Container).list.forEach((o) => (o as Phaser.GameObjects.Image).setFlipX?.(true));
            container.add(fwd);
        }
    }

    private renderTerminal(container: Phaser.GameObjects.Container, cx: number, bottom: number): void {
        const y = bottom - PX * 24;
        container.add(ptext(this, cx, y - PX * 26, '— 此段行程暂告一段落 —', { color: INK.bone, fx: 'outline', origin: [0.5, 0.5] }));
        container.add(pbutton(this, {
            x: cx - (this.launchData.hubSession ? PX * 46 : 0), y, width: PX * 84, height: PX * 22, label: '重新开始', style: 'slate',
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
        }));
        if (this.launchData.hubSession) {
            container.add(pbutton(this, { x: cx + PX * 46, y, width: PX * 84, height: PX * 22, label: '返回据点', style: 'seal', onClick: () => this.returnToHub() }));
        }
    }

    /** Only surface status lines that carry news (rewards, blocks) — not routine reading progress. */
    private showStatus(statusText: string): void {
        const routine = /^(请选择你的行动|已读至|已返回上一段)/.test(statusText);
        if (!statusText || routine || statusText === this.lastToast) return;
        this.lastToast = statusText;
        ptoast(this, statusText.split('｜').filter(Boolean).join('\n'), INK.bone, 3200);
    }

    private renderQuestJournal(): void {
        const entries = questJournalEntries(questCatalog, this.storyState.questStages);
        if (!entries.length || !this.hudContainer || this.hudContainer.getData('journal')) return;
        const x = (this.hudContainer as Phaser.GameObjects.Container & { nextX?: number }).nextX ?? this.scale.width - PX * 16;
        this.hudContainer.add(piconButton(this, x, PX * 16, 'book', () => this.questOverlay?.open(), 'seal'));
        this.hudContainer.setData('journal', true);
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
        if (this.storyBackground && !this.storyBackground.texture.key.startsWith(key)) {
            this.storyBackground.destroy();
            this.storyBackground = undefined;
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
        if (this.storyBackground?.active) return;
        const { width, height } = this.scale;
        const pixKey = pixelateImage(this, key, `${key}:px:${width}`, Math.ceil(width / PX), Math.ceil(height / PX), 'cover');
        this.storyBackground = this.add.image(0, 0, pixKey).setOrigin(0).setScale(PX).setDepth(-18);
    }

    private createChoiceDescription(choice: StoryChoiceView): string {
        const description = choice.description && choice.description !== choice.text ? choice.description : '';

        if (!choice.selectable) {
            let reason = choice.disabledReason ?? '当前不可选择';
            for (const item of storyItems) reason = reason.split(item.id).join(item.name);
            for (const npc of npcCatalogJson.npcs) reason = reason.split(npc.id).join(npc.name);
            reason = reason.replace(/player 已知道 [A-Za-z0-9._:-]+/gu, '主角需要先掌握相关线索')
                .replace(/player 尚不知道 [A-Za-z0-9._:-]+/gu, '主角需要避开相关线索');
            return description ? `${description}\n${reason}` : reason;
        }

        return description;
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
}
