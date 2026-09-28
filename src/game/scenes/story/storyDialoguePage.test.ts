import { describe, expect, it } from 'bun:test';

import { storyDialoguePage } from './storyDialoguePage';

describe('story dialogue reading', () => {
    it('advances a long scene without losing or repeating a line', () => {
        const dialogues = Array.from({ length: 750 }, (_, index) => ({
            id: `line.chapter.${index + 1}`,
            text: `第 ${index + 1} 条对白`,
        }));
        const read: string[] = [];
        let nextId: string | undefined;
        let pageCount = 0;
        do {
            const page = storyDialoguePage(dialogues, nextId);
            read.push(...page.lines.map(line => line.id));
            nextId = page.nextDialogueId;
            pageCount += 1;
        } while (nextId);

        expect(read).toEqual(dialogues.map(line => line.id));
        expect(pageCount).toBe(250);
    });

    it('resumes at the same stable line after preceding dialogue is inserted', () => {
        const original = [
            { id: 'line.first', text: '开头' },
            { id: 'line.saved', text: '从这里继续' },
            { id: 'line.last', text: '结尾' },
        ];
        const revised = [original[0]!, { id: 'line.inserted', text: '补写的对白' }, ...original.slice(1)];
        expect(storyDialoguePage(revised, 'line.saved').lines.map(line => line.id))
            .toEqual(['line.saved', 'line.last']);
    });

    it('shows a long line alone and returns to the opening if a saved line was removed', () => {
        const dialogues = [
            { id: 'line.long', text: '很长'.repeat(100) },
            { id: 'line.next', text: '下一句' },
        ];
        const first = storyDialoguePage(dialogues, 'line.removed');
        expect(first.lines.map(line => line.id)).toEqual(['line.long']);
        expect(first.nextDialogueId).toBe('line.next');
        expect(storyDialoguePage(dialogues, first.nextDialogueId).lines.map(line => line.id))
            .toEqual(['line.next']);
    });
});
