import { describe, expect, it } from 'bun:test';

import {
    createStorySceneStatusLabel,
    createStorySceneSubtitleCopy,
    createStorySceneTerminalCopy,
    createStoryStateLine,
    describeStructuredConditionForPlayer,
} from './storyPlayerFacingCopy';

describe('storyPlayerFacingCopy', () => {
    it('keeps StoryScene frame copy free from internal filenames and state terms', () => {
        const visibleCopy = [
            createStorySceneSubtitleCopy(),
            createStorySceneStatusLabel(createStoryStateLine({
                location: '青云宗山门',
                sublocation: '山门广场',
                timeHint: '白日',
            })),
            createStorySceneTerminalCopy(),
        ].join(' ');

        expect(visibleCopy).toContain('当前进度');
        expect(visibleCopy).not.toContain('StoryState');
        expect(visibleCopy).not.toContain('storyGraphFile');
        expect(visibleCopy).not.toContain('story-graph.json');
    });

    it('renders player-facing progress text from readable story labels', () => {
        expect(createStoryStateLine({
            location: '青云宗山门',
            sublocation: '山门广场',
            timeHint: '白日',
        })).toBe('身在青云宗山门 · 山门广场（白日）');
        expect(createStoryStateLine({
            chapter: '第一章·入宗',
        })).toBe('行至第一章·入宗');
    });

    it('summarizes structured conditions without leaking flag, dialogueId, or nodeId values', () => {
        const storyState = {
            storyId: 'story.test',
            currentLocationId: 'location.test',
            currentSublocationId: 'sublocation.test',
            currentNodeId: 'start',
            visitedNodeIds: ['start'],
            triggeredDialogueIds: [],
            flags: {},
            attributes: { 心性: 45 },
            relations: {},
        };

        expect(describeStructuredConditionForPlayer({
            kind: 'flag',
            flag: 'story.test.hidden_flag',
        }, storyState)).toBe('先完成相关铺垫');
        expect(describeStructuredConditionForPlayer({
            kind: 'triggeredDialogue',
            dialogueId: 'dialogue.hidden_intro',
        }, storyState)).toBe('先听过相关消息');
        expect(describeStructuredConditionForPlayer({
            kind: 'visitedNode',
            nodeId: 'story_hidden_node',
        }, storyState)).toBe('先经历相关前情');
    });
});
