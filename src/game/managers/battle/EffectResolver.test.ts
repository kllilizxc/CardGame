import { describe, expect, it, beforeEach, mock, spyOn } from 'bun:test';
import { EffectResolver, type EffectExecutionContext } from './EffectResolver';
import type { BattleContext } from '../../context/BattleContext';
import type { LegacyCardEffect, LegacyEffectAction } from '@data/types/cards/effects';

// ==================== 测试辅助 ====================

function createMockCardSprite(id: string, name: string, attack = 5, health = 10) {
    const data = { id, name, attack, health };
    return {
        getCardData: () => data,
        updateStats: mock(() => {}),
        updateStatusDisplay: mock(() => {}),
    } as any;
}

function createMockBattleContext(): BattleContext {
    const addLog = mock(() => {});
    const emit = mock(() => {});

    return {
        scene: { events: { emit } },
        battleLog: { addLog },
        animationManager: {
            playHitAnimation: mock(() => {}),
            playHealAnimation: mock(() => {}),
        },
        effectManager: {
            showBuffEffect: mock(() => {}),
            showDebuffEffect: mock(() => {}),
            showHealEffect: mock(() => {}),
        },
        statusManager: {
            processDamage: mock((_id: string, dmg: number) => dmg),
            clearDebuffs: mock(() => {}),
            removeStatus: mock(() => {}),
            getUnitStatuses: mock(() => []),
        },
        battleStatusController: {
            applyStatusToUnit: mock(() => {}),
        },
        battleTickManager: {
            tick: mock(() => {}),
        },
    } as any;
}

function makeContext(overrides?: Partial<EffectExecutionContext>): EffectExecutionContext {
    return {
        playerField: [],
        enemyField: [],
        sourceName: '测试卡牌',
        ...overrides,
    };
}

// ==================== 目标解析测试 ====================

describe('EffectResolver — 目标解析', () => {
    let resolver: EffectResolver;
    let bc: BattleContext;

    beforeEach(() => {
        bc = createMockBattleContext();
        resolver = new EffectResolver(bc);
    });

    it('self 返回触发单位', () => {
        const unit = createMockCardSprite('u1', '测试');
        const ctx = makeContext({ triggerUnit: unit });
        expect(resolver.resolveTargets('self', ctx)).toEqual([unit]);
    });

    it('self 无触发单位返回空', () => {
        expect(resolver.resolveTargets('self', makeContext())).toEqual([]);
    });

    it('ownerPlayer 返回空', () => {
        expect(resolver.resolveTargets('ownerPlayer', makeContext())).toEqual([]);
    });

    it('allyUnits / allAllies 返回玩家场', () => {
        const a = createMockCardSprite('a', '友方A');
        const b = createMockCardSprite('b', '友方B');
        const ctx = makeContext({ playerField: [a, b] });
        expect(resolver.resolveTargets('allyUnits', ctx)).toEqual([a, b]);
        expect(resolver.resolveTargets('allAllies', ctx)).toEqual([a, b]);
    });

    it('enemyUnits / allEnemies 返回敌方场', () => {
        const e = createMockCardSprite('e', '敌方');
        const ctx = makeContext({ enemyField: [e] });
        expect(resolver.resolveTargets('enemyUnits', ctx)).toEqual([e]);
        expect(resolver.resolveTargets('allEnemies', ctx)).toEqual([e]);
    });

    it('singleAlly 优先返回友方触发单位', () => {
        const a = createMockCardSprite('a', '友方');
        const ctx = makeContext({ playerField: [a], triggerUnit: a });
        expect(resolver.resolveTargets('singleAlly', ctx)).toEqual([a]);
    });

    it('singleAlly 无触发单位时返回第一个友方', () => {
        const a = createMockCardSprite('a', '友方');
        const ctx = makeContext({ playerField: [a] });
        expect(resolver.resolveTargets('singleAlly', ctx)).toEqual([a]);
    });

    it('singleEnemy 返回第一个敌方', () => {
        const e = createMockCardSprite('e', '敌方');
        const ctx = makeContext({ enemyField: [e] });
        expect(resolver.resolveTargets('singleEnemy', ctx)).toEqual([e]);
    });

    it('singleEnemy 无敌人返回空', () => {
        expect(resolver.resolveTargets('singleEnemy', makeContext())).toEqual([]);
    });

    it('attackTarget 返回攻击目标', () => {
        const t = createMockCardSprite('t', '目标');
        const ctx = makeContext({ attackTarget: t });
        expect(resolver.resolveTargets('attackTarget', ctx)).toEqual([t]);
    });

    it('damageSource 返回伤害来源', () => {
        const s = createMockCardSprite('s', '来源');
        const ctx = makeContext({ damageSource: s });
        expect(resolver.resolveTargets('damageSource', ctx)).toEqual([s]);
    });

    it('allUnits 返回双方所有单位', () => {
        const a = createMockCardSprite('a', '友方');
        const e = createMockCardSprite('e', '敌方');
        const ctx = makeContext({ playerField: [a], enemyField: [e] });
        expect(resolver.resolveTargets('allUnits', ctx)).toEqual([a, e]);
    });

    it('none 返回空', () => {
        expect(resolver.resolveTargets('none', makeContext())).toEqual([]);
    });
});

