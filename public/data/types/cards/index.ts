// 汇总导出：核心/效果/各类卡牌类型
import type { ArtifactCard } from "./artifact";
import type { FieldCard } from "./field";
import type { PillCard } from "./pill";
import type { TalismanCard } from "./talisman";
import type { UnitCard } from "./unit";

export * from "./core";
export * from "./effects";
export * from "./unit";
export * from "./artifact";
export * from "./talisman";
export * from "./field";
export * from "./skill";
export * from "./pill";

// 可渲染/可交互的战斗卡牌联合类型（不含技能卡）
export type AnyCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;
