import { beforeAll, describe, expect, it, mock } from 'bun:test';

import type { CardMetadataMap } from '../../state/CardCollectionViewModel';

let DeckManagementPanel: typeof import('./DeckManagementPanel').DeckManagementPanel;

beforeAll(async () => {
    mock.module('phaser', () => ({
        Events: {
            EventEmitter: class {},
        },
        GameObjects: {
            Container: class {},
            Rectangle: class {},
            Text: class {},
        },
        Scene: class {},
    }));

    try {
        ({ DeckManagementPanel } = await import(`./DeckManagementPanel${'?deck-preview-test'}`));
    } finally {
        mock.restore();
    }
});

function createPanelHarness() {
    const emitted: unknown[][] = [];
    const metadata: CardMetadataMap = {
        'unit.alpha': {
            kind: 'unit',
            name: '甲灵',
            effectSummary: '攻击时获得护体。',
            rarity: 'common',
        },
        'unit.beta': {
            kind: 'unit',
            name: '乙灵',
            effectSummary: '入场时抽 1 张牌。',
            rarity: 'rare',
        },
        'skill.gamma': {
            kind: 'skill',
            name: '丙诀',
            description: '当前卡种暂未支持真实牌面。',
            rarity: 'epic',
        },
    };

    const panel = Object.create(DeckManagementPanel.prototype) as Record<string, unknown>;
    panel.scene = {
        events: {
            emit: (...args: unknown[]) => {
                emitted.push(args);
                return true;
            },
        },
        tweens: {
            killTweensOf() {},
        },
    };
    panel.stash = {
        cards: [
            { id: 'unit.alpha', count: 2 },
            { id: 'unit.beta', count: 1 },
            { id: 'skill.gamma', count: 1 },
        ],
        items: [],
        spiritStones: 0,
        savedDecks: [
            {
                id: 'deck-main',
                name: '主卡组',
                cards: [
                    { id: 'unit.alpha', count: 1 },
                    { id: 'skill.gamma', count: 1 },
                ],
            },
        ],
        selectedDeckId: 'deck-main',
    };
    panel.config = {
        metadata,
        previewResolver: (cardId: string) => {
            if (cardId === 'unit.alpha') {
                return { id: 'unit.alpha', kind: 'unit', name: '甲灵' };
            }
            if (cardId === 'unit.beta') {
                return { id: 'unit.beta', kind: 'unit', name: '乙灵' };
            }

            return null;
        },
        onClose() {},
        onStashChange() {},
    };
    panel.selectedDeckId = 'deck-main';
    panel.detailCardId = 'unit.alpha';
    panel.previewSourceLabel = '卡组管理';
    panel.browserGridColumns = 1;
    panel.browserVisibleRows = 6;
    panel.browserScrollOffset = 0;
    panel.editorSpotlightRows = new Map();
    panel.browserSpotlightRows = new Map();
    panel.detailPaneExpanded = false;

    return {
        panel,
        emitted,
    };
}

describe('DeckManagementPanel shared preview bridge', () => {
    it('switches browser focus to a resolved full-card preview request', () => {
        const { panel, emitted } = createPanelHarness();
        const browserRows = [
            { id: 'unit.alpha' },
            { id: 'unit.beta' },
        ];

        (panel as any).focusBrowserIndex(1, browserRows, false);

        const lastEmit = emitted.at(-1);
        expect((panel as any).detailCardId).toBe('unit.beta');
        expect(lastEmit?.[0]).toBe('showCardPreviewFromData');
        expect(lastEmit?.[1]).toEqual({
            id: 'unit.beta',
            kind: 'unit',
            name: '乙灵',
        });
        expect(lastEmit?.[2]).toEqual(expect.objectContaining({
            contextId: 'deck-management',
            sourceLabel: '储物袋浏览',
        }));
    });

    it('falls back to metadata copy when the focused card has no supported shared card data', () => {
        const { panel, emitted } = createPanelHarness();
        (panel as any).detailCardId = 'skill.gamma';
        (panel as any).previewSourceLabel = '当前卡组编辑';

        (panel as any).refreshDetailPane();

        const lastEmit = emitted.at(-1);
        expect(lastEmit?.[0]).toBe('showCardPreviewFallback');
        expect(lastEmit?.[1]).toEqual(expect.objectContaining({
            contextId: 'deck-management',
            sourceLabel: '当前卡组编辑',
            fallback: expect.objectContaining({
                tagLabel: '暂未支持牌面',
            }),
        }));
        expect(String((lastEmit?.[1] as { fallback?: { lines?: string[] } }).fallback?.lines?.[1] ?? '')).toContain('暂未接入共享牌面渲染');
    });
});
