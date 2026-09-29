import type { PillCard } from '../../../../public/data/types/cards/pill';
import type { BattleState } from '../../state/BattleState';

/** Keep a pure healing pill when it cannot restore any player health. */
export function canUsePillAtHealth(pill: PillCard, state: Pick<BattleState, 'playerHealth' | 'maxPlayerHealth'>): boolean {
    const healingOnly = pill.target === 'player' && pill.effects?.length > 0
        && pill.effects.every(effect => effect.actions?.length
            ? effect.actions.every(action => action.type === 'healPlayer') : false);
    return !healingOnly || state.playerHealth < state.maxPlayerHealth;
}
