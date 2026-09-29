import { describe, expect, it } from 'bun:test';

import graphJson from '../../../../public/data/story/qa-fog-fox.json';
import { goToStoryNode } from '../../state/StoryState';
import { validatePlayableStoryGraph } from './storyFlow';
import { createInitialStoryRuntime, createStoryChoiceTransition, createStoryFlowViewModel } from './storyFlowViewModel';

const graph = validatePlayableStoryGraph(graphJson);

function playChapterTwo(shareWithGuard: boolean, takeLongRoute = false) {
    let storyState = goToStoryNode(createInitialStoryRuntime(graph), 'scene.qa-fog.healed');
    const choices = [
        'choice.qa-fog.healed.chapter2',
        'choice.qa-fog.ch2.invitation.ledger',
        'choice.qa-fog.ch2.ledger.gate',
        shareWithGuard ? 'choice.qa-fog.ch2.gate.share' : 'choice.qa-fog.ch2.gate.hold',
        `choice.qa-fog.ch2.${shareWithGuard ? 'share' : 'hold'}.clearing`,
        'choice.qa-fog.ch2.clearing.bell',
        ...(takeLongRoute ? [
            'choice.qa-fog.ch2.bell.upstream',
            'choice.qa-fog.ch2.upstream.stonehouse',
            'choice.qa-fog.ch2.stonehouse.witness',
            'choice.qa-fog.ch2.witness.route',
            'choice.qa-fog.ch2.route.record',
            'choice.qa-fog.ch2.record.rainwalk',
            'choice.qa-fog.ch2.rainwalk.return',
        ] : ['choice.qa-fog.ch2.bell.return']),
        'choice.qa-fog.ch2.return.chapter3',
    ];
    for (const id of choices) {
        const transition = createStoryChoiceTransition(createStoryFlowViewModel(graph, { storyState }), id);
        if (transition.status !== 'selected') throw new Error(`Chapter two choice was blocked: ${id}`);
        storyState = transition.nextStoryState;
    }
    return storyState;
}

describe('fog story chapter two', () => {
    it('keeps the existing third chapter shortcut and has distinct stable dialogue lines', () => {
        const healed = graph.choices.filter(choice => choice.from === 'scene.qa-fog.healed');
        expect(healed.find(choice => choice.id === 'choice.qa-fog.healed.chapter3')?.to).toBe('scene.qa-fog.chapter3');
        expect(healed.find(choice => choice.id === 'choice.qa-fog.healed.chapter2')?.to).toBe('scene.qa-fog.ch2.invitation');
        const chapter = graph.nodes.filter(node => node.chapter === '第二章');
        const lineIds = chapter.flatMap(node => node.dialogues?.map(line => line.id) ?? []);
        expect(chapter).toHaveLength(14);
        expect(lineIds).toHaveLength(504);
        expect(new Set(lineIds).size).toBe(lineIds.length);
    });

    it('carries the bridge clue into chapter three on both routes, with the guard informed only when chosen', () => {
        const shared = playChapterTwo(true);
        const held = playChapterTwo(false);
        for (const state of [shared, held]) {
            expect(state.currentNodeId).toBe('scene.qa-fog.chapter3');
            expect(state.knowledge?.player).toContain('qa-fog.blue-thread');
            expect(createStoryFlowViewModel(graph, { storyState: state }).choices
                .find(choice => choice.id === 'choice.qa-fog.chapter3.blue-thread')?.visible).toBe(true);
            expect(state.settledEventIds?.filter(id => id === 'event.qa-fog.ch2.read-page')).toHaveLength(1);
        }
        expect(shared.flags['qa-fog.ch2.shared-ledger']).toBe(true);
        expect(shared.knowledge?.['npc.qa-fog-guard']).toContain('qa-fog.ch2.ledger-clue');
        expect(held.flags['qa-fog.ch2.held-ledger']).toBe(true);
        expect(held.knowledge?.['npc.qa-fog-guard'] ?? []).not.toContain('qa-fog.ch2.ledger-clue');
        expect(held.relations['npc.qa-fog-fox']).toBe((shared.relations['npc.qa-fog-fox'] ?? 0) + 5);

        const sharedChoices = createStoryFlowViewModel(graph, { storyState: shared }).choices;
        const heldChoices = createStoryFlowViewModel(graph, { storyState: held }).choices;
        expect(sharedChoices.find(choice => choice.id === 'choice.qa-fog.chapter3.guard-copy')?.visible).toBe(true);
        expect(sharedChoices.find(choice => choice.id === 'choice.qa-fog.chapter3.kept-page')?.visible).toBe(false);
        expect(heldChoices.find(choice => choice.id === 'choice.qa-fog.chapter3.guard-copy')?.visible).toBe(false);
        expect(heldChoices.find(choice => choice.id === 'choice.qa-fog.chapter3.kept-page')?.visible).toBe(true);
        const sharedFollowUp = createStoryChoiceTransition(
            createStoryFlowViewModel(graph, { storyState: shared }),
            'choice.qa-fog.chapter3.guard-copy',
        );
        const heldFollowUp = createStoryChoiceTransition(
            createStoryFlowViewModel(graph, { storyState: held }),
            'choice.qa-fog.chapter3.kept-page',
        );
        expect(sharedFollowUp.status).toBe('selected');
        expect(heldFollowUp.status).toBe('selected');
        if (sharedFollowUp.status !== 'selected' || heldFollowUp.status !== 'selected') return;
        expect(sharedFollowUp.nextStoryState.flags['qa-fog.ch3.guard-patrol']).toBe(true);
        expect(heldFollowUp.nextStoryState.flags['qa-fog.ch3.fox-map']).toBe(true);
    });

    it('lets the longer investigation return safely and opens its own later route', () => {
        const short = playChapterTwo(false);
        const long = playChapterTwo(false, true);
        expect(short.currentNodeId).toBe('scene.qa-fog.chapter3');
        expect(long.currentNodeId).toBe('scene.qa-fog.chapter3');
        expect(short.knowledge?.player ?? []).not.toContain('qa-fog.ch2.reed-route');
        expect(long.knowledge?.player).toContain('qa-fog.ch2.reed-route');
        expect(long.flags['qa-fog.ch2.met-courier']).toBe(true);
        expect(long.settledEventIds?.filter(id => id === 'event.qa-fog.ch2.reed-route')).toHaveLength(1);
        const shortRoute = createStoryFlowViewModel(graph, { storyState: short }).choices
            .find(choice => choice.id === 'choice.qa-fog.chapter3.reed-route');
        const longRoute = createStoryFlowViewModel(graph, { storyState: long }).choices
            .find(choice => choice.id === 'choice.qa-fog.chapter3.reed-route');
        expect(shortRoute?.visible).toBe(false);
        expect(longRoute?.visible).toBe(true);
        const next = createStoryChoiceTransition(createStoryFlowViewModel(graph, { storyState: long }), longRoute!.id);
        if (next.status !== 'selected') throw new Error('Long route chapter three follow-up is blocked');
        expect(next.nextStoryState.currentNodeId).toBe('scene.qa-fog.ch3.reed-route');
        expect(next.nextStoryState.flags['qa-fog.ch3.reed-route']).toBe(true);
    });
});
