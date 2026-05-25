import type { SavedDeck } from '../../types/expedition';

export type PreparationKeyboardShortcut =
    | 'previous-deck'
    | 'next-deck'
    | 'primary-action'
    | 'manage'
    | null;

interface PreparationKeyboardEventLike {
    key: string;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
}

export function getPreparationKeyboardShortcut(
    event: PreparationKeyboardEventLike,
): PreparationKeyboardShortcut {
    if (event.altKey || event.ctrlKey || event.metaKey) {
        return null;
    }

    switch (event.key) {
        case 'ArrowLeft':
            return 'previous-deck';
        case 'ArrowRight':
            return 'next-deck';
        case 'Enter':
            return 'primary-action';
        case 'm':
        case 'M':
            return 'manage';
        default:
            return null;
    }
}

export function getAdjacentPreparationDeckId(
    savedDecks: readonly SavedDeck[],
    selectedDeckId: string | null | undefined,
    direction: -1 | 1,
): string | null {
    if (savedDecks.length === 0) {
        return null;
    }

    const currentIndex = savedDecks.findIndex((deck) => deck.id === selectedDeckId);
    if (currentIndex < 0) {
        return savedDecks[0]?.id ?? null;
    }

    const nextIndex = Math.min(
        savedDecks.length - 1,
        Math.max(0, currentIndex + direction),
    );

    return savedDecks[nextIndex]?.id ?? null;
}
