/** Shared, deterministic card-face layout. Artwork never contains rules or numbers. */
export const CARD_FACE_VERSION = 4;
export const CARD_FACE_THEMES = [
  { id: 'jade', name: '青玉', description: '青玉牌框 · 大幅插画', version: 1 },
  { id: 'scroll', name: '宣纸', description: '宣纸卷轴 · 题签与留白', version: 1 },
] as const;
export const CARD_KIND_LABELS: Record<string, string> = { unit: '单位', artifact: '法器', talisman: '符箓', field: '场地', skill: '技能', pill: '丹药' };
export type CardFaceThemeId = typeof CARD_FACE_THEMES[number]['id'];
export interface FacePresentation { themeId: CardFaceThemeId; zoom: number; focus: number }
export const DEFAULT_FACE: FacePresentation = { themeId: 'jade', zoom: 1, focus: .5 };
export function normalizeFace(value: Partial<FacePresentation> = {}): FacePresentation {
  const face = { ...DEFAULT_FACE, ...value };
  if (!CARD_FACE_THEMES.some(theme => theme.id === face.themeId)) throw Error('未知卡面主题');
  if (!Number.isFinite(face.zoom) || face.zoom < 1 || face.zoom > 2 || !Number.isFinite(face.focus) || face.focus < 0 || face.focus > 1) throw Error('裁切范围无效');
  return face;
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
export function cardRules(card: Record<string, any>): string {
  const rules = (card.effects ?? []).map((effect: any) => effect.text).filter(Boolean).join('\n');
  return rules || String(card.description ?? '');
}
function lines(value: string, units: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '', width = 0;
    for (const ch of paragraph) {
      const next = /[\u0000-\u00ff]/.test(ch) ? .6 : 1;
      if (line && width + next > units && !/[，。！？、；：）》」』】]/u.test(ch)) { result.push(line); line = ''; width = 0; }
      line += ch; width += next;
    }
    if (line) result.push(line);
  }
  return result;
}
export function faceDiagnostics(card: Record<string, any>): string[] {
  const errors: string[] = [];
  if (!String(card.name ?? '').trim() || [...String(card.name)].length > 12) errors.push('卡名需要 1–12 个字');
  if (lines(cardRules(card), 19).length > 5) errors.push('效果文案超过五行，请精简后组装');
  return errors;
}
/** art is a bounded PNG data URL supplied by the asset service, never an arbitrary URL. */
export function renderCardFace(card: Record<string, any>, art: string, presentation: FacePresentation, includeStats = true, fontFamily = 'KaiTi, Noto Serif CJK SC, Noto Serif SC, serif'): string {
  const face = normalizeFace(presentation);
  const diagnostics = faceDiagnostics(card);
  if (diagnostics.length) throw Error(diagnostics.join('；'));
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(art)) throw Error('卡图必须是已读取的位图');
  const scroll = face.themeId === 'scroll';
  const shell = scroll ? '#e8dfc8' : '#152c27', ink = scroll ? '#333b34' : '#eee3bd', gold = scroll ? '#796d50' : '#c3a977';
  const x = scroll ? 42 : 24, y = scroll ? 132 : 94, w = scroll ? 456 : 492, h = scroll ? 350 : 416;
  const artW = w * face.zoom, artH = h * face.zoom;
  const name = scroll ? 84 : 61;
  const ruleLines = lines(cardRules(card), 19);
  const text = (x: number, y: number, value: unknown, size: number, color: string, anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${escape(value)}</text>`;
  const rarity: Record<string, string> = { common: '普通', uncommon: '精良', rare: '稀有', epic: '史诗', legendary: '传说' };
  const meta = [card.race ?? CARD_KIND_LABELS[card.kind] ?? card.kind, (card.linggen ?? []).join('·'), rarity[card.rarity] ?? card.rarity].filter(Boolean).join(' · ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="780" viewBox="0 0 540 780">
  <defs><clipPath id="art"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${scroll ? 2 : 3}"/></clipPath></defs>
  <rect x="3" y="3" width="534" height="774" rx="${scroll ? 5 : 20}" fill="${shell}" stroke="${gold}" stroke-width="4"/>
  <rect x="15" y="15" width="510" height="750" rx="${scroll ? 1 : 14}" fill="none" stroke="${gold}" stroke-width="1"/>
  <g font-family="${escape(fontFamily)}">
  ${scroll ? `<path d="M34 112H506M34 122H506" stroke="${gold}"/><rect x="477" y="42" width="20" height="43" fill="#934c3e"/>` : ''}
  ${text(270, name, card.name, 42, ink)}
  <g clip-path="url(#art)"><image href="${art}" x="${x - (artW - w) / 2}" y="${y - (artH - h) * face.focus}" width="${artW}" height="${artH}" preserveAspectRatio="xMidYMid meet"/></g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${gold}"/>
  <rect x="24" y="520" width="492" height="174" fill="${scroll ? '#f3ecd9' : '#eee6ce'}"/>
  ${text(270, scroll ? 512 : 538, meta, 20, scroll ? '#655f4c' : '#465741')}
  ${ruleLines.map((line, index) => text(52, 566 + index * 23, line, 22, '#2f3829', 'start')).join('')}
  <path d="M54 692H486" stroke="${gold}" stroke-width="1"/>
  ${card.kind === 'unit' ? `<rect x="45" y="707" width="132" height="43" rx="7" fill="#553426"/><rect x="363" y="707" width="132" height="43" rx="7" fill="#254936"/>${includeStats ? text(111, 738, `攻 ${card.attack}`, 29, '#f3cd9b') + text(429, 738, `命 ${card.health}`, 29, '#d7e6b4') : ''}` : text(270, 725, CARD_KIND_LABELS[card.kind] ?? card.kind, 23, ink)}
  ${text(270, card.kind === 'unit' ? 735 : 751, card.id, 14, scroll ? '#756e5c' : '#a0b5a2')}
  </g></svg>`;
}
