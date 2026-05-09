import { describe, expect, it, mock } from 'bun:test';

import contentCatalogJson from '../../../../public/data/content-catalog.json';
import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';
import worldMapJson from '../../../../public/data/world/world-map.json';
import {
    createWorldMapDestinationIntent,
    type WorldMapDestination,
    type WorldMapExpeditionDestination,
    validateWorldMapDefinition,
} from '../worldmap/worldMap';
import type { ExpeditionEncounterMapNode, RunSnapshot } from '../../types/expedition';
import { createExpeditionBattleCompleteEvent } from '../battle/battleCompletion';
import { createBattleLaunchPayload } from './battleLaunchFlow';
import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
    DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS,
    DEFAULT_EXPEDITION_TARGET_FILES,
    createExpeditionTargetConfig,
    normalizeExpeditionSceneLaunchData,
    resolveExpeditionSceneCatalogResources,
} from './expeditionSceneLaunch';

const worldMapWithSyntheticExpeditionTargets = {
    id: 'worldmap.synthetic-expeditions',
    title: '测试大地图',
    subtitle: '测试多个秘境入口',
    description: '仅用于 route identity 测试，不增加 checked-in content。',
    defaultDestinationId: 'destination.synthetic-a',
    presentation: {
        mapWidth: 1200,
        mapHeight: 800,
        initialCenter: {
            x: 0.5,
            y: 0.5,
        },
    },
    destinations: [
        {
            id: 'destination.synthetic-a',
            kind: 'expedition',
            label: '测试秘境 A',
            description: '使用原型文件的第一个合成 Expedition 入口。',
            presentation: {
                position: {
                    x: 0.35,
                    y: 0.5,
                },
                icon: 'trial',
                regionLabel: '测试区域 A',
            },
            expeditionId: 'expedition.synthetic-a',
            mapId: 'map.synthetic-a',
            worldStateResourceId: 'world.seed.initial-state',
            worldStateFile: 'data/world/initial-state.json',
            starterDeckResourceId: 'deck.starter',
            starterDeckFile: 'data/decks/starter-deck.json',
            mapResourceId: 'phase01-prototype-map',
            mapFile: 'data/mijing/prototype-map.json',
            eventsResourceId: 'phase01-prototype-events',
            eventsFile: 'data/mijing/prototype-events.json',
            shopResourceId: 'phase01-prototype-shop',
            shopFile: 'data/mijing/prototype-shop.json',
            statusText: '进入测试秘境 A。',
        },
        {
            id: 'destination.synthetic-b',
            kind: 'expedition',
            label: '测试秘境 B',
            description: '使用原型文件的第二个合成 Expedition 入口。',
            presentation: {
                position: {
                    x: 0.65,
                    y: 0.5,
                },
                icon: 'trial',
                regionLabel: '测试区域 B',
            },
            expeditionId: 'expedition.synthetic-b',
            mapId: 'map.synthetic-b',
            worldStateResourceId: 'world.seed.initial-state',
            worldStateFile: 'data/world/initial-state.json',
            starterDeckResourceId: 'deck.starter',
            starterDeckFile: 'data/decks/starter-deck.json',
            mapResourceId: 'phase01-prototype-map',
            mapFile: 'data/mijing/prototype-map.json',
            eventsResourceId: 'phase01-prototype-events',
            eventsFile: 'data/mijing/prototype-events.json',
            shopResourceId: 'phase01-prototype-shop',
            shopFile: 'data/mijing/prototype-shop.json',
            statusText: '进入测试秘境 B。',
        },
    ],
};

function isExpeditionDestination(destination: WorldMapDestination): destination is WorldMapExpeditionDestination {
    return destination.kind === 'expedition';
}

function createRunSnapshot(target: { expeditionId: string; mapId: string }): RunSnapshot {
    return {
        runId: 'run-route-identity',
        expeditionId: target.expeditionId,
        mapId: target.mapId,
        status: 'inProgress',
        currentNodeId: 'battle.mist-foxes',
        startingLoadout: {
            cards: [{ id: 'SX_YJZ_001', count: 1 }],
            items: [],
            spiritStones: 0,
        },
        carriedDeck: [{ id: 'SX_YJZ_001', count: 1 }],
        carriedItems: [],
        spiritStones: 12,
        visitedNodeIds: ['entrance.mountain-gate', 'battle.mist-foxes'],
        nodeStates: {},
        startedAt: '2026-05-08T00:00:00.000Z',
    };
}

