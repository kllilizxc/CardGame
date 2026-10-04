import { cardgameSelectionLines } from './context';
import { cardgameNativeWriteDenial } from './native-guard';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkaExtensionHost } from '../../../src/host';
import type { Caller } from '../../../src/application/contracts';
import type { MediaCapabilities } from '../../../src/media-capabilities';
import type { ResourceValue } from '../../../src/resources/types';
import { createContentService } from './content';
import { createWorkflowService, type GameCandidateRecord, type WorkflowStoreStatus } from './workflow';
import { assertDeckWriteAccess } from './deck-plan';
import { createCardPipeline, CARD_PIPELINE_COMMANDS } from './card-pipeline';
import { createCodexImageGenerator } from './codex-imagegen';
import { candidateCardKind, createGameCandidateService } from './game-candidates';
import { createGameAdoptionService } from './game-adoption';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { ContentCommandMethod } from './types';

/** Source comes from host-owned access and the registered native session, never command input. */
export async function verifiedCardDraftSource(app: Pick<WorkaExtensionHost['app'], 'dispatch'>, caller: Caller): Promise<{ _draftOrigin: 'agent' | 'user' | 'unknown'; _draftSource?: { kind: 'native-session'; noteId: string; sessionId: string } }> {
  if (caller.kind === 'user') return { _draftOrigin: 'user' };
  if (caller.kind !== 'agent' || !caller.noteId || !caller.sessionId) return { _draftOrigin: 'unknown' };
  try {
    const session = await app.dispatch('session.get', { sessionId: caller.sessionId, noteId: caller.noteId }, caller) as { id?: string; noteId?: string; hasMessages?: boolean };
    if (session.id === caller.sessionId && session.noteId === caller.noteId && session.hasMessages === true) {
      return { _draftOrigin: 'agent', _draftSource: { kind: 'native-session', noteId: caller.noteId, sessionId: caller.sessionId } };
    }
  } catch { /* Keep the source unverified when a native session cannot be checked. */ }
  return { _draftOrigin: 'unknown' };
}

export interface CardgameProject { id: string; root: string; title?: string; cardFaceFont?: { file: string; family: string } }
const workflowQueries = new Set(['todos', 'todo', 'productions', 'production', 'workflowStatus', 'gameCandidates']);
const contentCommands = new Set(['saveDocument', 'moveDocument', 'updateCard', 'updateAsset', 'registerCandidates', 'adoptVersion', 'compileStory']);
const formalMutations = new Set(['saveDocument', 'moveDocument', 'updateCard', 'updateAsset', 'adoptVersion', 'compileStory', 'adoptAsset']);
const internalWorkflowCommands = new Set(['recordGameCandidate', 'recordGameAdoption']);

export function requiredGamePreviewChecks(candidate: Pick<GameCandidateRecord, 'kind' | 'deckArtFingerprints' | 'shopTargets' | 'recipeIds' | 'itemUseIds' | 'questIds' | 'copyPaths' | 'portraitPaths' | 'itemIconPaths'>, cardKind?: string): string[] {
  if (candidate.kind === 'deck') return ['game-shell', 'content-catalog', 'deck-definition', 'deck-composition', ...(candidate.deckArtFingerprints ? ['deck-art'] : [])];
  if (candidate.kind === 'documents') return ['game-shell', 'content-catalog', 'knowledge-documents'];
  if (candidate.kind === 'story') return ['game-shell', 'content-catalog', 'story-resource', 'story-route',
    ...(candidate.shopTargets?.length ? ['story-shops'] : []),
    ...(candidate.recipeIds?.length ? ['story-recipes'] : []),
    ...(candidate.itemUseIds?.length || candidate.itemIconPaths?.length ? ['story-items'] : []),
    ...(candidate.questIds?.length ? ['story-quests'] : []),
    ...(candidate.copyPaths?.length ? ['story-copy'] : []),
    ...(candidate.portraitPaths?.length ? ['story-portraits'] : []),
    ...(candidate.itemIconPaths?.length ? ['story-item-icons'] : [])];
  return ['game-shell', 'content-catalog', 'card-definition', 'card-themes',
    cardKind === 'pill' || cardKind === 'skill' ? 'playable-loadout' : 'playable-deck'];
}

