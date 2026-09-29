import { wenxinCardTexture } from '../art/wenxin/WenxinArt';
import type { Scene, Textures } from 'phaser';
import { gameStorage, previewStoragePrefix } from '../services/PreviewStorage';

export interface CardFaceAppearance {
    schemaVersion: 1;
    themeId: string;
    artwork: string;
    fingerprint: string;
    variants: Record<string, { texture: string; preview: string; templateVersion: number }>;
}
const EVENT = 'card-face-theme';
const preference = new Map<string, string>();
const pending = new WeakMap<Textures.TextureManager, Map<string, Promise<string>>>();

/** Cosmetic preference only: card definitions, battle values and save slots are untouched. */
export function setCardFaceTheme(cardId: string, themeId: string): void {
    preference.set(`${previewStoragePrefix() ?? ''}${cardId}`, themeId);
    try { gameStorage(localStorage).setItem(`cardgame.face.${cardId}`, themeId); } catch { /* Memory preference still works. */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { cardId } }));
}
export function selectedCardFace(cardId: string, face?: CardFaceAppearance): string {
    let selected = preference.get(`${previewStoragePrefix() ?? ''}${cardId}`);
    try { selected ??= gameStorage(localStorage).getItem(`cardgame.face.${cardId}`) ?? undefined; } catch { /* No storage. */ }
    if (selected === 'original') return selected;
    return selected && face?.variants?.[selected] ? selected : face?.themeId ?? 'original';
}
function texture(scene: Scene, url: string): Promise<string> {
    if (!/^\/assets\/card-faces\/[A-Za-z0-9_.:/-]+\.png$/.test(url) || url.includes('..')) return Promise.reject(Error('Invalid card-face path'));
    const key = `card-face:${url}`;
    if (scene.textures.exists(key)) return Promise.resolve(key);
    let tasks = pending.get(scene.textures);
    if (!tasks) { tasks = new Map(); pending.set(scene.textures, tasks); }
    if (tasks.has(key)) return tasks.get(key)!;
    const manager = scene.textures;
    const job = new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => { if (!manager.exists(key)) manager.addImage(key, image); resolve(key); };
        image.onerror = () => reject(Error(`Card-face image unavailable: ${url}`));
        image.src = url;
    });
    tasks.set(key, job);
    void job.finally(() => tasks!.delete(key)).catch(() => undefined);
    return job;
}
/** Every unit entry (factory, hand, field, deck and hover preview) uses CardSprite. */
export function watchCardFace(scene: Scene, card: { id: string; cardFace?: CardFaceAppearance }, apply: (textureKey?: string) => void): () => void {
    let active = true, revision = 0;
    const update = () => {
        const current = ++revision;
        const selected = selectedCardFace(card.id, card.cardFace);
        const explicit = preference.get(`${previewStoragePrefix() ?? ''}${card.id}`) ?? (() => { try { return gameStorage(localStorage).getItem(`cardgame.face.${card.id}`); } catch { return null; } })();
        const defaultArt = !explicit ? wenxinCardTexture(scene, card) : undefined;
        if (defaultArt) { apply(defaultArt); return; }
        const url = selected === 'original' ? undefined : card.cardFace?.variants[selected]?.texture;
        if (explicit === 'original') { apply(); return; }
        if (!url) { apply(wenxinCardTexture(scene, card)); return; }
        void texture(scene, url).then(key => { if (active && current === revision) apply(key); }, () => { if (active && current === revision) apply(); });
    };
    const listener = (event: Event) => { if ((event as CustomEvent).detail?.cardId === card.id) update(); };
    window.addEventListener(EVENT, listener);
    update();
    return () => { active = false; revision++; window.removeEventListener(EVENT, listener); };
}
