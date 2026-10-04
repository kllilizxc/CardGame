import { button, flush, mount } from '../web/dom-test-helpers';
import { expect, mock, test } from 'bun:test';
import { RuntimeProvider, type WidgetProps } from '../../sdk/react/src';
import { getStoreCache } from '../../sdk/react/src/store-cache';
import type { Runtime } from '@dsh-workbench/runtime';
import LibraryView from '../../templates/cardgame-library/view';
import TodoView from '../../templates/cardgame-todo/view';
import ProductionView from '../../templates/cardgame-production/view';

const link = (kind: string, id?: string, extra: Record<string, unknown> = {}) => `cg:${encodeURIComponent(JSON.stringify({ projectId: 'project', kind, id, ...extra }))}`;
const cards = [{ id: 'a', name: 'Card A', kind: 'unit', rarity: 'common' }, { id: 'b', name: 'Card B', kind: 'unit', rarity: 'rare' }];
const todos = [{ id: 'a', title: 'Todo A', status: 'todo', category: 'one', revision: 1 }, { id: 'b', title: 'Todo B', status: 'todo', category: 'two', revision: 1 }];
const productions = [{ id: 'a', projectId: 'project', brief: 'Production A', status: 'draft', revision: 1 }, { id: 'b', projectId: 'project', brief: 'Production B', status: 'draft', revision: 1 }];

function fixture(config: Record<string, unknown> = {}) {
  const requests: Array<{ name: string; input: any }> = [];
  const updates: any[] = [];
  const read = ({ name, input }: { name: string; input: any }): any => {
    if (name === 'cards') return { items: cards, total: cards.length };
    if (name === 'card') return { ...cards.find(item => item.id === input.id), revision: 'r1', raw: { id: input.id, name: `Card ${input.id}` } };
    if (name === 'todos') return { items: todos };
    if (name === 'todo') return { item: todos.find(item => item.id === input.id) };
    if (name === 'workflowStatus') return { counts: { todos: 2, todo: 2, inProgress: 0, done: 0, blocked: 0 } };
    if (name === 'productions') return { items: productions };
    if (name === 'production') return { production: productions.find(item => item.id === input.productionId) };
    if (name === 'documentMeta') return { path: input.path, size: 20, isScene: false };
    if (name === 'document') return { id: input.path, path: input.path, title: input.path, content: `# ${input.path}`, revision: 'r1' };
    if (name === 'assets') return { items: [] };
    return { items: [] };
  };
  const runtime = {
    note: { id: 'test', name: 'CardGame' },
    resources: { subscribe: async (request: { name: string; input: any }, listener: (snapshot: any) => void) => {
      requests.push(request);
      if (request.name !== 'state') listener({ key: JSON.stringify(request), epoch: 'test', version: 1, stale: false, data: read(request) });
      return () => {};
    } },
    openNote: async () => {},
  } as unknown as Runtime;
  getStoreCache(runtime).ingest('test:config', { revision: 'config', value: { projectId: 'project', ...config } });
  const props = { data: {}, metadata: { name: 'CardGame' }, mode: 'compact', runtime, layout: { width: 900, maxHeight: 700 }, updateData: async (patch: unknown) => { updates.push(patch); return { revision: 'r1' }; } } as WidgetProps<any>;
  return { runtime, props, requests, updates };
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await flush(() => {
    input.focus();
    const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
  });
}

test('card library retains its nested draft and search DOM across modes, and handles later focus safely', async () => {
  const f = fixture({ mode: 'cards' });
  const render = (mode: 'compact' | 'expanded', focus?: string) => <RuntimeProvider runtime={f.runtime}><LibraryView {...f.props} mode={mode} focus={focus} /></RuntimeProvider>;
  const view = await mount(render('compact'));
  const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
  const confirm = mock(() => false);
  Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
  try {
    expect(view.container.querySelector('.cl-workspace')).toBeNull();
    await view.rerender(render('expanded', link('card', 'a')));
    const draft = view.container.querySelector<HTMLTextAreaElement>('[aria-label="卡牌原始 JSON"]')!;
    const search = view.container.querySelector<HTMLInputElement>('[aria-label="搜索卡牌"] input') ?? view.container.querySelector<HTMLInputElement>('input[type="search"]')!;
    expect(draft).not.toBeNull(); expect(search).not.toBeNull();
    await type(draft, '{"name":"unsaved"}');
    await type(search, 'unsubmitted filter');
    expect(view.container.querySelector('.cg-warning')?.textContent).toBe('未保存');
    for (const mode of ['compact', 'expanded', 'compact', 'expanded'] as const) {
      await view.rerender(render(mode, link('card', 'a')));
      expect(view.container.querySelector('[aria-label="卡牌原始 JSON"]')).toBe(draft);
      expect(draft.value).toBe('{"name":"unsaved"}');
      expect(search.value).toBe('unsubmitted filter');
      expect(draft.closest('[hidden]') !== null).toBe(mode === 'compact');
    }
    await view.rerender(render('expanded', link('card', 'b')));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(draft.value).toBe('{"name":"unsaved"}');
    await view.rerender(render('compact', link('card', 'b')));
    await view.rerender(render('expanded', link('card', 'b')));
    expect(confirm).toHaveBeenCalledTimes(1);
    await view.rerender(render('expanded'));
    confirm.mockReturnValue(true);
    await view.rerender(render('expanded', link('card', 'b')));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(f.updates.at(-1)?.views.cardsSelection).toEqual(['b']);
    expect(draft.value).toContain('Card b');
  } finally { if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm); else delete (window as any).confirm; await view.unmount(); }
});

