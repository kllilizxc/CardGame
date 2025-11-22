import { Scene } from 'phaser';
import { CardSpriteFactory } from '../factories/CardSpriteFactory';
import type { BaseCardSprite } from '../objects/BaseCardSprite';
import type { CardSprite } from '../objects/CardSprite';
import type { BattleLog } from '../ui/BattleLog';
import type { CardManager } from '../managers/CardManager';
import type { DeckSelectionUI } from '../ui/DeckSelectionUI';
import type { BattleAnimationManager } from '../managers/BattleAnimationManager';

type AnyCard = any;

/**
 * 游戏动作处理上下文
 */
export interface GameActionContext {
    scene: Scene;
    deck: AnyCard[];
    hand: BaseCardSprite[];
    cardScale: number;
    battleLog: BattleLog;
    cardManager: CardManager;
    deckSelectionUI: DeckSelectionUI;
    animationManager: BattleAnimationManager;
    updateDeckCount: () => void;
    drawCard: () => void;
    // 战场信息（用于效果处理）
    playerField?: CardSprite[];
    enemyField?: CardSprite[];
}

/**
 * 游戏动作处理器
 * 处理通用的游戏动作，可被技能效果、卡片效果等复用
 */
export class GameActionHandler {
    private context: GameActionContext;

    constructor(context: GameActionContext) {
        this.context = context;
    }

    /**
     * 抽卡
     * @param count 抽卡数量
     */
    public drawCards(count: number = 1): void {
        for (let i = 0; i < count; i++) {
            this.context.drawCard();
        }
    }

    /**
     * 从卡组检索卡牌
     * @param _count 检索数量（预留参数，目前只支持1张）
     * @param filter 可选的过滤条件（未来扩展）
     * @param onCancel 取消时的回调
     */
    public searchDeck(_count: number = 1, filter?: (card: AnyCard) => boolean, onCancel?: () => void): void {
        const { deck, deckSelectionUI, hand, cardScale, battleLog, cardManager, updateDeckCount, scene } = this.context;

        // 应用过滤条件（如果有）
        const filteredDeck = filter ? deck.filter(filter) : deck;

        if (filteredDeck.length === 0) {
            battleLog.addLog('卡组中没有符合条件的卡牌');
            // 没有卡可选也算取消
            if (onCancel) {
                onCancel();
            }
            return;
        }

        deckSelectionUI.show(
            filteredDeck, 
            (selectedCard) => {
                // 将选中的卡牌加入手牌
                const index = deck.indexOf(selectedCard);
                if (index > -1) {
                    deck.splice(index, 1);
                    
                    // 使用工厂创建卡片精灵
                    const sprite = CardSpriteFactory.createSprite(scene, selectedCard, 0, 0, cardScale);

                    if (sprite) {
                        hand.push(sprite);
                        cardManager.arrangeHand(hand as any);
                        battleLog.addLog(`检索了【${selectedCard.name}】`);
                        updateDeckCount();
                    }
                }
            },
            onCancel // 传入取消回调
        );
    }

    /**
     * 将卡牌添加到手牌（不从卡组移除，比如"创造"效果）
     * @param cardData 卡牌数据
     */
    public addCardToHand(cardData: AnyCard): boolean {
        const { scene, hand, cardScale, battleLog, cardManager } = this.context;

        const sprite = CardSpriteFactory.createSprite(scene, cardData, 0, 0, cardScale);
        if (sprite) {
            hand.push(sprite);
            cardManager.arrangeHand(hand as any);
            battleLog.addLog(`获得了【${cardData.name}】`);
            return true;
        }
        return false;
    }

    /**
     * 更新上下文（用于运行时更新deck、hand等引用）
     */
    public updateContext(updates: Partial<GameActionContext>): void {
        this.context = { ...this.context, ...updates };
    }

    /**
     * 获取当前上下文
     */
    public getContext(): GameActionContext {
        return this.context;
    }

    // ==================== 通用效果处理 ====================

