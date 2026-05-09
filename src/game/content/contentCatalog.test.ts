import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
    QINGYUN_WORLD_MAP_RESOURCE_ID,
    type ContentCatalogFileSource,
    createContentCatalogResolver,
    parseContentCatalogDefinition,
    validateContentCatalog,
} from './contentCatalog';

const expectedCheckedInResources = [
    ['worldMap', 'data/world/world-map.json'],
    ['hub', 'data/hub/qingyun-sect-gate.json'],
    ['hub', 'data/hub/town-shell.json'],
    ['story', 'data/story/qingyun-teahouse-rumors.json'],
    ['story', 'data/story/story-graph.compact.example.json'],
    ['story', 'data/story/story-graph.executable.json'],
    ['story', 'data/story/story-graph.json'],
    ['expeditionMap', 'data/mijing/jade-cave-map.json'],
    ['expeditionMap', 'data/mijing/prototype-map.json'],
    ['expeditionEvents', 'data/mijing/prototype-events.json'],
    ['expeditionShop', 'data/mijing/prototype-shop.json'],
    ['deck', 'data/decks/starter-deck.json'],
    ['encounter', 'data/encounters/medium-enemy.json'],
    ['encounter', 'data/encounters/mijing-boss.json'],
    ['encounter', 'data/encounters/test-enemy.json'],
    ['card', 'data/cards/artifacts.json'],
    ['card', 'data/cards/fields.json'],
    ['card', 'data/cards/pills.json'],
    ['card', 'data/cards/skills.json'],
    ['card', 'data/cards/talismans.json'],
    ['card', 'data/cards/units.json'],
    ['status', 'data/config/status-definitions.json'],
    ['gongfa', 'data/gongfa/gongfa-list.json'],
    ['config', 'data/config/artifact-grade.json'],
    ['config', 'data/config/combat-baseline.json'],
    ['config', 'data/config/realm-presets.json'],
    ['worldSeed', 'data/world/factions.json'],
    ['worldSeed', 'data/world/initial-state.json'],
    ['worldSeed', 'data/world/items.artifacts.json'],
    ['worldSeed', 'data/world/meta.json'],
    ['worldSeed', 'data/world/npcs.json'],
    ['worldSeed', 'data/world/protagonist.json'],
    ['worldSeed', 'data/world/skills.techniques.json'],
] as const;

function readCatalogJson(): unknown {
    return JSON.parse(readFileSync(join('public', CONTENT_CATALOG_PUBLIC_PATH), 'utf8'));
}

function createPublicFileSource(): ContentCatalogFileSource {
    return {
        readText(publicPath: string): string | undefined {
            const absolutePath = join('public', publicPath);

            return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : undefined;
        },
    };
}

function createPublicFileSourceWithOverrides(overrides: Record<string, unknown>): ContentCatalogFileSource {
    const publicFileSource = createPublicFileSource();

    return {
        readText(publicPath: string): string | undefined {
            if (publicPath in overrides) {
                return JSON.stringify(overrides[publicPath]);
            }

            return publicFileSource.readText(publicPath);
        },
    };
}

function createCatalogWorldMapWithDestination(destination: Record<string, unknown>): unknown {
    return {
        id: 'worldmap.catalog-route',
        title: 'Catalog route fixture',
        subtitle: 'WorldMap catalog resolver tests',
        description: 'Synthetic WorldMap fixture for catalog-backed target resolution.',
        defaultDestinationId: destination.id,
        presentation: {
            mapWidth: 1000,
            mapHeight: 600,
            initialCenter: {
                x: 0.5,
                y: 0.5,
            },
        },
        destinations: [destination],
    };
}

const catalogHubDefinition = {
    hubId: 'hub.catalog',
    title: 'Catalog Hub',
    subtitle: 'Catalog-backed Hub',
    description: 'Hub fixture used by content catalog validation tests.',
    defaultLocationId: 'location.catalog',
    presentation: {
        mapWidth: 800,
        mapHeight: 500,
        initialCenter: {
            x: 0.5,
            y: 0.5,
        },
    },
    locations: [
        {
            id: 'location.catalog',
            title: 'Catalog Location',
            summary: 'Catalog test location.',
            detail: 'A minimal valid Hub location.',
            presentation: {
                position: {
                    x: 0.5,
                    y: 0.5,
                },
                icon: 'town',
                regionLabel: 'Catalog',
            },
            actions: [
                {
                    id: 'action.catalog',
                    label: 'Stay here',
                    description: 'Exercise the Hub action contract without adding story catalog fixtures.',
                    kind: 'navigate',
                    targetLocationId: 'location.catalog',
                    statusText: 'Staying in the catalog location.',
                },
            ],
        },
    ],
};

function createCatalogStoryHubDefinition(actions: Record<string, unknown>[]): Record<string, unknown> {
    return {
        hubId: 'hub.catalog-story',
        title: 'Catalog Story Hub',
        subtitle: 'Catalog-backed startStory actions',
        description: 'Hub fixture used by catalog-backed story target validation tests.',
        defaultLocationId: 'location.catalog-story',
        presentation: {
            mapWidth: 800,
            mapHeight: 500,
            initialCenter: {
                x: 0.5,
                y: 0.5,
            },
        },
        locations: [
            {
                id: 'location.catalog-story',
                title: 'Catalog Story Location',
                summary: 'Catalog story test location.',
                detail: 'A minimal valid Hub location with startStory actions.',
                presentation: {
                    position: {
                        x: 0.5,
                        y: 0.5,
                    },
                    icon: 'town',
                    regionLabel: 'Catalog',
                },
                actions,
            },
        ],
    };
}

