import { expect, test } from 'bun:test';
import { parseQuestCatalog, questJournalEntries, wrapQuestJournalText } from './QuestJournal';

const quest = {
    id: 'quest.heal-fox', title: '救助狐爷爷', summary: '找到救治方法。', actorIds: ['npc.fox'],
    stages: [
        { id: 'available', status: 'available', label: '线索已现', objective: '和狐爷爷交谈。' },
        { id: 'gather', status: 'active', label: '寻找药材', objective: '到雾林采药。' },
        { id: 'completed', status: 'completed', label: '已救治', objective: '狐爷爷已经脱险。' },
    ],
};

test('quest journal follows saved quest stages and exposes the current player objective', () => {
    const catalog = parseQuestCatalog({ schemaVersion: 1, quests: [quest] });
    expect(questJournalEntries(catalog, {})).toEqual([]);
    expect(questJournalEntries(catalog, { 'quest.heal-fox': 'gather' })).toEqual([{
        questId: 'quest.heal-fox', stageId: 'gather', title: '救助狐爷爷', summary: '找到救治方法。',
        status: 'active', stageLabel: '寻找药材', objective: '到雾林采药。',
    }]);
    expect(questJournalEntries(catalog, { 'quest.heal-fox': 'completed' })[0]).toMatchObject({
        status: 'completed', objective: '狐爷爷已经脱险。',
    });
});

test('quest catalog rejects duplicate stages and a changed save is shown as an error', () => {
    expect(() => parseQuestCatalog({ schemaVersion: 1, quests: [{ ...quest, stages: [quest.stages[0], quest.stages[0]] }] }))
        .toThrow('任务阶段无效');
    const catalog = parseQuestCatalog({ schemaVersion: 1, quests: [quest] });
    expect(questJournalEntries(catalog, { 'quest.heal-fox': 'removed' })[0]).toMatchObject({
        status: 'unknown', title: '任务资料已变更',
    });
});

test('Chinese objectives wrap inside the narrow task journal', () => {
    expect(wrapQuestJournalText('在山门附近寻找药草，再带回药亭。')).toBe('在山门附近寻找药草，\n再带回药亭。');
});
