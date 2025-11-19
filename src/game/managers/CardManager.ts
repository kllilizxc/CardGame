import { Scene } from 'phaser';
import { CardSprite } from '../objects/CardSprite';
import type { UnitCard } from '../../../types/cards';
import type { BattleLog } from '../ui/BattleLog';

export class CardManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private cardScale: number;

    constructor(scene: Scene, battleLog: BattleLog, cardScale: number) {
        this.scene = scene;
        this.battleLog = battleLog;
        this.cardScale = cardScale;
    }

    // 抽一张卡
    public drawCard(deck: UnitCard[], hand: CardSprite[]): { deck: UnitCard[]; hand: CardSprite[] } {
        if (deck.length === 0) {
            console.log('牌库已空');
            this.battleLog.addLog('牌库已空，无法抽卡');
            return { deck, hand };
        }

        const cardData = deck.shift()!;
        const card = new CardSprite(this.scene, 0, 0, cardData, this.cardScale);
        hand.push(card);
        
        this.battleLog.addLog(`抽取了一张【${cardData.name}】`, [card]);
        
        return { deck, hand };
    }

    // 排列手牌
    public arrangeHand(hand: CardSprite[]): void {
        const { width, height } = this.scene.scale;
        const handY = height * 0.8;  // 手牌Y位置相对化
        const spacing = width * 0.12; // 卡牌间距为屏幕宽度的12%
        const totalWidth = (hand.length - 1) * spacing;
        const startX = width / 2 - totalWidth / 2;

        hand.forEach((card, index) => {
            const x = startX + index * spacing;
            this.scene.tweens.add({
                targets: card,
                x: x,
                y: handY,
                duration: 300,
                ease: 'Back.easeOut'
            });
            card.setOriginalPosition(x, handY);
        });
    }

    // 排列玩家场地
    public arrangePlayerField(playerField: CardSprite[]): void {
        const { width, height } = this.scene.scale;
        const fieldY = height * 0.45;  // 我方场地Y位置
        const spacing = width * 0.13;   // 卡牌间距
        const totalWidth = (playerField.length - 1) * spacing;
        const startX = width / 2 - totalWidth / 2;

        playerField.forEach((card, index) => {
            const x = startX + index * spacing;
            this.scene.tweens.add({
                targets: card,
                x: x,
                y: fieldY,
                duration: 300,
                ease: 'Back.easeOut'
            });
            card.setOriginalPosition(x, fieldY);
        });
    }

    // 排列敌方场地
    public arrangeEnemyField(enemyField: CardSprite[]): void {
        const { width, height } = this.scene.scale;
        const fieldY = height * 0.2;   // 敌方场地Y位置
        const spacing = width * 0.13;   // 卡牌间距
        const totalWidth = (enemyField.length - 1) * spacing;
        const startX = width / 2 - totalWidth / 2;

        enemyField.forEach((card, index) => {
            const x = startX + index * spacing;
            this.scene.tweens.add({
                targets: card,
                x: x,
                y: fieldY,
                duration: 300,
                ease: 'Back.easeOut'
            });
            card.setOriginalPosition(x, fieldY);
            
            // 敌人卡牌不可拖拽，但可以hover查看
            card.disableDragging();
        });
    }

    // 打出卡牌到场地
    public playCardToField(
        card: CardSprite,
        hand: CardSprite[],
        playerField: CardSprite[]
    ): { success: boolean; hand: CardSprite[]; playerField: CardSprite[] } {
        if (playerField.length < 3 && hand.includes(card)) {
            // 从手牌移除
            const index = hand.indexOf(card);
            hand.splice(index, 1);

            // 添加到场地
            playerField.push(card);

            console.log('卡牌已打出:', card.getCardData().name);
            this.battleLog.addLog(`召唤了【${card.getCardData().name}】`, [card]);
            
            return { success: true, hand, playerField };
        }
        return { success: false, hand, playerField };
    }
}
