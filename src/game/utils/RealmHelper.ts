/**
 * 境界辅助工具
 * 提供境界相关的查询和计算功能
 */

import type { UnitCard } from '../../../public/data/types/cards/unit';

// 境界配置映射表（与 combat-baseline.json 对应）
const REALM_CONFIG: Record<string, { value: number; stage: string; phase: string }> = {
  'realm_mortal': { value: 0, stage: '凡人', phase: '' },
  'realm_qi_1': { value: 1, stage: '炼气', phase: '1层' },
  'realm_qi_6': { value: 2, stage: '炼气', phase: '6层' },
  'realm_qi_12': { value: 3, stage: '炼气', phase: '12层' },
  'realm_foundation_early': { value: 4, stage: '筑基', phase: '初期' },
  'realm_foundation_mid': { value: 5, stage: '筑基', phase: '中期' },
  'realm_foundation_late': { value: 6, stage: '筑基', phase: '后期' },
  'realm_golden_early': { value: 7, stage: '金丹', phase: '初期' },
  'realm_golden_mid': { value: 8, stage: '金丹', phase: '中期' },
  'realm_golden_late': { value: 9, stage: '金丹', phase: '后期' },
  'realm_nascent_early': { value: 10, stage: '元婴', phase: '初期' },
  'realm_nascent_mid': { value: 11, stage: '元婴', phase: '中期' },
  'realm_nascent_late': { value: 12, stage: '元婴', phase: '后期' },
  'realm_spirit_early': { value: 13, stage: '化神', phase: '初期' },
  'realm_spirit_mid': { value: 14, stage: '化神', phase: '中期' },
  'realm_spirit_late': { value: 15, stage: '化神', phase: '后期' },
  'realm_unity_early': { value: 16, stage: '合体', phase: '初期' },
  'realm_unity_mid': { value: 17, stage: '合体', phase: '中期' },
  'realm_unity_late': { value: 18, stage: '合体', phase: '后期' },
  'realm_mahayana_early': { value: 19, stage: '大乘', phase: '初期' },
  'realm_mahayana_mid': { value: 20, stage: '大乘', phase: '中期' },
  'realm_mahayana_late': { value: 21, stage: '大乘', phase: '后期' },
};

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
