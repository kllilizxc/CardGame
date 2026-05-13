import type { Scene } from 'phaser';

/**
 * 教程覆盖层高亮区域
 */
export interface TutorialHighlightZone {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * 引导文本位置
 */
export type GuideTextPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * 玩家操作事件类型
 */
export type TutorialPlayerAction =
    | 'card_played'
    | 'card_drawn'
    | 'end_turn'
    | 'equip_artifact'
    | 'use_skill'
    | 'use_pill'
    | 'sacrifice'
    | 'unit_attack';

/**
 * 教程步骤定义
 */
export interface TutorialStepDefinition {
    /** 步骤唯一标识 */
    id: string;
    /** 需要高亮的区域 */
    highlightZones: TutorialHighlightZone[];
    /** 引导文本 */
    guideText: string;
    /** 文本显示位置（相对于屏幕） */
    textPosition: GuideTextPosition;
    /** 是否显示箭头指示器 */
    showArrow?: boolean;
    /** 箭头起点（居中在文本附近） */
    arrowFromX?: number;
    arrowFromY?: number;
    /** 箭头指向的 UI 区域中心 */
    arrowToX?: number;
    arrowToY?: number;
    /** 进入此步骤时调用 */
    onEnter?: () => void;
    /** 检测此步骤是否完成。返回 true 推进到下一步。 */
    completionCheck?: (action: TutorialPlayerAction) => boolean;
}

/**
 * 教程覆盖层控制器
 *
 * 为 BattleScene 提供轻量级教程覆盖层，支持：
 * - 高亮指定 UI 区域（手牌、场地、结束回合按钮等）
 * - 显示引导文本和箭头指示器
 * - 检测玩家操作完成步骤
 * - 步骤自动推进
 *
 * 激活条件：BattleScene 的 source === 'tutorial'
 * 非教程战斗无任何性能影响。
 */
export class TutorialOverlayController {
    private scene: Scene;
    private active = false;
    private steps: TutorialStepDefinition[] = [];
    private currentStepIndex = -1;

    private highlightGfx: Phaser.GameObjects.Graphics | null = null;
    private arrowGfx: Phaser.GameObjects.Graphics | null = null;
    private guideTextObj: Phaser.GameObjects.Text | null = null;
    private dimBg: Phaser.GameObjects.Rectangle | null = null;

    private onComplete: (() => void) | null = null;

    private static readonly OVERLAY_DEPTH = 5000;
    private static readonly HIGHLIGHT_COLOR = 0xf1c40f;
    private static readonly ARROW_HEAD_LEN = 14;

    /**
     * 类型安全地检测传入数据是否标记为教程战斗。
     * 无需修改 StoryBattleSceneLaunchPayload 类型即可安全区分。
     */
    static hasTutorialSource(data: unknown): boolean {
        if (typeof data !== 'object' || data === null) return false;
        const source = (data as Record<string, unknown>).source;
        return source === 'tutorial';
    }

    constructor(scene: Scene) {
        this.scene = scene;
    }

    get isActive(): boolean {
        return this.active;
    }

    get currentStep(): TutorialStepDefinition | null {
        return this.steps[this.currentStepIndex] ?? null;
    }

    get stepCount(): number {
        return this.steps.length;
    }

    get currentStepNumber(): number {
        return this.active ? this.currentStepIndex + 1 : 0;
    }

    /** 加载教程步骤数据 */
    loadSteps(steps: TutorialStepDefinition[]): void {
        this.steps = steps;
    }

    /** 开始教程覆盖层 */
    start(onComplete?: () => void): void {
        if (this.steps.length === 0) return;
        this.active = true;
        this.onComplete = onComplete ?? null;
        this.currentStepIndex = 0;
        this.showCurrentStep();
    }

    /** 推进到下一步 */
    nextStep(): void {
        this.clearOverlay();
        this.currentStepIndex++;
        if (this.currentStepIndex >= this.steps.length) {
            this.finish();
            return;
        }
        this.showCurrentStep();
    }

    /** 通知玩家操作事件，用于步骤完成检测 */
    notifyPlayerAction(action: TutorialPlayerAction): void {
        if (!this.active) return;
        const step = this.currentStep;
        if (step?.completionCheck?.(action)) {
            this.nextStep();
        }
    }

