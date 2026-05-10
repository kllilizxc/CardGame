import {
    validatePlayableStoryGraph,
    type StoryGraph,
} from '../scenes/story/storyFlow';
import {
    validateHubTownDefinition,
    type HubTownDefinition,
} from '../scenes/hub/hubTown';
import {
    validateWorldMapDefinition,
    type WorldMapDefinition,
    type WorldMapExpeditionDestination,
    type WorldMapHubDestination,
} from '../scenes/worldmap/worldMap';
import {
    validatePrototypeExpeditionContent,
} from '../types/prototypeExpeditionContent';
import {
    validateStoryContentGraph,
    type StoryContentGraph,
} from '../types/storyContent';
import { validateCatalogContentIdReferences } from './contentIdRegistry';
import {
    addFailure,
    findFirstContentResourceForMapNode,
    findFirstResourceByKind,
    formatErrorMessage,
    isRecord,
    loadContentCatalogValidationIndex,
    requireCatalogedResource,
    resolveCatalogResourceIdReference,
    type ContentKindValidator,
    type LoadedCatalogIndex,
    type LoadedCatalogResource,
} from './contentCatalogValidationIndex';
import type {
    ExpeditionEncounterMapNode,
    EventMapNode,
    ExpeditionMapDefinition,
    ExpeditionMapNode,
    PrototypeEventCollection,
    PrototypeShopCollection,
    ShopMapNode,
} from '../types/expedition';
import type { StoryBattleTrigger } from '../types/story';

export const CONTENT_CATALOG_PUBLIC_PATH = 'data/content-catalog.json';
export const CONTENT_CATALOG_CACHE_KEY = 'contentCatalog';
export const QINGYUN_WORLD_MAP_RESOURCE_ID = 'worldmap.qingyun-region';

export const CONTENT_RESOURCE_KINDS = [
    'worldMap',
    'hub',
    'story',
    'expeditionMap',
    'expeditionEvents',
    'expeditionShop',
    'deck',
    'encounter',
    'card',
    'status',
    'gongfa',
    'config',
    'worldSeed',
] as const;

export type ContentResourceKind = typeof CONTENT_RESOURCE_KINDS[number];

export interface ContentCatalogEntry {
    resourceId: string;
    kind: ContentResourceKind;
    schemaVersion: number;
    publicPath: string;
}

export interface ContentCatalogDefinition {
    schemaVersion: 1;
    resources: ContentCatalogEntry[];
}

export interface ContentCatalogFileSource {
    readText(publicPath: string): string | undefined;
}

export interface ContentCatalogValidationFailure {
    resourceId: string;
    publicPath?: string;
    message: string;
}

export interface ContentCatalogValidationResult {
    validatedResourceCount: number;
    registeredValidatorNames: string[];
    failures: ContentCatalogValidationFailure[];
}

export interface ContentCatalogResolverOptions {
    context: string;
    sourcePublicPath?: string;
}

export interface ContentCatalogResourceRequest {
    resourceId: string;
    expectedKind: ContentResourceKind;
}

export interface ContentCatalogPublicPathRequest {
    publicPath: string;
    expectedKind: ContentResourceKind;
}

export interface ContentCatalogResolver {
    resolveJsonResource(request: ContentCatalogResourceRequest): ContentCatalogEntry;
    resolveJsonResourceByPublicPath(request: ContentCatalogPublicPathRequest): ContentCatalogEntry;
}

const REGISTERED_VALIDATOR_NAMES = [
    'worldMap:validateWorldMapDefinition',
    'hub:validateHubTownDefinition',
    'story:validatePlayableStoryGraph|validateStoryContentGraph',
    'expedition:validatePrototypeExpeditionContent',
] as const;

const KIND_VALIDATORS: Partial<Record<ContentResourceKind, ContentKindValidator>> = {
    worldMap: validateWorldMapDefinition,
    hub: validateHubTownDefinition,
    story: validateStoryResource,
};

function readStringField(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }

    return value;
}

