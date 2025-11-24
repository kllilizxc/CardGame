import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';
import type { ArtifactSprite } from '../objects/ArtifactSprite';
import type { TalismanSprite } from '../objects/TalismanSprite';
import { CardSpriteFactory } from '../factories/CardSpriteFactory';

export class BattleAnimationManager {
    private scene: Scene;
    private pendingAnimations: number = 0; // 追踪进行中的动画数量

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * 包装 tween，在动画完成后自动调用 tick
     */
    private addTweens(config: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
        const originalOnComplete = config.onComplete;
        
        // 动画开始时计数
        this.pendingAnimations++;
        
        config.onComplete = (tween: Phaser.Tweens.Tween, targets: any, ...params: any[]) => {
            // 先调用原始回调
            if (originalOnComplete) {
                (originalOnComplete as any)(tween, targets, ...params);
            }
            
            // 动画完成时减少计数
            this.pendingAnimations--;

            // 如果所有动画都完成了，调用 tick
            if (this.pendingAnimations === 0) {
                const battleScene = this.scene as any;
                if (battleScene.battleTickManager) {
                    battleScene.battleTickManager.tick();
                }
            }
        };
        
        return this.scene.tweens.add(config);
    }

    // 单位攻击单位动画
    public addAttackAnimation(
        attacker: CardSprite,
        target: CardSprite,
        damage: number,
        delay: number,
        onDamage: (target: CardSprite, damage: number) => void
    ): void {
        const originalX = attacker.x;
        const originalY = attacker.y;
        const targetX = target.x;
        const targetY = target.y;

        // 计算攻击方向
        const dirX = targetX - originalX;
        const dirY = targetY - originalY;
        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        const normalizedX = dirX / distance;
        const normalizedY = dirY / distance;

        // 后退距离
        const retreatDist = 30;
        const rushDist = distance * 0.7; // 冲刺到目标70%的距离

        this.scene.time.delayedCall(delay, () => {
            // 获取卡牌基础缩放
            const baseScale = attacker.scale;

            // 第1步：后退蓄力
            this.addTweens({
                targets: attacker,
                x: originalX - normalizedX * retreatDist,
                y: originalY - normalizedY * retreatDist,
                scale: baseScale * 1.15,
                duration: 150,
                ease: 'Back.easeIn',
                onComplete: () => {
                    // 第2步：冲向目标
                    this.addTweens({
                        targets: attacker,
                        x: originalX + normalizedX * rushDist,
                        y: originalY + normalizedY * rushDist,
                        scale: baseScale * 1.2,
                        duration: 200,
                        ease: 'Power2',
                        onComplete: () => {
                            // 造成伤害
                            onDamage(target, damage);
                            
                            // 目标受击动画
                            this.playHitAnimation(target);

                            // 第3步：返回原位
                            this.addTweens({
                                targets: attacker,
                                x: originalX,
                                y: originalY,
                                scale: baseScale,
                                duration: 250,
                                ease: 'Back.easeOut'
                            });
                        }
                    });
                }
            });
        });
    }

