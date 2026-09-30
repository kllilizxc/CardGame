import type { Scene } from 'phaser';
import type { Gongfa } from '@data/types/gongfa';
import { describeGongfa } from '../../utils/GongfaDescriptionBuilder';
import { getRealmConfig, getUnitStar } from '../../utils/RealmHelper';

export interface CardInfo {
    title: string;
    sub: string;
    body: string;
    stats?: { attack: number; health: number };
    gongfa: Array<{ name: string; text: string }>;
}

const KIND_NAME: Record<string, string> = { unit: '灵契', artifact: '法器', talisman: '符箓', field: '场地', pill: '丹药', skill: '功法' };

/** Everything a card has to say, flattened for the pixel inspector panels. */
export function cardInfo(scene: Scene, data: Record<string, unknown>): CardInfo {
    const kind = String(data.kind ?? 'unit');
    const parts: string[] = [KIND_NAME[kind] ?? kind];
    if (kind === 'unit') {
        const realm = getRealmConfig(String(data.realmId ?? ''));
        if (realm) parts.push(`${realm.stage}${realm.phase ?? ''}`);
        if (data.race) parts.push(String(data.race));
        try { const star = getUnitStar(data as never); if (star) parts.push('★'.repeat(star)); } catch { /* optional */ }
    }
    const gongfaList = (scene.cache.json.get('gongfaList') as { gongfa?: Gongfa[] } | undefined)?.gongfa ?? [];
    const gongfa = ((data.gongfaIds as string[] | undefined) ?? []).map((id) => {
        const g = gongfaList.find((x) => x.id === id);
        return g ? { name: g.name ?? id, text: g.description ?? describeGongfa(g.schema) } : { name: id, text: '' };
    });
    return {
        title: String(data.name ?? ''),
        sub: parts.join(' · '),
        body: String(data.description ?? data.effectDescription ?? ''),
        stats: kind === 'unit' ? { attack: Number(data.attack ?? 0), health: Number(data.health ?? 0) } : undefined,
        gongfa,
    };
}
