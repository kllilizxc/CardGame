import { describe, expect, test } from 'bun:test';
import { describeCapabilities } from '@dsh-workbench/runtime';
import * as library from '../templates/cardgame-library/actions';
import * as production from '../templates/cardgame-production/actions';
import * as todo from '../templates/cardgame-todo/actions';

const modules = { 'cardgame-library': library, 'cardgame-production': production, 'cardgame-todo': todo };

function publicNames(contract: ReturnType<typeof describeCapabilities>, kind: 'actions' | 'queries' | 'events') {
  return contract[kind].filter(item => item.visibility !== 'private').map(item => item.name);
}

describe('CardGame executable capability contracts', () => {
  test('describe every callable with serializable schemas and preserve the public surface', async () => {
    const contracts = Object.fromEntries(Object.entries(modules).map(([name, module]) => [name, describeCapabilities(module)]));
    expect(publicNames(contracts['cardgame-library']!, 'actions')).toEqual(['adoptVersion', 'registerCandidates']);
    expect(publicNames(contracts['cardgame-library']!, 'queries')).toEqual(['asset', 'assets', 'card', 'document', 'versions']);
    expect(publicNames(contracts['cardgame-production']!, 'actions')).toEqual(['adoptAsset', 'bindExecution', 'bindTodo', 'generate', 'receiveResult', 'recordAdoption', 'recordCandidates', 'registerCandidates', 'upsertRequest']);
    expect(publicNames(contracts['cardgame-production']!, 'queries')).toEqual(['production', 'productions']);
    expect(publicNames(contracts['cardgame-todo']!, 'actions')).toEqual(['bindExecution', 'delegateTodo', 'feedback', 'productionRequest']);
    expect(publicNames(contracts['cardgame-todo']!, 'queries')).toEqual(['todo', 'todos']);
    for (const [name, module] of Object.entries(modules)) {
      const contract = contracts[name]!;
      expect(contract.actions.map(item => item.name)).toEqual(Object.keys(module).filter(key => typeof module[key as keyof typeof module] === 'function').sort());
      expect(contract.queries.map(item => item.name)).toEqual(Object.keys(module.queries).sort());
      for (const item of [...contract.actions, ...contract.queries]) {
        expect(item.inputSchema).toBeDefined();
        expect(item.outputSchema).toBeDefined();
      }
      const manifest = await Bun.file(new URL(`../templates/${name}/worka-note.json`, import.meta.url)).json();
      expect(manifest.capabilities).toBeUndefined();
    }
    expect(contracts['cardgame-production']!.queries.find(item => item.name === 'production')).toMatchObject({
      description: '按项目和制作单 ID 读取当前要求、轮次及回执。', objectRef: '/production/id', revision: '/production/revision',
    });
    expect(contracts['cardgame-todo']!.queries.find(item => item.name === 'todo')).toMatchObject({ objectRef: '/item/id', revision: '/item/requirementRevision' });
    expect(contracts['cardgame-production']!.events.find(item => item.name === 'cardgame.production.generationRequested')).toMatchObject({ objectRef: '/productionId', revision: '/round' });
    expect(contracts['cardgame-todo']!.events.find(item => item.name === 'cardgame.todo.delegationRequested')).toMatchObject({ objectRef: '/todoId', revision: '/requirementRevision' });
    expect(contracts['cardgame-todo']!.actions.find(item => item.name === 'todoFeedback')?.visibility).toBe('private');
  });

  test('invalid input is rejected before a connector or event is called', async () => {
    let requests = 0;
    const ctx = { extensions: { request: async () => { requests++; } }, events: { publish: async () => { requests++; } } } as any;
    await expect((async () => todo.createTodo({ projectId: 'p' } as any, ctx))()).rejects.toThrow();
    expect(() => production.events.generationRequested.publish(ctx, { projectId: 'p', productionId: 'prod', requestId: 'r', round: 'one', submit: {} } as any)).toThrow();
    expect(requests).toBe(0);
  });

  test('invalid connector output stays an ambiguous post-execution failure', async () => {
    let requests = 0;
    const ctx = { note: { id: 'library' }, store: { read: async () => ({ value: { projectId: 'p' } }) }, extensions: { request: async () => { requests++; return { accepted: true }; } } } as any;
    await expect(library.saveDocument({ content: '# Draft', path: 'draft.md' }, ctx)).rejects.toThrow('after execution');
    expect(requests).toBe(1);
  });

  test('the move preview preserves the backend source document and graph edge metadata', async () => {
    const source = { id: 'doc', title: 'Draft', path: 'draft.md', revision: 'v1', content: '# Draft' };
    const data = { source, toPath: 'moved.md', affected: [], conflicts: [], canApply: true };
    const ctx = { note: { id: 'library' }, store: { read: async () => ({ value: { projectId: 'p' } }) }, resources: { read: async () => ({ data }) } as any } as any;
    expect(await library.queries.movePreview({ path: 'draft.md', toPath: 'moved.md' }, ctx)).toEqual(data);
    const graph = { nodes: [], edges: [{ sourceId: 'doc', targetPath: 'target.md', kind: 'document', anchor: 'start' }] };
    ctx.resources.read = async () => ({ data: graph });
    expect(await library.queries.graph(undefined, ctx)).toEqual(graph);
  });
});
