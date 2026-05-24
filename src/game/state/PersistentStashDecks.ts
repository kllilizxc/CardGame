import type {
    ExpeditionCardStack,
    PersistentStash,
    SavedDeck,
} from '../types/expedition';

export const DEFAULT_SAVED_DECK_ID = 'starter-deck';
export const DEFAULT_SAVED_DECK_NAME = 'Starter Deck';

export const DECK_CARD_MIN = 20;
export const DECK_CARD_MAX = 40;

export type DeckValidityReason =
    | { readonly kind: 'too-few-cards'; readonly count: number; readonly min: number }
    | { readonly kind: 'too-many-cards'; readonly count: number; readonly max: number }
    | { readonly kind: 'insufficient-copies'; readonly cardId: string; readonly required: number; readonly available: number };

export interface DeckCapacitySummary {
    readonly count: number;
    readonly cardsNeededToMin: number;
    readonly cardsOverMax: number;
    readonly slotsRemainingToMax: number;
}

function normalizeDeckIdentityValue(value: string | null | undefined, fallback: string): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0 ? normalized : fallback;
}

export function cloneDeckCardStacks(stacks: readonly ExpeditionCardStack[]): ExpeditionCardStack[] {
    return stacks.map((stack) => ({
        id: stack.id,
        count: stack.count,
    }));
}

export function cloneSavedDecks(savedDecks: readonly SavedDeck[]): SavedDeck[] {
    return savedDecks.map((savedDeck) => ({
        id: savedDeck.id,
        name: savedDeck.name,
        cards: cloneDeckCardStacks(savedDeck.cards),
    }));
}

export function createSavedDeck(
    id: string | null | undefined,
    name: string | null | undefined,
    cards: readonly ExpeditionCardStack[],
): SavedDeck {
    const normalizedId = normalizeDeckIdentityValue(id, DEFAULT_SAVED_DECK_ID);

    return {
        id: normalizedId,
        name: normalizeDeckIdentityValue(
            name,
            normalizedId === DEFAULT_SAVED_DECK_ID ? DEFAULT_SAVED_DECK_NAME : normalizedId,
        ),
        cards: cloneDeckCardStacks(cards),
    };
}

export function resolveSelectedDeckId(
    selectedDeckId: string | null | undefined,
    savedDecks: readonly SavedDeck[],
): string | null {
    const normalizedSelectedDeckId = selectedDeckId?.trim();

    if (normalizedSelectedDeckId && savedDecks.some((savedDeck) => savedDeck.id === normalizedSelectedDeckId)) {
        return normalizedSelectedDeckId;
    }

    return savedDecks[0]?.id ?? null;
}

export function getSavedDeckById(
    savedDecks: readonly SavedDeck[],
    savedDeckId: string | null | undefined,
): SavedDeck | null {
    const normalizedSavedDeckId = savedDeckId?.trim();

    if (!normalizedSavedDeckId) {
        return null;
    }

    return savedDecks.find((savedDeck) => savedDeck.id === normalizedSavedDeckId) ?? null;
}

export function getSelectedSavedDeck(stash: PersistentStash): SavedDeck | null {
    return getSavedDeckById(stash.savedDecks, resolveSelectedDeckId(stash.selectedDeckId, stash.savedDecks));
}

export function getSelectedDeckCards(stash: PersistentStash): ExpeditionCardStack[] {
    return cloneDeckCardStacks(getSelectedSavedDeck(stash)?.cards ?? []);
}

export function syncSelectedSavedDeckCards(
    stash: PersistentStash,
    cards: readonly ExpeditionCardStack[],
): PersistentStash {
    const selectedDeckId = resolveSelectedDeckId(stash.selectedDeckId, stash.savedDecks);

    if (!selectedDeckId) {
        return {
            ...stash,
            selectedDeckId,
        };
    }

    return {
        ...stash,
        selectedDeckId,
        savedDecks: stash.savedDecks.map((savedDeck) => savedDeck.id === selectedDeckId
            ? {
                ...savedDeck,
                cards: cloneDeckCardStacks(cards),
            }
            : {
                ...savedDeck,
                cards: cloneDeckCardStacks(savedDeck.cards),
            }),
    };
}

export function countDeckCards(cards: readonly ExpeditionCardStack[]): number {
    let total = 0;

    for (let i = 0; i < cards.length; i += 1) {
        total += cards[i].count;
    }

    return total;
}

export function summarizeDeckCapacity(cards: readonly ExpeditionCardStack[]): DeckCapacitySummary {
    const count = countDeckCards(cards);

    return {
        count,
        cardsNeededToMin: Math.max(DECK_CARD_MIN - count, 0),
        cardsOverMax: Math.max(count - DECK_CARD_MAX, 0),
        slotsRemainingToMax: Math.max(DECK_CARD_MAX - count, 0),
    };
}

export function adjustDeckCardCount(
    cards: readonly ExpeditionCardStack[],
    cardId: string,
    delta: number,
): ExpeditionCardStack[] {
    const normalizedDelta = Number.isFinite(delta) ? Math.trunc(delta) : 0;

    if (normalizedDelta === 0) {
        return cloneDeckCardStacks(cards);
    }

    const updatedCards: ExpeditionCardStack[] = [];
    let found = false;

    for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i];

        if (card.id !== cardId) {
            updatedCards.push({ ...card });
            continue;
        }

        found = true;
        const nextCount = card.count + normalizedDelta;

        if (nextCount > 0) {
            updatedCards.push({
                id: card.id,
                count: nextCount,
            });
        }
    }

    if (!found && normalizedDelta > 0) {
        updatedCards.push({
            id: cardId,
            count: normalizedDelta,
        });
    }

    return updatedCards;
}

