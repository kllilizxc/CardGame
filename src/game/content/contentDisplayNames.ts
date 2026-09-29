import {
    parseContentCatalogDefinition,
    type ContentCatalogEntry,
} from './contentCatalog';
import { CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID } from './contentCatalogWorldSeed';

type DisplayNameKind = 'card' | 'item';

export interface ContentDisplayNameResource {
    kind: DisplayNameKind;
    publicPath: string;
    cacheKey: string;
}

export interface ContentDisplayNameSource {
    kind: DisplayNameKind;
    data: unknown;
}

export interface ContentDisplayNames {
    cardName(id: string): string;
    itemName(id: string): string;
}

function displayNameKind(entry: ContentCatalogEntry): DisplayNameKind | undefined {
    if (entry.kind === 'card') return 'card';
    if (entry.resourceId === CANONICAL_WORLD_ITEM_REGISTRY_RESOURCE_ID && entry.kind === 'worldSeed') return 'item';
    return undefined;
}

export function getContentDisplayNameResources(rawCatalog: unknown): ContentDisplayNameResource[] {
    return parseContentCatalogDefinition(rawCatalog).resources.flatMap((entry) => {
        const kind = displayNameKind(entry);
        return kind ? [{
            kind,
            publicPath: entry.publicPath,
            cacheKey: `contentDisplayNames:${entry.resourceId}`,
        }] : [];
    });
}

function readNames(data: unknown, names: Map<string, string>): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    for (const collection of Object.values(data)) {
        if (!Array.isArray(collection)) continue;
        for (const value of collection) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
            const { id, name } = value as Record<string, unknown>;
            if (typeof id === 'string' && id.trim() && typeof name === 'string' && name.trim()) {
                names.set(id, name.trim());
            }
        }
    }
}

export function createContentDisplayNames(sources: readonly ContentDisplayNameSource[]): ContentDisplayNames {
    const cards = new Map<string, string>();
    const items = new Map<string, string>();
    for (const source of sources) readNames(source.data, source.kind === 'card' ? cards : items);
    return {
        cardName: (id) => cards.get(id) ?? '未收录卡牌',
        itemName: (id) => items.get(id) ?? '未收录道具',
    };
}
