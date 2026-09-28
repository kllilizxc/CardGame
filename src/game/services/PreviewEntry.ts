import {
    CONTENT_CATALOG_PUBLIC_PATH,
    createContentCatalogResolver,
} from '../content/contentCatalog';
import type { HubSceneLaunchData } from '../scenes/hub/hubSceneLaunch';
import { previewStoragePrefix } from './PreviewStorage';

const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Start an exact Worka preview at a catalog-backed Hub action when requested. */
export function resolvePreviewHubActionLaunch(search: string, catalog: unknown): HubSceneLaunchData | null {
    if (!previewStoragePrefix(search)) return null;

    const query = new URLSearchParams(search);
    const hubId = query.get('workaHub');
    const actionId = query.get('workaAction');
    const storyId = query.get('workaStory');
    if (!hubId || !actionId || !storyId
        || !RESOURCE_ID.test(hubId) || !RESOURCE_ID.test(actionId) || !RESOURCE_ID.test(storyId)) return null;

    try {
        const hub = createContentCatalogResolver(catalog, {
            context: 'PreviewEntry',
            sourcePublicPath: CONTENT_CATALOG_PUBLIC_PATH,
        }).resolveJsonResource({ resourceId: hubId, expectedKind: 'hub' });
        return {
            hubId,
            hubResourceId: hubId,
            hubFile: hub.publicPath,
            startActionId: actionId,
            startStoryResourceId: storyId,
        };
    } catch {
        return null;
    }
}
