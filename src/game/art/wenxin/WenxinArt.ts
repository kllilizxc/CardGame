import type { Scene } from 'phaser';
// Phaser.Textures.FilterMode.NEAREST; keep this utility importable by headless data tests.
export const NEAREST = 1;
import { loadWenxinMaterials, type WenxinMaterials, type PixelSurface } from './materials.js';
import { unitArt } from './presentation';
import { paintCardFace, type CardKindKey } from '../cardArt';
import { iconPix, type PixIcon } from '../icons';
import { getUnitStar } from '../../utils/RealmHelper';

let materials: WenxinMaterials | undefined;
let loading: Promise<WenxinMaterials> | undefined;
const frames = new Map<string, HTMLImageElement>();
export function getWenxinMaterials() { return materials; }
export function pixelSurface(w: number, h: number): PixelSurface {
    const o = document.createElement('canvas'); o.width = w; o.height = h;
    const ox = o.getContext('2d', { willReadFrequently: true })!;
    ox.imageSmoothingEnabled = false;
    return { w, h, o, ox };
}
export function addPixelTexture(scene: Scene, key: string, canvas: HTMLCanvasElement) {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas)!.setFilter(NEAREST);
    return key;
}
export async function ensureWenxinArt(scene: Scene) {
    loading ??= Promise.all([
        loadWenxinMaterials(),
        ...['fox', 'eagle', 'disc', 'sage', 'talis', 'sword', 'back'].map(name => new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => { frames.set(name, image); resolve(); };
            image.onerror = () => reject(new Error(`卡框载入失败：${name}`));
            image.src = `/assets/wenxin/frames/${name}.png`;
        })),
    ]).then(([art]) => { materials = art; return art; }).catch(error => { loading = undefined; throw error; });
    const art = await loading;
    for (const kind of ['story', 'gallery', 'sky']) addPixelTexture(scene, `wenxin:${kind}`, art.background(kind, 640, 360));
    addPixelTexture(scene, 'wenxin:bell', art.prop('bell', 96, 88));
    const casket = pixelSurface(144, 144);
    addPixelTexture(scene, 'wenxin:casket', art.casket(casket, .15));
    if (!scene.textures.exists('wenxin:back')) scene.textures.addImage('wenxin:back', frames.get('back')!)!.setFilter(NEAREST);
    return art;
}
export interface VisualCard { id: string; name?: string; kind?: string; description?: string; race?: string; rarity?: string; attack?: number; health?: number; realmId?: string; weaponType?: string }

const KIND_ICON: Record<string, PixIcon> = { artifact: 'sword', talisman: 'talisman', field: 'mountain', pill: 'pill', skill: 'scroll', unit: 'star' };

/**
 * The pixel card face (60x86 art px). Printed art holds immutable labels only; live unit
 * stats are drawn by the sprite on top of the empty badges.
 */
export function wenxinCardTexture(scene: Scene, card: VisualCard): string | undefined {
    if (!card.name) return;
    const key = `pxcard:${card.id}:${card.name}:${card.kind ?? ''}`;
    if (scene.textures.exists(key)) return key;
    const mon = unitArt(card.id);
    const kind = (card.kind ?? (mon ? 'unit' : 'skill')) as CardKindKey;
    let art: HTMLCanvasElement | undefined;
    if (materials && (mon || kind === 'talisman' || (kind === 'artifact' && card.name.includes('剑')))) {
        art = materials.cardArt({ mon, theme: 'sky', key: kind === 'talisman' ? 'talis' : 'sword' });
    }
    let stars = 0;
    if (kind === 'unit') { try { stars = getUnitStar(card as never); } catch { stars = 0; } }
    const face = paintCardFace({ name: card.name, kind, rarity: card.rarity, stars, art, icon: art ? undefined : iconPix(KIND_ICON[kind] ?? 'star') });
    const cv = face.toCanvas();
    return addPixelTexture(scene, key, cv);
}
