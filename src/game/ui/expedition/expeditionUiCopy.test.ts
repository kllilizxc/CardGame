import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('expedition UI Chinese copy', () => {
    it('uses Chinese player-facing labels in the expedition entry scene', () => {
        const scene = read('src/game/scenes/expedition/ExpeditionScene.ts');

        expect(scene).toContain('第一阶段 · 秘境入口流程');
        expect(scene).not.toContain('Phase 01 · Expedition Entry Flow');
    });

    it('uses Chinese loadout labels in the preparation panel', () => {
        const panel = read('src/game/ui/expedition/PreparationPanel.ts');

        expect(panel).toContain('选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。');
        expect(panel).toContain('管理卡组');
        expect(panel).toContain('卡组符合要求，可以带入秘境。');
        expect(panel).toContain('卡组数量不足');
        expect(panel).toContain('卡组数量超限');
        expect(panel).toContain('库存不足');
        expect(panel).toContain('当前带入卡组');
        expect(panel).toContain('本次携带一览');
        expect(panel).toContain('卡组预览');
        expect(panel).toContain('携带道具');
        expect(panel).toContain('灵石');
        expect(panel).not.toContain('第一阶段暂不开放卡组构筑');
        expect(panel).not.toContain('Starter Deck');
        expect(panel).not.toContain('Starter Items');
        expect(panel).not.toContain('spiritStones：');
    });

    it('uses Chinese exit-summary labels in the deck management panel', () => {
        const panel = read('src/game/ui/deckbuilder/DeckManagementPanel.ts');

        expect(panel).toContain('返回前摘要');
        expect(panel).toContain('返回远征准备');
        expect(panel).toContain('摘要区可直接返回远征准备');
        expect(panel).toContain('当前卡组：');
        expect(panel).toContain('卡组 ×');
        expect(panel).toContain('一键加满');
        expect(panel).toContain('全部移除');
        expect(panel).toContain('张出征线还差');
        expect(panel).toContain('张上限还剩');
        expect(panel).toContain('已耗尽');
        expect(panel).toContain('卡组已满');
        expect(panel).toContain('袋中');
        expect(panel).not.toContain('Return to Expedition Prep');
        expect(panel).not.toContain('Exit summary');
    });

    it('uses Chinese run HUD labels', () => {
        const hud = read('src/game/ui/expedition/RunHud.ts');

        expect(hud).toContain('携带卡牌：0');
        expect(hud).toContain('携带道具：0');
        expect(hud).toContain('灵石：0');
        expect(hud).not.toContain("'carriedDeck: 0'");
        expect(hud).not.toContain("'carriedItems: 0'");
        expect(hud).not.toContain("'spiritStones: 0'");
        expect(hud).not.toContain('`carriedDeck: ${carriedDeckCount}`');
        expect(hud).not.toContain('`carriedItems: ${carriedItemCount}`');
        expect(hud).not.toContain('`spiritStones: ${spiritStones}`');
    });
});
