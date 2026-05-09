import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import {
    applyHubNavigationIntent,
    createHubActionIntent,
    createInitialHubNavigationState,
    resolveHubLocation,
    validateHubTownDefinition,
    type HubNavigationState,
    type HubTownAction,
    type HubTownDefinition,
} from './hubTown';

const HUB_TOWN_CACHE_KEY = 'hubTownShell';
const HUB_TOWN_FILE = 'data/hub/town-shell.json';

export class HubScene extends Scene {
    private town!: HubTownDefinition;
    private navigationState!: HubNavigationState;
    private shellContainer?: Phaser.GameObjects.Container;

    constructor() {
        super('HubScene');
    }

    preload(): void {
        this.load.json(HUB_TOWN_CACHE_KEY, HUB_TOWN_FILE);
    }

    create(): void {
        this.town = validateHubTownDefinition(this.cache.json.get(HUB_TOWN_CACHE_KEY));
        this.navigationState = createInitialHubNavigationState(this.town);

        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private renderShell(): void {
        this.shellContainer?.destroy();

        const currentLocation = resolveHubLocation(this.town, this.navigationState.currentLocationId);
        const { width, height } = this.scale;
        const container = this.add.container(0, 0);

        this.cameras.main.setBackgroundColor(0x09111f);
        container.add(this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1));
        container.add(this.add.circle(width * 0.18, height * 0.2, 320, 0x1d4ed8, 0.12));
        container.add(this.add.circle(width * 0.82, height * 0.86, 380, 0x16a34a, 0.1));

        container.add(this.add.text(width / 2, 74, this.town.title, {
            fontFamily: 'Arial Black',
            fontSize: '48px',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 126, this.town.subtitle, {
            fontFamily: 'Arial',
            fontSize: '22px',
            color: '#bfdbfe',
        }).setOrigin(0.5));

        const panelWidth = Math.min(1280, width - 260);
        const panelHeight = 560;
        const panelX = width / 2;
        const panelY = height / 2 + 12;
        const panelLeft = panelX - panelWidth / 2;
        const contentX = panelLeft + 58;
        const panelTop = panelY - panelHeight / 2;

        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x38bdf8, 0.82);
        container.add(panel);

        container.add(this.add.text(contentX, panelTop + 48, currentLocation.title, {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#fef3c7',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(contentX, panelTop + 102, currentLocation.summary, {
            fontFamily: 'Arial',
            fontSize: '24px',
            color: '#e0f2fe',
            fontStyle: 'bold',
            wordWrap: { width: panelWidth - 116 },
        }));

        container.add(this.add.text(contentX, panelTop + 162, currentLocation.detail, {
            fontFamily: 'Arial',
            fontSize: '21px',
            color: '#dbeafe',
            lineSpacing: 10,
            wordWrap: { width: panelWidth - 116 },
        }));

        container.add(this.add.text(contentX, panelTop + 282, this.town.description, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#c4b5fd',
            wordWrap: { width: panelWidth - 116 },
        }));

        const statusLine = this.navigationState.statusText ?? '当前导航状态仅保存在本次 HubScene 内存中。';
        container.add(this.add.text(contentX, panelTop + 322, statusLine, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#fef3c7',
            wordWrap: { width: panelWidth - 116 },
        }));

        currentLocation.actions.forEach((action, index) => {
            container.add(this.createActionButton(action, panelX, panelTop + 390 + index * 92, panelWidth - 220));
        });

        this.shellContainer = container;
    }

    private createActionButton(action: HubTownAction, x: number, y: number, width: number): Phaser.GameObjects.GameObject[] {
        const button = this.add.rectangle(x, y, width, 76, 0x1d4ed8, 0.94);
        button.setStrokeStyle(3, 0xffffff, 0.82);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setFillStyle(0x2563eb, 1));
        button.on('pointerout', () => button.setFillStyle(0x1d4ed8, 0.94));
        button.on('pointerdown', () => this.handleAction(action));

        const textX = x - width / 2 + 30;
        const label = this.add.text(textX, y - 23, action.label, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });

        const description = this.add.text(textX, y + 10, action.description, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#bfdbfe',
            wordWrap: { width: width - 60 },
        });

        return [button, label, description];
    }

    private handleAction(action: HubTownAction): void {
        const intent = createHubActionIntent(action);

        if (intent.kind === 'navigateLocation') {
            this.navigationState = applyHubNavigationIntent(this.town, this.navigationState, intent);
            this.renderShell();
            return;
        }

        this.scene.start(intent.sceneKey, intent.payload);
    }
}
