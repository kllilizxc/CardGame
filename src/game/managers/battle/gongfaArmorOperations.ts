import type { GainArmorAction } from '@data/types/gongfa';
import type { CardSprite } from '../../objects/CardSprite';

export interface GongfaArmorOperationBattleLog {
    addLog(message: string): void;
}

export interface GongfaArmorOperationStatusController {
    applyStatusToUnit(unitId: string, statusId: string, value: number, target: CardSprite): void;
}

export interface GongfaArmorOperationContext {
    triggerUnit?: CardSprite;
    battleStatusController?: GongfaArmorOperationStatusController;
    battleLog: GongfaArmorOperationBattleLog;
    evaluateExpression(expression: string): number;
}

export function executeGongfaArmorOperation(
    action: GainArmorAction,
    context: GongfaArmorOperationContext
): boolean {
    if (!context.triggerUnit) {
        console.warn('获得护甲需要触发单位信息');
        return false;
    }

    const armorValue = getArmorValue(action, context);
    if (armorValue <= 0) {
        console.warn(`护甲值无效: ${armorValue}`);
        return false;
    }

    let target: CardSprite | null = null;
    if (action.target === 'self') {
        target = context.triggerUnit;
    }

    if (!target) {
        console.warn('未找到护甲目标');
        return false;
    }

    const targetData = target.getCardData();
    context.battleLog.addLog(`【${targetData.name}】获得 ${armorValue} 点护甲`);

    if (context.battleStatusController) {
        context.battleStatusController.applyStatusToUnit(
            targetData.id,
            'armor',
            armorValue,
            target
        );
    } else {
        console.warn('battleStatusController 未提供，无法应用护甲状态');
    }

    return true;
}

function getArmorValue(action: GainArmorAction, context: GongfaArmorOperationContext): number {
    if (typeof action.value === 'number') {
        return action.value;
    }

    if (typeof action.value === 'string') {
        return context.evaluateExpression(action.value);
    }

    return 0;
}
