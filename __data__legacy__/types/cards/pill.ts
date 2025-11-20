// 丹药卡：战斗内一次性消耗道具，效果偏增益/回复/控制，类似杀戮尖塔中的药水
import type { BaseCard } from "./core";
import type { CardEffect } from "./effects";
import type { TalismanTarget } from "./talisman";

export type PillGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PillCard extends BaseCard {
  kind: "pill";

  /** 丹药品阶：一至九品 */
  grade: PillGrade;

  /** 是否立刻使用后进入弃牌/药瓶槽空位（通常为 true） */
  isInstant: boolean;

  /** 可选：若有持续效果，持续的回合数 */
  duration?: number;

  /** 目标范围：默认可以作用于玩家或单位，细节由效果文本描述 */
  target: TalismanTarget;

  /** 战斗内效果描述（自然语言 + 脚本映射） */
  effects: CardEffect[];
}