test('todo board preserves nested edits and only replaces draft intent after confirmation', async () => {
  const f = fixture();
  const render = (mode: 'compact' | 'expanded', focus?: string) => <RuntimeProvider runtime={f.runtime}><TodoView {...f.props} mode={mode} focus={focus} /></RuntimeProvider>;
  const view = await mount(render('expanded'));
  const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
  const confirm = mock(() => false);
  Object.defineProperty(window, 'confirm', { configurable: true, value: confirm });
  try {
    await flush(() => view.container.querySelector('[aria-label="编辑待办：Todo A"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const title = view.container.querySelector<HTMLTextAreaElement>('[aria-label="待办标题"]')!;
    await type(title, 'unfinished requirement');
    await view.rerender(render('compact'));
    expect(title.isConnected).toBe(true);
    await view.rerender(render('expanded'));
    expect(view.container.querySelector('[aria-label="待办标题"]')).toBe(title);
    expect(title.value).toBe('unfinished requirement');
    const first = link('todo', undefined, { intent: 'draft', context: { title: 'First feedback' } });
    const second = link('todo', undefined, { intent: 'draft', context: { title: 'Second feedback' } });
    await view.rerender(render('expanded', first));
    const input = view.container.querySelector<HTMLInputElement>('input[placeholder="输入任务描述或粘贴图片，按 Enter 添加…"]')!;
    expect(input.value).toBe('First feedback');
    await type(input, 'edited feedback');
    await view.rerender(render('compact', first));
    await view.rerender(render('expanded', first));
    expect(input.value).toBe('edited feedback');
    expect(confirm).not.toHaveBeenCalled();
    await view.rerender(render('expanded', second));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('edited feedback');
    await view.rerender(render('expanded'));
    confirm.mockReturnValue(true);
    await view.rerender(render('expanded', second));
    expect(input.value).toBe('Second feedback');
    expect(title.value).toBe('unfinished requirement');
  } finally { if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm); else delete (window as any).confirm; await view.unmount(); }
});

test('production keeps workflow creation draft and details DOM while accepting new live focus', async () => {
  const f = fixture();
  const render = (mode: 'compact' | 'expanded', focus?: string) => <RuntimeProvider runtime={f.runtime}><ProductionView {...f.props} mode={mode} focus={focus} /></RuntimeProvider>;
  const view = await mount(render('compact'));
  try {
    expect(view.container.querySelector('.cw-create')).toBeNull();
    await view.rerender(render('expanded', link('production', 'a')));
    const input = view.container.querySelector<HTMLInputElement>('.cw-create input')!;
    const details = view.container.querySelector<HTMLDetailsElement>('.cw-companion')!;
    await type(input, 'unfinished card workflow');
    details.open = true;
    for (const mode of ['compact', 'expanded', 'compact', 'expanded'] as const) {
      await view.rerender(render(mode, link('production', 'a')));
      expect(view.container.querySelector('.cw-create input')).toBe(input);
      expect(input.value).toBe('unfinished card workflow');
      expect(details.open).toBe(true);
    }
    await view.rerender(render('expanded', link('production', 'b')));
    expect(view.container.querySelector('.cg-detail h2')?.textContent).toBe('Production B');
    await view.rerender(render('expanded'));
    expect(view.container.querySelector('.cg-detail h2')?.textContent).toBe('Production B');
    expect(input.value).toBe('unfinished card workflow');
  } finally { await view.unmount(); }
});

test('knowledge reader handles successive focus requests without resetting its history on mode changes', async () => {
  const f = fixture({ mode: 'knowledge' });
  const render = (mode: 'compact' | 'expanded', focus?: string) => <RuntimeProvider runtime={f.runtime}><LibraryView {...f.props} mode={mode} focus={focus} /></RuntimeProvider>;
  const view = await mount(render('expanded', link('document', 'a', { path: 'a.md' })));
  try {
    await view.rerender(render('expanded', link('document', 'b', { path: 'b.md' })));
    expect(f.updates.at(-1)?.views.knowledgeSelection.path).toBe('b.md');
    const reader = view.container.querySelector('.reference-reader');
    expect(reader).not.toBeNull();
    await view.rerender(render('compact'));
    await view.rerender(render('expanded'));
    expect(view.container.querySelector('.reference-reader')).toBe(reader);
    expect(f.updates.at(-1)?.views.knowledgeSelection.path).toBe('b.md');
    expect(button(view.container, '← 返回').disabled).toBe(false);
    await flush(() => button(view.container, '← 返回').click());
    expect(f.updates.at(-1)?.views.knowledgeSelection.path).toBe('a.md');
    await view.rerender(render('expanded', link('document', 'a', { path: 'a.md' })));
    expect(f.updates.at(-1)?.views.knowledgeSelection.path).toBe('a.md');
  } finally { await view.unmount(); }
});

test('retained card dialogs and keyboard navigation are inactive in compact mode', async () => {
  const f = fixture({ mode: 'cards' });
  const render = (mode: 'compact' | 'expanded') => <RuntimeProvider runtime={f.runtime}><LibraryView {...f.props} mode={mode} /></RuntimeProvider>;
  const view = await mount(render('expanded'));
  try {
    await flush(() => button(view.container, '筛选卡牌').click());
    const dialog = view.container.querySelector('dialog')!;
    const kind = dialog.querySelector('select')!;
    await flush(() => { kind.value = 'unit'; kind.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(dialog.open).toBe(true);
    await view.rerender(render('compact'));
    expect(dialog.open).toBe(false);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await flush(() => document.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(false);
    await view.rerender(render('expanded'));
    expect(view.container.querySelector('dialog')).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(kind.value).toBe('unit');
  } finally { await view.unmount(); }
});

test('asset library retains an unsubmitted filter and accepts focus updates without recreating it', async () => {
  const f = fixture({ mode: 'assets' });
  const render = (mode: 'compact' | 'expanded', focus?: string) => <RuntimeProvider runtime={f.runtime}><LibraryView {...f.props} mode={mode} focus={focus} /></RuntimeProvider>;
  const view = await mount(render('expanded'));
  try {
    await flush(() => button(view.container, '筛选').click());
    const input = view.container.querySelector<HTMLInputElement>('input[placeholder="sprite / audio"]')!;
    await type(input, 'sprite');
    await view.rerender(render('compact'));
    await view.rerender(render('expanded'));
    expect(view.container.querySelector('input[placeholder="sprite / audio"]')).toBe(input);
    expect(input.value).toBe('sprite');
    await view.rerender(render('expanded', link('asset', 'a')));
    expect(f.updates.at(-1)?.views.assetsSelection).toBe('a');
    await view.rerender(render('expanded', link('asset', 'b')));
    expect(f.updates.at(-1)?.views.assetsSelection).toBe('b');
    await view.rerender(render('expanded'));
    expect(f.updates.at(-1)?.views.assetsSelection).toBe('b');
    expect(input.value).toBe('sprite');
  } finally { await view.unmount(); }
});

test('production retains its nested workflow draft close guard while compact', async () => {
  const parentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
  const contextDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__DSH_WORKBENCH_CONTEXT__');
  const messages: any[] = [];
  Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage: (value: unknown) => messages.push(value) } });
  Object.defineProperty(globalThis, '__DSH_WORKBENCH_CONTEXT__', { configurable: true, value: { token: 'cardgame', parentOrigin: 'http://localhost:4280' } });
  const f = fixture();
  const render = (mode: 'compact' | 'expanded') => <RuntimeProvider runtime={f.runtime}><ProductionView {...f.props} mode={mode} /></RuntimeProvider>;
  const view = await mount(render('expanded'));
  try {
    await type(view.container.querySelector<HTMLInputElement>('.cw-create input')!, 'unfinished workflow');
    const guard = () => messages.filter(message => message.method === 'ui.unsavedChanges').at(-1)?.params;
    expect(guard()).toEqual({ dirty: true, saving: false });
    const afterEditing = messages.length;
    await view.rerender(render('compact'));
    expect(guard()).toEqual({ dirty: true, saving: false });
    await view.rerender(render('expanded'));
    expect(guard()).toEqual({ dirty: true, saving: false });
    expect(messages.slice(afterEditing).some(message => message.method === 'ui.unsavedChanges' && !message.params.dirty)).toBe(false);
  } finally {
    await view.unmount();
    if (parentDescriptor) Object.defineProperty(window, 'parent', parentDescriptor); else delete (window as any).parent;
    if (contextDescriptor) Object.defineProperty(globalThis, '__DSH_WORKBENCH_CONTEXT__', contextDescriptor); else delete (globalThis as any).__DSH_WORKBENCH_CONTEXT__;
  }
});
