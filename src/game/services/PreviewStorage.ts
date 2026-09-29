/**
 * Worka passes an exact candidate identity in the preview URL. Browser storage
 * is shared by every page on an origin, even when worktrees are separate.
 * Keep ordinary game saves on their existing keys and scope preview saves to
 * the project, candidate, commit and player profile.
 */
export function previewStoragePrefix(search = typeof location === 'undefined' ? '' : location.search): string | null {
    const query = new URLSearchParams(search);
    const project = query.get('workaProject');
    const candidate = query.get('workaCandidate');
    const commit = query.get('workaCommit');
    const profile = query.get('workaProfile');
    if (!project || !candidate || !commit || !profile || !/^[0-9a-f]{40}$/.test(commit)) return null;
    return `cardgame.preview:${[project, candidate, commit, profile].map(encodeURIComponent).join(':')}:`;
}

export function gameStorage(storage: Storage, search?: string): Storage {
    const prefix = previewStoragePrefix(search);
    if (!prefix) return storage;
    const scopedKeys = () => Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
        .map(key => key.slice(prefix.length));
    return {
        get length() { return scopedKeys().length; },
        key(index: number) { return scopedKeys()[index] ?? null; },
        getItem(key: string) { return storage.getItem(prefix + key); },
        setItem(key: string, value: string) { storage.setItem(prefix + key, value); },
        removeItem(key: string) { storage.removeItem(prefix + key); },
        clear() { for (const key of scopedKeys()) storage.removeItem(prefix + key); },
    };
}
