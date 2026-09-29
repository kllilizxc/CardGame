import { describe, expect, it, mock } from 'bun:test';
import skillsData from '../../../../public/data/cards/skills.json';
import type { SkillCard } from '../../../../public/data/types/cards/skill';
import type { BattleContext } from '../../context/BattleContext';
import { EffectResolver } from '../../managers/battle/EffectResolver';
import { BattleState } from '../../state/BattleState';
import type { SkillEffectContext } from './SkillEffectHandler';

mock.module('./GameActionHandler', () => ({
    GameActionHandler: class {
        updateContext() {}
    },
}));
const { SkillEffectHandler } = await import('./SkillEffectHandler');

describe('SkillEffectHandler', () => {
    it('executes the existing beast buff only on labelled allies and restores it after combat', () => {
        const state = new BattleState();
        const ordinaryData = { id: 'ordinary', name: '普通弟子', attack: 5, health: 10, labels: ['弟子'] };
        const beastData = { id: 'beast', name: '青云山灵狐', attack: 4, health: 10, labels: ['灵兽'] };
        const ordinary = { getCardData: () => ordinaryData, updateStats: mock(() => {}) } as any;
        const beast = { getCardData: () => beastData, updateStats: mock(() => {}) } as any;
        state.playerField = [ordinary, beast];
        const battleContext = {
            battleState: state,
            battleLog: { addLog: mock(() => {}) },
            effectManager: { showBuffEffect: mock(() => {}), showDebuffEffect: mock(() => {}) },
            battleTickManager: { tick: mock(() => {}) },
        } as unknown as BattleContext;
        battleContext.effectResolver = new EffectResolver(battleContext);
        const handler = new SkillEffectHandler({} as SkillEffectContext, battleContext);
        const skill = skillsData.skills.find(item => item.id === 'SK_002') as unknown as SkillCard;

        handler.applySkillEffect(skill);
        expect(ordinaryData.attack).toBe(5);
        expect(beastData.attack).toBe(6);
        battleContext.effectResolver.clearTurnAttackMods();
        expect(beastData.attack).toBe(4);
    });
});
