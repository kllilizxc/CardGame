import { beforeEach, describe, expect, it } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';

import { resetRunPersistenceForTests } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import {
    createItemStack,
    normalizeExpeditionWorldStateSeed,
} from '../../testing/fixtures/expeditionWorldStateFixtures';
import {
    createPostRunEntranceStatus,
    createPreparationSummary,
    createRunResolutionSummaryView,
    createRunSummary,
} from './entryFlowModel';

const createWorldStateSeed = () => normalizeExpeditionWorldStateSeed(structuredClone(initialWorldState));

describe('entryFlowModel', () => {
    beforeEach(() => {
        resetRunPersistenceForTests();
    });

    it('summarizes the starter stash for the preparation panel', () => {
        const state = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
            starterDeck: structuredClone(starterDeckJson),
        });

        expect(createPreparationSummary(state.persistentStash)).toEqual({
            deckCount: 14,
            itemCount: 3,
            spiritStones: 36,
            statusText: '储物袋已备好：14 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('summarizes an active run for the HUD and resume status copy', () => {
        const state = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
            starterDeck: structuredClone(starterDeckJson),
        });
        const run = state.createRunSnapshot({
            expeditionId: 'phase01-first-playable-expedition',
            mapId: 'phase01-prototype-map',
            entryNodeId: 'entrance.mountain-gate',
        });

        expect(createRunSummary(run)).toEqual({
            currentNodeId: 'entrance.mountain-gate',
            currentNodeLabel: '当前节点',
            carriedDeckCount: 14,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: '已继续探索：当前位置 当前节点，携带 14 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('uses a readable node label when the expedition scene provides one', () => {
        const state = ExpeditionState.bootstrap({
            worldState: createWorldStateSeed(),
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
            carriedDeckCount: 14,
            carriedItemCount: 3,
            spiritStones: 36,
            statusText: '已进入秘境：当前位置 山门入口，携带 14 张卡、3 件道具、36 枚灵石。',
        });
    });

    it('formats defeat, extract, and boss-clear summaries with kept and lost assets', () => {
        const baseSummary = {
            runId: 'run-summary-test',
            finalNodeId: 'boss.sealed-guardian',
            endedAt: '2026-05-08T12:00:00.000Z',
            kept: {
                cards: [{ id: 'AR_001', count: 1 }],
                items: [createItemStack('artifact_fly_sword_basic', 'artifact', 1)],
                spiritStones: 12,
            },
            lost: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [createItemStack('tool_talisman_basic', 'tool', 1)],
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

    it('sanitizes settlement final node text for non-combat terminal summaries', () => {
        const baseSummary = {
            runId: 'run-summary-test',
            finalNodeId: 'public/data/mijing/prototype-map.json#extract.cliff-rope',
            endedAt: '2026-05-08T12:00:00.000Z',
            kept: {
                cards: [{ id: 'AR_001', count: 1 }],
                items: [createItemStack('artifact_fly_sword_basic', 'artifact', 1)],
                spiritStones: 12,
            },
            lost: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [createItemStack('tool_talisman_basic', 'tool', 1)],
                spiritStones: 6,
            },
        };
        const view = createRunResolutionSummaryView({ ...baseSummary, outcome: 'extract' });

        expect(view.finalNodeId).toBe('extract.cliff-rope');
        expect(view.finalNodeId).not.toContain('public/data');
        expect(view.finalNodeId).not.toContain('nodeId');
        expect(view.finalNodeId).not.toContain('dialogueId');
        expect(view.finalNodeId).not.toContain('.json');
    });

    it('sanitizes settlement final node text for combat terminal summaries', () => {
        const baseSummary = {
            runId: 'run-summary-test',
            finalNodeId: 'public/data/mijing/prototype-events.json:encounter/boss.sealed-guardian',
            endedAt: '2026-05-08T12:00:00.000Z',
            kept: {
                cards: [{ id: 'AR_001', count: 1 }],
                items: [createItemStack('artifact_fly_sword_basic', 'artifact', 1)],
                spiritStones: 12,
            },
            lost: {
                cards: [{ id: 'TL_002', count: 1 }],
                items: [createItemStack('tool_talisman_basic', 'tool', 1)],
                spiritStones: 6,
            },
        };
        const defeat = createRunResolutionSummaryView({ ...baseSummary, outcome: 'defeat' });
        const bossClear = createRunResolutionSummaryView({ ...baseSummary, outcome: 'boss-clear' });

        expect(defeat.finalNodeId).toBe('boss.sealed-guardian');
        expect(defeat.finalNodeId).not.toContain('public/data');
        expect(defeat.finalNodeId).not.toContain('nodeId');
        expect(defeat.finalNodeId).not.toContain('dialogueId');
        expect(defeat.finalNodeId).not.toContain('.json');
        expect(bossClear.finalNodeId).toBe('boss.sealed-guardian');
        expect(bossClear.finalNodeId).not.toContain('public/data');
        expect(bossClear.finalNodeId).not.toContain('nodeId');
        expect(bossClear.finalNodeId).not.toContain('dialogueId');
        expect(bossClear.finalNodeId).not.toContain('.json');
    });

    it('summarizes the entrance state after acknowledging a terminal run result', () => {
        const stash = {
            stashId: 'phase01.starter-stash',
            deckRef: 'starter-deck',
            deck: [{ id: 'AR_001', count: 2 }],
            items: [createItemStack('tool_talisman_basic', 'tool', 1)],
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
            '储物袋已备好：2 张卡、1 件道具、24 枚灵石。\n上次结果：撤离成功。可立即开始新的秘境探索。',
        );
    });
});
