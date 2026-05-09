import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import worldMapJson from '../../../../public/data/world/world-map.json';
import type { ExpeditionMapDefinition } from '../../types/expedition';
import {
    clampWorldMapSurfacePosition,
    createWorldMapInitialSurfacePosition,
    createWorldMapReturnIntent,
    createWorldMapDestinationIntent,
    getWorldMapDestinationSurfacePosition,
    type WorldMapDestination,
    type WorldMapExpeditionDestination,
    validateWorldMapDefinition,
} from './worldMap';

const validWorldMapFixture = {
    id: 'worldmap.test',
    title: '测试大地图',
    subtitle: '测试入口',
    description: '用于验证大地图数据合同的最小 fixture。',
    defaultDestinationId: 'destination.test-hub',
    presentation: {
        mapWidth: 1400,
        mapHeight: 900,
        initialCenter: {
            x: 0.5,
            y: 0.5,
        },
    },
    destinations: [
        {
            id: 'destination.test-hub',
            kind: 'hub',
            label: '测试城镇',
            description: '进入测试 Hub。',
            presentation: {
                position: {
                    x: 0.25,
                    y: 0.7,
                },
                icon: 'town',
                regionLabel: '测试山脚',
            },
            hubId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            statusText: '从大地图进入测试城镇。',
        },
        {
            id: 'destination.test-expedition',
            kind: 'expedition',
            label: '测试秘境',
            description: '进入测试 Expedition。',
            presentation: {
                position: {
                    x: 0.72,
                    y: 0.38,
                },
                icon: 'trial',
                regionLabel: '测试秘境',
            },
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            worldStateFile: 'data/world/test-initial-state.json',
            starterDeckFile: 'data/decks/test-starter-deck.json',
            mapFile: 'data/mijing/test-map.json',
            eventsFile: 'data/mijing/test-events.json',
            shopFile: 'data/mijing/test-shop.json',
            statusText: '从大地图进入测试秘境。',
        },
    ],
};

function isExpeditionDestination(destination: WorldMapDestination): destination is WorldMapExpeditionDestination {
    return destination.kind === 'expedition';
}

function readPublicJsonFile<T>(publicFile: string): T {
    return JSON.parse(readFileSync(join('public', publicFile), 'utf8')) as T;
}

