import { Scene } from 'phaser';

import { EventBus } from '../../EventBus';
import {
    createWorldMapRouteIntent,
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapRouteDefinition,
} from './worldMap';

const WORLD_MAP_CACHE_KEY = 'worldMapShell';

export class WorldMapScene extends Scene {
    private worldMap!: WorldMapDefinition;
    private shellContainer?: Phaser.GameObjects.Container;
    private statusText?: Phaser.GameObjects.Text;

    constructor() {
        super('WorldMapScene');
    }

    preload(): void {
        this.load.json('worldMapShell', 'data/world/world-map.json');
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

        this.cameras.main.setBackgroundColor(0x06111f);
        container.add(this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a, 1));
        container.add(this.add.circle(width * 0.26, height * 0.68, 360, 0x16a34a, 0.12));
        container.add(this.add.circle(width * 0.7, height * 0.32, 320, 0x7c3aed, 0.12));
        container.add(this.add.rectangle(width / 2, height * 0.5, width - 260, height - 260, 0x111827, 0.74)
            .setStrokeStyle(3, 0x38bdf8, 0.66));

        container.add(this.add.text(width / 2, 74, this.worldMap.title, {
            fontFamily: 'Arial Black',
            fontSize: '50px',
            color: '#f8fafc',
            stroke: '#020617',
            strokeThickness: 8,
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 128, this.worldMap.subtitle, {
            fontFamily: 'Arial',
            fontSize: '23px',
            color: '#bfdbfe',
        }).setOrigin(0.5));

        container.add(this.add.text(width / 2, 174, this.worldMap.description, {
            fontFamily: 'Arial',
            fontSize: '19px',
            color: '#c4b5fd',
            align: 'center',
            wordWrap: { width: Math.min(1180, width - 320) },
        }).setOrigin(0.5));

        this.renderRouteLines(container);

        this.worldMap.routes.forEach((route) => {
            container.add(this.createRouteNode(route));
        });

        this.statusText = this.add.text(width / 2, height - 92, '选择一个地点：路线来自 public/data/world/world-map.json。', {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#fde68a',
            align: 'center',
            wordWrap: { width: width - 260 },
        }).setOrigin(0.5);
        container.add(this.statusText);

        this.shellContainer = container;
    }

    private renderRouteLines(container: Phaser.GameObjects.Container): void {
        const graphics = this.add.graphics();
        graphics.setDepth(20);
        graphics.lineStyle(3, 0x38bdf8, 0.38);

        const defaultRoute = this.worldMap.routes.find((route) => route.id === this.worldMap.defaultRouteId);

        if (!defaultRoute) {
            return;
        }

        const from = this.getRoutePosition(defaultRoute);

        this.worldMap.routes
            .filter((route) => route.id !== defaultRoute.id)
            .forEach((route) => {
                const to = this.getRoutePosition(route);
                graphics.beginPath();
                graphics.moveTo(from.x, from.y);
                graphics.lineTo(to.x, to.y);
                graphics.strokePath();
            });

        container.add(graphics);
    }

    private createRouteNode(route: WorldMapRouteDefinition): Phaser.GameObjects.GameObject[] {
        const position = this.getRoutePosition(route);
        const nodeColor = route.sceneKey === 'HubScene' ? 0x1d4ed8 : 0x7c2d12;
        const ringColor = route.sceneKey === 'HubScene' ? 0x93c5fd : 0xfacc15;
        const node = this.add.circle(position.x, position.y, 44, nodeColor, 0.96);
        node.setStrokeStyle(4, ringColor, 0.9);
        node.setInteractive({ useHandCursor: true });
        node.on('pointerover', () => node.setFillStyle(nodeColor, 1));
        node.on('pointerout', () => node.setFillStyle(nodeColor, 0.96));
        node.on('pointerdown', () => this.handleRouteSelected(route));

        const label = this.add.text(position.x, position.y - 78, route.label, {
            fontFamily: 'Arial',
            fontSize: '25px',
            color: '#f8fafc',
            fontStyle: 'bold',
            stroke: '#020617',
            strokeThickness: 5,
        }).setOrigin(0.5);

        const cardWidth = 420;
        const cardHeight = 112;
        const cardY = position.y + 114;
        const card = this.add.rectangle(position.x, cardY, cardWidth, cardHeight, 0x020617, 0.82);
        card.setStrokeStyle(2, ringColor, 0.74);
        card.setInteractive({ useHandCursor: true });
        card.on('pointerdown', () => this.handleRouteSelected(route));
        card.on('pointerover', () => card.setFillStyle(0x111827, 0.94));
        card.on('pointerout', () => card.setFillStyle(0x020617, 0.82));

        const sceneLabel = this.add.text(position.x - cardWidth / 2 + 24, cardY - 42, route.sceneKey, {
            fontFamily: 'Arial',
            fontSize: '16px',
            color: '#fde68a',
            fontStyle: 'bold',
        });

        const description = this.add.text(position.x - cardWidth / 2 + 24, cardY - 14, route.description, {
            fontFamily: 'Arial',
            fontSize: '17px',
            color: '#dbeafe',
            lineSpacing: 6,
            wordWrap: { width: cardWidth - 48 },
        });

        return [node, label, card, sceneLabel, description];
    }

    private getRoutePosition(route: WorldMapRouteDefinition): { x: number; y: number } {
        const { width, height } = this.scale;
        const mapLeft = 250;
        const mapRight = width - 250;
        const mapTop = 250;
        const mapBottom = height - 300;

        return {
            x: mapLeft + route.position.x * (mapRight - mapLeft),
            y: mapTop + route.position.y * (mapBottom - mapTop),
        };
    }

    private handleRouteSelected(route: WorldMapRouteDefinition): void {
        const intent = createWorldMapRouteIntent(this.worldMap, route);

        this.statusText?.setText(route.statusText ?? `正在前往 ${route.label}。`);
        this.scene.start(intent.sceneKey, intent.payload);
    }
}
