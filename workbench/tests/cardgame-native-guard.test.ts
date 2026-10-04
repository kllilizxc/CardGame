import { expect, test } from 'bun:test';
import { cardgameNativeWriteDenial } from '../plugins/cardgame-content/src/native-guard';

test('CardGame content conversations cannot edit their registered project through native file tools', async () => {
  const sessions: Record<string, any> = {
    card: { noteId: 'cards' },
    execution: { noteId: 'execution' },
    child: { parentSessionId: 'card' },
    unrelated: { noteId: 'plain' },
  };
  const notes: Record<string, any> = { cards: { actions: ['createCardWorkflow'] }, execution: { actions: ['submit'] }, plain: { actions: [] } };
  const configs: Record<string, any> = { cards: { projectId: 'cardgame', mode: 'cards' }, execution: { projectId: 'cardgame', catalogRef: { kind: 'execution' } }, plain: { projectId: 'other' } };
  const core = {
    getSession: async (id: string) => sessions[id] ? { value: sessions[id] } : undefined,
    getNote: async (id: string) => notes[id] ? { value: notes[id] } : undefined,
    readRecord: async (_table: string, key: string) => ({ value: configs[key.split(':')[0]!] }),
  } as any;
  for (const tool of ['Bash', 'edit', 'write', 'apply_patch', 'exec_command']) {
    expect(await cardgameNativeWriteDenial(core, 'card', tool)).toContain('独立候选');
  }
  expect(await cardgameNativeWriteDenial(core, 'child', 'Bash')).toContain('独立候选');
  expect(await cardgameNativeWriteDenial(core, 'execution', 'Bash')).toContain('独立候选');
  expect(await cardgameNativeWriteDenial(core, 'new-child', 'Bash', 'card')).toContain('独立候选');
  expect(await cardgameNativeWriteDenial(core, 'card', 'read')).toBeUndefined();
  expect(await cardgameNativeWriteDenial(core, 'card', 'workbench')).toBeUndefined();
  expect(await cardgameNativeWriteDenial(core, 'unrelated', 'Bash')).toBeUndefined();
});
