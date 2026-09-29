import Phaser from 'phaser';
import type { UnitCard } from '../../public/data/types/cards/unit';
import { CardSprite } from '../../src/game/objects/CardSprite';
import { setCardFaceTheme } from '../../src/game/objects/cardFaceAppearance';
import type { BaseCardSprite } from '../../src/game/objects/BaseCardSprite';
import { IllustratedUnitCard, type CardFaceDraft } from './IllustratedUnitCard';
import './style.css';

// Read the current adopted data rather than Vite's cached public JSON module.
const units = await fetch('/data/cards/units.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw Error('卡牌数据加载失败'); return response.json(); }) as { units: UnitCard[] };
const SOURCE = units.units.find(card => card.id === 'CR_001')!;
if (!SOURCE) throw new Error('找不到 CR_001 卡牌定义');
const STORAGE_KEY = 'cardgame.card-face-proof.CR_001.v1';
const defaults: CardFaceDraft = {
    name: SOURCE.name, attack: SOURCE.attack, health: SOURCE.health,
    rules: SOURCE.effects?.map(effect => effect.text).filter(Boolean).join('\n') ?? '',
    flavor: '机敏多疑，擅长偷袭与撤退。', zoom: 1, focus: .5,
};
const fields = ['name', 'attack', 'health', 'rules', 'flavor', 'zoom', 'focus'] as const;
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const numeric = new Set(['attack', 'health', 'zoom', 'focus']);
let draft = { ...defaults };
let storageAvailable = true;
try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
        for (const key of fields) {
            if (typeof saved[key] === typeof defaults[key]) Object.assign(draft, { [key]: saved[key] });
        }
    }
} catch { storageAvailable = false; }
const bounded = (value: number, low: number, high: number, fallback: number) => Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
draft.attack = Math.round(bounded(draft.attack, 0, 999, defaults.attack));
draft.health = Math.round(bounded(draft.health, 0, 999, defaults.health));
draft.zoom = bounded(draft.zoom, 1, 1.8, 1);
draft.focus = bounded(draft.focus, 0, 1, .5);

let original = false;
let runtimeTheme = 'original';
let ready = false;
let activeCard: BaseCardSprite | undefined;
let game: Phaser.Game;
const invalidFields = new Set<string>();

function syncFields(): void {
    invalidFields.clear();
    for (const key of fields) byId<HTMLInputElement>(key).value = String(draft[key]);
    byId('zoom-value').textContent = `${draft.zoom.toFixed(2)}×`;
    byId('focus-value').textContent = `${Math.round(draft.focus * 100)}%`;
}

function storeDraft(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); storageAvailable = true; }
    catch { storageAvailable = false; }
    byId('save-state').textContent = storageAvailable ? '草稿已保存在此浏览器' : '草稿仅保留在当前页面，请导出参数';
}

function repaint(): void {
    if (!ready) return;
    const scene = game.scene.getScene('card-proof');
    activeCard?.destroy();
    const data = { ...SOURCE, name: draft.name, attack: draft.attack, health: draft.health };
    activeCard = original
        ? new CardSprite(scene, 270, 390, data, 3)
        : new IllustratedUnitCard(scene, 270, 390, SOURCE, draft, 3);
    activeCard?.disableDragging();
    activeCard?.setDisplayMode('deck');
    const issues = activeCard instanceof IllustratedUnitCard ? [...activeCard.diagnostics] : [];
    if (invalidFields.size) issues.push('攻击和生命需要填写 0–999 的整数');
    if (!draft.name.trim()) issues.push('名称不能为空');
    const checks = byId('checks');
    checks.textContent = issues.length ? issues.join('；') : original ? '当前为游戏原版卡牌组件；可对照名称、境界与数值。' : '插画已加载 · 名称与文案未溢出 · 数值独立绘制';
    checks.classList.toggle('error', issues.length > 0);
    byId<HTMLButtonElement>('export').disabled = issues.length > 0;
    byId<HTMLButtonElement>('export-draft').disabled = false;
    byId('card-stage').setAttribute('aria-label', `${draft.name}，攻击 ${draft.attack}，生命 ${draft.health}，${original ? '游戏原版' : '本次组装'}牌面`);
    storeDraft();
}