export function validateDeckSize(cards: readonly ExpeditionCardStack[]): DeckValidityReason | null {
    const count = countDeckCards(cards);

    if (count < DECK_CARD_MIN) {
        return { kind: 'too-few-cards', count, min: DECK_CARD_MIN };
    }

    if (count > DECK_CARD_MAX) {
        return { kind: 'too-many-cards', count, max: DECK_CARD_MAX };
    }

    return null;
}

export function validateDeckAvailability(
    deckCards: readonly ExpeditionCardStack[],
    stashCards: readonly ExpeditionCardStack[],
): DeckValidityReason[] {
    const issues: DeckValidityReason[] = [];

    for (let i = 0; i < deckCards.length; i += 1) {
        const deckStack = deckCards[i];

        if (deckStack.count <= 0) {
            continue;
        }

        const stashStack = stashCards.find((stash) => stash.id === deckStack.id);
        const available = stashStack?.count ?? 0;

        if (available < deckStack.count) {
            issues.push({
                kind: 'insufficient-copies',
                cardId: deckStack.id,
                required: deckStack.count,
                available,
            });
        }
    }

    return issues;
}

export function addSavedDeckToStash(
    stash: PersistentStash,
    id: string | null | undefined,
    name: string | null | undefined,
    cards: readonly ExpeditionCardStack[],
): PersistentStash {
    const savedDeck = createSavedDeck(id, name, cards);
    const savedDecks = [...cloneSavedDecks(stash.savedDecks), savedDeck];

    return {
        ...stash,
        cards: cloneDeckCardStacks(stash.cards),
        savedDecks,
        selectedDeckId: resolveSelectedDeckId(stash.selectedDeckId, savedDecks),
        items: stash.items.map((item) => ({ ...item })),
        lastRunSummary: stash.lastRunSummary
            ? JSON.parse(JSON.stringify(stash.lastRunSummary))
            : stash.lastRunSummary,
    };
}

export function updateSavedDeckInStash(
    stash: PersistentStash,
    deckId: string,
    cards: readonly ExpeditionCardStack[],
): PersistentStash {
    const savedDecks = stash.savedDecks.map((savedDeck) =>
        savedDeck.id === deckId
            ? { ...savedDeck, cards: cloneDeckCardStacks(cards) }
            : { ...savedDeck, cards: cloneDeckCardStacks(savedDeck.cards) },
    );

    return {
        ...stash,
        cards: cloneDeckCardStacks(stash.cards),
        savedDecks,
        selectedDeckId: resolveSelectedDeckId(stash.selectedDeckId, savedDecks),
        items: stash.items.map((item) => ({ ...item })),
        lastRunSummary: stash.lastRunSummary
            ? JSON.parse(JSON.stringify(stash.lastRunSummary))
            : stash.lastRunSummary,
    };
}

export function renameSavedDeckInStash(
    stash: PersistentStash,
    deckId: string,
    name: string,
): PersistentStash {
    const trimmedName = name.trim();
    const effectiveName = trimmedName.length > 0 ? trimmedName : deckId;

    const savedDecks = stash.savedDecks.map((savedDeck) =>
        savedDeck.id === deckId
            ? { ...savedDeck, name: effectiveName, cards: cloneDeckCardStacks(savedDeck.cards) }
            : { ...savedDeck, cards: cloneDeckCardStacks(savedDeck.cards) },
    );

    return {
        ...stash,
        cards: cloneDeckCardStacks(stash.cards),
        savedDecks,
        selectedDeckId: resolveSelectedDeckId(stash.selectedDeckId, savedDecks),
        items: stash.items.map((item) => ({ ...item })),
        lastRunSummary: stash.lastRunSummary
            ? JSON.parse(JSON.stringify(stash.lastRunSummary))
            : stash.lastRunSummary,
    };
}

export function deleteSavedDeckFromStash(
    stash: PersistentStash,
    deckId: string,
): PersistentStash {
    const savedDecks = cloneSavedDecks(stash.savedDecks.filter((savedDeck) => savedDeck.id !== deckId));

    return {
        ...stash,
        cards: cloneDeckCardStacks(stash.cards),
        savedDecks,
        selectedDeckId: resolveSelectedDeckId(stash.selectedDeckId, savedDecks),
        items: stash.items.map((item) => ({ ...item })),
        lastRunSummary: stash.lastRunSummary
            ? JSON.parse(JSON.stringify(stash.lastRunSummary))
            : stash.lastRunSummary,
    };
}

export function selectDeckInStash(
    stash: PersistentStash,
    deckId: string | null,
): PersistentStash {
    return {
        ...stash,
        cards: cloneDeckCardStacks(stash.cards),
        savedDecks: cloneSavedDecks(stash.savedDecks),
        selectedDeckId: resolveSelectedDeckId(deckId, stash.savedDecks),
        items: stash.items.map((item) => ({ ...item })),
        lastRunSummary: stash.lastRunSummary
            ? JSON.parse(JSON.stringify(stash.lastRunSummary))
            : stash.lastRunSummary,
    };
}
