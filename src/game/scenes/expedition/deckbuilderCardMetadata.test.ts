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

    it('builds player-facing preview metadata from loaded card content while safely skipping malformed cache entries', () => {
        const resources = resolveDeckbuilderCardMetadataResources(CONTENT_CATALOG);
        const loadedJson = {
            unitCards: {
                units: [
                    {
                        id: 'CR_001',
                        name: '火虎',
                        kind: 'unit',
                        description: '山林间游走的火属性灵兽。',
                        rarity: 'common',
                        labels: ['灵兽', '火系'],
                        limitPerDeck: 3,
                        race: '兽族',
                        linggen: ['火'],
                        attack: 4,
                        health: 2,
                        effects: [
                            { text: '登场时：若本回合已召唤过其他灵兽，则本卡攻击力+1。' },
                        ],
                    },
                    { id: 'BROKEN_KIND', name: '坏条目', kind: 'unknown' },
                    { name: 'missing-id', kind: 'unit' },
                ],
            },
            artifactCards: {
                artifacts: [
                    {
                        id: 'AR_001',
                        name: '青云剑',
                        kind: 'artifact',
                        description: '青云宗外门弟子常用的飞剑。',
                        rarity: 'uncommon',
                        limitPerDeck: 2,
                        gradeId: 'grade_yellow_lower',
                        weaponType: '剑',
                        equipTarget: 'unit',
                        elements: ['金'],
                        attackBonus: 1,
                        effects: [
                            { text: '攻击时：本次攻击额外获得+1攻击力。' },
                            { text: '击败敌方单位后：抽1张牌。' },
                        ],
                    },
                ],
            },
            talismanCards: {
                talismans: [
                    { id: 'TL_001', kind: 'talisman', target: 'unit', isInstant: true, limitPerDeck: 3 },
                ],
            },
            pillCards: {
                pills: [
                    {
                        id: 'PL_001',
                        name: '小回气丹',
                        kind: 'pill',
                        grade: 2,
                        target: 'player',
                        isInstant: true,
                    },
                ],
            },
            fieldCards: {
                fields: [
                    {
                        id: 'FD_001',
                        name: '灵泉圣地',
                        kind: 'field',
                        symmetric: true,
                    },
                ],
            },
            skillCards: {
                skills: [
                    {
                        id: 'SK_001',
                        name: '灵兽召唤练习',
                        kind: 'skill',
                        cooldownType: 'perTurn',
                        effects: [
                            { actions: [{ type: 'drawCard', count: 1 }] },
                        ],
                    },
                ],
            },
        } as const;

        const metadata = buildDeckbuilderCardMetadataMap(
            resources,
            (cacheKey) => loadedJson[cacheKey],
        );

        expect(metadata).toEqual({
            CR_001: {
                name: '火虎',
                kind: 'unit',
                description: '山林间游走的火属性灵兽。',
                effectSummary: '登场时：若本回合已召唤过其他灵兽，则本卡攻击力+1。',
                rarity: 'common',
                labels: ['灵兽', '火系'],
                limitPerDeck: 3,
                attack: 4,
                health: 2,
                race: '兽族',
                linggen: ['火'],
            },
            BROKEN_KIND: { name: '坏条目' },
            AR_001: {
                name: '青云剑',
                kind: 'artifact',
                description: '青云宗外门弟子常用的飞剑。',
                effectSummary: '攻击时：本次攻击额外获得+1攻击力。 / 击败敌方单位后：抽1张牌。',
                rarity: 'uncommon',
                limitPerDeck: 2,
                weaponType: '剑',
                equipTarget: 'unit',
                elements: ['金'],
                attackBonus: 1,
                gradeLabel: '黄阶下品',
            },
            TL_001: { kind: 'talisman', target: 'unit', isInstant: true, limitPerDeck: 3 },
            PL_001: { name: '小回气丹', kind: 'pill', target: 'player', isInstant: true, gradeLabel: '二品丹药' },
            FD_001: { name: '灵泉圣地', kind: 'field', symmetric: true },
            SK_001: { name: '灵兽召唤练习', kind: 'skill', effectSummary: '抽1张卡', cooldownType: 'perTurn' },
        });
    });
});