describe('world map content contract', () => {
    it('validates the checked-in world map with Qingyun town, sect gate, teahouse, and two Expedition destinations', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);

        expect(worldMap.id).toBe('worldmap.qingyun-region');
        expect(worldMap.defaultDestinationId).toBe('destination.qingyun-town');
        expect(worldMap.presentation).toEqual({
            mapWidth: 1640,
            mapHeight: 980,
            initialCenter: {
                x: 0.52,
                y: 0.55,
            },
        });
        expect(worldMap.destinations.map((destination) => ({
            id: destination.id,
            kind: destination.kind,
            label: destination.label,
            presentation: destination.presentation,
            target: destination.kind === 'hub'
                ? {
                    hubId: destination.hubId,
                    hubFile: destination.hubFile,
                    targetLocationId: destination.targetLocationId,
                }
                : {
                    mapFile: destination.mapFile,
                },
        }))).toEqual([
            {
                id: 'destination.qingyun-town',
                kind: 'hub',
                label: '青云镇',
                presentation: {
                    position: {
                        x: 0.3,
                        y: 0.66,
                    },
                    icon: 'town',
                    regionLabel: '山麓城镇',
                },
                target: {
                    hubId: 'hub.qingyun-town',
                    hubFile: 'data/hub/town-shell.json',
                    targetLocationId: undefined,
                },
            },
            {
                id: 'destination.qingyun-sect-gate',
                kind: 'hub',
                label: '青云宗山门',
                presentation: {
                    position: {
                        x: 0.56,
                        y: 0.29,
                    },
                    icon: 'sect-gate',
                    regionLabel: '青云山门',
                },
                target: {
                    hubId: 'hub.qingyun-sect-gate',
                    hubFile: 'data/hub/qingyun-sect-gate.json',
                    targetLocationId: undefined,
                },
            },
            {
                id: 'destination.qingyun-town-teahouse',
                kind: 'hub',
                label: '集市茶棚',
                presentation: {
                    position: {
                        x: 0.38,
                        y: 0.73,
                    },
                    icon: 'teahouse',
                    regionLabel: '青云镇集市',
                },
                target: {
                    hubId: 'hub.qingyun-town',
                    hubFile: 'data/hub/town-shell.json',
                    targetLocationId: 'location.qingyun-town.teahouse',
                },
            },
            {
                id: 'destination.qingyun-outer-mountain-trial',
                kind: 'expedition',
                label: '青云外山试炼',
                presentation: {
                    position: {
                        x: 0.68,
                        y: 0.53,
                    },
                    icon: 'trial',
                    regionLabel: '外山秘境',
                },
                target: {
                    mapFile: 'data/mijing/prototype-map.json',
                },
            },
            {
                id: 'destination.qingyun-jade-cave-trial',
                kind: 'expedition',
                label: '青玉洞试炼',
                presentation: {
                    position: {
                        x: 0.78,
                        y: 0.73,
                    },
                    icon: 'cave',
                    regionLabel: '青玉洞支脉',
                },
                target: {
                    mapFile: 'data/mijing/jade-cave-map.json',
                },
            },
        ]);
    });

    it('keeps checked-in Expedition routes distinct by expeditionId and mapId while using explicit target files', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);
        const expeditionDestinations = worldMap.destinations.filter(isExpeditionDestination);

        expect(expeditionDestinations.map((destination) => ({
            destinationId: destination.id,
            expeditionId: destination.expeditionId,
            mapId: destination.mapId,
            worldStateFile: destination.worldStateFile,
            starterDeckFile: destination.starterDeckFile,
            mapFile: destination.mapFile,
            eventsFile: destination.eventsFile,
            shopFile: destination.shopFile,
        }))).toEqual([
            {
                destinationId: 'destination.qingyun-outer-mountain-trial',
                expeditionId: 'phase01-first-playable-expedition',
                mapId: 'phase01-prototype-map',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapFile: 'data/mijing/prototype-map.json',
                eventsFile: 'data/mijing/prototype-events.json',
                shopFile: 'data/mijing/prototype-shop.json',
            },
            {
                destinationId: 'destination.qingyun-jade-cave-trial',
                expeditionId: 'phase01-jade-cave-expedition',
                mapId: 'phase01-jade-cave-map',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapFile: 'data/mijing/jade-cave-map.json',
                eventsFile: 'data/mijing/prototype-events.json',
                shopFile: 'data/mijing/prototype-shop.json',
            },
        ]);
        expect(new Set(expeditionDestinations.map((destination) => destination.id)).size).toBe(expeditionDestinations.length);
        expect(new Set(expeditionDestinations.map((destination) => destination.expeditionId)).size).toBe(expeditionDestinations.length);
        expect(new Set(expeditionDestinations.map((destination) => destination.mapId)).size).toBe(expeditionDestinations.length);

        for (const destination of expeditionDestinations) {
            const mapDefinition = readPublicJsonFile<ExpeditionMapDefinition>(destination.mapFile);

            expect(mapDefinition.id).toBe(destination.mapId);
        }
    });

    it('keeps full Hub routes distinct while allowing direct Hub-location routes to reuse their parent Hub file', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);
        const hubDestinations = worldMap.destinations.filter((destination) => destination.kind === 'hub');
        const fullHubRoutes = hubDestinations.filter((destination) => !destination.targetLocationId);
        const directLocationRoutes = hubDestinations.filter((destination) => destination.targetLocationId);

        expect(new Set(hubDestinations.map((destination) => destination.id)).size).toBe(hubDestinations.length);
        expect(fullHubRoutes.map((destination) => ({
            destinationId: destination.id,
            hubId: destination.hubId,
            hubFile: destination.hubFile,
        }))).toEqual([
            {
                destinationId: 'destination.qingyun-town',
                hubId: 'hub.qingyun-town',
                hubFile: 'data/hub/town-shell.json',
            },
            {
                destinationId: 'destination.qingyun-sect-gate',
                hubId: 'hub.qingyun-sect-gate',
                hubFile: 'data/hub/qingyun-sect-gate.json',
            },
        ]);
        expect(new Set(fullHubRoutes.map((destination) => destination.hubId)).size).toBe(fullHubRoutes.length);
        expect(new Set(fullHubRoutes.map((destination) => destination.hubFile)).size).toBe(fullHubRoutes.length);
        expect(directLocationRoutes.map((destination) => ({
            destinationId: destination.id,
            hubId: destination.hubId,
            hubFile: destination.hubFile,
            targetLocationId: destination.targetLocationId,
        }))).toEqual([
            {
                destinationId: 'destination.qingyun-town-teahouse',
                hubId: 'hub.qingyun-town',
                hubFile: 'data/hub/town-shell.json',
                targetLocationId: 'location.qingyun-town.teahouse',
            },
        ]);
    });

    it('rejects duplicate destination ids before any scene launch code runs', () => {
        const duplicateMap = {
            ...validWorldMapFixture,
            destinations: [
                validWorldMapFixture.destinations[0],
                {
                    ...validWorldMapFixture.destinations[1],
                    id: 'destination.test-hub',
                },
            ],
        };

        expect(() => validateWorldMapDefinition(duplicateMap)).toThrow(
            'World map worldmap.test has duplicate destination id: destination.test-hub',
        );
    });

    it('rejects unsupported destination kinds instead of silently routing them', () => {
        const unsupportedKindMap = {
            ...validWorldMapFixture,
            destinations: [
                {
                    ...validWorldMapFixture.destinations[0],
                    kind: 'dungeon',
                },
            ],
        };

        expect(() => validateWorldMapDefinition(unsupportedKindMap)).toThrow(
            'World map destination destination.test-hub uses unsupported kind: dungeon',
        );
    });

    it('creates launch intents for HubScene and ExpeditionScene from destination data', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);

        expect(createWorldMapDestinationIntent(worldMap, 'destination.qingyun-town')).toEqual({
            kind: 'startScene',
            sceneKey: 'HubScene',
            payload: {
                source: 'worldMap',
                destinationId: 'destination.qingyun-town',
                hubId: 'hub.qingyun-town',
                hubFile: 'data/hub/town-shell.json',
                statusText: '从大地图进入青云镇。',
            },
        });
        expect(createWorldMapDestinationIntent(worldMap, 'destination.qingyun-sect-gate')).toEqual({
            kind: 'startScene',
            sceneKey: 'HubScene',
            payload: {
                source: 'worldMap',
                destinationId: 'destination.qingyun-sect-gate',
                hubId: 'hub.qingyun-sect-gate',
                hubFile: 'data/hub/qingyun-sect-gate.json',
                statusText: '从大地图抵达青云宗山门。',
            },
        });
        expect(createWorldMapDestinationIntent(worldMap, 'destination.qingyun-town-teahouse')).toEqual({
            kind: 'startScene',
            sceneKey: 'HubScene',
            payload: {
                source: 'worldMap',
                destinationId: 'destination.qingyun-town-teahouse',
                hubId: 'hub.qingyun-town',
                hubFile: 'data/hub/town-shell.json',
                targetLocationId: 'location.qingyun-town.teahouse',
                statusText: '从大地图直接前往青云镇集市茶棚。',
            },
        });
        expect(createWorldMapDestinationIntent(worldMap, 'destination.qingyun-outer-mountain-trial')).toEqual({
            kind: 'startScene',
            sceneKey: 'ExpeditionScene',
            payload: {
                source: 'worldMap',
                destinationId: 'destination.qingyun-outer-mountain-trial',
                expeditionId: 'phase01-first-playable-expedition',
                mapId: 'phase01-prototype-map',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapFile: 'data/mijing/prototype-map.json',
                eventsFile: 'data/mijing/prototype-events.json',
                shopFile: 'data/mijing/prototype-shop.json',
                statusText: '从大地图进入青云外山试炼。',
            },
        });
        expect(createWorldMapDestinationIntent(worldMap, 'destination.qingyun-jade-cave-trial')).toEqual({
            kind: 'startScene',
            sceneKey: 'ExpeditionScene',
            payload: {
                source: 'worldMap',
                destinationId: 'destination.qingyun-jade-cave-trial',
                expeditionId: 'phase01-jade-cave-expedition',
                mapId: 'phase01-jade-cave-map',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapFile: 'data/mijing/jade-cave-map.json',
                eventsFile: 'data/mijing/prototype-events.json',
                shopFile: 'data/mijing/prototype-shop.json',
                statusText: '从大地图进入青玉洞试炼。',
            },
        });
    });

    it('rejects destinations that omit required target data files', () => {
        const hubWithoutFile = {
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[0],
                hubFile: '',
            }],
        };

        expect(() => validateWorldMapDefinition(hubWithoutFile)).toThrow(
            'World map destination destination.test-hub hubFile must be a non-empty string.',
        );

        const hubWithBlankTargetLocation = {
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[0],
                targetLocationId: '',
            }],
        };

        expect(() => validateWorldMapDefinition(hubWithBlankTargetLocation)).toThrow(
            'World map destination destination.test-hub targetLocationId must be a non-empty string when provided.',
        );

        const expeditionWithoutMapFile = {
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[1],
                mapFile: '',
            }],
        };

        expect(() => validateWorldMapDefinition(expeditionWithoutMapFile)).toThrow(
            'World map destination destination.test-expedition mapFile must be a non-empty string.',
        );
    });

    it('rejects missing or invalid spatial presentation metadata before rendering markers', () => {
        expect(() => validateWorldMapDefinition({
            ...validWorldMapFixture,
            presentation: {
                ...validWorldMapFixture.presentation,
                mapWidth: 0,
            },
        })).toThrow('World map presentation.mapWidth must be a positive number.');

        expect(() => validateWorldMapDefinition({
            ...validWorldMapFixture,
            presentation: {
                ...validWorldMapFixture.presentation,
                initialCenter: {
                    x: 1.2,
                    y: 0.5,
                },
            },
        })).toThrow('World map presentation.initialCenter.x must be between 0 and 1.');

        expect(() => validateWorldMapDefinition({
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[0],
                presentation: undefined,
            }],
        })).toThrow('World map destination destination.test-hub presentation must be an object.');

        expect(() => validateWorldMapDefinition({
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[0],
                presentation: {
                    ...validWorldMapFixture.destinations[0].presentation,
                    position: {
                        x: -0.1,
                        y: 0.7,
                    },
                },
            }],
        })).toThrow('World map destination destination.test-hub presentation.position.x must be between 0 and 1.');

        expect(() => validateWorldMapDefinition({
            ...validWorldMapFixture,
            destinations: [{
                ...validWorldMapFixture.destinations[0],
                presentation: {
                    ...validWorldMapFixture.destinations[0].presentation,
                    icon: '',
                },
            }],
        })).toThrow('World map destination destination.test-hub presentation.icon must be a non-empty string.');
    });

    it('converts normalized marker coordinates into draggable map surface positions', () => {
        const worldMap = validateWorldMapDefinition(validWorldMapFixture);
        const destination = worldMap.destinations[1];

        expect(getWorldMapDestinationSurfacePosition(worldMap, destination)).toEqual({
            x: 1008,
            y: 342,
        });
    });

    it('centers and clamps a draggable world map surface against the viewport', () => {
        const worldMap = validateWorldMapDefinition(validWorldMapFixture);
        const viewport = {
            left: 100,
            top: 80,
            width: 700,
            height: 500,
        };

        expect(createWorldMapInitialSurfacePosition(worldMap.presentation, viewport)).toEqual({
            x: -250,
            y: -120,
        });
        expect(clampWorldMapSurfacePosition(worldMap.presentation, viewport, {
            x: 500,
            y: 300,
        })).toEqual({
            x: 100,
            y: 80,
        });
        expect(clampWorldMapSurfacePosition(worldMap.presentation, viewport, {
            x: -900,
            y: -600,
        })).toEqual({
            x: -600,
            y: -320,
        });
    });

    it('fails launch intent resolution for missing destination ids', () => {
        const worldMap = validateWorldMapDefinition(validWorldMapFixture);

        expect(() => createWorldMapDestinationIntent(worldMap, 'destination.missing')).toThrow(
            'World map destination is missing: destination.missing',
        );
    });

    it('creates return intents that let route scenes go back to the WorldMapScene without owning resume state', () => {
        expect(createWorldMapReturnIntent({
            source: 'hub',
            statusText: '已从青云镇返回大地图；再次进入城镇会恢复保存位置。',
        })).toEqual({
            kind: 'startScene',
            sceneKey: 'WorldMapScene',
            payload: {
                source: 'hub',
                statusText: '已从青云镇返回大地图；再次进入城镇会恢复保存位置。',
            },
        });

        expect(createWorldMapReturnIntent({
            source: 'expedition',
            statusText: '已从青云外山试炼返回大地图；再次进入秘境会继续当前探索。',
        })).toEqual({
            kind: 'startScene',
            sceneKey: 'WorldMapScene',
            payload: {
                source: 'expedition',
                statusText: '已从青云外山试炼返回大地图；再次进入秘境会继续当前探索。',
            },
        });
    });
});
