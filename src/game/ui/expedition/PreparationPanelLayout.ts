const DECK_CARD_MIN_HEIGHT = 108;
const READINESS_HERO_MIN_HEIGHT = 186;
const READINESS_HERO_BOTTOM_PADDING = 10;
const LOADOUT_SUPPORT_STRIP_MIN_HEIGHT = 82;
const DECK_SWITCHER_MIN_HEIGHT = 160;
const DECISION_CARD_FOOTER_GAP = 6;
const DECISION_CARD_BOTTOM_PADDING = 10;

export function calculateDeckCardHeight(deckNameHeight: number): number {
    return Math.max(
        DECK_CARD_MIN_HEIGHT,
        deckNameHeight + 84,
    );
}

export function calculateReadinessHeroHeight(
    headerHeight: number,
    sectionHeight: number,
    shortcutHintHeight: number,
    actionColumnHeight: number,
): number {
    return Math.max(
        READINESS_HERO_MIN_HEIGHT,
        24 + Math.max(
            headerHeight + 10 + sectionHeight + 8 + shortcutHintHeight,
            actionColumnHeight,
        ) + READINESS_HERO_BOTTOM_PADDING,
    );
}

export function calculateLoadoutSupportStripHeight(
    bodyHeight: number,
    footerHeight: number,
): number {
    return Math.max(
        LOADOUT_SUPPORT_STRIP_MIN_HEIGHT,
        26 + bodyHeight + 6 + footerHeight + 10,
    );
}

export function calculatePreparationDecisionCardHeight(
    heroHeight: number,
    footerHeight: number,
): number {
    return heroHeight + DECISION_CARD_FOOTER_GAP + footerHeight + DECISION_CARD_BOTTOM_PADDING;
}

export function calculateDeckSwitcherHeight(
    headerHeight: number,
    cardHeight: number,
): number {
    return Math.max(
        DECK_SWITCHER_MIN_HEIGHT,
        12 + headerHeight + 6 + cardHeight + 10,
    );
}
