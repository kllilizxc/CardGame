import type { PillCard } from '../../../../public/data/types/cards/pill';
import type { BattleState } from '../../state/BattleState';

/** A pure self-healing pill must remain in its slot when health is full. */
export function canUsePillAtHealth(pill: PillCard, state: Pick<BattleState, 'playerHealth' | 'maxPlayerHealth'>): boolean {
    const healingOnly = pill.target === 'player' && pill.effects?.length > 0
        && pill.effects.every(effect => effect.actions?.length > 0
            && effect.actions.every(action => action.type === 'healPlayer'));
    return !healingOnly || state.playerHealth < state.maxPlayerHealth;
}
