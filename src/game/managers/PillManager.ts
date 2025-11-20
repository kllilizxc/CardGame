import { Scene } from 'phaser';
import type { PillCard } from '../../../data/types/cards/pill';
import { CardSprite } from '../objects/CardSprite';
import type { BattleLog } from '../ui/BattleLog';

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
    private battleLog: BattleLog;
    private slots: PillSlot[] = [];     // 丹药槽位数组
    private maxSlots: number = 3;       // 默认最大槽位数

    constructor(scene: Scene, battleLog: BattleLog, maxSlots: number = 3) {
        this.scene = scene;
        this.battleLog = battleLog;
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
            this.battleLog.addLog('丹药槽位已满！');
            return false;
        }

        emptySlot.pill = pill;
        emptySlot.isEmpty = false;
        this.battleLog.addLog(`获得丹药【${pill.name}】`);
        
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
        
        this.battleLog.addLog(`丹药槽位扩展至${this.maxSlots}个`);
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

        this.battleLog.addLog(`使用了【${pill.name}】`);

        // 播放使用动画和特效
        this.playUseEffect(() => {
            // 应用效果
            this.applyPillEffects(pill, target);

            // 从槽位移除
            this.removePill(slotIndex);

            // 触发效果应用检查
            this.scene.events.emit('effectApplied');
        });

        return true;
    }

    /**
     * 播放丹药使用特效
     */
    private playUseEffect(onComplete: () => void): void {
        const { width, height } = this.scene.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        // 添加光效
        const light = this.scene.add.circle(centerX, centerY, 0, 0x27ae60, 0.6);
        light.setDepth(999);
        this.scene.tweens.add({
            targets: light,
            radius: 100,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                light.destroy();
                if (onComplete) {
                    onComplete();
                }
            }
        });
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
                        this.battleLog.addLog(`施加状态效果`);
                        break;

                    default:
                        console.log(`未处理的丹药效果类型: ${action.type}`);
                }
            });

            // 显示效果文本
            if (effect.text) {
                this.battleLog.addLog(effect.text);
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
        this.battleLog.addLog(`玩家回复了${amount}点生命值`);

        // 显示治疗特效
        this.showHealEffect();
    }

    /**
     * 修改单位生命值
     */
    private modifyUnitHealth(unit: CardSprite, value: number): void {
        const cardData = unit.getCardData();
        cardData.health += value;

        if (value > 0) {
            this.battleLog.addLog(`【${cardData.name}】回复了${value}点生命`);
        } else {
            this.battleLog.addLog(`【${cardData.name}】受到${-value}点伤害`);
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
        this.battleLog.addLog(`【${cardData.name}】攻击力${value > 0 ? '+' : ''}${value}${durationText}`);

        unit.updateStats();

        // TODO: 如果有duration，需要在回合结束后移除效果
    }

    /**
     * 抽卡
     */
    private drawCards(count: number): void {
        this.scene.events.emit('drawCardsFromPill', count);
        this.battleLog.addLog(`抽取${count}张卡牌`);
    }

    /**
     * 显示治疗特效
     */
    private showHealEffect(): void {
        const { width, height } = this.scene.scale;
        const centerX = width / 2;
        const centerY = height * 0.85;

        // 创建治疗粒子效果
        const particles: Phaser.GameObjects.Arc[] = [];
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const particle = this.scene.add.circle(
                centerX,
                centerY,
                5,
                0x2ecc71,
                0.8
            );
            particle.setDepth(1000);
            particles.push(particle);

            this.scene.tweens.add({
                targets: particle,
                x: centerX + Math.cos(angle) * 50,
                y: centerY + Math.sin(angle) * 50 - 30,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }
}
