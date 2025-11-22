// 单位卡：包括灵兽、人族修士、妖族队友等
import type { BaseCard, UnitRace, LinggenElement } from "./core";
import type { CardEffect } from "./effects";

export interface UnitCard extends BaseCard {
  kind: "unit";

  /** 境界ID：引用 combat-baseline.json 中的境界配置，星级根据 realm.value 计算（最高12星） */
  realmId: string;

  /** 单位种族：灵兽、人族、妖族等 */
  race: UnitRace;

  /** 灵根：可为空或多灵根，仅作为部分效果的前置条件 */
  linggen?: LinggenElement[];

  /** 所属势力 ID，如 "sect_qingyun"、某国家/家族等 */
  factionId?: string;

  /** 攻击力：自动攻击时造成的伤害值 */
  attack: number;

  /** 生命值：可承受的伤害值，降至 0 或以下则被破坏/退出战斗 */
  health: number;

  /** 该单位的规则效果（被动、主动、反击等） */
  effects?: CardEffect[];

  /** 该单位携带的功法 ID 列表（可复用的效果定义） */
  gongfaIds?: string[];
}