function createCatalogStoryGraph(storyId: string): Record<string, unknown> {
    return {
        storyId,
        title: `Catalog story ${storyId}`,
        entryNodeId: 'catalog_entry',
        initialState: {
            locationId: 'location.catalog-story',
            sublocationId: 'sublocation.catalog-story',
        },
        nodes: [
            {
                id: 'catalog_entry',
                type: 'story',
                title: 'Catalog Entry',
                summary: 'Catalog story entry.',
                detail: 'A minimal playable story graph for catalog validation.',
                tags: ['catalog'],
                chapter: 'catalog',
                location: 'Catalog',
                sublocation: 'Entry',
                locationId: 'location.catalog-story',
                sublocationId: 'sublocation.catalog-story',
                timeHint: 'now',
                onEnter: [],
            },
        ],
        choices: [],
    };
}

function createCatalogStoryGraphWithBattle(
    storyId: string,
    battle: Record<string, unknown>,
): Record<string, unknown> {
    return {
        storyId,
        title: `Catalog story ${storyId}`,
        entryNodeId: 'catalog_entry',
        initialState: {
            locationId: 'location.catalog-story',
            sublocationId: 'sublocation.catalog-story',
        },
        nodes: [
            {
                id: 'catalog_entry',
                type: 'story',
                title: 'Catalog Entry',
                summary: 'Catalog story entry.',
                detail: 'A minimal playable story graph for catalog validation.',
                tags: ['catalog'],
                chapter: 'catalog',
                location: 'Catalog',
                sublocation: 'Entry',
                locationId: 'location.catalog-story',
                sublocationId: 'sublocation.catalog-story',
                timeHint: 'now',
                onEnter: [
                    {
                        kind: 'startBattle',
                        battle,
                    },
                ],
            },
            {
                id: 'catalog_victory',
                type: 'story',
                title: 'Catalog Victory',
                summary: 'The catalog battle was won.',
                detail: 'Victory continuation node.',
                tags: ['catalog'],
                chapter: 'catalog',
                location: 'Catalog',
                sublocation: 'Victory',
                locationId: 'location.catalog-story',
                sublocationId: 'sublocation.catalog-story.victory',
                timeHint: 'after battle',
                onEnter: [],
            },
            {
                id: 'catalog_defeat',
                type: 'story',
                title: 'Catalog Defeat',
                summary: 'The catalog battle was lost.',
                detail: 'Defeat continuation node.',
                tags: ['catalog'],
                chapter: 'catalog',
                location: 'Catalog',
                sublocation: 'Defeat',
                locationId: 'location.catalog-story',
                sublocationId: 'sublocation.catalog-story.defeat',
                timeHint: 'after battle',
                onEnter: [],
            },
        ],
        choices: [],
    };
}

function createCatalogHubDestination(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'destination.catalog-hub',
        kind: 'hub',
        label: 'Catalog Hub',
        description: 'Catalog-backed Hub destination.',
        presentation: {
            position: {
                x: 0.5,
                y: 0.5,
            },
            icon: 'town',
            regionLabel: 'Catalog',
        },
        hubId: 'hub.catalog',
        hubResourceId: 'hub.catalog',
        hubFile: 'data/hub/catalog-hub.json',
        ...overrides,
    };
}

function createCatalogExpeditionMap(
    resourceId: string,
    battlePayloadRef: Record<string, unknown>,
): Record<string, unknown> {
    const validEncounterPayloadRef = {
        kind: 'encounter',
        ref: 'encounter.good',
        encounterResourceId: 'encounter.good',
        encounterFile: 'data/encounters/good.json',
    };

    return {
        id: resourceId,
        name: `Catalog Expedition ${resourceId}`,
        description: 'Synthetic Expedition map fixture for catalog-backed encounter target validation.',
        entryNodeId: 'entrance.catalog',
        nodes: [
            {
                id: 'entrance.catalog',
                type: 'entrance',
                layer: 0,
                label: 'Entrance',
                outgoingNodeIds: ['battle.catalog', 'event.abandoned-cache'],
                payloadRef: {
                    kind: 'entrance',
                    ref: 'phase01.starter-stash',
                },
            },
            {
                id: 'battle.catalog',
                type: 'battle',
                layer: 1,
                label: 'Catalog Battle',
                outgoingNodeIds: ['shop.wandering-peddler', 'extract.cliff-rope'],
                payloadRef: battlePayloadRef,
            },
            {
                id: 'event.abandoned-cache',
                type: 'event',
                layer: 1,
                label: 'Catalog Event',
                outgoingNodeIds: ['battle.ruined-courtyard', 'shop.wandering-peddler'],
                payloadRef: {
                    kind: 'event',
                    ref: 'event.abandoned-cache',
                    contentFile: 'data/mijing/catalog-events.json',
                },
            },
            {
                id: 'shop.wandering-peddler',
                type: 'shop',
                layer: 2,
                label: 'Catalog Shop',
                outgoingNodeIds: ['boss.sealed-guardian'],
                payloadRef: {
                    kind: 'shop',
                    ref: 'shop.wandering-peddler',
                    contentFile: 'data/mijing/catalog-shop.json',
                },
            },
            {
                id: 'battle.ruined-courtyard',
                type: 'battle',
                layer: 2,
                label: 'Catalog Second Battle',
                outgoingNodeIds: ['boss.sealed-guardian'],
                payloadRef: validEncounterPayloadRef,
            },
            {
                id: 'extract.cliff-rope',
                type: 'extract',
                layer: 2,
                label: 'Catalog Extract',
                outgoingNodeIds: [],
                payloadRef: {
                    kind: 'extract',
                    ref: 'extract.cliff-rope',
                },
            },
            {
                id: 'boss.sealed-guardian',
                type: 'boss',
                layer: 3,
                label: 'Catalog Boss',
                outgoingNodeIds: [],
                payloadRef: validEncounterPayloadRef,
            },
        ],
    };
}

