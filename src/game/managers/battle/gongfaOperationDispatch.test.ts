import { describe, expect, it } from 'bun:test';

import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import {
  EffectActionDestination,
  EffectActionType,
  type GongfaAction,
} from '@data/types/gongfa';
import type { CardSprite } from '../../objects/CardSprite';
import {
  executeGongfaActions,
  type GongfaOperationDispatchContext,
} from './gongfaOperationDispatch';

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

function createUnitSprite(overrides: Partial<UnitCard> = {}): CardSprite {
  const cardData = {
    id: 'unit.test_dispatch_owner',
    name: '调度修士',
    kind: 'unit',
    realmId: 'realm_qi_1',
    attack: 4,
    health: 20,
    ...overrides,
  } as UnitCard;

  return {
    getCardData: () => cardData,
  } as unknown as CardSprite;
}

function createArtifact(overrides: Partial<ArtifactCard> = {}): ArtifactCard {
  return {
    id: 'artifact.test_dispatch_card',
    name: '调度法器',
    kind: 'artifact',
    gradeId: 'grade_mystic_lower',
    equipTarget: 'unit',
    weaponType: '剑',
    elements: ['金'],
    ...overrides,
  } as ArtifactCard;
}

describe('gongfaOperationDispatch implemented operation registry', () => {
  it('delegates card-flow, GainArmor, and ImmediateAttack actions in order and ORs execution results', () => {
    const triggerUnit = createUnitSprite();
    const enemy = createUnitSprite({ id: 'enemy.test_dispatch_target', name: '调度傀儡', health: 9 });
    const drawnCard = createArtifact({ id: 'artifact.drawn_match' });
    const leftoverCard = createArtifact({ id: 'artifact.leftover' });
    const deck = [drawnCard, leftoverCard];
    const discardPile: ArtifactCard[] = [];
    const orderedEvents: string[] = [];
    const context: GongfaOperationDispatchContext = {
      card: {
        discardPile,
        deck,
        hand: [],
        cardScale: 1.5,
        expressionContext: { cardStar: 2 },
        gameActionHandler: {
          recoverFromDiscardPile: (amount, filterFunc) => {
            orderedEvents.push(`recover:${amount}:${filterFunc(createArtifact())}`);
          },
          searchDeck: (amount, filterFunc) => {
            orderedEvents.push(`search:${amount}:${filterFunc(createArtifact())}`);
          },
          searchDeckToDiscard: () => {
            throw new Error('searchDeckToDiscard should not be used by this dispatch test');
          },
          addCardToHand: (card, cardScale) => {
            orderedEvents.push(`hand:${card.id}:${cardScale}`);
          },
        },
        battleLog: {
          addLog: (message: string) => orderedEvents.push(`card-log:${message}`),
        },
      },
      armor: {
        triggerUnit,
        battleStatusController: {
          applyStatusToUnit: (unitId, statusId, value, target) => {
            orderedEvents.push(`armor-status:${unitId}:${statusId}:${value}:${target === triggerUnit}`);
          },
        },
        battleLog: {
          addLog: (message: string) => orderedEvents.push(`armor-log:${message}`),
        },
        evaluateExpression: (expression: string) => {
          orderedEvents.push(`eval:${expression}`);
          return 6;
        },
      },
      immediateAttack: {
        triggerUnit,
        enemyField: [enemy],
        equippedArtifact: createArtifact({ id: 'artifact.attack_bonus', attackBonus: 2 }),
        combatManager: {
          performSingleAttack: (_attacker, target, damage, _delay, isAOE) => {
            orderedEvents.push(`attack:${damage}:${target === enemy}:${isAOE}`);
          },
        },
        battleLog: {
          addLog: (message: string) => orderedEvents.push(`attack-log:${message}`),
        },
      },
    };
    const actions: GongfaAction[] = [
      {
        type: EffectActionType.RecoverCardFromDiscard,
        filter: { kind: ['artifact'] },
        destination: EffectActionDestination.Hand,
        amount: 1,
      },
      {
        type: EffectActionType.SearchCardFromDeck,
        filter: { kind: ['artifact'] },
        destination: EffectActionDestination.Hand,
        amount: 2,
      },
      {
        type: EffectActionType.DrawAndFilter,
        amount: 1,
        filter: { kind: ['artifact'] },
        matchDestination: EffectActionDestination.Hand,
        nonMatchDestination: EffectActionDestination.DiscardPile,
      },
      {
        type: EffectActionType.GainArmor,
        target: 'self',
        value: 'artifact.star * 2',
      },
      {
        type: EffectActionType.ImmediateAttack,
        target: 'singleEnemy',
      },
    ];

    const executed = executeGongfaActions(actions, context);

    expect(executed).toBe(true);
    expect(orderedEvents).toEqual([
      'recover:1:true',
      'search:2:true',
      'hand:artifact.drawn_match:1.5',
      'card-log:抽取1张卡牌，其中1张符合条件',
      'eval:artifact.star * 2',
      'armor-log:【调度修士】获得 6 点护甲',
      'armor-status:unit.test_dispatch_owner:armor:6:true',
      'attack-log:【调度修士】触发控剑术，立即发动攻击（6点伤害）',
      'attack:6:true:false',
    ]);
    expect(deck).toEqual([leftoverCard]);
    expect(discardPile).toEqual([]);
  });
});

describe('gongfaOperationDispatch unsupported actions', () => {
  it('keeps unsupported action warnings exact and returns unexecuted', () => {
    const context: GongfaOperationDispatchContext = {
      card: {
        discardPile: [],
        hand: [],
        cardScale: 1,
      },
      armor: {
        battleLog: {
          addLog: () => {
            throw new Error('unsupported actions must not log armor side effects');
          },
        },
        evaluateExpression: () => {
          throw new Error('unsupported actions must not evaluate armor expressions');
        },
      },
      immediateAttack: {
        battleLog: {
          addLog: () => {
            throw new Error('unsupported actions must not log attack side effects');
          },
        },
      },
    };
    const actions: GongfaAction[] = [
      { type: EffectActionType.DrawCards, value: 2 },
      { type: EffectActionType.ModifyStats, attackDelta: 1 },
      { type: EffectActionType.DealDamage, value: 3, target: 'singleEnemy' },
      { type: EffectActionType.ApplyStatus, statusId: 'armor', target: 'self' },
      { type: EffectActionType.AddLog, message: 'unsupported log' },
      { type: EffectActionType.Custom, scriptId: 'script.unsupported' },
    ];

    const consoleOutput = collectConsole(() => executeGongfaActions(actions, context));

    expect(consoleOutput.result).toBe(false);
    expect(consoleOutput.warnings).toEqual([
      'DrawCards 动作暂未实现',
      '功法动作尚未实现：ModifyStats',
      '功法动作尚未实现：DealDamage',
      '功法动作尚未实现：ApplyStatus',
      '功法动作尚未实现：AddLog',
      '自定义功法动作暂未实现：script.unsupported',
    ]);
    expect(consoleOutput.errors).toEqual([]);
  });
});
