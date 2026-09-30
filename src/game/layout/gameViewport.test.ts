import { describe, expect, it } from 'bun:test';

import { DESKTOP_GAME_VIEWPORT, PORTRAIT_GAME_VIEWPORT,
    gameViewportForBrowser, isPortraitGameViewport } from './gameViewport';

describe('game viewport', () => {
    it('uses a readable portrait canvas only when the browser has portrait space', () => {
        expect(gameViewportForBrowser(390, 844)).toBe(PORTRAIT_GAME_VIEWPORT);
        expect(gameViewportForBrowser(620, 844)).toBe(PORTRAIT_GAME_VIEWPORT);
        expect(gameViewportForBrowser(844, 390)).toBe(DESKTOP_GAME_VIEWPORT);
        expect(gameViewportForBrowser(1440, 900)).toBe(DESKTOP_GAME_VIEWPORT);
        expect(isPortraitGameViewport(480, 1000)).toBe(true);
    });
});

describe('pixel viewport', () => {
    it('keeps a 1080 high canvas and follows the window aspect on the 3px grid', () => {
        const { pixelViewportForBrowser } = require('./gameViewport');
        expect(pixelViewportForBrowser(1920, 1080)).toEqual({ width: 1920, height: 1080 });
        expect(pixelViewportForBrowser(1920, 960)).toEqual({ width: 2160, height: 1080 });
        expect(pixelViewportForBrowser(1440, 1080).width).toBe(1440);
        expect(pixelViewportForBrowser(390, 844).width).toBe(1440);
        expect(pixelViewportForBrowser(4000, 900).width).toBe(2400);
        expect(pixelViewportForBrowser(1500, 1000).width % 6).toBe(0);
    });
});
