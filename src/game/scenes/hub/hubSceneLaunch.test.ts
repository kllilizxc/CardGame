import { describe, expect, it } from 'bun:test';

import {
    DEFAULT_HUB_FILE,
    DEFAULT_HUB_ID,
    assertHubSceneCatalogResourceMatchesLoadedHub,
    normalizeHubSceneLaunchData,
    resolveHubSceneCatalogResource,
} from './hubSceneLaunch';

const catalogWithDefaultAndTestHub = {
    schemaVersion: 1,
    resources: [
        {
            resourceId: DEFAULT_HUB_ID,
            kind: 'hub',
            schemaVersion: 1,
            publicPath: DEFAULT_HUB_FILE,
        },
        {
            resourceId: 'hub.test-town',
            kind: 'hub',
            schemaVersion: 1,
            publicPath: 'data/hub/test-town.json',
        },
        {
            resourceId: 'deck.starter',
            kind: 'deck',
            schemaVersion: 1,
            publicPath: 'data/decks/starter-deck.json',
        },
    ],
};

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
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            targetLocationId: 'location.test-town.teahouse',
            statusText: '从测试大地图进入指定 Hub 地点。',
        })).toEqual({
            source: 'worldMap',
            destinationId: 'destination.test-hub-location',
            hubId: 'hub.test-town',
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            hubCacheKey: 'hubTownShell:data/hub/test-town.json',
            targetLocationId: 'location.test-town.teahouse',
            statusText: '从测试大地图进入指定 Hub 地点。',
        });
    });

    it('resolves direct/default Hub starts through the catalog while keeping the existing cache key stable', () => {
        const launchData = normalizeHubSceneLaunchData(undefined);

        expect(resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, launchData)).toEqual({
            resourceId: DEFAULT_HUB_ID,
            publicPath: DEFAULT_HUB_FILE,
            hubCacheKey: `hubTownShell:${DEFAULT_HUB_FILE}`,
        });
    });

    it('resolves WorldMap-launched Hub destinations by hubResourceId while preserving hubFile compatibility', () => {
        const launchData = normalizeHubSceneLaunchData({
            source: 'worldMap',
            destinationId: 'destination.test-hub-location',
            hubId: 'hub.test-town',
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
            targetLocationId: 'location.test-town.teahouse',
        });

        expect(resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, launchData)).toEqual({
            resourceId: 'hub.test-town',
            publicPath: 'data/hub/test-town.json',
            hubCacheKey: 'hubTownShell:data/hub/test-town.json',
        });
    });

    it('uses hubId as the compatibility catalog id when hubResourceId is omitted', () => {
        const launchData = normalizeHubSceneLaunchData({
            hubId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
        });

        expect(resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, launchData)).toEqual({
            resourceId: 'hub.test-town',
            publicPath: 'data/hub/test-town.json',
            hubCacheKey: 'hubTownShell:data/hub/test-town.json',
        });
    });

    it('fails actionably when the runtime Hub catalog is missing, malformed, absent, wrong-kind, or path-mismatched', () => {
        const launchData = normalizeHubSceneLaunchData({
            hubId: 'hub.test-town',
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
        });

        expect(() => resolveHubSceneCatalogResource(undefined, launchData)).toThrow(
            'HubScene requires runtime content catalog data/content-catalog.json, but it was not loaded or is missing from the JSON cache.',
        );

        expect(() => resolveHubSceneCatalogResource({
            schemaVersion: 1,
            resources: 'not-an-array',
        }, launchData)).toThrow(
            'HubScene runtime content catalog data/content-catalog.json is malformed: contentCatalog.resources must be an array.',
        );

        expect(() => resolveHubSceneCatalogResource({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: DEFAULT_HUB_ID,
                    kind: 'hub',
                    schemaVersion: 1,
                    publicPath: DEFAULT_HUB_FILE,
                },
            ],
        }, launchData)).toThrow(
            'HubScene could not resolve catalog resource hub.test-town: no catalog entry exists for that resource id.',
        );

        expect(() => resolveHubSceneCatalogResource({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'hub.test-town',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, launchData)).toThrow(
            'HubScene could not resolve catalog resource hub.test-town: catalog resource has kind deck; expected hub.',
        );

        expect(() => resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, {
            ...launchData,
            hubFile: 'data/hub/other-test-town.json',
            hubCacheKey: 'hubTownShell:data/hub/other-test-town.json',
        })).toThrow(
            'HubScene catalog resource hub.test-town resolved to publicPath data/hub/test-town.json, but launch hubFile is data/hub/other-test-town.json.',
        );
    });

    it('fails actionably when loaded Hub JSON declares a different hubId than the launch target', () => {
        const launchData = normalizeHubSceneLaunchData({
            hubId: 'hub.test-town',
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
        });
        const resolvedResource = resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, launchData);

        expect(() => assertHubSceneCatalogResourceMatchesLoadedHub(
            { hubId: 'hub.test-town' },
            launchData,
            resolvedResource,
        )).not.toThrow();

        expect(() => assertHubSceneCatalogResourceMatchesLoadedHub(
            { hubId: 'hub.other-town' },
            launchData,
            resolvedResource,
        )).toThrow(
            'HubScene loaded catalog resource hub.test-town from public/data/hub/test-town.json, but launch expected hubId hub.test-town and loaded Hub declares hub.other-town.',
        );
    });

    it('fails actionably when loaded Hub JSON declares a different hubId than the catalog resource id', () => {
        const launchData = normalizeHubSceneLaunchData({
            hubId: 'hub.other-town',
            hubResourceId: 'hub.test-town',
            hubFile: 'data/hub/test-town.json',
        });
        const resolvedResource = resolveHubSceneCatalogResource(catalogWithDefaultAndTestHub, launchData);

        expect(() => assertHubSceneCatalogResourceMatchesLoadedHub(
            { hubId: 'hub.other-town' },
            launchData,
            resolvedResource,
        )).toThrow(
            'HubScene loaded catalog resource hub.test-town from public/data/hub/test-town.json, but loaded Hub declares hub.other-town. Catalog hub resources must declare a hubId matching their resourceId.',
        );
    });
});
