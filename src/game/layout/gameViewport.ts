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