    /** 销毁覆盖层并释放资源 */
    destroy(): void {
        this.clearOverlay();
        this.steps = [];
        this.active = false;
        this.onComplete = null;
    }

    // ===== 内部方法 =====

    private showCurrentStep(): void {
        const step = this.currentStep;
        if (!step) return;

        step.onEnter?.();
        this.drawOverlay(step);
    }

    private drawOverlay(step: TutorialStepDefinition): void {
        const { width, height } = this.scene.scale;
        const d = TutorialOverlayController.OVERLAY_DEPTH;

        // 半透明遮罩
        this.dimBg = this.scene.add.rectangle(
            width / 2, height / 2, width, height, 0x000000, 0.4
        ).setDepth(d).setInteractive();

        // 高亮区域
        this.highlightGfx = this.scene.add.graphics().setDepth(d + 1);
        const hc = TutorialOverlayController.HIGHLIGHT_COLOR;
        for (const zone of step.highlightZones) {
            const left = zone.x - zone.width / 2;
            const top = zone.y - zone.height / 2;
            this.highlightGfx.lineStyle(3, hc, 0.9);
            this.highlightGfx.strokeRect(left, top, zone.width, zone.height);
            this.highlightGfx.fillStyle(hc, 0.1);
            this.highlightGfx.fillRect(left, top, zone.width, zone.height);
        }

        // 箭头
        if (step.showArrow
            && step.arrowFromX !== undefined
            && step.arrowToX !== undefined) {
            this.arrowGfx = this.scene.add.graphics().setDepth(d + 2);
            this.drawArrow(
                step.arrowFromX, step.arrowFromY ?? 0,
                step.arrowToX, step.arrowToY ?? 0,
            );
        }

        // 引导文本
        const textPos = this.resolveTextPosition(step.textPosition, width, height);
        const fontSize = Math.max(16, Math.floor(height * 0.025)) + 'px';
        this.guideTextObj = this.scene.add.text(textPos.x, textPos.y, step.guideText, {
            fontSize,
            color: '#f1c40f',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
            wordWrap: { width: width * 0.65 },
        }).setOrigin(0.5).setDepth(d + 2);
    }

    private resolveTextPosition(
        pos: GuideTextPosition,
        screenW: number,
        screenH: number,
    ): { x: number; y: number } {
        switch (pos) {
            case 'top':    return { x: screenW / 2, y: screenH * 0.08 };
            case 'bottom': return { x: screenW / 2, y: screenH * 0.88 };
            case 'left':   return { x: screenW * 0.12, y: screenH / 2 };
            case 'right':  return { x: screenW * 0.88, y: screenH / 2 };
            case 'center': return { x: screenW / 2, y: screenH / 2 };
        }
    }

    private drawArrow(fx: number, fy: number, tx: number, ty: number): void {
        if (!this.arrowGfx) return;
        const g = this.arrowGfx;
        const color = TutorialOverlayController.HIGHLIGHT_COLOR;
        g.lineStyle(3, color, 0.85);
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(tx, ty);
        g.strokePath();

        // 箭头头部三角形
        const angle = Math.atan2(ty - fy, tx - fx);
        const h = TutorialOverlayController.ARROW_HEAD_LEN;
        g.fillStyle(color, 0.85);
        g.fillTriangle(
            tx, ty,
            tx - h * Math.cos(angle - 0.45),
            ty - h * Math.sin(angle - 0.45),
            tx - h * Math.cos(angle + 0.45),
            ty - h * Math.sin(angle + 0.45),
        );
    }

    private clearOverlay(): void {
        this.dimBg?.destroy();
        this.highlightGfx?.destroy();
        this.arrowGfx?.destroy();
        this.guideTextObj?.destroy();
        this.dimBg = null;
        this.highlightGfx = null;
        this.arrowGfx = null;
        this.guideTextObj = null;
    }

    private finish(): void {
        this.clearOverlay();
        this.active = false;
        this.currentStepIndex = -1;
        this.onComplete?.();
    }
}
