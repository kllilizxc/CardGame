import type { CreateRunSnapshotParams, ExpeditionState } from '../../state/ExpeditionState';
import type { RunSnapshot } from '../../types/expedition';
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
