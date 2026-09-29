export const MAX_RUN_PLAYER_HEALTH = 100;

export function isRunPlayerHealth(value: unknown): value is number {
    return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_RUN_PLAYER_HEALTH;
}

/** Runs saved before health was tracked begin at full health. */
export function getRunPlayerHealth(value: number | undefined): number {
    return isRunPlayerHealth(value) ? value : MAX_RUN_PLAYER_HEALTH;
}
