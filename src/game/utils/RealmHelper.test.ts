import { afterEach, describe, expect, it } from 'bun:test';

import type { CombatBaselineConfig } from '../../../public/data/types/combat-baseline';
import type { UnitCard } from '../../../public/data/types/cards/unit';
import {
  buildRealmConfigLookup,
  getRealmConfig,
  getStarFromRealmId,
  getUnitStar,
  installRuntimeRealmConfig,
  resetRuntimeRealmConfig,
} from './RealmHelper';

function collectWarnings(run: () => void): string[] {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };

  try {
    run();
  } finally {
    console.warn = originalWarn;
  }

  return warnings;
}

function createRuntimeRealmConfig(): CombatBaselineConfig {
  return {
    description: 'runtime combat baseline fixture',
    baselineFor: 'normal_unit',
    realms: [
      {
        id: 'realm.runtime_mahayana',
        stage: '大乘',
        phase: '圆满',
        value: 99,
        attackMin: 700,
        attackMax: 900,
        healthMin: 3600,
        healthMax: 4600,
      },
      {
        id: 'realm.runtime_qi',
        stage: '炼气',
        phase: 'runtime',
        value: 1,
        attackMin: 4,
        attackMax: 6,
        healthMin: 20,
        healthMax: 30,
      },
    ],
  };
}

afterEach(() => {
  resetRuntimeRealmConfig();
});

describe('RealmHelper combat-baseline lookup contract', () => {
  it('builds a pure realm lookup keyed by canonical realm id', () => {
    const config: CombatBaselineConfig = {
      description: 'test combat baseline',
      baselineFor: 'normal_unit',
      realms: [
        {
          id: 'realm.test_qi',
          stage: '炼气',
          phase: '1层',
          value: 1,
          attackMin: 4,
          attackMax: 6,
          healthMin: 20,
          healthMax: 30,
        },
        {
          id: 'realm.test_foundation',
          stage: '筑基',
          phase: '中期',
          value: 5,
          attackMin: 14,
          attackMax: 18,
          healthMin: 70,
          healthMax: 90,
        },
      ],
    };

    expect(buildRealmConfigLookup(config)).toEqual({
      'realm.test_qi': { value: 1, stage: '炼气', phase: '1层' },
      'realm.test_foundation': { value: 5, stage: '筑基', phase: '中期' },
    });
    expect(config.realms[0]).toEqual({
      id: 'realm.test_qi',
      stage: '炼气',
      phase: '1层',
      value: 1,
      attackMin: 4,
      attackMax: 6,
      healthMin: 20,
      healthMax: 30,
    });
  });

  it('keeps canonical stage-based stars and realm config display shape unchanged', () => {
    expect(getStarFromRealmId('realm_mortal')).toBe(1);
    expect(getStarFromRealmId('realm_qi_1')).toBe(2);
    expect(getStarFromRealmId('realm_foundation_late')).toBe(3);
    expect(getStarFromRealmId('realm_golden_mid')).toBe(4);
    expect(getStarFromRealmId('realm_mahayana_late')).toBe(8);
    expect(getRealmConfig('realm_foundation_mid')).toEqual({
      value: 5,
      stage: '筑基',
      phase: '中期',
    });

    const unit = {
      kind: 'unit',
      realmId: 'realm_golden_late',
    } as UnitCard;
    expect(getUnitStar(unit)).toBe(4);
  });

  it('lets a runtime combat-baseline config replace the active helper cache without Phaser scene cache', () => {
    installRuntimeRealmConfig(createRuntimeRealmConfig());

    expect(getRealmConfig('realm.runtime_mahayana')).toEqual({
      value: 99,
      stage: '大乘',
      phase: '圆满',
    });
    expect(getStarFromRealmId('realm.runtime_mahayana')).toBe(8);
    expect(getStarFromRealmId('realm.runtime_qi')).toBe(2);
    expect(getRealmConfig('realm_qi_1')).toBeUndefined();

    const runtimeUnit = {
      kind: 'unit',
      realmId: 'realm.runtime_mahayana',
    } as UnitCard;
    expect(getUnitStar(runtimeUnit)).toBe(8);
  });

  it('falls back to the static combat-baseline import when runtime config is reset or absent', () => {
    installRuntimeRealmConfig(createRuntimeRealmConfig());
    resetRuntimeRealmConfig();

    expect(getRealmConfig('realm.runtime_mahayana')).toBeUndefined();
    expect(getRealmConfig('realm_foundation_mid')).toEqual({
      value: 5,
      stage: '筑基',
      phase: '中期',
    });

    installRuntimeRealmConfig(undefined);

    expect(getStarFromRealmId('realm_qi_1')).toBe(2);
    expect(getRealmConfig('realm_qi_1')).toEqual({
      value: 1,
      stage: '炼气',
      phase: '1层',
    });
  });

  it('keeps unknown realm fallback behavior unchanged', () => {
    let unknownStar = 0;
    const warnings = collectWarnings(() => {
      unknownStar = getStarFromRealmId('realm.unknown');
    });

    expect(unknownStar).toBe(1);
    expect(getRealmConfig('realm.unknown')).toBeUndefined();
    expect(warnings).toEqual(['Unknown realmId: realm.unknown, defaulting to 1 star']);
  });
});
