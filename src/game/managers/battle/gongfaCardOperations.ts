import type { ArtifactCard } from '@data/types/cards/artifact';
import type { FieldCard } from '@data/types/cards/field';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { UnitCard } from '@data/types/cards/unit';
import type {
    CardFilter,
    DrawAndFilterAction,
    RecoverCardFromDiscardAction,
    SearchCardFromDeckAction
} from '@data/types/gongfa';
import { EffectActionDestination, EffectActionType } from '@data/types/gongfa';
import { isGongfaCardFilterMatch } from './gongfaCardFilter';
import type { GongfaExpressionContext } from './gongfaExpression';

export type GongfaCardOperationCard = UnitCard | ArtifactCard | TalismanCard | FieldCard;

export type GongfaCardOperationAction =
    | RecoverCardFromDiscardAction
    | SearchCardFromDeckAction
    | DrawAndFilterAction;

export interface GongfaCardOperationHandler {
    recoverFromDiscardPile(
        amount: number,
        filterFunc: (card: GongfaCardOperationCard) => boolean
    ): void;
    searchDeck(
        amount: number,
        filterFunc: (card: GongfaCardOperationCard) => boolean
    ): void;
    searchDeckToDiscard(
        amount: number,
        filterFunc: (card: GongfaCardOperationCard) => boolean
    ): void;
    addCardToHand(card: GongfaCardOperationCard, cardScale: number): void;
}

export interface GongfaCardOperationContext {
    discardPile: GongfaCardOperationCard[];
    deck?: GongfaCardOperationCard[];
    hand?: unknown[];
    cardScale: number;
    gameActionHandler?: GongfaCardOperationHandler;
    battleLog?: {
        addLog(message: string): void;
    };
    expressionContext?: GongfaExpressionContext;
}

export function executeGongfaCardOperation(
    action: GongfaCardOperationAction,
    context: GongfaCardOperationContext
): boolean {
    switch (action.type) {
        case EffectActionType.RecoverCardFromDiscard:
            return recoverCardsFromDiscard(action, getActionAmount(action), context);
        case EffectActionType.SearchCardFromDeck:
            return searchCardsFromDeck(action, getActionAmount(action), context);
        case EffectActionType.DrawAndFilter:
            return drawAndFilterCards(action, context);
        default:
            return false;
    }
}

function getActionAmount(action: RecoverCardFromDiscardAction | SearchCardFromDeckAction): number {
    return action.amount ?? action.filter.amount ?? 1;
}

function recoverCardsFromDiscard(
    action: RecoverCardFromDiscardAction,
    amount: number,
    context: GongfaCardOperationContext
): boolean {
    if (action.destination !== EffectActionDestination.Hand) {
        console.warn(`暂不支持的功法回收目的地：${action.destination}`);
        return false;
    }

    if (!context.gameActionHandler) {
        console.warn('GameActionHandler 未提供，无法回收卡牌');
        return false;
    }

    const filterFunc = createCardFilterPredicate(action.filter, context.expressionContext);
    context.gameActionHandler.recoverFromDiscardPile(amount, filterFunc);

    return true;
}

function searchCardsFromDeck(
    action: SearchCardFromDeckAction,
    amount: number,
    context: GongfaCardOperationContext
): boolean {
    if (!context.gameActionHandler) {
        console.warn('GameActionHandler 未提供，无法检索卡牌');
        return false;
    }

    const filterFunc = createCardFilterPredicate(action.filter, context.expressionContext);

    if (action.destination === EffectActionDestination.Hand) {
        context.gameActionHandler.searchDeck(amount, filterFunc);
    } else if (action.destination === EffectActionDestination.DiscardPile) {
        context.gameActionHandler.searchDeckToDiscard(amount, filterFunc);
    } else {
        console.warn(`暂不支持的功法检索目的地：${action.destination}`);
        return false;
    }

    return true;
}

function drawAndFilterCards(
    action: DrawAndFilterAction,
    context: GongfaCardOperationContext
): boolean {
    if (!context.deck || context.deck.length === 0) {
        console.warn('[DrawAndFilter] 卡组为空或未提供');
        return false;
    }

    if (!context.gameActionHandler) {
        console.warn('[DrawAndFilter] gameActionHandler 未提供');
        return false;
    }

    const { amount, filter, matchDestination, nonMatchDestination } = action;
    const drawnCards: GongfaCardOperationCard[] = [];

    for (let i = 0; i < amount && context.deck.length > 0; i++) {
        const card = context.deck.shift();
        if (card) {
            drawnCards.push(card);
        }
    }

    if (drawnCards.length === 0) {
        return false;
    }

    const matchedCards: GongfaCardOperationCard[] = [];
    const nonMatchedCards: GongfaCardOperationCard[] = [];

    const filterFunc = createCardFilterPredicate(filter, context.expressionContext);
    for (const card of drawnCards) {
        if (filterFunc(card)) {
            matchedCards.push(card);
        } else {
            nonMatchedCards.push(card);
        }
    }

    moveCardsToDestination(matchedCards, matchDestination, context);
    moveCardsToDestination(nonMatchedCards, nonMatchDestination, context);

    context.battleLog?.addLog(
        `抽取${drawnCards.length}张卡牌，其中${matchedCards.length}张符合条件`
    );

    return true;
}

function moveCardsToDestination(
    cards: GongfaCardOperationCard[],
    destination: EffectActionDestination,
    context: GongfaCardOperationContext
): void {
    for (const card of cards) {
        switch (destination) {
            case EffectActionDestination.Hand:
                context.gameActionHandler!.addCardToHand(card, context.cardScale);
                break;
            case EffectActionDestination.DiscardPile:
                context.discardPile.push(card);
                break;
            case EffectActionDestination.DeckTop:
                context.deck?.unshift(card);
                break;
            default:
                console.warn(`不支持的目标位置：${destination}`);
                break;
        }
    }
}

function createCardFilterPredicate(
    filter: CardFilter,
    expressionContext: GongfaExpressionContext = {}
): (card: GongfaCardOperationCard) => boolean {
    return (card: GongfaCardOperationCard) => {
        try {
            return isGongfaCardFilterMatch(card, filter, expressionContext);
        } catch (error) {
            console.error(`卡牌筛选表达式计算失败: ${filter.maxStar}`, error);
            return false;
        }
    };
}
