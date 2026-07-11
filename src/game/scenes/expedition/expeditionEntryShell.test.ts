import { beforeAll, describe, expect, it, mock } from 'bun:test';

import initialWorldState from '../../../../public/data/world/initial-state.json';
import starterDeckJson from '../../../../public/data/decks/starter-deck.json';
import prototypeMapJson from '../../../../public/data/mijing/prototype-map.json';

import { resetRunPersistenceForTests } from '../../services/RunPersistence';
import { ExpeditionState } from '../../state/ExpeditionState';
import { updateSavedDeckInStash } from '../../state/PersistentStashDecks';
import type { PersistentStash } from '../../types/expedition';

class FakeScene {
    constructor(_sceneKey?: string) {}
}

class FakeContainer {
    public alpha = 1;
    public y = 0;
    public destroyed = false;

    constructor(_scene?: unknown) {}

    add(): this {
        return this;
    }

    destroy(): void {
        this.destroyed = true;
    }

    setDepth(): this {
        return this;
    }

    setAlpha(alpha: number): this {
        this.alpha = alpha;
        return this;
    }

    setY(y: number): this {
        this.y = y;
        return this;
    }
}

class FakeRectangle {
    public visible = false;
    public input?: { enabled: boolean };

    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }

    setInteractive(): this {
        this.input = { enabled: true };
        return this;
    }

    disableInteractive(): this {
        this.input = { enabled: false };
        return this;
    }
}

class FakeText {
    public width = 0;
    public height = 0;

    setText(): this {
        return this;
    }

    setStyle(): this {
        return this;
    }

    setColor(): this {
        return this;
    }

    setWordWrapWidth(): this {
        return this;
    }

    setAlpha(): this {
        return this;
    }

    setPosition(): this {
        return this;
    }
}

class MockPreparationPanel extends FakeContainer {
    public stash: PersistentStash;
    public readonly config: {
        stash: PersistentStash;
        onConfirm: () => void;
        onOpenDeckManager?: () => void;
    };

    constructor(scene: unknown, config: {
        stash: PersistentStash;
        onConfirm: () => void;
        onOpenDeckManager?: () => void;
    }) {
        super(scene);
        this.stash = config.stash;
        this.config = config;
    }

    updateStash(stash: PersistentStash): void {
        this.stash = stash;
    }

    getEntryPanelFrame(): null {
        return null;
    }

    triggerConfirm(): void {
        this.config.onConfirm();
    }

    triggerOpenDeckManager(): void {
        this.config.onOpenDeckManager?.();
    }
}

class MockDeckManagementPanel extends FakeContainer {
    public readonly config: {
        stash: PersistentStash;
        onStashChange: (stash: PersistentStash) => void;
        onClose: () => void;
    };

    constructor(scene: unknown, config: {
        stash: PersistentStash;
        onStashChange: (stash: PersistentStash) => void;
        onClose: () => void;
    }) {
        super(scene);
        this.config = config;
    }

    getEntryPanelFrame(): null {
        return null;
    }

    triggerClose(): void {
        this.config.onClose();
    }

    triggerStashChange(stash: PersistentStash): void {
        this.config.onStashChange(stash);
    }
}

let ExpeditionScene: new () => unknown;

beforeAll(async () => {
    mock.module('phaser', () => ({
        Scene: FakeScene,
        Events: {
            EventEmitter: class {
                emit(): boolean {
                    return true;
                }

                on(): this {
                    return this;
                }

                off(): this {
                    return this;
                }
            },
        },
        GameObjects: {
            Container: FakeContainer,
            Rectangle: FakeRectangle,
            Text: FakeText,
        },
    }));
    mock.module('../../ui/expedition/PreparationPanel', () => ({
        PreparationPanel: MockPreparationPanel,
    }));
    mock.module('../../ui/deckbuilder/DeckManagementPanel', () => ({
        DeckManagementPanel: MockDeckManagementPanel,
    }));
    mock.module('../../ui/expedition/RunHud', () => ({
        RunHud: class {},
    }));
    mock.module('../../ui/expedition/MapNodeView', () => ({
        MapNodeView: class {},
    }));

    try {
        ({ ExpeditionScene } = await import(`./ExpeditionScene${'?entry-shell-test'}`));
    } finally {
        mock.restore();
    }
});

