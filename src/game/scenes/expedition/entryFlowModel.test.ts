import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { resetRunPersistenceForTests } from '../../services/RunPersistence';
import type { CardMetadataMap } from '../../state/CardCollectionViewModel';
import { ExpeditionState } from '../../state/ExpeditionState';
import { validateExpeditionLoadout } from './expeditionEntryFlow';
import {
    createPreparationDeckCardPreview,
    createPreparationDeckContext,
    createPreparationDeckHandoffSummary,
    createPreparationSelectedLoadoutSummary,
    createPostRunEntranceStatus,
    createPreparationSummary,
    createRunResolutionSummaryView,
    createRunSummary,
    formatPreparationValidationLines,
} from './entryFlowModel';

const PREPARATION_CARD_METADATA: CardMetadataMap = {
    AR_001: { name: '青云剑', kind: 'artifact' },
    AR_002: { name: '流云符', kind: 'talisman' },
    SX_YJZ_001: { name: '一剑斩', kind: 'skill' },
};

describe('entryFlowModel', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('summarizes the starter stash for the preparation panel', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(createPreparationSummary(state.persistentStash)).toEqual({
            deckCount: 20,
            itemCount: 3,
            spiritStones: 36,
            statusText: '储物袋已备好：20 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('summarizes the currently selected preparation loadout for quick scanning', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(createPreparationSelectedLoadoutSummary(state.persistentStash)).toMatchObject({
            selectedDeckName: '功能测试卡组',
            deckCount: 20,
            uniqueCardCount: 8,
            itemCount: 3,
            spiritStones: 36,
            readiness: 'ready',
            readinessLabel: '已满足带入要求',
            headline: '当前卡组已可带入',
            detail: '满足 20-40 张且所有卡牌均在储物袋中。',
            footer: '确认时会携带 20 张卡、3 件道具与 36 枚灵石进入秘境。',
            shortageCardKinds: 0,
            shortageCardCopies: 0,
            kindSummaryLine: '8 种卡 · 共 20 张',
            compositionLine: 'SX_YJZ_001 ×3 · SX_YJS_001 ×3 · SX_TY_001 ×3 · SX_JXTM_001 ×2 · …另 4 项',
            issuePreviewLines: [],
            deckPreviewLines: [
                'SX_YJZ_001 ×3',
                'SX_YJS_001 ×3',
                'SX_TY_001 ×3',
                'SX_JXTM_001 ×2',
                'SX_JYNX_001 ×1',
                'AR_001 ×3',
                'AR_002 ×2',
                'AR_004 ×3',
            ],
            itemPreviewLines: [
                'tool.return-rope ×1',
                'consumable.spirit-salve ×2',
            ],
        });
    });

    it('highlights inventory shortages in the selected preparation loadout summary', () => {
        const stash = {
            stashId: 'phase01.starter-stash',
            cards: [
                { id: 'AR_001', count: 3 },
                { id: 'AR_002', count: 2 },
            ],
            savedDecks: [{
                id: 'shortage',
                name: '缺牌卡组',
                cards: [
                    { id: 'AR_001', count: 4 },
                    { id: 'AR_002', count: 3 },
                    { id: 'AR_003', count: 13 },
                ],
            }],
            selectedDeckId: 'shortage',
            items: [],
            spiritStones: 18,
            lastRunSummary: null,
        };

        expect(createPreparationSelectedLoadoutSummary(stash)).toMatchObject({
            selectedDeckName: '缺牌卡组',
            deckCount: 20,
            uniqueCardCount: 3,
            readiness: 'insufficient-copies',
            readinessLabel: '缺少库存卡牌',
            headline: '当前卡组库存不足',
            detail: '3 种卡牌库存不足，共缺 15 张。',
            footer: '补齐库存卡牌后，会按当前所示卡组与物资进入秘境。',
            shortageCardKinds: 3,
            shortageCardCopies: 15,
            kindSummaryLine: '3 种卡 · 共 20 张',
            compositionLine: 'AR_001 ×4 · AR_002 ×3 · AR_003 ×13',
            issuePreviewLines: [
                'AR_003 还差 13 张',
                'AR_001 还差 1 张',
                'AR_002 还差 1 张',
            ],
        });
    });

    it('uses metadata-backed card names in selected-loadout previews and falls back to raw ids when missing', () => {
        const stash = {
            stashId: 'phase01.starter-stash',
            cards: [
                { id: 'AR_001', count: 3 },
                { id: 'AR_002', count: 2 },
                { id: 'AR_003', count: 13 },
            ],
            savedDecks: [{
                id: 'named-preview',
                name: '带名卡组',
                cards: [
                    { id: 'AR_001', count: 3 },
                    { id: 'AR_002', count: 2 },
                    { id: 'AR_003', count: 13 },
                ],
            }],
            selectedDeckId: 'named-preview',
            items: [],
            spiritStones: 18,
            lastRunSummary: null,
        };

        expect(createPreparationSelectedLoadoutSummary(stash, PREPARATION_CARD_METADATA)).toMatchObject({
            kindSummaryLine: '3 种卡 · 法宝 3 · 符箓 2',
            compositionLine: '青云剑 ×3 · 流云符 ×2 · AR_003 ×13',
            deckPreviewLines: [
                '青云剑 ×3',
                '流云符 ×2',
                'AR_003 ×13',
            ],
        });
    });

    it('builds compact deck-card previews with composition and shortage details', () => {
        const deck = {
            id: 'shortage',
            name: '缺牌卡组',
            cards: [
                { id: 'AR_001', count: 4 },
                { id: 'AR_002', count: 3 },
                { id: 'AR_003', count: 13 },
            ],
        };

        expect(createPreparationDeckCardPreview(
            deck,
            [
                { id: 'AR_001', count: 3 },
                { id: 'AR_002', count: 2 },
            ],
            PREPARATION_CARD_METADATA,
        )).toEqual({
            deckCount: 20,
            uniqueCardCount: 3,
            readiness: 'insufficient-copies',
            readinessLabel: '缺少库存卡牌',
            kindSummaryLine: '3 种卡 · 法宝 4 · 符箓 3',
            compositionLine: '青云剑 ×4 · 流云符 ×3 · AR_003 ×13',
            issuePreviewLine: '缺牌：AR_003 -13 · 流云符 -1 · …另 1 项',
        });
    });

    it('uses metadata-backed card names in preparation validation copy with raw-id fallback', () => {
        const stash = {
            stashId: 'phase01.starter-stash',
            cards: [
                { id: 'AR_001', count: 3 },
                { id: 'AR_002', count: 2 },
            ],
            savedDecks: [{
                id: 'shortage',
                name: '缺牌卡组',
                cards: [
                    { id: 'AR_001', count: 4 },
                    { id: 'AR_002', count: 3 },
                    { id: 'AR_003', count: 13 },
                ],
            }],
            selectedDeckId: 'shortage',
            items: [],
            spiritStones: 18,
            lastRunSummary: null,
        };

        expect(formatPreparationValidationLines(
            validateExpeditionLoadout(stash),
            PREPARATION_CARD_METADATA,
        )).toEqual([
            '卡牌 青云剑 数量不足（需要 4 张，储物袋中仅有 3 张）',
            '卡牌 流云符 数量不足（需要 3 张，储物袋中仅有 2 张）',
            '卡牌 AR_003 数量不足（需要 13 张，储物袋中仅有 0 张）',
        ]);
    });

    it('summarizes an active run for the HUD and resume status copy', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(createRunSummary(run)).toEqual({
            currentNodeId: 'entrance.mountain-gate',
            currentNodeLabel: 'entrance.mountain-gate',
            carriedDeckCount: 20,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: '已继续探索：当前位置 entrance.mountain-gate，携带 20 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('uses a readable node label when the expedition scene provides one', () => {
        const state = ExpeditionState.bootstrap({
            worldState: structuredClone(initialWorldState),
            starterDeck: structuredClone(starterDeckJson),
        });
        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(createRunSummary(run, {
            mode: 'started',
            currentNodeLabel: '山门入口',
        })).toEqual({
            currentNodeId: 'entrance.mountain-gate',
            currentNodeLabel: '山门入口',
            carriedDeckCount: 20,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: '已进入秘境：当前位置 山门入口，携带 20 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('formats defeat, extract, and boss-clear summaries with kept and lost assets', () => {
        const baseSummary = {
            runId: 'run-summary-test',
            finalNodeId: 'boss.sealed-guardian',
            endedAt: '2026-05-08T12:00:00.000Z',
            kept: {
                cards: [{ id: 'AR_001', count: 1 }],
                items: [{ id: 'artifact_fly_sword_basic', itemType: 'artifact' as const, count: 1 }],
                spiritStones: 12,
            },
            lost: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [{ id: 'tool_talisman_basic', itemType: 'tool' as const, count: 1 }],
                spiritStones: 6,
            },
        };

        expect(createRunResolutionSummaryView({ ...baseSummary, outcome: 'defeat' })).toEqual({
            outcome: 'defeat',
            title: '探索失败',
            subtitle: '战败：本次携带与搜刮的资产全部遗失。',
            finalNodeId: 'boss.sealed-guardian',
            keptCards: ['无'],
            keptItems: ['无'],
            keptSpiritStones: '0',
            lostCards: ['TL_002 ×1'],
            lostItems: ['tool_talisman_basic ×1'],
            lostSpiritStones: '6',
        });
        expect(createRunResolutionSummaryView({ ...baseSummary, outcome: 'extract' }).subtitle).toBe(
            '撤离成功：当前携带与搜刮的资产已存入永久仓库。',
        );
        expect(createRunResolutionSummaryView({ ...baseSummary, outcome: 'boss-clear' }).subtitle).toBe(
            'Boss 通关：当前携带与搜刮的资产已存入永久仓库。',
        );
    });

    it('summarizes the entrance state after acknowledging a terminal run result', () => {
        const stash = {
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 2 }],
            savedDecks: [{ id: 'starter-deck', name: 'starter-deck', cards: [{ id: 'AR_001', count: 2 }] }],
            selectedDeckId: 'starter-deck',
            items: [{ id: 'tool_talisman_basic', itemType: 'tool' as const, count: 1 }],
            spiritStones: 24,
            lastRunSummary: null,
        };
        const summary = {
            runId: 'run-summary-test',
            outcome: 'extract' as const,
            finalNodeId: 'extract.cliff-rope',
            endedAt: '2026-05-08T12:00:00.000Z',
            kept: { cards: [{ id: 'AR_001', count: 2 }], items: [], spiritStones: 24 },
            lost: { cards: [], items: [], spiritStones: 0 },
        };

        expect(createPostRunEntranceStatus(stash, summary)).toBe(
            '储物袋已备好：2 张卡、1 件道具、24 枚灵石。\n上次结果：撤离成功（extract.cliff-rope）。可立即开始新的秘境探索。',
        );
    });

    it('summarizes a post-edit return when the selected deck changed during deck management', () => {
        const before = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [
                { id: 'main', name: '主力卡组', cards: [{ id: 'AR_001', count: 20 }] },
                { id: 'alt', name: '候补卡组', cards: [{ id: 'AR_001', count: 18 }] },
            ],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });
        const after = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [
                { id: 'main', name: '主力卡组', cards: [{ id: 'AR_001', count: 20 }] },
                { id: 'alt', name: '候补卡组·改', cards: [{ id: 'AR_001', count: 22 }] },
            ],
            selectedDeckId: 'alt',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });

        expect(createPreparationDeckHandoffSummary(before, after)).toEqual({
            title: '当前带入已切换',
            detail: '当前带入「候补卡组·改」：22 张，已满足带入要求。离开前为「主力卡组」：20 张，已满足带入要求。',
            tone: 'positive',
        });
    });

    it('summarizes a post-edit return when the selected deck did not change', () => {
        const before = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [{ id: 'main', name: '旧名字', cards: [{ id: 'AR_001', count: 18 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });
        const after = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [{ id: 'main', name: '新名字', cards: [{ id: 'AR_001', count: 20 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });

        expect(createPreparationDeckHandoffSummary(before, after)).toEqual({
            title: '卡组改动已同步',
            detail: '当前带入「新名字」：20 张，已满足带入要求。离开前为「旧名字」：18 张，张数不足。卡牌构成也已更新。',
            tone: 'positive',
        });
    });

    it('acknowledges composition-only edits when the selected deck id, name, count, and readiness stay the same', () => {
        const before = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [
                { id: 'AR_001', count: 20 },
                { id: 'AR_002', count: 20 },
            ],
            savedDecks: [{ id: 'main', name: '主力卡组', cards: [{ id: 'AR_001', count: 20 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });
        const after = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [
                { id: 'AR_001', count: 20 },
                { id: 'AR_002', count: 20 },
            ],
            savedDecks: [{ id: 'main', name: '主力卡组', cards: [{ id: 'AR_002', count: 20 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });

        expect(createPreparationDeckHandoffSummary(before, after)).toEqual({
            title: '卡组内容已调整',
            detail: '当前带入「主力卡组」：20 张，已满足带入要求。卡牌构成已更新。',
            tone: 'positive',
        });
    });

    it('reports when the player returns from deck management without changing the selected deck context', () => {
        const before = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [{ id: 'main', name: '主力卡组', cards: [{ id: 'AR_001', count: 20 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });
        const after = createPreparationDeckContext({
            stashId: 'phase01.starter-stash',
            cards: [{ id: 'AR_001', count: 24 }],
            savedDecks: [{ id: 'main', name: '主力卡组', cards: [{ id: 'AR_001', count: 20 }] }],
            selectedDeckId: 'main',
            items: [],
            spiritStones: 24,
            lastRunSummary: null,
        });

        expect(createPreparationDeckHandoffSummary(before, after)).toEqual({
            title: '卡组未改动',
            detail: '当前带入「主力卡组」：20 张，已满足带入要求。名称、构成、张数与带入状态均未变化。',
            tone: 'neutral',
        });
    });
});
