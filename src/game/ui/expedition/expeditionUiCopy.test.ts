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
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const sceneCopy = `${scene}\n${model}`;

        expect(sceneCopy).toContain('大地图 /');
        expect(sceneCopy).toContain('返回大地图');
        expect(sceneCopy).toContain('首层：');
        expect(sceneCopy).toContain('进入秘境');
        expect(sceneCopy).toContain('点按任意处或按 Enter / Space 继续。');
        expect(sceneCopy).toContain('出发');
        expect(sceneCopy).toContain('带入已锁定');
        expect(sceneCopy).not.toContain('路线简报');
        expect(sceneCopy).not.toContain('分层速览');
        expect(sceneCopy).not.toContain('层路线');
        expect(sceneCopy).not.toContain('开局');
        expect(sceneCopy).not.toContain('远征准备');
        expect(sceneCopy).not.toContain('卡组管理');
        expect(sceneCopy).not.toContain('可返回准备');
        expect(sceneCopy).not.toContain('可出发');
        expect(sceneCopy).not.toContain('当前操作：选定带入');
        expect(sceneCopy).not.toContain('当前操作：整理卡组');
        expect(sceneCopy).not.toContain('当前带入可直接确认出发');
        expect(sceneCopy).not.toContain('完成调整后按返回回到远征准备');
        expect(sceneCopy).not.toContain('补齐带入条件后按返回回到远征准备');
        expect(sceneCopy).not.toContain('继续进入秘境');
        expect(sceneCopy).not.toContain('完成后按返回回到远征准备');
        expect(sceneCopy).not.toContain('确认路线与带入');
        expect(sceneCopy).not.toContain('已备好，从');
        expect(sceneCopy).not.toContain('先看：');
        expect(sceneCopy).not.toContain('步骤 1 / 2');
        expect(sceneCopy).not.toContain('步骤 2 / 2');
        expect(sceneCopy).not.toContain('可返回确认');
        expect(sceneCopy).not.toContain('调整后返回准备');
        expect(sceneCopy).not.toContain('补齐后返回准备');
        expect(sceneCopy).not.toContain('可直接出发');
        expect(sceneCopy).not.toContain('点按任意处或按 Enter / Space 继续。首层提示会保留。');
        expect(sceneCopy).not.toContain('点按任意处或按 Enter / Space 继续；首层视图会保留路线与带入提示。');
        expect(sceneCopy).not.toContain('出发确认');
        expect(sceneCopy).not.toContain('出发提示');
        expect(sceneCopy).not.toContain('抵达提示');
        expect(sceneCopy).not.toContain('入口：');
        expect(sceneCopy).not.toContain('收官');
        expect(sceneCopy).not.toContain('Phase 01 · Expedition Entry Flow');
    });

    it('uses Chinese loadout labels in the preparation panel', () => {
        const panel = read('src/game/ui/expedition/PreparationPanel.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const loadoutCopy = `${panel}\n${model}`;

        // One decision per screen: the deck, whether it can go, and three actions.
        expect(panel).toContain('出发前确认');
        expect(panel).toContain('管理卡组');
        expect(panel).toContain('出 发');
        expect(panel).toContain('暂不可出发');
        expect(panel).toContain('Enter 出发 · M 管理卡组');
        expect(loadoutCopy).toContain('卡组符合要求，可以带入秘境。');
        expect(loadoutCopy).toContain('卡组数量不足');
        expect(loadoutCopy).toContain('卡组数量超限');
        expect(panel).toContain('物资：');
        expect(loadoutCopy).toContain('件道具');
        expect(panel).toContain('灵石');
        expect(panel).not.toContain('routeBriefing');
        expect(panel).not.toContain('路线简报');
        expect(panel).not.toContain('开局');
        expect(panel).not.toContain('Starter Deck');
        expect(panel).not.toContain('Starter Items');
        expect(panel).not.toContain('spiritStones：');
        expectNoDebugIdentifiers(panel);
    });

    it('uses Chinese labels in the deck workshop', () => {
        const panel = read('src/game/ui/deckbuilder/DeckManagementPanel.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const deckManagerCopy = `${panel}\n${model}`;

        expect(panel).toContain('返回');
        expect(panel).toContain('新建卡组');
        expect(panel).toContain('重命名');
        expect(panel).toContain('储 物 袋');
        expect(panel).toContain('搜索名称或编号');
        expect(panel).toContain('仅有库存');
        expect(panel).toContain('含无库存');
        expect(panel).toContain('左键加入 · 右键移出');
        expect(panel).toContain('还差');
        expect(panel).toContain('卡组合格，可以出发');
        expect(panel).toContain('卡组已满');
        expect(panel).toContain('同名卡最多带');
        expect(panel).toContain('储物袋里没有更多了');
        expect(panel).toContain('至少保留一套卡组');
        expect(panel).toContain('库存不足');
        expect(deckManagerCopy).toContain('大地图 /');
        expect(deckManagerCopy).not.toContain('整理时留意');
        expect(deckManagerCopy).not.toContain('当前阶段：整理卡组并返回远征准备');
        expect(panel).not.toContain('路线：');
        expect(panel).not.toContain('Return to Expedition Prep');
        expect(panel).not.toContain('Exit summary');
        expect(panel).not.toContain('Extra Deck');
    });

    it('uses Chinese run HUD labels', () => {
        const hud = read('src/game/ui/expedition/RunHud.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const hudCopy = `${hud}\n${model}`;

        // The HUD is icon chips; the Chinese labels live in their tooltips.
        expect(hud).toContain('携带卡牌：');
        expect(hud).toContain('灵石：');
        expect(hudCopy).toContain('抵达');
        expect(hudCopy).toContain('首层已高亮');
        expect(hudCopy).toContain('带入已锁定');
        expect(hudCopy).not.toContain('抵达提示');
        expect(hud).not.toContain("'carriedDeck: 0'");
        expect(hud).not.toContain("'spiritStones: 0'");
        expectNoDebugIdentifiers(hud);
    });
});
