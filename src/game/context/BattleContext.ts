import type { Scene } from 'phaser';
import type { BattleLog } from '../ui/battle/BattleLog';
import type { BattleAnimationManager } from '../managers/battle/BattleAnimationManager';
import type { CombatManager } from '../managers/battle/CombatManager';
import type { CardManager } from '../managers/battle/CardManager';
import type { StatusManager } from '../managers/battle/StatusManager';
import type { BattleStatusController } from '../managers/battle/BattleStatusController';
import type { BattleTickManager } from '../managers/battle/BattleTickManager';
import type { BattleStateChecker } from '../managers/battle/BattleStateChecker';
import type { TurnManager } from '../managers/battle/TurnManager';
import type { EffectManager } from '../managers/battle/EffectManager';

/**
 * 战斗上下文 - 集中管理所有通用的管理器引用
 * 避免在各个类之间重复传递相同的依赖
 */
export class BattleContext {
    // 核心引用
    public readonly scene: Scene;
    
    // UI 管理器
    public battleLog!: BattleLog;
    
    // 动画和战斗管理器
    public animationManager!: BattleAnimationManager;
    public effectManager!: EffectManager;
    public combatManager!: CombatManager;
    public cardManager!: CardManager;
    
    // 状态管理器
    public statusManager!: StatusManager;
    public battleStatusController!: BattleStatusController;
    
    // 战斗流程管理器
    public battleTickManager!: BattleTickManager;
    public battleStateChecker!: BattleStateChecker;
    public turnManager!: TurnManager;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * 设置 BattleLog
     */
    public setBattleLog(battleLog: BattleLog): void {
        this.battleLog = battleLog;
    }

    /**
     * 设置动画管理器
     */
    public setAnimationManager(animationManager: BattleAnimationManager): void {
        this.animationManager = animationManager;
    }

    /**
     * 设置特效管理器
     */
    public setEffectManager(effectManager: EffectManager): void {
        this.effectManager = effectManager;
    }

    /**
     * 设置战斗管理器
     */
    public setCombatManager(combatManager: CombatManager): void {
        this.combatManager = combatManager;
    }

    /**
     * 设置卡牌管理器
     */
    public setCardManager(cardManager: CardManager): void {
        this.cardManager = cardManager;
    }

    /**
     * 设置状态管理器
     */
    public setStatusManager(statusManager: StatusManager): void {
        this.statusManager = statusManager;
    }

    /**
     * 设置战斗状态控制器
     */
    public setBattleStatusController(battleStatusController: BattleStatusController): void {
        this.battleStatusController = battleStatusController;
    }

    /**
     * 设置 Tick 管理器
     */
    public setBattleTickManager(battleTickManager: BattleTickManager): void {
        this.battleTickManager = battleTickManager;
    }

    /**
     * 设置战斗状态检查器
     */
    public setBattleStateChecker(battleStateChecker: BattleStateChecker): void {
        this.battleStateChecker = battleStateChecker;
    }

    /**
     * 设置回合管理器
     */
    public setTurnManager(turnManager: TurnManager): void {
        this.turnManager = turnManager;
    }

    /**
     * 检查所有核心管理器是否已初始化
     */
    public isInitialized(): boolean {
        return !!(
            this.battleLog &&
            this.animationManager &&
            this.effectManager &&
            this.combatManager &&
            this.cardManager &&
            this.statusManager &&
            this.battleStatusController &&
            this.battleTickManager &&
            this.battleStateChecker &&
            this.turnManager
        );
    }
}
