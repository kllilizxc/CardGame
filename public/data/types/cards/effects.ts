// 卡牌效果相关类型

// 卡牌效果触发时机（粗粒度，便于描述与脚本映射）
export type EffectTiming =
  | "onSummon"    // 进入场上时
  | "onDeath"     // 离场/被破坏时
  | "onAttack"    // 攻击时（前/后，可在 text 中说明）
  | "turnStart"   // 我方回合开始时
  | "turnEnd"     // 我方回合结束时
  | "reaction";   // 反击/响应触发

// 效果目标类型：自己 / 我方单位 / 敌方单位 / 双方等
export type EffectTargetScope =
  | "self"           // 效果来源自身
  | "ownerPlayer"    // 持有该卡的玩家
  | "allyUnits"      // 我方全部单位
  | "enemyUnits"     // 敌方全部单位
  | "singleAlly"     // 指定一个我方单位
  | "singleEnemy"    // 指定一个敌方单位
  | "allUnits"       // 场上全部单位
  | "none";          // 无直接目标，例如抽牌、修改全局状态

export interface EffectTarget {
  scope: EffectTargetScope;
  /** 可选：通过 labels / race / realm 等进一步过滤目标 */
  requiredLabelsAllOf?: string[];
  requiredLabelsAnyOf?: string[];
}

// 条件类型：简单可组合的前置条件
export type EffectConditionType =
  | "hasLabel"        // 目标或来源拥有某个 label
  | "realmDiffAtLeast"// 双方境界差至少 N
  | "unitCountAtLeast"// 场上单位数量至少 N
  | "hasCardInHand"   // 手牌中存在某类卡
  | "custom";         // 复杂条件交给脚本

export interface EffectCondition {
  type: EffectConditionType;
  /** 条件涉及的标签（如宗门/身份等） */
  labels?: string[];
  /** 用于数值条件，如境界差、数量等 */
  value?: number;
  /** 自定义条件 ID，由脚本处理 */
  scriptId?: string;
}

// 动作类型：增减数值、抽牌、状态改变等
export type EffectActionType =
  | "modifyAttack"     // 修改攻击力
  | "modifyHealth"     // 修改生命值
  | "drawCards"        // 抽牌
  | "healPlayer"       // 回复玩家生命
  | "damagePlayer"     // 对玩家造成伤害
  | "applyStatus"      // 施加状态（如护盾、易伤等）
  | "destroyUnit"      // 摧毁单位
  | "custom";          // 交由脚本处理的特殊动作

export interface EffectAction {
  type: EffectActionType;
  /** 数值变化量，如 +1 攻击、+2 抽牌等 */
  value?: number;
  /** 状态 ID，如 "shield"、"vulnerable" 等 */
  statusId?: string;
  /** 自定义动作 ID，由脚本具体实现 */
  scriptId?: string;
}

// 效果结构：结构化 + 文本 + 脚本映射
export interface CardEffect {
  id?: string;
  timing: EffectTiming;

  /** 目标定义：作用于谁 */
  target?: EffectTarget;

  /** 生效前需要满足的条件列表（全部满足时效果触发） */
  conditions?: EffectCondition[];

  /** 实际执行的动作列表，可以组合多个动作 */
  actions?: EffectAction[];

  /** 规则说明的自然语言描述，便于策划与 AI 使用 */
  text: string;

  /** 对应代码实现的脚本/函数 ID，后续可用于整体执行逻辑 */
  scriptId?: string;
}
