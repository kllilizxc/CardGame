import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import {
  EffectActionDestination,
  EffectActionType,
  type DrawAndFilterAction,
  type RecoverCardFromDiscardAction,
  type SearchCardFromDeckAction,
} from '@data/types/gongfa';
import {
  executeGongfaCardOperation,
  type GongfaCardOperationHandler,
} from './gongfaCardOperations';

function collectConsole(run: () => boolean): { result: boolean; warnings: string[]; errors: string[] } {
  const originalWarn = console.warn;
  const originalError = console.error;
  const warnings: string[] = [];
  const errors: string[] = [];

  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  console.error = (message?: unknown) => {
    errors.push(String(message));
  };

  try {
    return { result: run(), warnings, errors };
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function createArtifact(id: string, gradeId: string, weaponType: ArtifactCard['weaponType'] = '剑'): ArtifactCard {
  return {
    id,
    name: id,
    kind: 'artifact',
    gradeId,
    equipTarget: 'unit',
    weaponType,
    elements: ['金'],
  } as ArtifactCard;
}

function createGameActionHandler(
  overrides: Partial<GongfaCardOperationHandler> = {},
): GongfaCardOperationHandler {
  return {
    recoverFromDiscardPile: () => undefined,
    searchDeck: () => undefined,
    searchDeckToDiscard: () => undefined,
    addCardToHand: () => undefined,
    ...overrides,
  };
}

describe('gongfaCardOperations amount and destination adapters', () => {
  it('keeps action amount ahead of filter amount for recover and uses filter amount as search fallback', () => {
    const recoverCalls: Array<{ amount: number; matches: boolean[] }> = [];
    const searchCalls: Array<{ amount: number; matches: boolean[] }> = [];
    const mysticSword = createArtifact('artifact.mystic_sword', 'grade_mystic_lower');
    const heavenSword = createArtifact('artifact.heaven_sword', 'grade_heaven_lower');
    const gameActionHandler = createGameActionHandler({
      recoverFromDiscardPile: (amount, filterFunc) => {
        recoverCalls.push({ amount, matches: [filterFunc(mysticSword), filterFunc(heavenSword)] });
      },
      searchDeck: (amount, filterFunc) => {
        searchCalls.push({ amount, matches: [filterFunc(mysticSword), filterFunc(heavenSword)] });
      },
    });
    const recoverAction: RecoverCardFromDiscardAction = {
      type: EffectActionType.RecoverCardFromDiscard,
      filter: {
        kind: ['artifact'],
        weaponTypesAnyOf: ['剑'],
        maxStar: 'card.star + 1',
        amount: 1,
      },
      destination: EffectActionDestination.Hand,
      amount: 3,
    };
    const searchAction: SearchCardFromDeckAction = {
      type: EffectActionType.SearchCardFromDeck,
      filter: {
        kind: ['artifact'],
        weaponTypesAnyOf: ['剑'],
        maxStar: 'card.star + 1',
        amount: 2,
      },
      destination: EffectActionDestination.Hand,
    };
    const context = {
      discardPile: [],
      hand: [],
      cardScale: 1,
      expressionContext: { cardStar: 2 },
      gameActionHandler,
    };

    expect(executeGongfaCardOperation(recoverAction, context)).toBe(true);
    expect(executeGongfaCardOperation(searchAction, context)).toBe(true);

    expect(recoverCalls).toEqual([{ amount: 3, matches: [true, false] }]);
    expect(searchCalls).toEqual([{ amount: 2, matches: [true, false] }]);
  });

  it('routes search destinations and warns without side effects for unsupported recover destinations', () => {
    const searchToHandAmounts: number[] = [];
    const searchToDiscardAmounts: number[] = [];
    const gameActionHandler = createGameActionHandler({
      recoverFromDiscardPile: () => {
        throw new Error('recover should not run for unsupported destination');
      },
      searchDeck: (amount: number) => searchToHandAmounts.push(amount),
      searchDeckToDiscard: (amount: number) => searchToDiscardAmounts.push(amount),
    });
    const baseSearch = {
      type: EffectActionType.SearchCardFromDeck,
      filter: { kind: ['artifact'] },
      amount: 1,
    } satisfies Omit<SearchCardFromDeckAction, 'destination'>;
    const recoverToField: RecoverCardFromDiscardAction = {
      type: EffectActionType.RecoverCardFromDiscard,
      filter: { kind: ['artifact'] },
      destination: EffectActionDestination.Field,
      amount: 1,
    };

    const consoleOutput = collectConsole(() => {
      const handResult = executeGongfaCardOperation(
        { ...baseSearch, destination: EffectActionDestination.Hand },
        { discardPile: [], hand: [], cardScale: 1, gameActionHandler },
      );
      const discardResult = executeGongfaCardOperation(
        { ...baseSearch, destination: EffectActionDestination.DiscardPile },
        { discardPile: [], hand: [], cardScale: 1, gameActionHandler },
      );
      const recoverResult = executeGongfaCardOperation(
        recoverToField,
        { discardPile: [], hand: [], cardScale: 1, gameActionHandler },
      );

      return handResult && discardResult && recoverResult;
    });

    expect(searchToHandAmounts).toEqual([1]);
    expect(searchToDiscardAmounts).toEqual([1]);
    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual(['暂不支持的功法回收目的地：Field']);
    expect(consoleOutput.errors).toEqual([]);
  });
});

describe('gongfaCardOperations missing-runtime warnings', () => {
  it('keeps missing handler and missing deck warnings exact without mutating piles', () => {
    const deck = [createArtifact('artifact.deck_card', 'grade_mystic_lower')];
    const discardPile: ArtifactCard[] = [];
    const recoverAction: RecoverCardFromDiscardAction = {
      type: EffectActionType.RecoverCardFromDiscard,
      filter: { kind: ['artifact'] },
      destination: EffectActionDestination.Hand,
      amount: 1,
    };
    const searchAction: SearchCardFromDeckAction = {
      type: EffectActionType.SearchCardFromDeck,
      filter: { kind: ['artifact'] },
      destination: EffectActionDestination.Hand,
      amount: 1,
    };
    const drawAction: DrawAndFilterAction = {
      type: EffectActionType.DrawAndFilter,
      amount: 1,
      filter: { kind: ['artifact'] },
      matchDestination: EffectActionDestination.Hand,
      nonMatchDestination: EffectActionDestination.DiscardPile,
    };

    const consoleOutput = collectConsole(() => {
      const recoverResult = executeGongfaCardOperation(recoverAction, { discardPile, hand: [], cardScale: 1 });
      const searchResult = executeGongfaCardOperation(searchAction, { discardPile, hand: [], cardScale: 1 });
      const missingDeckResult = executeGongfaCardOperation(drawAction, { discardPile, hand: [], cardScale: 1 });
      const missingHandlerResult = executeGongfaCardOperation(drawAction, { discardPile, deck, hand: [], cardScale: 1 });

      return recoverResult || searchResult || missingDeckResult || missingHandlerResult;
    });

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual([
      'GameActionHandler 未提供，无法回收卡牌',
      'GameActionHandler 未提供，无法检索卡牌',
      '[DrawAndFilter] 卡组为空或未提供',
      '[DrawAndFilter] gameActionHandler 未提供',
    ]);
    expect(consoleOutput.errors).toEqual([]);
    expect(deck).toEqual([createArtifact('artifact.deck_card', 'grade_mystic_lower')]);
    expect(discardPile).toEqual([]);
  });
});

describe('gongfaCardOperations draw-and-filter movement', () => {
  it('draws from deck top, moves matching and non-matching cards, and keeps the existing log text', () => {
    const mysticSword = createArtifact('artifact.mystic_sword', 'grade_mystic_lower');
    const heavenSword = createArtifact('artifact.heaven_sword', 'grade_heaven_lower');
    const mysticBlade = createArtifact('artifact.mystic_blade', 'grade_mystic_lower', '刀');
    const leftoverSword = createArtifact('artifact.leftover_sword', 'grade_mystic_lower');
    const deck = [mysticSword, heavenSword, mysticBlade, leftoverSword];
    const discardPile: ArtifactCard[] = [];
    const handAdds: Array<{ card: ArtifactCard; scale: number }> = [];
    const logs: string[] = [];
    const action: DrawAndFilterAction = {
      type: EffectActionType.DrawAndFilter,
      amount: 3,
      filter: {
        kind: ['artifact'],
        weaponTypesAnyOf: ['剑'],
        maxStar: 'card.star + 1',
      },
      matchDestination: EffectActionDestination.Hand,
      nonMatchDestination: EffectActionDestination.DiscardPile,
    };

    const result = executeGongfaCardOperation(action, {
      discardPile,
      deck,
      hand: [],
      cardScale: 1.5,
      expressionContext: { cardStar: 2 },
      gameActionHandler: createGameActionHandler({
        addCardToHand: (card, scale) => handAdds.push({ card: card as ArtifactCard, scale }),
      }),
      battleLog: {
        addLog: (message: string) => logs.push(message),
      },
    });

    expect(result).toBe(true);
    expect(handAdds).toEqual([{ card: mysticSword, scale: 1.5 }]);
    expect(discardPile).toEqual([heavenSword, mysticBlade]);
    expect(deck).toEqual([leftoverSword]);
    expect(logs).toEqual(['抽取3张卡牌，其中1张符合条件']);
  });

  it('keeps current DeckTop insertion order for matched cards', () => {
    const firstMatch = createArtifact('artifact.first_match', 'grade_mystic_lower');
    const secondMatch = createArtifact('artifact.second_match', 'grade_mystic_lower');
    const nonMatch = createArtifact('artifact.non_match', 'grade_heaven_lower');
    const leftover = createArtifact('artifact.leftover', 'grade_mystic_lower');
    const deck = [firstMatch, secondMatch, nonMatch, leftover];
    const discardPile: ArtifactCard[] = [];
    const action: DrawAndFilterAction = {
      type: EffectActionType.DrawAndFilter,
      amount: 3,
      filter: {
        kind: ['artifact'],
        weaponTypesAnyOf: ['剑'],
        maxStar: 'card.star + 1',
      },
      matchDestination: EffectActionDestination.DeckTop,
      nonMatchDestination: EffectActionDestination.DiscardPile,
    };

    const result = executeGongfaCardOperation(action, {
      discardPile,
      deck,
      hand: [],
      cardScale: 1,
      expressionContext: { cardStar: 2 },
      gameActionHandler: createGameActionHandler(),
      battleLog: { addLog: () => undefined },
    });

    expect(result).toBe(true);
    expect(deck).toEqual([secondMatch, firstMatch, leftover]);
    expect(discardPile).toEqual([nonMatch]);
  });
});
