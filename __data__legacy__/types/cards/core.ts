// 卡牌与战斗相关的核心类型定义
// 说明：这里偏设计文档，后续可以根据实际代码结构拆分与精简。

// 卡牌大类
export type CardKind =
  | "unit"      // 单位：灵兽、人族修士、妖族等战斗单位
  | "artifact"  // 法器：装备或场上道具
  | "talisman"  // 符箓：一次性或短期法术
  | "field"     // 法阵：场地/环境类
  | "skill"     // 玩家技能：如“注定一抽”“灵兽融合”
  | "pill";     // 丹药：战斗内一次性消耗道具（类似杀戮尖塔药水）

// 卡牌稀有度（可与世界观中的等级/品阶松散对应）
export type CardRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

// 单位种族：用于区分是灵兽、人族修士、妖族等
export type UnitRace =
  | "虫族"
  | "兽族"
  | "飞禽族"
  | "鳞族"
  | "龙族"
  | "灵植族"
  | "妖族"     // 泛指成妖的各类存在
  | "鬼族"
  | "傀儡族"
  | "灵体族"
  | "人族"     // 人类修士/凡人
  | "其他";    // 预留：特殊存在

// 灵根属性，仅作为标签，不直接做属性克制
export type LinggenElement = "金" | "木" | "水" | "火" | "土";

// 统一的境界大阶段
// 按世界设定：凡界修士/各族通用：炼气期 → 筑基期 → 金丹期 → 元婴期 → 化神期 → 合体期 → 大乘期
export type RealmStage =
  | "凡人"
  | "炼气期"
  | "筑基期"
  | "金丹期"
  | "元婴期"
  | "化神期"
  | "合体期"
  | "大乘期";

// 每个大境界可细分为前 / 中 / 后期
export type RealmPhase = "初期" | "中期" | "后期";

// 结构化境界信息：大境界 + 小阶段 + 数值，用于排序/比较
// value 约定：数值越大境界越高，可以直接做比较和相减（例如：金丹期后期 > 炼气期初期）。
export interface Realm {
  stage: RealmStage;
  phase?: RealmPhase;
  /** 总体数值等级，用于排序和计算差距（同一体系内自洽即可） */
  value: number;
}

// 通用卡牌基础信息
export interface BaseCard {
  /** 全局唯一 ID，如 "CR_001" */
  id: string;
  /** 卡牌名称 */
  name: string;
  /** 卡牌大类 */
  kind: CardKind;
  /** 对玩家可见的效果描述 */
  description: string;

  rarity: CardRarity;
  /** 关键字段标签：阵营/地区/身份等关键字，用于效果触发与条件判断 */
  labels?: string[];

  /** 在一副牌组中允许的最大数量（默认 3，可按需覆盖） */
  limitPerDeck?: number;
}
