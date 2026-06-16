const DECK_CARD_MIN_HEIGHT = 120;
const READINESS_HERO_MIN_HEIGHT = 200;
const READINESS_HERO_BOTTOM_PADDING = 12;
const LOADOUT_SUPPORT_STRIP_MIN_HEIGHT = 94;
const DECK_SWITCHER_MIN_HEIGHT = 176;

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
        30 + Math.max(
            headerHeight + 12 + sectionHeight + 10 + shortcutHintHeight,
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
        34 + bodyHeight + 8 + footerHeight + 12,
    );
}

export function calculateDeckSwitcherHeight(
    headerHeight: number,
    cardHeight: number,
): number {
    return Math.max(
        DECK_SWITCHER_MIN_HEIGHT,
        14 + headerHeight + 8 + cardHeight + 12,
    );
}
