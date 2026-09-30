import { getWenxinBattleStage } from '../../art/wenxin/WenxinBattleStage';
import { Scene } from 'phaser';
import { CardSprite } from '../../objects/CardSprite';
import { ArtifactSprite } from '../../objects/ArtifactSprite';
import { TalismanSprite } from '../../objects/TalismanSprite';
import { FieldSprite } from '../../objects/FieldSprite';
import type { UnitCard } from '../../../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../../../public/data/types/cards/artifact';
import type { TalismanCard } from '../../../../public/data/types/cards/talisman';
import type { FieldCard } from '../../../../public/data/types/cards/field';
import type { BattleLayoutConfig } from '../../config/LayoutConfig';
import type { BattleLog } from '../../ui/battle/BattleLog';
import type { BattleAnimationManager } from './BattleAnimationManager';
import { isPortraitGameViewport } from '../../layout/gameViewport';

export class CardManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private cardScale: number;
    private animationManager?: BattleAnimationManager;
    private readonly DEFAULT_CARD_SPACING = 220; // 从 160 增加到 220，适配更大的卡片
    private readonly LAYOUT_WIDTH_PADDING = 200;

    constructor(scene: Scene, battleLog: BattleLog, cardScale: number) {
        this.scene = scene;
        this.battleLog = battleLog;
        this.cardScale = cardScale;
    }

    public setAnimationManager(animationManager: BattleAnimationManager): void {
        this.animationManager = animationManager;
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
        
        if (this.isFanLayout() && this.layout) {
            // cards peel off the top of the deck pile and fly into the hand
            const from = this.layout.deckButton;
            sprite.setPosition(from.x, from.y).setScale(0.28).setAngle(-12).setDepth(5000);
            this.scene.tweens.add({ targets: sprite, angle: 0, duration: 260, ease: 'Sine.easeOut' });
        }
        hand.push(sprite);
        return { deck, hand };
    }

    // ---- hand fan -----------------------------------------------------------------
    private static readonly FAN_REST_SCALE = 1;
    private fanHover: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite) | null = null;
    private fanHand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    private fanBound = new WeakSet<object>();
    private fanTween = new WeakMap<object, Phaser.Tweens.Tween>();
    private fanPose = new WeakMap<object, { x: number; y: number; angle: number; scale: number }>();

    private isFanLayout(): boolean {
        return !!this.layout?.handZone && !isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height);
    }

    /** Resting pose of every hand card on the arc, then the hover pose layered on top. */
    private arrangeFan(hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[]): void {
        const zone = this.layout!.handZone;
        const rest = CardManager.FAN_REST_SCALE;
        const n = hand.length;
        this.fanHand = hand;
        const cardW = 180 * rest;
        const spacing = n <= 1 ? 0 : Math.min(cardW * 0.94, (zone.width - cardW) / (n - 1));
        const mid = (n - 1) / 2;
        hand.forEach((card, i) => {
            const t = i - mid;
            const x = zone.x + t * spacing;
            const y = zone.y + 6 + t * t * (n > 6 ? 3 : 5);
            const angle = t * (n > 6 ? 2.2 : 3.2);
            card.setBaseScale(rest);
            card.setRestAngle(angle);
            card.setOriginalPosition(x, y);
            this.fanPose.set(card, { x, y, angle, scale: rest });
            if (!this.fanBound.has(card)) {
                this.fanBound.add(card);
                card.on('pointerover', () => { if (this.fanHand.includes(card)) this.setFanHover(card); });
                card.on('pointerout', () => { if (this.fanHover === card) this.setFanHover(null); });
                card.on('dragstart', () => { if (this.fanHover === card) this.fanHover = null; this.applyFan(false); });
            }
        });
        if (this.fanHover && !hand.includes(this.fanHover)) this.fanHover = null;
        this.applyFan(true);
    }

    private setFanHover(card: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite) | null): void {
        if (this.fanHover === card) return;
        this.fanHover = card;
        this.applyFan(false);
    }

    private applyFan(count: boolean): void {
        const zone = this.layout!.handZone;
        const hover = this.fanHover;
        const hoverIndex = hover ? this.fanHand.indexOf(hover) : -1;
        const depthBase = this.layout?.depth?.handCards ?? 300;
        this.fanHand.forEach((card, i) => {
            const pose = this.fanPose.get(card);
            if (!pose || (card as unknown as { isDragging?: boolean }).isDragging) return;
            let { x, y, angle, scale } = pose;
            let depth = depthBase + i;
            if (hoverIndex >= 0) {
                if (i === hoverIndex) {
                    y = zone.y - 96; angle = 0; scale = 1; depth = depthBase + 200;
                } else {
                    x += (i < hoverIndex ? -1 : 1) * Math.max(0, 62 - Math.abs(i - hoverIndex) * 14);
                }
            }
            card.setDepth(depth);
            if (count && this.animationManager) {
                // initial layout / re-layout: counted, so combat ticks wait for the hand to settle
                this.animationManager.playCardMoveAnimation(card, x, y, () => { card.setOriginalPosition(pose.x, pose.y); });
                this.scene.tweens.add({ targets: card, angle, scale, duration: 300, ease: 'Back.easeOut' });
            } else {
                this.fanTween.get(card)?.stop();
                this.fanTween.set(card, this.scene.tweens.add({ targets: card, x, y, angle, scale, duration: 150, ease: 'Cubic.easeOut' }));
            }
        });
    }

    // 排列手牌
    public arrangeHand(hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[]): void {
        hand.forEach(card => { if (card instanceof CardSprite) card.setBattlePresentation(); });
        if (this.isFanLayout()) { this.arrangeFan(hand); return; }
        const layoutZone = this.layout?.handZone;
        if (layoutZone) {
            const y = layoutZone.y;
            const portrait = isPortraitGameViewport(this.scene.scale.width, this.scene.scale.height);
            const availableWidth = Math.max(layoutZone.width - (portrait ? 180 * this.cardScale + 22 : this.LAYOUT_WIDTH_PADDING), 1);
            const spacing = this.calculateSpacing(hand.length, availableWidth);
            const startX = layoutZone.x - spacing * (Math.max(hand.length - 1, 0)) / 2;

            hand.forEach((card, index) => {
                const x = startX + index * spacing;
                // 设置手牌深度
                const depth = this.layout?.depth?.handCards ?? 10;
                card.setDepth(depth);
                
                if (this.animationManager) {
                    this.animationManager.playCardMoveAnimation(card, x, y, () => {
                        card.setOriginalPosition(x, y);
                    });
                } else {
                    card.setPosition(x, y);
                    card.setOriginalPosition(x, y);
                }
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
            
            if (this.animationManager) {
                this.animationManager.playCardMoveAnimation(card, x, handY, () => {
                    card.setOriginalPosition(x, handY);
                });
            } else {
                card.setPosition(x, handY);
                card.setOriginalPosition(x, handY);
            }
        });
    }

    // 排列玩家场地
    public arrangePlayerField(playerField: CardSprite[]): void {
        const stage = getWenxinBattleStage(this.scene);
        if (stage) { stage.arrange(playerField, 'me'); return; }
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
                
                if (this.animationManager) {
                    this.animationManager.playCardMoveAnimation(card, x, y, () => {
                        card.setOriginalPosition(x, y);
                    });
                } else {
                    card.setPosition(x, y);
                    card.setOriginalPosition(x, y);
                }
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
            
            if (this.animationManager) {
                this.animationManager.playCardMoveAnimation(card, x, fieldY, () => {
                    card.setOriginalPosition(x, fieldY);
                });
            } else {
                card.setPosition(x, fieldY);
                card.setOriginalPosition(x, fieldY);
            }
        });
    }

    // 排列敌方场地
    public arrangeEnemyField(enemyField: CardSprite[]): void {
        const stage = getWenxinBattleStage(this.scene);
        if (stage) { stage.arrange(enemyField, 'foe'); return; }
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
                
                if (this.animationManager) {
                    this.animationManager.playCardMoveAnimation(card, x, y, () => {
                        card.setOriginalPosition(x, y);
                    });
                } else {
                    card.setPosition(x, y);
                    card.setOriginalPosition(x, y);
                }
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
            
            if (this.animationManager) {
                this.animationManager.playCardMoveAnimation(card, x, fieldY, () => {
                    card.setOriginalPosition(x, fieldY);
                });
            } else {
                card.setPosition(x, fieldY);
                card.setOriginalPosition(x, fieldY);
            }
            
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
