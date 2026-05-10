/**
 * 法器辅助工具
 * 提供法器品级相关的查询和计算功能
 */

import type { ArtifactCard, ArtifactElement } from '../../../public/data/types/cards/artifact';
import artifactGradeDataRaw from '../../../public/data/config/artifact-grade.json';
import type { ArtifactGradeConfig } from '../../../public/data/types/artifact-grade';

export interface ArtifactGradeDisplayConfig {
  value: number;
  tier: string;
  quality: string;
}

export interface ArtifactGradeLookupEntry extends ArtifactGradeDisplayConfig {
  star: number;
}

export type ArtifactGradeLookup = Record<string, ArtifactGradeLookupEntry>;

// 类型断言确保数据符合预期格式
const artifactGradeData = artifactGradeDataRaw as ArtifactGradeConfig;

/**
 * 从 artifact-grade 配置构建按 grade id 查询的纯 lookup。
 */
export function buildArtifactGradeLookup(config: ArtifactGradeConfig): ArtifactGradeLookup {
  const lookup: ArtifactGradeLookup = {};

  config.grades.forEach(grade => {
    lookup[grade.id] = {
      value: grade.value,
      tier: grade.tier,
      quality: grade.quality,
      star: grade.star
    };
  });

  return lookup;
}

function buildArtifactGradeDisplayConfig(
  lookup: ArtifactGradeLookup
): Record<string, ArtifactGradeDisplayConfig> {
  const displayConfig: Record<string, ArtifactGradeDisplayConfig> = {};

  Object.entries(lookup).forEach(([gradeId, grade]) => {
    displayConfig[gradeId] = {
      value: grade.value,
      tier: grade.tier,
      quality: grade.quality
    };
  });

  return displayConfig;
}

// 从 canonical artifact-grade.json 构建品级配置映射表，作为无 runtime 数据时的 fallback。
const STATIC_GRADE_LOOKUP = buildArtifactGradeLookup(artifactGradeData);
const STATIC_GRADE_CONFIG = buildArtifactGradeDisplayConfig(STATIC_GRADE_LOOKUP);
let activeGradeLookup: ArtifactGradeLookup = STATIC_GRADE_LOOKUP;
let activeGradeConfig: Record<string, ArtifactGradeDisplayConfig> = STATIC_GRADE_CONFIG;

/**
 * 根据品级ID获取星级（1-6星，按品阶计算）
 * 星级由品阶决定，品质不影响星级
 */
export function getStarFromGradeId(gradeId: string): number {
  const config = activeGradeLookup[gradeId];
  if (!config) {
    console.warn(`Unknown gradeId: ${gradeId}, defaulting to 1 star`);
    return 1;
  }
  return config.star;
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
export function getGradeConfig(gradeId: string): ArtifactGradeDisplayConfig | undefined {
  return activeGradeConfig[gradeId];
}

/**
 * 获取品级完整显示名称（如：黄阶下品、天阶上品）
 */
export function getGradeDisplayName(gradeId: string): string {
  const config = activeGradeConfig[gradeId];
  if (!config) {
    return '未知品级';
  }
  return `${config.tier}${config.quality}`;
}

/**
 * 安装运行时目录加载的 artifact-grade 配置。
 * 传入 undefined/null 时回退到 checked-in static import，保留旧 helper 行为。
 */
export function installRuntimeArtifactGradeConfig(config: ArtifactGradeConfig | null | undefined): void {
  if (!config) {
    resetRuntimeArtifactGradeConfig();
    return;
  }

  activeGradeLookup = buildArtifactGradeLookup(config);
  activeGradeConfig = buildArtifactGradeDisplayConfig(activeGradeLookup);
}

/**
 * 重置为 checked-in static artifact-grade fallback。
 * 主要用于场景重新初始化和测试隔离。
 */
export function resetRuntimeArtifactGradeConfig(): void {
  activeGradeLookup = STATIC_GRADE_LOOKUP;
  activeGradeConfig = STATIC_GRADE_CONFIG;
}

/**
 * 获取法器属性显示文本
 * @param elements 法器属性数组
 * @returns 属性显示文本（如："金"、"木水"、"金木水火土"）
 */
export function getElementsDisplayText(elements: ArtifactElement[]): string {
  if (!elements || elements.length === 0) {
    return '无属性';
  }
  return elements.join('');
}

/**
 * 获取法器属性颜色
 * @param element 单个属性
 * @returns 十六进制颜色值
 */
export function getElementColor(element: ArtifactElement): number {
  const colorMap: Record<ArtifactElement, number> = {
    '金': 0xFFD700, // 金色
    '木': 0x228B22, // 绿色
    '水': 0x1E90FF, // 蓝色
    '火': 0xFF4500, // 红色
    '土': 0x8B4513  // 棕色
  };
  return colorMap[element] || 0xFFFFFF;
}

/**
 * 检查法器是否包含指定属性
 * @param artifact 法器卡数据
 * @param element 要检查的属性
 */
export function hasElement(artifact: ArtifactCard, element: ArtifactElement): boolean {
  return artifact.elements?.includes(element) || false;
}

/**
 * 检查法器是否包含所有指定属性
 * @param artifact 法器卡数据
 * @param elements 要检查的属性数组
 */
export function hasAllElements(artifact: ArtifactCard, elements: ArtifactElement[]): boolean {
  if (!artifact.elements) return false;
  return elements.every(element => artifact.elements.includes(element));
}

/**
 * 检查法器是否包含任一指定属性
 * @param artifact 法器卡数据
 * @param elements 要检查的属性数组
 */
export function hasAnyElement(artifact: ArtifactCard, elements: ArtifactElement[]): boolean {
  if (!artifact.elements) return false;
  return elements.some(element => artifact.elements.includes(element));
}
