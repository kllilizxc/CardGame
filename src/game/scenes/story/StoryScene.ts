import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import {
    createStoryChoiceTransition,
    createStoryFlowViewModel,
    type StoryChoiceView,
    type StoryFlowViewModel,
} from './storyFlowViewModel';
import {
    validatePlayableStoryGraph,
    type StoryGraph,
} from './storyFlow';

export class StoryScene extends Scene {
    private storyGraph!: StoryGraph;
    private currentNodeId = '';
    private visitedNodeIds: string[] = [];
    private selectedChoiceIds: string[] = [];
    private storyContainer?: Phaser.GameObjects.Container;
    private statusText?: Phaser.GameObjects.Text;

    constructor() {
        super('StoryScene');
    }

    preload(): void {
        this.load.json('exampleStoryGraph', 'data/story/story-graph.json');
    }

    create(): void {
        this.storyGraph = validatePlayableStoryGraph(this.cache.json.get('exampleStoryGraph'));
        this.currentNodeId = this.storyGraph.entryNodeId;
        this.visitedNodeIds = [this.currentNodeId];
        this.selectedChoiceIds = [];

        this.renderSceneFrame();
        this.renderCurrentNode('请选择你的行动。');

        EventBus.emit('current-scene-ready', this);
    }

    private renderSceneFrame(): void {
        const { width, height } = this.scale;

        this.cameras.main.setBackgroundColor(0x080f1f);
        this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1);
        this.add.circle(230, 160, 360, 0x1d4ed8, 0.15);
        this.add.circle(width - 220, height - 120, 420, 0x7c3aed, 0.12);

        this.add.text(width / 2, 72, '主线故事 · 青云宗入门', {
            fontFamily: 'Arial',
            fontSize: '44px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(width / 2, 120, '点击选项推进 public/data/story/story-graph.json 中的示例故事', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#93c5fd',
        }).setOrigin(0.5);