    /**
     * 法器附着到单位的动画
     * @param artifact 法器精灵
     * @param targetX 目标相对X坐标
     * @param targetY 目标相对Y坐标
     * @param onComplete 完成回调
     */
    public playArtifactAttachAnimation(
        artifact: ArtifactSprite,
        targetX: number,
        targetY: number,
        onComplete?: () => void
    ): void {
        this.addTweens({
            targets: artifact,
            x: targetX,
            y: targetY,
            scale: 0.3,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                // 动画完成后确保交互性正常
                if (artifact.input) {
                    artifact.input.enabled = true;
                }
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    /**
     * 卡牌移动到目标位置的动画
     * @param card 卡牌精灵
     * @param targetX 目标X坐标
     * @param targetY 目标Y坐标
     * @param onComplete 完成回调
     */
    public playCardMoveAnimation(
        card: CardSprite | ArtifactSprite | TalismanSprite | any,
        targetX: number,
        targetY: number,
        onComplete?: () => void
    ): void {
        this.addTweens({
            targets: card,
            x: targetX,
            y: targetY,
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: () => {
                if (onComplete) {
                    onComplete();
                }
            }
        });
    }

    public playSummonAnimation(card: CardSprite, star: number): void {
        if (!card.active || star < 5) {
            return;
        }

        const scene = this.scene;
        const intensity = star >= 8 ? 2 : 1;
        const is8StarOrAbove = star >= 8;
        const baseScale = (card as any).getCardBaseScale ? (card as any).getCardBaseScale() : card.scale;
        const originalDepth = card.depth ?? 0;
        const originalPos = (card as any).getOriginalPosition ? (card as any).getOriginalPosition() : null;
        const finalX = originalPos ? originalPos.x : card.x;
        const finalY = originalPos ? originalPos.y : card.y;
        const dropHeight = 250 * intensity;

        let glow: Phaser.GameObjects.Graphics | null = null;
        const particles: Phaser.GameObjects.Graphics[] = [];

        const cleanup = () => {
            if (!card.active) {
                return;
            }
            card.setAngle(0);
            card.setPosition(finalX, finalY);
            card.setScale(baseScale);
            card.setAlpha(1);
            card.setDepth(originalDepth);
            if (card.input) {
                (card.input as any).draggable = false;
            }
            if (glow) {
                glow.destroy();
                glow = null;
            }
            particles.splice(0).forEach(p => p.destroy());
        };

        try {
            scene.tweens.killTweensOf(card);

            card.setPosition(finalX, finalY - dropHeight);
            card.setAlpha(0);
            card.setScale(baseScale * 0.8);
            card.setDepth(5000);

            glow = scene.add.graphics();
            glow.fillStyle(star >= 8 ? 0xffd700 : 0x9b59b6, 0.6);
            glow.fillCircle(0, 0, 150 * intensity);
            glow.setPosition(finalX, finalY);
            glow.setAlpha(0);
            glow.setDepth(4998);

            for (let i = 0; i < 20 * intensity; i++) {
                const particle = scene.add.graphics();
                const color = star >= 8 ? 0xffd700 : 0x9b59b6;
                particle.fillStyle(color, 1);
                particle.fillCircle(0, 0, 3);
                particle.setPosition(finalX, finalY);
                particle.setDepth(4999);
                particles.push(particle);
            }

            this.shakeCamera(intensity);

            scene.tweens.add({
                targets: glow,
                alpha: 0.8,
                scale: 1.5,
                duration: 300 * intensity,
                ease: 'Cubic.easeOut'
            });

            particles.forEach((particle, index) => {
                const angle = (Math.PI * 2 * index) / particles.length;
                const distance = 100 * intensity;
                scene.tweens.add({
                    targets: particle,
                    x: finalX + Math.cos(angle) * distance,
                    y: finalY + Math.sin(angle) * distance,
                    alpha: 0,
                    duration: 600 * intensity,
                    ease: 'Cubic.easeOut',
                    onComplete: () => particle.destroy()
                });
            });

            // 重力下落动画 - 符合物理的加速下落
            scene.tweens.add({
                targets: card,
                x: finalX,
                y: finalY,
                alpha: 1,
                scale: baseScale,
                duration: 350 * intensity,
                ease: 'Cubic.easeIn', // 重力加速
                onComplete: () => {
                    // 8星及以上：震动场上其他所有卡片
                    if (is8StarOrAbove) {
                        this.shakeOtherCards(card);
                    }
                    
                    // 拍击瞬间 - 立即开始震动
                    const bounceCount = 4 * intensity; // 震动次数
                    let currentBounce = 0;
                    
                    const wobble = () => {
                        if (currentBounce >= bounceCount) {
                            // 最后恢复到正常状态
                            scene.tweens.add({
                                targets: card,
                                scaleX: baseScale,
                                duration: 150,
                                ease: 'Elastic.easeOut',
                                onComplete: cleanup
                            });
                            return;
                        }
                        
                        // 第一次冲击最强，之后逐渐衰减
                        const dampening = Math.pow(0.6, currentBounce); // 指数衰减，更符合物理
                        // 交替方向 - 左右晃动
                        const direction = currentBounce % 2 === 0 ? 1 : -1;
                        // 旋转幅度 - 第一次最大，之后快速减小
                        const rotationAmount = 0.6 * dampening * direction;
                        
                        scene.tweens.add({
                            targets: card,
                            scaleX: baseScale * (1 - rotationAmount),
                            duration: 80 + currentBounce * 10, // 逐渐变慢（能量损耗）
                            ease: 'Sine.easeInOut',
                            onComplete: () => {
                                currentBounce++;
                                wobble();
                            }
                        });
                    };
                    
                    // 立即开始震动，没有延迟
                    wobble();
                },
                onStop: cleanup
            });
        } catch (error) {
            console.error('Summon animation error', error);
            cleanup();
        }
    }

    // 单位攻击玩家动画
    public addAttackPlayerAnimation(
        attacker: CardSprite,
        damage: number,
        delay: number,
        onDamage: (damage: number) => void
    ): void {
        const originalX = attacker.x;
        const originalY = attacker.y;
        const { width, height } = this.scene.scale;
        
        // 目标位置（屏幕下方中央）
        const targetX = width / 2;
        const targetY = height * 0.95;

        // 计算方向
        const dirX = targetX - originalX;
        const dirY = targetY - originalY;
        const distance = Math.sqrt(dirX * dirX + dirY * dirY);
        const normalizedX = dirX / distance;
        const normalizedY = dirY / distance;

        const retreatDist = 30;
        const rushDist = distance * 0.5;

        this.scene.time.delayedCall(delay, () => {
            const baseScale = attacker.scale;

            // 后退蓄力
            this.scene.tweens.add({
                targets: attacker,
                x: originalX - normalizedX * retreatDist,
                y: originalY - normalizedY * retreatDist,
                scale: baseScale * 1.15,
                duration: 150,
                ease: 'Back.easeIn',
                onComplete: () => {
                    // 冲向玩家
                    this.scene.tweens.add({
                        targets: attacker,
                        x: originalX + normalizedX * rushDist,
                        y: originalY + normalizedY * rushDist,
                        scale: baseScale * 1.2,
                        duration: 200,
                        ease: 'Power2',
                        onComplete: () => {
                            // 造成伤害并播放受击效果
                            onDamage(damage);
                            this.playPlayerHitEffect(damage);

                            // 返回原位
                            this.scene.tweens.add({
                                targets: attacker,
                                x: originalX,
                                y: originalY,
                                scale: baseScale,
                                duration: 250,
                                ease: 'Back.easeOut'
                            });
                        }
                    });
                }
            });
        });
    }

    // 受击动画
    public playHitAnimation(target: CardSprite): void {
        const originalX = target.x;
        
        // 震动效果
        this.scene.tweens.add({
            targets: target,
            x: originalX + 5,
            duration: 50,
            yoyo: true,
            repeat: 2,
            ease: 'Power2',
            onComplete: () => {
                target.x = originalX;
            }
        });
        
        // 红色闪烁效果
        this.scene.tweens.add({
            targets: target,
            alpha: 0.6,
            duration: 100,
            yoyo: true,
            repeat: 1
        });
        
        // 创建红色闪光特效
        const hitFlash = this.scene.add.circle(target.x, target.y, 50, 0xff0000, 0.5);
        hitFlash.setDepth(target.depth + 1);
        this.scene.tweens.add({
            targets: hitFlash,
            alpha: 0,
            scale: 1.5,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                hitFlash.destroy();
            }
        });
    }

    // 治疗动画
    public playHealAnimation(target: CardSprite): void {
        // 绿色闪烁效果
        this.scene.tweens.add({
            targets: target,
            alpha: { from: 1, to: 0.7 },
            duration: 100,
            yoyo: true,
            repeat: 2
        });
        
        // 创建绿色治疗光圈特效
        const healGlow = this.scene.add.circle(target.x, target.y, 40, 0x2ecc71, 0.6);
        healGlow.setDepth(target.depth + 1);
        this.scene.tweens.add({
            targets: healGlow,
            alpha: 0,
            scale: 1.8,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                healGlow.destroy();
            }
        });
        
        // 治疗粒子效果（向上飘散）
        for (let i = 0; i < 3; i++) {
            this.scene.time.delayedCall(i * 100, () => {
                const particle = this.scene.add.circle(
                    target.x + (Math.random() - 0.5) * 60,
                    target.y + 30,
                    3,
                    0x2ecc71,
                    0.8
                );
                particle.setDepth(target.depth + 2);
                this.scene.tweens.add({
                    targets: particle,
                    y: particle.y - 50,
                    alpha: 0,
                    duration: 600,
                    ease: 'Power1',
                    onComplete: () => {
                        particle.destroy();
                    }
                });
            });
        }
    }

    // 死亡动画
    public playDeathAnimation(target: CardSprite): void {
        const baseScale = target.scale;
        this.scene.tweens.add({
            targets: target,
            alpha: 0,
            scale: baseScale * 0.8,
            angle: 15,
            duration: 300,
            ease: 'Power2.easeIn'
        });
    }

    // 玩家受击效果
    public playPlayerHitEffect(damage: number): void {
        const { width, height } = this.scene.scale;

        // 屏幕震动
        this.scene.cameras.main.shake(300, 0.02);

        // 红色闪光效果
        const flash = this.scene.add.rectangle(width / 2, height / 2, width, height, 0xff0000, 0.3);
        flash.setDepth(2400);
        
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 300,
            onComplete: () => flash.destroy()
        });

