import { Scene } from 'phaser';
import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import { GongfaTooltip } from '../common/GongfaTooltip';
import type { PanelConfig } from '../../config/LayoutConfig';
import type { AnyCard } from '@types/cards/all';

interface LogEntry {
    text: string;
    cardRefs: Array<{ name: string; card: BaseCardSprite; cardData: AnyCard }>;
    timestamp: number;
    gongfaInfo?: { name: string; description: string };
}

export class BattleLog {
    private scene: Scene;
    private container: Phaser.GameObjects.Container;
    private background: Phaser.GameObjects.Rectangle;
    private logEntries: LogEntry[] = [];
    private logTexts: Phaser.GameObjects.Text[] = [];
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

        // 背景
        this.background = scene.add.rectangle(0, 0, this.LOG_WIDTH, this.LOG_HEIGHT, 0x1a1a2e, 0.9);
        this.background.setStrokeStyle(3, 0xf39c12);
        this.background.setInteractive();
        this.container.add(this.background);

        // 标题
        const title = scene.add.text(0, -this.LOG_HEIGHT / 2 + 20, '战斗日志', {
            fontSize: Math.floor(scene.scale.height * 0.02) + 'px',
            color: '#f39c12',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(title);

        // 创建日志内容容器（用于滚动）
        this.logContainer = scene.add.container(0, 0);
        this.container.add(this.logContainer);

        // 创建滚动条
        this.createScrollBar();

        // 滚动提示（左侧）
        const scrollHint = scene.add.text(-this.LOG_WIDTH / 2 + 80, this.LOG_HEIGHT / 2 - 15, '[ 滚轮滚动 ]', {
            fontSize: Math.floor(scene.scale.height * 0.012) + 'px',
            color: '#95a5a6',
            fontStyle: 'italic'
        }).setOrigin(0.5);
        this.container.add(scrollHint);

        // 位置提示（右侧）
        this.bottomHint = scene.add.text(this.LOG_WIDTH / 2 - 80, this.LOG_HEIGHT / 2 - 15, '✓ 已到最新', {
            fontSize: Math.floor(scene.scale.height * 0.012) + 'px',
            color: '#2ecc71',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.bottomHint.setVisible(true);
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
        
        this.toggleButton = this.scene.add.container(
            width - width * 0.02 - 25,
            height * 0.5 - this.LOG_HEIGHT / 2 - 40
        );
        this.toggleButton.setDepth(1501);

        const btnBg = this.scene.add.rectangle(0, 0, 50, 30, 0xf39c12);
        btnBg.setInteractive({ useHandCursor: true });
        this.toggleButton.add(btnBg);

        const btnText = this.scene.add.text(0, 0, '日志', {
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.toggleButton.add(btnText);

        btnBg.on('pointerover', () => btnBg.setFillStyle(0xffd700));
        btnBg.on('pointerout', () => btnBg.setFillStyle(0xf39c12));
        btnBg.on('pointerdown', () => this.toggle());
    }

    private setupMask() {
        const maskShape = this.scene.make.graphics({});
        maskShape.fillStyle(0xffffff);
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
        this.scrollBar = this.scene.add.rectangle(barX, barY, barWidth, barHeight, 0x34495e, 0.5);
        this.container.add(this.scrollBar);

        // 滚动条滑块
        const thumbHeight = 50;
        this.scrollThumb = this.scene.add.rectangle(barX, barY - barHeight / 2 + thumbHeight / 2, barWidth, thumbHeight, 0xf39c12, 0.8);
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
            this.bottomHint.setColor('#95a5a6');
        } else if (isAtBottom) {
            this.bottomHint.setText('✓ 已到最新');
            this.bottomHint.setColor('#2ecc71');
        }
    }

    public addLog(message: string, cards: BaseCardSprite[] = []) {
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
        // 清除旧的文本
        this.logTexts.forEach(text => text.destroy());
        this.logTexts = [];

        const { height } = this.scene.scale;
        const fontSize = Math.floor(height * 0.014) + 'px';
        const lineHeight = height * 0.025;
        const startY = -this.LOG_HEIGHT / 2 + 50;
        const maxWidth = this.LOG_WIDTH - 30;

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
            currentY += actualHeight + lineHeight;
        }

        // 计算最大滚动距离（加一些缓冲）
        const visibleHeight = this.LOG_HEIGHT - 130;
        const totalContentHeight = currentY - startY + lineHeight * 2; // 额外缓冲
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
        cardRefs: Array<{ name: string; card: BaseCardSprite; cardData: AnyCard }>,
        gongfaInfo: { name: string; description: string } | undefined,
        fontSize: string,
        maxWidth: number
    ): number {
        // 解析文本，识别卡牌名称和功法标记
        const parts: Array<{ 
            text: string; 
            isCard: boolean; 
            isGongfa: boolean;
            cardRef?: { name: string; card: BaseCardSprite; cardData: AnyCard };
            gongfaInfo?: { name: string; description: string };
        }> = [];
        let remaining = text;
        
        // 分割文本，同时处理 <CARD> 和 <GONGFA> 标记
        while (remaining.length > 0) {
            const cardStart = remaining.indexOf('<CARD>');
            const gongfaStart = remaining.indexOf('<GONGFA>');
            
            // 找到最近的标记
            let nextMarkStart = -1;
            let isNextCard = false;
            
            if (cardStart !== -1 && gongfaStart !== -1) {
                if (cardStart < gongfaStart) {
                    nextMarkStart = cardStart;
                    isNextCard = true;
                } else {
                    nextMarkStart = gongfaStart;
                    isNextCard = false;
                }
            } else if (cardStart !== -1) {
                nextMarkStart = cardStart;
                isNextCard = true;
            } else if (gongfaStart !== -1) {
                nextMarkStart = gongfaStart;
                isNextCard = false;
            }
            
            if (nextMarkStart === -1) {
                // 没有更多标记
                if (remaining.length > 0) {
                    parts.push({ text: remaining, isCard: false, isGongfa: false });
                }
                break;
            }
            
            // 添加标记前的普通文本
            if (nextMarkStart > 0) {
                parts.push({ text: remaining.substring(0, nextMarkStart), isCard: false, isGongfa: false });
            }
            
            if (isNextCard) {
                // 处理卡牌标记
                const cardEnd = remaining.indexOf('</CARD>');
                if (cardEnd === -1) break;
                
                const cardName = remaining.substring(cardStart + 6, cardEnd);
                const cardRef = cardRefs.find(ref => ref.name === cardName);
                
                parts.push({ 
                    text: `【${cardName}】`, 
                    isCard: true,
                    isGongfa: false,
                    cardRef: cardRef
                });
                
                remaining = remaining.substring(cardEnd + 7);
            } else {
                // 处理功法标记
                const gongfaEnd = remaining.indexOf('</GONGFA>');
                if (gongfaEnd === -1) break;
                
                const gongfaName = remaining.substring(gongfaStart + 8, gongfaEnd);
                
                parts.push({ 
                    text: `【${gongfaName}】`, 
                    isCard: false,
                    isGongfa: true,
                    gongfaInfo: gongfaInfo
                });
                
                remaining = remaining.substring(gongfaEnd + 9);
            }
        }
        
        // 创建文本片段
        let currentX = x;
        let currentLineY = y;
        let lineWidth = 0;
        let maxHeight = 0;
        
        parts.forEach(part => {
            const textColor = part.isCard || part.isGongfa ? '#f39c12' : '#ecf0f1';
            const textStyle = part.isCard || part.isGongfa ? 'bold' : 'normal';
            
            const textObj = this.scene.add.text(currentX, currentLineY, part.text, {
                fontSize: fontSize,
                color: textColor,
                fontStyle: textStyle,
                wordWrap: { width: maxWidth - lineWidth }
            });
            textObj.setOrigin(0, 0);
            this.logContainer.add(textObj);
            this.logTexts.push(textObj);
            
            // 记录最大高度
            maxHeight = Math.max(maxHeight, textObj.height);
            
            // 如果是卡牌名称，添加交互
            if (part.isCard && part.cardRef) {
                const hitArea = this.scene.add.rectangle(
                    currentX + textObj.width / 2,
                    currentLineY + 8,
                    textObj.width,
                    16,
                    0xffd700,
                    0
                );
                hitArea.setInteractive({ useHandCursor: true });
                hitArea.setOrigin(0.5, 0.5);
                this.logContainer.add(hitArea);
                
                // 下划线
                const underline = this.scene.add.rectangle(
                    hitArea.x,
                    hitArea.y + 8,
                    textObj.width,
                    2,
                    0xffd700,
                    0
                );
                this.logContainer.add(underline);
                
                const cardRef = part.cardRef;
                hitArea.on('pointerover', () => {
                    underline.setAlpha(1);
                    // 安全检查：如果精灵还活着且场景存在，使用精灵；否则使用卡片数据
                    try {
                        if (cardRef.card && cardRef.card.active && cardRef.card.scene) {
                            // 精灵存在、激活且有场景，可以安全使用
                            this.scene.events.emit('showCardPreview', cardRef.card);
                        } else {
                            // 精灵已销毁或不可用，使用卡片数据显示预览
                            this.scene.events.emit('showCardPreviewFromData', cardRef.cardData);
                        }
                    } catch (e) {
                        // 如果访问精灵出错，直接使用数据
                        console.warn('Error accessing card sprite, using card data instead:', e);
                        this.scene.events.emit('showCardPreviewFromData', cardRef.cardData);
                    }
                });
                
                hitArea.on('pointerout', () => {
                    underline.setAlpha(0);
                    this.scene.events.emit('hideCardPreview');
                });
                
                // 让滚轮事件穿透到背景
                hitArea.on('wheel', (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number) => {
                    if (this.isScrolling) return;
                    
                    const scrollSpeed = 60;
                    const targetOffset = this.scrollOffset + (deltaY > 0 ? scrollSpeed : -scrollSpeed);
                    const clampedOffset = Phaser.Math.Clamp(targetOffset, 0, this.maxScrollOffset);
                    
                    this.smoothScrollTo(clampedOffset);
                });
            }
            
            // 如果是功法名称，添加悬浮提示交互
            if (part.isGongfa && part.gongfaInfo) {
                const hitArea = this.scene.add.rectangle(
                    currentX + textObj.width / 2,
                    currentLineY + 8,
                    textObj.width,
                    16,
                    0xffd700,
                    0
                );
                hitArea.setInteractive({ useHandCursor: true });
                hitArea.setOrigin(0.5, 0.5);
                this.logContainer.add(hitArea);
                
                // 下划线
                const underline = this.scene.add.rectangle(
                    hitArea.x,
                    hitArea.y + 8,
                    textObj.width,
                    2,
                    0xffd700,
                    0
                );
                this.logContainer.add(underline);
                
                const gongfaInfo = part.gongfaInfo;
                hitArea.on('pointerover', () => {
                    underline.setAlpha(1);
                    // 计算提示框位置（相对于场景坐标）
                    const worldX = this.container.x + hitArea.x + this.logContainer.x;
                    const worldY = this.container.y + hitArea.y + this.logContainer.y;
                    this.gongfaTooltip.show(worldX + textObj.width / 2, worldY - 10, gongfaInfo.name, gongfaInfo.description);
                });
                
                hitArea.on('pointerout', () => {
                    underline.setAlpha(0);
                    this.gongfaTooltip.hide();
                });
                
                // 让滚轮事件穿透到背景
                hitArea.on('wheel', (_pointer: Phaser.Input.Pointer, _deltaX: number, deltaY: number) => {
                    if (this.isScrolling) return;
                    
                    const scrollSpeed = 60;
                    const targetOffset = this.scrollOffset + (deltaY > 0 ? scrollSpeed : -scrollSpeed);
                    const clampedOffset = Phaser.Math.Clamp(targetOffset, 0, this.maxScrollOffset);
                    
                    this.smoothScrollTo(clampedOffset);
                });
            }
            
            currentX += textObj.width;
            lineWidth += textObj.width;
        });
        
        // 返回实际高度
        return maxHeight;
    }


    public toggle() {
        this.isVisible = !this.isVisible;
        this.container.setVisible(this.isVisible);
    }

    public show() {
        this.isVisible = true;
        this.container.setVisible(true);
    }

    public hide() {
        this.isVisible = false;
        this.container.setVisible(false);
    }

    public destroy() {
        this.gongfaTooltip.destroy();
        this.container.destroy();
        this.toggleButton.destroy();
    }
}
