/**
 * 法器辅助工具
 * 提供法器品级相关的查询和计算功能
 */

import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import artifactGradeDataRaw from '../../../public/data/config/artifact-grade.json';
import type { ArtifactGradeConfig } from '../../../public/data/types/artifact-grade';

// 类型断言确保数据符合预期格式
const artifactGradeData = artifactGradeDataRaw as ArtifactGradeConfig;

// 从 artifact-grade.json 构建品级配置映射表
const GRADE_CONFIG: Record<string, { value: number; tier: string; quality: string }> = {};

// 初始化品级配置映射
artifactGradeData.grades.forEach(grade => {
  GRADE_CONFIG[grade.id] = {
    value: grade.value,
    tier: grade.tier,
    quality: grade.quality
  };
});

/**
 * 根据品级ID获取星级（1-12星）
 * 星级 = min(grade.value + 1, 12)
 */
export function getStarFromGradeId(gradeId: string): number {
  const config = GRADE_CONFIG[gradeId];
  if (!config) {
    console.warn(`Unknown gradeId: ${gradeId}, defaulting to 1 star`);
    return 1;
  }
  return Math.min(config.value + 1, 12);
}

/**
 * 从法器卡数据获取星级
 */
export function getArtifactStar(artifact: ArtifactCard): number {
  return getStarFromGradeId(artifact.gradeId);
}

/**
 * 根据品级ID获取品级配置
 */
export function getGradeConfig(gradeId: string) {
  return GRADE_CONFIG[gradeId];
}

/**
 * 获取品级完整显示名称（如：黄阶下品、天阶上品）
 */
export function getGradeDisplayName(gradeId: string): string {
  const config = GRADE_CONFIG[gradeId];
  if (!config) {
    return '未知品级';
  }
  return `${config.tier}${config.quality}`;
}
