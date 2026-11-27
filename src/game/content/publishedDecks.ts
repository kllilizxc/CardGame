export interface PublishedDeck { id: string; name: string; file: string; total: number }
export interface DeckTrialLaunch { mode: 'deck-trial'; deckId: string; deckFile: string }
const DECK_FILE = /^data\/decks\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

/** Discover shipped, complete decks without changing the player's saved collection. */
export function publishedDecks(modules: Record<string, unknown>): PublishedDeck[] {
    const decks: PublishedDeck[] = [];
    for (const [path, raw] of Object.entries(modules)) {
        const file = path.match(/(?:^|\/)public\/(data\/decks\/[^/]+\.json)$/)?.[1];
        if (!file || !DECK_FILE.test(file) || !raw || typeof raw !== 'object') continue;
        const value = raw as { id?: unknown; name?: unknown; cards?: unknown };
        if (!Array.isArray(value.cards) || !value.cards.length) continue;
        const ids = new Set<string>(); let total = 0; let valid = true;
        for (const card of value.cards) {
            if (!card || typeof card.id !== 'string' || !card.id || ids.has(card.id)
                || !Number.isInteger(card.count) || card.count < 1 || card.count > 3) { valid = false; break; }
            ids.add(card.id); total += card.count;
        }
        if (!valid || total < 20 || total > 30) continue;
        const id = file.split('/').pop()!.replace(/\.json$/, '');
        decks.push({id, file, total, name: typeof value.name === 'string' && value.name.trim() ? value.name : id});
    }
    return decks.sort((a,b) => a.file.endsWith('/starter-deck.json') ? -1 : b.file.endsWith('/starter-deck.json') ? 1 : a.name.localeCompare(b.name));
}

export function normalizeDeckTrial(value: unknown): DeckTrialLaunch | null {
    if (!value || typeof value !== 'object') return null;
    const launch = value as Partial<DeckTrialLaunch>;
    if (launch.mode !== 'deck-trial' || typeof launch.deckFile !== 'string' || !DECK_FILE.test(launch.deckFile)) return null;
    const id = launch.deckFile.split('/').pop()!.replace(/\.json$/, '');
    return launch.deckId === id ? {mode: 'deck-trial', deckId: id, deckFile: launch.deckFile} : null;
}
