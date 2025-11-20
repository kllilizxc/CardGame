import type { Scene } from 'phaser';
import type { BattleLog } from '../ui/BattleLog';
import { FieldSprite } from '../objects/FieldSprite';
import type { FieldCard } from '../../../data/types/cards/field';
import type { CardSprite } from '../objects/CardSprite';

/**
 * 场地卡管理器
 * 负责管理场地卡的放置、替换和效果触发
 */
export class FieldManager {
    private scene: Scene;
    private battleLog: BattleLog;
    private currentField: FieldSprite | null = null;

    constructor(scene: Scene, battleLog: BattleLog) {
        this.scene = scene;
        this.battleLog = battleLog;
    }

    /**
     * 放置场地卡
     * @param fieldCard 场地卡数据
     * @param position 显示位置 {x, y}
     */
    public playField(fieldCard: FieldCard, position: { x: number; y: number }): void {
        // 如果已经有场地，先移除旧场地
        if (this.currentField) {
            const oldFieldName = this.currentField.getCardData().name;
            this.removeCurrentField();
            this.battleLog.addLog(`【${oldFieldName}】被【${fieldCard.name}】替换！`);
        } else {
            this.battleLog.addLog(`【${fieldCard.name}】已生效！`);
        }

        // 创建新的场地精灵
        const cardScale = 0.6; // 场地卡显示较小
        this.currentField = new FieldSprite(
            this.scene,
            position.x,
            position.y,
            fieldCard,
            cardScale
        );

        // 添加到场景
        this.scene.add.existing(this.currentField);
        this.currentField.setDepth(50); // 场地卡在较低层级

        // 场地卡不可拖拽
        this.currentField.disableDragging();

        // 触发场地生效时的永续效果
        this.applyFieldPermanentEffects();

        // 通知场景场地已更改
        this.scene.events.emit('fieldChanged', fieldCard);
    }

    /**
     * 移除当前场地
     */
    public removeCurrentField(): void {
        if (this.currentField) {
            // 移除永续效果（需要在实际效果系统中实现）
            this.removeFieldPermanentEffects();

            // 销毁精灵
            this.currentField.destroy();
            this.currentField = null;

            // 通知场景场地已移除
            this.scene.events.emit('fieldRemoved');
        }
    }

    /**
     * 获取当前场地
     */
    public getCurrentField(): FieldSprite | null {
        return this.currentField;
    }

    /**
     * 获取当前场地数据
     */
    public getCurrentFieldData(): FieldCard | null {
        return this.currentField ? this.currentField.getCardData() : null;
    }

    /**
     * 应用场地的永续效果
     * @private
     */
    private applyFieldPermanentEffects(): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        const permanentEffects = fieldData.effects?.filter(e => e.timing === 'permanent') || [];

        if (permanentEffects.length > 0) {
            console.log(`应用场地【${fieldData.name}】的永续效果`);
            // TODO: 实际应用效果到场上单位
            // 这需要访问 BattleScene 的单位数组
        }
    }

    /**
     * 移除场地的永续效果
     * @private
     */
    private removeFieldPermanentEffects(): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        console.log(`移除场地【${fieldData.name}】的效果`);
        // TODO: 移除效果
    }

    /**
     * 在回合开始时触发场地效果
     * @param isPlayerTurn 是否玩家回合
     * @param playerUnits 玩家单位
     * @param enemyUnits 敌人单位
     */
    public onTurnStart(
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        const turnStartEffects = fieldData.effects?.filter(e => e.timing === 'turnStart') || [];

        turnStartEffects.forEach(effect => {
            this.applyFieldEffect(effect, isPlayerTurn, playerUnits, enemyUnits);
        });
    }

    /**
     * 在回合结束时触发场地效果
     * @param isPlayerTurn 是否玩家回合
     * @param playerUnits 玩家单位
     * @param enemyUnits 敌人单位
     */
    public onTurnEnd(
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        if (!this.currentField) return;

        const fieldData = this.currentField.getCardData();
        const turnEndEffects = fieldData.effects?.filter(e => e.timing === 'turnEnd') || [];

        turnEndEffects.forEach(effect => {
            this.applyFieldEffect(effect, isPlayerTurn, playerUnits, enemyUnits);
        });
    }

    /**
     * 应用场地效果
     * @private
     */
    private applyFieldEffect(
        effect: any,
        isPlayerTurn: boolean,
        playerUnits: CardSprite[],
        enemyUnits: CardSprite[]
    ): void {
        const fieldData = this.currentField!.getCardData();
        const isSymmetric = fieldData.symmetric;
        const scope = effect.target?.scope;

        let targetUnits: CardSprite[] = [];

        // 根据作用范围选择目标
        if (scope === 'allUnits') {
            targetUnits = [...playerUnits, ...enemyUnits];
        } else if (scope === 'allyUnits') {
            targetUnits = isPlayerTurn ? playerUnits : enemyUnits;
        } else if (scope === 'enemyUnits') {
            targetUnits = isPlayerTurn ? enemyUnits : playerUnits;
        }

        // 对称场地效果对双方都生效
        if (isSymmetric && (scope === 'allyUnits' || scope === 'enemyUnits')) {
            targetUnits = [...playerUnits, ...enemyUnits];
        }

        // 应用效果动作
        effect.actions?.forEach((action: any) => {
            targetUnits.forEach(unit => {
                this.applyAction(action, unit);
            });
        });

        // 触发效果应用事件
        if (targetUnits.length > 0) {
            this.scene.events.emit('effectApplied');
        }
    }

    /**
     * 应用单个动作到单位
     * @private
     */
    private applyAction(action: any, unit: CardSprite): void {
        const unitData = unit.getCardData();

        switch (action.type) {
            case 'modifyAttack':
                unitData.attack += action.value || 0;
                unit.updateStats();
                break;
            case 'modifyHealth':
            case 'heal':
                unitData.health += action.value || 0;
                unit.updateStats();
                break;
            case 'dealDamage':
                unitData.health -= action.value || 0;
                if (unitData.health < 0) unitData.health = 0;
                unit.updateStats();
                break;
        }
    }
}
