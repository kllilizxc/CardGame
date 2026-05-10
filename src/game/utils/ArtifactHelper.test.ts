import { describe, expect, it } from 'bun:test';

import type { ArtifactGradeConfig } from '../../../public/data/types/artifact-grade';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import {
  buildArtifactGradeLookup,
  getArtifactStar,
  getGradeConfig,
  getGradeDisplayName,
  getStarFromGradeId,
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
