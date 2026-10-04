import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { createContentService } from '../plugins/cardgame-content/src/content';
import { createWorkflowService } from '../plugins/cardgame-content/src/workflow';
import { SkillConnectionScriptRunner } from '../src/skill-connection-script';
import { receiveResult, adoptAsset } from '../templates/cardgame-production/actions';

test('CardGame Skill scripts register real files, then adopt the exact library version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cardgame-integration-'));
  const root = join(directory, 'game');
  const dataRoot = join(directory, 'worka');
  await mkdir(join(root, 'knowledge'), { recursive: true });
  await writeFile(join(root, 'knowledge', 'scene.md'), '# 场景\n');
  const options = { dataRoot, projects: [{ id: 'integration', root }] };
  const content = createContentService(options);
  const workflow = createWorkflowService(options);
  const events: Array<{ id: string; noteId: string; name: string; payload: any; key: string }> = [];
  const keys = new Set<string>();
  const context = {
    note: { id: 'production' },
    store: { read: async () => ({ value: { projectId: 'integration' }, revision: '1' }) },
    events: { publish: async (name: string, payload: any, options: { key: string }) => {
      const duplicate = keys.has(options.key);
      if (!duplicate) { keys.add(options.key); events.push({ id: 'event-' + (events.length + 1), noteId: 'production', name, payload, key: options.key }); }
      return { id: events.find(event => event.key === options.key)!.id, duplicate };
    } },
    extensions: { request: async (_extension: string, method: string, input: any) => workflow.command(method, input) },
  } as any;
  const scriptRoot = resolve(import.meta.dirname, '../templates/skill-connections/cardgame-production-assets');
  const runner = new SkillConnectionScriptRunner();
  const host = { call: async (method: string, raw: any) => {
    if (method === 'describe') return [
      { noteId: 'production', codeVersion: 'production-v1', capabilities: { queries: ['production'], actions: ['recordCandidates', 'recordAdoption'], events: ['cardgame.production.candidatesRequested', 'cardgame.production.adoptionRequested'] } },
      { noteId: 'assets', codeVersion: 'assets-v1', capabilities: { queries: ['asset'], actions: ['registerCandidates', 'adoptVersion'], events: [] } },
    ];
    if (method === 'query' && raw.noteId === 'production' && raw.name === 'production')
      return workflow.query({ op: 'production', projectId: raw.input.projectId, id: raw.input.productionId });
    if (method === 'action' && raw.noteId === 'assets') return content.command(raw.name, raw.input);
    if (method === 'action' && raw.noteId === 'production') return workflow.command(raw.name, raw.input);
    if (method === 'bindingLink') return { duplicate: false };
    throw Error('unexpected Skill call ' + method + ' ' + (raw.name ?? ''));
  } } as any;
  try {
    await workflow.command('upsertProduction', { projectId: 'integration', id: 'pixel', brief: '像素背景' });
    const reserved = await workflow.command('reserveProduction', { projectId: 'integration', productionId: 'pixel', requestId: 'generation-1' }) as any;
    const sourcePath = join(reserved.round.requirement.outputDirectory, 'pixel.png');
    const bytes = await sharp({ create: { width: 32, height: 16, channels: 4, background: '#123456' } }).png().toBuffer();
    await writeFile(sourcePath, bytes);
    const delivery = { projectId: 'integration', productionId: 'pixel', requestId: reserved.requestId, round: reserved.round.round,
      revision: reserved.round.requirementRevision, status: 'completed', candidateRefs: [{ sourcePath, name: 'pixel.png' }] };
    const received = await receiveResult(delivery, context);
    expect(received.assetRegistration?.status).toBe('queued');
    expect(events).toHaveLength(1);
    const registered = await runner.run({ directory: scriptRoot, path: 'scripts/candidates.ts', event: events[0]!, host });
    expect(registered.result.outcome).toBe('completed');
    const detail = await workflow.query({ projectId: 'integration', op: 'production', id: 'pixel' }) as any;
    const candidate = detail.production.candidateRefs.find((item: any) => typeof item.id === 'string');
    expect(candidate?.id).toBeString();
    expect(detail.production.candidateRegistration.status).toBe('completed');
    expect(await content.query({ projectId: 'integration', op: 'asset', id: candidate.id })).toMatchObject({ id: candidate.id, status: 'candidate' });
    const media = await content.resolveMedia({ projectId: 'integration', op: 'media', id: candidate.id, variant: 'original' });
    expect(media.width).toBe(32);
    expect(media.height).toBe(16);
    await receiveResult(delivery, context);
    expect(events).toHaveLength(1);

    const queued = await adoptAsset({ projectId: 'integration', productionId: 'pixel', candidateId: candidate.id }, context);
    expect(queued.status).toBe('queued');
    expect(events).toHaveLength(2);
    const adopted = await runner.run({ directory: scriptRoot, path: 'scripts/adopt.ts', event: events[1]!, host });
    expect(adopted.result.outcome).toBe('completed');
    const latest = await workflow.query({ projectId: 'integration', op: 'production', id: 'pixel' }) as any;
    expect(latest.production.adoption.assetId).toBeString();
    expect(latest.production.adoption.version).toBeString();
    const asset = await content.query({ projectId: 'integration', op: 'asset', id: latest.production.adoption.assetId }) as any;
    expect(asset.currentVersionId).toBe(latest.production.adoption.version);
    expect(await readFile(join(root, asset.path))).toEqual(bytes);
    expect(await readFile(join(root, 'knowledge', 'scene.md'), 'utf8')).toBe('# 场景\n');
  } finally {
    await Promise.allSettled([content.close(), workflow.close()]);
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
