import { describe, expect, it } from 'bun:test';

import {
    buildDeckManagementCardPreviewResolver,
    DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID,
} from './DeckManagementCardPreview';

describe('DeckManagementCardPreview', () => {
    it('reuses loaded expedition card caches to resolve shared preview card data by id', () => {
        const resolver = buildDeckManagementCardPreviewResolver(
            {
                unitCards: {
                    cacheKey: 'unitCards',
                    collectionKey: 'units',
                    resourceId: 'cards.units',
                    publicPath: '/cards/units.json',
                },
                artifactCards: {
                    cacheKey: 'artifactCards',
                    collectionKey: 'artifacts',
                    resourceId: 'cards.artifacts',
                    publicPath: '/cards/artifacts.json',
                },
                talismanCards: {
                    cacheKey: 'talismanCards',
                    collectionKey: 'talismans',
                    resourceId: 'cards.talismans',
                    publicPath: '/cards/talismans.json',
                },
                pillCards: {
                    cacheKey: 'pillCards',
                    collectionKey: 'pills',
                    resourceId: 'cards.pills',
                    publicPath: '/cards/pills.json',
                },
                fieldCards: {
                    cacheKey: 'fieldCards',
                    collectionKey: 'fields',
                    resourceId: 'cards.fields',
                    publicPath: '/cards/fields.json',
                },
                skillCards: {
                    cacheKey: 'skillCards',
                    collectionKey: 'skills',
                    resourceId: 'cards.skills',
                    publicPath: '/cards/skills.json',
                },
            },
            (cacheKey) => {
                switch (cacheKey) {
                    case 'unitCards':
                        return {
                            units: [{ id: 'unit.alpha', kind: 'unit', name: '甲灵' }],
                        };
                    case 'artifactCards':
                        return {
                            artifacts: [{ id: 'artifact.beta', kind: 'artifact', name: '乙器' }],
                        };
                    case 'skillCards':
                        return {
                            skills: [{ id: 'skill.gamma', kind: 'skill', name: '丙诀' }],
                        };
                    default:
                        return {};
                }
            },
        );

        expect(resolver('unit.alpha')).toEqual({
            id: 'unit.alpha',
            kind: 'unit',
            name: '甲灵',
        });
        expect(resolver('artifact.beta')).toEqual({
            id: 'artifact.beta',
            kind: 'artifact',
            name: '乙器',
        });
        expect(resolver('skill.gamma')).toBeNull();
        expect(resolver('missing.card')).toBeNull();
        expect(DECK_MANAGEMENT_CARD_PREVIEW_CONTEXT_ID).toBe('deck-management');
    });
});
