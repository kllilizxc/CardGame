import { describe, expect, it } from 'bun:test';

import {
    CardPreviewSession,
    DEFAULT_CARD_PREVIEW_CONTEXT,
    DEFAULT_CARD_PREVIEW_SOURCE,
    DEFAULT_CARD_PREVIEW_TITLE,
    type PreviewCardData,
} from './cardPreviewProtocol';

const sampleCard = {
    id: 'unit.test-preview',
    kind: 'unit',
    name: '测试卡牌',
} as PreviewCardData;

describe('CardPreviewSession', () => {
    it('applies shared defaults when a preview request omits metadata', () => {
        const session = new CardPreviewSession();
        const preview = session.open({ cardData: sampleCard });

        expect(preview).toEqual({
            contextId: DEFAULT_CARD_PREVIEW_CONTEXT,
            sourceLabel: DEFAULT_CARD_PREVIEW_SOURCE,
            title: DEFAULT_CARD_PREVIEW_TITLE,
            cardData: sampleCard,
        });
        expect(session.getActive()).toEqual(preview);
    });

    it('replaces the active preview and only clears when the owning context closes', () => {
        const session = new CardPreviewSession();

        session.open({
            cardData: sampleCard,
            contextId: 'card-list',
            sourceLabel: '卡组浏览',
        });
        const replacement = session.open({
            cardData: sampleCard,
            contextId: 'battle-log',
            sourceLabel: '战斗日志',
            title: '日志预览',
        });

        expect(session.clearContext('card-list')).toBeNull();
        expect(session.getActive()).toEqual(replacement);
        expect(session.clearContext('battle-log')).toEqual(replacement);
        expect(session.getActive()).toBeNull();
    });
});
