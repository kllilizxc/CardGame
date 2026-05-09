import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    CONTENT_CATALOG_PUBLIC_PATH,
    type ContentCatalogFileSource,
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

describe('read-only content catalog', () => {
    it('checks in a versioned manifest covering current data resources without scene loader migration', () => {
        const catalogPath = join('public', CONTENT_CATALOG_PUBLIC_PATH);

        expect(existsSync(catalogPath)).toBe(true);

        const catalog = parseContentCatalogDefinition(readCatalogJson());

        expect(catalog.schemaVersion).toBe(1);
        expect(catalog.resources.map((entry) => [entry.kind, entry.publicPath])).toEqual(expectedCheckedInResources);
        expect(new Set(catalog.resources.map((entry) => entry.resourceId)).size).toBe(catalog.resources.length);
        expect(new Set(catalog.resources.map((entry) => entry.publicPath)).size).toBe(catalog.resources.length);
    });

    it('validates checked-in resources and their first route-critical references with pure validators', () => {
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
            'WorldMap worldmap.qingyun-region destination destination.qingyun-town hubFile references data/hub/town-shell.json, but no catalog entry exists for that public path.',
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
});
