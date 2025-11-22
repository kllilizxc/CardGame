import type { Scene } from 'phaser';
import type { BattleLog } from '../ui/BattleLog';
import type { CardManager } from './CardManager';
import type { BattleAnimationManager } from './BattleAnimationManager';
import { getUnitStar } from '../utils/RealmHelper';
import { CardSpriteFactory } from '../factories/CardSpriteFactory';
import type { CardSprite } from '../objects/CardSprite';
import type {
    Gongfa,
    EffectAction,
    EffectCondition,
    EffectSchema,
    RecoverCardFromDiscardAction,
    CardFilter
} from '@data/types/gongfa';
import { EffectEventType, EffectEventSide, EffectConditionType, EffectActionType, EffectActionDestination } from '@data/types/gongfa';
import type { UnitCard } from '@data/types/cards/unit';
import type { ArtifactCard, ArtifactWeaponType } from '@data/types/cards/artifact';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { FieldCard } from '@data/types/cards/field';
import { describeGongfa } from '../utils/GongfaDescriptionBuilder';

type AnyHandSprite = CardSprite | import('../objects/ArtifactSprite').ArtifactSprite | import('../objects/TalismanSprite').TalismanSprite | import('../objects/FieldSprite').FieldSprite;

export interface GongfaRuntimeContext {
    playerField: CardSprite[];
    discardPile: (UnitCard | ArtifactCard | TalismanCard | FieldCard)[];
    hand: AnyHandSprite[];
    discardPileButton?: Phaser.GameObjects.Rectangle;
    cardScale: number;
    artifactUsage: Partial<Record<ArtifactWeaponType, number>>;
}

const KNOWN_WEAPON_TYPES: ArtifactWeaponType[] = ['剑', '刀', '鞭', '枪', '锤', '弓', '尺', '印', '棍', '棒', '毒', '琴', '笛子', '拳套', '符箓', '斧头', '匕首', '飞镖', '扇子'];

