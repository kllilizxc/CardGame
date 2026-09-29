import { describe, expect, it } from 'bun:test';
import { gameStorage, previewStoragePrefix } from './PreviewStorage';

const commitA = 'a'.repeat(40);
const commitB = 'b'.repeat(40);
const query = (candidate: string, commit = commitA, profile = 'default') =>
    `?workaProject=game&workaCandidate=${candidate}&workaCommit=${commit}&workaProfile=${profile}`;

function memoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); },
        removeItem(key) { values.delete(key); },
        clear() { values.clear(); },
    };
}

describe('Worka preview save scope', () => {
    it('isolates candidates, exact revisions and profiles from formal saves', () => {
        const storage = memoryStorage();
        const formal = gameStorage(storage, '');
        const first = gameStorage(storage, query('first'));
        const second = gameStorage(storage, query('second'));
        const revision = gameStorage(storage, query('first', commitB));
        const profile = gameStorage(storage, query('first', commitA, 'child'));
        formal.setItem('cardgame.persistent-stash.v1', 'formal');
        first.setItem('cardgame.persistent-stash.v1', 'first');
        second.setItem('cardgame.persistent-stash.v1', 'second');
        revision.setItem('cardgame.persistent-stash.v1', 'revision');
        profile.setItem('cardgame.persistent-stash.v1', 'profile');
        expect([formal, first, second, revision, profile].map(slot => slot.getItem('cardgame.persistent-stash.v1')))
            .toEqual(['formal', 'first', 'second', 'revision', 'profile']);
        first.clear();
        expect(first.length).toBe(0);
        expect([formal, second, revision, profile].map(slot => slot.getItem('cardgame.persistent-stash.v1')))
            .toEqual(['formal', 'second', 'revision', 'profile']);
    });

    it('requires a complete, exact candidate identity', () => {
        expect(previewStoragePrefix('?workaProject=game&workaCandidate=one')).toBeNull();
        expect(previewStoragePrefix(query('one', 'HEAD+worktree.1234'))).toBeNull();
    });
});
