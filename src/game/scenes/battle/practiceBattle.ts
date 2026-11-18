import { createContentCatalogResolver } from '../../content/contentCatalog';
import type { BattleLaunchPayload } from '../../types/expedition';
import type { BattleDeckStartupPlan, StarterDeckData } from './battleSceneLaunch';

export interface PracticeBattle {
    guide: string;
    deckPlan: BattleDeckStartupPlan;
}

export async function loadPracticeBattle(
    catalog: unknown,
    launch: BattleLaunchPayload | null,
    encounter: { practice?: { deckResourceId: string; guide: string } } | null | undefined,
    request: typeof fetch = fetch,
): Promise<PracticeBattle | null> {
    if (launch?.runId !== 'worka-preview' || !encounter?.practice) return null;

    const { deckResourceId, guide } = encounter.practice;
    const { publicPath } = createContentCatalogResolver(catalog, { context: 'BattleScene practice' })
        .resolveJsonResource({ resourceId: deckResourceId, expectedKind: 'deck' });
    const response = await request(publicPath);
    if (!response.ok) throw new Error(`演武牌组加载失败：${publicPath}（${response.status}）`);
    const deck: StarterDeckData = await response.json();
    return { guide, deckPlan: { stacks: deck.cards, shouldShuffle: false } };
}