function createSceneHarness() {
    resetRunPersistenceForTests();

    const scene = new ExpeditionScene() as any;
    const expeditionId = 'phase01-first-playable-expedition';
    const mapId = prototypeMapJson.id;

    scene.expeditionState = ExpeditionState.bootstrap({
        worldState: structuredClone(initialWorldState),
        starterDeck: structuredClone(starterDeckJson),
        activeRunIdentity: {
            expeditionId,
            mapId,
        },
    });
    scene.launchData = {
        expeditionId,
        mapId,
    };
    scene.mapDefinition = structuredClone(prototypeMapJson);
    scene.deckbuilderCardMetadata = {};
    scene.entryTransitionBlocker = new FakeRectangle();
    scene.runHud = {
        hideArrivalCue() {},
        setVisible() {},
        updateFromRun() {},
        showArrivalCue() {},
    };
    scene.tweens = {
        killTweensOf() {},
        add(config: { onComplete?: () => void }) {
            config.onComplete?.();
            return config;
        },
    };
    scene.destroyDepartureHandoffOverlay = () => {};
    scene.setStatusPlateVisible = () => {};
    scene.clearMapViews = () => {};
    scene.destroyNodeMenu = () => {};
    scene.destroyActiveNodePanel = () => {};
    scene.updateEntryShellMode = () => {};
    scene.updateEntryShellLayout = () => {};
    scene.setEntryShellVisible = () => {};
    scene.updateStatusPlate = () => {};
    scene.playDepartureHandoff = (_summary: unknown, onComplete: () => void) => {
        onComplete();
    };
    scene.showActiveRun = (_activeRun: unknown) => {};
    scene.dismissEntryPanels = (onComplete: () => void) => {
        scene.preparationPanel = undefined;
        scene.deckManagementPanel = undefined;
        onComplete();
    };
    scene.swapEntryPanel = (currentPanel: MockPreparationPanel | MockDeckManagementPanel | undefined, _nextPanel: unknown) => {
        currentPanel?.destroy();
        scene.setEntryTransitionBlocker(Boolean(currentPanel));
    };

    return scene;
}

function createAlternateSelectedDeckStash(stash: PersistentStash): PersistentStash {
    const starterDeck = stash.savedDecks[0];
    const altDeckCards = starterDeck.cards
        .map((stack) => ({ ...stack }))
        .reverse();

    return {
        ...stash,
        cards: stash.cards.map((stack) => ({ ...stack })),
        savedDecks: [
            ...stash.savedDecks.map((deck) => ({
                ...deck,
                cards: deck.cards.map((stack) => ({ ...stack })),
            })),
            {
                id: 'alt-deck',
                name: '备用卡组',
                cards: altDeckCards,
            },
        ],
        selectedDeckId: 'alt-deck',
    };
}

function createInvalidEditedStash(stash: PersistentStash): PersistentStash {
    const selectedDeckId = stash.selectedDeckId ?? stash.savedDecks[0]?.id;
    const firstCardId = stash.savedDecks[0]?.cards[0]?.id ?? 'AR_001';

    return updateSavedDeckInStash(stash, selectedDeckId!, [{ id: firstCardId, count: 1 }]);
}

describe('expedition entry shell', () => {
    it('ignores confirm callbacks until the return transition back to preparation has finished', () => {
        const scene = createSceneHarness();

        scene.showPreparationPanel();
        const preparationPanel = scene.preparationPanel as MockPreparationPanel;
        preparationPanel.triggerOpenDeckManager();
        scene.setEntryTransitionBlocker(false);

        const deckManagementPanel = scene.deckManagementPanel as MockDeckManagementPanel;
        deckManagementPanel.triggerClose();

        const returnedPreparationPanel = scene.preparationPanel as MockPreparationPanel;
        expect(scene.entryTransitionBlocker.visible).toBe(true);

        returnedPreparationPanel.triggerConfirm();
        expect(scene.expeditionState.activeRun).toBeNull();

        scene.setEntryTransitionBlocker(false);
        returnedPreparationPanel.triggerConfirm();

        expect(scene.expeditionState.activeRun).not.toBeNull();
    });

    it('rebuilds preparation with the switched selected deck before confirmation runs', () => {
        const scene = createSceneHarness();

        scene.showPreparationPanel();
        (scene.preparationPanel as MockPreparationPanel).triggerOpenDeckManager();
        scene.setEntryTransitionBlocker(false);

        const switchedStash = createAlternateSelectedDeckStash(scene.expeditionState.persistentStash);
        const deckManagementPanel = scene.deckManagementPanel as MockDeckManagementPanel;
        deckManagementPanel.triggerStashChange(switchedStash);
        deckManagementPanel.triggerClose();

        const returnedPreparationPanel = scene.preparationPanel as MockPreparationPanel;
        expect(returnedPreparationPanel.stash.selectedDeckId).toBe('alt-deck');

        scene.setEntryTransitionBlocker(false);
        returnedPreparationPanel.triggerConfirm();

        expect(scene.expeditionState.activeRun?.carriedDeck).toEqual(
            switchedStash.savedDecks.find((deck) => deck.id === 'alt-deck')?.cards,
        );
    });

    it('blocks confirmation without crashing when same-deck edits leave the returned loadout invalid', () => {
        const scene = createSceneHarness();

        scene.showPreparationPanel();
        (scene.preparationPanel as MockPreparationPanel).triggerOpenDeckManager();
        scene.setEntryTransitionBlocker(false);

        const invalidStash = createInvalidEditedStash(scene.expeditionState.persistentStash);
        const deckManagementPanel = scene.deckManagementPanel as MockDeckManagementPanel;
        deckManagementPanel.triggerStashChange(invalidStash);
        deckManagementPanel.triggerClose();

        const returnedPreparationPanel = scene.preparationPanel as MockPreparationPanel;
        expect(returnedPreparationPanel.stash.savedDecks[0]?.cards).toEqual(invalidStash.savedDecks[0]?.cards);

        scene.setEntryTransitionBlocker(false);
        expect(() => returnedPreparationPanel.triggerConfirm()).not.toThrow();
        expect(scene.expeditionState.activeRun).toBeNull();
    });
});
