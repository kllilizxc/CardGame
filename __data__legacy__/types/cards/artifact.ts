// 法器卡：装备或场上持续道具
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";

export interface ArtifactCard extends BaseCard {
  kind: "artifact";

  /** 装备对象：通常是单位，将来可扩展到玩家本体 */
  equipTarget: "unit" | "player";

  /** 耐久度（可选），为 0 时法器失效或破碎 */
  durability?: number;

  /** 基础数值加成 */
  attackBonus?: number;
  healthBonus?: number;

  /** 装备后或作为场上持续卡时提供的效果 */
  effects?: CardEffect[];
}
