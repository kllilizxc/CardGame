import { describe, expect, it } from 'bun:test';

import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { BaseCard } from '@data/types/cards/core';
import type { UnitCard } from '@data/types/cards/unit';
import {
  EffectConditionType,
  type EffectCondition,
} from '@data/types/gongfa';
import {
  areGongfaConditionsSatisfied,
  type GongfaConditionRuntimeContext,
  type GongfaConditionCardSource,
  type GongfaConditionUnitSource,
} from './gongfaConditionEvaluation';

function collectConsole<T>(run: () => T): { result: T; warnings: string[]; errors: string[] } {
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

function createUnitSource(
  overrides: Partial<UnitCard> = {},
): GongfaConditionUnitSource {
  const cardData = {
    id: 'unit.test_condition_owner',
    name: '条件修士',
    kind: 'unit',
    description: 'test unit',
    rarity: 'common',
    realmId: 'realm_qi_1',
    race: '人族',
    attack: 4,
    health: 20,
    ...overrides,
  } as UnitCard;

  return {
    getCardData: () => cardData,
  };
}

function createCardSource(labels: string[] = []): GongfaConditionCardSource {
  const cardData = {
    id: `card.${labels.join('_') || 'unlabeled'}`,
    name: '手牌',
    kind: 'talisman',
    description: 'test hand card',
    rarity: 'common',
    labels,
  } as BaseCard;

  return {
    getCardData: () => cardData,
  };
}

function createArtifact(
  overrides: Partial<ArtifactCard> = {},
): ArtifactCard {
  return {
    id: 'artifact.test_condition_sword',
    name: '条件飞剑',
    kind: 'artifact',
    description: 'test artifact',
    rarity: 'common',
    labels: [],
    gradeId: 'grade_mystic_lower',
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
    ...overrides,
  } as ArtifactCard;
}

function createContext(
  overrides: Partial<GongfaConditionRuntimeContext> = {},
): GongfaConditionRuntimeContext {
  return {
    playerField: [],
    hand: [],
    artifactUsage: {},
    ...overrides,
  };
}

describe('areGongfaConditionsSatisfied artifact usage conditions', () => {
  it('preserves weapon-specific and total ArtifactUsedThisTurn minimum checks', () => {
    const context = createContext({
      artifactUsage: {
        剑: 2,
        刀: 1,
      } satisfies Partial<Record<ArtifactWeaponType, number>>,
    });

    expect(areGongfaConditionsSatisfied([
      { type: EffectConditionType.ArtifactUsedThisTurn, minimum: 3 },
    ], context)).toBe(true);
    expect(areGongfaConditionsSatisfied([
      { type: EffectConditionType.ArtifactUsedThisTurn, minimum: 4 },
    ], context)).toBe(false);
    expect(areGongfaConditionsSatisfied([
      { type: EffectConditionType.ArtifactUsedThisTurn, weaponType: '剑', minimum: 2 },
    ], context)).toBe(true);
    expect(areGongfaConditionsSatisfied([
      { type: EffectConditionType.ArtifactUsedThisTurn, weaponType: '剑', minimum: 3 },
    ], context)).toBe(false);
  });
});

describe('areGongfaConditionsSatisfied field and hand conditions', () => {
  it('preserves UnitOnField id/label checks and CardInHand label/minimum checks', () => {
    const swordCultivator = createUnitSource({
      id: 'unit.sword_cultivator',
      labels: ['剑修', '内门'],
    });
    const context = createContext({
      playerField: [swordCultivator],
      hand: [
        createCardSource(['飞剑']),
        createCardSource(['飞剑', '旧物']),
        createCardSource(['丹药']),
      ],
    });

    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.UnitOnField,
        unitId: 'unit.sword_cultivator',
        requiredLabelsAnyOf: ['剑修'],
      },
      {
        type: EffectConditionType.CardInHand,
        requiredLabelsAnyOf: ['飞剑'],
        minimum: 2,
      },
    ], context)).toBe(true);
    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.UnitOnField,
        unitId: 'unit.other',
        requiredLabelsAnyOf: ['剑修'],
      },
    ], context)).toBe(false);
    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.CardInHand,
        requiredLabelsAnyOf: ['飞剑'],
        minimum: 3,
      },
    ], context)).toBe(false);
    expect(areGongfaConditionsSatisfied([
      { type: EffectConditionType.UnitOnField },
    ], context)).toBe(true);
  });
});

describe('areGongfaConditionsSatisfied equipped artifact conditions', () => {
  it('preserves ArtifactEquipped weapon label fallback plus numeric and expression maxStar checks', () => {
    const triggerUnit = createUnitSource({ realmId: 'realm_qi_1' });
    const labelOnlySword = createArtifact({
      weaponType: undefined,
      labels: ['宗门飞剑'],
      gradeId: 'grade_mystic_lower',
    });
    const context = createContext({
      triggerUnit,
      equippedArtifact: labelOnlySword,
    });

    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.ArtifactEquipped,
        weaponType: '剑',
        maxStar: 'card.star + 1',
      },
    ], context)).toBe(true);
    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.ArtifactEquipped,
        weaponType: '剑',
        maxStar: 2,
      },
    ], context)).toBe(false);
    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.ArtifactEquipped,
        weaponType: '刀',
        maxStar: 'card.star + 1',
      },
    ], context)).toBe(false);
  });

  it('keeps explicit weaponType authoritative before falling back to labels', () => {
    const context = createContext({
      triggerUnit: createUnitSource(),
      equippedArtifact: createArtifact({
        weaponType: '刀',
        labels: ['宗门飞剑'],
        gradeId: 'grade_earth_lower',
      }),
    });

    expect(areGongfaConditionsSatisfied([
      {
        type: EffectConditionType.ArtifactEquipped,
        weaponType: '剑',
        maxStar: 2,
      },
    ], context)).toBe(false);
  });
});

describe('areGongfaConditionsSatisfied unsupported condition fallbacks', () => {
  it('preserves missing trigger-unit expression fallback and Custom warning/false behavior', () => {
    const missingTriggerOutput = collectConsole(() =>
      areGongfaConditionsSatisfied([
        {
          type: EffectConditionType.ArtifactEquipped,
          maxStar: 'card.star + 1',
        },
      ], createContext({
        equippedArtifact: createArtifact({
          gradeId: 'grade_yellow_lower',
        }),
      })),
    );

    expect(missingTriggerOutput.result).toBe(false);
    expect(missingTriggerOutput.warnings).toEqual(['表达式计算需要 triggerUnit: card.star + 1']);
    expect(missingTriggerOutput.errors).toEqual([]);

    const customOutput = collectConsole(() =>
      areGongfaConditionsSatisfied([
        {
          type: EffectConditionType.Custom,
          scriptId: 'script.test_custom_condition',
        },
      ], createContext()),
    );

    expect(customOutput.result).toBe(false);
    expect(customOutput.warnings).toEqual(['自定义功法条件暂未实现：script.test_custom_condition']);
    expect(customOutput.errors).toEqual([]);
  });

  it('keeps unknown condition types false without warning', () => {
    const unknownCondition = {
      type: 'UnsupportedCondition',
    } as unknown as EffectCondition;

    const output = collectConsole(() =>
      areGongfaConditionsSatisfied([unknownCondition], createContext()),
    );

    expect(output.result).toBe(false);
    expect(output.warnings).toEqual([]);
    expect(output.errors).toEqual([]);
  });
});
