import type { ArtifactCard } from '@data/types/cards/artifact';
import type { FieldCard } from '@data/types/cards/field';
import type { PillCard } from '@data/types/cards/pill';
import type { TalismanCard } from '@data/types/cards/talisman';
import type { UnitCard } from '@data/types/cards/unit';

export type PreviewCardData = UnitCard | ArtifactCard | TalismanCard | FieldCard | PillCard;

export interface CardPreviewMetadata {
    contextId?: string;
    sourceLabel?: string;
    title?: string;
}

export interface CardPreviewRequest extends CardPreviewMetadata {
    cardData: PreviewCardData;
}

export interface ActiveCardPreview {
    contextId: string;
    sourceLabel: string;
    title: string;
    cardData: PreviewCardData;
}

export const DEFAULT_CARD_PREVIEW_CONTEXT = 'battle-scene';
export const DEFAULT_CARD_PREVIEW_SOURCE = '战场卡牌';
export const DEFAULT_CARD_PREVIEW_TITLE = '卡牌预览';

export class CardPreviewSession {
    private activePreview: ActiveCardPreview | null = null;

    public open(request: CardPreviewRequest): ActiveCardPreview {
        const nextPreview: ActiveCardPreview = {
            contextId: request.contextId ?? DEFAULT_CARD_PREVIEW_CONTEXT,
            sourceLabel: request.sourceLabel ?? DEFAULT_CARD_PREVIEW_SOURCE,
            title: request.title ?? DEFAULT_CARD_PREVIEW_TITLE,
            cardData: request.cardData,
        };

        this.activePreview = nextPreview;

        return nextPreview;
    }

    public getActive(): ActiveCardPreview | null {
        return this.activePreview;
    }

    public clear(): ActiveCardPreview | null {
        const previousPreview = this.activePreview;
        this.activePreview = null;

        return previousPreview;
    }

    public clearContext(contextId: string): ActiveCardPreview | null {
        if (this.activePreview?.contextId !== contextId) {
            return null;
        }

        return this.clear();
    }
}
