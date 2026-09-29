import Phaser from 'phaser';
import { C, FONT, hex, PX } from './palette';

const snap = (v: number, u = PX): number => Math.round(v / u) * u;

/** Square-pixel particle burst. */
export function pxBurst(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: {
        colors?: number[];
        count?: number;
        speed?: number;
        size?: number;
        gravity?: number;
        life?: number;
        depth?: number;
        spread?: number; // radians, full circle by default
        angle?: number; // centre direction when spread < 2π
    } = {}
): void {
    const {
        colors = [C.glow, C.gold, C.ember], count = 14, speed = 160, size = 8,
        gravity = 260, life = 520, depth = 3000, spread = Math.PI * 2, angle = -Math.PI / 2,
    } = opts;
    for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.4 + Math.random() * 0.8);
        const s = snap(size * (0.5 + Math.random() * 0.8), 2) || 4;
        const p = scene.add.rectangle(snap(x), snap(y), s, s, colors[i % colors.length]).setDepth(depth);
        const dx = Math.cos(a) * v * (life / 1000);
        const dy = Math.sin(a) * v * (life / 1000) + 0.5 * gravity * (life / 1000) ** 2;
        scene.tweens.add({
            targets: p,
            x: snap(x + dx),
            y: snap(y + dy),
            alpha: { from: 1, to: 0 },
            scale: { from: 1, to: 0.3 },
            duration: life * (0.7 + Math.random() * 0.5),
            ease: 'Cubic.easeOut',
            onComplete: () => p.destroy(),
        });
    }
}

/** Stepped diamond ring that expands and fades — the "shockwave". */
export function pxRing(scene: Phaser.Scene, x: number, y: number, color: number = C.paper, radius = 90, depth = 2999): void {
    const g = scene.add.graphics().setDepth(depth).setPosition(snap(x), snap(y));
    const state = { r: 8, a: 1 };
    const draw = () => {
        g.clear();
        g.lineStyle(PX, color, state.a);
        const r = snap(state.r);
        g.beginPath();
        // octagon-ish stepped ring
        const k = snap(r * 0.42);
        g.moveTo(-k, -r); g.lineTo(k, -r); g.lineTo(r, -k); g.lineTo(r, k);
        g.lineTo(k, r); g.lineTo(-k, r); g.lineTo(-r, k); g.lineTo(-r, -k);
        g.closePath();
        g.strokePath();
    };
    draw();
    scene.tweens.add({
        targets: state, r: radius, a: 0, duration: 380, ease: 'Cubic.easeOut',
        onUpdate: draw, onComplete: () => g.destroy(),
    });
}

/** A diagonal cut of pixel blocks — sword/claw hits. */
export function pxSlash(scene: Phaser.Scene, x: number, y: number, color: number = C.paper, angle = -0.6, len = 170, depth = 3001): void {
    const g = scene.add.graphics().setDepth(depth).setPosition(x, y).setRotation(angle);
    const st = { t: 0, a: 1 };
    const draw = () => {
        g.clear();
        const reach = len * st.t;
        for (let d = -len / 2; d < -len / 2 + reach; d += PX * 2) {
            const w = Math.max(PX, PX * 3 * (1 - Math.abs(d) / (len / 2)));
            g.fillStyle(color, st.a);
            g.fillRect(snap(d), snap(-w / 2), PX * 2, snap(w) || PX);
        }
    };
    scene.tweens.add({
        targets: st, t: 1, duration: 90, ease: 'Quad.easeOut', onUpdate: draw,
        onComplete: () => scene.tweens.add({ targets: st, a: 0, duration: 200, onUpdate: draw, onComplete: () => g.destroy() }),
    });
}

/** Whole-screen quick hit-flash in a palette colour. */
export function pxFlash(scene: Phaser.Scene, color: number = C.paper, alpha = 0.55, ms = 160): void {
    const { width, height } = scene.scale;
    const r = scene.add.rectangle(width / 2, height / 2, width, height, color, alpha).setDepth(3500).setScrollFactor(0);
    scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}

/** Freeze frame: slow all tweens/timers for a beat so hits have weight. */
export function hitStop(scene: Phaser.Scene, ms = 70): void {
    scene.tweens.timeScale = 0.02;
    window.setTimeout(() => {
        if (scene.sys && scene.sys.isActive()) scene.tweens.timeScale = 1;
        else scene.tweens.timeScale = 1;
    }, ms);
}

