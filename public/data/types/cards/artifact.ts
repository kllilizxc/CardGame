// 法器卡：装备或场上持续道具
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";

export type ArtifactWeaponType =
  | '剑'
  | '刀'
  | '鞭'
  | '枪'
  | '锤'
  | '弓'
  | '尺'
  | '印'
  | '棍'
  | '棒'
  | '毒'
  | '琴'
  | '笛子'
  | '拳套'
  | '符箓'
  | '斧头'
  | '匕首'
  | '飞镖'
  | '扇子';

/**
 * 法器属性（五行）
 * 每个法器可以有1-5种属性
 * - 低级法器（黄阶、地阶）：基本都是单属性
 * - 中级法器（玄阶、天阶）：1-2种属性
 * - 高级法器（仙阶、神阶）：1-3种属性
 * - 属性越多越稀有，但不一定等级越高属性越多（可能专注于一种属性）
 */
export type ArtifactElement = '金' | '木' | '水' | '火' | '土';

export interface ArtifactCard extends BaseCard {
  kind: "artifact";

  /** 品级ID：引用 artifact-grade.json 中的品级配置，星级根据 grade.value 计算（最高12星） */
  gradeId: string;

  /** 装备对象：通常是单位，将来可扩展到玩家本体 */
  equipTarget: "unit" | "player";

  /** 武器类型：仅对武器类法器必填，用于判定剑器等逻辑 */
  weaponType?: ArtifactWeaponType;

  /** 
   * 法器属性（五行）
   * 可以有1-5种属性，属性越多越稀有
   * 低级法器通常单属性，高级法器可能多属性或专注单属性
   */
  elements: ArtifactElement[];

  /** 基础数值加成 */
  attackBonus?: number;
  healthBonus?: number;

  /** 耐久度：使用次数限制，耗尽后法器损坏 */
  durability?: number;

  /** 装备后或作为场上持续卡时提供的效果 */
  effects?: CardEffect[];
}
