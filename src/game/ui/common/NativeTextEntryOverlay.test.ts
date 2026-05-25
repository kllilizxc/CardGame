import { describe, expect, it } from 'bun:test';

import {
    getNativeTextEntryShortcut,
    insetNativeTextEntryRect,
    projectSceneRectToClientRect,
} from './NativeTextEntryOverlay';

describe('NativeTextEntryOverlay helpers', () => {
    it('insets text-entry bounds without producing negative sizes', () => {
        expect(insetNativeTextEntryRect(
            { x: 100, y: 80, width: 240, height: 36 },
            { left: 8, right: 52, top: 4, bottom: 4 },
        )).toEqual({ x: 108, y: 84, width: 180, height: 28 });

        expect(insetNativeTextEntryRect(
            { x: 0, y: 0, width: 10, height: 10 },
            { left: 8, right: 8, top: 6, bottom: 6 },
        )).toEqual({ x: 8, y: 6, width: 0, height: 0 });
    });

    it('projects scene-space bounds into the scaled canvas client rect', () => {
        expect(projectSceneRectToClientRect(
            { x: 120, y: 200, width: 300, height: 40 },
            { left: 40, top: 24, width: 960, height: 540 } as DOMRect,
            { width: 1920, height: 1080 },
        )).toEqual({ x: 100, y: 124, width: 150, height: 20 });
    });

    it('normalizes confirm/cancel shortcuts without breaking IME composition', () => {
        expect(getNativeTextEntryShortcut({ key: 'Enter' }, false)).toBe('confirm');
        expect(getNativeTextEntryShortcut({ key: 'Escape' }, false)).toBe('cancel');
        expect(getNativeTextEntryShortcut({ key: 'Tab' }, false)).toBe('block-tab');
        expect(getNativeTextEntryShortcut({ key: 'Enter', isComposing: true }, false)).toBeNull();
        expect(getNativeTextEntryShortcut({ key: 'Escape' }, true)).toBeNull();
        expect(getNativeTextEntryShortcut({ key: 'a' }, false)).toBeNull();
    });
});
