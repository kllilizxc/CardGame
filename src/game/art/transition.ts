import Phaser from 'phaser';
import { INK, PX } from './palette';

/**
 * Scene transitions: an ink-block wipe. On exit the screen fills with ink squares sweeping
 * diagonally; the next scene opens by shrinking them away in stepped (pixel) sizes.
 */
const CELL = 8 * PX;
const COVER_MS = 280;
const REVEAL_MS = 420;

function drawCells(g: Phaser.GameObjects.Graphics, w: number, h: number, t: number, reveal: boolean): void {
    const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
    g.clear();
    g.fillStyle(INK.void, 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const order = (c / cols + r / rows) / 2; // 0 top-left → 1 bottom-right
        const local = Phaser.Math.Clamp((t - order * 0.6) / 0.4, 0, 1);
        const k = reveal ? 1 - local : local;
        const steps = Math.round(k * 4) / 4; // 4 stepped sizes
        if (steps <= 0) continue;
        const s = Math.round((CELL * steps) / PX) * PX;
        g.fillRect(c * CELL + (CELL - s) / 2, r * CELL + (CELL - s) / 2, s, s);
    }
}

export function inkIn(scene: Phaser.Scene, ms = REVEAL_MS): void {
    const { width, height } = scene.scale;
    const g = scene.add.graphics().setDepth(1e6).setScrollFactor(0);
    const start = scene.time.now;
    const tick = () => {
        const t = Math.min(1, (scene.time.now - start) / ms);
        drawCells(g, width, height, t, true);
        if (t >= 1) { scene.events.off(Phaser.Scenes.Events.UPDATE, tick); g.destroy(); }
    };
    tick();
    scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, tick));
}

let installed = false;
type Pending = { args: unknown[] };
let beforeStart: (() => void) | undefined;

/** Run `fn` right before every scene change (used to apply a new canvas size between scenes). */
export function setBeforeSceneStart(fn: () => void): void {
    beforeStart = fn;
}

/** Wrap ScenePlugin.start so every scene change plays the ink cover first. */
export function installSceneTransitions(): void {
    if (installed) return;
    installed = true;
    const proto = Phaser.Scenes.ScenePlugin.prototype as unknown as {
        start: (...args: unknown[]) => unknown;
        __pending?: Pending;
    };
    const orig = proto.start;
    proto.start = function (this: Phaser.Scenes.ScenePlugin & { __pending?: Pending }, ...args: unknown[]) {
        const scene = this.scene;
        const running = scene?.sys?.settings.status === Phaser.Scenes.RUNNING && scene.sys.isVisible();
        const skip = typeof location !== 'undefined' && location.search.includes('notrans');
        if (!running || skip || !scene.sys.game.renderer) { beforeStart?.(); return orig.apply(this, args); }
        if (this.__pending) { this.__pending.args = args; return this; }
        const pending: Pending = { args };
        this.__pending = pending;
        if (scene.input) scene.input.enabled = false;
        const { width, height } = scene.scale;
        const g = scene.add.graphics().setDepth(1e6).setScrollFactor(0);
        const cams = scene.cameras.cameras;
        const start = scene.time.now;
        const plugin = this;
        const finish = () => {
            scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
            plugin.__pending = undefined;
            if (scene.input) scene.input.enabled = true;
            beforeStart?.();
            orig.apply(plugin, pending.args);
        };
        const tick = () => {
            const t = Math.min(1, (scene.time.now - start) / COVER_MS);
            // Keep the cover pinned to screen space even on scrolled / zoomed cameras.
            const cam = cams[0];
            if (cam) g.setScale(1 / cam.zoom).setPosition(cam.worldView.x, cam.worldView.y);
            drawCells(g, width, height, t, false);
            if (t >= 1) finish();
        };
        scene.events.on(Phaser.Scenes.Events.UPDATE, tick);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
            if (plugin.__pending === pending) { plugin.__pending = undefined; }
        });
        tick();
        return this;
    };
}
