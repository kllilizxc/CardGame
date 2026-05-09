import { describe, expect, it } from 'bun:test';

import {
    DEFAULT_EXPEDITION_ID,
    DEFAULT_EXPEDITION_MAP_ID,
    DEFAULT_EXPEDITION_TARGET_FILES,
    createExpeditionTargetConfig,
    normalizeExpeditionSceneLaunchData,
} from './expeditionSceneLaunch';

describe('expeditionSceneLaunch', () => {
    it('provides safe defaults for direct ExpeditionScene starts', () => {
        expect(normalizeExpeditionSceneLaunchData(undefined)).toEqual({
            expeditionId: DEFAULT_EXPEDITION_ID,
            mapId: DEFAULT_EXPEDITION_MAP_ID,
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

    it('normalizes world-map Expedition payloads as the target config owner', () => {
        expect(normalizeExpeditionSceneLaunchData({
            source: 'worldMap',
            destinationId: 'destination.test-expedition',
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            worldStateFile: 'data/world/test-initial-state.json',
            starterDeckFile: 'data/decks/test-starter.json',
            mapFile: 'data/mijing/test-map.json',
            eventsFile: 'data/mijing/test-events.json',
            shopFile: 'data/mijing/test-shop.json',
            statusText: '测试秘境入口。',
        })).toEqual({
            source: 'worldMap',
            destinationId: 'destination.test-expedition',
            expeditionId: 'expedition.test',
            mapId: 'map.test',
            worldStateFile: 'data/world/test-initial-state.json',
            starterDeckFile: 'data/decks/test-starter.json',
            mapFile: 'data/mijing/test-map.json',
            eventsFile: 'data/mijing/test-events.json',
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
            mapFile: 'data/mijing/custom-map.json',
        });

        expect(createExpeditionTargetConfig(normalizedLaunch)).toEqual({
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            worldStateFile: DEFAULT_EXPEDITION_TARGET_FILES.worldStateFile,
            starterDeckFile: DEFAULT_EXPEDITION_TARGET_FILES.starterDeckFile,
            mapFile: 'data/mijing/custom-map.json',
            eventsFile: DEFAULT_EXPEDITION_TARGET_FILES.eventsFile,
            shopFile: DEFAULT_EXPEDITION_TARGET_FILES.shopFile,
        });
    });

    it('preserves target config carried back from an expedition battle result', () => {
        const targetConfig = createExpeditionTargetConfig(normalizeExpeditionSceneLaunchData({
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
            eventsFile: 'data/mijing/custom-events.json',
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
            expeditionId: 'expedition.custom',
            mapId: 'map.custom',
            mapFile: 'data/mijing/custom-map.json',
            eventsFile: 'data/mijing/custom-events.json',
            shopFile: 'data/mijing/custom-shop.json',
            battleResult: { targetConfig },
        });
    });
});
