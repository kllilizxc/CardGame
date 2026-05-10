import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    CONTENT_CATALOG_CACHE_KEY,
    CONTENT_CATALOG_PUBLIC_PATH,
    QINGYUN_WORLD_MAP_RESOURCE_ID,
    type ContentCatalogFileSource,
    type ContentCatalogValidationFailure,
    createContentCatalogResolver,
    parseContentCatalogDefinition,
    validateContentCatalog,
} from './contentCatalog';
import { validateCatalogRouteReferences } from './contentCatalogRouteReferences';
import {
    loadContentCatalogValidationIndex,
    resolveCatalogResourceIdReference,
    validateResourceDomainId,
} from './contentCatalogValidationIndex';

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

const canonicalCombatBaselineCatalogEntry = {
    resourceId: 'config.combat-baseline',
    kind: 'config',
    schemaVersion: 1,
    publicPath: 'data/config/combat-baseline.json',
} as const;

const canonicalArtifactGradeCatalogEntry = {
    resourceId: 'config.artifact-grade',
    kind: 'config',
    schemaVersion: 1,
    publicPath: 'data/config/artifact-grade.json',
} as const;

const canonicalRealmPresetsCatalogEntry = {
    resourceId: 'config.realm-presets',
    kind: 'config',
    schemaVersion: 1,
    publicPath: 'data/config/realm-presets.json',
} as const;

const validRealmPresetsRegistry = {
    realmStages: [
        {
            stage: '炼气',
            phases: [{ phase: '1层', value: 1 }],
        },
        {
            stage: '筑基',
            phases: [{ phase: '初期', value: 4 }],
        },
    ],
};

const validCombatBaselineRegistry = {
    realms: [
        {
            id: 'realm.valid',
            stage: '炼气',
            phase: '1层',
            value: 1,
            attackMin: 1,
            attackMax: 2,
            healthMin: 3,
            healthMax: 4,
        },
    ],
};

const validArtifactGradeRegistry = {
    grades: [
        {
            id: 'grade.valid',
            tier: '黄阶',
            quality: '下品',
            star: 1,
            value: 1,
            attackBonusMin: 1,
            attackBonusMax: 2,
            healthBonusMin: 3,
            healthBonusMax: 4,
        },
    ],
};

function createValidStatusDefinition(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        name: `Status ${id}`,
        description: `Valid status definition for ${id}.`,
        category: 'buff',
        timing: 'persistent',
        effectType: 'mark',
        stackConsumeType: 'none',
        baseValue: 0,
        icon: '●',
        color: '#ffffff',
        stackable: true,
        maxStacks: 99,
        ...overrides,
    };
}

function createValidGongfaSchema(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        event: {
            type: 'OnSummon',
            side: 'Ally',
        },
        actions: [
            {
                type: 'AddLog',
                message: 'Catalog validation fixture.',
            },
        ],
        ...overrides,
    };
}

function createCanonicalRealmAndGradeOverrides(): Record<string, unknown> {
    return {
        [canonicalRealmPresetsCatalogEntry.publicPath]: validRealmPresetsRegistry,
        [canonicalCombatBaselineCatalogEntry.publicPath]: validCombatBaselineRegistry,
        [canonicalArtifactGradeCatalogEntry.publicPath]: validArtifactGradeRegistry,
    };
}

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

