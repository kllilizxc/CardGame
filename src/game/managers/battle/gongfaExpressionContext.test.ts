import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import { evaluateGongfaNumberExpression } from './gongfaExpression';
import { buildGongfaExpressionContext } from './gongfaExpressionContext';

function createUnit(overrides: Partial<UnitCard> = {}): UnitCard {
  return {
    id: 'unit.test_expression_context_owner',
    name: '表达式修士',
    kind: 'unit',
    description: 'test unit',
    rarity: 'common',
    realmId: 'realm_qi_1',
    race: '人族',
    attack: 4,
    health: 20,
    ...overrides,
  } as UnitCard;
}

function createArtifact(overrides: Partial<ArtifactCard> = {}): ArtifactCard {
  return {
    id: 'artifact.test_expression_context_weapon',
    name: '表达式法器',
    kind: 'artifact',
    description: 'test artifact',
    rarity: 'common',
    gradeId: 'grade_earth_lower',
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
    ...overrides,
  } as ArtifactCard;
}

describe('buildGongfaExpressionContext', () => {
  it('maps the trigger unit realm to card.star for the restricted expression parser', () => {
    const context = buildGongfaExpressionContext({
      triggerUnit: createUnit({ realmId: 'realm_foundation_early' }),
    });

    expect(context).toEqual({ cardStar: 3, artifactStar: 0 });
    expect(evaluateGongfaNumberExpression('card.star + 1', context!)).toBe(4);
  });

  it('maps the equipped artifact grade to artifact.star without changing expression syntax', () => {
    const context = buildGongfaExpressionContext({
      triggerUnit: createUnit(),
      equippedArtifact: createArtifact({ gradeId: 'grade_mystic_lower' }),
    });

    expect(context).toEqual({ cardStar: 2, artifactStar: 3 });
    expect(evaluateGongfaNumberExpression('artifact.star * 2', context!)).toBe(6);
    expect(() => evaluateGongfaNumberExpression('artifact.grade + 1', context!)).toThrow();
  });

  it('defaults artifact.star to 0 when the caller has no equipped artifact', () => {
    const context = buildGongfaExpressionContext({
      triggerUnit: createUnit({ realmId: 'realm_qi_1' }),
    });

    expect(context).toEqual({ cardStar: 2, artifactStar: 0 });
    expect(evaluateGongfaNumberExpression('artifact.star * 2', context!)).toBe(0);
  });

  it('leaves missing trigger-unit fallback policy to callers', () => {
    expect(buildGongfaExpressionContext({
      equippedArtifact: createArtifact({ gradeId: 'grade_heaven_lower' }),
    })).toBeUndefined();
  });
});
