export interface EntryPanelFrame {
    panelX: number;
    panelY: number;
    panelWidth: number;
    panelHeight: number;
}

export interface EntryPanelFrameProvider {
    getEntryPanelFrame(): EntryPanelFrame | null;
}

export function getEntryPanelTop(frame: EntryPanelFrame): number {
    return frame.panelY - frame.panelHeight / 2;
}

export function getEntryShellCenterY(
    frame: EntryPanelFrame,
    shellHeight: number,
    options: {
        gap?: number;
        minTopMargin?: number;
    } = {},
): number {
    const gap = options.gap ?? 18;
    const minTopMargin = options.minTopMargin ?? 24;
    const minCenterY = minTopMargin + shellHeight / 2;
    const idealCenterY = getEntryPanelTop(frame) - gap - shellHeight / 2;

    return Math.max(minCenterY, idealCenterY);
}
