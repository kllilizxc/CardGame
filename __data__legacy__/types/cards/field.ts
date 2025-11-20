// 法阵卡：场地类，改变整体环境
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";

export interface FieldCard extends BaseCard {
  kind: "field";

  /** 是否对双方对称生效（双刃剑） */
  symmetric: boolean;

  /** 在场时生效的效果 */
  effects: CardEffect[];
}
