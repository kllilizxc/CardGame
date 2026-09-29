import { Scene } from 'phaser';
import { C } from '../../art/palette';
import { hitStop, pxBurst, pxDissolve, pxFlash, pxPop, pxRing, pxShake, pxSlash } from '../../art/fx';
import { CardSprite } from '../../objects/CardSprite';
import type { ArtifactSprite } from '../../objects/ArtifactSprite';
import type { TalismanSprite } from '../../objects/TalismanSprite';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';

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
            // 获取卡牌基础缩放（使用原始缩放，而不是当前 scale）
            const baseScale = attacker.getCardBaseScale();

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
            // 获取卡牌基础缩放（使用原始缩放，而不是当前 scale）
            const baseScale = attacker.getCardBaseScale();

            // 后退蓄力
            this.addTweens({
                targets: attacker,
                x: originalX - normalizedX * retreatDist,
                y: originalY - normalizedY * retreatDist,
                scale: baseScale * 1.15,
                duration: 150,
                ease: 'Back.easeIn',
                onComplete: () => {
                    // 冲向玩家
                    this.addTweens({
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

    // 受击动画
    public playHitAnimation(target: CardSprite): void {
        const originalX = target.x;
        const scale = target.scale || 1;

        // 像素式震动：整像素左右抖动
        this.addTweens({
            targets: target,
            x: originalX + 8,
            duration: 40,
            yoyo: true,
            repeat: 3,
            ease: 'Stepped',
            easeParams: [1],
            onComplete: () => {
                target.x = originalX;
            }
        });

        // 白闪：整张卡牌罩一层纸白
        const flash = this.scene.add.rectangle(target.x, target.y, 180 * scale, 260 * scale, C.paper, 0.85);
        flash.setDepth(target.depth + 1);
        this.scene.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Stepped', easeParams: [3], onComplete: () => flash.destroy() });

        // 斩击线 + 血色像素飞溅 + 冲击环
        pxSlash(this.scene, target.x, target.y, C.paper, -0.6, 200 * scale + 60);
        pxBurst(this.scene, target.x, target.y, { colors: [C.cinnabar, C.crimson, C.ember, C.paper], count: 16, speed: 240, size: 10 });
        pxRing(this.scene, target.x, target.y, C.cinnabar, 110 * scale + 20);
        pxShake(this.scene, 5, 160);
        hitStop(this.scene, 70);
    }

    // 治疗动画
    public playHealAnimation(target: CardSprite): void {
        const scale = target.scale || 1;
        pxRing(this.scene, target.x, target.y + 20, C.lime, 100 * scale + 20);
        for (let i = 0; i < 3; i++) {
            this.scene.time.delayedCall(i * 110, () => {
                pxBurst(this.scene, target.x + (Math.random() - 0.5) * 100 * scale, target.y + 40 * scale, {
                    colors: [C.lime, C.jade, C.glow], count: 6, speed: 90, size: 8, gravity: -160, life: 700, spread: 0.6, angle: -Math.PI / 2,
                    depth: target.depth + 2,
                });
            });
        }
        // 绿色十字闪烁
        const cross = this.scene.add.graphics().setDepth(target.depth + 2).setPosition(target.x, target.y);
        cross.fillStyle(C.lime, 1);
        cross.fillRect(-8, -28, 16, 56); cross.fillRect(-28, -8, 56, 16);
        this.scene.tweens.add({ targets: cross, alpha: 0, y: target.y - 60, duration: 600, ease: 'Stepped', easeParams: [6], onComplete: () => cross.destroy() });
    }

    // 死亡动画
    public playDeathAnimation(target: CardSprite): void {
        const baseScale = target.scale;
        const scale = baseScale || 1;
        pxDissolve(this.scene, target.x, target.y, 180 * scale, 260 * scale, [C.paper, C.mist, C.dusk, C.cinnabar, C.void], target.depth + 1);
        pxFlash(this.scene, C.paper, 0.2, 120);
        this.addTweens({
            targets: target,
            alpha: 0,
            scale: baseScale * 0.9,
            duration: 320,
            ease: 'Stepped',
            easeParams: [5]
        });
    }

    // 玩家受击效果
    public playPlayerHitEffect(damage: number): void {
        const { width, height } = this.scene.scale;

        pxShake(this.scene, 16, 320);
        pxFlash(this.scene, C.cinnabar, 0.45, 260);
        hitStop(this.scene, 90);

        // 屏幕边缘血色像素框
        const vignette = this.scene.add.graphics().setDepth(2400).setScrollFactor(0);
        vignette.fillStyle(C.crimson, 0.9);
        const t = 24;
        for (let x = 0; x < width; x += 32) {
            vignette.fillRect(x, 0, 16, t); vignette.fillRect(x + 16, height - t, 16, t);
        }
        for (let y = 0; y < height; y += 32) {
            vignette.fillRect(0, y, t, 16); vignette.fillRect(width - t, y + 16, t, 16);
        }
        this.scene.tweens.add({ targets: vignette, alpha: 0, duration: 700, onComplete: () => vignette.destroy() });

        // 伤害数字
        pxPop(this.scene, width / 2, height * 0.5, `-${damage}`, C.cinnabar, 96, 2401, 350);
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
        pxShake(this.scene, 12 * intensity, 400 * intensity);
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

    /**
     * 播放丹药使用特效
     */
    public playPillUseEffect(
        target: CardSprite | 'player' | undefined,
        onComplete?: () => void
    ): void {
        const { width, height } = this.scene.scale;
        
        // 确定特效位置
        let effectX: number;
        let effectY: number;
        
        if (target && target !== 'player' && target instanceof CardSprite) {
            effectX = target.x;
            effectY = target.y;
        } else {
            effectX = width / 2;
            effectY = height * 0.85;
        }

        // 添加光效
        const light = this.scene.add.circle(effectX, effectY, 0, 0x2ecc71, 0.7);
        light.setDepth(999);
        
        this.addTweens({
            targets: light,
            radius: 80,
            alpha: 0,
            duration: 500,
            ease: 'Power2',
            onComplete: () => {
                light.destroy();
            }
        });
        
        // 粒子效果
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const particle = this.scene.add.circle(effectX, effectY, 4, 0x2ecc71, 0.8);
            particle.setDepth(1000);
            
            this.addTweens({
                targets: particle,
                x: effectX + Math.cos(angle) * 60,
                y: effectY + Math.sin(angle) * 60,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
        
        // 延迟后执行回调
        if (onComplete) {
            this.scene.time.delayedCall(300, onComplete);
        }
    }

    /**
     * 显示治疗特效
     */
    public showHealEffect(
        x?: number,
        y?: number,
        color: number = 0x2ecc71
    ): void {
        const { width, height } = this.scene.scale;
        const centerX = x ?? width / 2;
        const centerY = y ?? height * 0.85;

        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const particle = this.scene.add.circle(centerX, centerY, 5, color, 0.8);
            particle.setDepth(1000);

            this.addTweens({
                targets: particle,
                x: centerX + Math.cos(angle) * 50,
                y: centerY + Math.sin(angle) * 50 - 30,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }

    /**
     * 显示伤害特效
     */
    public showDamageEffect(target: CardSprite, color: number = C.cinnabar): void {
        this.addTweens({
            targets: target,
            alpha: 0.4,
            duration: 100,
            yoyo: true,
            repeat: 2,
            ease: 'Stepped',
            easeParams: [1]
        });
        pxBurst(this.scene, target.x, target.y, { colors: [color, C.paper, C.ember], count: 10, speed: 180, size: 8 });
    }

    /**
     * 显示增益特效
     */
    public showBuffEffect(target: CardSprite, color: number = C.gold): void {
        pxRing(this.scene, target.x, target.y, color, 90);
        for (let i = 0; i < 5; i++) {
            this.scene.time.delayedCall(i * 80, () => {
                pxBurst(this.scene, target.x + (Math.random() - 0.5) * 100, target.y + 50, {
                    colors: [color, C.glow, C.paper], count: 3, speed: 70, size: 6, gravity: -180, life: 800, spread: 0.4,
                });
            });
        }
    }

    /**
     * 显示减益特效
     */
    public showDebuffEffect(target: CardSprite, color: number = C.orchid): void {
        for (let i = 0; i < 5; i++) {
            this.scene.time.delayedCall(i * 80, () => {
                pxBurst(this.scene, target.x + (Math.random() - 0.5) * 100, target.y - 50, {
                    colors: [color, C.violet, C.void], count: 3, speed: 60, size: 6, gravity: 220, life: 800, spread: 0.4, angle: Math.PI / 2,
                });
            });
        }
    }

    /**
     * 显示爆炸特效
     */
    public showExplosionEffect(
        x: number,
        y: number,
        color: number = C.ember,
        radius: number = 60
    ): void {
        pxFlash(this.scene, C.paper, 0.35, 120);
        pxRing(this.scene, x, y, C.paper, radius * 1.4);
        this.scene.time.delayedCall(60, () => pxRing(this.scene, x, y, color, radius * 1.9));
        pxBurst(this.scene, x, y, { colors: [C.glow, color, C.gold, C.cinnabar], count: 22, speed: radius * 4, size: 12 });
        pxShake(this.scene, 8, 200);
        hitStop(this.scene, 50);
    }

    /**
     * 显示文字飘动效果
     */
    public showFloatingText(
        x: number,
        y: number,
        text: string,
        color: string = '#ffffff',
        fontSize: number = 24
    ): void {
        const parsed = parseInt(color.replace('#', ''), 16);
        pxPop(this.scene, x, y, text, Number.isFinite(parsed) ? parsed : C.paper, Math.max(24, fontSize * 1.2), 1002, 400);
    }

    /**
     * 播放献祭动画
     */
    public playSacrificeAnimation(
        sacrificeTargets: CardSprite[],
        onComplete: () => void
    ): void {
        const { width, height } = this.scene.scale;
        const centerX = width / 2;
        const centerY = height / 2;

        let completedCount = 0;
        const totalCount = sacrificeTargets.length;

        sacrificeTargets.forEach((unit, index) => {
            // 单位飞向中心并消失
            this.addTweens({
                targets: unit,
                x: centerX,
                y: centerY,
                scale: unit.scale * 0.3,
                alpha: 0,
                duration: 600,
                delay: index * 100,
                ease: 'Power2',
                onComplete: () => {
                    completedCount++;
                    if (completedCount === totalCount && onComplete) {
                        onComplete();
                    }
                }
            });
        });

        // 添加献祭光效
        this.showSacrificeEffect(centerX, centerY, totalCount);
    }

    /**
     * 显示献祭特效
     */
    public showSacrificeEffect(x: number, y: number, count: number): void {
        // 紫色献祭光环
        const circle = this.scene.add.circle(x, y, 0, 0x9b59b6, 0.6);
        circle.setDepth(999);

        this.addTweens({
            targets: circle,
            radius: 150,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => {
                circle.destroy();
            }
        });

        // 粒子效果
        for (let i = 0; i < count * 8; i++) {
            const angle = (Math.PI * 2 * i) / (count * 8);
            const particle = this.scene.add.circle(x, y, 3, 0x9b59b6, 0.8);
            particle.setDepth(1000);

            this.addTweens({
                targets: particle,
                x: x + Math.cos(angle) * 120,
                y: y + Math.sin(angle) * 120,
                alpha: 0,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    particle.destroy();
                }
            });
        }
    }

    /**
     * 播放符箓使用动画
     */
    public playTalismanUseAnimation(
        talisman: any,
        target: CardSprite,
        onComplete: () => void
    ): void {
        // 符箓飞向目标
        this.addTweens({
            targets: talisman,
            x: target.x,
            y: target.y,
            scale: 0.5,
            alpha: 0.8,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                // 创建爆炸效果
                const explosion = this.scene.add.circle(target.x, target.y, 30, 0xff6b6b, 0.8);
                explosion.setDepth(1500);

                this.addTweens({
                    targets: explosion,
                    scale: 2,
                    alpha: 0,
                    duration: 300,
                    ease: 'Power2',
                    onComplete: () => {
                        explosion.destroy();
                        if (onComplete) onComplete();
                    }
                });
            }
        });
    }

    /**
     * 显示回合切换动画
     */
    public showTurnAnimation(text: string, color: number, onComplete: () => void): void {
        const { width, height } = this.scene.scale;

        // 上下黑色像素条 + 中央横幅从两侧滑入
        const barH = height * 0.16;
        const top = this.scene.add.rectangle(width / 2, -barH / 2, width, barH, C.void).setDepth(2500);
        const bottom = this.scene.add.rectangle(width / 2, height + barH / 2, width, barH, C.void).setDepth(2500);
        const band = this.scene.add.rectangle(-width / 2, height / 2, width, 140, C.ink).setDepth(2500);
        const bandEdge1 = this.scene.add.rectangle(-width / 2, height / 2 - 72, width, 8, color).setDepth(2501);
        const bandEdge2 = this.scene.add.rectangle(-width / 2, height / 2 + 72, width, 8, color).setDepth(2501);
        const turnText = this.scene.add.text(width + 400, height / 2, text, {
            fontSize: '96px',
            color: '#' + color.toString(16).padStart(6, '0'),
            stroke: '#0b0714',
            strokeThickness: 12
        }).setOrigin(0.5).setDepth(2502);

        const slide = (targets: Phaser.GameObjects.GameObject[], x: number, duration: number, ease = 'Cubic.easeOut') =>
            this.addTweens({ targets, x, duration, ease });

        this.addTweens({ targets: top, y: barH / 2, duration: 220, ease: 'Stepped', easeParams: [4] });
        this.addTweens({ targets: bottom, y: height - barH / 2, duration: 220, ease: 'Stepped', easeParams: [4] });
        slide([band, bandEdge1, bandEdge2], width / 2, 260);
        this.addTweens({
            targets: turnText,
            x: width / 2,
            duration: 380,
            ease: 'Back.easeOut',
            onComplete: () => {
                pxBurst(this.scene, width / 2, height / 2, { colors: [color, C.glow, C.paper], count: 18, speed: 300, size: 10, depth: 2503 });
                this.scene.time.delayedCall(560, () => {
                    slide([band, bandEdge1, bandEdge2], width * 1.5, 260, 'Cubic.easeIn');
                    this.addTweens({ targets: turnText, x: -600, duration: 280, ease: 'Cubic.easeIn' });
                    this.addTweens({ targets: top, y: -barH, duration: 240, delay: 120 });
                    this.addTweens({
                        targets: bottom, y: height + barH, duration: 240, delay: 120,
                        onComplete: () => {
                            [top, bottom, band, bandEdge1, bandEdge2, turnText].forEach((o) => o.destroy());
                            onComplete();
                        }
                    });
                });
            }
        });
    }

    /**
     * 卡牌返回原始位置动画
     */
    public returnCardToPosition(
        card: any,
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
            onComplete: onComplete
        });
    }
}