/** Roots are explicitly registered in local host configuration, never supplied by a note. */
export async function readCardgameProjects(dataRoot: string): Promise<CardgameProject[]> {
  let source: unknown;
  try { source = JSON.parse(await readFile(resolve(dataRoot, 'cardgame-projects.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const entries = Array.isArray(source) ? source : (source as { projects?: unknown })?.projects;
  if (!Array.isArray(entries)) throw Error('cardgame-projects.json needs a projects array');
  const ids = new Set<string>();
  return entries.map(value => {
    if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value.id) || typeof value.root !== 'string' || !value.root.trim() || ids.has(value.id)) throw Error('Invalid or duplicate CardGame project');
    ids.add(value.id);
    return { id: value.id, root: resolve(value.root), ...(typeof value.title === 'string' ? { title: value.title } : {}), ...(typeof value.cardFaceFont?.file === 'string' && typeof value.cardFaceFont?.family === 'string' ? { cardFaceFont: { file: resolve(value.cardFaceFont.file), family: value.cardFaceFont.family } } : {}) };
  });
}

export function candidatePreviewOptions(candidate: GameCandidateRecord) {
  const cardKind = candidate.kind === 'story' || candidate.kind === 'documents' || candidate.kind === 'deck' ? undefined : candidateCardKind(candidate);
  return { projectId: candidate.projectId, ...(candidate.kind !== 'documents' ? { cardId: candidate.cardId } : {}), candidateHash: candidate.candidateHash,
    ...(cardKind && cardKind !== 'unit' ? { cardKind } : {}),
    ...(candidate.kind === 'deck' ? { candidateKind: 'deck', deckPath: candidate.deckPath, deckCardIds: candidate.deckCardIds, placeholderCardIds: candidate.placeholderCardIds, ...(candidate.deckArtFingerprints ? { deckArtFingerprints: candidate.deckArtFingerprints } : {}) } : {}),
    ...(candidate.kind === 'documents' ? { candidateKind: 'documents', documentRevisions: candidate.dependencies } : {}),
    ...(candidate.kind === 'story' ? { storyId: candidate.targetId,
      ...(candidate.entryHubId && candidate.entryActionId ? { entryHubId: candidate.entryHubId, entryActionId: candidate.entryActionId } : {}),
      ...(candidate.shopTargets?.length ? { shopTargets: candidate.shopTargets } : {}),
      ...(candidate.recipeIds?.length ? { recipeIds: candidate.recipeIds } : {}),
      ...(candidate.itemUseIds?.length ? { itemUseIds: candidate.itemUseIds } : {}),
      ...(candidate.questIds?.length ? { questIds: candidate.questIds } : {}),
      ...(candidate.copyPaths?.length ? { copyPaths: candidate.copyPaths } : {}),
      ...(candidate.portraitPaths?.length ? { portraitPaths: candidate.portraitPaths } : {}),
      ...(candidate.itemIconPaths?.length ? { itemIconPaths: candidate.itemIconPaths } : {}) } : {}) };
}

export async function registerCardgameContent(host: WorkaExtensionHost, media: Pick<MediaCapabilities, 'register' | 'issue'>, packageRoot = resolve(import.meta.dirname, '../../..')) {
  const projects = await readCardgameProjects(host.dataRoot);
  const options = { dataRoot: resolve(host.dataRoot, 'plugins/cardgame-content'), projects };
  const content = await createContentService(options);
  // Storage degradation is reported on the host notification timeline; a
  // healthy open resolves the same key so a recovered store clears its alarm.
  let storeNotice: Promise<unknown> = Promise.resolve();
  const onStoreStatus = (event: WorkflowStoreStatus) => {
    const core = host.app.core;
    const key = 'cardgame-workflow-store';
    storeNotice = storeNotice.then(async () => {
      if (event.kind === 'sqlite-ready') {
        const notice = await core.getNotification(key);
        if (notice && !notice.value.resolved) await core.resolveNotification(key);
        return;
      }
      console.error(`[cardgame-content] ${event.message}`, event.kind === 'sqlite-open-failed' ? event.cause : '');
      const body = event.kind === 'sqlite-open-failed' ? `${event.message}\n${String(event.cause)}` : event.message;
      const notice = await core.getNotification(key);
      if (!notice || notice.value.resolved || notice.value.body !== body) await core.upsertNotification({ key, kind: 'failed', attention: 'action', title: 'CardGame 工作流存储异常', summary: event.message, body });
    }).catch(() => {});
  };
  const workflows = await Promise.resolve().then(() => createWorkflowService({ ...options, onStoreStatus })).catch(async error => { await content.close(); throw error; });
  const previewNote = async (candidate: GameCandidateRecord) => {
    const registry = JSON.parse(await readFile(resolve(host.dataRoot, 'cardgame-workbench.json'), 'utf8')) as { projectId?: string; notes?: { preview?: string } };
    if (registry.projectId !== candidate.projectId || !registry.notes?.preview) throw Error('当前项目没有登记原有试玩便笺');
    const noteId = registry.notes.preview;
    const config = await host.app.core.readRecord<any>('states', `${noteId}:config`);
    if (config?.value?.projectId !== candidate.projectId) throw Error('试玩便笺绑定了另一项目');
    return noteId;
  };
  const registerPreview = async (candidate: GameCandidateRecord) => {
    const noteId = await previewNote(candidate);
    return host.app.requireEngine().invoke(noteId, 'receive', {
      key: candidate.id, title: candidate.kind === 'deck' ? `牌组 ${candidate.targetId}` : candidate.kind === 'story' ? `剧情 ${candidate.targetId}` : candidate.kind === 'documents' ? `资料 ${candidate.targetId}` : `卡牌 ${candidate.cardId}`, featureId: candidate.featureId,
      adapter: join(candidate.repo, 'knowledge/tools/preview/preview.config.mjs'),
      repos: { game: { repo: candidate.repo, commit: candidate.commit } },
      options: candidatePreviewOptions(candidate), start: true,
    }, { kind: 'action', noteId });
  };
  const gameCandidates = createGameCandidateService({ ...options, content, workflow: workflows, registerPreview, deckPreviewAdapter: resolve(packageRoot, 'plugins/cardgame-content/preview/preview.config.mjs') });
  const previewEvidence = async (candidate: GameCandidateRecord) => {
    const noteId = await previewNote(candidate);
    const note = await host.app.note(noteId);
    const state = await host.app.core.readRecord<any>('states', note.value.stateRef);
    const entry = state?.value?.candidates?.find((item: any) => item.key === candidate.id);
    const expectedAdapter = join(candidate.repo, 'knowledge/tools/preview/preview.config.mjs');
    const expectedRepos = { game: { repo: candidate.repo, commit: candidate.commit } };
    const cardKind = candidate.kind === 'story' || candidate.kind === 'documents' || candidate.kind === 'deck' ? undefined : candidateCardKind(candidate);
    const expectedOptions = candidatePreviewOptions(candidate);
    if (entry?.adapter !== expectedAdapter || !isDeepStrictEqual(entry.repos, expectedRepos)
      || !isDeepStrictEqual(entry.options, expectedOptions)) throw Error('请先在试玩便笺完成这个确切候选的运行与验证');
    // The note stores JSON properties in its own order. Match their values,
    // then bind the proof to the exact stored request that the preview ran.
    const fingerprint = createHash('sha256').update(JSON.stringify({ adapter: entry.adapter, repos: entry.repos, options: entry.options })).digest('hex').slice(0, 16);
    const status = entry.status?.web;
    if (status?.phase !== 'ready' || status.source !== fingerprint || status.verified?.ok !== true) throw Error('请先在试玩便笺完成这个确切候选的运行与验证');
    const passed = new Set((status.verified.checks ?? []).filter((check: any) => check.ok).map((check: any) => check.name));
    const required = requiredGamePreviewChecks(candidate, cardKind);
    if (!required.every(name => passed.has(name))) throw Error('游戏候选的验证项目不完整');
  };
  const gameAdoptions = createGameAdoptionService({ ...options, workflow: workflows, previewEvidence });
  try { await gameAdoptions.recover(); }
  catch (error) { await Promise.allSettled([gameAdoptions.close(), gameCandidates.close(), content.close(), workflows.close()]); throw error; }
  const pipeline = createCardPipeline(content, workflows, Object.fromEntries(projects.filter(project => project.cardFaceFont).map(project => [project.id, project.cardFaceFont!])), gameCandidates, { imageGenerator: createCodexImageGenerator() });
  const projectIds = new Set(projects.map(project => project.id));
  const featureProgressNote = async (noteId?: string) => {
    if (!noteId) return false;
    const note = await host.app.note(noteId);
    return Boolean(note.value.actions?.includes('confirmGameCandidate') && note.value.actions?.includes('undoGameCandidate'));
  };
  const assertProject = async (input: Record<string, unknown>, noteId?: string, featureProgress = false) => {
    if (typeof input.projectId !== 'string' || !projectIds.has(input.projectId)) throw Error('项目尚未登记，请配置 cardgame-projects.json 后重启宿主');
    if (noteId) {
      const config = await host.app.core.readRecord<any>('states', `${noteId}:config`);
      if (config?.value?.projectId !== input.projectId && !(featureProgress && await featureProgressNote(noteId))) throw Error('便笺尚未绑定这个项目');
    }
  };
  let removeMedia: () => void = () => {};
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    const failures: unknown[] = [];
    try { removeMedia(); } catch (error) { failures.push(error); }
    // Drain dependants before closing their stores; one failing close cannot
    // skip another owner or leak its watchers/database handles.
    for (const phase of [[() => pipeline.close()], [() => gameCandidates.close(), () => gameAdoptions.close()], [() => content.close(), () => workflows.close()]]) {
      const results = await Promise.allSettled(phase.map(dispose => Promise.resolve().then(dispose)));
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    }
    if (failures.length) throw new AggregateError(failures, 'CardGame content shutdown failed');
  })();
  try {
    removeMedia = media.register('cardgame-content', async input => {
      await assertProject(input);
      const file = await content.resolveMedia(input as any);
      return { ...file, path: file.absolutePath ?? file.path };
    });
    return await host.register('cardgame-content', {
      beforeNativeTool: input => cardgameNativeWriteDenial(host.app.core, input.sessionId, input.name, input.parentSessionId),
      noteContext: note => cardgameSelectionLines(host, note),
      resources: { query: {
        version: '1',
        async load(value, context) {
          const input = value as Record<string, unknown>;
          if (input.op === 'featureCandidates') {
            if (!await featureProgressNote(context.scope.noteId)) throw Error('只有功能进展可读取游戏候选');
            const groups = await Promise.all(projects.map(async project => workflows.query({ projectId: project.id, op: 'gameCandidates' }) as Promise<{ items: GameCandidateRecord[] }>));
            const items = groups.flatMap(group => group.items);
            return { items: await Promise.all(items.map(async candidate => {
              const { repo: _repo, dependencies: _dependencies, ...publicCandidate } = candidate;
              const previewVerified = await previewEvidence(candidate).then(() => true, () => false);
              return { ...publicCandidate, previewVerified };
            })) } as ResourceValue;
          }
          await assertProject(input, context.scope.noteId);
          if (input.op === 'cardBatch' || input.op === 'cardFaceThemes') return JSON.parse(JSON.stringify(await pipeline.query(input))) as ResourceValue;
          if (input.op === 'media' && input.variant !== 'waveform') {
            const file = await content.resolveMedia(input as any);
            const { path: _path, absolutePath: _absolutePath, ...metadata } = file;
            return { ...metadata, url: media.issue('cardgame-content', input) } as ResourceValue;
          }
          if (workflowQueries.has(String(input.op))) {
            return await workflows.query(input, { execution: async binding => {
              if (!binding.deskNoteId || !binding.delegationId) return null;
              await assertProject(input, binding.deskNoteId);
              const desk = await host.app.note(binding.deskNoteId);
              const task = await host.app.core.readProjected<any, any>('states', desk.value.stateRef, state => {
                const item = state?.delegations?.[binding.delegationId!];
                return item ? { id: item.id, status: item.status, updatedAt: item.updatedAt, outcome: item.outcome ?? null, delivery: item.delivery ?? null } : null;
              });
              return task?.value ?? null;
            } }) as ResourceValue;
          }
          return await content.query(input as any) as ResourceValue;
        },
        subscribe(input, invalidate) {
          const store = workflowQueries.has(String((input as any).op)) || (input as any).op === 'cardBatch' || (input as any).op === 'featureCandidates' ? workflows : content;
          return store.subscribe(() => invalidate());
        },
      } },
      async invoke(method, input, caller) {
        await assertProject(input, caller.noteId, method === 'confirmGameCandidate' || method === 'undoGameCandidate');
        if (formalMutations.has(method) && !(method === 'compileStory' && input.dryRun === true)) throw Error('正式项目改动需先建立可试玩候选，再到功能进展确认采用');
        if (internalWorkflowCommands.has(method)) throw Error('候选与采用记录只能由制作及采用服务写入');
        if (method === 'confirmGameCandidate' || method === 'undoGameCandidate') {
          if (caller.kind !== 'user' || !await featureProgressNote(caller.noteId)) throw Error('只有功能进展中的用户操作可以确认或撤销');
          return method === 'confirmGameCandidate' ? gameAdoptions.confirm(input) : gameAdoptions.undo(input);
        }
        if (method === 'stageStoryCandidate' || method === 'stageDocumentsCandidate') {
          if (!caller.noteId) throw Error('资料或剧情候选需要知识库便笺来源');
          const config = await host.app.core.readRecord<any>('states', `${caller.noteId}:config`);
          if (config?.value?.mode !== 'knowledge') throw Error('只有知识库便笺可以建立资料或剧情候选');
          return method === 'stageStoryCandidate' ? gameCandidates.stageStory(input as any) : gameCandidates.stageDocuments(input as any);
        }
        assertDeckWriteAccess(method, input, caller.kind);
        if (CARD_PIPELINE_COMMANDS.has(method)) {
          const source = method === 'setCardDrafts' || method === 'createCardBatch' ? await verifiedCardDraftSource(host.app, caller) : { _draftOrigin: 'unknown' as const };
          return pipeline.command(method, { ...input, _draftSource: undefined, ...source });
        }
        if (method === 'requestPreviewRepair') {
          if (caller.kind !== 'user' || !caller.noteId) throw Error('修复需要执行台中的用户操作');
          const desk = await host.app.note(caller.noteId);
          const state = await host.app.core.readRecord<any>('states', desk.value.stateRef);
          const task = state?.value?.delegations?.[String(input.delegationId)];
          const feedback = task?.feedback?.find((item: any) => item.id === input.feedbackId && item.candidateKey && item.status === 'failed');
          if (!feedback) throw Error('找不到这个任务的预览失败记录');
          const relations = (await host.app.skillConnections.list(desk.value.desktopId)).filter(relation =>
            relation.enabled && !relation.archived && relation.nodeIds.includes(caller.noteId!) &&
            relation.nodes.some(node => node.noteId === caller.noteId && node.available.actions.some(action => action.name === 'acceptPreviewFeedback')) &&
            relation.nodes.some(node => node.noteId !== caller.noteId && node.available.actions.some(action => action.name === 'receive') && node.available.queries.some(query => query.name === 'candidate')));
          const previewIds = [...new Set(relations.flatMap(relation => relation.nodes.filter(node => node.noteId !== caller.noteId && node.available.actions.some(action => action.name === 'receive')).map(node => node.noteId)))];
          const previewId = typeof task.preview?.noteId === 'string' ? task.preview.noteId : previewIds.length === 1 ? previewIds[0] : undefined;
          if (!previewId || !previewIds.includes(previewId)) throw Error('候选预览 Skill 连线不可用或来源不明确');
          return host.app.requireEngine().invoke(previewId, 'requestRepair', {
            key: feedback.candidateKey, revision: feedback.revision, runId: feedback.runId, surface: feedback.surface,
          }, { kind: 'user', noteId: caller.noteId });
        }
        return contentCommands.has(method)
          ? content.command(method as ContentCommandMethod, input)
          : workflows.command(method, input as any);
      },
      close,
    });
  } catch (cause) {
    try { await close(); }
    catch (cleanupError) { throw new AggregateError([cause, cleanupError], 'CardGame extension activation failed'); }
    throw cause;
  }
}
