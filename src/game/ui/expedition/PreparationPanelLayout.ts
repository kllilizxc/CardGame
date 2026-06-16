const DECK_CARD_MIN_HEIGHT = 120;
const LOADOUT_SUMMARY_MIN_HEIGHT = 300;
const LOADOUT_MANIFEST_STACK_TOP_OFFSET = 88;
const ACTION_RAIL_MIN_HEIGHT = 136;
const ACTION_RAIL_BUTTON_STACK_MIN_HEIGHT = 136;
const READINESS_HERO_MIN_HEIGHT = 200;
const READINESS_HERO_BOTTOM_PADDING = 12;
const LOADOUT_DETAIL_MIN_HEIGHT = 112;

export function calculateDeckCardHeight(deckNameHeight: number): number {
    return Math.max(
        DECK_CARD_MIN_HEIGHT,
        deckNameHeight + 84,
    );
}

export function calculateSelectedLoadoutSummaryHeight(
    selectedDeckNameHeight: number,
    footerHeight: number,
    manifestStackHeight = 0,
): number {
    return Math.max(
        LOADOUT_SUMMARY_MIN_HEIGHT,
        236 + selectedDeckNameHeight + footerHeight,
        manifestStackHeight > 0 ? LOADOUT_MANIFEST_STACK_TOP_OFFSET + manifestStackHeight : 0,
    );
}

export function calculateActionRailHeight(
    headlineHeight: number,
    detailHeight: number,
    nextStepHeight: number,
    shortcutHintHeight = 0,
): number {
    const shortcutContribution = shortcutHintHeight > 0
        ? 6 + shortcutHintHeight
        : 0;

    return Math.max(
        ACTION_RAIL_MIN_HEIGHT,
        Math.max(
            ACTION_RAIL_BUTTON_STACK_MIN_HEIGHT,
            68 + headlineHeight + detailHeight + nextStepHeight + shortcutContribution,
        ),
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

export function calculateLoadoutDetailHeight(
    contentHeight: number,
    footerHeight: number,
): number {
    return Math.max(
        LOADOUT_DETAIL_MIN_HEIGHT,
        36 + contentHeight + 10 + footerHeight,
    );
}
