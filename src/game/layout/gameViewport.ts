export interface GameViewportSize {
    width: number;
    height: number;
}

export const DESKTOP_GAME_VIEWPORT: GameViewportSize = { width: 1920, height: 1080 };
export const PORTRAIT_GAME_VIEWPORT: GameViewportSize = { width: 480, height: 1000 };

export function isPortraitBrowserViewport(width: number, height: number): boolean {
    return width <= 700 && height > width;
}

export function gameViewportForBrowser(width: number, height: number): GameViewportSize {
    return isPortraitBrowserViewport(width, height) ? PORTRAIT_GAME_VIEWPORT : DESKTOP_GAME_VIEWPORT;
}

export function isPortraitGameViewport(width: number, height: number): boolean {
    return width === PORTRAIT_GAME_VIEWPORT.width && height === PORTRAIT_GAME_VIEWPORT.height;
}

/** Logical canvas height — the 360px art grid shown at 3x. */
export const PIXEL_GAME_HEIGHT = 1080;
export const PIXEL_GAME_MIN_WIDTH = 1440;
export const PIXEL_GAME_MAX_WIDTH = 2400;

/**
 * Full-bleed canvas: height is fixed at 1080 and the width follows the browser's aspect ratio,
 * so the game fills the window instead of sitting inside letterbox bars. Width stays a multiple
 * of 6 so the 3px art grid (and centre lines) never land between pixels.
 */
export function pixelViewportForBrowser(width: number, height: number): GameViewportSize {
    const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
    const raw = PIXEL_GAME_HEIGHT * aspect;
    const clamped = Math.min(PIXEL_GAME_MAX_WIDTH, Math.max(PIXEL_GAME_MIN_WIDTH, raw));
    return { width: Math.round(clamped / 6) * 6, height: PIXEL_GAME_HEIGHT };
}
