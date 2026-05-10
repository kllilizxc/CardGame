import type { Scene } from 'phaser';
import type { CardSprite } from '../../objects/CardSprite';
import type { ArtifactSprite } from '../../objects/ArtifactSprite';
import type { TalismanSprite } from '../../objects/TalismanSprite';
import { FieldSprite } from '../../objects/FieldSprite';
import type { BattleContext } from '../../context/BattleContext';
import type { FieldManager } from './FieldManager';

/**
 * 战斗事件管理器
 * 集中管理所有战斗相关的事件监听和处理
 */
export class BattleEventManager {
    private scene: Scene;
    private battleContext: BattleContext;
    private fieldManager: FieldManager;

    private playerField: CardSprite[] = [];
    private enemyField: CardSprite[] = [];
    private hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[] = [];
    private fieldZone!: Phaser.GameObjects.Zone;
    private playerFieldZone!: Phaser.GameObjects.Zone;
    private enemyFieldZone!: Phaser.GameObjects.Zone;

    // 符箓相关
    private highlightedTarget: CardSprite | null = null;
    private highlightedTargetSide: 'ally' | 'enemy' | null = null;
    private targetHighlight: Phaser.GameObjects.Graphics | null = null;

    constructor(
        scene: Scene,
        battleContext: BattleContext,
        fieldManager: FieldManager
    ) {
        this.scene = scene;
        this.battleContext = battleContext;
        this.fieldManager = fieldManager;
    }

    /**
     * 设置场地区域引用
     */
    public setFieldZones(
        playerFieldZone: Phaser.GameObjects.Zone,
        enemyFieldZone: Phaser.GameObjects.Zone
    ): void {
        this.playerFieldZone = playerFieldZone;
        this.enemyFieldZone = enemyFieldZone;
    }

    /**
     * 设置场景引用（用于访问动态数据）
     */
    public setReferences(
        playerField: CardSprite[],
        enemyField: CardSprite[],
        hand: (CardSprite | ArtifactSprite | TalismanSprite | FieldSprite)[],
        fieldZone: Phaser.GameObjects.Zone
    ): void {
        this.playerField = playerField;
        this.enemyField = enemyField;
        this.hand = hand;
        this.fieldZone = fieldZone;
    }

    /**
     * 初始化所有事件监听
     */
    public setupAllEvents(): void {
        this.setupTalismanEvents();
        this.setupFieldEvents();
        this.setupCleanupEvents();
    }

    /**
     * 设置符箓使用事件
     */
    private setupTalismanEvents(): void {
        // 符箓拖拽开始
        this.scene.events.on('talismanDragStart', (_talisman: TalismanSprite) => {
            this.highlightedTarget = null;
            this.highlightedTargetSide = null;
            if (this.targetHighlight) {
                this.targetHighlight.destroy();
                this.targetHighlight = null;
            }
        });

        // 符箓拖拽中
        this.scene.events.on('talismanDragging', (
            talisman: TalismanSprite,
            pointer: Phaser.Input.Pointer
        ) => {
            const talismanData = talisman.getCardData();
            const targetScope = talismanData.effects?.[0]?.target?.scope;
            let target: CardSprite | null = null;
            let targetSide: 'ally' | 'enemy' | null = null;
            let highlightAllUnits = false;

            // 判断目标范围
            if (targetScope === 'singleAlly') {
                target = this.getAllyUnitAtPosition(pointer.x, pointer.y);
                targetSide = target ? 'ally' : null;
            } else if (targetScope === 'allyUnits' || targetScope === 'allAllies') {
                // 群体友方目标 - 检测是否在友方场地区域内
                const playerFieldBounds = this.playerFieldZone.getBounds();
                const isInPlayerField = Phaser.Geom.Rectangle.Contains(playerFieldBounds, pointer.x, pointer.y);
                
                if (isInPlayerField && this.playerField.length > 0) {
                    // 在友方区域内且有友方单位，使用第一个单位作为目标标记
                    target = this.playerField[0];
                    targetSide = 'ally';
                    highlightAllUnits = true;
                } else {
                    target = null;
                    targetSide = null;
                }
            } else if (targetScope === 'enemyUnits' || targetScope === 'allEnemies') {
                // 群体敌方目标 - 检测是否在敌方场地区域内
                const enemyFieldBounds = this.enemyFieldZone.getBounds();
                const isInEnemyField = Phaser.Geom.Rectangle.Contains(enemyFieldBounds, pointer.x, pointer.y);
                
                if (isInEnemyField && this.enemyField.length > 0) {
                    // 在敌方区域内且有敌方单位，使用第一个单位作为目标标记
                    target = this.enemyField[0];
                    targetSide = 'enemy';
                    highlightAllUnits = true;
                } else {
                    target = null;
                    targetSide = null;
                }
            } else {
                // 默认按照敌方单位处理
                target = this.getEnemyUnitAtPosition(pointer.x, pointer.y);
                targetSide = target ? 'enemy' : null;
            }
            
            if (target !== this.highlightedTarget) {
                if (this.targetHighlight) {
                    this.targetHighlight.destroy();
                    this.targetHighlight = null;
                }
                
                this.highlightedTarget = target;
                this.highlightedTargetSide = targetSide;
                
                if (target) {
                    this.targetHighlight = this.scene.add.graphics();
                    const color = targetSide === 'ally' ? 0x3498db : 0x00ff00;
                    this.targetHighlight.lineStyle(4, color, 1);
                    this.targetHighlight.setDepth(999);

                    // 如果是群体目标，高亮所有相应单位
                    if (highlightAllUnits) {
                        const unitsToHighlight = targetSide === 'ally' ? this.playerField : this.enemyField;
                        unitsToHighlight.forEach(unit => {
                            const bounds = unit.getBounds();
                            this.targetHighlight!.strokeRoundedRect(
                                bounds.x,
                                bounds.y,
                                bounds.width,
                                bounds.height,
                                8
                            );
                        });
                    } else {
                        // 单体目标，只高亮当前单位
                        const bounds = target.getBounds();
                        this.targetHighlight.strokeRoundedRect(
                            bounds.x,
                            bounds.y,
                            bounds.width,
                            bounds.height,
                            8
                        );
                    }
                }
            }
        });

        // 符箓拖拽结束
        this.scene.events.on('talismanDragEnd', (_talisman: TalismanSprite) => {
            if (this.targetHighlight) {
                this.targetHighlight.destroy();
                this.targetHighlight = null;
            }
        });

        // 尝试使用符箓
        this.scene.events.on('tryUseTalisman', (talisman: TalismanSprite) => {
            if (this.highlightedTarget && this.highlightedTargetSide) {
                this.scene.events.emit('useTalisman', talisman, this.highlightedTarget, this.highlightedTargetSide);
            } else {
                talisman.returnToOriginalPosition();
            }
            this.highlightedTarget = null;
            this.highlightedTargetSide = null;
        });
    }

