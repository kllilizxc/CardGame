import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import {
    ExpeditionState,
    type ExpeditionBootstrapSources,
    type ExpeditionWorldStateSeed,
} from '../../state/ExpeditionState';
import type { ExpeditionMapDefinition, RunSnapshot } from '../../types/expedition';
import { PreparationPanel } from '../../ui/expedition/PreparationPanel';
import { RunHud } from '../../ui/expedition/RunHud';
import { createRunSummary, type RunSummaryMode } from './entryFlowModel';
import { confirmExpeditionLoadout, getInitialExpeditionEntryView } from './expeditionEntryFlow';

interface StarterDeckCacheEntry extends ExpeditionBootstrapSources['starterDeck'] {}

export class ExpeditionScene extends Scene {
    private expeditionState!: ExpeditionState;
    private mapDefinition!: ExpeditionMapDefinition;
    private preparationPanel?: PreparationPanel;
    private runHud!: RunHud;
    private statusText!: Phaser.GameObjects.Text;

    constructor() {
        super('ExpeditionScene');
    }

    preload(): void {
        this.load.json('expeditionInitialState', 'data/world/initial-state.json');
        this.load.json('expeditionStarterDeck', 'data/decks/starter-deck.json');
        this.load.json('expeditionPrototypeMap', 'data/mijing/prototype-map.json');
    }

    create(): void {
        const { width, height } = this.scale;

        this.cameras.main.setBackgroundColor(0x0f172a);
        this.add.rectangle(width / 2, height / 2, width, height, 0x111827, 0.92);
        this.add.text(width / 2, 80, '青云外山试炼', {
            fontFamily: 'Arial',
            fontSize: '44px',
            color: '#f8fafc',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.add.text(width / 2, 126, 'Phase 01 · Expedition Entry Flow', {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#93c5fd',
        }).setOrigin(0.5);

        const worldState = this.cache.json.get('expeditionInitialState') as ExpeditionWorldStateSeed;
        const starterDeck = this.cache.json.get('expeditionStarterDeck') as StarterDeckCacheEntry;
        this.mapDefinition = this.cache.json.get('expeditionPrototypeMap') as ExpeditionMapDefinition;
        this.expeditionState = ExpeditionState.bootstrap({ worldState, starterDeck });

        this.runHud = new RunHud(this);
        this.runHud.setVisible(false);
        this.statusText = this.add.text(width / 2, height - 92, '', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#cbd5e1',
            align: 'center',
            wordWrap: { width: width - 220 },
        }).setOrigin(0.5);

        const initialView = getInitialExpeditionEntryView(this.expeditionState);

        if (initialView.mode === 'activeRun') {
            this.showActiveRun(initialView.activeRun, 'resumed');
        } else {
            this.showPreparationPanel();
            this.statusText.setText(initialView.statusText);
        }

        EventBus.emit('current-scene-ready', this);
    }

    private showPreparationPanel(): void {
        this.preparationPanel?.destroy();
        this.runHud.setVisible(false);
        this.preparationPanel = new PreparationPanel(this, {
            stash: this.expeditionState.persistentStash,
            onConfirm: () => this.confirmLoadout(),
        });
    }

    private confirmLoadout(): void {
        const confirmedView = confirmExpeditionLoadout(this.expeditionState, {
            expeditionId: 'phase01-first-playable-expedition',
            mapId: this.mapDefinition.id,
            entryNodeId: this.mapDefinition.entryNodeId,
        });

        this.preparationPanel?.destroy();
        this.preparationPanel = undefined;
        this.showActiveRun(confirmedView.activeRun, 'started');
    }

    private showActiveRun(activeRun: RunSnapshot, mode: RunSummaryMode): void {
        const currentNodeLabel = this.getNodeLabel(activeRun.currentNodeId);
        const summary = createRunSummary(activeRun, {
            mode,
            currentNodeLabel,
        });

        this.runHud.setVisible(true);
        this.runHud.updateFromRun(activeRun, currentNodeLabel);
        this.statusText.setText(summary.statusText);
    }

    private getNodeLabel(nodeId: string): string {
        return this.mapDefinition.nodes.find((node) => node.id === nodeId)?.label ?? nodeId;
    }
}
