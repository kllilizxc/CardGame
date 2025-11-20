// 玩家技能：如“注定一抽”“灵兽融合”等
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";

export type SkillCooldownType = "perBattle" | "perTurn" | "custom";

export interface SkillCard extends BaseCard {
  kind: "skill";

  cooldownType: SkillCooldownType;
  /** 冷却值：
   *  - perBattle：可不填，表示整场一次
   *  - perTurn：每回合可用次数，可选
   *  - custom：由脚本决定的特殊冷却
   */
  cooldownValue?: number;

  effects: CardEffect[];
}
