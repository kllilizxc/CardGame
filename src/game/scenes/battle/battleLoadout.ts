/** The battle catalog owns definitions; this file only chooses the starting slots. */
export function resolveBattleLoadout<Pill extends { id: string }, Skill extends { id: string }>(
    raw: unknown,
    pills: Pill[],
    skills: Skill[],
): { pills: Pill[]; skills: Skill[] } {
    // Older catalogs have no loadout resource. Preserve their previous opening.
    if (raw === undefined) return { pills: pills.slice(0, 2), skills: skills.slice(0, 1) };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('战斗初始配置必须是对象');
    const config = raw as Record<string, unknown>;
    if (config.schemaVersion !== 1) throw Error('战斗初始配置版本无效');
    const choose = <T extends { id: string }>(field: 'pillIds' | 'skillIds', catalog: T[]): T[] => {
        const ids = config[field];
        if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
            throw Error(`战斗初始配置 ${field} 需要至多三个不重复的卡牌 ID`);
        }
        const byId = new Map(catalog.map(card => [card.id, card]));
        return ids.map(id => {
            const card = byId.get(id);
            if (!card) throw Error(`战斗初始配置 ${field} 引用了不存在的卡牌：${id}`);
            return card;
        });
    };
    return { pills: choose('pillIds', pills), skills: choose('skillIds', skills) };
}