    /**
     * 应用效果动作（通用入口）
     * @param action 效果动作数据
     * @param source 效果来源（卡片名称）
     * @param sourceCard 源卡片精灵（用于日志hover）
     * @param target 目标单位（单体目标）
     * @param targets 目标单位数组（群体目标）
     */
    public applyEffect(
        action: any,
        source: string,
        sourceCard?: BaseCardSprite,
        target?: CardSprite,
        targets?: CardSprite[]
    ): void {
        const { battleLog } = this.context;

        switch (action.type) {
            case 'modifyHealth':
                if (target) {
                    this.modifyHealth(target, action.value, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, action.value, source, sourceCard));
                }
                break;

            case 'dealDamage':
                if (target) {
                    this.modifyHealth(target, -Math.abs(action.value), source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, -Math.abs(action.value), source, sourceCard));
                }
                break;

            case 'heal':
                if (target) {
                    this.modifyHealth(target, Math.abs(action.value), source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, Math.abs(action.value), source, sourceCard));
                }
                break;

            case 'modifyAttack':
                if (target) {
                    this.modifyAttack(target, action.value, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyAttack(t, action.value, source, sourceCard));
                }
                break;

            case 'applyStatus':
                // TODO: 实现状态系统后处理
                battleLog.addLog(`${source}对目标施加了${action.statusId}状态`);
                break;

            case 'removeDebuffs':
                // TODO: 实现状态系统后处理
                battleLog.addLog(`${source}移除了目标的负面状态`);
                break;

            default:
                console.log(`未处理的效果类型: ${action.type}`);
        }
    }

    /**
     * 修改生命值（伤害/治疗）
     */
    private modifyHealth(target: CardSprite, value: number, source: string, sourceCard?: BaseCardSprite): void {
        const { battleLog } = this.context;
        const targetData = target.getCardData();

        targetData.health += value;

        // 生命值不能低于0
        if (targetData.health < 0) {
            targetData.health = 0;
        }

        // 更新显示
        target.updateStats();

        // 播放受击/治疗动画
        if (value < 0) {
            // 受伤动画
            this.context.animationManager.playHitAnimation(target);
        } else if (value > 0) {
            // 治疗动画
            this.context.animationManager.playHealAnimation(target);
        }

        // 记录日志（包含源卡片和目标卡片）
        const cardRefs = sourceCard ? [sourceCard, target] : [target];
        if (value < 0) {
            const damage = Math.abs(value);
            battleLog.addLog(
                `【${source}】对【${targetData.name}】造成${damage}点伤害！`,
                cardRefs
            );
        } else {
            battleLog.addLog(
                `【${source}】为【${targetData.name}】恢复${value}点生命值！`,
                cardRefs
            );
        }
    }

    /**
     * 修改攻击力
     */
    private modifyAttack(target: CardSprite, value: number, source: string, sourceCard?: BaseCardSprite): void {
        const { battleLog } = this.context;
        const targetData = target.getCardData();

        targetData.attack += value;
        target.updateStats();

        // 记录日志（包含源卡片和目标卡片）
        const cardRefs = sourceCard ? [sourceCard, target] : [target];
        battleLog.addLog(
            `【${source}】使【${targetData.name}】攻击力${value > 0 ? '+' : ''}${value}！`,
            cardRefs
        );
    }

    /**
     * 根据目标范围获取目标单位列表
     */
    public getTargetsByScope(scope: string, clickedTarget?: CardSprite): CardSprite[] {
        const { playerField, enemyField } = this.context;

        if (!playerField || !enemyField) {
            return clickedTarget ? [clickedTarget] : [];
        }

        switch (scope) {
            case 'singleAlly':
            case 'singleEnemy':
                return clickedTarget ? [clickedTarget] : [];

            case 'allyUnits':
            case 'allAllies':
                return [...playerField];

            case 'enemyUnits':
            case 'allEnemies':
                return [...enemyField];

            case 'allUnits':
                return [...playerField, ...enemyField];

            default:
                return clickedTarget ? [clickedTarget] : [];
        }
    }
}
