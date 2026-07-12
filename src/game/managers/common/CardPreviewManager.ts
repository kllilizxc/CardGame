import type { Scene } from 'phaser';

import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';
import { battleTheme, blendBattleColor } from '../../ui/battle/battleTheme';
import { getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import {
    CardPreviewSession,
    type CardPreviewContextMetric,
    type CardPreviewContextSection,
    type CardPreviewFallback,
    DEFAULT_CARD_PREVIEW_TITLE,
    type ActiveCardPreview,
    type CardPreviewMetadata,
    type PreviewCardData,
} from './cardPreviewProtocol';

interface CardPreviewManagerLayout {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    depth?: number;
}

interface CardPreviewManagerConfig {
    layout?: CardPreviewManagerLayout;
}

interface CardPreviewDisplayRequest extends CardPreviewMetadata {
    card?: BaseCardSprite;
    cardData?: PreviewCardData;
}

export class CardPreviewManager {
    private readonly scene: Scene;
    private readonly session = new CardPreviewSession();
    private readonly config: CardPreviewManagerConfig;
    private host!: Phaser.GameObjects.Container;
    private cardLayer!: Phaser.GameObjects.Container;
    private contextLayer!: Phaser.GameObjects.Container;
    private titleText!: Phaser.GameObjects.Text;
    private sourceText!: Phaser.GameObjects.Text;
    private previewCard: BaseCardSprite | null = null;
    private previewWidth = 0;
    private previewHeight = 0;
    private escHandler?: () => void;
    private isDestroyed = false;

    constructor(scene: Scene, config: CardPreviewManagerConfig = {}) {
        this.scene = scene;
        this.config = config;
        this.createHost();
        this.registerCloseBehavior();
        this.scene.events.once('shutdown', () => this.destroy());
        this.scene.events.once('destroy', () => this.destroy());
    }

    public showFromSprite(card: BaseCardSprite, metadata: CardPreviewMetadata = {}): void {
        this.show({
            card,
            ...metadata,
        });
    }

    public showFromData(cardData: PreviewCardData, metadata: CardPreviewMetadata = {}): void {
        this.show({
            cardData,
            ...metadata,
        });
    }

    public showFallback(metadata: CardPreviewMetadata): void {
        this.show({
            ...metadata,
        });
    }

    public clear(): void {
        if (!this.session.clear()) {
            return;
        }

        this.hide();
    }

    public clearContext(contextId: string): void {
        if (!this.session.clearContext(contextId)) {
            return;
        }

        this.hide();
    }

    public destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.scene.tweens.killTweensOf(this.host);
        this.scene.tweens.killTweensOf(this.cardLayer);
        this.session.clear();

        if (this.escHandler) {
            this.scene.input.keyboard?.off('keydown-ESC', this.escHandler);
            this.escHandler = undefined;
        }

        this.destroyPreviewContent();
        this.host.destroy();
    }

    private show(request: CardPreviewDisplayRequest): void {
        if (this.isDestroyed) {
            return;
        }

        const cardData = request.cardData ?? (request.card?.getCardData() as PreviewCardData | undefined);
        if (!cardData && !request.fallback) {
            return;
        }

        const activePreview = this.session.open({
            cardData,
            contextId: request.contextId,
            sourceLabel: request.sourceLabel,
            title: request.title,
            contextSection: request.contextSection,
            fallback: request.fallback,
        });

        this.render(activePreview);
    }

    private render(activePreview: ActiveCardPreview): void {
        this.scene.tweens.killTweensOf(this.host);
        this.scene.tweens.killTweensOf(this.cardLayer);

        this.titleText.setText(activePreview.title);
        this.sourceText.setText(`来源：${activePreview.sourceLabel}`);

        const reservedContextHeight = this.renderContextSection(activePreview.contextSection);
        if (!this.replacePreviewContent(activePreview, reservedContextHeight)) {
            this.session.clear();
            this.hide(true);
            return;
        }

        this.host.setVisible(true);
        this.cardLayer.setAlpha(0);
        this.scene.tweens.add({
            targets: this.cardLayer,
            alpha: 1,
            duration: 120,
            ease: 'Power2',
        });

        if (this.host.alpha < 1) {
            this.host.setAlpha(0);
            this.scene.tweens.add({
                targets: this.host,
                alpha: 1,
                duration: 150,
                ease: 'Power2',
            });
        } else {
            this.host.setAlpha(1);
        }

        this.emitVisibilityChange(true, activePreview.contextId);
    }

    private hide(immediate: boolean = false): void {
        if (immediate || !this.host.visible) {
            this.scene.tweens.killTweensOf(this.host);
            this.scene.tweens.killTweensOf(this.cardLayer);
            this.host.setAlpha(0);
            this.host.setVisible(false);
            this.destroyPreviewContent();
            this.emitVisibilityChange(false);
            return;
        }

        this.scene.tweens.killTweensOf(this.host);
        this.scene.tweens.add({
            targets: this.host,
            alpha: 0,
            duration: 100,
            ease: 'Power2',
            onComplete: () => {
                if (this.session.getActive()) {
                    return;
                }

                this.host.setVisible(false);
                this.destroyPreviewContent();
                this.emitVisibilityChange(false);
            },
        });
    }

    private replacePreviewContent(activePreview: ActiveCardPreview, reservedContextHeight: number): boolean {
        this.destroyPreviewContent();

        const cardAreaTop = -this.previewHeight / 2 + 124;
        const cardAreaBottom = this.previewHeight / 2 - reservedContextHeight - 30;
        const availableHeight = Math.max(196, cardAreaBottom - cardAreaTop);
        const previewCenterY = Math.round((cardAreaTop + cardAreaBottom) / 2);
        this.cardLayer.setPosition(0, previewCenterY);

        if (activePreview.cardData) {
            const previewCard = CardSpriteFactory.createSprite(this.scene, activePreview.cardData, 0, 0, 1);
            if (previewCard) {
                const previewScale = Math.min(1.32, Math.max(0.92, availableHeight / 260));

                previewCard.setDisplayMode('hover');
                previewCard.disableDragging();
                previewCard.disableInteractive();
                previewCard.setScale(previewScale);

                this.cardLayer.add(previewCard);
                this.previewCard = previewCard;
                return true;
            }
        }

        if (!activePreview.fallback) {
            return false;
        }

        this.renderFallbackPlaceholder(activePreview.fallback, availableHeight);
        return true;
    }

    private renderFallbackPlaceholder(fallback: CardPreviewFallback, availableHeight: number): void {
        const panelHeight = Math.min(Math.max(availableHeight, 220), 276);
        const panelWidth = this.previewWidth - 34;
        const placeholder = this.scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x0b1220, 0.98);
        placeholder.setStrokeStyle(2, sceneTheme.colors.goldSoft, 0.42);
        const accent = this.scene.add.rectangle(-panelWidth / 2 + 8, 0, 6, panelHeight - 18, sceneTheme.colors.gold, 0.82)
            .setOrigin(0, 0.5);
        const glow = this.scene.add.rectangle(0, 0, panelWidth - 18, panelHeight - 18, sceneTheme.colors.jade, 0.04);
        glow.setStrokeStyle(1, sceneTheme.colors.jadeBright, 0.12);

        const tagLabel = this.scene.add.text(
            -panelWidth / 2 + 20,
            -panelHeight / 2 + 24,
            fallback.tagLabel ?? '共享预览回退',
            getSceneTextStyle('support', {
                fontSize: '16px',
                color: battleTheme.colors.textSupport,
            }),
        ).setOrigin(0, 0.5);
        const title = this.scene.add.text(
            -panelWidth / 2 + 20,
            -panelHeight / 2 + 58,
            fallback.title,
            getSceneTextStyle('panelTitle', {
                fontSize: '24px',
                color: battleTheme.colors.textPrimary,
            }),
        ).setOrigin(0, 0.5);
        const body = this.scene.add.text(
            -panelWidth / 2 + 20,
            -panelHeight / 2 + 94,
            fallback.lines.slice(0, 3).join('\n'),
            getSceneTextStyle('support', {
                fontSize: '18px',
                color: battleTheme.colors.textSupport,
                wordWrap: { width: panelWidth - 42 },
                lineSpacing: 6,
            }),
        ).setOrigin(0, 0);

        this.cardLayer.add([
            placeholder,
            glow,
            accent,
            tagLabel,
            title,
            body,
        ]);
    }

    private destroyPreviewContent(): void {
        this.cardLayer.removeAll(true);
        this.contextLayer.removeAll(true);
        this.previewCard = null;
    }

    private createHost(): void {
        const battleScene = this.scene as Scene & {
            layout?: {
                cardPreview?: { x?: number; y?: number; width?: number; height?: number };
                depth?: { cardPreview?: number };
            };
        };
        const layout = battleScene.layout;
        const previewLayout = this.config.layout;
        const previewX = previewLayout?.x ?? layout?.cardPreview?.x ?? this.scene.scale.width * 0.15;
        const previewY = previewLayout?.y ?? layout?.cardPreview?.y ?? this.scene.scale.height * 0.5;

        this.previewWidth = Math.min(previewLayout?.width ?? layout?.cardPreview?.width ?? 392, 432);
        this.previewHeight = Math.min(previewLayout?.height ?? layout?.cardPreview?.height ?? 520, 680);

        this.host = this.scene.add.container(previewX, previewY);
        this.host.setDepth(previewLayout?.depth ?? layout?.depth?.cardPreview ?? 6100);
        this.host.setVisible(false);
        this.host.setAlpha(0);

        const shadow = this.scene.add.rectangle(8, 10, this.previewWidth, this.previewHeight, sceneTheme.colors.shadow, 0.24);
        const outer = this.scene.add.rectangle(0, 0, this.previewWidth, this.previewHeight, sceneTheme.colors.panel, 0.96);
        outer.setStrokeStyle(3, sceneTheme.colors.gold, 0.68);
        const inner = this.scene.add.rectangle(
            0,
            22,
            this.previewWidth - 24,
            this.previewHeight - 54,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.08),
            0.96,
        );
        inner.setStrokeStyle(1, sceneTheme.colors.jadeBright, 0.22);
        const banner = this.scene.add.rectangle(
            0,
            -this.previewHeight / 2 + 54,
            this.previewWidth - 32,
            88,
            blendBattleColor(sceneTheme.colors.banner, sceneTheme.colors.gold, 0.14),
            0.9,
        );
        banner.setStrokeStyle(1, sceneTheme.colors.goldSoft, 0.26);

        this.titleText = this.scene.add.text(
            -this.previewWidth / 2 + 22,
            -this.previewHeight / 2 + 36,
            DEFAULT_CARD_PREVIEW_TITLE,
            getSceneTextStyle('panelTitle', {
                fontSize: '26px',
                color: battleTheme.colors.textPrimary,
            }),
        ).setOrigin(0, 0.5);

        this.sourceText = this.scene.add.text(
            -this.previewWidth / 2 + 22,
            -this.previewHeight / 2 + 72,
            '来源：战场卡牌',
            getSceneTextStyle('support', {
                fontSize: '17px',
                color: battleTheme.colors.textSupport,
            }),
        ).setOrigin(0, 0.5);

        const closeButton = this.scene.add.rectangle(
            this.previewWidth / 2 - 58,
            -this.previewHeight / 2 + 38,
            88,
            34,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.18),
            0.96,
        );
        closeButton.setStrokeStyle(1, sceneTheme.colors.goldSoft, 0.42);
        closeButton.setInteractive({ useHandCursor: true });
        closeButton.on('pointerover', () => {
            closeButton.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.28), 1);
        });
        closeButton.on('pointerout', () => {
            closeButton.setFillStyle(blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.gold, 0.18), 0.96);
        });
        closeButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event?.stopPropagation();
            this.clear();
        });

        const closeLabel = this.scene.add.text(
            closeButton.x,
            closeButton.y,
            '收起',
            getSceneTextStyle('support', {
                fontSize: '16px',
                color: battleTheme.colors.textPrimary,
            }),
        ).setOrigin(0.5);

        this.cardLayer = this.scene.add.container(0, 34);
        this.contextLayer = this.scene.add.container(0, 0);

        this.host.add([
            shadow,
            outer,
            inner,
            banner,
            this.titleText,
            this.sourceText,
            closeButton,
            closeLabel,
            this.cardLayer,
            this.contextLayer,
        ]);
    }

    private registerCloseBehavior(): void {
        this.escHandler = () => {
            this.clear();
        };
        this.scene.input.keyboard?.on('keydown-ESC', this.escHandler);
    }

    private renderContextSection(contextSection?: CardPreviewContextSection): number {
        this.contextLayer.removeAll(true);

        const metrics = contextSection?.metrics?.filter((metric) => metric.value.trim().length > 0) ?? [];
        const lines = contextSection?.lines?.map((line) => line.trim()).filter((line) => line.length > 0) ?? [];
        const headline = contextSection?.headline?.trim();

        if (!headline && metrics.length === 0 && lines.length === 0) {
            return 0;
        }

        const reservedHeight = metrics.length > 0 ? 144 : 108;
        const panelY = this.previewHeight / 2 - reservedHeight / 2 - 18;
        const panel = this.scene.add.rectangle(
            0,
            panelY,
            this.previewWidth - 20,
            reservedHeight,
            blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.jade, 0.06),
            0.98,
        );
        panel.setStrokeStyle(1, sceneTheme.colors.jadeBright, 0.18);
        this.contextLayer.add(panel);

        let cursorY = panelY - reservedHeight / 2 + 18;
        if (headline) {
            const headlineText = this.scene.add.text(
                -this.previewWidth / 2 + 18,
                cursorY,
                headline,
                getSceneTextStyle('support', {
                    fontSize: '17px',
                    color: battleTheme.colors.textPrimary,
                }),
            ).setOrigin(0, 0);
            this.contextLayer.add(headlineText);
            cursorY += 28;
        }

        if (metrics.length > 0) {
            const visibleMetrics = metrics.slice(0, 4);
            const gap = 6;
            const metricWidth = (this.previewWidth - 44 - gap * Math.max(visibleMetrics.length - 1, 0)) / visibleMetrics.length;
            visibleMetrics.forEach((metric, index) => {
                const left = -this.previewWidth / 2 + 18 + index * (metricWidth + gap);
                const tone = metric.tone ?? 'neutral';
                const metricPanel = this.scene.add.rectangle(
                    left + metricWidth / 2,
                    cursorY + 18,
                    metricWidth,
                    36,
                    this.getMetricFillColor(tone),
                    0.98,
                );
                metricPanel.setStrokeStyle(1, this.getMetricBorderColor(tone), 0.72);
                const metricText = this.scene.add.text(
                    left + metricWidth / 2,
                    cursorY + 18,
                    `${metric.label} ${metric.value}`,
                    getSceneTextStyle('support', {
                        fontSize: '16px',
                        color: this.getMetricTextColor(tone),
                    }),
                ).setOrigin(0.5);
                this.contextLayer.add([metricPanel, metricText]);
            });
            cursorY += 52;
        }

        if (lines.length > 0) {
            const body = this.scene.add.text(
                -this.previewWidth / 2 + 18,
                cursorY,
                lines.slice(0, 2).join('\n'),
                getSceneTextStyle('support', {
                    fontSize: '17px',
                    color: battleTheme.colors.textSupport,
                    wordWrap: { width: this.previewWidth - 40 },
                    lineSpacing: 6,
                }),
            ).setOrigin(0, 0);
            this.contextLayer.add(body);
        }

        return reservedHeight + 10;
    }

    private getMetricFillColor(tone: CardPreviewContextMetric['tone']): number {
        switch (tone) {
            case 'positive':
                return 0x10251a;
            case 'warning':
                return 0x271b0b;
            case 'danger':
                return 0x2a1318;
            default:
                return blendBattleColor(sceneTheme.colors.panelInner, sceneTheme.colors.ink, 0.18);
        }
    }

    private getMetricBorderColor(tone: CardPreviewContextMetric['tone']): number {
        switch (tone) {
            case 'positive':
                return sceneTheme.colors.jadeBright;
            case 'warning':
                return sceneTheme.colors.gold;
            case 'danger':
                return sceneTheme.colors.emberBright;
            default:
                return sceneTheme.colors.slate;
        }
    }

    private getMetricTextColor(tone: CardPreviewContextMetric['tone']): string {
        switch (tone) {
            case 'positive':
                return '#dcfce7';
            case 'warning':
                return '#f6e2b1';
            case 'danger':
                return '#f3d0c3';
            default:
                return battleTheme.colors.textPrimary;
        }
    }

    private emitVisibilityChange(visible: boolean, contextId: string | null = null): void {
        this.scene.events.emit('cardPreviewVisibilityChanged', {
            visible,
            contextId,
        });
    }
}
