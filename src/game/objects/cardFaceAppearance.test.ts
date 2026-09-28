import { expect, test } from 'bun:test';
import { selectedCardFace, setCardFaceTheme, watchCardFace, type CardFaceAppearance } from './cardFaceAppearance';

test('card face preferences preserve variants and ignore stale loads and destroyed subscribers', async () => {
    const savedWindow = globalThis.window, savedImage = globalThis.Image;
    const images: Array<{ src: string; onload: () => void; onerror: () => void }> = [];
    (globalThis as any).window = new EventTarget();
    (globalThis as any).Image = class { src = ''; onload = () => {}; onerror = () => {}; constructor() { images.push(this); } };
    try {
        const cache = new Set<string>();
        const scene = { textures: { exists: (key: string) => cache.has(key), addImage: (key: string) => cache.add(key) } } as any;
        const face: CardFaceAppearance = { schemaVersion: 1, themeId: 'jade', artwork: '/assets/card-faces/U/art.png', fingerprint: 'r1', variants: {
            jade: { texture: '/assets/card-faces/U/jade.png', preview: '/assets/card-faces/U/jade-preview.png', templateVersion: 1 },
            scroll: { texture: '/assets/card-faces/U/scroll.png', preview: '/assets/card-faces/U/scroll-preview.png', templateVersion: 1 },
        } };
        const values: Array<string | undefined> = [];
        const stop = watchCardFace(scene, { id: 'U-test-theme', cardFace: face }, value => values.push(value));
        expect(images.length).toBe(1);
        setCardFaceTheme('U-test-theme', 'scroll');
        expect(selectedCardFace('U-test-theme', face)).toBe('scroll');
        expect(face.themeId).toBe('jade');
        images[0].onload(); await Promise.resolve();
        expect(values).toEqual([]);
        images[1].onload(); await Promise.resolve();
        expect(values.at(-1)).toContain('/scroll.png');
        setCardFaceTheme('U-test-theme', 'original');
        expect(values.at(-1)).toBeUndefined();
        stop();
        const count = values.length;
        setCardFaceTheme('U-test-theme', 'jade'); await Promise.resolve();
        expect(values.length).toBe(count);
        const removed: unknown[] = [];
        const release = watchCardFace({ textures: { exists: () => false, addImage: () => {} } } as any, { id: 'destroyed', cardFace: face }, value => removed.push(value));
        release(); images.at(-1)!.onload(); await Promise.resolve();
        expect(removed).toEqual([]);
    } finally { (globalThis as any).window = savedWindow; (globalThis as any).Image = savedImage; }
});

test('missing or unsafe theme textures fall back to the original face', async () => {
    const saved = globalThis.window;
    (globalThis as any).window = new EventTarget();
    try {
        const scene = { textures: { exists: () => false } } as any;
        const outputs: unknown[] = [];
        const stop = watchCardFace(scene, { id: 'no-face' }, value => outputs.push(value));
        expect(outputs).toEqual([undefined]); stop();
        const bad = watchCardFace(scene, { id: 'unsafe-face', cardFace: { schemaVersion: 1, themeId: 'jade', artwork: '', fingerprint: '', variants: { jade: { texture: 'https://untrusted.invalid/image.png', preview: '', templateVersion: 1 } } } }, value => outputs.push(value));
        await Promise.resolve();
        expect(outputs).toEqual([undefined, undefined]); bad();
    } finally { (globalThis as any).window = saved; }
});
