import type { Scene } from 'phaser';
import type { BattleContext } from '../../context/BattleContext';
import { BattleLog } from '../../ui/battle/BattleLog';
import { BattleAnimationManager } from './BattleAnimationManager';
import { EffectManager } from './EffectManager';
import { StatusManager } from './StatusManager';
import { BattleStatusController } from './BattleStatusController';
import { CombatManager } from './CombatManager';
import { CardManager } from './CardManager';
import { UnitEffectManager } from './UnitEffectManager';
import { TurnManager } from './TurnManager';
import { BattleStateChecker } from './BattleStateChecker';
import { BattleTickManager } from './BattleTickManager';
import { ArtifactManager } from './ArtifactManager';
import { TalismanManager } from './TalismanManager';
import { FieldManager } from './FieldManager';
import { PillManager } from './PillManager';
import { SacrificeManager } from './SacrificeManager';
import { BattleEventManager } from './BattleEventManager';
import type { CardSprite } from '../../objects/CardSprite';
import type { BattleLayoutConfig } from '../../config/LayoutConfig';

/**
 * 管理器工厂配置
 */
export interface ManagerFactoryConfig {
    layout: BattleLayoutConfig;
    cardScale: number;
    gongfaData?: any[];
    statusDefinitionsData?: unknown;
    fieldAccessors: {
        getPlayerField: () => CardSprite[];
        getEnemyField: () => CardSprite[];
        setPlayerField: (field: CardSprite[]) => void;
        setEnemyField: (field: CardSprite[]) => void;
    };
}

/**
 * 管理器工厂
 * 负责创建和初始化所有战斗管理器
 */
export class ManagerFactory {
    /**
     * 创建并初始化所有管理器
     */
    public static async createManagers(
        scene: Scene,
        battleContext: BattleContext,
        config: ManagerFactoryConfig
    ): Promise<{
        unitEffectManager: UnitEffectManager;
        artifactManager: ArtifactManager;
        talismanManager: TalismanManager;
        fieldManager: FieldManager;
        pillManager: PillManager;
        sacrificeManager: SacrificeManager;
        eventManager: BattleEventManager;
    }> {
        // 1. 初始化 BattleLog
        const battleLog = new BattleLog(scene, config.layout.battleLog);
        battleContext.setBattleLog(battleLog);

        // 2. 初始化 BattleAnimationManager
        const animationManager = new BattleAnimationManager(scene);
        battleContext.setAnimationManager(animationManager);

        // 3. 初始化 EffectManager
        const effectManager = new EffectManager(animationManager);
        battleContext.setEffectManager(effectManager);

        // 4. 初始化 StatusManager (异步)
        const statusManager = new StatusManager();
        await statusManager.initialize(config.statusDefinitionsData);
        console.log('StatusManager initialized');
        battleContext.setStatusManager(statusManager);

        // 5. 初始化 BattleStatusController
        const battleStatusController = new BattleStatusController(
            statusManager,
            battleLog,
            animationManager
        );
        battleContext.setBattleStatusController(battleStatusController);

        // 6. 初始化 CombatManager
        const combatManager = new CombatManager(battleContext);
        battleContext.setCombatManager(combatManager);

        // 7. 初始化 CardManager
        const cardManager = new CardManager(scene, battleLog, config.cardScale);
        cardManager.setLayout(config.layout);
        cardManager.setAnimationManager(animationManager);
        battleContext.setCardManager(cardManager);

        // 8. 初始化 UnitEffectManager
        const unitEffectManager = new UnitEffectManager(
            battleContext,
            config.gongfaData || []
        );

        // 9. 初始化 TurnManager
        const turnManager = new TurnManager(scene, battleContext);
        battleContext.setTurnManager(turnManager);

        // 10. 初始化 BattleStateChecker
        const battleStateChecker = new BattleStateChecker(scene, battleContext);
        battleContext.setBattleStateChecker(battleStateChecker);

        // 11. 初始化 BattleTickManager
        const battleTickManager = new BattleTickManager(
            scene,
            battleContext,
            config.fieldAccessors
        );
        battleContext.setBattleTickManager(battleTickManager);

        // 11. 初始化其他管理器
        const artifactManager = new ArtifactManager(scene, battleContext);
        artifactManager.setUnitEffectManager(unitEffectManager);

        const talismanManager = new TalismanManager(battleContext);
        const fieldManager = new FieldManager(scene, battleContext);
        const pillManager = new PillManager(scene, battleContext, 3);
        const sacrificeManager = new SacrificeManager(battleContext);

        const eventManager = new BattleEventManager(
            scene,
            battleContext,
            fieldManager
        );

        return {
            unitEffectManager,
            artifactManager,
            talismanManager,
            fieldManager,
            pillManager,
            sacrificeManager,
            eventManager
        };
    }
}