function readPositiveInteger(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive integer.`);
    }

    return value;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new Error(`${label} must be an object.`);
    }

    return value;
}

function parseContentResourceKind(value: unknown, label: string): ContentResourceKind {
    const kind = readStringField(value, label);

    if (!CONTENT_RESOURCE_KINDS.includes(kind as ContentResourceKind)) {
        throw new Error(`${label} must be one of ${CONTENT_RESOURCE_KINDS.join(', ')}.`);
    }

    return kind as ContentResourceKind;
}

function parseCatalogEntry(value: unknown, index: number): ContentCatalogEntry {
    const record = readRecord(value, `contentCatalog.resources[${index}]`);
    const publicPath = readStringField(record.publicPath, `contentCatalog.resources[${index}].publicPath`);

    if (publicPath.startsWith('/') || publicPath.startsWith('public/')) {
        throw new Error(
            `contentCatalog.resources[${index}].publicPath must be relative to public/, for example data/world/world-map.json.`,
        );
    }

    if (!publicPath.endsWith('.json')) {
        throw new Error(`contentCatalog.resources[${index}].publicPath must point to a JSON file.`);
    }

    return {
        resourceId: readStringField(record.resourceId, `contentCatalog.resources[${index}].resourceId`),
        kind: parseContentResourceKind(record.kind, `contentCatalog.resources[${index}].kind`),
        schemaVersion: readPositiveInteger(record.schemaVersion, `contentCatalog.resources[${index}].schemaVersion`),
        publicPath,
    };
}

function assertUniqueCatalogValues(entries: ContentCatalogEntry[], field: 'resourceId' | 'publicPath'): void {
    const seen = new Set<string>();

    for (const entry of entries) {
        const value = entry[field];

        if (seen.has(value)) {
            throw new Error(`contentCatalog.resources contains duplicate ${field}: ${value}`);
        }

        seen.add(value);
    }
}

export function parseContentCatalogDefinition(value: unknown): ContentCatalogDefinition {
    const record = readRecord(value, 'contentCatalog');

    if (record.schemaVersion !== 1) {
        throw new Error('contentCatalog.schemaVersion must be 1.');
    }

    if (!Array.isArray(record.resources)) {
        throw new Error('contentCatalog.resources must be an array.');
    }

    const resources = record.resources.map(parseCatalogEntry);

    if (resources.length === 0) {
        throw new Error('contentCatalog.resources must contain at least one resource.');
    }

    assertUniqueCatalogValues(resources, 'resourceId');
    assertUniqueCatalogValues(resources, 'publicPath');

    return {
        schemaVersion: 1,
        resources,
    };
}

export function createContentCatalogResolver(
    rawCatalog: unknown,
    options: ContentCatalogResolverOptions,
): ContentCatalogResolver {
    const sourcePublicPath = options.sourcePublicPath ?? CONTENT_CATALOG_PUBLIC_PATH;

    if (rawCatalog === undefined) {
        throw new Error(
            `${options.context} requires runtime content catalog ${sourcePublicPath}, but it was not loaded or is missing from the JSON cache.`,
        );
    }

    let catalog: ContentCatalogDefinition;

    try {
        catalog = parseContentCatalogDefinition(rawCatalog);
    } catch (error) {
        throw new Error(
            `${options.context} runtime content catalog ${sourcePublicPath} is malformed: ${formatErrorMessage(error)}`,
        );
    }

    const byResourceId = new Map<string, ContentCatalogEntry>();
    const byPublicPath = new Map<string, ContentCatalogEntry>();

    for (const entry of catalog.resources) {
        byResourceId.set(entry.resourceId, entry);
        byPublicPath.set(entry.publicPath, entry);
    }

    return {
        resolveJsonResource(request: ContentCatalogResourceRequest): ContentCatalogEntry {
            const entry = byResourceId.get(request.resourceId);

            if (!entry) {
                throw new Error(
                    `${options.context} could not resolve catalog resource ${request.resourceId}: no catalog entry exists for that resource id.`,
                );
            }

            if (entry.kind !== request.expectedKind) {
                throw new Error(
                    `${options.context} could not resolve catalog resource ${request.resourceId}: catalog resource has kind ${entry.kind}; expected ${request.expectedKind}.`,
                );
            }

            return { ...entry };
        },
        resolveJsonResourceByPublicPath(request: ContentCatalogPublicPathRequest): ContentCatalogEntry {
            const entry = byPublicPath.get(request.publicPath);

            if (!entry) {
                throw new Error(
                    `${options.context} could not resolve catalog public path ${request.publicPath}: no catalog entry exists for that public path.`,
                );
            }

            if (entry.kind !== request.expectedKind) {
                throw new Error(
                    `${options.context} could not resolve catalog public path ${request.publicPath}: catalog resource ${entry.resourceId} has kind ${entry.kind}; expected ${request.expectedKind}.`,
                );
            }

            return { ...entry };
        },
    };
}

function validateStoryResource(json: unknown): StoryGraph | StoryContentGraph {
    const record = readRecord(json, 'story resource');

    if (typeof record.storyId === 'string') {
        return validatePlayableStoryGraph(json);
    }

    if (record.schemaVersion === 1 && typeof record.id === 'string') {
        return validateStoryContentGraph(json);
    }

    throw new Error('Story resources must declare either storyId for playable StoryState graphs or schemaVersion/id for executable story content graphs.');
}

function isWorldMapDefinition(value: unknown): value is WorldMapDefinition {
    return isRecord(value) && Array.isArray(value.destinations) && typeof value.id === 'string';
}

function isHubTownDefinition(value: unknown): value is HubTownDefinition {
    return isRecord(value) && Array.isArray(value.locations) && typeof value.hubId === 'string';
}

function isStoryGraph(value: unknown): value is StoryGraph {
    return isRecord(value) && typeof value.storyId === 'string' && Array.isArray(value.nodes) && Array.isArray(value.choices);
}

function isExpeditionMapDefinition(value: unknown): value is ExpeditionMapDefinition {
    return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.nodes);
}

function isPrototypeEventCollection(value: unknown): value is PrototypeEventCollection {
    return isRecord(value) && typeof value.id === 'string' && isRecord(value.eventsByNodeId);
}

function isPrototypeShopCollection(value: unknown): value is PrototypeShopCollection {
    return isRecord(value) && typeof value.id === 'string' && isRecord(value.shopsByNodeId);
}

function validateWorldMapReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'worldMap' || !isWorldMapDefinition(resource.validated)) {
            continue;
        }

        for (const destination of resource.validated.destinations) {
            if (destination.kind === 'hub') {
                validateWorldMapHubDestinationReferences(resource.entry, destination, index, failures);
            } else {
                validateWorldMapExpeditionDestinationReferences(resource.entry, destination, index, failures);
            }
        }
    }
}

function validateWorldMapHubDestinationReferences(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapHubDestination,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `WorldMap ${ownerEntry.resourceId} destination ${destination.id}`;
    const hubResource = resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'hubResourceId',
        resourceId: destination.hubResourceId,
        publicPathField: 'hubFile',
        publicPath: destination.hubFile,
        expectedKinds: ['hub'],
    });

    if (!hubResource || !isHubTownDefinition(hubResource.validated)) {
        return;
    }

    if (hubResource.validated.hubId !== destination.hubId) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} expects hubId ${destination.hubId}, but ${destination.hubFile} declares ${hubResource.validated.hubId}.`,
        );
    }

    if (destination.targetLocationId && !hubResource.validated.locations.some((location) => location.id === destination.targetLocationId)) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} targetLocationId ${destination.targetLocationId} does not exist in ${destination.hubFile}.`,
        );
    }
}

function validateWorldMapExpeditionDestinationReferences(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `WorldMap ${ownerEntry.resourceId} destination ${destination.id}`;

    resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'worldStateResourceId',
        resourceId: destination.worldStateResourceId,
        publicPathField: 'worldStateFile',
        publicPath: destination.worldStateFile,
        expectedKinds: ['worldSeed'],
    });
    resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'starterDeckResourceId',
        resourceId: destination.starterDeckResourceId,
        publicPathField: 'starterDeckFile',
        publicPath: destination.starterDeckFile,
        expectedKinds: ['deck'],
    });
    const mapResource = resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'mapResourceId',
        resourceId: destination.mapResourceId,
        publicPathField: 'mapFile',
        publicPath: destination.mapFile,
        expectedKinds: ['expeditionMap'],
    });
    resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'eventsResourceId',
        resourceId: destination.eventsResourceId,
        publicPathField: 'eventsFile',
        publicPath: destination.eventsFile,
        expectedKinds: ['expeditionEvents'],
    });
    resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'shopResourceId',
        resourceId: destination.shopResourceId,
        publicPathField: 'shopFile',
        publicPath: destination.shopFile,
        expectedKinds: ['expeditionShop'],
    });

    if (!mapResource || !isExpeditionMapDefinition(mapResource.json)) {
        return;
    }

    if (mapResource.json.id !== destination.mapId) {
        addFailure(
            failures,
            ownerEntry,
            `WorldMap ${ownerEntry.resourceId} destination ${destination.id} expects mapId ${destination.mapId}, but ${destination.mapFile} declares ${mapResource.json.id}.`,
        );
    }

    validateWorldMapExpeditionContentFileAlignment(ownerEntry, destination, mapResource.json, failures);
}

function validateWorldMapExpeditionContentFileAlignment(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    map: ExpeditionMapDefinition,
    failures: ContentCatalogValidationFailure[],
): void {
    map.nodes.forEach((node, nodeIndex) => {
        if (!isRecord(node)) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} map nodes[${nodeIndex}] must be an object before Expedition content-file alignment can be validated.`,
            );
            return;
        }

        if (node.type !== 'event' && node.type !== 'shop') {
            return;
        }

        const nodeId = readDiagnosticNodeId(node, `nodes[${nodeIndex}]`);
        const contentFile = readWorldMapExpeditionNodeContentFile(ownerEntry, destination, node, nodeId, failures);

        if (!contentFile) {
            return;
        }

        if (node.type === 'event' && contentFile !== destination.eventsFile) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} eventsFile is ${destination.eventsFile}, but map node ${nodeId} references ${contentFile}.`,
            );
        }

        if (node.type === 'shop' && contentFile !== destination.shopFile) {
            addFailure(
                failures,
                ownerEntry,
                `WorldMap ${ownerEntry.resourceId} destination ${destination.id} shopFile is ${destination.shopFile}, but map node ${nodeId} references ${contentFile}.`,
            );
        }
    });
}

function readDiagnosticNodeId(node: Record<string, unknown>, fallback: string): string {
    return typeof node.id === 'string' && node.id.trim().length > 0 ? node.id : fallback;
}

function readWorldMapExpeditionNodeContentFile(
    ownerEntry: ContentCatalogEntry,
    destination: WorldMapExpeditionDestination,
    node: Record<string, unknown>,
    nodeId: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    const context = `WorldMap ${ownerEntry.resourceId} destination ${destination.id} map node ${nodeId} payloadRef`;

    if (!isRecord(node.payloadRef)) {
        addFailure(
            failures,
            ownerEntry,
            `${context} must be an object before Expedition content-file alignment can be validated.`,
        );
        return undefined;
    }

    const contentFile = node.payloadRef.contentFile;

    if (typeof contentFile !== 'string' || contentFile.trim().length === 0) {
        addFailure(
            failures,
            ownerEntry,
            `${context}.contentFile must be a non-empty string before Expedition content-file alignment can be validated.`,
        );
        return undefined;
    }

    return contentFile;
}

function validateHubReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'hub' || !isHubTownDefinition(resource.validated)) {
            continue;
        }

        for (const location of resource.validated.locations) {
            for (const action of location.actions) {
                if (action.kind !== 'startStory') {
                    continue;
                }

                validateHubStoryActionReference(resource.entry, location.id, action, index, failures);
            }
        }
    }
}

function validateHubStoryActionReference(
    ownerEntry: ContentCatalogEntry,
    locationId: string,
    action: HubTownDefinition['locations'][number]['actions'][number] & { kind: 'startStory' },
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Hub ${ownerEntry.resourceId} location ${locationId} action ${action.id}`;

    if (!action.storyResourceId) {
        addFailure(
            failures,
            ownerEntry,
            `${context} storyResourceId must be a non-empty string so catalog story targets resolve by resource id.`,
        );
        return;
    }

    resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'storyResourceId',
        resourceId: action.storyResourceId,
        publicPathField: 'storyGraphFile',
        publicPath: action.storyGraphFile,
        expectedKinds: ['story'],
        publicPathOwnerLabel: 'action',
    });
}

function validateStoryBattleReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'story' || !isStoryGraph(resource.validated)) {
            continue;
        }

        resource.validated.nodes.forEach((node, nodeIndex) => {
            node.onEnter.forEach((effect, effectIndex) => {
                if (effect.kind === 'startBattle') {
                    validateStoryBattleTriggerReferences(
                        resource.entry,
                        effect.battle,
                        `Story ${resource.entry.resourceId} nodes[${nodeIndex}] ${node.id} onEnter[${effectIndex}].battle`,
                        index,
                        failures,
                    );
                }
            });
        });

        resource.validated.choices.forEach((choice, choiceIndex) => {
            choice.effects.forEach((effect, effectIndex) => {
                if (effect.kind === 'startBattle') {
                    validateStoryBattleTriggerReferences(
                        resource.entry,
                        effect.battle,
                        `Story ${resource.entry.resourceId} choices[${choiceIndex}] ${choice.id} effects[${effectIndex}].battle`,
                        index,
                        failures,
                    );
                }
            });
        });
    }
}

function validateStoryBattleTriggerReferences(
    ownerEntry: ContentCatalogEntry,
    battle: StoryBattleTrigger,
    context: string,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const encounterResource = resolveRequiredStoryBattleTargetResource(
        ownerEntry,
        battle.encounterResourceId,
        {
            context,
            resourceIdField: 'encounterResourceId',
            missingMessage: `${context} encounterResourceId must be a non-empty string so catalog encounter targets resolve by resource id.`,
            publicPathField: 'encounterFile',
            publicPath: battle.encounterFile,
            expectedKinds: ['encounter'],
        },
        index,
        failures,
    );
    validateResolvedEncounterId(
        ownerEntry,
        encounterResource,
        battle.encounterFile,
        battle.encounterId,
        `${context}.encounterResourceId`,
        failures,
    );
    resolveRequiredStoryBattleTargetResource(
        ownerEntry,
        battle.deckResourceId,
        {
            context,
            resourceIdField: 'deckResourceId',
            missingMessage: `${context} deckResourceId must be a non-empty string so catalog deck targets resolve by resource id.`,
            publicPathField: 'deckFile',
            publicPath: battle.deckFile,
            expectedKinds: ['deck'],
        },
        index,
        failures,
    );
}