class CardProofScene extends Phaser.Scene {
    constructor() { super('card-proof'); }
    preload(): void {
        this.load.image('spirit-fox', new URL('./assets/spirit-fox-v1.png', import.meta.url).href);
        this.load.on('loaderror', () => {
            byId('checks').textContent = '插画加载失败，请检查素材文件后刷新。';
            byId('checks').classList.add('error');
        });
    }
    create(): void {
        if (!this.textures.exists('spirit-fox')) return;
        this.textures.createCanvas('proof-art', 656, 600);
        ready = true;
        repaint();
    }
}

function download(filename: string, url: string): void {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
}

syncFields();
for (const key of fields) byId<HTMLInputElement>(key).addEventListener('input', event => {
    const element = event.target as HTMLInputElement;
    if (numeric.has(key)) {
        if (element.value === '' || !element.validity.valid) {
            invalidFields.add(key);
            repaint();
            return;
        }
        invalidFields.delete(key);
        Object.assign(draft, { [key]: Number(element.value) });
    } else Object.assign(draft, { [key]: element.value });
    byId('zoom-value').textContent = `${draft.zoom.toFixed(2)}×`;
    byId('focus-value').textContent = `${Math.round(draft.focus * 100)}%`;
    repaint();
});

for (const mode of ['assembled', 'original']) byId(mode).addEventListener('click', () => {
    original = mode === 'original';
    runtimeTheme = 'original';
    setCardFaceTheme(SOURCE.id, runtimeTheme);
    byId('assembled').setAttribute('aria-pressed', String(!original));
    byId('original').setAttribute('aria-pressed', String(original));
    repaint();
});

for (const themeId of ['jade', 'scroll']) byId(`face-${themeId}`).addEventListener('click', () => {
    runtimeTheme = themeId;
    original = true;
    setCardFaceTheme(SOURCE.id, themeId);
    byId('assembled').setAttribute('aria-pressed', 'false');
    byId('original').setAttribute('aria-pressed', 'false');
    repaint();
    byId('checks').textContent = `游戏 CardSprite · ${themeId === 'jade' ? '青玉' : '宣纸'}主题 · 攻防由实时数据绘制`;
});
function refreshStats(): void {
    if (activeCard instanceof CardSprite) {
        Object.assign(activeCard.getCardData(), { attack: draft.attack, health: draft.health });
        activeCard.updateStats();
        storeDraft();
    } else repaint();
}

byId('size').addEventListener('click', () => {
    const actual = byId('card-stage').classList.toggle('actual');
    byId('size').textContent = actual ? '查看大图' : '查看实尺寸';
    byId('preview-label').textContent = actual ? '180 × 260 CSS px' : '大图 · 180 × 260 比例';
});
byId('theme').addEventListener('click', () => {
    const light = document.body.classList.toggle('light');
    byId('theme').textContent = light ? '切换深色' : '切换浅色';
});
byId('buff').addEventListener('click', () => { draft.attack = Math.min(999, draft.attack + 1); syncFields(); refreshStats(); });
byId('damage').addEventListener('click', () => { draft.health = Math.max(0, draft.health - 1); syncFields(); refreshStats(); });
byId('reset-stats').addEventListener('click', () => { draft.attack = defaults.attack; draft.health = defaults.health; syncFields(); refreshStats(); });
byId('reset').addEventListener('click', () => { draft = { ...defaults }; syncFields(); repaint(); });
byId('export').addEventListener('click', () => {
    game.events.once(Phaser.Core.Events.POST_RENDER, () => download(`${SOURCE.id}-${original ? 'original' : 'assembled'}.png`, game.canvas.toDataURL('image/png')));
});
byId('export-draft').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, kind: 'card-face-draft', cardId: SOURCE.id, source: 'public/data/cards/units.json', artwork: 'tools/card-prototype/assets/spirit-fox-v1.png', draft, exportedAt: new Date().toISOString(), scope: 'Presentation only; effect text does not update executable gameplay rules.' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(`${SOURCE.id}-card-face-draft.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

await document.fonts.ready;
game = new Phaser.Game({
    type: Phaser.CANVAS, width: 540, height: 780, transparent: true, parent: 'card-stage',
    banner: false, audio: { noAudio: true }, scene: [CardProofScene],
    render: { antialias: true }, fps: { target: 30, forceSetTimeOut: true },
});

window.addEventListener('pagehide', event => { if (!event.persisted) game.destroy(true); });
