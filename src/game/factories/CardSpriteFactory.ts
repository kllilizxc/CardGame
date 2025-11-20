import { Scene } from 'phaser';
import { CardSprite } from '../objects/CardSprite';
import { ArtifactSprite } from '../objects/ArtifactSprite';
import { TalismanSprite } from '../objects/TalismanSprite';
import { FieldSprite } from '../objects/FieldSprite';
import { PillSprite } from '../objects/PillSprite';
import type { BaseCardSprite } from '../objects/BaseCardSprite';
import type { UnitCard } from '../../../public/data/types/cards/unit';
import type { ArtifactCard } from '../../../public/data/types/cards/artifact';
import type { TalismanCard } from '../../../public/data/types/cards/talisman';
import type { FieldCard } from '../../../public/data/types/cards/field';
import type { PillCard } from '../../../public/data/types/cards/pill';

type AnyCard = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;

/**
 * 卡片精灵工厂
 * 统一管理各种卡片精灵的创建逻辑
 */
export class CardSpriteFactory {
    /**
     * 根据卡片数据创建对应的精灵
     */
    static createSprite(
        scene: Scene,
        cardData: AnyCard,
        x: number = 0,
        y: number = 0,
        scale: number = 1
    ): BaseCardSprite | null {
        switch (cardData.kind) {
            case 'unit':
                return new CardSprite(scene, x, y, cardData as UnitCard, scale);
            
            case 'artifact':
                return new ArtifactSprite(scene, x, y, cardData as ArtifactCard, scale);
            
            case 'talisman':
                return new TalismanSprite(scene, x, y, cardData as TalismanCard, scale);
            
            case 'field':
                return new FieldSprite(scene, x, y, cardData as FieldCard, scale);
            
            case 'pill':
                return new PillSprite(scene, x, y, cardData as PillCard, scale);
            
            default:
                console.warn(`不支持的卡牌类型: ${(cardData as any).kind}`);
                return null;
        }
    }

    /**
     * 批量创建卡片精灵
     */
    static createSprites(
        scene: Scene,
        cards: AnyCard[],
        scale: number = 1
    ): BaseCardSprite[] {
        return cards
            .map(card => this.createSprite(scene, card, 0, 0, scale))
            .filter((sprite): sprite is BaseCardSprite => sprite !== null);
    }
}