// ==================== 动作执行测试 ====================

describe('EffectResolver — 动作执行', () => {
    let resolver: EffectResolver;
    let bc: BattleContext;
    let unit: ReturnType<typeof createMockCardSprite>;

    beforeEach(() => {
        bc = createMockBattleContext();
        resolver = new EffectResolver(bc);
        unit = createMockCardSprite('u1', '测试单位', 5, 10);
    });

    it('modifyAttack +3 增加攻击力', () => {
        const action: LegacyEffectAction = { type: 'modifyAttack', value: 3 };
        resolver.executeAction(action, [unit], makeContext({ sourceName: '锋锐法器' }));

        expect(unit.getCardData().attack).toBe(8);
        expect(unit.updateStats).toHaveBeenCalled();
        expect((bc.effectManager as any).showBuffEffect).toHaveBeenCalled();
    });

    it('modifyAttack -2 降低攻击力', () => {
        const action: LegacyEffectAction = { type: 'modifyAttack', value: -2 };
        resolver.executeAction(action, [unit], makeContext({ sourceName: '虚弱' }));

        expect(unit.getCardData().attack).toBe(3);
        expect((bc.effectManager as any).showDebuffEffect).toHaveBeenCalled();
    });

    it('modifyHealth 恢复生命', () => {
        unit.getCardData().health = 5;
        const action: LegacyEffectAction = { type: 'modifyHealth', value: 3 };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(8);
        expect((bc.animationManager as any).playHealAnimation).toHaveBeenCalled();
    });

    it('heal 恢复生命（与 modifyHealth 相同）', () => {
        unit.getCardData().health = 5;
        const action: LegacyEffectAction = { type: 'heal', value: 4 };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(9);
    });

    it('dealDamage 造成伤害', () => {
        const action: LegacyEffectAction = { type: 'dealDamage', value: 5 };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(5);
        expect((bc.animationManager as any).playHitAnimation).toHaveBeenCalled();
    });

    it('dealDamage 处理护甲减免（委托 StatusManager）', () => {
        const processDamageSpy = spyOn(bc.statusManager, 'processDamage').mockReturnValue(1);
        const action: LegacyEffectAction = { type: 'dealDamage', value: 5 };
        resolver.executeAction(action, [unit], makeContext());

        expect(processDamageSpy).toHaveBeenCalledWith('u1', 5);
        expect(unit.getCardData().health).toBe(9); // 10 - 1
    });

    it('dealDamage 不会让生命值低于0', () => {
        const action: LegacyEffectAction = { type: 'dealDamage', value: 100 };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(0);
    });

    it('loseHealth 失去生命值', () => {
        const action: LegacyEffectAction = { type: 'loseHealth', value: 4 };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(6);
        expect((bc.animationManager as any).playHitAnimation).toHaveBeenCalled();
    });

    it('healPlayer 触发玩家回复事件', () => {
        const action: LegacyEffectAction = { type: 'healPlayer', value: 5 };
        resolver.executeAction(action, [], makeContext());

        expect((bc.scene as any).events.emit).toHaveBeenCalledWith('healPlayer', 5);
    });

    it('damagePlayer 触发玩家伤害事件', () => {
        const action: LegacyEffectAction = { type: 'damagePlayer', value: 3 };
        resolver.executeAction(action, [], makeContext());

        expect((bc.scene as any).events.emit).toHaveBeenCalledWith('damagePlayer', 3);
    });

    it('drawCards 触发抽牌事件', () => {
        const action: LegacyEffectAction = { type: 'drawCards', value: 2 };
        resolver.executeAction(action, [], makeContext());

        expect((bc.scene as any).events.emit).toHaveBeenCalledWith('drawCards', 2);
    });

    it('drawCards 默认抽1张', () => {
        const action: LegacyEffectAction = { type: 'drawCards' } as any;
        resolver.executeAction(action, [], makeContext());

        expect((bc.scene as any).events.emit).toHaveBeenCalledWith('drawCards', 1);
    });

    it('applyStatus 委托 BattleStatusController', () => {
        const action: LegacyEffectAction = { type: 'applyStatus', statusId: 'poison', value: 3 };
        resolver.executeAction(action, [unit], makeContext());

        expect((bc.battleStatusController as any).applyStatusToUnit).toHaveBeenCalledWith(
            'u1', 'poison', 3, unit, '测试卡牌'
        );
    });

    it('applyStatus 使用 stacks 字段优先', () => {
        const action: LegacyEffectAction = { type: 'applyStatus', statusId: 'armor', stacks: 5, value: 1 };
        resolver.executeAction(action, [unit], makeContext());

        expect((bc.battleStatusController as any).applyStatusToUnit).toHaveBeenCalledWith(
            'u1', 'armor', 5, unit, '测试卡牌'
        );
    });

    it('removeDebuffs 清除减益状态', () => {
        const action: LegacyEffectAction = { type: 'removeDebuffs' };
        resolver.executeAction(action, [unit], makeContext());

        expect(bc.statusManager.clearDebuffs).toHaveBeenCalledWith('u1');
    });

    it('destroyUnit 设置生命值为0', () => {
        const action: LegacyEffectAction = { type: 'destroyUnit' };
        resolver.executeAction(action, [unit], makeContext());

        expect(unit.getCardData().health).toBe(0);
    });

    it('批量执行 — 多个目标', () => {
        const u2 = createMockCardSprite('u2', '单位2', 3, 8);
        const action: LegacyEffectAction = { type: 'modifyAttack', value: 2 };

        resolver.executeAction(action, [unit, u2], makeContext());

        expect(unit.getCardData().attack).toBe(7);
        expect(u2.getCardData().attack).toBe(5);
    });
});