function createPublicFileSourceWithRawOverrides(overrides: Record<string, string>): ContentCatalogFileSource {
    const publicFileSource = createPublicFileSource();

    return {
        readText(publicPath: string): string | undefined {
            if (publicPath in overrides) {
                return overrides[publicPath];
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

    it('resolves checked-in Story resources by stable catalog id and storyGraphFile public path for runtime StoryScene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'StoryScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect(resolver.resolveJsonResource({
            resourceId: 'story.qingyun-entry',
            expectedKind: 'story',
        })).toEqual({
            resourceId: 'story.qingyun-entry',
            kind: 'story',
            schemaVersion: 1,
            publicPath: 'data/story/story-graph.json',
        });

        expect(resolver.resolveJsonResourceByPublicPath({
            publicPath: 'data/story/qingyun-teahouse-rumors.json',
            expectedKind: 'story',
        })).toEqual({
            resourceId: 'story.qingyun-teahouse-rumors',
            kind: 'story',
            schemaVersion: 1,
            publicPath: 'data/story/qingyun-teahouse-rumors.json',
        });
    });

    it('resolves checked-in Story battle encounter and deck resources by stable catalog ids for runtime BattleScene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'BattleScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect(resolver.resolveJsonResource({
            resourceId: 'test_encounter_01',
            expectedKind: 'encounter',
        })).toEqual({
            resourceId: 'test_encounter_01',
            kind: 'encounter',
            schemaVersion: 1,
            publicPath: 'data/encounters/test-enemy.json',
        });
        expect(resolver.resolveJsonResource({
            resourceId: 'deck.starter',
            expectedKind: 'deck',
        })).toEqual({
            resourceId: 'deck.starter',
            kind: 'deck',
            schemaVersion: 1,
            publicPath: 'data/decks/starter-deck.json',
        });
    });

    it('resolves checked-in direct/default Battle resources by stable catalog ids for runtime BattleScene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'BattleScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect([
            resolver.resolveJsonResource({
                resourceId: 'test_encounter_02',
                expectedKind: 'encounter',
            }),
            resolver.resolveJsonResource({
                resourceId: 'deck.starter',
                expectedKind: 'deck',
            }),
        ]).toEqual([
            {
                resourceId: 'test_encounter_02',
                kind: 'encounter',
                schemaVersion: 1,
                publicPath: 'data/encounters/medium-enemy.json',
            },
            {
                resourceId: 'deck.starter',
                kind: 'deck',
                schemaVersion: 1,
                publicPath: 'data/decks/starter-deck.json',
            },
        ]);
    });

    it('resolves checked-in Expedition battle and boss encounter resources by stable catalog ids for runtime BattleScene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'BattleScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect([
            resolver.resolveJsonResource({
                resourceId: 'test_encounter_01',
                expectedKind: 'encounter',
            }),
            resolver.resolveJsonResource({
                resourceId: 'test_encounter_02',
                expectedKind: 'encounter',
            }),
            resolver.resolveJsonResource({
                resourceId: 'mijing_boss_01',
                expectedKind: 'encounter',
            }),
        ]).toEqual([
            {
                resourceId: 'test_encounter_01',
                kind: 'encounter',
                schemaVersion: 1,
                publicPath: 'data/encounters/test-enemy.json',
            },
            {
                resourceId: 'test_encounter_02',
                kind: 'encounter',
                schemaVersion: 1,
                publicPath: 'data/encounters/medium-enemy.json',
            },
            {
                resourceId: 'mijing_boss_01',
                kind: 'encounter',
                schemaVersion: 1,
                publicPath: 'data/encounters/mijing-boss.json',
            },
        ]);
    });

    it('resolves checked-in Expedition target resources by stable catalog ids for runtime ExpeditionScene loading', () => {
        const resolver = createContentCatalogResolver(readCatalogJson(), {
            context: 'ExpeditionScene',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        });

        expect([
            resolver.resolveJsonResource({
                resourceId: 'world.seed.initial-state',
                expectedKind: 'worldSeed',
            }),
            resolver.resolveJsonResource({
                resourceId: 'deck.starter',
                expectedKind: 'deck',
            }),
            resolver.resolveJsonResource({
                resourceId: 'phase01-prototype-map',
                expectedKind: 'expeditionMap',
            }),
            resolver.resolveJsonResource({
                resourceId: 'phase01-prototype-events',
                expectedKind: 'expeditionEvents',
            }),
            resolver.resolveJsonResource({
                resourceId: 'phase01-prototype-shop',
                expectedKind: 'expeditionShop',
            }),
        ]).toEqual([
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
                resourceId: 'phase01-prototype-map',
                kind: 'expeditionMap',
                schemaVersion: 1,
                publicPath: 'data/mijing/prototype-map.json',
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
        ]);
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

    it('keeps validation index plumbing in a focused module', () => {
        const catalog = parseContentCatalogDefinition({
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'hub.catalog',
                    kind: 'hub',
                    schemaVersion: 1,
                    publicPath: 'data/hub/catalog-hub.json',
                },
            ],
        });
        const failures: ContentCatalogValidationFailure[] = [];
        const { index, validatedResourceCount } = loadContentCatalogValidationIndex(
            catalog,
            createPublicFileSourceWithOverrides({
                'data/hub/catalog-hub.json': catalogHubDefinition,
            }),
            {
                hub(json: unknown): unknown {
                    return {
                        validatedHubId: (json as { hubId?: unknown }).hubId,
                    };
                },
            },
            failures,
        );

        expect(validatedResourceCount).toBe(1);
        expect(index.byPath.get('data/hub/catalog-hub.json')?.json).toEqual(catalogHubDefinition);
        expect(index.byResourceId.get('hub.catalog')?.validated).toEqual({
            validatedHubId: 'hub.catalog',
        });
        expect(resolveCatalogResourceIdReference(index, failures, catalog.resources[0], {
            context: 'Focused validation index fixture',
            resourceIdField: 'hubResourceId',
            resourceId: 'hub.catalog',
            publicPathField: 'hubFile',
            publicPath: 'data/hub/catalog-hub.json',
            expectedKinds: ['hub'],
        })?.entry.resourceId).toBe('hub.catalog');

        const domainFailures: ContentCatalogValidationFailure[] = [];
        validateResourceDomainId(
            {
                ...catalog.resources[0],
                resourceId: 'hub.expected',
            },
            {
                hubId: 'hub.actual',
            },
            domainFailures,
        );

        expect(failures).toEqual([]);
        expect(domainFailures).toEqual([
            {
                resourceId: 'hub.expected',
                publicPath: 'data/hub/catalog-hub.json',
                message: 'Catalog resource hub.expected (hub) domain id mismatch: data/hub/catalog-hub.json declares hubId "hub.actual".',
            },
        ]);
    });

    it('keeps route-reference validation helpers in a focused module', () => {
        const catalog = parseContentCatalogDefinition({
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
        });
        const failures: ContentCatalogValidationFailure[] = [];
        const { index } = loadContentCatalogValidationIndex(
            catalog,
            createPublicFileSourceWithOverrides({
                'data/world/catalog-route.json': createCatalogWorldMapWithDestination(createCatalogHubDestination()),
                'data/hub/catalog-hub.json': catalogHubDefinition,
            }),
            {
                worldMap(json: unknown): unknown {
                    return json;
                },
                hub(json: unknown): unknown {
                    return json;
                },
            },
            failures,
        );

        validateCatalogRouteReferences(index, failures);

        expect(failures).toEqual([]);
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


    it('returns actionable failures for duplicate catalog-backed card, gongfa, status, realm, grade, and world item IDs', () => {
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
                    resourceId: 'status.definitions',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/status-definitions.json',
                },
                canonicalCombatBaselineCatalogEntry,
                canonicalArtifactGradeCatalogEntry,
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
                units: [{ id: 'DUPLICATE_CARD', kind: 'unit', realmId: 'realm.valid' }],
            },
            'data/cards/artifacts.json': {
                artifacts: [{ id: 'DUPLICATE_CARD', kind: 'artifact', gradeId: 'grade.valid' }],
            },
            'data/gongfa/gongfa-list.json': {
                gongfa: [
                    { id: 'gongfa.duplicate', schema: createValidGongfaSchema() },
                    { id: 'gongfa.duplicate', schema: createValidGongfaSchema() },
                ],
            },
            'data/config/status-definitions.json': {
                statuses: [
                    createValidStatusDefinition('duplicate_status'),
                    createValidStatusDefinition('duplicate_status'),
                    createValidStatusDefinition('', { id: '' }),
                    createValidStatusDefinition('numeric_status_id', { id: 42 }),
                ],
            },
            'data/config/combat-baseline.json': {
                realms: [
                    { id: 'realm.valid', stage: '炼气', phase: '1层', value: 1, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.valid', stage: '炼气', phase: '6层', value: 2, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: '', stage: '炼气', phase: '12层', value: 3, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    42,
                ],
            },
            'data/config/artifact-grade.json': {
                grades: [
                    { id: 'grade.valid', tier: '黄阶', quality: '下品', star: 1, value: 1, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.valid', tier: '黄阶', quality: '中品', star: 1, value: 2, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: '', tier: '黄阶', quality: '上品', star: 1, value: 3, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    42,
                ],
            },
            'data/world/items.artifacts.json': {
                artifacts: [{ id: 'duplicate_item' }],
                tools: [{ id: 'duplicate_item' }],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog realm id realm.valid is declared more than once: config.combat-baseline realms[0] in data/config/combat-baseline.json; duplicate config.combat-baseline realms[1] in data/config/combat-baseline.json.',
            'Catalog realm entry config.combat-baseline realms[2] in data/config/combat-baseline.json must declare a non-empty string id.',
            'Catalog realm entry config.combat-baseline realms[3] in data/config/combat-baseline.json must be an object.',
            'Catalog grade id grade.valid is declared more than once: config.artifact-grade grades[0] in data/config/artifact-grade.json; duplicate config.artifact-grade grades[1] in data/config/artifact-grade.json.',
            'Catalog grade entry config.artifact-grade grades[2] in data/config/artifact-grade.json must declare a non-empty string id.',
            'Catalog grade entry config.artifact-grade grades[3] in data/config/artifact-grade.json must be an object.',
            'Catalog card id DUPLICATE_CARD is declared more than once: cards.units units[0] in data/cards/units.json; duplicate cards.artifacts artifacts[0] in data/cards/artifacts.json.',
            'Catalog gongfa id gongfa.duplicate is declared more than once: gongfa.list gongfa[0] in data/gongfa/gongfa-list.json; duplicate gongfa.list gongfa[1] in data/gongfa/gongfa-list.json.',
            'Catalog status id duplicate_status is declared more than once: status.definitions statuses[0] in data/config/status-definitions.json; duplicate status.definitions statuses[1] in data/config/status-definitions.json.',
            'Catalog status entry status.definitions statuses[2] in data/config/status-definitions.json must declare a non-empty string id.',
            'Catalog status entry status.definitions statuses[3] in data/config/status-definitions.json must declare a non-empty string id.',
            'Catalog world item id duplicate_item is declared more than once: world.seed.items-artifacts artifacts[0] in data/world/items.artifacts.json; duplicate world.seed.items-artifacts tools[0] in data/world/items.artifacts.json.',
        ]);
    });

    it('returns actionable failures for malformed canonical gongfa schema vocabulary and parameter shapes', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'gongfa.list',
                    kind: 'gongfa',
                    schemaVersion: 1,
                    publicPath: 'data/gongfa/gongfa-list.json',
                },
                {
                    resourceId: 'status.definitions',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/status-definitions.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/gongfa/gongfa-list.json': {
                gongfa: [
                    {
                        id: 'gongfa.bad_schema',
                        schema: 'not an object',
                    },
                    {
                        id: 'gongfa.bad_shapes',
                        schema: {
                            event: {
                                type: 'BeforeAnything',
                                side: 'SomeoneElse',
                            },
                            conditions: [
                                {
                                    type: 'UnknownCondition',
                                },
                                {
                                    type: 'ArtifactUsedThisTurn',
                                    minimum: 'one',
                                },
                                {
                                    type: 'Custom',
                                    scriptId: 'gongfa.condition.not_canonical',
                                },
                            ],
                            actions: [
                                {
                                    type: 'RecoverCardFromDiscard',
                                    filter: {
                                        kind: ['artifact', 'beast'],
                                        weaponTypesAnyOf: ['剑', 42],
                                        maxStar: {},
                                        amount: 0,
                                        typo: true,
                                    },
                                    destination: 'Graveyard',
                                    amount: 'one',
                                },
                                {
                                    type: 'DealDamage',
                                    value: 'high',
                                    target: 'closestEnemy',
                                },
                                {
                                    type: 'ApplyStatus',
                                    statusId: 'status.missing',
                                    duration: 'later',
                                    target: 'allies',
                                },
                                {
                                    type: 'Custom',
                                    scriptId: 'gongfa.action.not_canonical',
                                },
                            ],
                        },
                    },
                    {
                        id: 'gongfa.bad_custom_event',
                        schema: {
                            event: {
                                type: 'Custom',
                                side: 'Ally',
                                scriptId: 'gongfa.event.not_canonical',
                            },
                            actions: [
                                {
                                    type: 'AddLog',
                                },
                            ],
                        },
                    },
                ],
            },
            'data/config/status-definitions.json': {
                statuses: [createValidStatusDefinition('status.valid')],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog gongfa definition gongfa.list gongfa[0] gongfa.bad_schema in data/gongfa/gongfa-list.json schema must be an object.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.event.type must be one of: TurnStart, TurnEnd, OnSummon, OnDeath, OnAttack, OnKill, OnEquipArtifact, Custom.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.event.side must be one of: Ally, Enemy, Any when present.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.conditions[0].type must be one of: ArtifactUsedThisTurn, UnitOnField, CardInHand, ArtifactEquipped, Custom.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.conditions[1].minimum must be a positive integer when present.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.conditions[2].scriptId references non-canonical gongfa Custom script id gongfa.condition.not_canonical; add an explicit catalog validator allowlist entry before using runtime custom semantics.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].filter.kind[1] must be one of: unit, artifact, talisman, field.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].filter.weaponTypesAnyOf[1] must be a non-empty string.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].filter.maxStar must be a finite number or non-empty string.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].filter.amount must be a positive integer when present.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].filter.typo is not supported; allowed filter fields: kind, labelsAnyOf, maxStar, amount, weaponTypesAnyOf.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].destination must be one of: Hand, Field, DeckTop, DiscardPile.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[0].amount must be a positive integer when present.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[1].value must be a finite number.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[1].target must be one of: singleEnemy, allEnemies, randomEnemy.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[2].statusId references status id status.missing, but canonical data/config/status-definitions.json does not declare that id.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[2].duration must be a non-negative integer when present.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[2].target must be one of: self, singleAlly, singleEnemy, allEnemies.',
            'Catalog gongfa definition gongfa.list gongfa[1] gongfa.bad_shapes in data/gongfa/gongfa-list.json schema.actions[3].scriptId references non-canonical gongfa Custom script id gongfa.action.not_canonical; add an explicit catalog validator allowlist entry before using runtime custom semantics.',
            'Catalog gongfa definition gongfa.list gongfa[2] gongfa.bad_custom_event in data/gongfa/gongfa-list.json schema.event.scriptId references non-canonical gongfa Custom script id gongfa.event.not_canonical; add an explicit catalog validator allowlist entry before using runtime custom semantics.',
            'Catalog gongfa definition gongfa.list gongfa[2] gongfa.bad_custom_event in data/gongfa/gongfa-list.json schema.actions[0].message must be a non-empty string.',
        ]);
    });

    it('returns actionable failures for malformed canonical status definition vocabulary and value shapes', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'status.definitions',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/status-definitions.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/config/status-definitions.json': {
                statuses: [
                    {
                        id: 'status.bad_shape',
                        name: '',
                        description: 42,
                        category: 'benefit',
                        timing: 'combatStart',
                        effectType: 'multiplyDamage',
                        stackConsumeType: 'perTurn',
                        baseValue: '1',
                        ignoreArmor: 'yes',
                        affectedByArmor: 1,
                        icon: 7,
                        color: false,
                        stackable: 'true',
                        maxStacks: 0,
                        defaultDuration: -1,
                    },
                ],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json name must be a non-empty string.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json description must be a non-empty string.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json category must be one of: buff, debuff, special.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json timing must be one of: turnStart, turnEnd, onDamaged, onAttack, onBeAttacked, persistent.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json effectType must be one of: damage, heal, modifyAttack, modifyDefense, amplifyDamage, reduceDamage, preventAction, preventSkill, taunt, stealth, mark.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json stackConsumeType must be one of: onTrigger, onDamage, allAtOnce, none.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json baseValue must be a finite number.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json ignoreArmor must be a boolean when present.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json affectedByArmor must be a boolean when present.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json icon must be a non-empty string.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json color must be a non-empty string.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json stackable must be a boolean.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json maxStacks must be a positive integer.',
            'Catalog status definition status.definitions statuses[0] status.bad_shape in data/config/status-definitions.json defaultDuration must be a non-negative integer when present.',
        ]);
    });

    it('returns actionable failures for missing or malformed canonical realm and grade registries', () => {
        const missingRegistryCatalog = {
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
            ],
        };
        const missingRegistryResult = validateContentCatalog(missingRegistryCatalog, createPublicFileSourceWithOverrides({
            'data/cards/units.json': {
                units: [{ id: 'CARD_REALM_NEEDS_REGISTRY', kind: 'unit', realmId: 'realm.valid' }],
            },
            'data/cards/artifacts.json': {
                artifacts: [{ id: 'CARD_GRADE_NEEDS_REGISTRY', kind: 'artifact', gradeId: 'grade.valid' }],
            },
        }));

        expect(missingRegistryResult.failures.map((failure) => failure.message)).toEqual([
            'Catalog realm registry config.combat-baseline (data/config/combat-baseline.json) is missing; add it to the content catalog so unit card realmId references can be verified.',
            'Catalog grade registry config.artifact-grade (data/config/artifact-grade.json) is missing; add it to the content catalog so artifact card gradeId references can be verified.',
        ]);

        const malformedRegistryCatalog = {
            schemaVersion: 1,
            resources: [
                canonicalRealmPresetsCatalogEntry,
                canonicalCombatBaselineCatalogEntry,
                canonicalArtifactGradeCatalogEntry,
            ],
        };
        const malformedRegistryResult = validateContentCatalog(
            malformedRegistryCatalog,
            createPublicFileSourceWithOverrides({
                'data/config/realm-presets.json': { realmStagesByValue: {} },
                'data/config/combat-baseline.json': { realmsById: {} },
                'data/config/artifact-grade.json': { gradesById: {} },
            }),
        );

        expect(malformedRegistryResult.failures.map((failure) => failure.message)).toEqual([
            'Catalog realm presets config config.realm-presets in data/config/realm-presets.json must declare a top-level realmStages array.',
            'Catalog realm registry config.combat-baseline in data/config/combat-baseline.json must declare a top-level realms array.',
            'Catalog grade registry config.artifact-grade in data/config/artifact-grade.json must declare a top-level grades array.',
        ]);
    });

    it('returns actionable failures for canonical realm preset shape and numeric value drift', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                canonicalRealmPresetsCatalogEntry,
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithRawOverrides({
            'data/config/realm-presets.json': JSON.stringify({
                realmStages: [
                    {
                        stage: '炼气',
                        phases: [
                            { phase: '1层', value: 1 },
                            { phase: '2层', value: 1 },
                            { phase: 3, value: -1 },
                        ],
                    },
                    {
                        stage: 42,
                        phases: 'not an array',
                    },
                    42,
                ],
            }).replace('"value":-1', '"value":1e309'),
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog realm preset value 1 is declared more than once: config.realm-presets realmStages[0].phases[0] in data/config/realm-presets.json; duplicate config.realm-presets realmStages[0].phases[1] in data/config/realm-presets.json.',
            'Catalog realm preset phase config.realm-presets realmStages[0].phases[2] in data/config/realm-presets.json phase must be a string.',
            'Catalog realm preset phase config.realm-presets realmStages[0].phases[2] in data/config/realm-presets.json value must be a finite non-negative number.',
            'Catalog realm preset stage config.realm-presets realmStages[1] in data/config/realm-presets.json stage must be a string.',
            'Catalog realm preset stage config.realm-presets realmStages[1] in data/config/realm-presets.json must declare a phases array.',
            'Catalog realm preset stage config.realm-presets realmStages[2] in data/config/realm-presets.json must be an object.',
        ]);
    });

    it('returns actionable failures for combat-baseline shape, numeric ranges, and realm-preset consistency', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                canonicalRealmPresetsCatalogEntry,
                canonicalCombatBaselineCatalogEntry,
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithRawOverrides({
            'data/config/realm-presets.json': JSON.stringify(validRealmPresetsRegistry),
            'data/config/combat-baseline.json': JSON.stringify({
                realms: [
                    { id: 'realm.valid', stage: '炼气', phase: '1层', value: 1, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.valid', stage: '炼气', phase: '2层', value: 2, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.duplicate_value', stage: '筑基', phase: '初期', value: 1, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.bad_display', stage: 42, phase: [], value: 4, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.bad_numeric', stage: '炼气', phase: '3层', value: -1, attackMin: -1, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.bad_attack_range', stage: '筑基', phase: '中期', value: 5, attackMin: 3, attackMax: 2, healthMin: 3, healthMax: 4 },
                    { id: 'realm.bad_health_range', stage: '筑基', phase: '后期', value: 6, attackMin: 1, attackMax: 2, healthMin: 5, healthMax: 4 },
                    { id: 'realm.unknown_preset', stage: '金丹', phase: '初期', value: 99, attackMin: 1, attackMax: 2, healthMin: 3, healthMax: 4 },
                ],
            }).replace('"value":-1', '"value":1e309'),
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog realm id realm.valid is declared more than once: config.combat-baseline realms[0] in data/config/combat-baseline.json; duplicate config.combat-baseline realms[1] in data/config/combat-baseline.json.',
            'Catalog combat baseline realm config.combat-baseline realms[1] in data/config/combat-baseline.json value 2 is not declared by canonical data/config/realm-presets.json.',
            'Catalog realm value 1 is declared more than once: config.combat-baseline realms[0] in data/config/combat-baseline.json; duplicate config.combat-baseline realms[2] in data/config/combat-baseline.json.',
            'Catalog combat baseline realm config.combat-baseline realms[3] in data/config/combat-baseline.json stage must be a string.',
            'Catalog combat baseline realm config.combat-baseline realms[3] in data/config/combat-baseline.json phase must be a string.',
            'Catalog combat baseline realm config.combat-baseline realms[4] in data/config/combat-baseline.json value must be a finite non-negative number.',
            'Catalog combat baseline realm config.combat-baseline realms[4] in data/config/combat-baseline.json attackMin must be a finite non-negative number.',
            'Catalog combat baseline realm config.combat-baseline realms[5] in data/config/combat-baseline.json attackMin must be <= attackMax.',
            'Catalog combat baseline realm config.combat-baseline realms[5] in data/config/combat-baseline.json value 5 is not declared by canonical data/config/realm-presets.json.',
            'Catalog combat baseline realm config.combat-baseline realms[6] in data/config/combat-baseline.json healthMin must be <= healthMax.',
            'Catalog combat baseline realm config.combat-baseline realms[6] in data/config/combat-baseline.json value 6 is not declared by canonical data/config/realm-presets.json.',
            'Catalog combat baseline realm config.combat-baseline realms[7] in data/config/combat-baseline.json value 99 is not declared by canonical data/config/realm-presets.json.',
        ]);
    });

    it('returns actionable failures for artifact-grade display fields, numeric ranges, duplicate values, and star bounds', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                canonicalArtifactGradeCatalogEntry,
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithRawOverrides({
            'data/config/artifact-grade.json': JSON.stringify({
                grades: [
                    { id: 'grade.valid', tier: '黄阶', quality: '下品', star: 1, value: 1, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.valid', tier: '黄阶', quality: '中品', star: 1, value: 2, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.duplicate_value', tier: '地阶', quality: '下品', star: 2, value: 1, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_display', tier: 42, quality: [], star: 2, value: 3, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_numeric', tier: '玄阶', quality: '下品', star: 3, value: -1, attackBonusMin: -1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_star_low', tier: '玄阶', quality: '中品', star: 0, value: 4, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_star_high', tier: '玄阶', quality: '上品', star: 13, value: 5, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_attack_range', tier: '天阶', quality: '下品', star: 4, value: 6, attackBonusMin: 3, attackBonusMax: 2, healthBonusMin: 3, healthBonusMax: 4 },
                    { id: 'grade.bad_health_range', tier: '天阶', quality: '中品', star: 4, value: 7, attackBonusMin: 1, attackBonusMax: 2, healthBonusMin: 5, healthBonusMax: 4 },
                ],
            }).replace('"value":-1', '"value":1e309'),
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog grade id grade.valid is declared more than once: config.artifact-grade grades[0] in data/config/artifact-grade.json; duplicate config.artifact-grade grades[1] in data/config/artifact-grade.json.',
            'Catalog grade value 1 is declared more than once: config.artifact-grade grades[0] in data/config/artifact-grade.json; duplicate config.artifact-grade grades[2] in data/config/artifact-grade.json.',
            'Catalog artifact grade config.artifact-grade grades[3] in data/config/artifact-grade.json tier must be a string.',
            'Catalog artifact grade config.artifact-grade grades[3] in data/config/artifact-grade.json quality must be a string.',
            'Catalog artifact grade config.artifact-grade grades[4] in data/config/artifact-grade.json value must be a finite non-negative number.',
            'Catalog artifact grade config.artifact-grade grades[4] in data/config/artifact-grade.json attackBonusMin must be a finite non-negative number.',
            'Catalog artifact grade config.artifact-grade grades[5] in data/config/artifact-grade.json star must be an integer between 1 and 12.',
            'Catalog artifact grade config.artifact-grade grades[6] in data/config/artifact-grade.json star must be an integer between 1 and 12.',
            'Catalog artifact grade config.artifact-grade grades[7] in data/config/artifact-grade.json attackBonusMin must be <= attackBonusMax.',
            'Catalog artifact grade config.artifact-grade grades[8] in data/config/artifact-grade.json healthBonusMin must be <= healthBonusMax.',
        ]);
    });

    it('returns actionable failures when canonical config catalog kind or publicPath drifts', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    ...canonicalRealmPresetsCatalogEntry,
                    kind: 'card',
                    publicPath: 'data/config/realm-presets-v2.json',
                },
                {
                    ...canonicalCombatBaselineCatalogEntry,
                    kind: 'deck',
                    publicPath: 'data/config/combat-baseline-v2.json',
                },
                {
                    ...canonicalArtifactGradeCatalogEntry,
                    kind: 'status',
                    publicPath: 'data/config/artifact-grade-v2.json',
                },
            ],
        };

        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/config/realm-presets-v2.json': validRealmPresetsRegistry,
            'data/config/combat-baseline-v2.json': validCombatBaselineRegistry,
            'data/config/artifact-grade-v2.json': validArtifactGradeRegistry,
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Catalog canonical config config.realm-presets must have kind config; found card.',
            'Catalog canonical config config.realm-presets must use publicPath data/config/realm-presets.json; found data/config/realm-presets-v2.json.',
            'Catalog canonical config config.combat-baseline must have kind config; found deck.',
            'Catalog canonical config config.combat-baseline must use publicPath data/config/combat-baseline.json; found data/config/combat-baseline-v2.json.',
            'Catalog canonical config config.artifact-grade must have kind config; found status.',
            'Catalog canonical config config.artifact-grade must use publicPath data/config/artifact-grade.json; found data/config/artifact-grade-v2.json.',
        ]);
    });

    it('returns actionable failures for non-string or unknown unit realmId and artifact gradeId references', () => {
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
                canonicalCombatBaselineCatalogEntry,
                canonicalArtifactGradeCatalogEntry,
                {
                    resourceId: 'config.combat-baseline.extra',
                    kind: 'config',
                    schemaVersion: 1,
                    publicPath: 'data/config/extra-combat-baseline.json',
                },
                {
                    resourceId: 'config.artifact-grade.extra',
                    kind: 'config',
                    schemaVersion: 1,
                    publicPath: 'data/config/extra-artifact-grade.json',
                },
            ],
        };
        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/cards/units.json': {
                units: [
                    { id: 'CARD_REALM_OK', kind: 'unit', realmId: 'realm.valid' },
                    { id: 'CARD_REALM_UNKNOWN', kind: 'unit', realmId: 'realm.only_in_extra_registry' },
                    { id: 'CARD_REALM_MISSING', kind: 'unit' },
                    { id: 'CARD_REALM_MALFORMED', kind: 'unit', realmId: 42 },
                ],
            },
            'data/cards/artifacts.json': {
                artifacts: [
                    { id: 'CARD_GRADE_OK', kind: 'artifact', gradeId: 'grade.valid' },
                    { id: 'CARD_GRADE_UNKNOWN', kind: 'artifact', gradeId: 'grade.only_in_extra_registry' },
                    { id: 'CARD_GRADE_MISSING', kind: 'artifact' },
                    { id: 'CARD_GRADE_MALFORMED', kind: 'artifact', gradeId: 42 },
                ],
            },
            ...createCanonicalRealmAndGradeOverrides(),
            'data/config/extra-combat-baseline.json': {
                realms: [{ id: 'realm.only_in_extra_registry' }],
            },
            'data/config/extra-artifact-grade.json': {
                grades: [{ id: 'grade.only_in_extra_registry' }],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toEqual([
            'Card cards.units units[1] CARD_REALM_UNKNOWN realmId references realm id realm.only_in_extra_registry, but canonical data/config/combat-baseline.json does not declare that id.',
            'Card cards.units units[2] CARD_REALM_MISSING.realmId must be a non-empty string so the catalog can verify the realm reference.',
            'Card cards.units units[3] CARD_REALM_MALFORMED.realmId must be a non-empty string so the catalog can verify the realm reference.',
            'Card cards.artifacts artifacts[1] CARD_GRADE_UNKNOWN gradeId references grade id grade.only_in_extra_registry, but canonical data/config/artifact-grade.json does not declare that id.',
            'Card cards.artifacts artifacts[2] CARD_GRADE_MISSING.gradeId must be a non-empty string so the catalog can verify the grade reference.',
            'Card cards.artifacts artifacts[3] CARD_GRADE_MALFORMED.gradeId must be a non-empty string so the catalog can verify the grade reference.',
        ]);
    });

    it('returns actionable failures for missing deck, encounter, Expedition reward, gongfa, and legacy applyStatus status content IDs', () => {
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
                    resourceId: 'status.definitions',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/status-definitions.json',
                },
                canonicalCombatBaselineCatalogEntry,
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
                    { id: 'CARD_VALID', kind: 'unit', realmId: 'realm.valid', gongfaIds: ['gongfa.valid'] },
                    { id: 'CARD_BAD_GONGFA', kind: 'unit', realmId: 'realm.valid', gongfaIds: ['gongfa.missing'] },
                    {
                        id: 'CARD_BAD_STATUS',
                        kind: 'unit',
                        realmId: 'realm.valid',
                        effects: [
                            {
                                actions: [
                                    {
                                        type: 'applyStatus',
                                        statusId: 'status.missing',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'CARD_MISSING_STATUS_FIELD',
                        kind: 'unit',
                        realmId: 'realm.valid',
                        effects: [
                            {
                                actions: [
                                    {
                                        type: 'applyStatus',
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        id: 'CARD_MALFORMED_STATUS_FIELD',
                        kind: 'unit',
                        realmId: 'realm.valid',
                        effects: [
                            {
                                actions: [
                                    {
                                        type: 'applyStatus',
                                        statusId: 42,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            'data/gongfa/gongfa-list.json': {
                gongfa: [{ id: 'gongfa.valid', schema: createValidGongfaSchema() }],
            },
            'data/config/status-definitions.json': {
                statuses: [createValidStatusDefinition('status.valid')],
            },
            'data/config/combat-baseline.json': validCombatBaselineRegistry,
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
            'Card cards.units units[2] CARD_BAD_STATUS effects[0].actions[0].statusId references status id status.missing, but canonical data/config/status-definitions.json does not declare that id.',
            'Card cards.units units[3] CARD_MISSING_STATUS_FIELD effects[0].actions[0].statusId must be a non-empty string so the catalog can verify the content ID reference.',
            'Card cards.units units[4] CARD_MALFORMED_STATUS_FIELD effects[0].actions[0].statusId must be a non-empty string so the catalog can verify the content ID reference.',
            'Deck deck.test cards[0].id references card id CARD_MISSING_FROM_DECK, but no catalog card resource declares that id.',
            'Encounter encounter.test enemies[0].cardId references card id CARD_MISSING_FROM_ENCOUNTER, but no catalog card resource declares that id.',
            'Expedition events events.test eventsByNodeId.event.test.pool[0].rewards.cards[0].id references card id CARD_MISSING_FROM_EVENT, but no catalog card resource declares that id.',
            'Expedition events events.test eventsByNodeId.event.test.pool[0].rewards.items[0].id references world item id item.missing.event, but no catalog world item resource declares that id.',
            'Expedition shop shop.test shopsByNodeId.shop.test.offers[0].rewards.cards[0].id references card id CARD_MISSING_FROM_SHOP, but no catalog card resource declares that id.',
            'Expedition shop shop.test shopsByNodeId.shop.test.offers[0].rewards.items[0].id references world item id item.missing.shop, but no catalog world item resource declares that id.',
        ]);
    });

    it('returns actionable failures for malformed canonical starter stash deck/item references and numeric shape', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
                {
                    resourceId: 'world.seed.initial-state',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/initial-state.json',
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
            'data/decks/starter-deck.json': {
                cards: [],
            },
            'data/world/items.artifacts.json': {
                artifacts: [{ id: 'artifact.valid' }],
                tools: [{ id: 'tool.valid' }],
                consumables: [{ id: 'consumable.valid' }],
            },
            'data/world/initial-state.json': {
                stash: {
                    stashId: '',
                    deckRef: 'deck.missing',
                    items: [
                        { id: 'tool.valid', itemType: 'tool', count: 0 },
                        { id: 'item.missing', itemType: 'consumable', count: 1 },
                        { id: 'tool.valid', itemType: 'consumable', count: 1 },
                        { id: 42, itemType: 'tool', count: 1 },
                        { id: 'artifact.valid', itemType: 'trinket', count: 1 },
                        'not-an-item-stack',
                    ],
                    spiritStones: -1,
                },
            },
        }));
        const messages = result.failures.map((failure) => failure.message);

        expect(messages).toContain(
            'World seed world.seed.initial-state stash.stashId must be a non-empty string so the catalog can verify the starter stash identity.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.deckRef references deck id deck.missing, but no catalog deck resource declares that id.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[0].count must be a positive integer.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[1].id references world item id item.missing, but no catalog world item resource declares that id.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[2].itemType is consumable, but item tool.valid is declared as tool in world.seed.items-artifacts tools[0] in data/world/items.artifacts.json.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[3].id must be a non-empty string so the catalog can verify the content ID reference.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[4].itemType must be one of: artifact, tool, consumable, quest.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.items[5] must be an object so the catalog can verify its starter stash item ID.',
        );
        expect(messages).toContain(
            'World seed world.seed.initial-state stash.spiritStones must be a non-negative integer.',
        );
    });

    it('allows the checked-in starter stash deckRef alias while still resolving through the catalog deck resource', () => {
        const catalog = {
            schemaVersion: 1,
            resources: [
                {
                    resourceId: 'deck.starter',
                    kind: 'deck',
                    schemaVersion: 1,
                    publicPath: 'data/decks/starter-deck.json',
                },
                {
                    resourceId: 'world.seed.initial-state',
                    kind: 'worldSeed',
                    schemaVersion: 1,
                    publicPath: 'data/world/initial-state.json',
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
            'data/decks/starter-deck.json': {
                cards: [],
            },
            'data/world/items.artifacts.json': {
                tools: [{ id: 'tool.return-rope' }],
                consumables: [{ id: 'consumable.spirit-salve' }],
            },
            'data/world/initial-state.json': {
                stash: {
                    stashId: 'phase01.starter-stash',
                    deckRef: 'starter-deck',
                    items: [
                        { id: 'tool.return-rope', itemType: 'tool', count: 1 },
                        { id: 'consumable.spirit-salve', itemType: 'consumable', count: 2 },
                    ],
                    spiritStones: 36,
                },
            },
        }));

        expect(result.failures).toEqual([]);
    });

    it('uses status-definitions.json as the canonical registry for legacy applyStatus status IDs', () => {
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
                    resourceId: 'status.definitions',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/status-definitions.json',
                },
                canonicalCombatBaselineCatalogEntry,
                {
                    resourceId: 'status.extra',
                    kind: 'status',
                    schemaVersion: 1,
                    publicPath: 'data/config/extra-status-definitions.json',
                },
            ],
        };

        const result = validateContentCatalog(catalog, createPublicFileSourceWithOverrides({
            'data/cards/units.json': {
                units: [
                    {
                        id: 'CARD_STATUS_FROM_EXTRA_REGISTRY',
                        kind: 'unit',
                        realmId: 'realm.valid',
                        effects: [
                            {
                                actions: [
                                    {
                                        type: 'applyStatus',
                                        statusId: 'status.only_in_extra_file',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            'data/config/status-definitions.json': {
                statuses: [createValidStatusDefinition('armor')],
            },
            'data/config/combat-baseline.json': validCombatBaselineRegistry,
            'data/config/extra-status-definitions.json': {
                statuses: [{ id: 'status.only_in_extra_file' }],
            },
        }));

        expect(result.failures.map((failure) => failure.message)).toContain(
            'Card cards.units units[0] CARD_STATUS_FROM_EXTRA_REGISTRY effects[0].actions[0].statusId references status id status.only_in_extra_file, but canonical data/config/status-definitions.json does not declare that id.',
        );
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