/** Camera shake in whole-pixel steps (no smooth wobble). */
export function pxShake(scene: Phaser.Scene, mag = 12, ms = 260): void {
    const cam = scene.cameras.main;
    const steps = Math.max(2, Math.floor(ms / 40));
    let i = 0;
    const ev = scene.time.addEvent({
        delay: 40, repeat: steps,
        callback: () => {
            const k = 1 - i / steps;
            cam.setScroll(snap((Math.random() - 0.5) * 2 * mag * k, 2), snap((Math.random() - 0.5) * 2 * mag * k, 2));
            i++;
            if (i > steps) { cam.setScroll(0, 0); ev.remove(); }
        },
    });
}

/** Chunky bouncing number/word that pops, hangs, and rises. */
export function pxPop(
    scene: Phaser.Scene, x: number, y: number, text: string,
    color: number = C.paper, size = 36, depth = 3100, hold = 500
): Phaser.GameObjects.Text {
    const t = scene.add.text(snap(x), snap(y), text, {
        fontFamily: FONT, fontSize: `${size}px`, color: hex(color),
        stroke: hex(C.void), strokeThickness: 6,
    }).setOrigin(0.5).setDepth(depth).setScale(0.2);
    scene.tweens.add({
        targets: t, scale: { from: 0.2, to: 1.35 }, duration: 120, ease: 'Back.easeOut',
        onComplete: () => scene.tweens.add({
            targets: t, scale: 1, duration: 90,
            onComplete: () => scene.tweens.add({
                targets: t, y: t.y - 56, alpha: 0, duration: 420, delay: hold, ease: 'Quad.easeIn',
                onComplete: () => t.destroy(),
            }),
        }),
    });
    return t;
}

/** Card dissolves into ash: colour blocks fly up from its rectangle. */
export function pxDissolve(scene: Phaser.Scene, x: number, y: number, w: number, h: number, colors: number[], depth = 2000): void {
    const cols = Math.max(4, Math.floor(w / 16));
    const rows = Math.max(4, Math.floor(h / 16));
    for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
            if (Math.random() < 0.35) continue;
            const px = x - w / 2 + (cx + 0.5) * (w / cols);
            const py = y - h / 2 + (ry + 0.5) * (h / rows);
            const s = Math.max(6, Math.floor(w / cols));
            const b = scene.add.rectangle(snap(px), snap(py), s, s, colors[(cx + ry) % colors.length]).setDepth(depth);
            scene.tweens.add({
                targets: b,
                x: snap(px + (Math.random() - 0.3) * 60),
                y: snap(py - 40 - Math.random() * 120),
                alpha: 0, scale: 0.2,
                delay: (1 - ry / rows) * 220 + Math.random() * 80,
                duration: 500 + Math.random() * 300,
                ease: 'Quad.easeOut',
                onComplete: () => b.destroy(),
            });
        }
    }
}

/**
 * Scene-entry transition: a grid of ink blocks that pixel-dissolves away diagonally.
 */
export function pxIrisIn(scene: Phaser.Scene, ms = 520): void {
    const { width, height } = scene.scale;
    const size = 60;
    const cols = Math.ceil(width / size);
    const rows = Math.ceil(height / size);
    const g = scene.add.graphics().setDepth(99999).setScrollFactor(0);
    const start = scene.time.now;
    const cells: number[] = [];
    for (let i = 0; i < cols * rows; i++) cells.push(Math.random());
    const draw = () => {
        const p = Math.min(1, (scene.time.now - start) / ms);
        g.clear();
        g.fillStyle(C.void, 1);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const delay = ((c / cols + r / rows) / 2) * 0.6 + cells[r * cols + c] * 0.25;
                if (p < delay + 0.15) g.fillRect(c * size, r * size, size, size);
            }
        }
        if (p >= 1) {
            scene.events.off(Phaser.Scenes.Events.UPDATE, draw);
            g.destroy();
        }
    };
    draw();
    scene.events.on(Phaser.Scenes.Events.UPDATE, draw);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        scene.events.off(Phaser.Scenes.Events.UPDATE, draw);
    });
}
