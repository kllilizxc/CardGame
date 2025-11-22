// 状态系统类型定义

/**
 * 状态类别
 */
export type StatusCategory = "buff" | "debuff" | "special";

/**
 * 状态触发时机
 */
export type StatusTiming =
  | "turnStart"      // 回合开始时
  | "turnEnd"        // 回合结束时
  | "onDamaged"      // 受到伤害时
  | "onAttack"       // 攻击时
  | "onBeAttacked"   // 被攻击时
  | "persistent";    // 持续生效（被动）

/**
 * 状态效果类型
 */
export type StatusEffectType =
  | "damage"           // 造成伤害
  | "heal"             // 恢复生命
  | "modifyAttack"     // 修改攻击力
  | "modifyDefense"    // 修改防御（护甲）
  | "amplifyDamage"    // 放大伤害
  | "reduceDamage"     // 减少伤害
  | "preventAction"    // 阻止行动
  | "preventSkill"     // 阻止技能
  | "taunt"            // 嘲讽
  | "stealth"          // 隐身
  | "mark";            // 标记

/**
 * 状态层数消耗方式
 */
export type StackConsumeType =
  | "onTrigger"        // 每次触发减1层
  | "onDamage"         // 受到伤害时消耗对应层数
  | "allAtOnce"        // 所有层数同时减1
  | "none";            // 不消耗（持续固定回合）

/**
 * 状态定义
 */
export interface StatusDefinition {
  /** 状态唯一ID */
  id: string;
  
  /** 状态名称 */
  name: string;
  
  /** 状态描述 */
  description: string;
  
  /** 状态类别 */
  category: StatusCategory;
  
  /** 触发时机 */
  timing: StatusTiming;
  
  /** 效果类型 */
  effectType: StatusEffectType;
  
  /** 层数消耗方式 */
  stackConsumeType: StackConsumeType;
  
  /** 基础数值（每层的效果值） */
  baseValue: number;
  
  /** 是否无视护甲 */
  ignoreArmor?: boolean;
  
  /** 是否受护甲影响 */
  affectedByArmor?: boolean;
  
  /** 图标（emoji或图标名称） */
  icon: string;
  
  /** 颜色（十六进制） */
  color: string;
  
  /** 是否可叠加 */
  stackable: boolean;
  
  /** 最大层数 */
  maxStacks: number;
  
  /** 默认持续回合数（0表示根据层数决定） */
  defaultDuration?: number;
}

/**
 * 单位身上的状态实例
 */
export interface StatusInstance {
  /** 状态定义ID */
  statusId: string;
  
  /** 当前层数 */
  stacks: number;
  
  /** 剩余持续回合数（如果适用） */
  duration?: number;
  
  /** 施加者ID（用于追踪来源） */
  sourceId?: string;
  
  /** 额外数据（用于特殊状态） */
  extraData?: Record<string, any>;
}
