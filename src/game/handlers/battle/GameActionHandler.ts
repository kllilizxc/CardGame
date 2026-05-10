import { Scene } from 'phaser';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';
import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleLog } from '../../ui/battle/BattleLog';
import type { CardManager } from '../../managers/battle/CardManager';
import type { DeckSelectionUI } from '../../ui/common/DeckSelectionUI';
import type { BattleAnimationManager } from '../../managers/battle/BattleAnimationManager';
import { getStatusDefinition } from '../../utils/StatusHelper';
import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import type { LegacyEffectAction } from '@data/types/cards/effects';

type GameActionCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;

/**
 * 游戏动作处理上下文
 */
export interface GameActionContext {
    scene: Scene;
    deck: GameActionCard[];
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
    discardPile?: GameActionCard[];
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
    public searchDeck(_count: number = 1, filter?: (card: GameActionCard) => boolean, onCancel?: () => void): void {
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
            1, // 单选
            (selectedCard: GameActionCard) => {
                // 将选中的卡牌加入手牌
                const card = selectedCard;
                const index = deck.indexOf(card);
                if (index > -1) {
                    deck.splice(index, 1);
                    
                    // 使用工厂创建卡片精灵
                    const sprite = CardSpriteFactory.createSprite(scene, card, 0, 0, cardScale);

                    if (sprite) {
                        hand.push(sprite);
                        cardManager.arrangeHand(hand as any);
                        battleLog.addLog(`检索了【${card.name}】`);
                        updateDeckCount();
                    }
                }
            },
            onCancel
        );
    }

    /**
     * 从卡组检索卡牌到弃牌堆（带UI选择）
     * @param count 检索数量
     * @param filter 过滤条件
     * @param onCancel 取消时的回调
     */
    public searchDeckToDiscard(count: number = 1, filter?: (card: GameActionCard) => boolean, onCancel?: () => void): void {
        const { deck, discardPile, deckSelectionUI, battleLog, updateDeckCount, animationManager } = this.context;

        if (!discardPile) {
            console.warn('弃牌堆未提供');
            if (onCancel) onCancel();
            return;
        }

        // 应用过滤条件
        const filteredDeck = filter ? deck.filter(filter) : deck;

        if (filteredDeck.length === 0) {
            battleLog.addLog('卡组中没有符合条件的卡牌');
            if (onCancel) onCancel();
            return;
        }

        // 使用统一的 show 方法
        deckSelectionUI.show(
            filteredDeck,
            count,
            (selected: GameActionCard | GameActionCard[]) => {
                // 先移动卡牌数据
                // 统一转换为数组处理
                const cards = Array.isArray(selected) ? selected : [selected];
                cards.forEach((card) => {
                    const index = deck.indexOf(card);
                    if (index > -1) {
                        deck.splice(index, 1);
                        discardPile.push(card);
                        battleLog.addLog(`检索了【${card.name}】到弃牌堆`);
                    }
                });
                updateDeckCount();

                // 播放动画（传入实际的卡牌数据）
                animationManager.playDeckToDiscardAnimation(cards);
            },
            onCancel
        );
    }

    /**
     * 从弃牌堆选择卡牌回收到手牌
     * @param _count 选择数量（预留参数，目前只支持1张）
     * @param filter 可选的过滤条件
     * @param onCancel 取消时的回调
     */
    public recoverFromDiscardPile(_count: number = 1, filter?: (card: GameActionCard) => boolean, onCancel?: () => void): void {
        const { discardPile, deckSelectionUI, hand, cardScale, battleLog, cardManager, scene, animationManager } = this.context;

        if (!discardPile) {
            console.warn('弃牌堆未提供');
            if (onCancel) onCancel();
            return;
        }

        // 应用过滤条件（如果有）
        const filteredCards = filter ? discardPile.filter(filter) : discardPile;

        if (filteredCards.length === 0) {
            battleLog.addLog('弃牌堆中没有符合条件的卡牌');
            if (onCancel) {
                onCancel();
            }
            return;
        }

        // 复用 DeckSelectionUI 显示弃牌堆选择
        deckSelectionUI.show(
            filteredCards,
            1, // 单选
            (selectedCard: GameActionCard) => {
                // 从弃牌堆移除
                const card = selectedCard;
                const index = discardPile.indexOf(card);
                if (index > -1) {
                    discardPile.splice(index, 1);
                    
                    // 从弃牌堆位置创建卡片精灵
                    const { x: startX, y: startY } = animationManager.getDiscardPileCardSpawnPosition();
                    const sprite = CardSpriteFactory.createSprite(scene, card, startX, startY, cardScale);

                    if (sprite) {
                        hand.push(sprite);
                        cardManager.arrangeHand(hand as any);
                        battleLog.addLog(`从弃牌堆回收了【${card.name}】`);
                    }
                }
            },
            onCancel
        );
    }

    /**
     * 将卡牌添加到手牌（不从卡组移除，比如"创造"效果）
     * @param cardData 卡牌数据
     */
    public addCardToHand(cardData: GameActionCard): boolean {
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
        action: LegacyEffectAction,
        source: string,
        sourceCard?: BaseCardSprite,
        target?: CardSprite,
        targets?: CardSprite[]
    ): void {
        const actionValue = action.value ?? 0;

        switch (action.type) {
            case 'modifyHealth':
                if (target) {
                    this.modifyHealth(target, actionValue, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, actionValue, source, sourceCard));
                }
                break;

            case 'dealDamage':
                if (target) {
                    this.modifyHealth(target, -Math.abs(actionValue), source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, -Math.abs(actionValue), source, sourceCard));
                }
                break;

            case 'heal':
                if (target) {
                    this.modifyHealth(target, Math.abs(actionValue), source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyHealth(t, Math.abs(actionValue), source, sourceCard));
                }
                break;

            case 'modifyAttack':
                if (target) {
                    this.modifyAttack(target, actionValue, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.modifyAttack(t, actionValue, source, sourceCard));
                }
                break;

            case 'applyStatus':
                if (!action.statusId) {
                    console.warn(`效果动作缺少 statusId: ${action.type}`);
                    break;
                }
                const statusId = action.statusId;
                const stacks = action.stacks || 1;
                if (target) {
                    this.applyStatus(target, statusId, stacks, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.applyStatus(t, statusId, stacks, source, sourceCard));
                }
                break;

            case 'removeDebuffs':
                if (target) {
                    this.removeDebuffs(target, source, sourceCard);
                } else if (targets) {
                    targets.forEach(t => this.removeDebuffs(t, source, sourceCard));
                }
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
     * 施加状态
     */
    private applyStatus(target: CardSprite, statusId: string, stacks: number, source: string, sourceCard?: BaseCardSprite): void {
        const { battleLog, scene } = this.context;
        const targetData = target.getCardData();
        
        // 获取 statusManager
        const battleScene = scene as any;
        if (!battleScene.statusManager) {
            console.warn('StatusManager not available');
            return;
        }

        // 施加状态
        const success = battleScene.statusManager.applyStatus(
            targetData.id,
            statusId,
            stacks
        );

        if (success) {
            // 获取状态定义以显示名称
            const statusDef = getStatusDefinition(statusId);
            const statusName = statusDef?.name || statusId;

            // 记录日志
            const cardRefs = sourceCard ? [sourceCard, target] : [target];
            battleLog.addLog(
                `【${source}】对【${targetData.name}】施加了${stacks}层【${statusName}】！`,
                cardRefs
            );

            // 更新状态显示UI
            const statuses = battleScene.statusManager.getUnitStatuses(targetData.id);
            target.updateStatusDisplay(statuses);
        }
    }

    /**
     * 移除负面状态
     */
    private removeDebuffs(target: CardSprite, source: string, sourceCard?: BaseCardSprite): void {
        const { battleLog, scene } = this.context;
        const targetData = target.getCardData();
        
        // 获取 statusManager
        const battleScene = scene as any;
        if (!battleScene.statusManager) {
            console.warn('StatusManager not available');
            return;
        }

        // 移除所有负面状态
        battleScene.statusManager.clearDebuffs(targetData.id);

        // 记录日志
        const cardRefs = sourceCard ? [sourceCard, target] : [target];
        battleLog.addLog(
            `【${source}】移除了【${targetData.name}】的所有负面状态！`,
            cardRefs
        );

        // 更新状态显示UI
        const statuses = battleScene.statusManager.getUnitStatuses(targetData.id);
        target.updateStatusDisplay(statuses);
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
