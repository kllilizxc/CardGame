// 状态系统辅助工具

import type { StatusDefinition, StatusInstance } from '@data/types/status';

// 状态定义缓存
let statusDefinitionsCache: Map<string, StatusDefinition> | null = null;

/**
 * 加载状态定义
 */
export async function loadStatusDefinitions(): Promise<Map<string, StatusDefinition>> {
  if (statusDefinitionsCache) {
    return statusDefinitionsCache;
  }

  try {
    const response = await fetch('/data/config/status-definitions.json');
    const data = await response.json();
    
    statusDefinitionsCache = new Map();
    for (const status of data.statuses) {
      statusDefinitionsCache.set(status.id, status);
    }
    
    return statusDefinitionsCache;
  } catch (error) {
    console.error('Failed to load status definitions:', error);
    return new Map();
  }
}

/**
 * 获取状态定义
 */
export function getStatusDefinition(statusId: string): StatusDefinition | undefined {
  return statusDefinitionsCache?.get(statusId);
}

/**
 * 创建状态实例
 */
export function createStatusInstance(
  statusId: string,
  stacks: number,
  sourceId?: string,
  duration?: number
): StatusInstance | null {
  const definition = getStatusDefinition(statusId);
  if (!definition) {
    console.warn(`Status definition not found: ${statusId}`);
    return null;
  }

  // 限制层数
  const actualStacks = Math.min(stacks, definition.maxStacks);

  return {
    statusId,
    stacks: actualStacks,
    duration: duration ?? definition.defaultDuration,
    sourceId,
  };
}

/**
 * 获取状态显示文本
 */
export function getStatusDisplayText(instance: StatusInstance): string {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return '';

  const stackText = instance.stacks > 1 ? instance.stacks : '';
  const durationText = instance.duration && instance.duration > 0 ? `(${instance.duration}回合)` : '';
  
  return `${definition.icon}${stackText}${durationText}`;
}

/**
 * 获取状态完整描述
 */
export function getStatusFullDescription(instance: StatusInstance): string {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return '';

  let desc = `${definition.name}`;
  
  if (instance.stacks > 1) {
    desc += ` x${instance.stacks}`;
  }
  
  if (instance.duration && instance.duration > 0) {
    desc += ` (${instance.duration}回合)`;
  }
  
  desc += `\n${definition.description}`;
  
  // 添加数值说明
  if (definition.baseValue !== 0) {
    const totalValue = definition.baseValue * instance.stacks;
    desc += `\n当前效果: ${totalValue > 0 ? '+' : ''}${totalValue}`;
  }
  
  return desc;
}

/**
 * 获取状态颜色
 */
export function getStatusColor(statusId: string): string {
  const definition = getStatusDefinition(statusId);
  return definition?.color ?? '#ffffff';
}

/**
 * 获取状态类别颜色（用于边框）
 */
export function getStatusCategoryColor(statusId: string): number {
  const definition = getStatusDefinition(statusId);
  if (!definition) return 0xffffff;

  switch (definition.category) {
    case 'buff':
      return 0x2ecc71; // 绿色
    case 'debuff':
      return 0xe74c3c; // 红色
    case 'special':
      return 0xf39c12; // 橙色
    default:
      return 0xffffff;
  }
}

/**
 * 判断是否可以叠加状态
 */
export function canStackStatus(instance: StatusInstance, additionalStacks: number): boolean {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return false;

  if (!definition.stackable) return false;

  return instance.stacks + additionalStacks <= definition.maxStacks;
}

/**
 * 叠加状态
 */
export function stackStatus(instance: StatusInstance, additionalStacks: number): StatusInstance {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return instance;

  const newStacks = Math.min(
    instance.stacks + additionalStacks,
    definition.maxStacks
  );

  return {
    ...instance,
    stacks: newStacks,
  };
}

/**
 * 消耗状态层数
 */
export function consumeStatusStacks(
  instance: StatusInstance,
  amount: number = 1
): StatusInstance | null {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return null;

  let newStacks = instance.stacks;
  let newDuration = instance.duration;

  switch (definition.stackConsumeType) {
    case 'onTrigger':
      // 每次触发减1层
      newStacks = instance.stacks - 1;
      break;
    
    case 'onDamage':
      // 受到伤害时消耗对应层数
      newStacks = instance.stacks - amount;
      break;
    
    case 'allAtOnce':
      // 所有层数同时减1
      newStacks = Math.max(0, instance.stacks - 1);
      break;
    
    case 'none':
      // 不消耗层数，只减少持续时间
      if (newDuration && newDuration > 0) {
        newDuration = newDuration - 1;
      }
      break;
  }

  // 如果层数或持续时间归零，移除状态
  if (newStacks <= 0 || (newDuration !== undefined && newDuration <= 0)) {
    return null;
  }

  return {
    ...instance,
    stacks: newStacks,
    duration: newDuration,
  };
}

/**
 * 计算状态效果值
 */
export function calculateStatusEffectValue(instance: StatusInstance): number {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return 0;

  // 对于燃烧，伤害等于层数
  if (definition.id === 'burn') {
    return instance.stacks;
  }

  // 其他状态：基础值 × 层数
  return definition.baseValue * instance.stacks;
}

/**
 * 判断状态是否应该在特定时机触发
 */
export function shouldTriggerStatus(
  instance: StatusInstance,
  timing: string
): boolean {
  const definition = getStatusDefinition(instance.statusId);
  if (!definition) return false;

  return definition.timing === timing;
}

/**
 * 获取所有增益状态
 */
export function getBuffStatuses(): StatusDefinition[] {
  if (!statusDefinitionsCache) return [];
  return Array.from(statusDefinitionsCache.values()).filter(
    (status) => status.category === 'buff'
  );
}

/**
 * 获取所有减益状态
 */
export function getDebuffStatuses(): StatusDefinition[] {
  if (!statusDefinitionsCache) return [];
  return Array.from(statusDefinitionsCache.values()).filter(
    (status) => status.category === 'debuff'
  );
}

/**
 * 获取所有特殊状态
 */
export function getSpecialStatuses(): StatusDefinition[] {
  if (!statusDefinitionsCache) return [];
  return Array.from(statusDefinitionsCache.values()).filter(
    (status) => status.category === 'special'
  );
}
