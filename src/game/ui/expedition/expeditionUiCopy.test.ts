import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('expedition UI Chinese copy', () => {
    it('uses Chinese player-facing labels in the expedition entry scene', () => {
        const scene = read('src/game/scenes/expedition/ExpeditionScene.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const sceneCopy = `${scene}\n${model}`;

        expect(sceneCopy).toContain('远征准备');
        expect(sceneCopy).toContain('大地图 /');
        expect(sceneCopy).toContain('返回大地图');
        expect(sceneCopy).toContain('完成调整后按返回回到远征准备');
        expect(sceneCopy).toContain('当前带入可直接确认出发');
        expect(sceneCopy).toContain('入口：');
        expect(sceneCopy).toContain('收官');
        expect(sceneCopy).toContain('卡组管理');
        expect(sceneCopy).toContain('进入秘境');
        expect(sceneCopy).toContain('点按任意处或按 Enter / Space 继续。首层提示会保留。');
        expect(sceneCopy).not.toContain('路线简报');
        expect(sceneCopy).not.toContain('分层速览');
        expect(sceneCopy).not.toContain('开局');
        expect(sceneCopy).not.toContain('当前操作：选定带入');
        expect(sceneCopy).not.toContain('当前操作：整理卡组');
        expect(sceneCopy).not.toContain('继续进入秘境');
        expect(sceneCopy).not.toContain('完成后按返回回到远征准备');
        expect(sceneCopy).not.toContain('确认路线与带入');
        expect(sceneCopy).not.toContain('步骤 1 / 2');
        expect(sceneCopy).not.toContain('步骤 2 / 2');
        expect(sceneCopy).not.toContain('可返回确认');
        expect(sceneCopy).not.toContain('点按任意处或按 Enter / Space 继续；首层视图会保留路线与带入提示。');
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
        expect(panel).toContain('卡组序列');
        expect(loadoutCopy).toContain('卡组总览');
        expect(panel).toContain('浏览进度');
        expect(panel).toContain('点按卡片或按 ← / → 切换当前带入');
        expect(panel).toContain('构成速览');
        expect(panel).toContain('出发校验');
        expect(panel).toContain('出发准备栏');
        expect(panel).toContain('快捷操作：Enter 触发主操作 · M 管理卡组');
        expect(panel).toContain('确认带入并出发');
        expect(panel).toContain('暂不可确认带入');
        expect(panel).toContain('继续管理卡组');
        expect(panel).toContain('去管理卡组补足');
        expect(panel).toContain('下一步：确认带入后立即创建秘境快照并进入秘境。');
        expect(panel).toContain('放行清单');
        expect(panel).toContain('放行结论');
        expect(panel).toContain('阻塞项');
        expect(panel).toContain('执行提示');
        expect(panel).toContain('本次操作');
        expect(panel).toContain('本次携带一览');
        expect(panel).toContain('带入舱单');
        expect(panel).toContain('物资封单');
        expect(panel).toContain('修整建议');
        expect(loadoutCopy).toContain('入口：');
        expect(loadoutCopy).toContain('首层');
        expect(loadoutCopy).not.toContain('起步，先看');
        expect(loadoutCopy).not.toContain('当前阶段：确认路线并选定本次带入');
        expect(loadoutCopy).not.toContain('路线速览');
        expect(panel).not.toContain('routeBriefing');
        expect(panel).not.toContain('createRouteBriefingStrip');
        expect(panel).not.toContain('measureRouteBriefingStripHeight');
        expect(panel).not.toContain('路线简报');
        expect(panel).not.toContain('分层速览');
        expect(panel).not.toContain('开局');
        expect(panel).not.toContain('收官');
        expect(loadoutCopy).not.toContain('路线简报');
        expect(loadoutCopy).not.toContain('分层速览');
        expect(loadoutCopy).not.toContain('开局');
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
        expect(panel).toContain('键盘焦点：');
        expect(panel).toContain('Tab 切换区域 · Esc 返回');
        expect(panel).toContain('↑↓ 切换卡组');
        expect(panel).toContain('Enter 加入 1');
        expect(panel).toContain('Enter 直接返回远征准备');
        expect(panel).toContain('当前卡组：');
        expect(panel).toContain('先切换卡组，再从右侧加入或在中间移除');
        expect(panel).toContain('从储物袋加入');
        expect(panel).toContain('当前卡牌（在这里移除）');
        expect(panel).toContain('下一步：');
        expect(panel).toContain('卡组 ×');
        expect(panel).toContain('一键加满');
        expect(panel).toContain('全部移除');
        expect(panel).toContain('支持输入法');
        expect(deckManagerCopy).toContain('入口：');
        expect(deckManagerCopy).not.toContain('整理时留意');
        expect(deckManagerCopy).not.toContain('当前阶段：整理卡组并返回远征准备');
        expect(panel).not.toContain('路线：');
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
        expect(panel).toContain('默认收起详情');
        expect(panel).toContain('查看当前焦点');
        expect(panel).toContain('效果要点');
        expect(panel).toContain('剩余');
        expect(panel).toContain('缺口');
        expect(panel).toContain('当前带入卡组');
        expect(panel).toContain('待补');
        expect(panel).toContain('失效');
    });

    it('uses Chinese browser-control labels in the deck management panel', () => {
        const panel = read('src/game/ui/deckbuilder/DeckManagementPanel.ts');

        expect(panel).toContain('浏览控制');
        expect(panel).toContain('清空');
        expect(panel).toContain('零：隐');
        expect(panel).toContain('零：显');
        expect(panel).toContain('恢复默认');
        expect(panel).toContain('默认浏览');
        expect(panel).toContain('命中条目都为零张');
        expect(panel).toContain('当前浏览条件没有命中卡牌');
    });

    it('uses Chinese run HUD labels', () => {
        const hud = read('src/game/ui/expedition/RunHud.ts');
        const model = read('src/game/scenes/expedition/entryFlowModel.ts');
        const hudCopy = `${hud}\n${model}`;

        expect(hud).toContain('携带卡牌：0');
        expect(hud).toContain('携带道具：0');
        expect(hud).toContain('灵石：0');
        expect(hudCopy).toContain('抵达提示');
        expect(hudCopy).toContain('首层分路已高亮；点按节点后收起。');
        expect(hudCopy).not.toContain('首个分路已高亮；点按节点后收起此提示。');
        expect(hud).not.toContain("'carriedDeck: 0'");
        expect(hud).not.toContain("'carriedItems: 0'");
        expect(hud).not.toContain("'spiritStones: 0'");
        expect(hud).not.toContain('`carriedDeck: ${carriedDeckCount}`');
        expect(hud).not.toContain('`carriedItems: ${carriedItemCount}`');
        expect(hud).not.toContain('`spiritStones: ${spiritStones}`');
    });
});
