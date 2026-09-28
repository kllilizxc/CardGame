import type { StoryCondition, StoryState } from '../../types/story';

export interface StoryProgressDisplayState {
    chapter?: string;
    location?: string;
    sublocation?: string;
    timeHint?: string;
}

export function createStorySceneSubtitleCopy(): string {
    return '做出选择，看看这段际遇会如何展开。';
}

export function createStorySceneTerminalCopy(): string {
    return '这段故事暂告一段落。若想尝试其他走向，可以重新开始。';
}

export function createStorySceneStatusLabel(stateLine: string): string {
    return `当前进度：${stateLine}`;
}

export function createStoryStateLine(view: StoryProgressDisplayState): string {
    const locationParts = [view.location, view.sublocation].filter((part): part is string => Boolean(part));

    if (locationParts.length > 0) {
        const timeSuffix = view.timeHint ? `（${view.timeHint}）` : '';

        return `身在${locationParts.join(' · ')}${timeSuffix}`;
    }

    if (view.chapter) {
        return `行至${view.chapter}`;
    }

    return '故事仍在继续';
}

export function describeStructuredConditionForPlayer(condition: StoryCondition, storyState: StoryState): string {
    switch (condition.kind) {
        case 'attribute':
            return `${condition.attribute} ${storyState.attributes[condition.attribute] ?? 0} ${normalizeOperatorForCopy(condition.operator)} ${condition.value}`;
        case 'flag':
            return condition.expected === false
                ? '尚未触发相关前情'
                : '先完成相关铺垫';
        case 'visitedNode':
            return condition.expected === false
                ? '尚未经历相关前情'
                : '先经历相关前情';
        case 'triggeredDialogue':
            return condition.expected === false
                ? '尚未听过相关消息'
                : '先听过相关消息';
        case 'all':
            return condition.conditions.length > 0
                ? `需要同时满足以下条件：${condition.conditions.map((item) => describeStructuredConditionForPlayer(item, storyState)).join('；')}`
                : '需要满足若干前置条件';
        case 'any':
            return condition.conditions.length > 0
                ? `需要满足以下任一条件：${condition.conditions.map((item) => describeStructuredConditionForPlayer(item, storyState)).join('；')}`
                : '需要满足至少一项前置条件';
        case 'not':
            return `需要避开以下情况：${describeStructuredConditionForPlayer(condition.condition, storyState)}`;
        default:
            return '需要满足相关剧情条件';
    }
}

function normalizeOperatorForCopy(operator: string): string {
    switch (operator) {
        case '>=':
            return '≥';
        case '<=':
            return '≤';
        case '==':
        case '=':
        case '＝':
            return '=';
        default:
            return operator;
    }
}
