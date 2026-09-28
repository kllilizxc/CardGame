interface Point {
    x: number;
    y: number;
}

interface Bounds extends Point {
    width: number;
    height: number;
}

/** Prefer the visible character when cards are dropped over their body; retain the old foot-radius fallback. */
export function findArtifactEquipTarget<T extends Point>(
    drop: Point,
    targets: readonly T[],
    visualBounds: (target: T) => Bounds | undefined,
    footRadius = 150,
): T | null {
    let bodyTarget: T | null = null;
    let bodyDistance = Infinity;
    let footTarget: T | null = null;
    let footDistance = footRadius;

    for (const target of targets) {
        const bounds = visualBounds(target);
        if (bounds && drop.x >= bounds.x && drop.x <= bounds.x + bounds.width
            && drop.y >= bounds.y && drop.y <= bounds.y + bounds.height) {
            const distance = Math.hypot(drop.x - (bounds.x + bounds.width / 2), drop.y - (bounds.y + bounds.height / 2));
            if (distance < bodyDistance) {
                bodyDistance = distance;
                bodyTarget = target;
            }
        }

        const distance = Math.hypot(drop.x - target.x, drop.y - target.y);
        if (distance < footDistance) {
            footDistance = distance;
            footTarget = target;
        }
    }

    return bodyTarget ?? footTarget;
}
