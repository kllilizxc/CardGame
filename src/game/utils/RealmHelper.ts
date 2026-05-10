/**
 * 境界辅助工具
 * 提供境界相关的查询和计算功能
 */

import type { UnitCard } from '../../../public/data/types/cards/unit';
import combatBaselineDataRaw from '../../../public/data/config/combat-baseline.json';
import type { CombatBaselineConfig } from '../../../public/data/types/combat-baseline';

export interface RealmConfigEntry {
  value: number;
  stage: string;
  phase: string;
}

export type RealmConfigLookup = Record<string, RealmConfigEntry>;

// 类型断言确保数据符合预期格式
const combatBaselineData = combatBaselineDataRaw as CombatBaselineConfig;

/**
 * 从 combat-baseline 配置构建按 realm id 查询的纯 lookup。
 */
export function buildRealmConfigLookup(config: CombatBaselineConfig): RealmConfigLookup {
  const lookup: RealmConfigLookup = {};

  config.realms.forEach(realm => {
    lookup[realm.id] = {
      value: realm.value,
      stage: realm.stage,
      phase: realm.phase
    };
  });

  return lookup;
}

// 从 canonical combat-baseline.json 构建境界配置映射表，作为无 runtime 数据时的 fallback。
const STATIC_REALM_CONFIG = buildRealmConfigLookup(combatBaselineData);
let activeRealmConfig: RealmConfigLookup = STATIC_REALM_CONFIG;

// 大境界到星级的映射
const STAGE_TO_STAR: Record<string, number> = {
  '凡人': 1,
  '炼气': 2,
  '筑基': 3,
  '金丹': 4,
  '元婴': 5,
  '化神': 6,
  '合体': 7,
  '大乘': 8
};

/**
 * 根据境界ID获取星级（1-8星，按大境界计算）
 * 星级由大境界决定，小阶段不影响星级
 */
export function getStarFromRealmId(realmId: string): number {
  const config = activeRealmConfig[realmId];
  if (!config) {
    console.warn(`Unknown realmId: ${realmId}, defaulting to 1 star`);
    return 1;
  }
  return STAGE_TO_STAR[config.stage] || 1;
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
export function getRealmConfig(realmId: string): RealmConfigEntry | undefined {
  return activeRealmConfig[realmId];
}

/**
 * 安装运行时目录加载的 combat-baseline 配置。
 * 传入 undefined/null 时回退到 checked-in static import，保留旧 helper 行为。
 */
export function installRuntimeRealmConfig(config: CombatBaselineConfig | null | undefined): void {
  activeRealmConfig = config ? buildRealmConfigLookup(config) : STATIC_REALM_CONFIG;
}

/**
 * 重置为 checked-in static combat-baseline fallback。
 * 主要用于场景重新初始化和测试隔离。
 */
export function resetRuntimeRealmConfig(): void {
  activeRealmConfig = STATIC_REALM_CONFIG;
}
