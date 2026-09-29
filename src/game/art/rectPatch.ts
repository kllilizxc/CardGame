import Phaser from 'phaser';
import { C, PX } from './palette';

/**
 * Any big stroked Rectangle (panels, buttons, tooltips) gets pixel-art frame dressing:
 * cut corners, chunky bevel and gold studs. Hover recolours the game already does keep working
 * because the dressing is a separate Graphics that only draws bevels, never fills.
 */
type DecoRect = Phaser.GameObjects.Rectangle & { noDeco?: boolean; deco?: boolean; __deco?: Phaser.GameObjects.Graphics };

let installed = false;

function decorate(rect: DecoRect): void {
    if (!rect.active || rect.__deco || rect.noDeco || !rect.scene) return;
    const w = Math.round(rect.displayWidth);
    const h = Math.round(rect.displayHeight);
    const u = PX;
    const scene = rect.scene;
    const g = scene.add.graphics();
    const big = w >= 160 && h >= 90;

    // dark corner notches + bevel, drawn relative to the rect centre
    const x0 = -Math.round(w / 2);
    const y0 = -Math.round(h / 2);
    g.fillStyle(C.void, 1);
    for (const [cx, cy] of [[x0, y0], [x0 + w - u, y0], [x0, y0 + h - u], [x0 + w - u, y0 + h - u]]) g.fillRect(cx, cy, u, u);
    g.fillStyle(C.paper, 0.16);
    g.fillRect(x0 + u, y0 + u, w - 2 * u, u);
    g.fillRect(x0 + u, y0 + u, u, h - 2 * u);
    g.fillStyle(C.void, 0.4);
    g.fillRect(x0 + u, y0 + h - 2 * u, w - 2 * u, u);
    g.fillRect(x0 + w - 2 * u, y0 + u, u, h - 2 * u);
    g.fillStyle(C.gold, 1);
    if (big) for (const [cx, cy] of [[x0 + u, y0 + u], [x0 + w - 2 * u, y0 + u], [x0 + u, y0 + h - 2 * u], [x0 + w - 2 * u, y0 + h - 2 * u]]) g.fillRect(cx, cy, u, u);

    const parent = rect.parentContainer;
    if (parent) parent.addAt(g, parent.getIndex(rect) + 1);
    else g.setDepth(rect.depth + 0.01);

    const sync = () => {
        if (!rect.active) return;
        g.setPosition(rect.x, rect.y);
        g.setVisible(rect.visible);
        g.setAlpha(rect.alpha);
        g.setScale(rect.scaleX, rect.scaleY);
        g.setAngle(rect.angle);
        if (!parent) g.setDepth(rect.depth + 0.01);
    };
    sync();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync);
    rect.once(Phaser.GameObjects.Events.DESTROY, () => {
        scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync);
        g.destroy();
    });
    rect.__deco = g;
}

export function installPixelRects(): void {
    if (installed) return;
    installed = true;
    const proto = Phaser.GameObjects.Rectangle.prototype;
    const orig = proto.setStrokeStyle;
    proto.setStrokeStyle = function (this: DecoRect, lineWidth?: number, color?: number, alpha?: number) {
        const r = orig.call(this, lineWidth, color, alpha);
        if (lineWidth && lineWidth >= 2 && !this.__deco && !this.noDeco && ((this.width >= 100 && this.height >= 40) || this.deco) && this.scene) {
            this.scene.events.once(Phaser.Scenes.Events.POST_UPDATE, () => decorate(this));
        }
        return r;
    };
}
