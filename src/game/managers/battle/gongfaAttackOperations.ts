import type { ArtifactCard } from '@data/types/cards/artifact';
import type { UnitCard } from '@data/types/cards/unit';
import type { ImmediateAttackAction } from '@data/types/gongfa';
import type { CardSprite } from '../../objects/CardSprite';

export interface GongfaAttackOperationBattleLog {
    addLog(message: string): void;
}

export interface GongfaAttackOperationCombatManager {
    performSingleAttack(
        attacker: CardSprite,
        target: CardSprite | CardSprite[],
        damage: number,
        delay: number,
        isAOE: boolean
    ): void;
}

export interface GongfaImmediateAttackOperationContext {
    triggerUnit?: CardSprite;
    enemyField?: CardSprite[];
    equippedArtifact?: ArtifactCard;
    combatManager?: GongfaAttackOperationCombatManager;
    battleLog: GongfaAttackOperationBattleLog;
}

export function executeGongfaImmediateAttackOperation(
    action: ImmediateAttackAction,
    context: GongfaImmediateAttackOperationContext
): boolean {
    if (!context.triggerUnit) {
        console.warn('立即攻击需要触发单位信息');
        return false;
    }

    if (!context.enemyField || context.enemyField.length === 0) {
        console.warn('没有敌方单位可以攻击');
        return false;
    }

    if (!context.combatManager) {
        console.warn('CombatManager 未提供，无法执行立即攻击');
        return false;
    }

    const attackerData = context.triggerUnit.getCardData() as UnitCard;
    let attackPower = attackerData.attack || 0;
    if (context.equippedArtifact && context.equippedArtifact.attackBonus) {
        attackPower += context.equippedArtifact.attackBonus;
    }
    const damageMultiplier = action.damageMultiplier ?? 1.0;
    const finalDamage = Math.floor(attackPower * damageMultiplier);

    context.battleLog.addLog(`【${attackerData.name}】触发控剑术，立即发动攻击（${finalDamage}点伤害）`);

    if (action.target === 'singleEnemy') {
        const target = context.enemyField.find(enemy => {
            const enemyData = enemy.getCardData();
            return enemyData.health > 0;
        });

        if (target) {
            context.combatManager.performSingleAttack(
                context.triggerUnit,
                target,
                finalDamage,
                0,
                false
            );
        }
    } else if (action.target === 'allEnemies') {
        const aliveEnemies = context.enemyField.filter(enemy => {
            return enemy.getCardData().health > 0;
        });

        if (aliveEnemies.length > 0) {
            context.combatManager.performSingleAttack(
                context.triggerUnit,
                aliveEnemies,
                finalDamage,
                0,
                true
            );
        }
    }

    return true;
}
