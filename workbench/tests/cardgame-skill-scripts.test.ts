import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { SkillConnectionScriptRunner } from '../src/skill-connection-script';

const base = resolve(import.meta.dirname, '../templates/skill-connections');
const runner = new SkillConnectionScriptRunner();

test('Todo delegation and progress use the same item and exact task receipt', async () => {
  const item = { projectId: 'p', id: 'todo-1', title: '修复', requirementRevision: 2, revision: 4, status: 'todo' };
  const calls: Array<{ method: string; input: any }> = [];
  const host = { call: async (method: string, input: any) => {
    calls.push({ method, input });
    if (method === 'describe') return [
      { noteId: 'todo', codeVersion: 't1', capabilities: { queries: ['todo'], actions: ['bindExecution', 'feedback'], events: ['cardgame.todo.delegationRequested'] } },
      { noteId: 'desk', codeVersion: 'd1', capabilities: { queries: ['task', 'progress'], actions: ['acceptRequirement'], events: ['tasks.changed'] } },
    ];
    if (method === 'bindingList') return [];
    if (method === 'bindingLink') return { duplicate: false };
    if (method === 'query' && input.name === 'todo') return { item };
    if (method === 'query' && input.name === 'task') return { id: 'task-1', source: { noteId: 'todo', itemId: 'todo-1', value: { projectId: 'p' } }, status: 'done' };
    if (method === 'query' && input.name === 'progress') return { delegationId: 'task-1', status: 'done', conclusion: '已验证' };
    if (method === 'action' && input.name === 'acceptRequirement') return { delegationId: 'task-1', status: 'running' };
    if (method === 'action' && input.name === 'bindExecution') return { todo: item };
    if (method === 'action' && input.name === 'feedback') return { item: { ...item, status: 'done' } };
    throw Error('unexpected ' + method + ' ' + (input.name ?? ''));
  } } as any;
  const directory = resolve(base, 'cardgame-todo-desk');
  const delegated = await runner.run({ directory, path: 'scripts/delegate.ts',
    event: { id: 'event-1', noteId: 'todo', name: 'cardgame.todo.delegationRequested',
      payload: { projectId: 'p', todoId: 'todo-1', requestId: 'repair-1', requirementRevision: 2,
        payload: { goal: '修复', scope: ['仅此任务'] } } }, host });
  expect(delegated.result.outcome).toBe('completed');
  const accepted = calls.find(call => call.input.name === 'acceptRequirement')!.input.input;
  expect(accepted.source).toMatchObject({ noteId: 'todo', objectId: 'todo-1', revision: '2' });
  expect(accepted.updateId).toBe('repair-1');
  const bound = calls.find(call => call.input.name === 'bindExecution')!.input.input;
  expect(bound.receipt.result.delegationId).toBe('task-1');
  expect(bound.receipt.result.deskNoteId).toBe('desk');
  const progressed = await runner.run({ directory, path: 'scripts/progress.ts',
    event: { id: 'event-2', noteId: 'desk', name: 'tasks.changed', payload: { delegationId: 'task-1' } }, host });
  expect(progressed.result.outcome).toBe('completed');
  expect(calls.findLast(call => call.input.name === 'feedback')!.input.input).toMatchObject({
    projectId: 'p', itemId: 'todo-1', status: 'done', requirementRevision: 2,
  });
}, 20_000);

test('linked resource Todo does not create a second execution task', async () => {
  const called: string[] = [];
  const host = { call: async (method: string, input: any) => {
    called.push(method);
    if (method === 'describe') return [
      { noteId: 'todo', codeVersion: 't1', capabilities: { queries: ['todo'], actions: ['bindExecution'], events: [] } },
      { noteId: 'desk', codeVersion: 'd1', capabilities: { queries: ['task'], actions: ['acceptRequirement'], events: [] } },
    ];
    if (method === 'query' && input.name === 'todo') return { item: {
      projectId: 'p', id: 'todo-1', title: '素材', requirementRevision: 2, productionId: 'production-1',
    } };
    throw Error('unexpected ' + method);
  } } as any;
  const result = await runner.run({ directory: resolve(base, 'cardgame-todo-desk'), path: 'scripts/delegate.ts',
    event: { id: 'event-linked', noteId: 'todo', name: 'cardgame.todo.delegationRequested',
      payload: { projectId: 'p', todoId: 'todo-1', requestId: 'repair-linked', requirementRevision: 2,
        payload: { goal: '生成素材' } } }, host });
  expect(result.result.outcome).toBe('agent');
  expect(called).toEqual(['describe', 'query']);
}, 20_000);

