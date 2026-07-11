import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import { CONTENT_CATALOG_CACHE_KEY } from '../../content/contentCatalog';
import {
    clearStoryRuntimeSession,
    saveStoryRuntimeSession,
} from '../../services/StoryHubSessionPersistence';
import type { StoryState } from '../../types/story';
import {
    createInitialStoryRuntime,
    createStoryChoiceTransition,
    createStoryFlowViewModel,
    type StoryChoiceView,
    type StoryFlowViewModel,
} from './storyFlowViewModel';
import {
    validatePlayableStoryGraph,
    type StoryGraph,
} from './storyFlow';
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

export class StoryScene extends Scene {
    private storyGraph!: StoryGraph;
    private storyState!: StoryState;
    private selectedChoiceIds: string[] = [];
    private storyContainer?: Phaser.GameObjects.Container;
    private statusText?: Phaser.GameObjects.Text;
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
        this.storyGraph = this.readValidatedStoryGraph();
        assertStorySceneCatalogResourceMatchesLoadedGraph(this.storyGraph, this.getResolvedStoryResource());
        const initialStatusText = this.applyLaunchData();
        this.persistStorySession(initialStatusText);

        this.renderSceneFrame();
        this.renderCurrentNode(initialStatusText);

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
            return validatePlayableStoryGraph(rawStoryGraph);
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

            this.storyState = resume.storyState;
            this.selectedChoiceIds = resume.selectedChoiceIds;

            return resume.statusText;
        }

        this.storyState = this.launchData.storyState
            ? cloneStoryState(this.launchData.storyState)
            : createInitialStoryRuntime(this.storyGraph);
        this.selectedChoiceIds = [...(this.launchData.selectedChoiceIds ?? [])];

        return this.launchData.statusText ?? '请选择你的行动。';
    }

    private renderSceneFrame(): void {
        const { width, height } = this.scale;

        this.cameras.main.setBackgroundColor(sceneTheme.colors.night);
        createSceneBackdrop(this);

        this.add.text(width / 2, 76, this.storyGraph.title ?? '主线故事', getSceneTextStyle('sceneTitle', {
            fontSize: '48px',
        })).setOrigin(0.5);

        this.add.text(
            width / 2,
            132,
            '顺着剧情选择前行；若引出战斗，结果会带回此处继续。',
            getSceneTextStyle('sceneSubtitle'),
        ).setOrigin(0.5);

        const status = createStatusLine(this, {
            x: width / 2,
            y: height - 72,
            width: width - 260,
            text: '',
            align: 'center',
        });
        this.statusText = status.text;
    }

    private renderCurrentNode(statusText: string): void {
        const viewModel = createStoryFlowViewModel(this.storyGraph, {
            storyState: this.storyState,
            selectedChoiceIds: this.selectedChoiceIds,
        });

        this.storyState = viewModel.storyState;
        this.selectedChoiceIds = viewModel.selectedChoiceIds;
        this.renderStoryNode(viewModel, statusText);
    }

    private renderStoryNode(view: StoryFlowViewModel, statusText: string): void {
        this.storyContainer?.destroy();
        this.statusText?.setText(this.createRuntimeStatusText(statusText, view));

        const { width, height } = this.scale;
        const panelWidth = Math.min(1340, width - 220);
        const panelHeight = 510;
        const panelX = width / 2;
        const panelY = 420;
        const contentX = panelX - panelWidth / 2 + 60;
        const container = this.add.container(0, 0);

        container.add(createScenePanel(this, {
            x: panelX,
            y: panelY,
            width: panelWidth,
            height: panelHeight,
        }));

        const metadataLine = view.currentNode.tags.length > 0
            ? `${view.currentNode.subtitle} · ${view.currentNode.tags.join(' / ')}`
            : view.currentNode.subtitle;
        const storyCopy = `${view.currentNode.summary}\n${view.currentNode.detail}`;

        const metadata = this.add.text(contentX, panelY - panelHeight / 2 + 48, metadataLine, getSceneTextStyle('panelEyebrow', {
            wordWrap: { width: panelWidth - 120 },
        }));
        const title = this.add.text(contentX, metadata.y + 34, view.currentNode.title, getSceneTextStyle('panelTitle', {
            fontSize: '38px',
            wordWrap: { width: panelWidth - 120 },
        }));
        const body = this.add.text(contentX, title.y + 64, storyCopy, getSceneTextStyle('body', {
            fontSize: '20px',
            wordWrap: { width: panelWidth - 120 },
        }));

        container.add([metadata, title, body]);

        const visibleChoices = view.choices.filter((choice) => choice.visible);

        if (visibleChoices.length === 0) {
            const terminal = this.add.text(panelX, height - 214, '这段行程暂告一段落，眼下已抵达当前故事终点。', getSceneTextStyle('support', {
                fontSize: '20px',
                color: '#d9c6a2',
                align: 'center',
            })).setOrigin(0.5);
            const restartButton = this.createButton({
                x: panelX,
                y: height - 146,
                width: 300,
                height: 60,
                label: '重新开始故事',
                onClick: () => {
                    this.storyState = createInitialStoryRuntime(this.storyGraph);
                    this.selectedChoiceIds = [];
                    this.resetStorySession();
                    this.persistStorySession('故事已重新开始。');
                    this.renderCurrentNode('故事已重新开始。');
                },
            });

            container.add([terminal, ...restartButton]);
        } else {
            visibleChoices.forEach((choice, index) => {
                container.add(this.createChoiceButton(choice, index));
            });
        }

        this.storyContainer = container;
    }

    private createChoiceButton(choice: StoryChoiceView, index: number): Phaser.GameObjects.GameObject[] {
        const { width, height } = this.scale;
        const buttonWidth = Math.min(1120, width - 360);
        const buttonHeight = 88;
        const x = width / 2;
        const y = height - 262 + index * 104;
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
        const description = choice.description ?? '无补充说明。';

        if (!choice.selectable) {
            return `${description}｜${choice.disabledReason ?? '当前不可选择'}`;
        }

        return `${description}｜效果：${choice.effectSummary}`;
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
        const currentView = createStoryFlowViewModel(this.storyGraph, {
            storyState: this.storyState,
            selectedChoiceIds: this.selectedChoiceIds,
        });
        const result = createStoryChoiceTransition(currentView, choiceId);

        if (result.status === 'blocked') {
            this.renderCurrentNode(result.reason);
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

        this.persistStorySession(intent.statusText);
        this.renderCurrentNode(intent.statusText);
    }

    private persistStorySession(statusText: string): void {
        if (!this.launchData.hubSession) {
            return;
        }

        saveStoryRuntimeSession({
            ...this.launchData.hubSession,
            storyState: cloneStoryState(this.storyState),
            selectedChoiceIds: [...this.selectedChoiceIds],
            statusText,
            updatedAt: new Date().toISOString(),
        });
    }

    private resetStorySession(): void {
        if (!this.launchData.hubSession) {
            return;
        }

        clearStoryRuntimeSession(this.launchData.hubSession);
    }

    private createRuntimeStatusText(statusText: string, view: StoryFlowViewModel): string {
        const parts = [statusText, `行迹：${view.stateLine}`];

        if (view.warnings.length > 0) {
            parts.push(...view.warnings);
        }

        return parts.join(' ｜ ');
    }
}