const catalogExpeditionEvents = {
    id: 'events.catalog',
    eventsByNodeId: {
        'event.abandoned-cache': {
            nodeId: 'event.abandoned-cache',
            title: 'Catalog event',
            description: 'Minimal event fixture.',
            pool: [],
        },
    },
};

const catalogExpeditionShop = {
    id: 'shop.catalog',
    shopsByNodeId: {
        'shop.wandering-peddler': {
            nodeId: 'shop.wandering-peddler',
            title: 'Catalog shop',
            description: 'Minimal shop fixture.',
            offers: [],
        },
    },
};

describe('content catalog', () => {
    it('exposes the runtime catalog cache identity used by the boot preload chain', () => {
        expect(CONTENT_CATALOG_CACHE_KEY).toBe('contentCatalog');
        expect(CONTENT_CATALOG_PUBLIC_PATH).toBe('data/content-catalog.json');
    });

    it('resolves the checked-in WorldMap resource by stable catalog id for runtime scene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'WorldMapScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect(resolver.resolveJsonResource({
            resourceId: QINGYUN_WORLD_MAP_RESOURCE_ID,
            expectedKind: 'worldMap',
        })).toEqual({
            resourceId: 'worldmap.qingyun-region',
            kind: 'worldMap',
            schemaVersion: 1,
            publicPath: 'data/world/world-map.json',
        });
    });

    it('fails actionably when the runtime catalog cache is missing before WorldMapScene resolves resources', () => {
        expect(() => createContentCatalogResolver(undefined, {
            context: 'WorldMapScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        })).toThrow(
            'WorldMapScene requires runtime content catalog data/content-catalog.json, but it was not loaded or is missing from the JSON cache.',
        );
    });

    it('fails actionably when the runtime catalog is malformed', () => {
        expect(() => createContentCatalogResolver({
            schemaVersion: 1,
            resources: 'not-an-array',
        }, {
            context: 'WorldMapScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        })).toThrow(
            'WorldMapScene runtime content catalog data/content-catalog.json is malformed: contentCatalog.resources must be an array.',
        );
    });

    it('fails actionably when a runtime resource id is absent or has the wrong kind', () => {
        const resolver = createContentCatalogResolver({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
            ],
        }, {
            context: 'WorldMapScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect(() => resolver.resolveJsonResource({
            resourceId: QINGYUN_WORLD_MAP_RESOURCE_ID,
            expectedKind: 'worldMap',
        })).toThrow(
            'WorldMapScene could not resolve catalog resource worldmap.qingyun-region: no catalog entry exists for that resource id.',
        );
        expect(() => resolver.resolveJsonResource({
            resourceId: 'deck.starter',
            expectedKind: 'worldMap',
        })).toThrow(
            'WorldMapScene could not resolve catalog resource deck.starter: catalog resource has kind deck; expected worldMap.',
        );
    });

    it('fails actionably when a runtime resource resolves to an invalid public JSON path', () => {
        expect(() => createContentCatalogResolver({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: QINGYUN_WORLD_MAP_RESOURCE_ID,
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: '/data/world/world-map.json',
                },
            ],
        }, {
            context: 'WorldMapScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        })).toThrow(
            'WorldMapScene runtime content catalog data/content-catalog.json is malformed: contentCatalog.resources[0].publicPath must be relative to public/, for example data/world/world-map.json.',
        );
    });

    it('checks in a versioned manifest covering current data resources for validation and the WorldMap runtime resolver', () => {
        const catalogPath = join('public', CONTENT_CATALOG_PUBLIC_PATH);

        expect(existsSync(catalogPath)).toBe(true);

        const catalog = parseContentCatalogDefinition(readCatalogJson());

        expect(catalog.schemaVersion).toBe(1);
        expect(catalog.resources.map((entry) => [entry.kind, entry.publicPath])).toEqual(expectedCheckedInResources);
        expect(new Set(catalog.resources.map((entry) => entry.resourceId)).size).toBe(catalog.resources.length);
        expect(new Set(catalog.resources.map((entry) => entry.publicPath)).size).toBe(catalog.resources.length);
    });

    it('validates checked-in resources plus route-critical and content ID references with pure validators', () => {
        const catalog = parseContentCatalogDefinition(readCatalogJson());
        const result = validateContentCatalog(catalog, createPublicFileSource());

        expect(result.failures).toEqual([]);
        expect(result.validatedResourceCount).toBe(expectedCheckedInResources.length);
        expect(result.registeredValidatorNames).toEqual([
            'worldMap:validateWorldMapDefinition',
            'hub:validateHubTownDefinition',
            'story:validatePlayableStoryGraph|validateStoryContentGraph',
            'expedition:validatePrototypeExpeditionContent',
        ]);
    });

    it('returns actionable failures when a route-critical target is absent from the catalog', () => {
        const incompleteCatalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.qingyun-region',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/world-map.json',
                },
            ],
        };

        const result = validateContentCatalog(incompleteCatalog, createPublicFileSource());

        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.qingyun-region destination destination.qingyun-town hubResourceId references catalog resource id hub.qingyun-town, but no catalog entry exists for that resource id.',
        );
    });

    it('returns actionable failures when a WorldMap Hub target resource id is missing from the catalog', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.catalog-route',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/catalog-route.json',
                },
                {
                    resourceId: 'hub.catalog',
                    kind: 'hub',
                    schemaVersion: 1,
                    publicPath: 'data/hub/catalog-hub.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/world/catalog-route.json': createCatalogWorldMapWithDestination(createCatalogHubDestination({
                hubResourceId: 'hub.missing',
            })),
            'data/hub/catalog-hub.json': catalogHubDefinition,
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-hub hubResourceId references catalog resource id hub.missing, but no catalog entry exists for that resource id.',
        );
    });

    it('returns actionable failures when a WorldMap target resource id has the wrong catalog kind', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.catalog-route',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/catalog-route.json',
                },
                {
                    resourceId: 'hub.catalog',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/hub/catalog-hub.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/world/catalog-route.json': createCatalogWorldMapWithDestination(createCatalogHubDestination()),
            'data/hub/catalog-hub.json': catalogHubDefinition,
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-hub hubResourceId references catalog resource id hub.catalog, but catalog resource has kind deck; expected hub.',
        );
    });

    it('returns actionable failures when a WorldMap target resource id resolves to a different public path', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.catalog-route',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/catalog-route.json',
                },
                {
                    resourceId: 'hub.catalog',
                    kind: 'hub',
                    schemaVersion: 1,
                    publicPath: 'data/hub/catalog-hub.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/world/catalog-route.json': createCatalogWorldMapWithDestination(createCatalogHubDestination({
                hubFile: 'data/hub/other-hub.json',
            })),
            'data/hub/catalog-hub.json': catalogHubDefinition,
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-hub hubResourceId references catalog resource id hub.catalog, but catalog publicPath is data/hub/catalog-hub.json; destination hubFile is data/hub/other-hub.json.',
        );
    });

    it('returns actionable failures when a WorldMap Expedition resource id has the wrong kind or path', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.catalog-route',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/catalog-route.json',
                },
                {
                    resourceId: 'world.seed.initial-state',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/initial-state.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
                {
                    resourceId: 'map.wrong-kind',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-map.json',
                },
                {
                    resourceId: 'events.catalog',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-events.json',
                },
                {
                    resourceId: 'phase01-prototype-shop',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/prototype-shop.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/world/catalog-route.json': createCatalogWorldMapWithDestination({
                id: 'destination.catalog-expedition',
                kind: 'expedition',
                label: 'Catalog Expedition',
                description: 'Catalog-backed Expedition destination.',
                presentation: {
                    position: {
                        x: 0.5,
                        y: 0.5,
                    },
                    icon: 'trial',
                    regionLabel: 'Catalog',
                },
                expeditionId: 'expedition.catalog',
                mapId: 'catalog-map',
                worldStateResourceId: 'world.seed.initial-state',
                worldStateFile: 'data/world/initial-state.json',
                starterDeckResourceId: 'deck.starter',
                starterDeckFile: 'data/decks/starter-deck.json',
                mapResourceId: 'map.wrong-kind',
                mapFile: 'data/mijing/catalog-map.json',
                eventsResourceId: 'events.catalog',
                eventsFile: 'data/mijing/other-events.json',
                shopResourceId: 'shop.missing',
                shopFile: 'data/mijing/prototype-shop.json',
            }),
            'data/mijing/catalog-map.json': {
                id: 'catalog-map',
                name: 'Catalog Map',
                description: 'Map fixture.',
                entryNodeId: 'entrance.catalog',
                nodes: [
                    {
                        id: 'entrance.catalog',
                        type: 'entrance',
                        layer: 0,
                        label: 'Entrance',
                        outgoingNodeIds: [],
                        payloadRef: {
                            kind: 'entrance',
                            ref: 'starter',
                        },
                    },
                ],
            },
            'data/mijing/catalog-events.json': {
                id: 'events.catalog',
                eventsByNodeId: {},
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-expedition mapResourceId references catalog resource id map.wrong-kind, but catalog resource has kind deck; expected expeditionMap.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-expedition eventsResourceId references catalog resource id events.catalog, but catalog publicPath is data/mijing/catalog-events.json; destination eventsFile is data/mijing/other-events.json.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'WorldMap worldmap.catalog-route destination destination.catalog-expedition shopResourceId references catalog resource id shop.missing, but no catalog entry exists for that resource id.',
        );
    });

    it('returns actionable failures when Hub startStory storyResourceId is missing, missing from the catalog, wrong kind, or path-mismatched', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'hub.catalog-story',
                    kind: 'hub',
                    schemaVersion: 1,
                    publicPath: 'data/hub/catalog-story-hub.json',
                },
                {
                    resourceId: 'story.qingyun-entry',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/story-graph.json',
                },
                {
                    resourceId: 'story.qingyun-teahouse-rumors',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/qingyun-teahouse-rumors.json',
                },
                {
                    resourceId: 'story.wrong-kind',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/story/wrong-kind-story.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/hub/catalog-story-hub.json': createCatalogStoryHubDefinition([
                {
                    id: 'action.missing-story-resource-id',
                    kind: 'startStory',
                    label: 'Missing ID',
                    description: 'Missing the catalog-backed story resource id.',
                    storyGraphFile: 'data/story/story-graph.json',
                },
                {
                    id: 'action.missing-story-resource',
                    kind: 'startStory',
                    label: 'Missing resource',
                    description: 'Points at an absent catalog story resource id.',
                    storyResourceId: 'story.missing',
                    storyGraphFile: 'data/story/story-graph.json',
                },
                {
                    id: 'action.wrong-kind',
                    kind: 'startStory',
                    label: 'Wrong kind',
                    description: 'Points at a catalog resource that is not a story.',
                    storyResourceId: 'story.wrong-kind',
                    storyGraphFile: 'data/story/wrong-kind-story.json',
                },
                {
                    id: 'action.path-mismatch',
                    kind: 'startStory',
                    label: 'Path mismatch',
                    description: 'Points at a story resource whose path does not match the runtime storyGraphFile alias.',
                    storyResourceId: 'story.qingyun-teahouse-rumors',
                    storyGraphFile: 'data/story/story-graph.json',
                },
            ]),
            'data/story/story-graph.json': createCatalogStoryGraph('story.qingyun-entry'),
            'data/story/qingyun-teahouse-rumors.json': createCatalogStoryGraph('story.qingyun-teahouse-rumors'),
            'data/story/wrong-kind-story.json': {
                cards: [],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Hub hub.catalog-story location location.catalog-story action action.missing-story-resource-id storyResourceId must be a non-empty string so catalog story targets resolve by resource id.',
            'Hub hub.catalog-story location location.catalog-story action action.missing-story-resource storyResourceId references catalog resource id story.missing, but no catalog entry exists for that resource id.',
            'Hub hub.catalog-story location location.catalog-story action action.wrong-kind storyResourceId references catalog resource id story.wrong-kind, but catalog resource has kind deck; expected story.',
            'Hub hub.catalog-story location location.catalog-story action action.path-mismatch storyResourceId references catalog resource id story.qingyun-teahouse-rumors, but catalog publicPath is data/story/qingyun-teahouse-rumors.json; action storyGraphFile is data/story/story-graph.json.',
        ]);
    });

    it('returns actionable failures when Story startBattle encounter/deck resource ids are missing, absent, wrong kind, or path-mismatched', () => {
        const baseBattle = {
            battleId: 'story.catalog-battle.first-duel',
            encounterId: 'test_encounter_01',
            encounterFile: 'data/encounters/test-enemy.json',
            deckFile: 'data/decks/starter-deck.json',
            onVictoryNodeId: 'catalog_victory',
            onDefeatNodeId: 'catalog_defeat',
        };
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'story.catalog-battle-missing-ids',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/catalog-battle-missing-ids.json',
                },
                {
                    resourceId: 'story.catalog-battle-absent-ids',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/catalog-battle-absent-ids.json',
                },
                {
                    resourceId: 'story.catalog-battle-wrong-kind',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/catalog-battle-wrong-kind.json',
                },
                {
                    resourceId: 'story.catalog-battle-path-mismatch',
                    kind: 'story',
                    schemaVersion: 1,
                    publicPath: 'data/story/catalog-battle-path-mismatch.json',
                },
                {
                    resourceId: 'test_encounter_01',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/test-enemy.json',
                },
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
                {
                    resourceId: 'encounter.wrong-kind',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/wrong-kind.json',
                },
                {
                    resourceId: 'deck.wrong-kind',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/decks/wrong-kind-deck.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/story/catalog-battle-missing-ids.json': createCatalogStoryGraphWithBattle(
                'story.catalog-battle-missing-ids',
                baseBattle,
            ),
            'data/story/catalog-battle-absent-ids.json': createCatalogStoryGraphWithBattle(
                'story.catalog-battle-absent-ids',
                {
                    ...baseBattle,
                    encounterResourceId: 'encounter.missing',
                    deckResourceId: 'deck.missing',
                },
            ),
            'data/story/catalog-battle-wrong-kind.json': createCatalogStoryGraphWithBattle(
                'story.catalog-battle-wrong-kind',
                {
                    ...baseBattle,
                    encounterId: 'encounter.wrong-kind',
                    encounterResourceId: 'encounter.wrong-kind',
                    encounterFile: 'data/encounters/wrong-kind.json',
                    deckResourceId: 'deck.wrong-kind',
                    deckFile: 'data/decks/wrong-kind-deck.json',
                },
            ),
            'data/story/catalog-battle-path-mismatch.json': createCatalogStoryGraphWithBattle(
                'story.catalog-battle-path-mismatch',
                {
                    ...baseBattle,
                    encounterResourceId: 'test_encounter_01',
                    encounterFile: 'data/encounters/other-enemy.json',
                    deckResourceId: 'deck.starter',
                    deckFile: 'data/decks/other-starter-deck.json',
                },
            ),
            'data/encounters/wrong-kind.json': {
                cards: [],
            },
            'data/decks/wrong-kind-deck.json': {
                id: 'deck.wrong-kind',
                enemies: [],
            },
            'data/encounters/test-enemy.json': {
                id: 'test_encounter_01',
                enemies: [],
            },
            'data/decks/starter-deck.json': {
                cards: [],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Story story.catalog-battle-missing-ids nodes[0] catalog_entry onEnter[0].battle encounterResourceId must be a non-empty string so catalog encounter targets resolve by resource id.',
            'Story story.catalog-battle-missing-ids nodes[0] catalog_entry onEnter[0].battle deckResourceId must be a non-empty string so catalog deck targets resolve by resource id.',
            'Story story.catalog-battle-absent-ids nodes[0] catalog_entry onEnter[0].battle encounterResourceId references catalog resource id encounter.missing, but no catalog entry exists for that resource id.',
            'Story story.catalog-battle-absent-ids nodes[0] catalog_entry onEnter[0].battle deckResourceId references catalog resource id deck.missing, but no catalog entry exists for that resource id.',
            'Story story.catalog-battle-wrong-kind nodes[0] catalog_entry onEnter[0].battle encounterResourceId references catalog resource id encounter.wrong-kind, but catalog resource has kind deck; expected encounter.',
            'Story story.catalog-battle-wrong-kind nodes[0] catalog_entry onEnter[0].battle deckResourceId references catalog resource id deck.wrong-kind, but catalog resource has kind encounter; expected deck.',
            'Story story.catalog-battle-path-mismatch nodes[0] catalog_entry onEnter[0].battle encounterResourceId references catalog resource id test_encounter_01, but catalog publicPath is data/encounters/test-enemy.json; battle encounterFile is data/encounters/other-enemy.json.',
            'Story story.catalog-battle-path-mismatch nodes[0] catalog_entry onEnter[0].battle deckResourceId references catalog resource id deck.starter, but catalog publicPath is data/decks/starter-deck.json; battle deckFile is data/decks/other-starter-deck.json.',
        ]);
    });

    it('returns actionable failures when Expedition encounter resource ids are missing, absent, wrong kind, path-mismatched, or ref-mismatched', () => {
        const basePayloadRef = {
            kind: 'encounter',
            ref: 'encounter.good',
            encounterResourceId: 'encounter.good',
            encounterFile: 'data/encounters/good.json',
        };
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'expedition.map.missing-id',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-expedition-missing-id.json',
                },
                {
                    resourceId: 'expedition.map.absent-id',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-expedition-absent-id.json',
                },
                {
                    resourceId: 'expedition.map.wrong-kind',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-expedition-wrong-kind.json',
                },
                {
                    resourceId: 'expedition.map.path-mismatch',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-expedition-path-mismatch.json',
                },
                {
                    resourceId: 'expedition.map.ref-mismatch',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-expedition-ref-mismatch.json',
                },
                {
                    resourceId: 'events.catalog',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-events.json',
                },
                {
                    resourceId: 'shop.catalog',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/catalog-shop.json',
                },
                {
                    resourceId: 'encounter.good',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/good.json',
                },
                {
                    resourceId: 'encounter.wrong-kind',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/wrong-kind.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/mijing/catalog-expedition-missing-id.json': createCatalogExpeditionMap(
                'expedition.map.missing-id',
                {
                    kind: 'encounter',
                    ref: 'encounter.good',
                    encounterFile: 'data/encounters/good.json',
                },
            ),
            'data/mijing/catalog-expedition-absent-id.json': createCatalogExpeditionMap(
                'expedition.map.absent-id',
                {
                    ...basePayloadRef,
                    encounterResourceId: 'encounter.missing',
                },
            ),
            'data/mijing/catalog-expedition-wrong-kind.json': createCatalogExpeditionMap(
                'expedition.map.wrong-kind',
                {
                    ...basePayloadRef,
                    ref: 'encounter.wrong-kind',
                    encounterResourceId: 'encounter.wrong-kind',
                    encounterFile: 'data/encounters/wrong-kind.json',
                },
            ),
            'data/mijing/catalog-expedition-path-mismatch.json': createCatalogExpeditionMap(
                'expedition.map.path-mismatch',
                {
                    ...basePayloadRef,
                    encounterFile: 'data/encounters/other.json',
                },
            ),
            'data/mijing/catalog-expedition-ref-mismatch.json': createCatalogExpeditionMap(
                'expedition.map.ref-mismatch',
                {
                    ...basePayloadRef,
                    ref: 'encounter.expected',
                },
            ),
            'data/mijing/catalog-events.json': catalogExpeditionEvents,
            'data/mijing/catalog-shop.json': catalogExpeditionShop,
            'data/encounters/good.json': {
                id: 'encounter.good',
                enemies: [],
            },
            'data/encounters/wrong-kind.json': {
                cards: [],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.missing-id node battle.catalog payloadRef.encounterResourceId must be a non-empty string so catalog encounter targets resolve by resource id.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.absent-id node battle.catalog payloadRef encounterResourceId references catalog resource id encounter.missing, but no catalog entry exists for that resource id.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.wrong-kind node battle.catalog payloadRef encounterResourceId references catalog resource id encounter.wrong-kind, but catalog resource has kind deck; expected encounter.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.path-mismatch node battle.catalog payloadRef encounterResourceId references catalog resource id encounter.good, but catalog publicPath is data/encounters/good.json; payloadRef encounterFile is data/encounters/other.json.',
        );
        expect(result.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.ref-mismatch node battle.catalog payloadRef.encounterResourceId expects encounterId encounter.expected, but data/encounters/good.json declares encounter.good.',
        );
    });


    it('returns actionable failures for duplicate catalog-backed card, gongfa, and world item IDs', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'cards.units',
                    kind: 'card',
                    schemaVersion: 1,
                    publicPath: 'data/cards/units.json',
                },
                {
                    resourceId: 'cards.artifacts',
                    kind: 'card',
                    schemaVersion: 1,
                    publicPath: 'data/cards/artifacts.json',
                },
                {
                    resourceId: 'gongfa.list',
                    kind: 'gongfa',
                    schemaVersion: 1,
                    publicPath: 'data/gongfa/gongfa-list.json',
                },
                {
                    resourceId: 'world.seed.items-artifacts',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/items.artifacts.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/cards/units.json': {
                units: [{ id: 'DUPLICATE_CARD', kind: 'unit' }],
            },
            'data/cards/artifacts.json': {
                artifacts: [{ id: 'DUPLICATE_CARD', kind: 'artifact' }],
            },
            'data/gongfa/gongfa-list.json': {
                gongfa: [
                    { id: 'gongfa.duplicate', schema: {} },
                    { id: 'gongfa.duplicate', schema: {} },
                ],
            },
            'data/world/items.artifacts.json': {
                artifacts: [{ id: 'duplicate_item' }],
                tools: [{ id: 'duplicate_item' }],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog card id DUPLICATE_CARD is declared more than once: cards.units units[0] in data/cards/units.json; duplicate cards.artifacts artifacts[0] in data/cards/artifacts.json.',
            'Catalog gongfa id gongfa.duplicate is declared more than once: gongfa.list gongfa[0] in data/gongfa/gongfa-list.json; duplicate gongfa.list gongfa[1] in data/gongfa/gongfa-list.json.',
            'Catalog world item id duplicate_item is declared more than once: world.seed.items-artifacts artifacts[0] in data/world/items.artifacts.json; duplicate world.seed.items-artifacts tools[0] in data/world/items.artifacts.json.',
        ]);
    });

    it('returns actionable failures for missing deck, encounter, Expedition reward, and gongfa content IDs', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'cards.units',
                    kind: 'card',
                    schemaVersion: 1,
                    publicPath: 'data/cards/units.json',
                },
                {
                    resourceId: 'gongfa.list',
                    kind: 'gongfa',
                    schemaVersion: 1,
                    publicPath: 'data/gongfa/gongfa-list.json',
                },
                {
                    resourceId: 'world.seed.items-artifacts',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/items.artifacts.json',
                },
                {
                    resourceId: 'deck.test',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/test-deck.json',
                },
                {
                    resourceId: 'encounter.test',
                    kind: 'encounter',
                    schemaVersion: 1,
                    publicPath: 'data/encounters/test.json',
                },
                {
                    resourceId: 'events.test',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/events.json',
                },
                {
                    resourceId: 'shop.test',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/shop.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/cards/units.json': {
                units: [
                    { id: 'CARD_VALID', kind: 'unit', gongfaIds: ['gongfa.valid'] },
                    { id: 'CARD_BAD_GONGFA', kind: 'unit', gongfaIds: ['gongfa.missing'] },
                ],
            },
            'data/gongfa/gongfa-list.json': {
                gongfa: [{ id: 'gongfa.valid', schema: {} }],
            },
            'data/world/items.artifacts.json': {
                artifacts: [{ id: 'item.valid' }],
            },
            'data/decks/test-deck.json': {
                cards: [{ id: 'CARD_MISSING_FROM_DECK', count: 1 }],
            },
            'data/encounters/test.json': {
                id: 'encounter.test',
                enemies: [{ cardId: 'CARD_MISSING_FROM_ENCOUNTER', position: 0 }],
            },
            'data/mijing/events.json': {
                id: 'events.test',
                eventsByNodeId: {
                    'event.test': {
                        nodeId: 'event.test',
                        pool: [
                            {
                                id: 'event.outcome',
                                rewards: {
                                    cards: [{ id: 'CARD_MISSING_FROM_EVENT', count: 1 }],
                                    items: [{ id: 'item.missing.event', itemType: 'artifact', count: 1 }],
                                    spiritStones: 0,
                                },
                            },
                        ],
                    },
                },
            },
            'data/mijing/shop.json': {
                id: 'shop.test',
                shopsByNodeId: {
                    'shop.test': {
                        nodeId: 'shop.test',
                        offers: [
                            {
                                id: 'offer.test',
                                rewards: {
                                    cards: [{ id: 'CARD_MISSING_FROM_SHOP', count: 1 }],
                                    items: [{ id: 'item.missing.shop', itemType: 'artifact', count: 1 }],
                                    spiritStones: 0,
                                },
                            },
                        ],
                    },
                },
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Card cards.units units[1] CARD_BAD_GONGFA gongfaIds[0] references gongfa id gongfa.missing, but no catalog gongfa resource declares that id.',
            'Deck deck.test cards[0].id references card id CARD_MISSING_FROM_DECK, but no catalog card resource declares that id.',
            'Encounter encounter.test enemies[0].cardId references card id CARD_MISSING_FROM_ENCOUNTER, but no catalog card resource declares that id.',
            'Expedition events events.test eventsByNodeId.event.test.pool[0].rewards.cards[0].id references card id CARD_MISSING_FROM_EVENT, but no catalog card resource declares that id.',
            'Expedition events events.test eventsByNodeId.event.test.pool[0].rewards.items[0].id references world item id item.missing.event, but no catalog world item resource declares that id.',
            'Expedition shop shop.test shopsByNodeId.shop.test.offers[0].rewards.cards[0].id references card id CARD_MISSING_FROM_SHOP, but no catalog card resource declares that id.',
            'Expedition shop shop.test shopsByNodeId.shop.test.offers[0].rewards.items[0].id references world item id item.missing.shop, but no catalog world item resource declares that id.',
        ]);
    });

    it('returns actionable failures when a catalog path is missing on disk', () => {
        const missingPathCatalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'missing.config',
                    kind: 'config',
                    schemaVersion: 1,
                    publicPath: 'data/config/missing.json',
                },
            ],
        };

        const result = validateContentCatalog(missingPathCatalog, createPublicFileSource());

        expect(result.failures).toEqual([
            {
                resourceId: 'missing.config',
                publicPath: 'data/config/missing.json',
                message: 'Catalog resource missing.config (config) is missing JSON file at public/data/config/missing.json.',
            },
        ]);
    });

    it('returns an actionable failure instead of throwing when malformed Expedition map nodes cannot be traversed', () => {
        const malformedExpeditionCatalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'expedition.map.malformed',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/malformed-map.json',
                },
                {
                    resourceId: 'phase01-prototype-events',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/prototype-events.json',
                },
                {
                    resourceId: 'phase01-prototype-shop',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/prototype-shop.json',
                },
            ],
        };
        const malformedMap = {
            id: 'expedition.map.malformed',
            name: 'Malformed map',
            description: 'Synthetic malformed map that is missing a route-critical event payloadRef.',
            entryNodeId: 'entrance.malformed',
            nodes: [
                {
                    id: 'entrance.malformed',
                    type: 'entrance',
                    layer: 0,
                    label: 'Entrance',
                    outgoingNodeIds: ['event.malformed'],
                    payloadRef: {
                        kind: 'entrance',
                        ref: 'starter',
                    },
                },
                {
                    id: 'event.malformed',
                    type: 'event',
                    layer: 1,
                    label: 'Malformed event',
                    outgoingNodeIds: [],
                },
            ],
        };
        let result: ReturnType<typeof validateContentCatalog> | undefined;

        expect(() => {
            result = validateContentCatalog(
                malformedExpeditionCatalog,
                createPublicFileSourceWithOverrides({
                    'data/mijing/malformed-map.json': malformedMap,
                }),
            );
        }).not.toThrow();
        expect(result?.failures.map((failure) => failure.message)).toContain(
            'Expedition map expedition.map.malformed failed registered pure validator validatePrototypeExpeditionContent with data/mijing/prototype-events.json and data/mijing/prototype-shop.json: prototypeMap.nodes[1].payloadRef must be an object..',
        );
    });

    it('returns an actionable failure instead of throwing when a WorldMap Expedition route points at a malformed map node', () => {
        const worldMapRouteCatalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'worldmap.malformed-expedition-route',
                    kind: 'worldMap',
                    schemaVersion: 1,
                    publicPath: 'data/world/malformed-expedition-route.json',
                },
                {
                    resourceId: 'expedition.map.worldmap-malformed',
                    kind: 'expeditionMap',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/worldmap-malformed-map.json',
                },
                {
                    resourceId: 'phase01-prototype-events',
                    kind: 'expeditionEvents',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/prototype-events.json',
                },
                {
                    resourceId: 'phase01-prototype-shop',
                    kind: 'expeditionShop',
                    schemaVersion: 1,
                    publicPath: 'data/mijing/prototype-shop.json',
                },
                {
                    resourceId: 'starter-deck',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
                {
                    resourceId: 'world.initial-state',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/initial-state.json',
                },
            ],
        };
        const worldMapWithMalformedExpedition = {
            id: 'worldmap.malformed-expedition-route',
            title: 'Malformed Expedition Route',
            subtitle: 'Catalog validation regression fixture',
            description: 'Synthetic WorldMap fixture that points at a malformed Expedition map.',
            defaultDestinationId: 'destination.malformed-expedition',
            presentation: {
                mapWidth: 1000,
                mapHeight: 600,
                initialCenter: {
                    x: 0.5,
                    y: 0.5,
                },
            },
            destinations: [
                {
                    id: 'destination.malformed-expedition',
                    kind: 'expedition',
                    label: 'Malformed Expedition',
                    description: 'Route whose target map has an event node missing payloadRef.',
                    presentation: {
                        position: {
                            x: 0.5,
                            y: 0.5,
                        },
                        icon: 'trial',
                        regionLabel: 'Regression',
                    },
                    expeditionId: 'expedition.malformed',
                    mapId: 'expedition.map.worldmap-malformed',
                    worldStateResourceId: 'world.initial-state',
                    worldStateFile: 'data/world/initial-state.json',
                    starterDeckResourceId: 'starter-deck',
                    starterDeckFile: 'data/decks/starter-deck.json',
                    mapResourceId: 'expedition.map.worldmap-malformed',
                    mapFile: 'data/mijing/worldmap-malformed-map.json',
                    eventsResourceId: 'phase01-prototype-events',
                    eventsFile: 'data/mijing/prototype-events.json',
                    shopResourceId: 'phase01-prototype-shop',
                    shopFile: 'data/mijing/prototype-shop.json',
                },
            ],
        };
        const malformedMap = {
            id: 'expedition.map.worldmap-malformed',
            name: 'WorldMap malformed map',
            description: 'Synthetic malformed map reached through a WorldMap Expedition route.',
            entryNodeId: 'entrance.malformed',
            nodes: [
                {
                    id: 'entrance.malformed',
                    type: 'entrance',
                    layer: 0,
                    label: 'Entrance',
                    outgoingNodeIds: ['event.malformed'],
                    payloadRef: {
                        kind: 'entrance',
                        ref: 'starter',
                    },
                },
                {
                    id: 'event.malformed',
                    type: 'event',
                    layer: 1,
                    label: 'Malformed event',
                    outgoingNodeIds: [],
                },
            ],
        };
        let result: ReturnType<typeof validateContentCatalog> | undefined;

        expect(() => {
            result = validateContentCatalog(
                worldMapRouteCatalog,
                createPublicFileSourceWithOverrides({
                    'data/world/malformed-expedition-route.json': worldMapWithMalformedExpedition,
                    'data/mijing/worldmap-malformed-map.json': malformedMap,
                }),
            );
        }).not.toThrow();
        expect(result?.failures).toContainEqual({
            resourceId: 'worldmap.malformed-expedition-route',
            publicPath: 'data/world/malformed-expedition-route.json',
            message: 'WorldMap worldmap.malformed-expedition-route destination destination.malformed-expedition map node event.malformed payloadRef must be an object before Expedition content-file alignment can be validated.',
        });
    });
});
