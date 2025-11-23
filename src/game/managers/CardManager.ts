import { Scene } from 'phaser';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import type { UnitCard } from '../../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import type { TalismanCard } from '../../../public/data/types/cards/talisman';
import type { FieldCard } from '../../../public/data/types/cards/field';
import type { BattleLayoutConfig } from '../config/LayoutConfig';
import type { BattleLog } from '../ui/BattleLog';

export class CardManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private cardScale: number;
    private readonly DEFAULT_CARD_SPACING = 220; // 从 160 增加到 220，适配更大的卡片
    private readonly LAYOUT_WIDTH_PADDING = 200;

    constructor(scene: Scene, battleLog: BattleLog, cardScale: number) {
        this.scene = scene;
        this.battleLog = battleLog;
        this.cardScale = cardScale;
    }

    private layout?: BattleLayoutConfig;

    public setLayout(layout: BattleLayoutConfig): void {
        this.layout = layout;
    }

    // 抽一张卡
    public drawCard(
        deck: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[],
        hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[]
    ): { deck: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[]; hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] } {
        if (deck.length === 0) {
            console.log('牌库已空');
            this.battleLog.addLog('牌库已空，无法抽卡');
            return { deck, hand };
        }

        const cardData = deck.shift() as UnitCard | ArtifactCard | TalismanCard | FieldCard;
        let sprite: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite;
        
        if (cardData.kind === 'unit') {
            sprite = new CardSprite(this.scene, 0, 0, cardData as UnitCard, this.cardScale);
            this.battleLog.addLog(`抽取了一张【${cardData.name}】`, [sprite]);
        } else if (cardData.kind === 'artifact') {
            sprite = new ArtifactSprite(this.scene, 0, 0, cardData as ArtifactCard, this.cardScale);
            this.battleLog.addLog(`抽取了【${cardData.name}】`, [sprite]);
        } else if (cardData.kind === 'talisman') {
            sprite = new TalismanSprite(this.scene, 0, 0, cardData as TalismanCard, this.cardScale);
            this.battleLog.addLog(`抽取了【${cardData.name}】`, [sprite]);
        } else if (cardData.kind === 'field') {
            sprite = new FieldSprite(this.scene, 0, 0, cardData as FieldCard, this.cardScale);
            this.battleLog.addLog(`抽取了场地卡【${cardData.name}】`, [sprite]);
        } else {
            console.warn(`不支持的卡牌类型: ${cardData.kind}`);
            return { deck, hand };
        }
        
        hand.push(sprite);
        return { deck, hand };
    }

    // 排列手牌
    public arrangeHand(hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[]): void {
        const layoutZone = this.layout?.handZone;
        if (layoutZone) {
            const y = layoutZone.y;
            const availableWidth = Math.max(layoutZone.width - this.LAYOUT_WIDTH_PADDING, 1);
            const spacing = this.calculateSpacing(hand.length, availableWidth);
            const startX = layoutZone.x - spacing * (Math.max(hand.length - 1, 0)) / 2;

            hand.forEach((card, index) => {
                const x = startX + index * spacing;
                // 设置手牌深度
                const depth = this.layout?.depth?.handCards ?? 10;
                card.setDepth(depth);
                
                this.scene.tweens.add({
                    targets: card,
                    x,
                    y,
                    duration: 300,
                    ease: 'Back.easeOut'
                });
                card.setOriginalPosition(x, y);
            });
            return;
        }

        const { width, height } = this.scene.scale;
        const handY = height * 0.8;
        const availableWidth = width * 0.8;
        const spacing = this.calculateSpacing(hand.length, availableWidth);
        const startX = width / 2 - spacing * (Math.max(hand.length - 1, 0)) / 2;

        hand.forEach((card, index) => {
            const x = startX + index * spacing;
            // 设置手牌深度（fallback 路径）
            const depth = this.layout?.depth?.handCards ?? 10;
            card.setDepth(depth);
            
            this.scene.tweens.add({
                targets: card,
                x,
                y: handY,
                duration: 300,
                ease: 'Back.easeOut'
            });
            card.setOriginalPosition(x, handY);
        });
    }

    // 排列玩家场地
    public arrangePlayerField(playerField: CardSprite[]): void {
        const layoutZone = this.layout?.playerFieldZone;
        if (layoutZone) {
            const y = layoutZone.y;
            const availableWidth = Math.max(layoutZone.width - this.LAYOUT_WIDTH_PADDING, 1);
            const spacing = this.calculateSpacing(playerField.length, availableWidth);
            const startX = layoutZone.x - spacing * (Math.max(playerField.length - 1, 0)) / 2;

            playerField.forEach((card, index) => {
                const x = startX + index * spacing;
                // 设置场上卡牌深度
                const depth = this.layout?.depth?.fieldCards ?? 50;
                card.setDepth(depth);
                
                this.scene.tweens.add({
                    targets: card,
                    x,
                    y,
                    duration: 300,
                    ease: 'Back.easeOut'
                });
                card.setOriginalPosition(x, y);
            });
            return;
        }

        const { width, height } = this.scene.scale;
        const fieldY = height * 0.45;
        const availableWidth = width * 0.8;
        const spacing = this.calculateSpacing(playerField.length, availableWidth);
        const startX = width / 2 - spacing * (Math.max(playerField.length - 1, 0)) / 2;

        playerField.forEach((card, index) => {
            const x = startX + index * spacing;
            // 设置场上卡牌深度（fallback 路径）
            const depth = this.layout?.depth?.fieldCards ?? 50;
            card.setDepth(depth);
            
            this.scene.tweens.add({
                targets: card,
                x,
                y: fieldY,
                duration: 300,
                ease: 'Back.easeOut'
            });
            card.setOriginalPosition(x, fieldY);
        });
    }

    // 排列敌方场地
    public arrangeEnemyField(enemyField: CardSprite[]): void {
        const layoutZone = this.layout?.enemyFieldZone;
        if (layoutZone) {
            const y = layoutZone.y;
            const availableWidth = Math.max(layoutZone.width - this.LAYOUT_WIDTH_PADDING, 1);
            const spacing = this.calculateSpacing(enemyField.length, availableWidth);
            const startX = layoutZone.x - spacing * (Math.max(enemyField.length - 1, 0)) / 2;

            enemyField.forEach((card, index) => {
                const x = startX + index * spacing;
                // 设置场上卡牌深度
                const depth = this.layout?.depth?.fieldCards ?? 50;
                card.setDepth(depth);
                
                this.scene.tweens.add({
                    targets: card,
                    x,
                    y,
                    duration: 300,
                    ease: 'Back.easeOut'
                });
                card.setOriginalPosition(x, y);
                card.disableDragging();
            });
            return;
        }

        const { width, height } = this.scene.scale;
        const fieldY = height * 0.2;
        const availableWidth = width * 0.8;
        const spacing = this.calculateSpacing(enemyField.length, availableWidth);
        const startX = width / 2 - spacing * (Math.max(enemyField.length - 1, 0)) / 2;

        enemyField.forEach((card, index) => {
            const x = startX + index * spacing;
            // 设置场上卡牌深度（fallback 路径）
            const depth = this.layout?.depth?.fieldCards ?? 50;
            card.setDepth(depth);
            
            this.scene.tweens.add({
                targets: card,
                x,
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

    private calculateSpacing(cardCount: number, availableWidth: number): number {
        if (cardCount <= 1) {
            return 0;
        }

        const effectiveWidth = Math.max(availableWidth, this.DEFAULT_CARD_SPACING);
        const maxSpacing = effectiveWidth / (cardCount - 1);
        return Math.min(this.DEFAULT_CARD_SPACING, maxSpacing);
    }
}
