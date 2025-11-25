import { Scene } from 'phaser';
import type { PillCard } from '@data/types/cards/pill';
import { CardSprite } from '../../objects/CardSprite';
import type { BattleContext } from '../../context/BattleContext';

/**
 * 丹药槽位信息
 */
export interface PillSlot {
    index: number;           // 槽位索引
    pill: PillCard | null;   // 当前丹药（null表示空槽位）
    isEmpty: boolean;        // 是否为空
}

/**
 * 丹药管理器
 * 管理丹药槽位系统（类似杀戮尖塔的药水瓶）
 */
export class PillManager {
    private scene: Scene;
    private battleContext: BattleContext;
    private slots: PillSlot[] = [];     // 丹药槽位数组
    private maxSlots: number = 3;       // 默认最大槽位数

    constructor(scene: Scene, battleContext: BattleContext, maxSlots: number = 3) {
        this.scene = scene;
        this.battleContext = battleContext;
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

        pillData.effects.forEach(effect => {
            if (!effect.actions) return;

            effect.actions.forEach(action => {
                switch (action.type) {
                    case 'healPlayer':
                        this.healPlayer(action.value || 0);
                        break;

                    case 'modifyHealth':
                        if (target && target !== 'player' && target instanceof CardSprite) {
                            this.modifyUnitHealth(target, action.value || 0);
                        }
                        break;

                    case 'modifyAttack':
                        if (target && target !== 'player' && target instanceof CardSprite) {
                            this.modifyUnitAttack(target, action.value || 0, pillData.duration || 0);
                        }
                        break;

                    case 'drawCards':
                        this.drawCards(action.value || 1);
                        break;

                    case 'applyStatus':
                        // 状态效果暂时简化处理
                        this.battleContext.battleLog.addLog(`施加状态效果`);
                        break;

                    default:
                        console.log(`未处理的丹药效果类型: ${action.type}`);
                }
            });

            // 显示效果文本
            if (effect.text) {
                this.battleContext.battleLog.addLog(effect.text);
            }
        });
    }

    /**
     * 回复玩家生命值
     */
    private healPlayer(amount: number): void {
        if (amount <= 0) return;

        // 通知场景更新玩家生命值
        this.scene.events.emit('healPlayer', amount);
        this.battleContext.battleLog.addLog(`玩家回复了${amount}点生命值`);

        // 显示治疗特效
        this.battleContext.effectManager.showHealEffect();
    }

    /**
     * 修改单位生命值
     */
    private modifyUnitHealth(unit: CardSprite, value: number): void {
        const cardData = unit.getCardData();
        cardData.health += value;

        if (value > 0) {
            this.battleContext.battleLog.addLog(`【${cardData.name}】回复了${value}点生命`);
            this.battleContext.effectManager.showHealEffect(unit.x, unit.y);
        } else {
            this.battleContext.battleLog.addLog(`【${cardData.name}】受到${-value}点伤害`);
            this.battleContext.effectManager.showDamageEffect(unit);
        }

        unit.updateStats();
    }

    /**
     * 修改单位攻击力
     */
    private modifyUnitAttack(unit: CardSprite, value: number, duration: number): void {
        const cardData = unit.getCardData();
        cardData.attack += value;

        const durationText = duration > 0 ? `（持续${duration}回合）` : '';
        this.battleContext.battleLog.addLog(`【${cardData.name}】攻击力${value > 0 ? '+' : ''}${value}${durationText}`);

        // 显示增益/减益特效
        if (value > 0) {
            this.battleContext.effectManager.showBuffEffect(unit);
        } else {
            this.battleContext.effectManager.showDebuffEffect(unit);
        }

        unit.updateStats();

        // TODO: 如果有duration，需要在回合结束后移除效果
    }

    /**
     * 抽卡
     */
    private drawCards(count: number): void {
        this.scene.events.emit('drawCardsFromPill', count);
        this.battleContext.battleLog.addLog(`抽取${count}张卡牌`);
    }
}