function resolveRequiredStoryBattleTargetResource(
    ownerEntry: ContentCatalogEntry,
    resourceId: string | undefined,
    reference: {
        context: string;
        resourceIdField: string;
        missingMessage: string;
        publicPathField: string;
        publicPath: string;
        expectedKinds: ContentResourceKind[];
    },
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): LoadedCatalogResource | undefined {
    if (!resourceId) {
        addFailure(failures, ownerEntry, reference.missingMessage);
        return undefined;
    }

    return resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context: reference.context,
        resourceIdField: reference.resourceIdField,
        resourceId,
        publicPathField: reference.publicPathField,
        publicPath: reference.publicPath,
        expectedKinds: reference.expectedKinds,
        publicPathOwnerLabel: 'battle',
    });
}

function validateResolvedEncounterId(
    ownerEntry: ContentCatalogEntry,
    encounterResource: LoadedCatalogResource | undefined,
    encounterFile: string,
    expectedEncounterId: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): void {
    if (!encounterResource || !isRecord(encounterResource.json)) {
        return;
    }

    const declaredEncounterId = encounterResource.json.id;

    if (typeof declaredEncounterId === 'string' && declaredEncounterId !== expectedEncounterId) {
        addFailure(
            failures,
            ownerEntry,
            `${context} expects encounterId ${expectedEncounterId}, but ${encounterFile} declares ${declaredEncounterId}.`,
        );
    }
}

function validateExpeditionReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    for (const resource of index.byResourceId.values()) {
        if (resource.entry.kind !== 'expeditionMap' || !isExpeditionMapDefinition(resource.json)) {
            continue;
        }

        validateExpeditionMapNodeReferences(resource.entry, resource.json, index, failures);
        validateExpeditionMapWithRegisteredBundleValidator(resource.entry, resource.json, index, failures);
    }
}

function validateExpeditionMapNodeReferences(
    ownerEntry: ContentCatalogEntry,
    map: ExpeditionMapDefinition,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    map.nodes.forEach((node, nodeIndex) => {
        if (!isRecord(node)) {
            addFailure(
                failures,
                ownerEntry,
                `Expedition map ${ownerEntry.resourceId} nodes[${nodeIndex}] must be an object before route-critical references can be validated.`,
            );
            return;
        }

        const typedNode = node as ExpeditionMapNode;

        if (typedNode.type === 'battle' || typedNode.type === 'boss') {
            validateEncounterNodeReference(ownerEntry, typedNode, index, failures);
        }

        if (typedNode.type === 'event') {
            validateEventNodeReference(ownerEntry, typedNode, index, failures);
        }

        if (typedNode.type === 'shop') {
            validateShopNodeReference(ownerEntry, typedNode, index, failures);
        }
    });
}

function validateEncounterNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: ExpeditionEncounterMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const encounterFile = readPayloadString(ownerEntry, payloadRef, 'encounterFile', context, failures);
    const encounterId = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);
    const encounterResourceId = readExpeditionEncounterResourceId(ownerEntry, payloadRef, context, failures);

    if (!encounterFile || !encounterId || !encounterResourceId) {
        return;
    }

    const encounterResource = resolveCatalogResourceIdReference(index, failures, ownerEntry, {
        context,
        resourceIdField: 'encounterResourceId',
        resourceId: encounterResourceId,
        publicPathField: 'encounterFile',
        publicPath: encounterFile,
        expectedKinds: ['encounter'],
        publicPathOwnerLabel: 'payloadRef',
    });

    validateResolvedEncounterId(
        ownerEntry,
        encounterResource,
        encounterFile,
        encounterId,
        `${context}.encounterResourceId`,
        failures,
    );
}

function validateEventNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: EventMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const contentFile = readPayloadString(ownerEntry, payloadRef, 'contentFile', context, failures);
    const eventRef = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);

    if (!contentFile || !eventRef) {
        return;
    }

    const eventResource = requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        contentFile,
        `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef.contentFile`,
        ['expeditionEvents'],
    );

    if (!eventResource || !isPrototypeEventCollection(eventResource.json)) {
        return;
    }

    if (!(eventRef in eventResource.json.eventsByNodeId)) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} node ${node.id} event ref ${eventRef} is missing from ${contentFile}.eventsByNodeId.`,
        );
    }
}

function validateShopNodeReference(
    ownerEntry: ContentCatalogEntry,
    node: ShopMapNode,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const context = `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef`;
    const payloadRef = readExpeditionPayloadRef(ownerEntry, node, context, failures);
    const contentFile = readPayloadString(ownerEntry, payloadRef, 'contentFile', context, failures);
    const shopRef = readPayloadString(ownerEntry, payloadRef, 'ref', context, failures);

    if (!contentFile || !shopRef) {
        return;
    }

    const shopResource = requireCatalogedResource(
        index,
        failures,
        ownerEntry,
        contentFile,
        `Expedition map ${ownerEntry.resourceId} node ${node.id} payloadRef.contentFile`,
        ['expeditionShop'],
    );

    if (!shopResource || !isPrototypeShopCollection(shopResource.json)) {
        return;
    }

    if (!(shopRef in shopResource.json.shopsByNodeId)) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} node ${node.id} shop ref ${shopRef} is missing from ${contentFile}.shopsByNodeId.`,
        );
    }
}