        // 伤害数字
        const damageText = this.scene.add.text(width / 2, height * 0.5, `-${damage}`, {
            fontSize: Math.floor(height * 0.06) + 'px',
            color: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);
        damageText.setDepth(2401);

        this.scene.tweens.add({
            targets: damageText,
            y: height * 0.4,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => damageText.destroy()
        });
    }

    /**
     * 获取从弃牌堆回到手牌时，卡牌出现的起点位置。
     * 统一在这里封装，避免其他管理器直接依赖 BattleScene 上的 UI 细节。
     */
    public getDiscardPileCardSpawnPosition(): { x: number; y: number } {
        const battleScene = this.scene as any;
        const discardPileButton = battleScene.discardPileButton as Phaser.GameObjects.Rectangle | undefined;

        if (discardPileButton) {
            return { x: discardPileButton.x, y: discardPileButton.y };
        }

        const { width, height } = this.scene.scale;
        return {
            x: width * 0.9,
            y: height * 0.8
        };
    }

    /**
     * 获取卡组位置
     */
    public getDeckPosition(): { x: number; y: number } {
        const battleScene = this.scene as any;
        const deckCountText = battleScene.deckCountText as Phaser.GameObjects.Text | undefined;

        if (deckCountText) {
            return { x: deckCountText.x, y: deckCountText.y };
        }

        const { width, height } = this.scene.scale;
        return {
            x: width * 0.1,
            y: height * 0.8
        };
    }

