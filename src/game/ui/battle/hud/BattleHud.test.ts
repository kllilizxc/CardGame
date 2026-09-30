import { beforeAll, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Scene } from 'phaser';
import type { BattleLayoutConfig } from '../../../config/LayoutConfig';
import type { BattleState } from '../../../state/BattleState';
import type { BattleLog } from '../BattleLog';
import type { BattleHud as Hud } from './BattleHud';

let BattleHud: typeof Hud;

beforeAll(async () => {
    mock.module('phaser', () => ({ GameObjects: {} }));
    mock.module('../../../art/sprites', () => ({ iconTexture: () => '' }));
    mock.module('../../../art/ui', () => ({
        drawPixelBar: () => {}, drawPixelFrame: () => {}, pixelPanel: () => {},
        PANEL_BLOOD: {}, PANEL_INK: {}, PANEL_JADE: {},
    }));
    mock.module('../../../art/wenxin/WenxinBattleStage', () => ({ getWenxinBattleStage: () => null }));
    try {
        ({ BattleHud } = await import(`./BattleHud${'?lifecycle-test'}`));
    } finally {
        mock.restore();
    }
});

function createFixture(events = new EventEmitter(), input = new EventEmitter()) {
    const killTweensOf = mock(() => {});
    const scene = { events, input, tweens: { killTweensOf, add: () => {} }, time: { now: 0 } };
    const state = {
        playerField: [], enemyField: [], isPlayerTurn: true, turnNumber: 1,
        getHandCount: () => 5, getDeckCount: () => 15, getDiscardPileCount: () => 0,
    };
    const hud = new BattleHud(scene as unknown as Scene, {} as BattleLayoutConfig, state as unknown as BattleState);
    const internals = hud as unknown as Record<string, any>;
    const text = { active: true, setText: () => {}, setColor: () => {} };
    const object = { destroy: mock(() => { text.active = false; }) };
    const drawHp = mock(() => {
        if (!text.active) throw new Error('Cannot read properties of null (reading drawImage)');
    });
    internals.createPlayerPlate = () => { internals.hpNumber = text; internals.chips = text; internals.objs.push(object); };
    internals.createTurnRibbon = () => { internals.turnText = text; internals.turnSub = text; };
    internals.createToolbar = () => {};
    internals.createPiles = () => { internals.deckCount = text; internals.discardCount = text; };
    internals.createActions = () => {
        internals.endButton = { setEnabled: () => {}, setLabel: () => {} };
        internals.endGlow = { setVisible: () => {} };
    };
    internals.createDropHint = () => {};
    internals.drawHp = drawHp;
    internals.drawTurnPanel = () => {};
    internals.drawDropHint = () => {};
    hud.createAll();
    return { hud, internals, events, input, text, object, drawHp, killTweensOf };
}

describe('BattleHud lifecycle', () => {
    it('removes the old HUD update listener before a new battle uses the same scene emitter', () => {
        const old = createFixture();
        old.text.active = false; // Phaser destroys display objects during scene shutdown.
        old.events.emit('shutdown');
        expect(old.events.listenerCount('update')).toBe(0);
        expect(old.input.listenerCount('dragstart')).toBe(0);
        expect(old.input.listenerCount('dragend')).toBe(0);
        const next = createFixture(old.events, old.input);
        expect(next.events.listenerCount('update')).toBe(1);
        expect(() => next.events.emit('update', 100, 16)).not.toThrow();
        expect(old.drawHp).toHaveBeenCalledTimes(1);
        expect(next.drawHp).toHaveBeenCalledTimes(2);
        next.hud.destroy();
    });

    it('makes manual cleanup idempotent and ignores an already queued update or late log line', () => {
        const fixture = createFixture();
        const queuedUpdate = fixture.internals.updateHandler;
        let logLine: (line: string) => void = () => {};
        fixture.hud.attachLog({
            onLine: (listener: (line: string) => void) => { logLine = listener; },
            setToggleVisible: () => {},
        } as unknown as BattleLog);
        fixture.hud.destroy();
        expect(() => { fixture.hud.destroy(); queuedUpdate(100, 16); logLine('Late battle result'); }).not.toThrow();
        expect(fixture.object.destroy).toHaveBeenCalledTimes(1);
        expect(fixture.killTweensOf).toHaveBeenCalledWith(fixture.object);
        expect(fixture.events.listenerCount('shutdown')).toBe(0);
        expect(fixture.events.listenerCount('destroy')).toBe(0);
        expect(fixture.drawHp).toHaveBeenCalledTimes(1);
    });

    it('cleans up on scene destruction and does not register duplicate frame updates', () => {
        const fixture = createFixture();
        fixture.hud.createAll();
        expect(fixture.events.listenerCount('update')).toBe(1);
        fixture.events.emit('destroy');
        expect(fixture.events.listenerCount('update')).toBe(0);
        expect(fixture.object.destroy).toHaveBeenCalledTimes(1);
    });
});