        this.statusText = this.add.text(width / 2, height - 70, '', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#fef3c7',
            align: 'center',
            wordWrap: { width: width - 260 },
        }).setOrigin(0.5);
    }

    private renderCurrentNode(statusText: string): void {
        const viewModel = createStoryFlowViewModel(this.storyGraph, {
            currentNodeId: this.currentNodeId,
            visitedNodeIds: this.visitedNodeIds,
            selectedChoiceIds: this.selectedChoiceIds,
        });

        this.currentNodeId = viewModel.currentNodeId;
        this.visitedNodeIds = viewModel.visitedNodeIds;
        this.selectedChoiceIds = viewModel.selectedChoiceIds;
        this.renderStoryNode(viewModel, statusText);
    }

    private renderStoryNode(view: StoryFlowViewModel, statusText: string): void {
        this.storyContainer?.destroy();
        const warningSuffix = view.warnings.length > 0 ? `\n${view.warnings.join('\n')}` : '';
        this.statusText?.setText(`${statusText}${warningSuffix}`);

        const { width, height } = this.scale;
        const panelWidth = Math.min(1360, width - 220);
        const panelHeight = 520;
        const panelX = width / 2;
        const panelY = 425;
        const contentX = panelX - panelWidth / 2 + 56;
        const container = this.add.container(0, 0);

        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x38bdf8, 0.85);

        const title = this.add.text(contentX, panelY - panelHeight / 2 + 42, view.currentNode.title, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const metadata = this.add.text(contentX, title.y + 48, view.currentNode.subtitle, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#93c5fd',
        });

        const tags = this.add.text(contentX, metadata.y + 36, view.currentNode.tags.join(' / '), {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#fde68a',
        });

        const summary = this.add.text(contentX, tags.y + 48, view.currentNode.summary, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#e0f2fe',
            fontStyle: 'bold',
            wordWrap: { width: panelWidth - 112 },
        });

        const detail = this.add.text(contentX, summary.y + 72, view.currentNode.detail, {
            fontFamily: 'Arial',
            fontSize: '21px',
            color: '#dbeafe',
            lineSpacing: 10,
            wordWrap: { width: panelWidth - 112 },
        });

        const hintText = view.currentNode.worldEffectHint
            ? `世界变化提示：${view.currentNode.worldEffectHint}`
            : '世界变化提示：暂无。';
        const hint = this.add.text(contentX, panelY + panelHeight / 2 - 72, hintText, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#c4b5fd',
            wordWrap: { width: panelWidth - 112 },
        });

        container.add([panel, title, metadata, tags, summary, detail, hint]);

        const visibleChoices = view.choices.filter((choice) => choice.visible);

        if (visibleChoices.length === 0) {
            const terminal = this.add.text(panelX, height - 210, '示例故事已抵达当前终点。后续可继续扩展 story-graph.json。', {
                fontFamily: 'Arial',
                fontSize: '22px',
                color: '#bbf7d0',
                align: 'center',
            }).setOrigin(0.5);
            const restartButton = this.createButton({
                x: panelX,
                y: height - 145,
                width: 280,
                height: 58,
                label: '重新开始故事',
                fillColor: 0x2563eb,
                onClick: () => {
                    this.currentNodeId = this.storyGraph.entryNodeId;
                    this.visitedNodeIds = [this.currentNodeId];
                    this.selectedChoiceIds = [];
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
        const buttonHeight = 82;
        const x = width / 2;
        const y = height - 265 + index * 108;
        const buttonFill = choice.selectable ? 0x1d4ed8 : 0x475569;
        const button = this.add.rectangle(x, y, buttonWidth, buttonHeight, buttonFill, 0.94);
        button.setStrokeStyle(2, 0xffffff, 0.78);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setFillStyle(choice.selectable ? 0x2563eb : 0x475569, 1));
        button.on('pointerout', () => button.setFillStyle(buttonFill, 0.94));
        button.on('pointerdown', () => this.handleChoice(choice.id));

        const textX = x - buttonWidth / 2 + 28;
        const label = this.add.text(textX, y - 24, choice.text, {
            fontFamily: 'Arial',
            fontSize: '21px',
            color: '#f8fafc',
            fontStyle: 'bold',
            wordWrap: { width: buttonWidth - 56 },
        });
        const descriptionText = choice.disabledReason ?? choice.description ?? '无补充说明。';
        const description = this.add.text(textX, y + 10, descriptionText, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: choice.selectable ? '#dbeafe' : '#fecaca',
            wordWrap: { width: buttonWidth - 56 },
        });

        return [button, label, description];
    }

    private createButton(config: {
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        fillColor: number;
        onClick: () => void;
    }): Phaser.GameObjects.GameObject[] {
        const button = this.add.rectangle(config.x, config.y, config.width, config.height, config.fillColor, 1);
        button.setStrokeStyle(2, 0xffffff, 0.86);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setAlpha(0.86));
        button.on('pointerout', () => button.setAlpha(1));
        button.on('pointerdown', config.onClick);

        const label = this.add.text(config.x, config.y, config.label, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);

        return [button, label];
    }

    private handleChoice(choiceId: string): void {
        const currentView = createStoryFlowViewModel(this.storyGraph, {
            currentNodeId: this.currentNodeId,
            visitedNodeIds: this.visitedNodeIds,
            selectedChoiceIds: this.selectedChoiceIds,
        });
        const result = createStoryChoiceTransition(currentView, choiceId);

        if (result.status === 'blocked') {
            this.renderCurrentNode(result.reason);
            return;
        }

        this.currentNodeId = result.toNodeId;
        this.visitedNodeIds = result.nextVisitedNodeIds;
        this.selectedChoiceIds = result.nextSelectedChoiceIds;

        const selectedChoice = currentView.choices.find((choice) => choice.id === choiceId);
        this.renderCurrentNode(`已选择：${selectedChoice?.text ?? choiceId}`);
    }
}
