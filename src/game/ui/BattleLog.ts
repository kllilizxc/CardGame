import { Scene } from 'phaser';
import type { CardSprite } from '../objects/CardSprite';

interface LogEntry {
    text: string;
    cardRefs: Array<{ name: string; card: CardSprite }>;
    timestamp: number;
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

    private readonly MAX_ENTRIES = 50;
    private readonly LOG_WIDTH: number;
    private readonly LOG_HEIGHT: number;
    private readonly LOG_X: number;
    private readonly LOG_Y: number;

    constructor(scene: Scene) {
        this.scene = scene;
        const { width, height } = scene.scale;

        // 日志窗口尺寸和位置（右侧）
        this.LOG_WIDTH = width * 0.25;
        this.LOG_HEIGHT = height * 0.6;
        this.LOG_X = width - this.LOG_WIDTH / 2 - width * 0.02;
        this.LOG_Y = height * 0.5;

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
            fontSize: Math.floor(height * 0.02) + 'px',
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
            fontSize: Math.floor(height * 0.012) + 'px',
            color: '#95a5a6',
            fontStyle: 'italic'
        }).setOrigin(0.5);
        this.container.add(scrollHint);

        // 位置提示（右侧）
        this.bottomHint = scene.add.text(this.LOG_WIDTH / 2 - 80, this.LOG_HEIGHT / 2 - 15, '✓ 已到最新', {
            fontSize: Math.floor(height * 0.012) + 'px',
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
        const { height } = this.scene.scale;
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

    public addLog(message: string, cards: CardSprite[] = []) {
        const entry: LogEntry = {
            text: message,
            cardRefs: cards.map(card => ({
                name: card.getCardData().name,
                card: card
            })),
            timestamp: Date.now()
        };

        this.logEntries.push(entry);
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
            
            // 创建日志行（使用分段着色）
            const actualHeight = this.createColoredLogLine(
                -this.LOG_WIDTH / 2 + 15,
                currentY,
                displayText,
                entry.cardRefs,
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
        cardRefs: Array<{ name: string; card: CardSprite }>,
        fontSize: string,
        maxWidth: number
    ): number {
        // 解析文本，识别卡牌名称标记
        const parts: Array<{ text: string; isCard: boolean; cardRef?: { name: string; card: CardSprite } }> = [];
        let remaining = text;
        
        // 分割文本
        while (remaining.length > 0) {
            const cardStart = remaining.indexOf('<CARD>');
            if (cardStart === -1) {
                // 没有更多卡牌标记
                if (remaining.length > 0) {
                    parts.push({ text: remaining, isCard: false });
                }
                break;
            }
            
            // 添加卡牌前的普通文本
            if (cardStart > 0) {
                parts.push({ text: remaining.substring(0, cardStart), isCard: false });
            }
            
            // 查找结束标记
            const cardEnd = remaining.indexOf('</CARD>');
            if (cardEnd === -1) break;
            
            const cardName = remaining.substring(cardStart + 6, cardEnd);
            const cardRef = cardRefs.find(ref => ref.name === cardName);
            
            parts.push({ 
                text: `【${cardName}】`, 
                isCard: true,
                cardRef: cardRef
            });
            
            remaining = remaining.substring(cardEnd + 7);
        }
        
        // 创建文本片段
        let currentX = x;
        let currentLineY = y;
        let lineWidth = 0;
        let maxHeight = 0;
        
        parts.forEach(part => {
            const textColor = part.isCard ? '#f39c12' : '#ecf0f1';
            const textStyle = part.isCard ? 'bold' : 'normal';
            
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
                    this.scene.events.emit('showCardPreview', cardRef.card);
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
        this.container.destroy();
        this.toggleButton.destroy();
    }
}
