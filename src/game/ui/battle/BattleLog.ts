import { Scene } from 'phaser';
import { INK } from '../../art/palette';
import { panel, ptext } from '../../art/kit';
import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import { GongfaTooltip } from '../common/GongfaTooltip';
import type { PanelConfig } from '../../config/LayoutConfig';
import { battleTheme, blendBattleColor } from './battleTheme';
import { sceneTheme } from '../../scenes/shared/sceneTheme';
import type { CardPreviewMetadata } from '../../managers/common/cardPreviewProtocol';
import { isPortraitGameViewport } from '../../layout/gameViewport';

interface LogEntry {
    text: string;
    cardRefs: Array<{ name: string; card: BaseCardSprite; cardData: any }>;
    timestamp: number;
    gongfaInfo?: { name: string; description: string };
}

export class BattleLog {
    private scene: Scene;
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Rectangle;
    private logEntries: LogEntry[] = [];
    private logObjects: Phaser.GameObjects.GameObject[] = [];
    private scrollOffset: number = 0;
    private maxScrollOffset: number = 0;
    private isVisible: boolean = true;
    private toggleButton: Phaser.GameObjects.Container;
    private logContainer: Phaser.GameObjects.Container;
    private scrollBar: Phaser.GameObjects.Rectangle;
    private scrollThumb: Phaser.GameObjects.Rectangle;
    private bottomHint: Phaser.GameObjects.Text;
    private isScrolling: boolean = false;
    private gongfaTooltip: GongfaTooltip;
    private readonly previewMetadata: CardPreviewMetadata = {
        contextId: 'battle-log',
        sourceLabel: '战斗日志',
    };

    private readonly MAX_ENTRIES = 50;
    private readonly LOG_WIDTH: number;
    private readonly LOG_HEIGHT: number;
    private readonly LOG_X: number;
    private readonly LOG_Y: number;

    constructor(scene: Scene, config: PanelConfig) {
        this.scene = scene;

        // 使用传入的配置
        this.LOG_WIDTH = config.width;
        this.LOG_HEIGHT = config.height;
        this.LOG_X = config.x;
        this.LOG_Y = config.y;

        // 创建容器
        this.container = scene.add.container(this.LOG_X, this.LOG_Y);
        this.container.setDepth(1500);

        this.background = scene.add.rectangle(0, 0, this.LOG_WIDTH, this.LOG_HEIGHT, 0x000000, 0.001);
        this.background.setInteractive();
        this.container.add([panel(scene, 0, 0, this.LOG_WIDTH, this.LOG_HEIGHT, 'ink'), this.background]);
        this.container.add(ptext(scene, -this.LOG_WIDTH / 2 + 24, -this.LOG_HEIGHT / 2 + 12, '战斗日志', { color: INK.gold }));

        // 创建日志内容容器（用于滚动）
        this.logContainer = scene.add.container(0, 0);
        this.container.add(this.logContainer);

        // 创建滚动条
        this.createScrollBar();

        this.bottomHint = ptext(scene, this.LOG_WIDTH / 2 - 24, this.LOG_HEIGHT / 2 - 12, '✓ 最新', { color: INK.spirit, origin: [1, 1] });
        this.container.add(this.bottomHint);

        // 创建切换按钮
        this.createToggleButton();

        // 设置遮罩以限制日志显示区域
        this.setupMask();

        // 设置滚轮事件
        this.setupScrolling();

        // 初始化功法提示框
        this.gongfaTooltip = new GongfaTooltip(scene);
    }

    private createToggleButton() {
        const { width, height } = this.scene.scale;
        
        const portrait = isPortraitGameViewport(width, height);
        this.toggleButton = this.scene.add.container(width - (portrait ? 60 : width * 0.02 + 56), portrait ? 36 : height * 0.34);
        this.toggleButton.setDepth(1501).setVisible(false);

        const buttonShadow = this.scene.add.rectangle(4, 6, portrait ? 92 : 100, 48, sceneTheme.colors.shadow, 0.22);
        const btnBg = this.scene.add.rectangle(
            0,
            0,
            portrait ? 92 : 100,
            48,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.18),
            0.96,
        );
        btnBg.setStrokeStyle(2, sceneTheme.colors.goldSoft, 0.56);
        btnBg.setInteractive({ useHandCursor: true });
        this.toggleButton.add([buttonShadow, btnBg]);

