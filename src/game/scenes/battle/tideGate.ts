import type { UnitCard } from '@data/types/cards/unit';

export const TIDE_DRAGON_ID = 'CR_QY_TIDE_DRAGON';
export const TIDE_SCOUT_ID = 'CR_QY_TIDE_SCOUT';
export const TIDE_SEAL_ID = 'AR_QY_TIDE_SEAL';

export class TideGate<Dragon extends object> {
    private readonly tributes = new WeakMap<Dragon, { scout: UnitCard; summonedTurn: number }>();
    private action?: { dragon: Dragon; turn: number };

    bindSacrifice(dragon: Dragon, dragonId: string, tributes: readonly UnitCard[], summonedTurn: number): boolean {
        const scout = tributes.find(card => card.id === TIDE_SCOUT_ID);
        if (dragonId !== TIDE_DRAGON_ID || !scout) return false;
        this.tributes.set(dragon, { scout, summonedTurn });
        return true;
    }

    canOpen(dragon: Dragon, discard: readonly { id: string }[], hasSeal: boolean, turn: number): boolean {
        const tribute = this.tributes.get(dragon);
        return !this.action && hasSeal && tribute !== undefined
            && turn > tribute.summonedTurn && discard.includes(tribute.scout);
    }

    open(dragon: Dragon, discard: { id: string }[], hasSeal: boolean, turn: number): UnitCard | null {
        if (!this.canOpen(dragon, discard, hasSeal, turn)) return null;
        const tribute = this.tributes.get(dragon)!.scout;
        discard.splice(discard.indexOf(tribute), 1);
        this.action = { dragon, turn };
        return tribute;
    }

    wasOpened(): boolean {
        return this.action !== undefined;
    }

    isCrossing(dragon: Dragon, turn: number): boolean {
        return this.tributes.get(dragon)?.summonedTurn === turn;
    }

    skipsAttack(dragon: Dragon, turn: number): boolean {
        return this.isCrossing(dragon, turn) || (this.action?.dragon === dragon && this.action.turn === turn);
    }
}
