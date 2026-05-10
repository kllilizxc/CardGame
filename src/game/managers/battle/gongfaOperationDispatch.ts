import type {
    GainArmorAction,
    GongfaAction,
    ImmediateAttackAction
} from '@data/types/gongfa';
import { EffectActionType } from '@data/types/gongfa';
import {
    executeGongfaArmorOperation,
    type GongfaArmorOperationContext
} from './gongfaArmorOperations';
import {
    executeGongfaCardOperation,
    type GongfaCardOperationAction,
    type GongfaCardOperationContext
} from './gongfaCardOperations';
import {
    executeGongfaImmediateAttackOperation,
    type GongfaImmediateAttackOperationContext
} from './gongfaAttackOperations';

export type GongfaImplementedOperationAction =
    | GongfaCardOperationAction
    | GainArmorAction
    | ImmediateAttackAction;

export type GongfaImplementedOperationType = GongfaImplementedOperationAction['type'];

export interface GongfaOperationDispatchContext {
    card: GongfaCardOperationContext;
    armor: GongfaArmorOperationContext;
    immediateAttack: GongfaImmediateAttackOperationContext;
}

export type GongfaOperationExecutor<TAction extends GongfaImplementedOperationAction> = (
    action: TAction,
    context: GongfaOperationDispatchContext
) => boolean;

export type GongfaOperationRegistry = {
    [ActionType in GongfaImplementedOperationType]: GongfaOperationExecutor<
        Extract<GongfaImplementedOperationAction, { type: ActionType }>
    >;
};

export const defaultGongfaOperationRegistry: GongfaOperationRegistry = {
    [EffectActionType.RecoverCardFromDiscard]: (action, context) =>
        executeGongfaCardOperation(action, context.card),
    [EffectActionType.SearchCardFromDeck]: (action, context) =>
        executeGongfaCardOperation(action, context.card),
    [EffectActionType.DrawAndFilter]: (action, context) =>
        executeGongfaCardOperation(action, context.card),
    [EffectActionType.GainArmor]: (action, context) =>
        executeGongfaArmorOperation(action, context.armor),
    [EffectActionType.ImmediateAttack]: (action, context) =>
        executeGongfaImmediateAttackOperation(action, context.immediateAttack)
};

export function executeGongfaActions(
    actions: readonly GongfaAction[],
    context: GongfaOperationDispatchContext,
    registry: GongfaOperationRegistry = defaultGongfaOperationRegistry
): boolean {
    let executed = false;

    for (const action of actions) {
        const actionExecuted = executeGongfaAction(action, context, registry);
        executed = executed || actionExecuted;
    }

    return executed;
}

export function executeGongfaAction(
    action: GongfaAction,
    context: GongfaOperationDispatchContext,
    registry: GongfaOperationRegistry = defaultGongfaOperationRegistry
): boolean {
    if (isImplementedGongfaOperationAction(action)) {
        return executeRegisteredGongfaOperation(action, context, registry);
    }

    warnUnsupportedGongfaAction(action);
    return false;
}

export function isImplementedGongfaOperationAction(
    action: GongfaAction
): action is GongfaImplementedOperationAction {
    switch (action.type) {
        case EffectActionType.RecoverCardFromDiscard:
        case EffectActionType.SearchCardFromDeck:
        case EffectActionType.DrawAndFilter:
        case EffectActionType.GainArmor:
        case EffectActionType.ImmediateAttack:
            return true;
        default:
            return false;
    }
}

function executeRegisteredGongfaOperation<TAction extends GongfaImplementedOperationAction>(
    action: TAction,
    context: GongfaOperationDispatchContext,
    registry: GongfaOperationRegistry
): boolean {
    const executor = registry[action.type] as GongfaOperationExecutor<TAction>;
    return executor(action, context);
}

function warnUnsupportedGongfaAction(
    action: Exclude<GongfaAction, GongfaImplementedOperationAction>
): void {
    switch (action.type) {
        case EffectActionType.DrawCards:
            console.warn('DrawCards 动作暂未实现');
            break;
        case EffectActionType.ModifyStats:
        case EffectActionType.DealDamage:
        case EffectActionType.ApplyStatus:
        case EffectActionType.AddLog:
            console.warn(`功法动作尚未实现：${action.type}`);
            break;
        case EffectActionType.Custom:
            console.warn(`自定义功法动作暂未实现：${action.scriptId}`);
            break;
        default: {
            const exhaustiveAction: never = action;
            return exhaustiveAction;
        }
    }
}
