import type { EntryPanelFrame } from '../expedition/EntryPanelFrame';

export interface DeckManagementRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DeckManagementDenseGridMetrics {
    readonly columns: number;
    readonly gap: number;
    readonly minTileWidth: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly aspectRatio: number;
}

export interface DeckManagementPanelLayoutMetrics {
    readonly panelBounds: {
        readonly left: number;
        readonly right: number;
        readonly top: number;
        readonly bottom: number;
    };
    readonly keyboardGuide: {
        readonly left: number;
        readonly centerY: number;
        readonly width: number;
        readonly height: number;
    };
    readonly content: DeckManagementRect;
    readonly leftWorkspace: DeckManagementRect & {
        readonly innerX: number;
        readonly innerY: number;
        readonly innerWidth: number;
        readonly innerHeight: number;
    };
    readonly editor: DeckManagementRect;
    readonly browser: DeckManagementRect & {
        readonly innerX: number;
        readonly innerY: number;
        readonly innerWidth: number;
        readonly innerHeight: number;
    };
    readonly mainDeckGrid: DeckManagementDenseGridMetrics;
    readonly extraDeckGrid: DeckManagementDenseGridMetrics;
    readonly cardPoolGrid: DeckManagementDenseGridMetrics;
}

const PANEL_MAX_WIDTH = 1460;
const PANEL_MAX_HEIGHT = 920;
const PANEL_WIDTH_RATIO = 0.984;
const PANEL_HEIGHT_RATIO = 0.96;
const PANEL_Y_OFFSET = 12;

const FOOTER_GUIDE_HEIGHT = 56;
const CONTENT_SIDE_INSET = 18;
const CONTENT_TOP_INSET = 16;
const COLUMN_GAP = 8;
const LEFT_WORKSPACE_INNER_X = 10;
const LEFT_WORKSPACE_INNER_TOP = 8;
const LEFT_WORKSPACE_INNER_BOTTOM = 6;
const RIGHT_COLUMN_MIN_WIDTH = 320;
const RIGHT_COLUMN_MAX_WIDTH = 360;
const RIGHT_COLUMN_RATIO = 0.24;
const BROWSER_INNER_INSET = 16;

const CARD_ASPECT_RATIO = 59 / 86;
const MAIN_DECK_TILE_MIN_WIDTH = 104;
const CARD_POOL_TILE_MIN_WIDTH = 56;
const MAIN_DECK_TILE_GAP = 8;
const CARD_POOL_TILE_GAP = 6;

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function computeDenseGridMetrics(
    availableWidth: number,
    minTileWidth: number,
    gap: number,
    aspectRatio = CARD_ASPECT_RATIO,
): DeckManagementDenseGridMetrics {
    const safeWidth = Math.max(availableWidth, minTileWidth);
    const columns = Math.max(1, Math.floor((safeWidth + gap) / (minTileWidth + gap)));
    const tileWidth = Math.max(
        minTileWidth,
        Math.floor((safeWidth - Math.max(columns - 1, 0) * gap) / columns),
    );

    return {
        columns,
        gap,
        minTileWidth,
        tileWidth,
        tileHeight: Math.max(1, Math.round(tileWidth / aspectRatio)),
        aspectRatio,
    };
}

export function createDeckManagementPanelFrame(sceneWidth: number, sceneHeight: number): EntryPanelFrame {
    return {
        panelX: sceneWidth / 2,
        panelY: sceneHeight / 2 + PANEL_Y_OFFSET,
        panelWidth: Math.min(PANEL_MAX_WIDTH, sceneWidth * PANEL_WIDTH_RATIO),
        panelHeight: Math.min(PANEL_MAX_HEIGHT, sceneHeight * PANEL_HEIGHT_RATIO),
    };
}