describe('expeditionSceneLaunch', () => {
    it('provides safe defaults for direct ExpeditionScene starts', () => {
        expect(normalizeExpeditionSceneLaunchData(undefined)).toEqual({
            routeKey: `expedition:${DEFAULT_EXPEDITION_ID}:${DEFAULT_EXPEDITION_MAP_ID}`,
            expeditionId: DEFAULT_EXPEDITION_ID,
            mapId: DEFAULT_EXPEDITION_MAP_ID,
            ...DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS,
            ...DEFAULT_EXPEDITION_TARGET_FILES,
            cacheKeys: {
                worldState: `expeditionInitialState:${DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile}`,
                starterDeck: `expeditionStarterDeck:${DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile}`,
                map: `expeditionPrototypeMap:${DEFAULT_EXPEDITION_TARGET_FILES.mapFile}`,
                events: `expeditionPrototypeEvents:${DEFAULT_EXPEDITION_TARGET_FILES.eventsFile}`,
                shop: `expeditionPrototypeShop:${DEFAULT_EXPEDITION_TARGET_FILES.shopFile}`,
            },
        });
    });

    it('resolves direct default Expedition targets through stable catalog resource ids while preserving file aliases and cache keys', () => {
        const launch = normalizeExpeditionSceneLaunchData();

        expect(resolveExpeditionSceneCatalogResources(contentCatalogJson, launch)).toEqual({
            worldState: {
                resourceId: 'world.seed.initial-state',
                publicPath: DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile,
                cacheKey: launch.cacheKeys.worldState,
            },
            starterDeck: {
                resourceId: 'deck.starter',
                publicPath: DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile,
                cacheKey: launch.cacheKeys.starterDeck,
            },
            map: {
                resourceId: 'phase01-prototype-map',
                publicPath: DEFAULT_EXPEDITION_TARGET_FILES.mapFile,
                cacheKey: launch.cacheKeys.map,
            },
            events: {
                resourceId: 'phase01-prototype-events',
                publicPath: DEFAULT_EXPEDITION_TARGET_FILES.eventsFile,
                cacheKey: launch.cacheKeys.events,
            },
            shop: {
                resourceId: 'phase01-prototype-shop',
                publicPath: DEFAULT_EXPEDITION_TARGET_FILES.shopFile,
                cacheKey: launch.cacheKeys.shop,
            },
        });
    });

    it('rejects catalog resource ids whose public paths do not match Expedition compatibility file aliases', () => {
        const launch = normalizeExpeditionSceneLaunchData({
            worldStateResourceId: 'world.seed.initial-state',
            worldStateFile: 'data/world/other-initial-state.json',
        });

        expect(() => resolveExpeditionSceneCatalogResources(contentCatalogJson, launch)).toThrow(
            'ExpeditionScene worldStateResourceId world.seed.initial-state resolved to catalog publicPath data/world/initial-state.json, but launch worldStateFile is data/world/other-initial-state.json.',
        );
    });

    it('resolves compatibility-only custom Expedition target files through catalog public paths when resource ids are absent', () => {
        const launch = normalizeExpeditionSceneLaunchData({
            worldStateFile: 'data/world/custom-state.json',
            starterDeckFile: 'data/decks/custom-starter.json',
            mapFile: 'data/mijing/custom-map.json',
            eventsFile: 'data/mijing/custom-events.json',
            shopFile: 'data/mijing/custom-shop.json',
        });
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'world.seed.custom-state',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/custom-state.json',
                },
                {
                    resourceId: 'deck.custom-starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/custom-starter.json',
                },
                {
                    resourceId: 'map.custom',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/custom-map.json',
                },
                {
                    resourceId: 'events.custom',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/custom-events.json',
                },
                {
                    resourceId: 'shop.custom',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/custom-shop.json',
                },
            ],
        };

        expect(resolveExpeditionSceneCatalogResources(catalog, launch)).toEqual({
            worldState: {
                resourceId: 'world.seed.custom-state',
                publicPath: 'data/world/custom-state.json',
                cacheKey: 'expeditionInitialState:data/world/custom-state.json',
            },
            starterDeck: {
                resourceId: 'deck.custom-starter',
                publicPath: 'data/decks/custom-starter.json',
                cacheKey: 'expeditionStarterDeck:data/decks/custom-starter.json',
            },
            map: {
                resourceId: 'map.custom',
                publicPath: 'data/mijing/custom-map.json',
                cacheKey: 'expeditionPrototypeMap:data/mijing/custom-map.json',
            },
            events: {
                resourceId: 'events.custom',
                publicPath: 'data/mijing/custom-events.json',
                cacheKey: 'expeditionPrototypeEvents:data/mijing/custom-events.json',
            },
            shop: {
                resourceId: 'shop.custom',
                publicPath: 'data/mijing/custom-shop.json',
                cacheKey: 'expeditionPrototypeShop:data/mijing/custom-shop.json',
            },
        });
    });

    it('refreshes catalog-resolved preload resources when the same ExpeditionScene instance restarts for another route', async () => {
        mock.module('phaser', () => {
            class FakeScene {
                constructor(_sceneKey?: string) {}
            }

            class FakeContainer {
                protected scene: unknown;

                constructor(scene: unknown) {
                    this.scene = scene;
                }

                add(): this {
                    return this;
                }

                destroy(): void {}

                setDepth(): this {
                    return this;
                }
            }

            return {
                Scene: FakeScene,
                Events: {
                    EventEmitter: class {
                        emit(): boolean {
                            return true;
                        }

                        on(): this {
                            return this;
                        }

                        off(): this {
                            return this;
                        }
                    },
                },
                GameObjects: {
                    Container: FakeContainer,
                    Rectangle: class {},
                    Text: class {},
                },
            };
        });
        let ExpeditionScene: new () => unknown;
        try {
            ({ ExpeditionScene } = await import(`./ExpeditionScene${'?catalog-resource-refresh-test'}`));
        } finally {
            mock.restore();
        }
        const scene = new ExpeditionScene() as unknown as {
            init: (data?: unknown) => void;
            preload: () => void;
            cache: { json: { get: (key: string) => unknown } };
            load: { json: (cacheKey: string, publicPath: string) => void };
        };
        const loadedPublicPaths: string[] = [];
        scene.cache = {
            json: {
                get: (key: string): unknown => {
                    expect(key).toBe('contentCatalog');
                    return contentCatalogJson;
                },
            },
        };
        scene.load = {
            json: (_cacheKey: string, publicPath: string): void => {
                loadedPublicPaths.push(publicPath);
            },
        };

        scene.init();
        scene.preload();
        expect(loadedPublicPaths).toContain('data/mijing/prototype-map.json');

        loadedPublicPaths.length = 0;
        scene.init({
            source: 'worldMap',
            destinationId: 'destination.qingyun-jade-cave-trial',
            expeditionId: 'phase01-jade-cave-expedition',
            mapId: 'phase01-jade-cave-map',
            mapResourceId: 'phase01-jade-cave-map',
            mapFile: 'data/mijing/jade-cave-map.json',
        });
        scene.preload();

        expect(loadedPublicPaths).toContain('data/mijing/jade-cave-map.json');
        expect(loadedPublicPaths).not.toContain('data/mijing/prototype-map.json');
    });

    it('normalizes world-map Expedition payloads as the target config owner', () => {
        expect(normalizeExpeditionSceneLaunchData({
            source: 'worldMap',
            destinationId: 'destination.test-expedition',
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            worldStateResourceId: 'world.seed.test-initial-state',
            worldStateFile: 'data/world/test-initial-state.json',
            starterDeckResourceId: 'deck.test-starter',
            starterDeckFile: 'data/decks/test-starter.json',
            mapResourceId: 'map.test',
            mapFile: 'data/mijing/test-map.json',
            eventsResourceId: 'events.test',
            eventsFile: 'data/mijing/test-events.json',
            shopResourceId: 'shop.test',
            shopFile: 'data/mijing/test-shop.json',
            statusText: '测试秘境入口。',
        })).toEqual({
            source: 'worldMap',
            destinationId: 'destination.test-expedition',
            routeKey: 'expedition:expedition.test:map.test',
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            worldStateResourceId: 'world.seed.test-initial-state',
            worldStateFile: 'data/world/test-initial-state.json',
            starterDeckResourceId: 'deck.test-starter',
            starterDeckFile: 'data/decks/test-starter.json',
            mapResourceId: 'map.test',
            mapFile: 'data/mijing/test-map.json',
            eventsResourceId: 'events.test',
            eventsFile: 'data/mijing/test-events.json',
            shopResourceId: 'shop.test',
            shopFile: 'data/mijing/test-shop.json',
            cacheKeys: {
                worldState: 'expeditionInitialState:data/world/test-initial-state.json',
                starterDeck: 'expeditionStarterDeck:data/decks/test-starter.json',
                map: 'expeditionPrototypeMap:data/mijing/test-map.json',
                events: 'expeditionPrototypeEvents:data/mijing/test-events.json',
                shop: 'expeditionPrototypeShop:data/mijing/test-shop.json',
            },
            statusText: '测试秘境入口。',
        });
    });

    it('creates a pure target config without normalized cache metadata', () => {
        const normalizedLaunch = normalizeExpeditionSceneLaunchData({
            source: 'worldMap',
            destinationId: 'destination.custom',
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapResourceId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
        });

        expect(createExpeditionTargetConfig(normalizedLaunch)).toEqual({
            routeKey: 'expedition:expedition.custom:map.custom',
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            worldStateResourceId: DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.worldStateResourceId,
            worldStateFile: DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile,
            starterDeckResourceId: DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.starterDeckResourceId,
            starterDeckFile: DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile,
            mapResourceId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
            eventsResourceId: DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.eventsResourceId,
            eventsFile: DEFAULT_EXPEDITION_TARGET_FILES.eventsFile,
            shopResourceId: DEFAULT_EXPEDITION_TARGET_RESOURCE_IDS.shopResourceId,
            shopFile: DEFAULT_EXPEDITION_TARGET_FILES.shopFile,
        });
    });

    it('preserves target config carried back from an expedition battle result', () => {
        const targetConfig = createExpeditionTargetConfig(normalizeExpeditionSceneLaunchData({
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapResourceId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
            eventsResourceId: 'events.custom',
            eventsFile: 'data/mijing/custom-events.json',
            shopResourceId: 'shop.custom',
            shopFile: 'data/mijing/custom-shop.json',
        }));

        expect(normalizeExpeditionSceneLaunchData({
            battleResult: {
                runId: 'run-custom',
                nodeId: 'battle.custom',
                nodeType: 'battle',
                encounterId: 'encounter.custom',
                encounterFile: 'data/encounters/custom.json',
                victory: true,
                outcome: 'battle-victory',
                completedAt: '2026-05-09T00:00:00.000Z',
                targetConfig,
            },
        })).toMatchObject({
            routeKey: targetConfig.routeKey,
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapResourceId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
            eventsResourceId: 'events.custom',
            eventsFile: 'data/mijing/custom-events.json',
            shopResourceId: 'shop.custom',
            shopFile: 'data/mijing/custom-shop.json',
            battleResult: { targetConfig },
        });
    });

    it('preserves target config through WorldMapScene to ExpeditionScene to BattleScene and back', () => {
        const worldMap = validateWorldMapDefinition(worldMapWithSyntheticExpeditionTargets);
        const worldMapIntent = createWorldMapDestinationIntent(worldMap, 'destination.synthetic-b');

        if (worldMapIntent.sceneKey !== 'ExpeditionScene') {
            throw new Error('Expected synthetic destination to launch ExpeditionScene.');
        }

        const expeditionLaunch = normalizeExpeditionSceneLaunchData(worldMapIntent.payload);
        const targetConfig = createExpeditionTargetConfig(expeditionLaunch);
        const battleNode = prototypeMapJson.nodes.find((node) => node.id === 'battle.mist-foxes') as ExpeditionEncounterMapNode;
        const battlePayload = createBattleLaunchPayload(createRunSnapshot(targetConfig), battleNode, targetConfig);
        const battleResult = createExpeditionBattleCompleteEvent(
            battlePayload,
            true,
            '2026-05-09T01:00:00.000Z',
        );
        const returnLaunch = normalizeExpeditionSceneLaunchData({ battleResult });

        expect(expeditionLaunch).toMatchObject({
            source: 'worldMap',
            destinationId: 'destination.synthetic-b',
            expeditionId: 'expedition.synthetic-b',
            mapId: 'map.synthetic-b',
            worldStateResourceId: 'world.seed.initial-state',
            starterDeckResourceId: 'deck.starter',
            mapResourceId: 'phase01-prototype-map',
            eventsResourceId: 'phase01-prototype-events',
            shopResourceId: 'phase01-prototype-shop',
        });
        expect(battlePayload.targetConfig).toEqual(targetConfig);
        expect(battleResult.targetConfig).toEqual(targetConfig);
        expect(returnLaunch).toMatchObject({
            expeditionId: 'expedition.synthetic-b',
            mapId: 'map.synthetic-b',
            worldStateResourceId: 'world.seed.initial-state',
            starterDeckResourceId: 'deck.starter',
            mapResourceId: 'phase01-prototype-map',
            mapFile: 'data/mijing/prototype-map.json',
            eventsResourceId: 'phase01-prototype-events',
            eventsFile: 'data/mijing/prototype-events.json',
            shopResourceId: 'phase01-prototype-shop',
            shopFile: 'data/mijing/prototype-shop.json',
            battleResult: { targetConfig },
        });
    });

    it('normalizes the checked-in Expedition world-map destinations to independent route keys', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);
        const expeditionDestinations = worldMap.destinations.filter(isExpeditionDestination);

        expect(expeditionDestinations.map((destination) => {
            const intent = createWorldMapDestinationIntent(worldMap, destination.id);

            if (intent.sceneKey !== 'ExpeditionScene') {
                throw new Error(`Expected ${destination.id} to launch ExpeditionScene.`);
            }

            const launch = normalizeExpeditionSceneLaunchData(intent.payload);

            return {
                destinationId: launch.destinationId,
                expeditionId: launch.expeditionId,
                mapId: launch.mapId,
                routeKey: launch.routeKey,
                worldStateResourceId: launch.worldStateResourceId,
                starterDeckResourceId: launch.starterDeckResourceId,
                mapResourceId: launch.mapResourceId,
                mapFile: launch.mapFile,
                eventsResourceId: launch.eventsResourceId,
                eventsFile: launch.eventsFile,
                shopResourceId: launch.shopResourceId,
                shopFile: launch.shopFile,
            };
        })).toEqual([
            {
                destinationId: 'destination.qingyun-outer-mountain-trial',
                expeditionId: 'phase01-first-playable-expedition',
                mapId: 'phase01-prototype-map',
                routeKey: 'expedition:phase01-first-playable-expedition:phase01-prototype-map',
                worldStateResourceId: 'world.seed.initial-state',
                starterDeckResourceId: 'deck.starter',
                mapResourceId: 'phase01-prototype-map',
                mapFile: 'data/mijing/prototype-map.json',
                eventsResourceId: 'phase01-prototype-events',
                eventsFile: 'data/mijing/prototype-events.json',
                shopResourceId: 'phase01-prototype-shop',
                shopFile: 'data/mijing/prototype-shop.json',
            },
            {
                destinationId: 'destination.qingyun-jade-cave-trial',
                expeditionId: 'phase01-jade-cave-expedition',
                mapId: 'phase01-jade-cave-map',
                routeKey: 'expedition:phase01-jade-cave-expedition:phase01-jade-cave-map',
                worldStateResourceId: 'world.seed.initial-state',
                starterDeckResourceId: 'deck.starter',
                mapResourceId: 'phase01-jade-cave-map',
                mapFile: 'data/mijing/jade-cave-map.json',
                eventsResourceId: 'phase01-prototype-events',
                eventsFile: 'data/mijing/prototype-events.json',
                shopResourceId: 'phase01-prototype-shop',
                shopFile: 'data/mijing/prototype-shop.json',
            },
        ]);
    });
});