    /**
     * 设置场地卡使用事件
     */
    private setupFieldEvents(): void {
        this.scene.events.on('cardDragEnd', (
            card: CardSprite | ArtifactSprite | TalismanSprite | FieldSprite
        ) => {
            if (!(card instanceof FieldSprite)) {
                return;
            }

            const pointer = this.scene.input.activePointer;
            const fieldData = card.getCardData();
            const bounds = this.fieldZone.getBounds();

            if (Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
                const index = this.hand.indexOf(card);
                if (index > -1) {
                    this.hand.splice(index, 1);
                }

                const fieldPosition = {
                    x: this.fieldZone.x,
                    y: this.fieldZone.y
                };

                this.fieldManager.playField(fieldData, fieldPosition);
                this.battleContext.cardManager.arrangeHand(this.hand);

                this.scene.time.delayedCall(300, () => {
                    if (card.active) {
                        card.destroy();
                    }
                });
            } else {
                card.returnToOriginalPosition();
            }
        });
    }

    /**
     * 设置清理事件
     */
    private setupCleanupEvents(): void {
        this.scene.events.once('shutdown', () => {
            this.scene.events.removeAllListeners('talismanDragStart');
            this.scene.events.removeAllListeners('talismanDragging');
            this.scene.events.removeAllListeners('talismanDragEnd');
            this.scene.events.removeAllListeners('tryUseTalisman');
            this.scene.events.removeAllListeners('cardDragEnd');
            this.scene.events.removeAllListeners('showCardPreview');
            this.scene.events.removeAllListeners('hideCardPreview');
        });
    }

    /**
     * 获取指定位置的敌方单位
     */
    private getEnemyUnitAtPosition(x: number, y: number): CardSprite | null {
        return this.getUnitAtPosition(this.enemyField, x, y);
    }

    private getAllyUnitAtPosition(x: number, y: number): CardSprite | null {
        return this.getUnitAtPosition(this.playerField, x, y);
    }

    private getUnitAtPosition(units: CardSprite[], x: number, y: number): CardSprite | null {
        const expandRadius = 50;
        
        for (const unit of units) {
            const bounds = unit.getBounds();
            const expandedBounds = Phaser.Geom.Rectangle.Clone(bounds);
            Phaser.Geom.Rectangle.Inflate(expandedBounds, expandRadius, expandRadius);
            
            if (Phaser.Geom.Rectangle.Contains(expandedBounds, x, y)) {
                return unit;
            }
        }
        return null;
    }
}
