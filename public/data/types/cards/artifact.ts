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

export interface ArtifactCard extends BaseCard {
  kind: "artifact";

  /** 品级ID：引用 artifact-grade.json 中的品级配置，星级根据 grade.value 计算（最高12星） */
  gradeId: string;

  /** 装备对象：通常是单位，将来可扩展到玩家本体 */
  equipTarget: "unit" | "player";

  /** 武器类型：仅对武器类法器必填，用于判定剑器等逻辑 */
  weaponType?: ArtifactWeaponType;

  /** 耐久度（可选），为 0 时法器失效或破碎 */
  durability?: number;

  /** 基础数值加成 */
  attackBonus?: number;
  healthBonus?: number;

  /** 装备后或作为场上持续卡时提供的效果 */
  effects?: CardEffect[];
}
