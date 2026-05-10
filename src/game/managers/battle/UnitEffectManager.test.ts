import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import {
  EffectActionDestination,
  EffectActionType,
  EffectConditionType,
  EffectEventSide,
  EffectEventType,
  type Gongfa,
} from '@data/types/gongfa';
import type { BattleContext } from '../../context/BattleContext';
import type { CardSprite } from '../../objects/CardSprite';
import { UnitEffectManager, type GongfaRuntimeContext } from './UnitEffectManager';

function collectConsole(run: () => void): { warnings: string[]; errors: string[] } {
  const originalWarn = console.warn;
  const originalError = console.error;
  const warnings: string[] = [];
  const errors: string[] = [];

  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  console.error = (message?: unknown) => {
    errors.push(String(message));
  };

  try {
    run();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  return { warnings, errors };
}

function createCardSprite(cardData: UnitCard): CardSprite {
  return {
    getCardData: () => cardData,
  } as unknown as CardSprite;
}

function createHarness(artifactGradeId: string) {
  const unitCard = {
    id: 'unit.test_qi_swordsman',
    name: '炼气剑修',
    kind: 'unit',
    realmId: 'realm_qi_1',
    gongfaIds: ['gongfa.test_artifact_armor'],
    attack: 4,
    health: 20,
  } as UnitCard;
  const unitSprite = createCardSprite(unitCard);
  const addLogMessages: string[] = [];
  const gongfaLogNames: string[] = [];
  const statusApplications: Array<{ unitId: string; statusId: string; value: number; target: CardSprite }> = [];
  const battleContext = {
    battleLog: {
      addLog: (message: string) => addLogMessages.push(message),
      addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
    },
  } as unknown as BattleContext;
  const context = {
    playerField: [unitSprite],
    discardPile: [],
    hand: [],
    cardScale: 1,
    artifactUsage: {},
    battleStatusController: {
      applyStatusToUnit: (unitId: string, statusId: string, value: number, target: CardSprite) => {
        statusApplications.push({ unitId, statusId, value, target });
      },
    },
  } as GongfaRuntimeContext;
  const artifact = {
    id: `artifact.${artifactGradeId}`,
    name: '测试法器',
    kind: 'artifact',
    gradeId: artifactGradeId,
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
  } as ArtifactCard;
  const gongfaList: Gongfa[] = [
    {
      id: 'gongfa.test_artifact_armor',
      name: '借器护身',
      description: '根据装备法器星级获得护甲。',
      schema: {
        event: { type: EffectEventType.OnEquipArtifact, side: EffectEventSide.Ally },
        conditions: [
          {
            type: EffectConditionType.ArtifactEquipped,
            weaponType: '剑',
            maxStar: 'card.star + 1',
          },
        ],
        actions: [
          {
            type: EffectActionType.GainArmor,
            target: 'self',
            value: 'artifact.star * 2',
          },
        ],
      },
    },
  ];
  const manager = new UnitEffectManager(battleContext, gongfaList);

  return { manager, unitSprite, context, artifact, addLogMessages, gongfaLogNames, statusApplications };
}

function createOnSummonArmorHarness(value: string) {
  const unitCard = {
    id: 'unit.test_qi_swordsman',
    name: '炼气剑修',
    kind: 'unit',
    realmId: 'realm_qi_1',
    gongfaIds: ['gongfa.test_summon_armor'],
    attack: 4,
    health: 20,
  } as UnitCard;
  const unitSprite = createCardSprite(unitCard);
  const addLogMessages: string[] = [];
  const gongfaLogNames: string[] = [];
  const statusApplications: Array<{ unitId: string; statusId: string; value: number; target: CardSprite }> = [];
  const battleContext = {
    battleLog: {
      addLog: (message: string) => addLogMessages.push(message),
      addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
    },
  } as unknown as BattleContext;
  const context = {
    playerField: [unitSprite],
    discardPile: [],
    hand: [],
    cardScale: 1,
    artifactUsage: {},
    battleStatusController: {
      applyStatusToUnit: (unitId: string, statusId: string, appliedValue: number, target: CardSprite) => {
        statusApplications.push({ unitId, statusId, value: appliedValue, target });
      },
    },
  } as GongfaRuntimeContext;
  const gongfaList: Gongfa[] = [
    {
      id: 'gongfa.test_summon_armor',
      name: '召唤护身',
      description: '测试表达式求值失败回退。',
      schema: {
        event: { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
        actions: [
          {
            type: EffectActionType.GainArmor,
            target: 'self',
            value,
          },
        ],
      },
    },
  ];
  const manager = new UnitEffectManager(battleContext, gongfaList);

  return { manager, unitSprite, context, addLogMessages, gongfaLogNames, statusApplications };
}

function createFilterArtifact(
  id: string,
  gradeId: string,
  weaponType: ArtifactCard['weaponType'] = '剑',
): ArtifactCard {
  return {
    id,
    name: id,
    kind: 'artifact',
    gradeId,
    equipTarget: 'unit',
    weaponType,
    elements: ['金'],
  } as ArtifactCard;
}

function createCardFilterHarness() {
  const unitCard = {
    id: 'unit.test_filter_owner',
    name: '筛选修士',
    kind: 'unit',
    realmId: 'realm_qi_1',
    gongfaIds: ['gongfa.test_filter_adapters'],
    attack: 4,
    health: 20,
  } as UnitCard;
  const unitSprite = createCardSprite(unitCard);
  const addLogMessages: string[] = [];
  const gongfaLogNames: string[] = [];
  const battleContext = {
    battleLog: {
      addLog: (message: string) => addLogMessages.push(message),
      addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
    },
  } as unknown as BattleContext;
  const recoverCalls: Array<{ amount: number; filterFunc: (card: ArtifactCard) => boolean }> = [];
  const searchCalls: Array<{ amount: number; filterFunc: (card: ArtifactCard) => boolean }> = [];
  const handAdds: Array<{ card: ArtifactCard; scale: number }> = [];
  const mysticSword = createFilterArtifact('artifact.mystic_sword', 'grade_mystic_lower');
  const heavenSword = createFilterArtifact('artifact.heaven_sword', 'grade_heaven_lower');
  const context = {
    playerField: [unitSprite],
    discardPile: [],
    deck: [mysticSword, heavenSword],
    hand: [],
    cardScale: 1.25,
    artifactUsage: {},
    gameActionHandler: {
      recoverFromDiscardPile: (amount: number, filterFunc: (card: ArtifactCard) => boolean) => {
        recoverCalls.push({ amount, filterFunc });
      },
      searchDeck: (amount: number, filterFunc: (card: ArtifactCard) => boolean) => {
        searchCalls.push({ amount, filterFunc });
      },
      addCardToHand: (card: ArtifactCard, scale: number) => {
        handAdds.push({ card, scale });
      },
    },
  } as GongfaRuntimeContext;
  const gongfaList: Gongfa[] = [
    {
      id: 'gongfa.test_filter_adapters',
      name: '筛选边界',
      description: '测试 UnitEffectManager 只适配运行时副作用。',
      schema: {
        event: { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
        actions: [
          {
            type: EffectActionType.RecoverCardFromDiscard,
            filter: {
              kind: ['artifact'],
              weaponTypesAnyOf: ['剑'],
              maxStar: 'card.star + 1',
            },
            destination: EffectActionDestination.Hand,
            amount: 1,
          },
          {
            type: EffectActionType.SearchCardFromDeck,
            filter: {
              kind: ['artifact'],
              weaponTypesAnyOf: ['剑'],
              maxStar: 'card.star + 1',
            },
            destination: EffectActionDestination.Hand,
            amount: 1,
          },
          {
            type: EffectActionType.DrawAndFilter,
            amount: 2,
            filter: {
              kind: ['artifact'],
              weaponTypesAnyOf: ['剑'],
              maxStar: 'card.star + 1',
            },
            matchDestination: EffectActionDestination.Hand,
            nonMatchDestination: EffectActionDestination.DiscardPile,
          },
        ],
      },
    },
  ];
  const manager = new UnitEffectManager(battleContext, gongfaList);

  return {
    manager,
    unitSprite,
    context,
    addLogMessages,
    gongfaLogNames,
    recoverCalls,
    searchCalls,
    handAdds,
    mysticSword,
    heavenSword,
  };
}

function createImmediateAttackDelegationHarness() {
  const unitCard = {
    id: 'unit.test_attack_owner',
    name: '控剑修士',
    kind: 'unit',
    realmId: 'realm_qi_1',
    gongfaIds: ['gongfa.test_immediate_attack'],
    attack: 4,
    health: 20,
  } as UnitCard;
  const unitSprite = createCardSprite(unitCard);
  const enemySprite = createCardSprite({
    id: 'enemy.test_target',
    name: '活傀儡',
    kind: 'unit',
    realmId: 'realm_qi_1',
    attack: 1,
    health: 8,
  } as UnitCard);
  const addLogMessages: string[] = [];
  const gongfaLogNames: string[] = [];
  const attackCalls: Array<{
    attacker: CardSprite;
    target: CardSprite | CardSprite[];
    damage: number;
    delay: number;
    isAOE: boolean;
  }> = [];
  const battleContext = {
    battleLog: {
      addLog: (message: string) => addLogMessages.push(message),
      addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
    },
  } as unknown as BattleContext;
  const context = {
    playerField: [unitSprite],
    enemyField: [enemySprite],
    discardPile: [],
    hand: [],
    cardScale: 1,
    artifactUsage: {},
    combatManager: {
      performSingleAttack: (
        attacker: CardSprite,
        target: CardSprite | CardSprite[],
        damage: number,
        delay: number,
        isAOE: boolean,
      ) => {
        attackCalls.push({ attacker, target, damage, delay, isAOE });
      },
    },
  } as GongfaRuntimeContext;
  const artifact = {
    id: 'artifact.test_sword',
    name: '测试飞剑',
    kind: 'artifact',
    gradeId: 'grade_earth_lower',
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
    attackBonus: 2,
  } as ArtifactCard;
  const gongfaList: Gongfa[] = [
    {
      id: 'gongfa.test_immediate_attack',
      name: '控剑术·委托',
      description: '测试立即攻击运行时边界。',
      schema: {
        event: { type: EffectEventType.OnEquipArtifact, side: EffectEventSide.Ally },
        actions: [
          {
            type: EffectActionType.ImmediateAttack,
            target: 'singleEnemy',
            damageMultiplier: 0.5,
          },
        ],
      },
    },
  ];
  const manager = new UnitEffectManager(battleContext, gongfaList);

  return {
    manager,
    unitSprite,
    enemySprite,
    context,
    artifact,
    addLogMessages,
    gongfaLogNames,
    attackCalls,
  };
}

describe('UnitEffectManager artifact grade lookup consumer contract', () => {
  it('uses artifact grade stars for equip conditions and artifact.star expressions without changing behavior', () => {
    const harness = createHarness('grade_earth_lower');

    harness.manager.applyOnEquipArtifactEffects(harness.unitSprite, harness.artifact, harness.context);

    expect(harness.statusApplications).toEqual([
      {
        unitId: 'unit.test_qi_swordsman',
        statusId: 'armor',
        value: 4,
        target: harness.unitSprite,
      },
    ]);
    expect(harness.addLogMessages).toEqual(['【炼气剑修】获得 4 点护甲']);
    expect(harness.gongfaLogNames).toEqual(['借器护身']);
  });

  it('keeps maxStar artifact equip conditions blocking higher-grade artifacts', () => {
    const harness = createHarness('grade_heaven_lower');

    harness.manager.applyOnEquipArtifactEffects(harness.unitSprite, harness.artifact, harness.context);

    expect(harness.statusApplications).toEqual([]);
    expect(harness.addLogMessages).toEqual([]);
    expect(harness.gongfaLogNames).toEqual([]);
  });
});

describe('UnitEffectManager gongfa expression fallback contract', () => {
  it('rejects unsupported expression identifiers and falls back to 0 without applying armor', () => {
    const harness = createOnSummonArmorHarness('card.attack + 1');

    const consoleOutput = collectConsole(() => {
      harness.manager.applyOnSummonEffects(harness.unitSprite, harness.context);
    });

    expect(harness.statusApplications).toEqual([]);
    expect(harness.addLogMessages).toEqual([]);
    expect(harness.gongfaLogNames).toEqual([]);
    expect(consoleOutput.errors).toEqual(['表达式计算失败: card.attack + 1']);
    expect(consoleOutput.warnings).toEqual(['护甲值无效: 0']);
  });

  it('keeps missing artifact.star context on the existing 0 fallback path', () => {
    const harness = createOnSummonArmorHarness('artifact.star * 2');

    const consoleOutput = collectConsole(() => {
      harness.manager.applyOnSummonEffects(harness.unitSprite, harness.context);
    });

    expect(harness.statusApplications).toEqual([]);
    expect(harness.addLogMessages).toEqual([]);
    expect(harness.gongfaLogNames).toEqual([]);
    expect(consoleOutput.errors).toEqual([]);
    expect(consoleOutput.warnings).toEqual(['护甲值无效: 0']);
  });

  it('keeps GainArmor return semantics so orchestration logs even when armor status runtime is absent', () => {
    const harness = createOnSummonArmorHarness('3');
    delete (harness.context as Partial<GongfaRuntimeContext>).battleStatusController;

    const consoleOutput = collectConsole(() => {
      harness.manager.applyOnSummonEffects(harness.unitSprite, harness.context);
    });

    expect(harness.statusApplications).toEqual([]);
    expect(harness.addLogMessages).toEqual(['【炼气剑修】获得 3 点护甲']);
    expect(harness.gongfaLogNames).toEqual(['召唤护身']);
    expect(consoleOutput.errors).toEqual([]);
    expect(consoleOutput.warnings).toEqual(['battleStatusController 未提供，无法应用护甲状态']);
  });
});

describe('UnitEffectManager CardFilter runtime adapters', () => {
  it('reuses one pure CardFilter boundary for recover, search, and draw adapters', () => {
    const harness = createCardFilterHarness();

    harness.manager.applyOnSummonEffects(harness.unitSprite, harness.context);

    expect(harness.recoverCalls).toHaveLength(1);
    expect(harness.recoverCalls[0].amount).toBe(1);
    expect(harness.recoverCalls[0].filterFunc(harness.mysticSword)).toBe(true);
    expect(harness.recoverCalls[0].filterFunc(harness.heavenSword)).toBe(false);
    expect(harness.searchCalls).toHaveLength(1);
    expect(harness.searchCalls[0].amount).toBe(1);
    expect(harness.searchCalls[0].filterFunc(harness.mysticSword)).toBe(true);
    expect(harness.searchCalls[0].filterFunc(harness.heavenSword)).toBe(false);
    expect(harness.handAdds).toEqual([{ card: harness.mysticSword, scale: 1.25 }]);
    expect(harness.context.discardPile).toEqual([harness.heavenSword]);
    expect(harness.context.deck).toEqual([]);
    expect(harness.addLogMessages).toEqual(['抽取2张卡牌，其中1张符合条件']);
    expect(harness.gongfaLogNames).toEqual(['筛选边界']);
  });
});

describe('UnitEffectManager ImmediateAttack runtime adapter delegation', () => {
  it('preserves ImmediateAttack orchestration logs and performSingleAttack args through the typed adapter', () => {
    const harness = createImmediateAttackDelegationHarness();

    harness.manager.applyOnEquipArtifactEffects(harness.unitSprite, harness.artifact, harness.context);

    expect(harness.attackCalls).toEqual([
      {
        attacker: harness.unitSprite,
        target: harness.enemySprite,
        damage: 3,
        delay: 0,
        isAOE: false,
      },
    ]);
    expect(harness.addLogMessages).toEqual(['【控剑修士】触发控剑术，立即发动攻击（3点伤害）']);
    expect(harness.gongfaLogNames).toEqual(['控剑术·委托']);
  });
});

describe('UnitEffectManager unsupported gongfa action dispatch', () => {
  it('keeps unsupported actions unexecuted so gongfa logs are not emitted', () => {
    const unitCard = {
      id: 'unit.test_unsupported_owner',
      name: '未实现功法修士',
      kind: 'unit',
      realmId: 'realm_qi_1',
      gongfaIds: ['gongfa.test_unsupported_actions'],
      attack: 4,
      health: 20,
    } as UnitCard;
    const unitSprite = createCardSprite(unitCard);
    const addLogMessages: string[] = [];
    const gongfaLogNames: string[] = [];
    const battleContext = {
      battleLog: {
        addLog: (message: string) => addLogMessages.push(message),
        addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
      },
    } as unknown as BattleContext;
    const manager = new UnitEffectManager(battleContext, [
      {
        id: 'gongfa.test_unsupported_actions',
        name: '未实现动作',
        description: '不应触发功法日志。',
        schema: {
          event: { type: EffectEventType.OnSummon, side: EffectEventSide.Ally },
          actions: [
            { type: EffectActionType.DrawCards, value: 2 },
            { type: EffectActionType.ModifyStats, attackDelta: 1 },
            { type: EffectActionType.DealDamage, value: 3, target: 'singleEnemy' },
            { type: EffectActionType.ApplyStatus, statusId: 'armor', target: 'self' },
            { type: EffectActionType.AddLog, message: 'unsupported log' },
            { type: EffectActionType.Custom, scriptId: 'script.unsupported' },
          ],
        },
      },
    ]);
    const context = {
      playerField: [unitSprite],
      discardPile: [],
      hand: [],
      cardScale: 1,
      artifactUsage: {},
    } as GongfaRuntimeContext;

    const consoleOutput = collectConsole(() => {
      manager.applyOnSummonEffects(unitSprite, context);
    });

    expect(addLogMessages).toEqual([]);
    expect(gongfaLogNames).toEqual([]);
    expect(consoleOutput.errors).toEqual([]);
    expect(consoleOutput.warnings).toEqual([
      'DrawCards 动作暂未实现',
      '功法动作尚未实现：ModifyStats',
      '功法动作尚未实现：DealDamage',
      '功法动作尚未实现：ApplyStatus',
      '功法动作尚未实现：AddLog',
      '自定义功法动作暂未实现：script.unsupported',
    ]);
  });
});

describe('UnitEffectManager gongfa event matching delegation', () => {
  it('does not execute actions or emit logs when the event side mismatches', () => {
    const unitCard = {
      id: 'unit.test_side_mismatch_owner',
      name: '侧别测试修士',
      kind: 'unit',
      realmId: 'realm_qi_1',
      gongfaIds: ['gongfa.test_side_mismatch'],
      attack: 4,
      health: 20,
    } as UnitCard;
    const unitSprite = createCardSprite(unitCard);
    const addLogMessages: string[] = [];
    const gongfaLogNames: string[] = [];
    const statusApplications: Array<{ unitId: string; statusId: string; value: number; target: CardSprite }> = [];
    const battleContext = {
      battleLog: {
        addLog: (message: string) => addLogMessages.push(message),
        addGongfaLog: (_unitName: string, gongfaName: string) => gongfaLogNames.push(gongfaName),
      },
    } as unknown as BattleContext;
    const manager = new UnitEffectManager(battleContext, [
      {
        id: 'gongfa.test_side_mismatch',
        name: '敌侧才触发',
        description: '玩家侧召唤时不应触发。',
        schema: {
          event: { type: EffectEventType.OnSummon, side: EffectEventSide.Enemy },
          actions: [
            {
              type: EffectActionType.GainArmor,
              target: 'self',
              value: 3,
            },
          ],
        },
      },
    ]);
    const context = {
      playerField: [unitSprite],
      discardPile: [],
      hand: [],
      cardScale: 1,
      artifactUsage: {},
      battleStatusController: {
        applyStatusToUnit: (unitId: string, statusId: string, value: number, target: CardSprite) => {
          statusApplications.push({ unitId, statusId, value, target });
        },
      },
    } as GongfaRuntimeContext;

    const consoleOutput = collectConsole(() => {
      manager.applyOnSummonEffects(unitSprite, context);
    });

    expect(statusApplications).toEqual([]);
    expect(addLogMessages).toEqual([]);
    expect(gongfaLogNames).toEqual([]);
    expect(consoleOutput.errors).toEqual([]);
    expect(consoleOutput.warnings).toEqual([]);
  });
});
