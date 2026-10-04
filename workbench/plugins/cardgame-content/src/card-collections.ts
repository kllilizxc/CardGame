/** CardGame's six source collections. Keep paths and array keys in one place. */
export const CARD_COLLECTIONS = {
  unit: { path: 'public/data/cards/units.json', key: 'units', inDeck: true },
  artifact: { path: 'public/data/cards/artifacts.json', key: 'artifacts', inDeck: true },
  talisman: { path: 'public/data/cards/talismans.json', key: 'talismans', inDeck: true },
  field: { path: 'public/data/cards/fields.json', key: 'fields', inDeck: true },
  skill: { path: 'public/data/cards/skills.json', key: 'skills', inDeck: false },
  pill: { path: 'public/data/cards/pills.json', key: 'pills', inDeck: false },
} as const;

export type CardKind = keyof typeof CARD_COLLECTIONS;

export function cardCollection(kind: unknown): typeof CARD_COLLECTIONS[CardKind] {
  if (typeof kind !== 'string' || !Object.hasOwn(CARD_COLLECTIONS, kind)) throw Error(`不支持的卡牌类别：${String(kind)}`);
  return CARD_COLLECTIONS[kind as CardKind];
}
