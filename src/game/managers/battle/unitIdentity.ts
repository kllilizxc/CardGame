import type { CardSprite } from '../../objects/CardSprite';

/** Catalog IDs identify card types; runtime statuses belong to one copy on the board. */
export function getUnitStateId(unit: CardSprite): string {
    return unit.battleInstanceId ?? unit.getCardData().id;
}
