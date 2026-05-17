import type { CreateRunSnapshotParams, ExpeditionState } from '../../state/ExpeditionState';
import type { PersistentStash, RunSnapshot } from '../../types/expedition';
import {
    getSelectedSavedDeck,
    validateDeckAvailability,
    validateDeckSize,
    type DeckValidityReason,
} from '../../state/PersistentStashDecks';
import { createPreparationSummary, createRunSummary } from './entryFlowModel';

export interface ExpeditionEntryViewState {
    mode: 'preparation' | 'activeRun';
    activeRun: RunSnapshot | null;
    statusText: string;
}

export interface ConfirmedExpeditionEntryViewState {
    mode: 'activeRun';
    activeRun: RunSnapshot;
    statusText: string;
}

export function getInitialExpeditionEntryView(expeditionState: ExpeditionState): ExpeditionEntryViewState {
    if (expeditionState.activeRun) {
        return {
            mode: 'activeRun',
            activeRun: expeditionState.activeRun,
            statusText: createRunSummary(expeditionState.activeRun).statusText,
        };
    }

    return {
        mode: 'preparation',
        activeRun: null,
        statusText: createPreparationSummary(expeditionState.persistentStash).statusText,
    };
}

export interface LoadoutValidationResult {
    valid: boolean;
    sizeIssue: DeckValidityReason | null;
    availabilityIssues: DeckValidityReason[];
}

export function validateExpeditionLoadout(stash: PersistentStash): LoadoutValidationResult {
    const selectedDeck = getSelectedSavedDeck(stash);

    if (!selectedDeck) {
        return {
            valid: false,
            sizeIssue: null,
            availabilityIssues: [],
        };
    }

    const sizeIssue = validateDeckSize(selectedDeck.cards);
    const availabilityIssues = validateDeckAvailability(selectedDeck.cards, stash.cards);

    return {
        valid: !sizeIssue && availabilityIssues.length === 0,
        sizeIssue,
        availabilityIssues,
    };
}

export function confirmExpeditionLoadout(
    expeditionState: ExpeditionState,
    params: CreateRunSnapshotParams,
): ConfirmedExpeditionEntryViewState {
    const activeRun = expeditionState.createRunSnapshot(params);

    return {
        mode: 'activeRun',
        activeRun,
        statusText: createRunSummary(activeRun, { mode: 'started' }).statusText,
    };
}
