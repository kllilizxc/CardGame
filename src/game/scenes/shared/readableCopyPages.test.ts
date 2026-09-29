import { describe, expect, it } from 'bun:test';

import { paginateReadableCopy } from './readableCopyPages';

describe('paginateReadableCopy', () => {
    it('preserves long Chinese dialogue and punctuation across readable pages', () => {
        const copy = `狐爷爷：${'雾林里的白叶草仍可救人，'.repeat(25)}最后一株交给药铺。`;
        const pages = paginateReadableCopy(copy, 80);
        expect(pages.length).toBeGreaterThan(2);
        expect(pages.every(page => Array.from(page).length <= 80)).toBe(true);
        expect(pages.join('')).toBe(copy);
    });

    it('keeps a short passage on one page', () => {
        expect(paginateReadableCopy('雾林药铺')).toEqual(['雾林药铺']);
    });
});
