const DECK_CARD_MIN_HEIGHT = 220;
const DECK_CARD_COMPARISON_MIN_HEIGHT = 64;
const LOADOUT_SUMMARY_MIN_HEIGHT = 284;

export function calculateDeckCardHeight(deckNameHeight: number): number {
    return Math.max(
        DECK_CARD_MIN_HEIGHT,
        deckNameHeight + 129 + DECK_CARD_COMPARISON_MIN_HEIGHT,
    );
}

export function calculateSelectedLoadoutSummaryHeight(
    selectedDeckNameHeight: number,
    footerHeight: number,
): number {
    return Math.max(LOADOUT_SUMMARY_MIN_HEIGHT, 236 + selectedDeckNameHeight + footerHeight);
}
