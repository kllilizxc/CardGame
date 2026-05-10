import { afterEach, describe, expect, it } from 'bun:test';

import type { ArtifactGradeConfig } from '../../../public/data/types/artifact-grade';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import {
  buildArtifactGradeLookup,
  getArtifactStar,
  getGradeConfig,
  getGradeDisplayName,
  getStarFromGradeId,
  installRuntimeArtifactGradeConfig,
  resetRuntimeArtifactGradeConfig,
} from './ArtifactHelper';

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

function createRuntimeArtifactGradeConfig(): ArtifactGradeConfig {
  return {
    description: 'runtime artifact grades fixture',
    baselineFor: 'artifact_equipment',
    grades: [
      {
        id: 'grade.runtime_upper',
        tier: '试阶',
        quality: '绝品',
        star: 9,
        value: 90,
        attackBonusMin: 9,
        attackBonusMax: 10,
        healthBonusMin: 90,
        healthBonusMax: 100,
      },
      {
        id: 'grade.runtime_lower',
        tier: '试阶',
        quality: '下品',
        star: 7,
        value: 70,
        attackBonusMin: 7,
        attackBonusMax: 8,
        healthBonusMin: 70,
        healthBonusMax: 80,
      },
    ],
  };
}

afterEach(() => {
  resetRuntimeArtifactGradeConfig();
});

describe('ArtifactHelper artifact-grade lookup contract', () => {
  it('builds a pure grade lookup keyed by canonical grade id', () => {
    const config: ArtifactGradeConfig = {
      description: 'test artifact grades',
      baselineFor: 'artifact_equipment',
      grades: [
        {
          id: 'grade.test_lower',
          tier: '试阶',
          quality: '下品',
          star: 7,
          value: 30,
          attackBonusMin: 1,
          attackBonusMax: 2,
          healthBonusMin: 3,
          healthBonusMax: 4,
        },
        {
          id: 'grade.test_upper',
          tier: '试阶',
          quality: '上品',
          star: 8,
          value: 31,
          attackBonusMin: 5,
          attackBonusMax: 6,
          healthBonusMin: 7,
          healthBonusMax: 8,
        },
      ],
    };

    expect(buildArtifactGradeLookup(config)).toEqual({
      'grade.test_lower': { value: 30, tier: '试阶', quality: '下品', star: 7 },
      'grade.test_upper': { value: 31, tier: '试阶', quality: '上品', star: 8 },
    });
    expect(config.grades[0]).toEqual({
      id: 'grade.test_lower',
      tier: '试阶',
      quality: '下品',
      star: 7,
      value: 30,
      attackBonusMin: 1,
      attackBonusMax: 2,
      healthBonusMin: 3,
      healthBonusMax: 4,
    });
  });

  it('keeps canonical star, display name, and public grade config shape unchanged', () => {
    expect(getStarFromGradeId('grade_yellow_middle')).toBe(1);
    expect(getStarFromGradeId('grade_heaven_upper')).toBe(4);
    expect(getGradeDisplayName('grade_heaven_upper')).toBe('天阶上品');
    expect(getGradeConfig('grade_earth_middle')).toEqual({
      value: 4,
      tier: '地阶',
      quality: '中品',
    });
    expect(Object.keys(getGradeConfig('grade_earth_middle') ?? {}).sort()).toEqual([
      'quality',
      'tier',
      'value',
    ]);

    const artifact = {
      kind: 'artifact',
      gradeId: 'grade_divine_lower',
    } as ArtifactCard;
    expect(getArtifactStar(artifact)).toBe(6);
  });

  it('lets a runtime artifact-grade config replace the active helper cache without Phaser scene cache', () => {
    installRuntimeArtifactGradeConfig(createRuntimeArtifactGradeConfig());

    expect(getStarFromGradeId('grade.runtime_upper')).toBe(9);
    expect(getGradeDisplayName('grade.runtime_upper')).toBe('试阶绝品');
    expect(getGradeConfig('grade.runtime_upper')).toEqual({
      value: 90,
      tier: '试阶',
      quality: '绝品',
    });
    expect(Object.keys(getGradeConfig('grade.runtime_upper') ?? {}).sort()).toEqual([
      'quality',
      'tier',
      'value',
    ]);
    expect(getGradeConfig('grade_yellow_middle')).toBeUndefined();

    const runtimeArtifact = {
      kind: 'artifact',
      gradeId: 'grade.runtime_upper',
    } as ArtifactCard;
    expect(getArtifactStar(runtimeArtifact)).toBe(9);
  });

  it('falls back to the static artifact-grade import when runtime config is reset or absent', () => {
    installRuntimeArtifactGradeConfig(createRuntimeArtifactGradeConfig());
    resetRuntimeArtifactGradeConfig();

    expect(getGradeConfig('grade.runtime_upper')).toBeUndefined();
    expect(getGradeDisplayName('grade_heaven_upper')).toBe('天阶上品');

    installRuntimeArtifactGradeConfig(undefined);

    expect(getStarFromGradeId('grade_yellow_middle')).toBe(1);
    expect(getGradeConfig('grade_earth_middle')).toEqual({
      value: 4,
      tier: '地阶',
      quality: '中品',
    });
  });

  it('keeps unknown grade fallback behavior unchanged', () => {
    let unknownStar = 0;
    const warnings = collectWarnings(() => {
      unknownStar = getStarFromGradeId('grade.unknown');
    });

    expect(unknownStar).toBe(1);
    expect(getGradeConfig('grade.unknown')).toBeUndefined();
    expect(getGradeDisplayName('grade.unknown')).toBe('未知品级');
    expect(warnings).toEqual(['Unknown gradeId: grade.unknown, defaulting to 1 star']);
  });
});
