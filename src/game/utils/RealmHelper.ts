/**
 * 境界辅助工具
 * 提供境界相关的查询和计算功能
 */

import type { UnitCard } from '../../../public/data/types/cards/unit';
import combatBaselineDataRaw from '../../../public/data/config/combat-baseline.json';
import type { CombatBaselineConfig } from '../../../public/data/types/combat-baseline';

// 类型断言确保数据符合预期格式
const combatBaselineData = combatBaselineDataRaw as CombatBaselineConfig;

// 从 combat-baseline.json 构建境界配置映射表
const REALM_CONFIG: Record<string, { value: number; stage: string; phase: string }> = {};

// 初始化境界配置映射
combatBaselineData.realms.forEach(realm => {
  REALM_CONFIG[realm.id] = {
    value: realm.value,
    stage: realm.stage,
    phase: realm.phase
  };
});

/**
 * 根据境界ID获取星级（1-12星）
 * 星级 = min(realm.value + 1, 12)
 */
export function getStarFromRealmId(realmId: string): number {
  const config = REALM_CONFIG[realmId];
  if (!config) {
    console.warn(`Unknown realmId: ${realmId}, defaulting to 1 star`);
    return 1;
  }
  return Math.min(config.value + 1, 12);
}

/**
 * 从单位卡数据获取星级
 */
export function getUnitStar(unit: UnitCard): number {
  return getStarFromRealmId(unit.realmId);
}

/**
 * 根据境界ID获取境界配置
 */
export function getRealmConfig(realmId: string) {
  return REALM_CONFIG[realmId];
}
