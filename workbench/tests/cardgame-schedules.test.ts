import { expect, test } from 'bun:test';
import { cardgameSchedules } from '../plugins/cardgame-content/schedules';
import { parseRule } from '../src/service-helpers';

const notes = { knowledge:'kb', cards:'cards', assets:'assets', production:'production', todo:'todo-note', execution:'execution-note', preview:'preview' };

test('CardGame schedules are finite, stable and target the execution note', () => {
  const schedules = cardgameSchedules(notes, 'cardgame');
  expect(schedules).toHaveLength(1);
  expect(new Set(schedules.map(s=>s.id)).size).toBe(schedules.length);
  const inspection = schedules[0]!;
  expect(inspection.id).toBe('cardgame:inspection');
  expect(inspection.name).toBe('卡牌内容巡检');
  expect(inspection.noteId).toBe('execution-note');
  expect(parseRule(inspection.rule, 'Asia/Shanghai')).toEqual({ every: 'day', at: '07:43', timeZone: 'Asia/Shanghai' });
});

test('inspection prompt interpolates project and todo note, covers all finding kinds', () => {
  const [inspection] = cardgameSchedules(notes, 'cardgame');
  expect(inspection!.prompt).toContain('cardgame');
  expect(inspection!.prompt).toContain('todo-note');
  expect(inspection!.prompt).not.toContain('execution-note');
  for (const kind of ['broken-link','scene-dead-end','orphan-asset','card-missing-art','asset-missing-metadata']) {
    expect(inspection!.prompt).toContain(kind);
  }
  expect(inspection!.prompt).toContain('createTodo');
  expect(inspection!.prompt).toContain('巡检');
});
