import { describe, expect, it } from 'bun:test';

import worldMapJson from '../../../../public/data/world/world-map.json';
import {
    createWorldMapReturnIntent,
    createWorldMapDestinationIntent,
    validateWorldMapDefinition,
} from './worldMap';

const validWorldMapFixture = {
    id: 'worldmap.test',
    title: '测试大地图',
    subtitle: '测试入口',
    description: '用于验证大地图数据合同的最小 fixture。',
    defaultDestinationId: 'destination.test-hub',
    destinations: [
        {
            id: 'destination.test-hub',
            kind: 'hub',
            label: '测试城镇',
            description: '进入测试 Hub。',
            hubId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            statusText: '从大地图进入测试城镇。',
        },
        {
            id: 'destination.test-expedition',
            kind: 'expedition',
            label: '测试秘境',
            description: '进入测试 Expedition。',
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

describe('world map content contract', () => {
    it('validates the checked-in world map with Qingyun town, sect gate, teahouse, and outer-mountain trial destinations', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);

        expect(worldMap.id).toBe('worldmap.qingyun-region');
        expect(worldMap.defaultDestinationId).toBe('destination.qingyun-town');
        expect(worldMap.destinations.map((destination) => ({
            id: destination.id,
            kind: destination.kind,
            label: destination.label,
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
                target: {
                    mapFile: 'data/mijing/prototype-map.json',
                },
            },
        ]);
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
