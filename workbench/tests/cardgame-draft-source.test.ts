import { expect, test } from 'bun:test';
import { createRuntimeHost } from '../src/runtime/host-adapter';
import { verifiedCardDraftSource } from '../plugins/cardgame-content/src/registration';
import type { NoteRuntimeCapabilities } from '../src/runtime/host-adapter';
import { NOTE_RUNTIME_SCOPE } from '../src/application/capabilities';
import type { Caller } from '../src/application/contracts';

test('note extension calls retain trusted native caller and user approval identity', async () => {
  const calls: Caller[] = [];
  const app = { [NOTE_RUNTIME_SCOPE]: true, core: {}, extensions: { invoke: async (_extension: string, _method: string, _input: unknown, caller: Caller) => { calls.push(caller); } } } as unknown as NoteRuntimeCapabilities;
  const host = createRuntimeHost(app);
  for (const kind of ['agent', 'user', 'schedule', 'iframe', 'setup'] as const) {
    await host.extensions!.request('cardgame-content', 'setCardDrafts', { _draftOrigin: 'agent', _draftSource: { sessionId: 'forged' } },
      { access: { noteId: 'n', version: 'v', caller: { kind, sessionId: 'registered-native' } } });
  }
  expect(calls.map(call => call.kind)).toEqual(['agent', 'user', 'schedule', 'action', 'action']);
  expect(calls[0]).toMatchObject({ noteId: 'n', sessionId: 'registered-native' });
});

test('AI source requires registered native session metadata; unavailable or mismatched sources stay unknown', async () => {
  const caller: Caller = { kind: 'agent', noteId: 'n', sessionId: 'registered-native' };
  const calls: unknown[] = [];
  const app = (metadata: unknown) => ({ dispatch: async (method: string, input: unknown) => { calls.push({ method, input }); return metadata; } }) as Pick<NoteRuntimeCapabilities, 'dispatch'>;
  expect(await verifiedCardDraftSource(app({ id: caller.sessionId, noteId: 'n', hasMessages: true }), caller))
    .toEqual({ _draftOrigin: 'agent', _draftSource: { kind: 'native-session', noteId: 'n', sessionId: caller.sessionId! } });
  expect(calls[0]).toEqual({ method: 'session.get', input: { sessionId: caller.sessionId, noteId: 'n' } });
  for (const metadata of [{ id: 'forged', noteId: 'n', hasMessages: true }, { id: caller.sessionId, noteId: 'other', hasMessages: true }, { id: caller.sessionId, noteId: 'n', hasMessages: false }]) {
    expect((await verifiedCardDraftSource(app(metadata), caller))._draftOrigin).toBe('unknown');
  }
  expect((await verifiedCardDraftSource(app({ id: caller.sessionId, noteId: 'n', hasMessages: true }), { ...caller, kind: 'action' }))._draftOrigin).toBe('unknown');
  expect((await verifiedCardDraftSource(app({}), { ...caller, sessionId: undefined }))._draftOrigin).toBe('unknown');
  expect((await verifiedCardDraftSource({ dispatch: async () => { throw Error('session unavailable'); } } as Pick<NoteRuntimeCapabilities, 'dispatch'>, caller))._draftOrigin).toBe('unknown');
  expect(await verifiedCardDraftSource(app({}), { kind: 'user' })).toEqual({ _draftOrigin: 'user' });
});