export function computeDeckManagementPanelLayout(
    frame: Readonly<EntryPanelFrame>,
): DeckManagementPanelLayoutMetrics {
    const panelLeft = frame.panelX - frame.panelWidth / 2;
    const panelRight = frame.panelX + frame.panelWidth / 2;
    const panelTop = frame.panelY - frame.panelHeight / 2;
    const panelBottom = frame.panelY + frame.panelHeight / 2;

    const keyboardGuideWidth = Math.min(428, Math.max(336, frame.panelWidth * 0.28));
    const keyboardGuideCenterY = panelBottom - 20;
    const keyboardGuideLeft = panelRight - 22 - keyboardGuideWidth;

    const contentX = panelLeft + CONTENT_SIDE_INSET;
    const contentY = panelTop + CONTENT_TOP_INSET;
    const contentBottom = keyboardGuideCenterY - FOOTER_GUIDE_HEIGHT / 2 - 10;
    const contentWidth = frame.panelWidth - CONTENT_SIDE_INSET * 2;
    const contentHeight = contentBottom - contentY;

    const rightColumnWidth = clampNumber(
        Math.floor(contentWidth * RIGHT_COLUMN_RATIO),
        RIGHT_COLUMN_MIN_WIDTH,
        RIGHT_COLUMN_MAX_WIDTH,
    );
    const leftWorkspaceWidth = contentWidth - rightColumnWidth - COLUMN_GAP;
    const rightColumnX = contentX + leftWorkspaceWidth + COLUMN_GAP;

    const leftWorkspaceInnerX = contentX + LEFT_WORKSPACE_INNER_X;
    const leftWorkspaceInnerY = contentY + LEFT_WORKSPACE_INNER_TOP;
    const leftWorkspaceInnerWidth = leftWorkspaceWidth - LEFT_WORKSPACE_INNER_X * 2;
    const leftWorkspaceInnerHeight = contentHeight - LEFT_WORKSPACE_INNER_TOP - LEFT_WORKSPACE_INNER_BOTTOM;

    const browserInnerWidth = rightColumnWidth - BROWSER_INNER_INSET * 2;

    return {
        panelBounds: {
            left: panelLeft,
            right: panelRight,
            top: panelTop,
            bottom: panelBottom,
        },
        keyboardGuide: {
            left: keyboardGuideLeft,
            centerY: keyboardGuideCenterY,
            width: keyboardGuideWidth,
            height: FOOTER_GUIDE_HEIGHT,
        },
        content: {
            x: contentX,
            y: contentY,
            width: contentWidth,
            height: contentHeight,
        },
        leftWorkspace: {
            x: contentX,
            y: contentY,
            width: leftWorkspaceWidth,
            height: contentHeight,
            innerX: leftWorkspaceInnerX,
            innerY: leftWorkspaceInnerY,
            innerWidth: leftWorkspaceInnerWidth,
            innerHeight: leftWorkspaceInnerHeight,
        },
        editor: {
            x: leftWorkspaceInnerX,
            y: leftWorkspaceInnerY,
            width: leftWorkspaceInnerWidth,
            height: leftWorkspaceInnerHeight,
        },
        browser: {
            x: rightColumnX,
            y: contentY,
            width: rightColumnWidth,
            height: contentHeight,
            innerX: rightColumnX + BROWSER_INNER_INSET,
            innerY: contentY,
            innerWidth: browserInnerWidth,
            innerHeight: contentHeight,
        },
        mainDeckGrid: computeDenseGridMetrics(
            leftWorkspaceInnerWidth,
            MAIN_DECK_TILE_MIN_WIDTH,
            MAIN_DECK_TILE_GAP,
        ),
        extraDeckGrid: computeDenseGridMetrics(
            leftWorkspaceInnerWidth,
            MAIN_DECK_TILE_MIN_WIDTH,
            MAIN_DECK_TILE_GAP,
        ),
        cardPoolGrid: computeDenseGridMetrics(
            browserInnerWidth,
            CARD_POOL_TILE_MIN_WIDTH,
            CARD_POOL_TILE_GAP,
        ),
    };
}