test('Todo creates one production draft and binds its returned identity', async () => {
  const calls: Array<{ method: string; input: any }> = [];
  const host = { call: async (method: string, input: any) => {
    calls.push({ method, input });
    if (method === 'describe') return [
      { noteId: 'todo', codeVersion: 't1', capabilities: { queries: ['todo'], actions: [], events: ['cardgame.todo.productionRequested'] } },
      { noteId: 'production', codeVersion: 'p1', capabilities: { queries: ['production'], actions: ['upsertRequest', 'bindTodo'], events: [] } },
    ];
    if (method === 'query') return { item: { projectId: 'p', id: 'todo-1', title: '素材', revision: 1 } };
    if (method === 'action' && input.name === 'upsertRequest') return { production: { id: 'production-1' } };
    if (method === 'action' && input.name === 'bindTodo') return { todo: { id: 'todo-1', productionId: 'production-1' } };
    if (method === 'bindingLink') return { duplicate: false };
    throw Error('unexpected ' + method);
  } } as any;
  const result = await runner.run({ directory: resolve(base, 'cardgame-todo-production'), path: 'scripts/create.ts',
    event: { id: 'event-3', noteId: 'todo', name: 'cardgame.todo.productionRequested',
      payload: { projectId: 'p', todoId: 'todo-1', brief: '制作素材' } }, host });
  expect(result.result.outcome).toBe('completed');
  expect(calls.filter(call => call.method === 'action').map(call => call.input.name)).toEqual(['upsertRequest', 'bindTodo']);
  expect(calls.find(call => call.input.name === 'bindTodo')!.input.input.productionId).toBe('production-1');
  expect(calls.find(call => call.method === 'bindingLink')!.input.target.objectId).toBe('production-1');
}, 20_000);

test('production generation binds the original round, while result handling stays evidence gated', async () => {
  const calls: Array<{ method: string; input: any }> = [];
  const production = { projectId: 'p', id: 'production-1', rounds: [{ round: 3, requestId: 'generate-3', requirementRevision: 2, dispatchRevision: 7 }] };
  const host = { call: async (method: string, input: any) => {
    calls.push({ method, input });
    if (method === 'describe') return [
      { noteId: 'production', codeVersion: 'p1', capabilities: { queries: ['production'], actions: ['bindExecution', 'receiveResult'], events: ['cardgame.production.generationRequested'] } },
      { noteId: 'desk', codeVersion: 'd1', capabilities: { queries: ['task'], actions: ['acceptRequirement'], events: ['tasks.changed'] } },
    ];
    if (method === 'query' && input.name === 'production') return { production };
    if (method === 'query' && input.name === 'task') return { id: 'task-1', status: 'done', source: { noteId: 'production', itemId: 'production-1' } };
    if (method === 'action' && input.name === 'acceptRequirement') return { delegationId: 'task-1', status: 'running' };
    if (method === 'action' && input.name === 'bindExecution') return { production };
    if (method === 'bindingLink') return { duplicate: false };
    throw Error('unexpected ' + method);
  } } as any;
  const directory = resolve(base, 'cardgame-production-desk');
  const generated = await runner.run({ directory, path: 'scripts/generate.ts',
    event: { id: 'event-4', noteId: 'production', name: 'cardgame.production.generationRequested',
      payload: { projectId: 'p', productionId: 'production-1', requestId: 'generate-3', round: 3,
        submit: { goal: '生成背景', requirement: { requirementRevision: 2 }, scope: ['仅此轮次'] } } }, host });
  expect(generated.result.outcome).toBe('completed');
  expect(calls.find(call => call.input.name === 'acceptRequirement')!.input.input.source.revision).toBe('7');
  expect(calls.find(call => call.input.name === 'bindExecution')!.input.input.receipt.result.delegationId).toBe('task-1');
  const result = await runner.run({ directory, path: 'scripts/result.ts',
    event: { id: 'event-5', noteId: 'desk', name: 'tasks.changed', payload: { delegationId: 'task-1' } }, host });
  expect(result.result.outcome).toBe('agent');
  expect(calls.filter(call => call.input.name === 'receiveResult')).toHaveLength(0);
}, 20_000);