// ==================== 完整效果执行测试 ====================

describe('EffectResolver — executeEffect', () => {
    let resolver: EffectResolver;
    let bc: BattleContext;
    let ally: ReturnType<typeof createMockCardSprite>;
    let enemy: ReturnType<typeof createMockCardSprite>;

    beforeEach(() => {
        bc = createMockBattleContext();
        resolver = new EffectResolver(bc);
        ally = createMockCardSprite('a1', '友方', 5, 10);
        enemy = createMockCardSprite('e1', '敌方', 4, 8);
    });

    it('执行完整效果 — modifyAttack 作用于 allAllies', () => {
        const effect: LegacyCardEffect = {
            timing: 'onAttack',
            target: { scope: 'allAllies' },
            actions: [{ type: 'modifyAttack', value: 2 }],
            text: '法器加攻',
        };
        const ctx = makeContext({
            playerField: [ally],
            enemyField: [enemy],
            sourceName: '锋锐法器',
        });

        resolver.executeEffect(effect, ctx);

        expect(ally.getCardData().attack).toBe(7);
        expect(enemy.getCardData().attack).toBe(4); // 未受影响
    });

    it('执行完整效果 — dealDamage 作用于 singleEnemy', () => {
        const effect: LegacyCardEffect = {
            timing: 'onDamaged',
            target: { scope: 'singleEnemy' },
            actions: [{ type: 'dealDamage', value: 3 }],
        };
        const ctx = makeContext({
            playerField: [ally],
            enemyField: [enemy],
            sourceName: '反伤法器',
        });

        resolver.executeEffect(effect, ctx);

        expect(enemy.getCardData().health).toBe(5);
    });

    it('ownerPlayer 作用域跳过单位目标但执行玩家动作', () => {
        const effect: LegacyCardEffect = {
            timing: 'onAttack',
            target: { scope: 'ownerPlayer' },
            actions: [{ type: 'healPlayer', value: 3 }],
        };
        resolver.executeEffect(effect, makeContext());

        expect((bc.scene as any).events.emit).toHaveBeenCalledWith('healPlayer', 3);
    });

    it('无 actions 的效果什么都不做', () => {
        const effect: LegacyCardEffect = {
            timing: 'permanent',
            target: { scope: 'allUnits' },
            actions: [],
        };
        const ctx = makeContext({ playerField: [ally], enemyField: [enemy] });

        resolver.executeEffect(effect, ctx);

        expect(ally.getCardData().attack).toBe(5); // 不变
        expect(enemy.getCardData().health).toBe(8);
    });

    it('无 scope 的效果跳过', () => {
        const effect: LegacyCardEffect = {
            timing: 'onAttack',
            actions: [{ type: 'modifyAttack', value: 10 }],
        };
        const ctx = makeContext({ playerField: [ally] });

        resolver.executeEffect(effect, ctx);

        expect(ally.getCardData().attack).toBe(5); // 不变
    });
});

