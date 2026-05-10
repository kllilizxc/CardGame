import { describe, expect, it } from 'bun:test';

import type { UnitCard } from '@data/types/cards/unit';
import { EffectActionType, type GainArmorAction } from '@data/types/gongfa';
import type { CardSprite } from '../../objects/CardSprite';
import { executeGongfaArmorOperation } from './gongfaArmorOperations';

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
    id: 'unit.test_armor_owner',
    name: '护身修士',
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

function createGainArmorAction(overrides: Partial<GainArmorAction> = {}): GainArmorAction {
  return {
    type: EffectActionType.GainArmor,
    target: 'self',
    value: 5,
    ...overrides,
  };
}

describe('executeGongfaArmorOperation', () => {
  it('applies self armor with the existing log, armor status id, and true return value', () => {
    const triggerUnit = createUnitSprite();
    const logs: string[] = [];
    const statusApplications: Array<{ unitId: string; statusId: string; value: number; target: CardSprite }> = [];

    const result = executeGongfaArmorOperation(createGainArmorAction({ value: 7 }), {
      triggerUnit,
      battleLog: { addLog: (message: string) => logs.push(message) },
      battleStatusController: {
        applyStatusToUnit: (unitId: string, statusId: string, value: number, target: CardSprite) => {
          statusApplications.push({ unitId, statusId, value, target });
        },
      },
      evaluateExpression: () => {
        throw new Error('numeric armor values must not evaluate expressions');
      },
    });

    expect(result).toBe(true);
    expect(logs).toEqual(['【护身修士】获得 7 点护甲']);
    expect(statusApplications).toEqual([
      {
        unitId: 'unit.test_armor_owner',
        statusId: 'armor',
        value: 7,
        target: triggerUnit,
      },
    ]);
  });

  it('delegates string armor values to the supplied expression evaluator before applying side effects', () => {
    const triggerUnit = createUnitSprite();
    const evaluatedExpressions: string[] = [];
    const logs: string[] = [];
    const statusValues: number[] = [];

    const result = executeGongfaArmorOperation(
      createGainArmorAction({ value: 'artifact.star * 2' }),
      {
        triggerUnit,
        battleLog: { addLog: (message: string) => logs.push(message) },
        battleStatusController: {
          applyStatusToUnit: (_unitId: string, _statusId: string, value: number) => {
            statusValues.push(value);
          },
        },
        evaluateExpression: (expression: string) => {
          evaluatedExpressions.push(expression);
          return 6;
        },
      },
    );

    expect(result).toBe(true);
    expect(evaluatedExpressions).toEqual(['artifact.star * 2']);
    expect(logs).toEqual(['【护身修士】获得 6 点护甲']);
    expect(statusValues).toEqual([6]);
  });

  it('preserves missing trigger and non-positive armor warnings without side effects', () => {
    const triggerUnit = createUnitSprite();
    const logs: string[] = [];
    const statusValues: number[] = [];

    const consoleOutput = collectConsole(() => {
      const missingTriggerResult = executeGongfaArmorOperation(createGainArmorAction({ value: 5 }), {
        battleLog: { addLog: (message: string) => logs.push(message) },
        battleStatusController: {
          applyStatusToUnit: (_unitId: string, _statusId: string, value: number) => {
            statusValues.push(value);
          },
        },
        evaluateExpression: () => 5,
      });
      const invalidValueResult = executeGongfaArmorOperation(createGainArmorAction({ value: 'artifact.star * 2' }), {
        triggerUnit,
        battleLog: { addLog: (message: string) => logs.push(message) },
        battleStatusController: {
          applyStatusToUnit: (_unitId: string, _statusId: string, value: number) => {
            statusValues.push(value);
          },
        },
        evaluateExpression: () => 0,
      });

      return missingTriggerResult || invalidValueResult;
    });

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['获得护甲需要触发单位信息', '护甲值无效: 0']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual([]);
    expect(statusValues).toEqual([]);
  });

  it('keeps unsupported targets as the existing no-op warning path', () => {
    const triggerUnit = createUnitSprite();
    const logs: string[] = [];
    const statusValues: number[] = [];

    const consoleOutput = collectConsole(() => executeGongfaArmorOperation(
      createGainArmorAction({ target: 'singleAlly', value: 5 }),
      {
        triggerUnit,
        battleLog: { addLog: (message: string) => logs.push(message) },
        battleStatusController: {
          applyStatusToUnit: (_unitId: string, _statusId: string, value: number) => {
            statusValues.push(value);
          },
        },
        evaluateExpression: () => 5,
      },
    ));

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['未找到护甲目标']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual([]);
    expect(statusValues).toEqual([]);
  });

  it('logs armor and returns true while preserving the missing status-controller warning', () => {
    const triggerUnit = createUnitSprite();
    const logs: string[] = [];

    const consoleOutput = collectConsole(() => executeGongfaArmorOperation(createGainArmorAction({ value: 3 }), {
      triggerUnit,
      battleLog: { addLog: (message: string) => logs.push(message) },
      evaluateExpression: () => 3,
    }));

    expect(consoleOutput.result).toBe(true);
    expect(consoleOutput.warnings).toEqual(['battleStatusController 未提供，无法应用护甲状态']);
    expect(consoleOutput.errors).toEqual([]);
    expect(logs).toEqual(['【护身修士】获得 3 点护甲']);
  });
});
