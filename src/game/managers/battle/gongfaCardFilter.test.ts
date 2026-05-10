import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { FieldCard } from '@data/types/cards/field';
import type { UnitCard } from '@data/types/cards/unit';
import type { CardFilter } from '@data/types/gongfa';
import { extractGongfaWeaponTypeFromLabels, isGongfaCardFilterMatch } from './gongfaCardFilter';

function createArtifact(
  id: string,
  gradeId: string,
  labels: string[],
  weaponType?: ArtifactCard['weaponType'],
): ArtifactCard {
  return {
    id,
    name: id,
    kind: 'artifact',
    description: id,
    rarity: 'common',
    labels,
    gradeId,
    equipTarget: 'unit',
    weaponType,
    elements: ['金'],
  };
}

function createUnit(id: string, realmId: string, labels: string[] = []): UnitCard {
  return {
    id,
    name: id,
    kind: 'unit',
    description: id,
    rarity: 'common',
    labels,
    realmId,
    race: '人族',
    attack: 1,
    health: 1,
  };
}

function createField(id: string): FieldCard {
  return {
    id,
    name: id,
    kind: 'field',
    description: id,
    rarity: 'common',
    symmetric: false,
    effects: [],
  };
}

describe('isGongfaCardFilterMatch', () => {
  it('uses gongfa maxStar expressions to compare candidate artifact stars against trigger card star', () => {
    const filter: CardFilter = {
      kind: ['artifact'],
      labelsAnyOf: ['飞剑'],
      weaponTypesAnyOf: ['剑'],
      maxStar: 'card.star + 1',
    };

    expect(
      isGongfaCardFilterMatch(
        createArtifact('artifact.mystic_sword', 'grade_mystic_lower', ['飞剑']),
        filter,
        { cardStar: 2 },
      ),
    ).toBe(true);
    expect(
      isGongfaCardFilterMatch(
        createArtifact('artifact.heaven_sword', 'grade_heaven_lower', ['飞剑']),
        filter,
        { cardStar: 2 },
      ),
    ).toBe(false);
  });

  it('keeps explicit artifact weaponType authoritative before label fallback', () => {
    const filter: CardFilter = {
      kind: ['artifact'],
      weaponTypesAnyOf: ['剑'],
    };

    expect(
      isGongfaCardFilterMatch(
        createArtifact('artifact.label_sword', 'grade_yellow_lower', ['青锋剑']),
        filter,
      ),
    ).toBe(true);
    expect(
      isGongfaCardFilterMatch(
        createArtifact('artifact.knife_named_sword', 'grade_yellow_lower', ['青锋剑'], '刀'),
        filter,
      ),
    ).toBe(false);
  });

  it('applies numeric maxStar to unit candidates', () => {
    const filter: CardFilter = {
      kind: ['unit'],
      maxStar: 2,
    };

    expect(isGongfaCardFilterMatch(createUnit('unit.qi', 'realm_qi_1'), filter)).toBe(true);
    expect(isGongfaCardFilterMatch(createUnit('unit.foundation', 'realm_foundation_early'), filter)).toBe(false);
  });

  it('does not match unstarred card kinds when a maxStar boundary is present', () => {
    expect(
      isGongfaCardFilterMatch(
        createField('field.test'),
        { maxStar: 2 },
      ),
    ).toBe(false);
  });

  it('surfaces invalid maxStar expressions through the shared gongfa expression parser', () => {
    expect(() =>
      isGongfaCardFilterMatch(
        createArtifact('artifact.sword', 'grade_yellow_lower', ['剑器']),
        { maxStar: 'card.attack + 1' },
        { cardStar: 2 },
      ),
    ).toThrow();
  });
});

describe('extractGongfaWeaponTypeFromLabels', () => {
  it('extracts known weapon types from labels without runtime state', () => {
    expect(extractGongfaWeaponTypeFromLabels(['宗门飞剑', '旧物'])).toBe('剑');
    expect(extractGongfaWeaponTypeFromLabels(['丹药'])).toBeUndefined();
  });
});
