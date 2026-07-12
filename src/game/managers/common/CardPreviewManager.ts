import type { Scene } from 'phaser';

import type { BaseCardSprite } from '../../objects/BaseCardSprite';
import { CardSpriteFactory } from '../../factories/CardSpriteFactory';
import { battleTheme, blendBattleColor } from '../../ui/battle/battleTheme';
import { getSceneTextStyle, sceneTheme } from '../../scenes/shared/sceneTheme';
import {
    CardPreviewSession,
    DEFAULT_CARD_PREVIEW_TITLE,
    type ActiveCardPreview,
    type CardPreviewMetadata,
    type PreviewCardData,
} from './cardPreviewProtocol';

interface CardPreviewDisplayRequest extends CardPreviewMetadata {
    card?: BaseCardSprite;
    cardData?: PreviewCardData;
}

export class CardPreviewManager {
    private readonly scene: Scene;
    private readonly session = new CardPreviewSession();
    private host!: Phaser.GameObjects.Container;
    private cardLayer!: Phaser.GameObjects.Container;
    private titleText!: Phaser.GameObjects.Text;
    private sourceText!: Phaser.GameObjects.Text;
    private previewCard: BaseCardSprite | null = null;
    private previewWidth = 0;
    private previewHeight = 0;
    private escHandler?: () => void;
    private isDestroyed = false;

    constructor(scene: Scene) {
        this.scene = scene;
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

        this.destroyPreviewCard();
        this.host.destroy();
    }

    private show(request: CardPreviewDisplayRequest): void {
        if (this.isDestroyed) {
            return;
        }

        const cardData = request.cardData ?? (request.card?.getCardData() as PreviewCardData | undefined);
        if (!cardData) {
            return;
        }

        const activePreview = this.session.open({
            cardData,
            contextId: request.contextId,
            sourceLabel: request.sourceLabel,
            title: request.title,
        });

        this.render(activePreview);
    }

    private render(activePreview: ActiveCardPreview): void {
        this.scene.tweens.killTweensOf(this.host);
        this.scene.tweens.killTweensOf(this.cardLayer);

        this.titleText.setText(activePreview.title);
        this.sourceText.setText(`来源：${activePreview.sourceLabel}`);

        if (!this.replacePreviewCard(activePreview.cardData)) {
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
    }

    private hide(immediate: boolean = false): void {
        if (immediate || !this.host.visible) {
            this.scene.tweens.killTweensOf(this.host);
            this.scene.tweens.killTweensOf(this.cardLayer);
            this.host.setAlpha(0);
            this.host.setVisible(false);
            this.destroyPreviewCard();
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
                this.destroyPreviewCard();
            },
        });
    }

    private replacePreviewCard(cardData: PreviewCardData): boolean {
        this.destroyPreviewCard();

        const previewCard = CardSpriteFactory.createSprite(this.scene, cardData, 0, 26, 1);
        if (!previewCard) {
            return false;
        }

        const availableHeight = this.previewHeight - 192;
        const previewScale = Math.min(1.32, Math.max(1, availableHeight / 260));

        previewCard.setDisplayMode('hover');
        previewCard.disableDragging();
        previewCard.disableInteractive();
        previewCard.setScale(previewScale);

        this.cardLayer.add(previewCard);
        this.previewCard = previewCard;

        return true;
    }

    private destroyPreviewCard(): void {
        if (!this.previewCard) {
            return;
        }

        this.previewCard.destroy();
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
        const previewX = layout?.cardPreview?.x ?? this.scene.scale.width * 0.15;
        const previewY = layout?.cardPreview?.y ?? this.scene.scale.height * 0.5;

        this.previewWidth = Math.min(layout?.cardPreview?.width ?? 392, 420);
        this.previewHeight = Math.min(layout?.cardPreview?.height ?? 520, 560);

        this.host = this.scene.add.container(previewX, previewY);
        this.host.setDepth((layout?.depth?.cardPreview ?? 6100));
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
        ]);
    }

    private registerCloseBehavior(): void {
        this.escHandler = () => {
            this.clear();
        };
        this.scene.input.keyboard?.on('keydown-ESC', this.escHandler);
    }
}
