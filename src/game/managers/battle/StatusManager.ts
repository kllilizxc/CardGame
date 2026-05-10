// 状态管理器

import type { StatusInstance } from '@data/types/status';
import {
  loadStatusDefinitions,
  getStatusDefinition,
  createStatusInstance,
  stackStatus,
  consumeStatusStacks,
  calculateStatusEffectValue,
  shouldTriggerStatus,
  canStackStatus,
} from '../../utils/StatusHelper';

/**
 * 单位状态容器
 */
export interface UnitStatuses {
  unitId: string;
  statuses: StatusInstance[];
}

/**
 * 状态管理器
 */
export class StatusManager {
  private unitStatusesMap: Map<string, StatusInstance[]> = new Map();
  private initialized: boolean = false;

  /**
   * 初始化状态管理器
   */
  async initialize(statusDefinitionsData?: unknown): Promise<void> {
    if (this.initialized) return;
    
    await loadStatusDefinitions(statusDefinitionsData);
    this.initialized = true;
    console.log('StatusManager initialized');
  }

  /**
   * 为单位施加状态
   */
  applyStatus(
    unitId: string,
    statusId: string,
    stacks: number,
    sourceId?: string,
    duration?: number
  ): boolean {
    if (!this.initialized) {
      console.warn('StatusManager not initialized');
      return false;
    }

    const definition = getStatusDefinition(statusId);
    if (!definition) {
      console.warn(`Status definition not found: ${statusId}`);
      return false;
    }

    // 获取或创建单位的状态列表
    let unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses) {
      unitStatuses = [];
      this.unitStatusesMap.set(unitId, unitStatuses);
    }

    // 检查是否已有相同状态
    const existingIndex = unitStatuses.findIndex(s => s.statusId === statusId);
    
    if (existingIndex >= 0) {
      const existing = unitStatuses[existingIndex];
      
      // 如果可以叠加
      if (definition.stackable && canStackStatus(existing, stacks)) {
        unitStatuses[existingIndex] = stackStatus(existing, stacks);
        console.log(`Stacked status ${statusId} on ${unitId}: ${unitStatuses[existingIndex].stacks} stacks`);
        return true;
      } else if (!definition.stackable) {
        // 不可叠加，刷新持续时间
        unitStatuses[existingIndex] = {
          ...existing,
          duration: duration ?? definition.defaultDuration,
        };
        console.log(`Refreshed status ${statusId} on ${unitId}`);
        return true;
      } else {
        console.warn(`Cannot stack more ${statusId} on ${unitId}`);
        return false;
      }
    } else {
      // 创建新状态
      const newStatus = createStatusInstance(statusId, stacks, sourceId, duration);
      if (newStatus) {
        unitStatuses.push(newStatus);
        console.log(`Applied status ${statusId} to ${unitId}: ${stacks} stacks`);
        return true;
      }
    }

