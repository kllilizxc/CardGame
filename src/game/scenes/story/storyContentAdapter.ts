import {
    validateStoryContentGraph,
    type StoryContentGraph,
    type StoryCondition as LegacyCondition,
    type StoryEffect as LegacyEffect,
} from '../../types/storyContent';
import type { StoryCondition, StoryEffect } from '../../types/story';
import { validatePlayableStoryGraph, type StoryGraph } from './storyFlow';

const tagFlag = (tag: string): string => `player.tag:${tag}`;

function condition(value: LegacyCondition): StoryCondition {
    switch (value.op) {
        case 'always':
            return { kind: 'always' };
        case 'hasFlag':
            return { kind: 'flag', flag: value.flag };
        case 'missingFlag':
            return { kind: 'flag', flag: value.flag, expected: false };
        case 'attributeAtLeast':
            return { kind: 'attribute', attribute: value.path.slice('player.attributes.'.length), operator: '>=', value: value.value };
        case 'tagPresent':
            return { kind: 'flag', flag: tagFlag(value.tag) };
        case 'tagMissing':
            return { kind: 'flag', flag: tagFlag(value.tag), expected: false };
        case 'all':
        case 'any':
            return { kind: value.op, conditions: value.conditions.map(condition) };
        case 'not':
            return { kind: 'not', condition: condition(value.condition) };
    }
}

function effect(value: LegacyEffect): StoryEffect {
    switch (value.op) {
        case 'setFlag':
            return { kind: 'setFlag', flag: value.flag };
        case 'clearFlag':
            return { kind: 'clearFlag', flag: value.flag };
        case 'adjustAttribute':
            return { kind: 'adjustAttribute', attribute: value.path.slice('player.attributes.'.length), delta: value.amount };
        case 'addTag':
            return { kind: 'setFlag', flag: tagFlag(value.tag) };
        case 'removeTag':
            return { kind: 'clearFlag', flag: tagFlag(value.tag) };
        case 'adjustRelation':
            return { kind: 'adjustRelation', relationId: value.npcId, delta: value.amount };
        case 'setLocation':
            return { kind: 'setLocationLabel', location: value.location };
        case 'startExpedition':
            throw new Error(`Story content effect startExpedition (${value.expeditionId}) needs an explicit playable scene target.`);
    }
}

export function adaptStoryContentGraph(raw: unknown): StoryGraph {
    const legacy: StoryContentGraph = validateStoryContentGraph(raw);
    const entry = legacy.nodes.find((node) => node.id === legacy.entryNodeId)!;
    const nodes = legacy.nodes.map((node) => {
        if (node.type !== 'story') {
            throw new Error(`Story content node ${node.id} has unsupported playable type ${node.type}.`);
        }
        return {
            id: node.id,
            type: 'story',
            title: node.title,
            summary: node.summary,
            detail: node.body,
            tags: node.tags,
            chapter: node.chapter,
            location: node.location,
            sublocation: node.location,
            locationId: node.location,
            sublocationId: 'story.content',
            timeHint: node.timeHint,
            onEnter: node.onEnter.map(effect),
            ...(node.aiHints ? { aiHints: node.aiHints } : {}),
        };
    });
    const choices = legacy.choices.map((choice) => ({
        id: choice.id,
        from: choice.from,
        to: choice.to,
        text: choice.text,
        description: choice.description,
        ...(choice.visibleWhen ? { visibleWhen: condition(choice.visibleWhen) } : {}),
        ...(choice.enabledWhen ? { enabledWhen: condition(choice.enabledWhen) } : {}),
        effects: choice.effects.map(effect),
        flags: choice.flags,
    }));
    return validatePlayableStoryGraph({
        storyId: legacy.id,
        title: legacy.title,
        entryNodeId: legacy.entryNodeId,
        initialState: { locationId: entry.location, sublocationId: 'story.content' },
        nodes,
        choices,
    });
}

export function validateStoryGraphResource(raw: unknown): StoryGraph {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const graph = raw as Record<string, unknown>;
        if (graph.schemaVersion === 1 && typeof graph.id === 'string') return adaptStoryContentGraph(raw);
    }
    return validatePlayableStoryGraph(raw);
}
