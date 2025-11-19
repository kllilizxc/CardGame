// 汇总类型：任意卡牌
import type { UnitCard } from "./unit";
import type { ArtifactCard } from "./artifact";
import type { TalismanCard } from "./talisman";
import type { FieldCard } from "./field";
import type { SkillCard } from "./skill";
import type { PillCard } from "./pill";

export type AnyCard =
  | UnitCard
  | ArtifactCard
  | TalismanCard
  | FieldCard
  | SkillCard
  | PillCard;
