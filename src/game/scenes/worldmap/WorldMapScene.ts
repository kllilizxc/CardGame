import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import {
    createWorldMapDestinationIntent,
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapDestination,
} from './worldMap';

export const WORLD_MAP_CACHE_KEY = 'worldMapShell';

export class WorldMapScene extends Scene {
    private worldMap!: WorldMapDefinition;
    private statusText!: Phaser.GameObjects.Text;
    private shellContainer?: Phaser.GameObjects.Container;

    constructor() {
        super('WorldMapScene');
    }

    preload(): void {
        this.load.json(WORLD_MAP_CACHE_KEY, 'data/world/world-map.json');
    }

    create(): void {
        this.worldMap = validateWorldMapDefinition(this.cache.json.get(WORLD_MAP_CACHE_KEY));
        this.renderShell();
        EventBus.emit('current-scene-ready', this);
    }

    private renderShell(): void {
        this.shellContainer?.destroy();

        const { width, height } = this.scale;
        const container = this.add.container(0, 0);

        this.cameras.main.setBackgroundColor(0x07111f);
        container.add(this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1));
        container.add(this.add.circle(width * 0.22, height * 0.24, 360, 0x0ea5e9, 0.13));
        container.add(this.add.circle(width * 0.78, height * 0.72, 420, 0x22c55e, 0.11));

        container.add(this.add.text(width / 2, 78, this.worldMap.title, {
            fontFamily: 'Arial Black',
            fontSize: '50px',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 132, this.worldMap.subtitle, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#bfdbfe',
        }).setOrigin(0.5));

        const panelWidth = Math.min(1180, width - 280);
        const panelHeight = 590;
        const panelX = width / 2;
        const panelY = height / 2 + 26;
        const panelLeft = panelX - panelWidth / 2;
        const panelTop = panelY - panelHeight / 2;
        const contentX = panelLeft + 60;
        const panel = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x111827, 0.96);
        panel.setStrokeStyle(3, 0x38bdf8, 0.82);
        container.add(panel);

        container.add(this.add.text(contentX, panelTop + 54, '可前往地点', {
            fontFamily: 'Arial',
            fontSize: '36px',
            color: '#fef3c7',
            fontStyle: 'bold',
        }));

        container.add(this.add.text(contentX, panelTop + 112, this.worldMap.description, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#dbeafe',
            lineSpacing: 10,
            wordWrap: { width: panelWidth - 120 },
        }));

        this.statusText = this.add.text(contentX, panelTop + 198, '请选择一个大地图目的地。', {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#fde68a',
            wordWrap: { width: panelWidth - 120 },
        });
        container.add(this.statusText);

        this.worldMap.destinations.forEach((destination, index) => {
            container.add(this.createDestinationButton(
                destination,
                panelX,
                panelTop + 292 + index * 116,
                panelWidth - 180,
            ));
        });

        this.shellContainer = container;
    }

    private createDestinationButton(
        destination: WorldMapDestination,
        x: number,
        y: number,
        width: number,
    ): Phaser.GameObjects.GameObject[] {
        const fillColor = destination.kind === 'hub' ? 0x1d4ed8 : 0x16a34a;
        const button = this.add.rectangle(x, y, width, 88, fillColor, 0.94);
        button.setStrokeStyle(3, 0xffffff, 0.82);
        button.setInteractive({ useHandCursor: true });
        button.on('pointerover', () => button.setFillStyle(destination.kind === 'hub' ? 0x2563eb : 0x22c55e, 1));
        button.on('pointerout', () => button.setFillStyle(fillColor, 0.94));
        button.on('pointerdown', () => this.handleDestinationSelected(destination.id));

        const textX = x - width / 2 + 34;
        const label = this.add.text(textX, y - 28, destination.label, {
            fontFamily: 'Arial',
            fontSize: '25px',
            color: '#f8fafc',
            fontStyle: 'bold',
        });
        const typeLabel = destination.kind === 'hub' ? 'HubScene' : 'ExpeditionScene';
        const description = this.add.text(textX, y + 6, `${typeLabel} · ${destination.description}`, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#dbeafe',
            wordWrap: { width: width - 68 },
        });

        return [button, label, description];
    }

    private handleDestinationSelected(destinationId: string): void {
        const intent = createWorldMapDestinationIntent(this.worldMap, destinationId);
        const destination = this.worldMap.destinations.find((candidate) => candidate.id === destinationId);

        this.statusText.setText(destination?.statusText ?? `正在前往 ${destinationId}。`);
        this.scene.start(intent.sceneKey, intent.payload);
    }
}
