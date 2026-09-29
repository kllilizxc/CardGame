import type { SkillCard } from '@data/types/cards/skill';

const playerScopes = new Set(['ownerPlayer', 'none']);
const unitScopes = new Set(['allyUnits', 'allAllies', 'enemyUnits', 'allEnemies', 'singleAlly', 'singleEnemy', 'allUnits']);
const playerActions = new Set(['searchDeck', 'drawCards', 'healPlayer', 'damagePlayer']);
const unitActions = new Set(['modifyAttack', 'modifyHealth', 'dealDamage', 'loseHealth', 'heal', 'applyStatus', 'removeDebuffs', 'destroyUnit']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const labels = (value: unknown): boolean => value === undefined || Array.isArray(value)
    && value.every(label => typeof label === 'string' && label.trim().length > 0);

/** Return a concrete reason when a selected skill cannot execute in the current battle runtime. */
export function skillPlayabilityIssue(raw: unknown): string | null {
    if (!record(raw) || typeof raw.id !== 'string') return '技能定义无效';
    const skill = raw as unknown as SkillCard;
    if (skill.cooldownType !== 'perBattle' && skill.cooldownType !== 'perTurn') return `${skill.id} 的冷却类型尚不可执行`;
    if (skill.cooldownType === 'perTurn' && skill.cooldownValue !== undefined
        && (!Number.isSafeInteger(skill.cooldownValue) || skill.cooldownValue < 1)) return `${skill.id} 的回合使用次数无效`;
    if (!Array.isArray(skill.effects) || skill.effects.length === 0) return `${skill.id} 没有可执行效果`;
    for (const effect of skill.effects) {
        if (!record(effect) || effect.schema !== undefined || effect.timing !== 'reaction'
            || !record(effect.target) || typeof effect.target.scope !== 'string'
            || !labels(effect.target.requiredLabelsAllOf) || !labels(effect.target.requiredLabelsAnyOf)
            || !Array.isArray(effect.actions) || effect.actions.length === 0
            || effect.conditions !== undefined && (!Array.isArray(effect.conditions) || effect.conditions.length > 0)) return `${skill.id} 含有尚不可执行的效果定义`;
        for (const action of effect.actions) {
            if (!record(action) || typeof action.type !== 'string') return `${skill.id} 含有无效动作`;
            const scope = effect.target.scope;
            if (playerActions.has(action.type) ? !playerScopes.has(scope)
                : unitActions.has(action.type) ? !unitScopes.has(scope) : true) {
                return `${skill.id} 的 ${action.type} 动作与目标范围不受支持`;
            }
            if (action.duration !== undefined && (action.type !== 'modifyAttack' || action.duration !== 'turn')) {
                return `${skill.id} 的 ${action.type} 持续时间不受支持`;
            }
            if (action.value !== undefined && (typeof action.value !== 'number' || !Number.isFinite(action.value))) {
                return `${skill.id} 的 ${action.type} 数值无效`;
            }
            if (action.type === 'searchDeck' && action.value !== undefined && action.value !== 1) return `${skill.id} 当前只能检索一张牌`;
            if (action.type === 'drawCards' && action.value !== undefined
                && (!Number.isSafeInteger(action.value) || action.value < 1)) return `${skill.id} 的抽牌数量无效`;
            if (action.type === 'applyStatus' && (typeof action.statusId !== 'string' || !action.statusId.trim())) return `${skill.id} 缺少状态 ID`;
        }
    }
    return null;
}
