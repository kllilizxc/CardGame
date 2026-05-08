import type { BattleLaunchPayload, ExpeditionCardStack } from '../../types/expedition';

export interface StarterDeckData {
    cards: ExpeditionCardStack[];
}

export interface EncounterUnitConfig {
    cardId: string;
    position?: number;
}

interface EncounterData {
    enemies?: EncounterUnitConfig[];
    units?: EncounterUnitConfig[];
}

function isRunDeck(value: unknown): value is ExpeditionCardStack[] {
    return Array.isArray(value)
        && value.every((stack) => {
            if (typeof stack !== 'object' || stack === null) {
                return false;
            }

            const candidate = stack as Partial<ExpeditionCardStack>;
            return typeof candidate.id === 'string' && typeof candidate.count === 'number';
        });
}

function isBattleLaunchPayload(value: unknown): value is BattleLaunchPayload {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<BattleLaunchPayload>;

    return typeof candidate.runId === 'string'
        && typeof candidate.nodeId === 'string'
        && (candidate.nodeType === 'battle' || candidate.nodeType === 'boss')
        && typeof candidate.encounterId === 'string'
        && typeof candidate.encounterFile === 'string'
        && isRunDeck(candidate.runDeck);
}

export function normalizeBattleLaunchPayload(data: unknown): BattleLaunchPayload | null {
    if (!isBattleLaunchPayload(data)) {
        return null;
    }

    return {
        runId: data.runId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        encounterId: data.encounterId,
        encounterFile: data.encounterFile,
        runDeck: data.runDeck.map((stack) => ({ ...stack })),
        rewardPreview: data.rewardPreview,
    };
}

export function getBattleDeckStacks(
    payload: BattleLaunchPayload | null,
    starterDeck: StarterDeckData,
): ExpeditionCardStack[] {
    return (payload?.runDeck ?? starterDeck.cards).map((stack) => ({ ...stack }));
}

export function getEncounterCacheKey(payload: BattleLaunchPayload | null): string {
    if (!payload) {
        return 'currentEncounter';
    }

    return `expeditionEncounter:${payload.runId}:${payload.nodeId}`;
}

export function getEncounterFile(payload: BattleLaunchPayload | null): string {
    return payload?.encounterFile ?? 'data/encounters/medium-enemy.json';
}

export function getEncounterUnits(encounterData: EncounterData | null | undefined): EncounterUnitConfig[] {
    return encounterData?.enemies ?? encounterData?.units ?? [];
}
