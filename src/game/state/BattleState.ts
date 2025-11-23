import type { UnitCard } from '../../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import type { TalismanCard } from '../../../public/data/types/cards/talisman';
import type { FieldCard } from '../../../public/data/types/cards/field';
import type { CardSprite } from '../objects/CardSprite';
import type { ArtifactSprite } from '../objects/ArtifactSprite';
import type { TalismanSprite } from '../objects/TalismanSprite';
import type { FieldSprite } from '../objects/FieldSprite';

/**
 * 战斗状态管理类
 * 集中管理所有游戏状态数据，避免状态分散在 BattleScene 中
 */
export class BattleState {
    // 卡组相关
    public deck: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[] = [];
    public discardPile: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[] = [];
    public hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    
    // 场上单位
    public playerField: CardSprite[] = [];
    public enemyField: CardSprite[] = [];
    
    // 玩家状态
    public playerHealth: number = 100;
    
    // 回合状态
    public isPlayerTurn: boolean = true;
    public turnNumber: number = 1;
    public isProcessingTurn: boolean = false; // 防止重复点击结束回合
    
    // 游戏设置
    public gameSpeed: number = 1; // 游戏速度倍率（1x 或 2x）

    constructor() {
        // 初始化为默认值
    }

    /**
     * 初始化卡组
     */
    public initializeDeck(cards: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[]): void {
        this.deck = [...cards];
    }

    /**
     * 洗牌
     */
    public shuffleDeck(): void {
        // 使用 Fisher-Yates 洗牌算法
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    /**
     * 从卡组抽一张牌（仅数据层面）
     */
    public drawCardData(): (UnitCard | ArtifactCard | TalismanCard | FieldCard) | null {
        if (this.deck.length === 0) {
            return null;
        }
        return this.deck.shift() || null;
    }

    /**
     * 添加卡牌到手牌
     */
    public addToHand(card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite): void {
        this.hand.push(card);
    }

    /**
     * 从手牌移除卡牌
     */
    public removeFromHand(card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite): void {
        const index = this.hand.indexOf(card);
        if (index > -1) {
            this.hand.splice(index, 1);
        }
    }

    /**
     * 添加单位到玩家场地
     */
    public addToPlayerField(unit: CardSprite): void {
        this.playerField.push(unit);
    }

    /**
     * 添加单位到敌方场地
     */
    public addToEnemyField(unit: CardSprite): void {
        this.enemyField.push(unit);
    }

    /**
     * 从玩家场地移除单位
     */
    public removeFromPlayerField(unit: CardSprite): void {
        const index = this.playerField.indexOf(unit);
        if (index > -1) {
            this.playerField.splice(index, 1);
        }
    }

    /**
     * 从敌方场地移除单位
     */
    public removeFromEnemyField(unit: CardSprite): void {
        const index = this.enemyField.indexOf(unit);
        if (index > -1) {
            this.enemyField.splice(index, 1);
        }
    }

    /**
     * 添加卡牌到弃牌堆
     */
    public addToDiscardPile(card: UnitCard | ArtifactCard | TalismanCard | FieldCard): void {
        this.discardPile.push(card);
    }

    /**
     * 从弃牌堆移除卡牌
     */
    public removeFromDiscardPile(card: UnitCard | ArtifactCard | TalismanCard | FieldCard): void {
        const index = this.discardPile.indexOf(card);
        if (index > -1) {
            this.discardPile.splice(index, 1);
        }
    }

    /**
     * 扣除玩家生命值
     */
    public damagePlayer(amount: number): void {
        this.playerHealth = Math.max(0, this.playerHealth - amount);
    }

    /**
     * 恢复玩家生命值
     */
    public healPlayer(amount: number): void {
        this.playerHealth += amount;
    }

    /**
     * 开始新回合
     */
    public startNewTurn(): void {
        this.turnNumber++;
        this.isPlayerTurn = true;
        this.isProcessingTurn = false;
    }

    /**
     * 切换回合
     */
    public switchTurn(): void {
        this.isPlayerTurn = !this.isPlayerTurn;
    }

    /**
     * 切换游戏速度
     */
    public toggleGameSpeed(): void {
        this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
    }

    /**
     * 获取卡组剩余数量
     */
    public getDeckCount(): number {
        return this.deck.length;
    }

    /**
     * 获取弃牌堆数量
     */
    public getDiscardPileCount(): number {
        return this.discardPile.length;
    }

    /**
     * 获取手牌数量
     */
    public getHandCount(): number {
        return this.hand.length;
    }

    /**
     * 重置状态（用于重新开始游戏）
     */
    public reset(): void {
        this.deck = [];
        this.discardPile = [];
        this.hand = [];
        this.playerField = [];
        this.enemyField = [];
        this.playerHealth = 100;
        this.isPlayerTurn = true;
        this.turnNumber = 1;
        this.isProcessingTurn = false;
        this.gameSpeed = 1;
    }
}
