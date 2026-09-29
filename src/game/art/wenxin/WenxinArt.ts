import type { Scene } from 'phaser';
// Phaser.Textures.FilterMode.NEAREST; keep this utility importable by headless data tests.
export const NEAREST = 1;
import { loadWenxinMaterials, type WenxinMaterials, type PixelSurface } from './materials.js';
import { unitArt } from './presentation';

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
export interface VisualCard { id: string; name?: string; kind?: string; description?: string; race?: string; rarity?: string; attack?: number; health?: number }
/** Printed art contains immutable labels only; live unit stats remain Phaser text. */
export function wenxinCardTexture(scene: Scene, card: VisualCard): string | undefined {
    if (!materials || !card.name) return;
    const key = `wenxin:card:${card.id}:${card.name}:${card.kind ?? ''}`;
    if (scene.textures.exists(key)) return key;
    const mon = unitArt(card.id);
    const kind = card.kind ?? (mon ? 'unit' : 'skill');
    const frame = kind === 'unit' ? (mon === 'sage' ? 'sage' : mon === 'disc' ? 'disc' : 'fox') : kind === 'talisman' ? 'talis' : 'sword';
    const { o, ox: x } = pixelSurface(360, 520);
    x.drawImage(frames.get(frame)!, 0, 0, 360, 520);
    if (mon || kind === 'talisman' || kind === 'artifact' && card.name.includes('剑')) {
        const art = materials.cardArt({ mon, theme: mon === 'fox' ? 'forest' : mon === 'sage' ? 'gold' : 'sky', key: kind === 'talisman' ? 'talis' : 'sword' });
        x.drawImage(art, 22, 85, 316, 282);
    } else {
        x.drawImage(materials.background(kind === 'field' ? 'story' : 'gallery', 112, 100), 22, 85, 316, 282);
        x.fillStyle = '#202e2a'; x.fillRect(139, 180, 82, 88);
        x.strokeStyle = '#c6aa7a'; x.lineWidth = 4; x.strokeRect(143, 184, 74, 80);
        x.font = '48px serif'; x.fillStyle = '#eee4d3'; x.textAlign = 'center';
        x.fillText(kind === 'pill' ? '丹' : kind === 'field' ? '境' : kind === 'artifact' ? '器' : '诀', 180, 241);
    }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#eee4d3';
    x.font = `bold ${card.name.length > 10 ? 19 : 23}px "Noto Serif SC", serif`;
    x.fillText(card.name, 180, 48, 280);
    x.font = '17px sans-serif';
    const labels: Record<string, string> = { unit: card.race ?? '灵契', talisman: '符箓', artifact: '法器', field: '场地', pill: '丹药', skill: '功法' };
    x.fillText(labels[kind] ?? kind, 168, 394, 268);
    // The lower parchment leaves space for the existing interactive gongfa and values.
    if (kind !== 'unit') {
        x.fillStyle = '#303a42'; x.font = '16px sans-serif';
        const chars = [...(card.description ?? '')];
        for (let i = 0; i < Math.min(3, Math.ceil(chars.length / 17)); i++) x.fillText(chars.slice(i * 17, (i + 1) * 17).join(''), 178, 441 + i * 21, 284);
    }
    return addPixelTexture(scene, key, o);
}
