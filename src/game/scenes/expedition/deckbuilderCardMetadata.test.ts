import { describe, expect, it } from 'bun:test';

import {
    buildDeckbuilderCardMetadataMap,
    resolveDeckbuilderCardMetadataResources,
} from './deckbuilderCardMetadata';

const CONTENT_CATALOG = {
    schemaVersion: 1,
    resources: [
        { resourceId: 'cards.units', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/units.json' },
        { resourceId: 'cards.artifacts', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/artifacts.json' },
        { resourceId: 'cards.talismans', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/talismans.json' },
        { resourceId: 'cards.pills', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/pills.json' },
        { resourceId: 'cards.fields', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/fields.json' },
        { resourceId: 'cards.skills', kind: 'card', schemaVersion: 1, publicPath: 'data/cards/skills.json' },
    ],
};

describe('deckbuilder card metadata helpers', () => {
    it('resolves the six card resources used by the expedition deckbuilder', () => {
        const resources = resolveDeckbuilderCardMetadataResources(CONTENT_CATALOG);

        expect(resources.unitCards).toEqual({
            cacheKey: 'unitCards',
            collectionKey: 'units',
            resourceId: 'cards.units',
            publicPath: 'data/cards/units.json',
        });
        expect(resources.skillCards).toEqual({
            cacheKey: 'skillCards',
            collectionKey: 'skills',
            resourceId: 'cards.skills',
            publicPath: 'data/cards/skills.json',
        });
    });

    it('builds player-facing name and kind metadata while safely skipping malformed cache entries', () => {
        const resources = resolveDeckbuilderCardMetadataResources(CONTENT_CATALOG);
        const loadedJson = {
            unitCards: {
                units: [
                    { id: 'CR_001', name: '火虎', kind: 'unit' },
                    { id: 'BROKEN_KIND', name: '坏条目', kind: 'unknown' },
                    { name: 'missing-id', kind: 'unit' },
                ],
            },
            artifactCards: {
                artifacts: [
                    { id: 'AR_001', name: '青云剑', kind: 'artifact' },
                ],
            },
            talismanCards: {
                talismans: [
                    { id: 'TL_001', kind: 'talisman' },
                ],
            },
            pillCards: {
                pills: 'malformed',
            },
            fieldCards: undefined,
            skillCards: {
                skills: [
                    { id: 'SK_001', name: '灵兽召唤练习', kind: 'skill' },
                ],
            },
        } as const;

        const metadata = buildDeckbuilderCardMetadataMap(
            resources,
            (cacheKey) => loadedJson[cacheKey],
        );

        expect(metadata).toEqual({
            CR_001: { name: '火虎', kind: 'unit' },
            BROKEN_KIND: { name: '坏条目' },
            AR_001: { name: '青云剑', kind: 'artifact' },
            TL_001: { kind: 'talisman' },
            SK_001: { name: '灵兽召唤练习', kind: 'skill' },
        });
    });
});
