import { GameActionHandler, type GameActionContext } from './GameActionHandler';
import type { SkillCard } from '@data/types/cards/skill';
import { isLegacyCardEffect, type LegacyCardEffect, type LegacyEffectAction, type LegacyValueEffectAction } from '@data/types/cards/effects';
import type { BattleContext } from '../../context/BattleContext';
import { skillPlayabilityIssue } from '../../content/skillPlayability';

// 重用 GameActionContext 作为技能效果上下文
export type SkillEffectContext = GameActionContext;

/**
 * 技能效果处理器
 * 负责处理各种技能效果的实际逻辑，依赖 GameActionHandler 处理通用动作
 */
export class SkillEffectHandler {
    private gameActionHandler: GameActionHandler;
    private battleContext: BattleContext;

    constructor(context: SkillEffectContext, battleContext: BattleContext) {
        this.gameActionHandler = new GameActionHandler(context);
        this.battleContext = battleContext;
    }

    /**
     * 应用技能效果
     * @param skill 技能卡数据
     * @param onCancel 技能被取消时的回调（用于可取消的技能）
     */
    public applySkillEffect(skill: SkillCard, onCancel?: () => void): void {
        const issue = skillPlayabilityIssue(skill);
        if (issue) throw new Error(issue);

        for (const effect of skill.effects) {
            if (!isLegacyCardEffect(effect) || effect.timing !== 'reaction' || !effect.target?.scope || !effect.actions?.length) {
                throw new Error(`技能 ${skill.id} 含有无法在战斗中执行的效果`);
            }
            for (const action of effect.actions) {
                this.handleAction(skill, effect, action, onCancel);
            }
        }
    }

    /**
     * 处理单个技能动作
     */
    private handleAction(skill: SkillCard, effect: LegacyCardEffect, action: LegacyEffectAction, onCancel?: () => void): void {
        switch (action.type) {
            case 'searchDeck':
                this.handleSearchDeck(action, onCancel);
                break;

            case 'drawCards':
                this.handleDrawCards(action);
                break;

            default:
                if (action.type === 'custom') throw new Error(`技能 ${skill.id} 的自定义动作尚不可执行`);
                this.battleContext.effectResolver.executeEffect(
                    { ...effect, actions: [action], text: undefined },
                    {
                        playerField: this.battleContext.battleState.playerField,
                        enemyField: this.battleContext.battleState.enemyField,
                        sourceName: skill.name,
                    },
                );
        }
    }

    /**
     * 处理从卡组检索卡牌
     */
    private handleSearchDeck(action: LegacyValueEffectAction, onCancel?: () => void): void {
        const count = action.value ?? 1;
        this.gameActionHandler.searchDeck(count, undefined, onCancel);
    }

    /**
     * 处理抽卡效果
     */
    private handleDrawCards(action: LegacyValueEffectAction): void {
        const count = action.value ?? 1;
        this.gameActionHandler.drawCards(count);
    }

    /**
     * 更新上下文（用于运行时更新deck、hand等引用）
     */
    public updateContext(updates: Partial<SkillEffectContext>): void {
        this.gameActionHandler.updateContext(updates);
    }

    /**
     * 获取游戏动作处理器（供外部直接使用通用动作）
     */
    public getGameActionHandler(): GameActionHandler {
        return this.gameActionHandler;
    }
}
