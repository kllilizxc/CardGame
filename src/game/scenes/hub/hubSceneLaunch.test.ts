import { describe, expect, it } from 'bun:test';

import {
    DEFAULT_HUB_FILE,
    DEFAULT_HUB_ID,
    normalizeHubSceneLaunchData,
} from './hubSceneLaunch';

describe('hubSceneLaunch', () => {
    it('provides safe defaults for direct HubScene starts', () => {
        expect(normalizeHubSceneLaunchData(undefined)).toEqual({
            hubId: DEFAULT_HUB_ID,
            hubFile: DEFAULT_HUB_FILE,
            hubCacheKey: `hubTownShell:${DEFAULT_HUB_FILE}`,
        });
    });

    it('normalizes world-map Hub payloads without losing route identity', () => {
        expect(normalizeHubSceneLaunchData({
            source: 'worldMap',
            destinationId: 'destination.test-hub-location',
            hubId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            targetLocationId: 'location.test-town.teahouse',
            statusText: '从测试大地图进入指定 Hub 地点。',
        })).toEqual({
            source: 'worldMap',
            destinationId: 'destination.test-hub-location',
            hubId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            hubCacheKey: 'hubTownShell:data/hub/test-town.json',
            targetLocationId: 'location.test-town.teahouse',
            statusText: '从测试大地图进入指定 Hub 地点。',
        });
    });
});
