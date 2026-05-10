import type { HubTownDefinition } from '../scenes/hub/hubTown';
import type {
    WorldMapDefinition,
    WorldMapExpeditionDestination,
    WorldMapHubDestination,
} from '../scenes/worldmap/worldMap';
import type { StoryGraph } from '../scenes/story/storyFlow';
import { validatePrototypeExpeditionContent } from '../types/prototypeExpeditionContent';
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
import type {
    ContentCatalogEntry,
    ContentCatalogValidationFailure,
    ContentResourceKind,
} from './contentCatalog';
import {
    addFailure,
    findFirstContentResourceForMapNode,
    findFirstResourceByKind,
    formatErrorMessage,
    isRecord,
    requireCatalogedResource,
    resolveCatalogResourceIdReference,
    type LoadedCatalogIndex,
    type LoadedCatalogResource,
} from './contentCatalogValidationIndex';

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

export function validateCatalogRouteReferences(
    index: LoadedCatalogIndex,
    failures: ContentCatalogValidationFailure[],
): void {
    validateWorldMapReferences(index, failures);
    validateHubReferences(index, failures);
    validateStoryBattleReferences(index, failures);
    validateExpeditionReferences(index, failures);
}
