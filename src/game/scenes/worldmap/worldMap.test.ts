import { describe, expect, it } from 'bun:test';

import worldMapJson from '../../../../public/data/world/world-map.json';
import {
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
            statusText: '从大地图进入测试城镇。',
        },
        {
            id: 'destination.test-expedition',
            kind: 'expedition',
            label: '测试秘境',
            description: '进入测试 Expedition。',
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            statusText: '从大地图进入测试秘境。',
        },
    ],
};

describe('world map content contract', () => {
    it('validates the checked-in world map with Qingyun town and outer-mountain trial destinations', () => {
        const worldMap = validateWorldMapDefinition(worldMapJson);

        expect(worldMap.id).toBe('worldmap.qingyun-region');
        expect(worldMap.defaultDestinationId).toBe('destination.qingyun-town');
        expect(worldMap.destinations.map((destination) => ({
            id: destination.id,
            kind: destination.kind,
            label: destination.label,
        }))).toEqual([
            {
                id: 'destination.qingyun-town',
                kind: 'hub',
                label: '青云镇',
            },
            {
                id: 'destination.qingyun-outer-mountain-trial',
                kind: 'expedition',
                label: '青云外山试炼',
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
                statusText: '从大地图进入青云镇。',
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
                statusText: '从大地图进入青云外山试炼。',
            },
        });
    });

    it('fails launch intent resolution for missing destination ids', () => {
        const worldMap = validateWorldMapDefinition(validWorldMapFixture);

        expect(() => createWorldMapDestinationIntent(worldMap, 'destination.missing')).toThrow(
            'World map destination is missing: destination.missing',
        );
    });
});