function readExpeditionPayloadRef(
    ownerEntry: ContentCatalogEntry,
    node: ExpeditionMapNode,
    context: string,
    failures: ContentCatalogValidationFailure[],
): Record<string, unknown> | undefined {
    if (!isRecord(node.payloadRef)) {
        addFailure(
            failures,
            ownerEntry,
            `${context} must be an object before route-critical references can be validated.`,
        );
        return undefined;
    }

    return node.payloadRef;
}

function readPayloadString(
    ownerEntry: ContentCatalogEntry,
    payloadRef: Record<string, unknown> | undefined,
    field: string,
    context: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    if (!payloadRef) {
        return undefined;
    }

    const value = payloadRef[field];

    if (typeof value !== 'string' || value.trim().length === 0) {
        addFailure(
            failures,
            ownerEntry,
            `${context}.${field} must be a non-empty string before route-critical references can be validated.`,
        );
        return undefined;
    }

    return value;
}

function readExpeditionEncounterResourceId(
    ownerEntry: ContentCatalogEntry,
    payloadRef: Record<string, unknown> | undefined,
    context: string,
    failures: ContentCatalogValidationFailure[],
): string | undefined {
    if (!payloadRef) {
        return undefined;
    }

    const value = payloadRef.encounterResourceId;

    if (typeof value !== 'string' || value.trim().length === 0) {
        addFailure(
            failures,
            ownerEntry,
            `${context}.encounterResourceId must be a non-empty string so catalog encounter targets resolve by resource id.`,
        );
        return undefined;
    }

    return value;
}

function validateExpeditionMapWithRegisteredBundleValidator(
    ownerEntry: ContentCatalogEntry,
    map: ExpeditionMapDefinition,
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    const firstEventResource = findFirstContentResourceForMapNode(index, map.nodes, 'event')
        ?? findFirstResourceByKind(index, 'expeditionEvents');
    const firstShopResource = findFirstContentResourceForMapNode(index, map.nodes, 'shop')
        ?? findFirstResourceByKind(index, 'expeditionShop');

    if (!firstEventResource?.json || !firstShopResource?.json) {
        return;
    }

    try {
        validatePrototypeExpeditionContent({
            map,
            events: firstEventResource.json,
            shops: firstShopResource.json,
        });
    } catch (error) {
        addFailure(
            failures,
            ownerEntry,
            `Expedition map ${ownerEntry.resourceId} failed registered pure validator validatePrototypeExpeditionContent with ${firstEventResource.entry.publicPath} and ${firstShopResource.entry.publicPath}: ${formatErrorMessage(error)}.`,
        );
    }
}

export function validateContentCatalog(
    rawCatalog: unknown,
    fileSource: ContentCatalogFileSource,
): ContentCatalogValidationResult {
    const failures: ContentCatalogValidationFailure[] = [];
    let catalog: ContentCatalogDefinition;

    try {
        catalog = parseContentCatalogDefinition(rawCatalog);
    } catch (error) {
        return {
            validatedResourceCount: 0,
            registeredValidatorNames: [...REGISTERED_VALIDATOR_NAMES],
            failures: [
                {
                    resourceId: 'content-catalog',
                    publicPath: CONTENT_CATALOG_PUBLIC_PATH,
                    message: `Content catalog manifest is invalid: ${formatErrorMessage(error)}.`,
                },
            ],
        };
    }

    const { index, validatedResourceCount } = loadContentCatalogValidationIndex(catalog, fileSource, KIND_VALIDATORS, failures);

    validateCatalogContentIdReferences(index.byResourceId.values(), failures);
    validateWorldMapReferences(index, failures);
    validateHubReferences(index, failures);
    validateStoryBattleReferences(index, failures);
    validateExpeditionReferences(index, failures);

    return {
        validatedResourceCount,
        registeredValidatorNames: [...REGISTERED_VALIDATOR_NAMES],
        failures,
    };
}
