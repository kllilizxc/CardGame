/**
 * 战斗基准配置类型定义
 */

export interface RealmBaseline {
  /** 境界唯一ID */
  id: string;
  /** 大境界名称 */
  stage: string;
  /** 小阶段名称 */
  phase: string;
  /** 境界数值（用于计算星级等） */
  value: number;
  /** 推荐攻击力最小值 */
  attackMin: number;
  /** 推荐攻击力最大值 */
  attackMax: number;
  /** 推荐生命值最小值 */
  healthMin: number;
  /** 推荐生命值最大值 */
  healthMax: number;
}

export interface CombatBaselineConfig {
  description: string;
  baselineFor: string;
  realms: RealmBaseline[];
}
