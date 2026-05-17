import type {
    ExpeditionCardStack,
    PersistentStash,
    SavedDeck,
} from '../types/expedition';

export const DEFAULT_SAVED_DECK_ID = 'starter-deck';
export const DEFAULT_SAVED_DECK_NAME = 'Starter Deck';

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
