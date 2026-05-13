import { Scene } from 'phaser';
import type { PillCard } from '@data/types/cards/pill';
import { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';
import type { EffectResolver, EffectExecutionContext } from './EffectResolver';

/**
 * 丹药槽位信息
 */
export interface PillSlot {
    index: number;           // 槽位索引
    pill: PillCard | null;   // 当前丹药（null表示空槽位）
    isEmpty: boolean;        // 是否为空
}

interface TimedPillEffect {
    unitId: string;
    attackDelta: number;
    healthDelta: number;
    remainingTurns: number;
    sourceName: string;
}

/**
 * 丹药管理器
 * 管理丹药槽位系统（类似杀戮尖塔的药水瓶）
 */
export class PillManager {
    private scene: Scene;
    private battleContext: BattleContext;
    private effectResolver: EffectResolver;
    private slots: PillSlot[] = [];     // 丹药槽位数组
    private maxSlots: number = 3;       // 默认最大槽位数
    private timedEffects: Map<string, TimedPillEffect[]> = new Map(); // unitId -> timed effects

    constructor(scene: Scene, battleContext: BattleContext, maxSlots: number = 3, effectResolver: EffectResolver) {
        this.scene = scene;
        this.battleContext = battleContext;
        this.effectResolver = effectResolver;
        this.maxSlots = Math.min(maxSlots, 5); // 最多5个槽位

        // 初始化槽位
        this.initializeSlots();
    }

    /**
     * 初始化槽位
     */
    private initializeSlots(): void {
        this.slots = [];
        for (let i = 0; i < this.maxSlots; i++) {
            this.slots.push({
                index: i,
                pill: null,
                isEmpty: true
            });
        }
    }

    /**
     * 添加丹药到空槽位
     */
    public addPill(pill: PillCard): boolean {
        const emptySlot = this.slots.find(slot => slot.isEmpty);
        if (!emptySlot) {
            this.battleContext.battleLog.addLog('丹药槽位已满！');
            return false;
        }

        emptySlot.pill = pill;
        emptySlot.isEmpty = false;
        this.battleContext.battleLog.addLog(`获得丹药【${pill.name}】`);
        
        // 触发UI更新事件
        this.scene.events.emit('pillSlotsUpdated', this.slots);
        return true;
    }

    /**
     * 从指定槽位移除丹药
     */
    public removePill(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return;
        
        const slot = this.slots[slotIndex];
        slot.pill = null;
        slot.isEmpty = true;
        
        // 触发UI更新事件
        this.scene.events.emit('pillSlotsUpdated', this.slots);
    }

    /**
     * 获取所有槽位信息
     */
    public getSlots(): PillSlot[] {
        return this.slots;
    }

    /**
     * 获取指定槽位的丹药
     */
    public getPillAt(slotIndex: number): PillCard | null {
        if (slotIndex < 0 || slotIndex >= this.slots.length) return null;
        return this.slots[slotIndex].pill;
    }

    /**
     * 扩展槽位数量
     */
    public expandSlots(newMaxSlots: number): void {
        const targetSlots = Math.min(newMaxSlots, 5);
        if (targetSlots <= this.maxSlots) return;

        this.maxSlots = targetSlots;
        for (let i = this.slots.length; i < this.maxSlots; i++) {
            this.slots.push({
                index: i,
                pill: null,
                isEmpty: true
            });
        }
        
        this.battleContext.battleLog.addLog(`丹药槽位扩展至${this.maxSlots}个`);
        this.scene.events.emit('pillSlotsUpdated', this.slots);
    }

    /**
     * 使用指定槽位的丹药
     * @param slotIndex 槽位索引
     * @param target 目标单位（可选，取决于丹药目标类型）
     */
    public usePillFromSlot(
        slotIndex: number,
        target?: CardSprite | 'player'
    ): boolean {
        const pill = this.getPillAt(slotIndex);
        if (!pill) {
            return false;
        }

        this.battleContext.battleLog.addLog(`使用了【${pill.name}】`);

        // 播放使用动画和特效
        this.battleContext.effectManager.playPillUseEffect(target, () => {
            // 应用效果
            this.applyPillEffects(pill, target);

            // 从槽位移除
            this.removePill(slotIndex);
        });

        return true;
    }

    /**
     * 应用丹药效果
     */
    private applyPillEffects(
        pillData: PillCard,
        target?: CardSprite | 'player'
    ): void {
        if (!pillData.effects || pillData.effects.length === 0) {
            return;
        }

        const battleScene = this.scene as any;
        const playerField: CardSprite[] = battleScene.playerField || [];
        const enemyField: CardSprite[] = battleScene.enemyField || [];

        for (const effect of pillData.effects) {
            if (!effect.actions) continue;

            const scope = effect.target?.scope;
            let targets: CardSprite[] = [];

            if (scope === 'ownerPlayer') {
                targets = [];
            } else if (scope === 'singleAlly' || scope === 'singleEnemy') {
                if (target && target !== 'player' && target instanceof CardSprite) {
                    targets = [target];
                }
            } else if (scope) {
                const ctx: EffectExecutionContext = {
                    playerField,
                    enemyField,
                    sourceName: pillData.name,
                };
                targets = this.effectResolver.resolveTargets(scope, ctx);
            } else {
                // no scope specified, default to target if available
                if (target && target !== 'player' && target instanceof CardSprite) {
                    targets = [target];
                }
            }

            const ctx: EffectExecutionContext = {
                playerField,
                enemyField,
                sourceName: pillData.name,
            };

            for (const action of effect.actions) {
                // For player-targeted actions or ownerPlayer scope
                if (scope === 'ownerPlayer' || (targets.length === 0 && (
                    action.type === 'healPlayer'
                    || action.type === 'damagePlayer'
                    || action.type === 'drawCards'
                ))) {
                    this.effectResolver.executeAction(action, [], ctx);
                } else if (targets.length > 0) {
                    this.effectResolver.executeAction(action, targets, ctx);

                    // Track duration-based effects
                    const duration = pillData.duration || 0;
                    if (duration > 0 && (action.type === 'modifyAttack' || action.type === 'modifyHealth')) {
                        for (const unit of targets) {
                            const unitId = unit.getCardData().id;
                            let unitEffects = this.timedEffects.get(unitId);
                            if (!unitEffects) {
                                unitEffects = [];
                                this.timedEffects.set(unitId, unitEffects);
                            }
                            unitEffects.push({
                                unitId,
                                attackDelta: action.type === 'modifyAttack' ? (action.value ?? 0) : 0,
                                healthDelta: action.type === 'modifyHealth' ? (action.value ?? 0) : 0,
                                remainingTurns: duration,
                                sourceName: pillData.name,
                            });
                        }
                    }
                }
            }

            if (effect.text) {
                this.battleContext.battleLog.addLog(effect.text);
            }
        }
    }

    /**
     * 回合结束时处理丹药持续时间效果
     * 减少剩余回合数，到期后回退效果
     */
    public onTurnEnd(playerField: CardSprite[], enemyField: CardSprite[]): void {
        const allUnits = [...playerField, ...enemyField];

        for (const unit of allUnits) {
            const unitData = unit.getCardData();
            const effects = this.timedEffects.get(unitData.id);
            if (!effects || effects.length === 0) continue;

            const remaining: TimedPillEffect[] = [];

            for (const timed of effects) {
                timed.remainingTurns--;

                if (timed.remainingTurns <= 0) {
                    // 回退效果
                    unitData.attack -= timed.attackDelta;
                    unitData.health -= timed.healthDelta;
                    if (unitData.health < 0) unitData.health = 0;
                    unit.updateStats();

                    this.battleContext.battleLog.addLog(
                        `【${unitData.name}】的【${timed.sourceName}】效果已到期`,
                    );
                } else {
                    remaining.push(timed);
                }
            }

            if (remaining.length > 0) {
                this.timedEffects.set(unitData.id, remaining);
            } else {
                this.timedEffects.delete(unitData.id);
            }
        }
    }
}