export class UnitEffectManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private cardManager: CardManager;
    private animationManager: BattleAnimationManager;
    private gongfaMap: Map<string, Gongfa> = new Map();

    constructor(
        scene: Scene,
        battleLog: BattleLog,
        cardManager: CardManager,
        animationManager: BattleAnimationManager,
        gongfaList: Gongfa[]
    ) {
        this.scene = scene;
        this.battleLog = battleLog;
        this.cardManager = cardManager;
        this.animationManager = animationManager;

        gongfaList.forEach(gongfa => {
            const description = gongfa.description ?? describeGongfa(gongfa.schema);
            this.gongfaMap.set(gongfa.id, { ...gongfa, description });
        });
    }

    public applyTurnEndEffectsForPlayerUnits(playerField: CardSprite[], context: GongfaRuntimeContext): void {
        playerField.forEach(unit => {
            this.executeUnitGongfa(unit, EffectEventType.TurnEnd, EffectEventSide.Ally, context);
        });
    }

    private executeUnitGongfa(
        unit: CardSprite,
        eventType: EffectEventType,
        side: EffectEventSide,
        context: GongfaRuntimeContext
    ): void {
        const cardData = unit.getCardData();
        const gongfaIds = cardData.gongfaIds || [];

        gongfaIds.forEach(id => {
            const gongfa = this.gongfaMap.get(id);
            if (!gongfa) {
                return;
            }

            if (!this.isEventMatch(gongfa.schema.event, eventType, side)) {
                return;
            }

            if (!this.areConditionsSatisfied(gongfa.schema.conditions || [], context)) {
                return;
            }

            const executed = this.executeActions(gongfa.schema.actions, context);
            if (executed) {
                const displayName = gongfa.name || id;
                const description = gongfa.description || '无描述';
                this.battleLog.addGongfaLog(cardData.name, displayName, description, [unit]);
            }
        });
    }

    private isEventMatch(event: EffectSchema['event'], currentType: EffectEventType, currentSide: EffectEventSide): boolean {
        if (event.type === EffectEventType.Custom) {
            return event.type === currentType && event.side === currentSide;
        }

        if (event.type !== currentType) {
            return false;
        }

        if (!event.side || event.side === EffectEventSide.Any) {
            return true;
        }

        return event.side === currentSide;
    }

    private areConditionsSatisfied(conditions: EffectCondition[], context: GongfaRuntimeContext): boolean {
        return conditions.every(condition => {
            switch (condition.type) {
                case EffectConditionType.ArtifactUsedThisTurn: {
                    const weaponType = condition.weaponType;
                    const minimum = condition.minimum ?? 1;
                    if (weaponType) {
                        const count = context.artifactUsage[weaponType] ?? 0;
                        return count >= minimum;
                    }
                    const total = Object.values(context.artifactUsage).reduce((sum, value) => sum + value, 0);
                    return total >= minimum;
                }
                case EffectConditionType.UnitOnField: {
                    if (!condition.unitId && !condition.requiredLabelsAnyOf) {
                        return true;
                    }
                    return context.playerField.some(fieldUnit => {
                        const data = fieldUnit.getCardData();
                        if (condition.unitId && data.id !== condition.unitId) {
                            return false;
                        }
                        if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
                            const labels = data.labels || [];
                            return condition.requiredLabelsAnyOf.some(label => labels.includes(label));
                        }
                        return true;
                    });
                }
                case EffectConditionType.CardInHand: {
                    const minimum = condition.minimum ?? 1;
                    let count = 0;
                    context.hand.forEach(cardSprite => {
                        const data = cardSprite.getCardData();
                        if (condition.requiredLabelsAnyOf && condition.requiredLabelsAnyOf.length > 0) {
                            const labels = data.labels || [];
                            if (condition.requiredLabelsAnyOf.some(label => labels.includes(label))) {
                                count++;
                            }
                        } else {
                            count++;
                        }
                    });
                    return count >= minimum;
                }
                case EffectConditionType.Custom:
                    console.warn(`自定义功法条件暂未实现：${condition.scriptId}`);
                    return false;
                default:
                    return false;
            }
        });
    }

    private executeActions(actions: EffectAction[], context: GongfaRuntimeContext): boolean {
        let executed = false;
        for (const action of actions) {
            switch (action.type) {
                case EffectActionType.RecoverCardFromDiscard: {
                    const recoverAction = action as RecoverCardFromDiscardAction;
                    const amount = recoverAction.amount ?? recoverAction.filter.amount ?? 1;
                    const recovered = this.recoverCardsFromDiscard(recoverAction, amount, context);
                    executed = executed || recovered;
                    break;
                }
                case EffectActionType.DrawCards: {
                    console.warn('DrawCards 动作暂未实现');
                    break;
                }
                case EffectActionType.ModifyStats:
                case EffectActionType.DealDamage:
                case EffectActionType.ApplyStatus:
                case EffectActionType.AddLog: {
                    console.warn(`功法动作尚未实现：${action.type}`);
                    break;
                }
                case EffectActionType.Custom: {
                    const customAction = action as Extract<EffectAction, { type: EffectActionType.Custom }>;
                    console.warn(`自定义功法动作暂未实现：${customAction.scriptId}`);
                    break;
                }
                default:
                    break;
            }
        }
        return executed;
    }

    private recoverCardsFromDiscard(
        action: RecoverCardFromDiscardAction,
        amount: number,
        context: GongfaRuntimeContext
    ): boolean {
        if (action.destination !== EffectActionDestination.Hand) {
            console.warn(`暂不支持的功法回收目的地：${action.destination}`);
            return false;
        }

        let recovered = 0;
        for (let i = context.discardPile.length - 1; i >= 0 && recovered < amount; i--) {
            const card = context.discardPile[i];
            if (!this.isCardMatchFilter(card, action.filter)) {
                continue;
            }

            context.discardPile.splice(i, 1);
            if (context.discardPileButton) {
                const countText = context.discardPileButton.getData('countText') as Phaser.GameObjects.Text;
                if (countText) {
                    countText.setText(`${context.discardPile.length}`);
                }
            }

            // 从动画管理器获取弃牌堆起点位置，让动画方向为“弃牌堆 → 手牌”
            const { x: startX, y: startY } = this.animationManager.getDiscardPileCardSpawnPosition();
            const sprite = CardSpriteFactory.createSprite(this.scene, card, startX, startY, context.cardScale);
            if (sprite) {
                context.hand.push(sprite as AnyHandSprite);
                this.cardManager.arrangeHand(context.hand as any);
            }
            recovered++;
        }

        return recovered > 0;
    }

    private isCardMatchFilter(card: UnitCard | ArtifactCard | TalismanCard | FieldCard, filter: CardFilter): boolean {
        if (filter.kind && !filter.kind.includes(card.kind)) {
            return false;
        }

        if (filter.labelsAnyOf && filter.labelsAnyOf.length > 0) {
            const labels = card.labels || [];
            if (!filter.labelsAnyOf.some(label => labels.includes(label))) {
                return false;
            }
        }

        if (filter.weaponTypesAnyOf && filter.weaponTypesAnyOf.length > 0) {
            if (card.kind !== 'artifact') {
                return false;
            }
            const artifact = card as ArtifactCard;
            const weaponType = artifact.weaponType || this.extractWeaponTypeFromLabels(artifact.labels || []);
            if (!weaponType || !filter.weaponTypesAnyOf.includes(weaponType)) {
                return false;
            }
        }

        if (typeof filter.maxStar === 'number') {
            if (card.kind === 'unit') {
                const star = getUnitStar(card);
                if (star > filter.maxStar) {
                    return false;
                }
            }
        }

        return true;
    }

    private extractWeaponTypeFromLabels(labels: string[]): ArtifactWeaponType | undefined {
        if (!labels) {
            return undefined;
        }
        const match = labels.find(label => KNOWN_WEAPON_TYPES.some(type => label.includes(type)));
        if (!match) {
            return undefined;
        }
        return KNOWN_WEAPON_TYPES.find(type => match.includes(type));
    }
}
