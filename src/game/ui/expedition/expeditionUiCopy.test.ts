import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('expedition UI Chinese copy', () => {
    it('uses Chinese player-facing labels in the expedition entry scene', () => {
        const scene = read('src/game/scenes/expedition/ExpeditionScene.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const sceneCopy = `${scene}\n${model}`;

        expect(sceneCopy).toContain('步骤 1 / 2');
        expect(sceneCopy).toContain('步骤 2 / 2');
        expect(sceneCopy).toContain('两步出发校验 · 先确认路线，再选定带入');
        expect(sceneCopy).toContain('两步出发校验 · 整理卡组后返回确认');
        expect(sceneCopy).toContain('路线简报');
        expect(sceneCopy).toContain('确认路线与带入');
        expect(sceneCopy).toContain('卡组管理');
        expect(sceneCopy).toContain('可出发');
        expect(sceneCopy).toContain('可返回确认');
        expect(sceneCopy).not.toContain('Phase 01 · Expedition Entry Flow');
    });

    it('uses Chinese loadout labels in the preparation panel', () => {
        const panel = read('src/game/ui/expedition/PreparationPanel.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const loadoutCopy = `${panel}\n${model}`;

        expect(panel).toContain('选择要带入秘境的卡组；卡组需满足20-40张且所有卡牌均在储物袋中。');
        expect(panel).toContain('管理卡组');
        expect(loadoutCopy).toContain('卡组符合要求，可以带入秘境。');
        expect(loadoutCopy).toContain('卡组数量不足');
        expect(loadoutCopy).toContain('卡组数量超限');
        expect(panel).toContain('库存不足');
        expect(panel).toContain('当前带入卡组');
        expect(panel).toContain('构成速览');
        expect(panel).toContain('出发校验');
        expect(panel).toContain('出发准备栏');
        expect(panel).toContain('确认带入并出发');
        expect(panel).toContain('暂不可确认带入');
        expect(panel).toContain('继续管理卡组');
        expect(panel).toContain('去管理卡组补足');
        expect(panel).toContain('下一步：确认带入后立即创建秘境快照并进入秘境。');
        expect(panel).toContain('缺口重点');
        expect(panel).toContain('本次携带一览');
        expect(loadoutCopy).toContain('当前阶段：确认路线并选定本次带入');
        expect(loadoutCopy).toContain('入口');
        expect(loadoutCopy).toContain('路线');
        expect(loadoutCopy).toContain('终点');
        expect(panel).toContain('卡组构成');
        expect(panel).toContain('携带道具');
        expect(panel).toContain('灵石');
        expect(panel).not.toContain('第一阶段暂不开放卡组构筑');
        expect(panel).not.toContain('Starter Deck');
        expect(panel).not.toContain('Starter Items');
        expect(panel).not.toContain('spiritStones：');
    });

    it('uses Chinese exit-summary labels in the deck management panel', () => {
        const panel = read('src/game/ui/deckbuilder/DeckManagementPanel.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const deckManagerCopy = `${panel}\n${model}`;

        expect(panel).toContain('返回前摘要');
        expect(panel).toContain('返回远征准备');
        expect(panel).toContain('摘要区可直接返回远征准备');
        expect(panel).toContain('当前卡组：');
        expect(panel).toContain('卡组 ×');
        expect(panel).toContain('一键加满');
        expect(panel).toContain('全部移除');
        expect(deckManagerCopy).toContain('当前阶段：整理卡组并返回远征准备');
        expect(panel).toContain('张出征线还差');
        expect(panel).toContain('张上限还剩');
        expect(panel).toContain('已耗尽');
        expect(panel).toContain('卡组已满');
        expect(panel).toContain('袋中');
        expect(panel).not.toContain('Return to Expedition Prep');
        expect(panel).not.toContain('Exit summary');
    });

    it('uses Chinese spotlight labels in the deck management panel', () => {
        const panel = read('src/game/ui/deckbuilder/DeckManagementPanel.ts');

        expect(panel).toContain('焦点牌面');
        expect(panel).toContain('效果要点');
        expect(panel).toContain('剩余');
        expect(panel).toContain('缺口');
        expect(panel).toContain('当前带入卡组');
        expect(panel).toContain('待补');
        expect(panel).toContain('失效');
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
