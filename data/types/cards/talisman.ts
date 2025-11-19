// 符箓卡：一次性或短期法术
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";

export type TalismanTarget =
  | "unit"
  | "player"
  | "allUnits"
  | "all";

export interface TalismanCard extends BaseCard {
  kind: "talisman";

  /** 是否使用后立即结算并弃置 */
  isInstant: boolean;

  /** 若为持续效果，持续的回合数（可选） */
  duration?: number;

  /** 目标范围（规则层级的粗略描述） */
  target: TalismanTarget;

  effects: CardEffect[];
}
