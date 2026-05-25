const DECK_CARD_MIN_HEIGHT = 220;
const DECK_CARD_COMPARISON_MIN_HEIGHT = 64;
const LOADOUT_SUMMARY_MIN_HEIGHT = 284;
const ACTION_RAIL_MIN_HEIGHT = 148;
const ACTION_RAIL_BUTTON_STACK_MIN_HEIGHT = 148;

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

export function calculateActionRailHeight(
    headlineHeight: number,
    detailHeight: number,
    nextStepHeight: number,
): number {
    return Math.max(
        ACTION_RAIL_MIN_HEIGHT,
        Math.max(
            ACTION_RAIL_BUTTON_STACK_MIN_HEIGHT,
            68 + headlineHeight + detailHeight + nextStepHeight,
        ),
    );
}