    /**
     * 播放从卡组到弃牌堆的动画
     * @param cards 移动的卡牌数据
     * @param onComplete 动画完成回调
     */
    public playDeckToDiscardAnimation(cards?: any[], onComplete?: () => void): void {
        if (!cards || cards.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        const deckPos = this.getDeckPosition();
        const discardPos = this.getDiscardPileCardSpawnPosition();
        const animScale = 0.8; // 动画中的卡牌缩放
        
        cards.forEach((cardData, i) => {
            // 使用 CardSpriteFactory 创建真实的卡牌精灵
            const sprite = CardSpriteFactory.createSprite(
                this.scene,
                cardData,
                deckPos.x,
                deckPos.y + 130,
                animScale
            );

            if (!sprite) return;

            // 禁用交互和拖拽
            sprite.disableInteractive();
            sprite.disableDragging();
            
            // 设置为 deck 显示模式
            sprite.setDisplayMode('deck');
            
            // 设置深度
            sprite.setDepth(5000 + i);

            // 延迟启动每张卡的动画
            this.scene.time.delayedCall(i * 100, () => {
                // 添加弧线运动效果
                const midX = (deckPos.x + discardPos.x) / 2;
                const midY = Math.min(deckPos.y, discardPos.y) - 100; // 向上的弧线
                
                // 第一段：向上飞
                this.scene.tweens.add({
                    targets: sprite,
                    x: midX,
                    y: midY,
                    scale: animScale * 1.1,
                    duration: 300,
                    ease: 'Cubic.easeOut',
                    onComplete: () => {
                        // 第二段：落向弃牌堆
                        this.scene.tweens.add({
                            targets: sprite,
                            x: discardPos.x,
                            y: discardPos.y + 130,
                            scale: animScale * 0.8,
                            alpha: 1,
                            duration: 300,
                            ease: 'Cubic.easeIn',
                            onComplete: () => {
                                sprite.destroy();
                                // 最后一张卡完成时调用回调
                                if (i === cards.length - 1 && onComplete) {
                                    onComplete();
                                }
                            }
                        });
                    }
                });
            });
        });
    }

    /**
     * 震动场上其他所有卡片（8星召唤特效）
     */
    private shakeOtherCards(summonedCard: CardSprite): void {
        const battleScene = this.scene as any;
        
        // 获取所有场上卡片（玩家场地和敌方场地）
        const allFieldCards: CardSprite[] = [];
        if (battleScene.playerField) {
            allFieldCards.push(...battleScene.playerField);
        }
        if (battleScene.enemyField) {
            allFieldCards.push(...battleScene.enemyField);
        }
        
        // 震动每张卡片（除了刚召唤的）
        allFieldCards.forEach((card, index) => {
            if (card === summonedCard || !card.active) {
                return;
            }
            
            const originalY = card.y;
            // 随机震动高度：15-30像素
            const shakeHeight = 15 + Math.random() * 15;
            // 稍微错开时间，产生波浪效果
            const delay = index * 20;
            
            this.scene.time.delayedCall(delay, () => {
                // 震起
                this.scene.tweens.add({
                    targets: card,
                    y: originalY - shakeHeight,
                    duration: 150,
                    ease: 'Quad.easeOut',
                    onComplete: () => {
                        // 落回
                        this.scene.tweens.add({
                            targets: card,
                            y: originalY,
                            duration: 200,
                            ease: 'Bounce.easeOut'
                        });
                    }
                });
            });
        });
    }

    private shakeCamera(intensity: number = 1): void {
        this.scene.cameras.main.shake(400 * intensity, 0.01 * intensity, true);
    }

    /**
     * 播放卡牌飞向弃牌堆的动画
     */
    public playCardToDiscardPileAnimation(
        card: CardSprite | ArtifactSprite | TalismanSprite,
        targetX: number,
        targetY: number,
        onComplete?: () => void
    ): void {
        // 使用布局配置的深度
        const battleScene = this.scene as any;
        const depth = battleScene.layout?.depth?.cardToDiscardAnimation ?? 2000;
        card.setDepth(depth);

        // 飞向弃牌堆的动画
        this.scene.tweens.add({
            targets: card,
            x: targetX,
            y: targetY,
            scale: 0.2,
            alpha: 0.7,
            duration: 1000,
            ease: 'Power2',
            onComplete: () => {
                card.destroy();
                if (onComplete) onComplete();
            }
        });
    }
}
