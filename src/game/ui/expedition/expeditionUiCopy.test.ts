import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const expectNoDebugIdentifiers = (text: string) => {
    expect(text).not.toContain('public/data');
    expect(text).not.toContain('dialogueId');
    expect(text).not.toContain('nodeId');
    expect(text).not.toContain('.json');
};

describe('expedition UI Chinese copy', () => {
    it('uses Chinese player-facing labels in the expedition entry scene', () => {
        const scene = read('src/game/scenes/expedition/ExpeditionScene.ts');

        expect(scene).toContain('第一阶段 · 秘境入口流程');
        expect(scene).not.toContain('Phase 01 · Expedition Entry Flow');
    });

    it('uses Chinese loadout labels in the preparation panel', () => {
        const panel = read('src/game/ui/expedition/PreparationPanel.ts');

        expect(panel).toContain('第一阶段暂不开放卡组构筑；确认当前储物袋后即可进入。');
        expect(panel).toContain('初始卡组');
        expect(panel).toContain('初始道具');
        expect(panel).toContain('灵石：');
        expect(panel).not.toContain('Starter Deck');
        expect(panel).not.toContain('Starter Items');
        expect(panel).not.toContain('spiritStones：');
    });

    it('uses Chinese run HUD labels', () => {
        const hud = read('src/game/ui/expedition/RunHud.ts');

        expect(hud).toContain('当前节点：');
        expect(hud).toContain('携带卡牌：0');
        expect(hud).toContain('携带道具：0');
        expect(hud).toContain('灵石：0');
        expect(hud).not.toContain("'carriedDeck: 0'");
        expect(hud).not.toContain("'carriedItems: 0'");
        expect(hud).not.toContain("'spiritStones: 0'");
        expect(hud).not.toContain('`carriedDeck: ${carriedDeckCount}`');
        expect(hud).not.toContain('`carriedItems: ${carriedItemCount}`');
        expect(hud).not.toContain('`spiritStones: ${spiritStones}`');
        expectNoDebugIdentifiers(hud);
    });
});