// ==================== 场地永续效果测试 ====================

describe('EffectResolver — 场地永续效果', () => {
    let resolver: EffectResolver;
    let bc: BattleContext;
    let a1: ReturnType<typeof createMockCardSprite>;
    let a2: ReturnType<typeof createMockCardSprite>;
    let e1: ReturnType<typeof createMockCardSprite>;
    let ctx: EffectExecutionContext;

    beforeEach(() => {
        bc = createMockBattleContext();
        resolver = new EffectResolver(bc);
        a1 = createMockCardSprite('a1', '友方1', 5, 10);
        a2 = createMockCardSprite('a2', '友方2', 3, 8);
        e1 = createMockCardSprite('e1', '敌方1', 6, 12);
        ctx = makeContext({
            playerField: [a1, a2],
            enemyField: [e1],
            sourceName: '修炼之地',
        });
    });

    it('应用永续 +1 攻击到所有单位', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'permanent',
                target: { scope: 'allUnits' },
                actions: [{ type: 'modifyAttack', value: 1 }],
            },
        ];

        resolver.applyFieldPermanentEffects(effects, ctx);

        expect(a1.getCardData().attack).toBe(6);
        expect(a2.getCardData().attack).toBe(4);
        expect(e1.getCardData().attack).toBe(7);
    });

    it('移除永续效果回退修改', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'permanent',
                target: { scope: 'allUnits' },
                actions: [{ type: 'modifyAttack', value: 1 }],
            },
        ];

        resolver.applyFieldPermanentEffects(effects, ctx);
        resolver.removeFieldPermanentEffects(ctx);

        expect(a1.getCardData().attack).toBe(5);
        expect(a2.getCardData().attack).toBe(3);
        expect(e1.getCardData().attack).toBe(6);
    });

    it('应用多个永续效果后统一回退', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'permanent',
                target: { scope: 'allUnits' },
                actions: [{ type: 'modifyAttack', value: 2 }, { type: 'modifyHealth', value: 3 }],
            },
        ];

        resolver.applyFieldPermanentEffects(effects, ctx);

        expect(a1.getCardData().attack).toBe(7);
        expect(a1.getCardData().health).toBe(13);

        resolver.removeFieldPermanentEffects(ctx);

        expect(a1.getCardData().attack).toBe(5);
        expect(a1.getCardData().health).toBe(10);
    });

    it('移除后重新应用重新追踪', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'permanent',
                target: { scope: 'allUnits' },
                actions: [{ type: 'modifyAttack', value: 3 }],
            },
        ];

        // 第一次
        resolver.applyFieldPermanentEffects(effects, ctx);
        expect(a1.getCardData().attack).toBe(8);
        resolver.removeFieldPermanentEffects(ctx);
        expect(a1.getCardData().attack).toBe(5);

        // 第二次（模拟换场地）
        resolver.applyFieldPermanentEffects(effects, ctx);
        expect(a1.getCardData().attack).toBe(8);
        resolver.removeFieldPermanentEffects(ctx);
        expect(a1.getCardData().attack).toBe(5);
    });

    it('非 permanent timing 的效果不追踪', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'turnStart',
                target: { scope: 'allUnits' },
                actions: [{ type: 'modifyAttack', value: 5 }],
            },
        ];

        resolver.applyFieldPermanentEffects(effects, ctx);

        // 不应被应用
        expect(a1.getCardData().attack).toBe(5);
    });

    it('回退后 healPlayer / drawCards 不产生单位修改', () => {
        const effects: LegacyCardEffect[] = [
            {
                timing: 'permanent',
                target: { scope: 'ownerPlayer' },
                actions: [{ type: 'healPlayer', value: 2 }],
            },
        ];

        resolver.applyFieldPermanentEffects(effects, ctx);
        // 玩家动作不追踪到单位修改
        resolver.removeFieldPermanentEffects(ctx);

        // 无异常，单位未受影响
        expect(a1.getCardData().attack).toBe(5);
    });
});