    return false;
  }

  /**
   * 移除单位的特定状态
   */
  removeStatus(unitId: string, statusId: string): boolean {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses) return false;

    const index = unitStatuses.findIndex(s => s.statusId === statusId);
    if (index >= 0) {
      unitStatuses.splice(index, 1);
      console.log(`Removed status ${statusId} from ${unitId}`);
      return true;
    }

    return false;
  }

  /**
   * 移除单位的所有状态
   */
  clearAllStatuses(unitId: string): void {
    this.unitStatusesMap.delete(unitId);
    console.log(`Cleared all statuses from ${unitId}`);
  }

  /**
   * 移除单位的所有增益状态
   */
  clearBuffs(unitId: string): void {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses) return;

    const filtered = unitStatuses.filter(status => {
      const def = getStatusDefinition(status.statusId);
      return def?.category !== 'buff';
    });

    this.unitStatusesMap.set(unitId, filtered);
    console.log(`Cleared buffs from ${unitId}`);
  }

  /**
   * 移除单位的所有减益状态
   */
  clearDebuffs(unitId: string): void {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses) return;

    const filtered = unitStatuses.filter(status => {
      const def = getStatusDefinition(status.statusId);
      return def?.category !== 'debuff';
    });

    this.unitStatusesMap.set(unitId, filtered);
    console.log(`Cleared debuffs from ${unitId}`);
  }

  /**
   * 获取单位的所有状态
   */
  getUnitStatuses(unitId: string): StatusInstance[] {
    return this.unitStatusesMap.get(unitId) || [];
  }

  /**
   * 检查单位是否有特定状态
   */
  hasStatus(unitId: string, statusId: string): boolean {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    return unitStatuses?.some(s => s.statusId === statusId) ?? false;
  }

  /**
   * 获取单位的特定状态
   */
  getStatus(unitId: string, statusId: string): StatusInstance | undefined {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    return unitStatuses?.find(s => s.statusId === statusId);
  }

  /**
   * 触发特定时机的状态效果
   */
  triggerStatuses(unitId: string, timing: string, context?: any): number {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses || unitStatuses.length === 0) return 0;

    let totalDamage = 0;
    const statusesToRemove: number[] = [];

    for (let i = 0; i < unitStatuses.length; i++) {
      const status = unitStatuses[i];
      
      if (shouldTriggerStatus(status, timing)) {
        const definition = getStatusDefinition(status.statusId);
        if (!definition) continue;

        // 计算效果值
        const effectValue = calculateStatusEffectValue(status);

        // 根据效果类型处理
        switch (definition.effectType) {
          case 'damage':
            totalDamage += effectValue;
            console.log(`${unitId} takes ${effectValue} damage from ${definition.name}`);
            break;
          
          case 'heal':
            // 治疗效果由调用者处理
            console.log(`${unitId} heals ${effectValue} from ${definition.name}`);
            if (context?.onHeal) {
              context.onHeal(effectValue);
            }
            break;
        }

        // 消耗状态层数
        const updatedStatus = consumeStatusStacks(status, 1);
        if (updatedStatus) {
          unitStatuses[i] = updatedStatus;
        } else {
          statusesToRemove.push(i);
        }
      }
    }

    // 移除已消耗完的状态
    for (let i = statusesToRemove.length - 1; i >= 0; i--) {
      const index = statusesToRemove[i];
      const removedStatus = unitStatuses[index];
      const definition = getStatusDefinition(removedStatus.statusId);
      console.log(`Status ${definition?.name} expired on ${unitId}`);
      unitStatuses.splice(index, 1);
    }

    return totalDamage;
  }

  /**
   * 处理受到伤害时的状态效果（护甲、易伤等）
   */
  processDamage(unitId: string, baseDamage: number): number {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses || unitStatuses.length === 0) return baseDamage;

    let finalDamage = baseDamage;
    const statusesToRemove: number[] = [];

    // 1. 先处理易伤（放大伤害）
    for (const status of unitStatuses) {
      const definition = getStatusDefinition(status.statusId);
      if (definition?.effectType === 'amplifyDamage') {
        const amplify = calculateStatusEffectValue(status);
        finalDamage += amplify;
        console.log(`Vulnerable amplifies damage by ${amplify}`);
      }
    }

    // 2. 再处理护甲（减少伤害）
    for (let i = 0; i < unitStatuses.length; i++) {
      const status = unitStatuses[i];
      const definition = getStatusDefinition(status.statusId);
      
      if (definition?.effectType === 'reduceDamage' && definition.stackConsumeType === 'onDamage') {
        // 护甲类型：消耗层数
        const blocked = Math.min(finalDamage, status.stacks);
        finalDamage -= blocked;
        
        const updatedStatus = consumeStatusStacks(status, blocked);
        if (updatedStatus) {
          unitStatuses[i] = updatedStatus;
          console.log(`Armor blocked ${blocked} damage, ${updatedStatus.stacks} stacks remaining`);
        } else {
          statusesToRemove.push(i);
          console.log(`Armor depleted, blocked ${blocked} damage`);
        }
        
        if (finalDamage <= 0) break;
      }
    }

    // 移除已消耗完的状态
    for (let i = statusesToRemove.length - 1; i >= 0; i--) {
      unitStatuses.splice(statusesToRemove[i], 1);
    }

    return Math.max(0, finalDamage);
  }

  /**
   * 获取单位的攻击力修正值
   */
  getAttackModifier(unitId: string): number {
    const unitStatuses = this.unitStatusesMap.get(unitId);
    if (!unitStatuses) return 0;

    let modifier = 0;
    for (const status of unitStatuses) {
      const definition = getStatusDefinition(status.statusId);
      if (definition?.effectType === 'modifyAttack') {
        modifier += calculateStatusEffectValue(status);
      }
    }

    return modifier;
  }

  /**
   * 检查单位是否被冰冻
   */
  isFrozen(unitId: string): boolean {
    return this.hasStatus(unitId, 'frozen');
  }

  /**
   * 检查单位是否被封印
   */
  isSealed(unitId: string): boolean {
    return this.hasStatus(unitId, 'sealed');
  }

  /**
   * 检查单位是否隐身
   */
  isStealth(unitId: string): boolean {
    return this.hasStatus(unitId, 'stealth');
  }

  /**
   * 检查单位是否嘲讽
   */
  hasTaunt(unitId: string): boolean {
    return this.hasStatus(unitId, 'taunt');
  }

  /**
   * 回合结束时更新所有状态
   */
  updateTurnEndStatuses(): void {
    for (const [unitId, statuses] of this.unitStatusesMap.entries()) {
      const statusesToRemove: number[] = [];

      for (let i = 0; i < statuses.length; i++) {
        const status = statuses[i];
        const definition = getStatusDefinition(status.statusId);
        
        if (definition?.stackConsumeType === 'none' && status.duration !== undefined) {
          // 持续时间类状态，减少持续时间
          if (status.duration > 0) {
            statuses[i] = { ...status, duration: status.duration - 1 };
            
            if (statuses[i].duration! <= 0) {
              statusesToRemove.push(i);
            }
          }
        }
      }

      // 移除过期状态
      for (let i = statusesToRemove.length - 1; i >= 0; i--) {
        const removedStatus = statuses[statusesToRemove[i]];
        const definition = getStatusDefinition(removedStatus.statusId);
        console.log(`Status ${definition?.name} expired on ${unitId}`);
        statuses.splice(statusesToRemove[i], 1);
      }
    }
  }

  /**
   * 清理已死亡单位的状态
   */
  cleanupUnit(unitId: string): void {
    this.unitStatusesMap.delete(unitId);
  }
}