        const btnText = this.scene.add.text(0, 0, '日志', {
            fontFamily: sceneTheme.fonts.ui,
            fontSize: '18px',
            color: battleTheme.colors.textPrimary,
            fontStyle: 'bold',
        }).setOrigin(0.5);
        this.toggleButton.add(btnText);

        btnBg.on('pointerover', () => btnBg.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.28), 1));
        btnBg.on('pointerout', () => btnBg.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.18), 0.96));
        btnBg.on('pointerdown', () => this.toggle());
    }

    private setupMask() {
        const maskShape = this.scene.make.graphics({});
        maskShape.fillStyle(0xf4ecd8);
        maskShape.fillRect(
            this.LOG_X - this.LOG_WIDTH / 2 + 10,
            this.LOG_Y - this.LOG_HEIGHT / 2 + 50,
            this.LOG_WIDTH - 20,
            this.LOG_HEIGHT - 80
        );
        const mask = maskShape.createGeometryMask();
        this.logContainer.setMask(mask);
    }

    private createScrollBar() {
        const barWidth = 6;
        const barHeight = this.LOG_HEIGHT - 100;
        const barX = this.LOG_WIDTH / 2 - 15;
        const barY = 0;

        // 滚动条背景
        this.scrollBar = this.scene.add.rectangle(
            barX,
            barY,
            barWidth,
            barHeight,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.14),
            0.56,
        );
        this.container.add(this.scrollBar);

        // 滚动条滑块
        const thumbHeight = 50;
        this.scrollThumb = this.scene.add.rectangle(
            barX,
            barY - barHeight / 2 + thumbHeight / 2,
            barWidth,
            thumbHeight,
            sceneTheme.colors.goldSoft,
            0.88,
        );
        this.scrollThumb.setStrokeStyle(1, sceneTheme.colors.gold, 0.48);
        this.scrollThumb.setInteractive({ useHandCursor: true, draggable: true });
        this.container.add(this.scrollThumb);

        // 滑块拖拽
        this.scrollThumb.on('drag', (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {
            const minY = barY - barHeight / 2 + thumbHeight / 2;
            const maxY = barY + barHeight / 2 - thumbHeight / 2;
            const clampedY = Phaser.Math.Clamp(dragY, minY, maxY);
            
            this.scrollThumb.y = clampedY;
            
            // 计算滚动偏移
            const scrollPercent = (clampedY - minY) / (maxY - minY);
            this.scrollToPercent(scrollPercent);
        });
    }

    private setupScrolling() {
        // 监听鼠标滚轮事件
        this.background.on('wheel', (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number) => {
            if (this.isScrolling) return;
            
            const scrollSpeed = 60;
            const targetOffset = this.scrollOffset + (deltaY > 0 ? scrollSpeed : -scrollSpeed);
            const clampedOffset = Phaser.Math.Clamp(targetOffset, 0, this.maxScrollOffset);
            
            this.smoothScrollTo(clampedOffset);
        });
    }

    private smoothScrollTo(targetOffset: number) {
        if (this.isScrolling) return;
        
        this.isScrolling = true;
        this.scrollOffset = targetOffset;
        
        // 使用tween实现平滑滚动
        this.scene.tweens.add({
            targets: this.logContainer,
            y: -targetOffset,
            duration: 200,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.isScrolling = false;
                this.updateScrollBar();
                this.updateBottomHint();
            }
        });
    }

    private scrollToPercent(percent: number) {
        const targetOffset = this.maxScrollOffset * percent;
        this.scrollOffset = targetOffset;
        this.logContainer.y = -targetOffset;
        this.updateBottomHint();
    }

    private updateScrollBar() {
        if (this.maxScrollOffset <= 0) {
            this.scrollThumb.setVisible(false);
            this.scrollBar.setAlpha(0.3);
            return;
        }
        
        this.scrollThumb.setVisible(true);
        this.scrollBar.setAlpha(0.5);
        
        const barHeight = this.LOG_HEIGHT - 100;
        const thumbHeight = 50;
        const scrollPercent = this.scrollOffset / this.maxScrollOffset;
        
        const minY = -barHeight / 2 + thumbHeight / 2;
        const maxY = barHeight / 2 - thumbHeight / 2;
        
        this.scrollThumb.y = minY + scrollPercent * (maxY - minY);
    }

    private updateBottomHint() {
        // 检查是否在顶部（最旧消息）或底部（最新消息）
        const isAtTop = this.scrollOffset <= 5; // 在顶部（最旧消息）
        const isAtBottom = this.scrollOffset >= this.maxScrollOffset - 20; // 在底部（最新消息），增加容差
        
        // 在顶部或底部显示提示
        this.bottomHint.setVisible(isAtTop || (isAtBottom && this.maxScrollOffset > 0));
        
        // 更新提示文字
        if (isAtTop && this.maxScrollOffset > 0) {
            this.bottomHint.setText('✓ 已到最早');
            this.bottomHint.setColor(battleTheme.colors.textSupport);
        } else if (isAtBottom) {
            this.bottomHint.setText('✓ 已到最新');
            this.bottomHint.setColor(battleTheme.colors.textPositive);
        }
    }

    private lineListeners: Array<(line: string) => void> = [];

    /** Subscribe to every log line (used by the HUD toast feed). */
    public onLine(listener: (line: string) => void): void {
        this.lineListeners.push(listener);
    }

    /** The HUD provides its own toggle button. */
    public setToggleVisible(visible: boolean): void {
        this.toggleButton.setVisible(visible);
    }

    public addLog(message: string, cards: BaseCardSprite[] = []) {
        this.lineListeners.forEach(listener => listener(message));
        const entry: LogEntry = {
            text: message,
            cardRefs: cards.map(card => ({
                name: card.getCardData().name,
                card: card,
                cardData: card.getCardData()  // 存储卡片数据副本
            })),
            timestamp: Date.now()
        };

        this.logEntries.push(entry);
        if (this.logEntries.length > this.MAX_ENTRIES) {
            this.logEntries.shift();
        }

        this.refreshLog();
    }

    /**
     * 添加带功法悬浮提示的日志
     * @param unitName 单位名称
     * @param gongfaName 功法名称
     * @param gongfaDescription 功法描述
     * @param cards 相关卡牌精灵
     */
    public addGongfaLog(unitName: string, gongfaName: string, gongfaDescription: string, cards: BaseCardSprite[] = []) {
        // 使用特殊标记包裹功法名，方便后续识别
        const message = `【${unitName}】发动了功法<GONGFA>${gongfaName}</GONGFA>`;
        
        const entry: LogEntry & { gongfaInfo?: { name: string; description: string } } = {
            text: message,
            cardRefs: cards.map(card => ({
                name: card.getCardData().name,
                card: card,
                cardData: card.getCardData()
            })),
            timestamp: Date.now(),
            gongfaInfo: {
                name: gongfaName,
                description: gongfaDescription
            }
        };

        this.logEntries.push(entry as LogEntry);
        if (this.logEntries.length > this.MAX_ENTRIES) {
            this.logEntries.shift();
        }

        this.refreshLog();
    }

    private refreshLog() {
        this.logObjects.forEach((object) => object.destroy());
        this.logObjects = [];

        const { height } = this.scene.scale;
        const fontSize = Math.max(18, Math.floor(height * 0.017)) + 'px';
        const lineGap = Math.max(12, Math.floor(height * 0.012));
        const startY = -this.LOG_HEIGHT / 2 + 60;
        const maxWidth = this.LOG_WIDTH - 46;

        // 从最旧到最新顺序显示（所有记录，不限制数量）
        let currentY = startY;

        for (let i = 0; i < this.logEntries.length; i++) {
            const entry = this.logEntries[i];
            
            // 创建时间戳
            const time = new Date(entry.timestamp);
            const timeStr = `[${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}] `;
            
            // 如果有卡牌引用，使用富文本高亮卡牌名称
            let displayText = timeStr + entry.text;
            
            // 为卡牌名称添加特殊标记
            entry.cardRefs.forEach(cardRef => {
                // 用特殊标记包裹卡牌名称，方便后续处理
                displayText = displayText.replace(
                    `【${cardRef.name}】`,
                    `<CARD>${cardRef.name}</CARD>`
                );
            });
            
            // 功法名已经在 addGongfaLog 中标记为 <GONGFA>，这里不需要额外处理
            
            // 创建日志行（使用分段着色）
            const actualHeight = this.createColoredLogLine(
                -this.LOG_WIDTH / 2 + 15,
                currentY,
                displayText,
                entry.cardRefs,
                entry.gongfaInfo,
                fontSize,
                maxWidth
            );

            // 使用实际高度而不是估算
            currentY += actualHeight + lineGap;
        }

        // 计算最大滚动距离（加一些缓冲）
        const visibleHeight = this.LOG_HEIGHT - 130;
        const totalContentHeight = currentY - startY + lineGap * 2;
        this.maxScrollOffset = Math.max(0, totalContentHeight - visibleHeight);
        
        // 自动滚动到底部（最新消息）
        this.scrollOffset = this.maxScrollOffset;
        this.logContainer.y = -this.scrollOffset;
        
        // 更新滚动条
        this.updateScrollBar();
        this.updateBottomHint();
    }

    private createColoredLogLine(
        x: number,
        y: number,
        text: string,
        cardRefs: Array<{ name: string; card: BaseCardSprite; cardData: any }>,
        _gongfaInfo: { name: string; description: string } | undefined,
        _fontSize: string,
        maxWidth: number
    ): number {
        // One pixel-text block per entry; card and technique names are bracketed for scanning.
        const plain = text
            .replace(/<CARD>(.*?)<\/CARD>/g, '【$1】')
            .replace(/<GONGFA>(.*?)<\/GONGFA>/g, '〔$1〕');
        const line = ptext(this.scene, x, y, plain, { color: INK.bone, wrap: Math.max(72, maxWidth), fx: 'none' });
        if (cardRefs.length) {
            line.setInteractive({ useHandCursor: true });
            line.on('pointerover', () => { line.setColor('#f5cf6a'); this.scene.events.emit('showCardPreview', cardRefs[0].card, this.previewMetadata); });
            line.on('pointerout', () => line.setColor('#e6dcc2'));
        }
        this.logContainer.add(line);
        this.logObjects.push(line);
        return line.height;
    }


    public toggle() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.scene.tweens.killTweensOf(this.container);
            this.container.setX(this.LOG_X + 60).setAlpha(0);
            this.scene.tweens.add({ targets: this.container, x: this.LOG_X, alpha: 1, duration: 200, ease: 'Cubic.easeOut' });
        }
        if (!this.isVisible) {
            this.scene.events.emit('clearCardPreviewContext', this.previewMetadata.contextId);
        }
        this.container.setVisible(this.isVisible);
    }

    public show() {
        this.isVisible = true;
        this.container.setVisible(true);
    }

    public hide() {
        this.isVisible = false;
        this.scene.events.emit('clearCardPreviewContext', this.previewMetadata.contextId);
        this.container.setVisible(false);
    }

    public destroy() {
        this.scene.events.emit('clearCardPreviewContext', this.previewMetadata.contextId);
        this.gongfaTooltip.destroy();
        this.container.destroy();
        this.toggleButton.destroy();
    }
}
