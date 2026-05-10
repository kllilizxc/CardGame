import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import {
  EffectActionType,
  type ImmediateAttackAction,
} from '@data/types/gongfa';
import type { CardSprite } from '../../objects/CardSprite';
import {
  executeGongfaImmediateAttackOperation,
  type GongfaAttackOperationCombatManager,
} from './gongfaAttackOperations';

function collectConsole(run: () => boolean): { result: boolean; warnings: string[]; errors: string[] } {
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
    return { result: run(), warnings, errors };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function createUnitSprite(overrides: Partial<UnitCard> = {}): CardSprite {
  const cardData = {
    id: 'unit.test_attack_owner',
    name: '控剑修士',
    kind: 'unit',
    realmId: 'realm_qi_1',
    attack: 4,
    health: 20,
    ...overrides,
  } as UnitCard;

  return {
    getCardData: () => cardData,
  } as unknown as CardSprite;
}

function createArtifact(overrides: Partial<ArtifactCard> = {}): ArtifactCard {
  return {
    id: 'artifact.test_sword',
    name: '测试飞剑',
    kind: 'artifact',
    gradeId: 'grade_earth_lower',
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
    ...overrides,
  } as ArtifactCard;
}

function createImmediateAttackAction(overrides: Partial<ImmediateAttackAction> = {}): ImmediateAttackAction {
  return {
    type: EffectActionType.ImmediateAttack,
    target: 'singleEnemy',
    ...overrides,
  };
}

function createCombatManager(
  calls: Array<{
    attacker: CardSprite;
    target: CardSprite | CardSprite[];
    damage: number;
    delay: number;
    isAOE: boolean;
  }>,
): GongfaAttackOperationCombatManager {
  return {
    performSingleAttack: (
      attacker: CardSprite,
      target: CardSprite | CardSprite[],
      damage: number,
      delay: number,
      isAOE: boolean,
    ) => {
      calls.push({ attacker, target, damage, delay, isAOE });
    },
  };
}

describe('executeGongfaImmediateAttackOperation runtime prerequisites', () => {
  it('warns and returns false without logs or attacks when the trigger unit is missing', () => {
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const consoleOutput = collectConsole(() => executeGongfaImmediateAttackOperation(
      createImmediateAttackAction(),
      {
        enemyField: [createUnitSprite({ id: 'enemy.alive', name: '活傀儡', health: 8 })],
        combatManager: createCombatManager(calls),
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    ));

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['立即攻击需要触发单位信息']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('warns and returns false without logs or attacks when enemies are missing', () => {
    const triggerUnit = createUnitSprite();
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const consoleOutput = collectConsole(() => {
      const missingEnemyFieldResult = executeGongfaImmediateAttackOperation(
        createImmediateAttackAction(),
        {
          triggerUnit,
          combatManager: createCombatManager(calls),
          battleLog: { addLog: (message: string) => logs.push(message) },
        },
      );
      const emptyEnemyFieldResult = executeGongfaImmediateAttackOperation(
        createImmediateAttackAction(),
        {
          triggerUnit,
          enemyField: [],
          combatManager: createCombatManager(calls),
          battleLog: { addLog: (message: string) => logs.push(message) },
        },
      );

      return missingEnemyFieldResult || emptyEnemyFieldResult;
    });

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['没有敌方单位可以攻击', '没有敌方单位可以攻击']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('warns and returns false without logs or attacks when the combat manager is missing', () => {
    const logs: string[] = [];

    const consoleOutput = collectConsole(() => executeGongfaImmediateAttackOperation(
      createImmediateAttackAction(),
      {
        triggerUnit: createUnitSprite(),
        enemyField: [createUnitSprite({ id: 'enemy.alive', name: '活傀儡', health: 8 })],
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    ));

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['CombatManager 未提供，无法执行立即攻击']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual([]);
  });
});

describe('executeGongfaImmediateAttackOperation attack execution', () => {
  it('attacks the first alive enemy with floored attack plus artifact damage and the existing log text', () => {
    const triggerUnit = createUnitSprite({ attack: 4 });
    const deadEnemy = createUnitSprite({ id: 'enemy.dead', name: '坏傀儡', health: 0 });
    const aliveEnemy = createUnitSprite({ id: 'enemy.alive', name: '活傀儡', health: 12 });
    const laterEnemy = createUnitSprite({ id: 'enemy.later', name: '后排傀儡', health: 9 });
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const result = executeGongfaImmediateAttackOperation(
      createImmediateAttackAction({ damageMultiplier: 1.5 }),
      {
        triggerUnit,
        enemyField: [deadEnemy, aliveEnemy, laterEnemy],
        equippedArtifact: createArtifact({ attackBonus: 3 }),
        combatManager: createCombatManager(calls),
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    );

    expect(result).toBe(true);
    expect(logs).toEqual(['【控剑修士】触发控剑术，立即发动攻击（10点伤害）']);
    expect(calls).toEqual([
      {
        attacker: triggerUnit,
        target: aliveEnemy,
        damage: 10,
        delay: 0,
        isAOE: false,
      },
    ]);
  });

  it('attacks all alive enemies with AOE call shape and floored multiplier damage', () => {
    const triggerUnit = createUnitSprite({ attack: 5 });
    const firstAliveEnemy = createUnitSprite({ id: 'enemy.first_alive', name: '前排傀儡', health: 7 });
    const deadEnemy = createUnitSprite({ id: 'enemy.dead', name: '坏傀儡', health: 0 });
    const secondAliveEnemy = createUnitSprite({ id: 'enemy.second_alive', name: '后排傀儡', health: 4 });
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const result = executeGongfaImmediateAttackOperation(
      createImmediateAttackAction({ target: 'allEnemies', damageMultiplier: 0.5 }),
      {
        triggerUnit,
        enemyField: [firstAliveEnemy, deadEnemy, secondAliveEnemy],
        equippedArtifact: createArtifact({ attackBonus: 2 }),
        combatManager: createCombatManager(calls),
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    );

    expect(result).toBe(true);
    expect(logs).toEqual(['【控剑修士】触发控剑术，立即发动攻击（3点伤害）']);
    expect(calls).toEqual([
      {
        attacker: triggerUnit,
        target: [firstAliveEnemy, secondAliveEnemy],
        damage: 3,
        delay: 0,
        isAOE: true,
      },
    ]);
  });

  it('keeps the current single-target no-alive-target behavior as a logged true no-op', () => {
    const triggerUnit = createUnitSprite({ attack: 6 });
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const consoleOutput = collectConsole(() => executeGongfaImmediateAttackOperation(
      createImmediateAttackAction(),
      {
        triggerUnit,
        enemyField: [
          createUnitSprite({ id: 'enemy.dead_one', name: '坏傀儡一', health: 0 }),
          createUnitSprite({ id: 'enemy.dead_two', name: '坏傀儡二', health: -2 }),
        ],
        combatManager: createCombatManager(calls),
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    ));

    expect(consoleOutput.result).toBe(true);
    expect(consoleOutput.warnings).toEqual([]);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual(['【控剑修士】触发控剑术，立即发动攻击（6点伤害）']);
    expect(calls).toEqual([]);
  });

  it('keeps the current all-enemies no-alive-target behavior as a logged true no-op', () => {
    const triggerUnit = createUnitSprite({ attack: 6 });
    const logs: string[] = [];
    const calls: Array<{
      attacker: CardSprite;
      target: CardSprite | CardSprite[];
      damage: number;
      delay: number;
      isAOE: boolean;
    }> = [];

    const consoleOutput = collectConsole(() => executeGongfaImmediateAttackOperation(
      createImmediateAttackAction({ target: 'allEnemies' }),
      {
        triggerUnit,
        enemyField: [
          createUnitSprite({ id: 'enemy.dead_one', name: '坏傀儡一', health: 0 }),
          createUnitSprite({ id: 'enemy.dead_two', name: '坏傀儡二', health: -2 }),
        ],
        combatManager: createCombatManager(calls),
        battleLog: { addLog: (message: string) => logs.push(message) },
      },
    ));

    expect(consoleOutput.result).toBe(true);
    expect(consoleOutput.warnings).toEqual([]);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual(['【控剑修士】触发控剑术，立即发动攻击（6点伤害）']);
    expect(calls).toEqual([]);
  });
});
