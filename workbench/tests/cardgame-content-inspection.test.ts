import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentService, type ContentService } from '../plugins/cardgame-content/src/content';
import type { InspectionResult, RecentChangeItem } from '../plugins/cardgame-content/src/types';

const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex');

function wavBytes(seconds = 1): Buffer {
  const sampleRate = 8000;
  const dataSize = seconds * sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function unitCard(id: string, name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name,
    kind: 'unit',
    description: '灵兽单位',
    rarity: 'common',
    realmId: 'realm_qi_1',
    race: '兽族',
    attack: 2,
    health: 3,
    effects: [],
    ...extra,
  };
}

async function fixture(): Promise<{ root: string; dataRoot: string; service: ContentService; close: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-inspection-root-'));
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-inspection-data-'));
  await mkdir(join(root, 'notes', 'chapter'), { recursive: true });
  await mkdir(join(root, 'public', 'data', 'cards'), { recursive: true });
  await mkdir(join(root, 'public', 'assets'), { recursive: true });
  await writeFile(
    join(root, 'notes', 'guide.md'),
    '# 向导\n\n阅读[第一章](./chapter/one.md)，查看![图标](../public/assets/icon.png)，然后前往[失落页](./missing.md)。\n',
  );
  await writeFile(
    join(root, 'notes', 'scene.md'),
    '---\ntitle: 森林入口\nscene: true\n---\n# 森林入口\n\n你来到森林入口。\n\n## 选项\n\n- [深入森林](./nowhere.md)\n- [返回村庄](./chapter/one.md)\n\n## 备注\n\n参见[旧地图](./also-missing.md)。\n',
  );
  await writeFile(join(root, 'notes', 'chapter', 'one.md'), '# 第一章\n\n正文。\n');
  await writeFile(
    join(root, 'public', 'data', 'cards', 'units.json'),
    JSON.stringify({ units: [unitCard('CR_001', '青云灵狐', { image: 'icon.png' }), unitCard('CR_002', '赤焰虎', { image: 'missing-art.png' })] }, null, 2),
  );
  await writeFile(join(root, 'public', 'assets', 'icon.png'), PNG_1X1);
  await writeFile(join(root, 'public', 'assets', 'orphan.png'), PNG_1X1);
  await writeFile(join(root, 'public', 'assets', 'broken.png'), Buffer.from('not a real png'));
  await writeFile(join(root, 'public', 'assets', 'buzz.wav'), Buffer.from('not a real wav'));
  const service = createContentService({ dataRoot, projects: [{ id: 'fixture', root }] });
  return {
    root,
    dataRoot,
    service,
    close: async () => {
      await service.close();
      await rm(root, { recursive: true, force: true });
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

async function collectInspection(service: ContentService, input: Record<string, unknown>): Promise<InspectionResult['findings']> {
  const findings: InspectionResult['findings'] = [];
  let cursor: string | undefined;
  do {
    const page = await service.query({ projectId: 'fixture', op: 'inspection', ...input, ...(cursor ? { cursor } : {}) } as never) as InspectionResult;
    findings.push(...page.findings);
    cursor = page.nextCursor;
  } while (cursor);
  return findings;
}

describe('CardGame content inspection', () => {
  test('reports broken links, scene dead-ends, orphans, missing art, and missing metadata', async () => {
    const f = await fixture();
    try {
      const result = await f.service.query({ projectId: 'fixture', op: 'inspection' }) as InspectionResult;
      expect(result.counts).toEqual({
        'broken-link': 2,
        'scene-dead-end': 1,
        'orphan-asset': 3,
        'card-missing-art': 1,
        'asset-missing-metadata': 2,
      });
      expect(result.findings).toHaveLength(9);
      const byKind = (kind: string) => result.findings.filter((finding) => finding.kind === kind);
      const deadEnd = byKind('scene-dead-end')[0]!;
      expect(deadEnd).toMatchObject({ severity: 'high', ref: { type: 'document', path: 'notes/scene.md' } });
      expect(deadEnd.detail).toContain('./nowhere.md');
      const broken = byKind('broken-link');
      expect(broken.every((finding) => finding.severity === 'warning')).toBe(true);
      expect(broken.map((finding) => finding.ref.path).sort()).toEqual(['notes/guide.md', 'notes/scene.md']);
      expect(broken.find((finding) => finding.ref.path === 'notes/scene.md')?.detail).toContain('./also-missing.md');
      expect(byKind('orphan-asset').map((finding) => finding.ref.path).sort()).toEqual([
        'public/assets/broken.png',
        'public/assets/buzz.wav',
        'public/assets/orphan.png',
      ]);
      const missingArt = byKind('card-missing-art')[0]!;
      expect(missingArt).toMatchObject({ severity: 'warning', ref: { type: 'card', id: 'CR_002' } });
      expect(missingArt.detail).toContain('missing-art.png');
      const missingMetadata = byKind('asset-missing-metadata');
      expect(missingMetadata.find((finding) => finding.ref.path === 'public/assets/broken.png')?.detail).toContain('width');
      expect(missingMetadata.find((finding) => finding.ref.path === 'public/assets/buzz.wav')?.detail).toContain('durationMs');
    } finally {
      await f.close();
    }
  });

  test('filters by kind and paginates with a cursor', async () => {
    const f = await fixture();
    try {
      const onlyBroken = await f.service.query({ projectId: 'fixture', op: 'inspection', kinds: ['broken-link'] }) as InspectionResult;
      expect(onlyBroken.counts).toEqual({ 'broken-link': 2 });
      expect(onlyBroken.findings.every((finding) => finding.kind === 'broken-link')).toBe(true);
      await expect(f.service.query({ projectId: 'fixture', op: 'inspection', kinds: ['nope'] as never }))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
      const paged = await collectInspection(f.service, { limit: 2 });
      expect(paged).toHaveLength(9);
      const keys = paged.map((finding) => `${finding.kind}|${finding.ref.path}|${finding.ref.id}|${finding.detail}`);
      expect(new Set(keys).size).toBe(keys.length);
      const unpaged = await collectInspection(f.service, {});
      expect(paged.map((finding) => finding.detail)).toEqual(unpaged.map((finding) => finding.detail));
    } finally {
      await f.close();
    }
  });
});

describe('CardGame content recent changes', () => {
  test('streams creations first, then updates, ordered newest first with pagination', async () => {
    const f = await fixture();
    try {
      const collect = async (input: Record<string, unknown>): Promise<RecentChangeItem[]> => {
        const items: RecentChangeItem[] = [];
        let cursor: string | undefined;
        do {
          const page = await f.service.query({ projectId: 'fixture', op: 'recentChanges', ...input, ...(cursor ? { cursor } : {}) } as never) as { items: RecentChangeItem[]; nextCursor?: string; total?: number };
          items.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        return items;
      };
      const initial = await collect({ limit: 4 });
      expect(initial).toHaveLength(13);
      expect(initial.filter((item) => item.kind === 'document')).toHaveLength(3);
      expect(initial.filter((item) => item.kind === 'card')).toHaveLength(2);
      expect(initial.filter((item) => item.kind === 'asset')).toHaveLength(4);
      expect(initial.filter((item) => item.kind === 'version')).toHaveLength(4);
      expect(initial.every((item) => item.change === 'created')).toBe(true);
      for (let index = 1; index < initial.length; index += 1) {
        expect(initial[index - 1]!.at >= initial[index]!.at).toBe(true);
      }
      const keys = initial.map((item) => `${item.kind}|${item.id}|${item.at}`);
      expect(new Set(keys).size).toBe(keys.length);

      await new Promise((resolve) => setTimeout(resolve, 5));
      const document = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' }) as { id: string; revision: string };
      await f.service.command('saveDocument', {
        projectId: 'fixture', id: document.id, expectedRevision: document.revision, content: '# 第一章\n\n修订后的正文。\n',
      });
      const asset = await f.service.query({ projectId: 'fixture', op: 'assets', q: 'icon', limit: 1 }) as { items: Array<{ id: string; metadataRevision?: string }> };
      await f.service.command('updateAsset', {
        projectId: 'fixture', id: asset.items[0]!.id, name: '图标', expectedMetadataRevision: asset.items[0]!.metadataRevision,
      });

      const after = await collect({});
      expect(after).toHaveLength(15);
      const updatedDocument = after.find((item) => item.kind === 'document' && item.path === 'notes/chapter/one.md' && item.change === 'updated');
      expect(updatedDocument).toBeTruthy();
      const updatedAsset = after.find((item) => item.kind === 'asset' && item.change === 'updated');
      expect(updatedAsset).toMatchObject({ path: 'public/assets/icon.png', name: '图标' });
      const newest = await f.service.query({ projectId: 'fixture', op: 'recentChanges', limit: 1 }) as { items: RecentChangeItem[]; total?: number };
      expect(newest.total).toBe(15);
      expect(newest.items[0]!.at >= after[1]!.at).toBe(true);

      const future = await f.service.query({ projectId: 'fixture', op: 'recentChanges', since: new Date(Date.now() + 3_600_000).toISOString() }) as { items: RecentChangeItem[] };
      expect(future.items).toHaveLength(0);
      const everything = await f.service.query({ projectId: 'fixture', op: 'recentChanges', since: '2000-01-01T00:00:00.000Z' }) as { items: RecentChangeItem[]; total?: number };
      expect(everything.total).toBe(15);
      await expect(f.service.query({ projectId: 'fixture', op: 'recentChanges', since: 'not-a-date' }))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    } finally {
      await f.close();
    }
  });
});

describe('CardGame candidate inspection and auto-adopt', () => {
  test('adopts a passing image candidate and stays idempotent on repeat calls', async () => {
    const f = await fixture();
    try {
      const input = {
        projectId: 'fixture',
        candidates: [{ name: 'portrait.png', base64: PNG_1X1.toString('base64'), mimeType: 'image/png' }],
        autoAdopt: { path: 'public/assets/art/portrait.png' },
      };
      const first = await f.service.command('registerCandidates', input) as Array<Record<string, unknown>>;
      expect(first[0]).toMatchObject({ status: 'adopted', assetPath: 'public/assets/art/portrait.png' });
      expect(first[0]!.inspection).toEqual({ passed: true, reasons: [] });
      const assetId = first[0]!.assetId as string;
      const versionId = first[0]!.versionId as string;
      const asset = await f.service.query({ projectId: 'fixture', op: 'asset', id: assetId }) as { path: string; status: string; width?: number };
      expect(asset).toMatchObject({ path: 'public/assets/art/portrait.png', status: 'ready', width: 1 });

      const second = await f.service.command('registerCandidates', input) as Array<Record<string, unknown>>;
      expect(second[0]).toMatchObject({ id: first[0]!.id, status: 'adopted', assetId, versionId });
      const versions = await f.service.query({ projectId: 'fixture', op: 'versions', assetId }) as { items: unknown[] };
      expect(versions.items).toHaveLength(1);
    } finally {
      await f.close();
    }
  });

  test('adopts a passing audio candidate and resolves the target from candidate metadata', async () => {
    const f = await fixture();
    try {
      const results = await f.service.command('registerCandidates', {
        projectId: 'fixture',
        candidates: [{ name: 'tone.wav', base64: wavBytes(1).toString('base64'), mimeType: 'audio/wav', metadata: { path: 'public/assets/audio/tone.wav' } }],
        autoAdopt: {},
      }) as Array<Record<string, unknown>>;
      expect(results[0]).toMatchObject({ status: 'adopted', assetPath: 'public/assets/audio/tone.wav' });
      const asset = await f.service.query({ projectId: 'fixture', op: 'asset', id: results[0]!.assetId as string }) as { durationMs?: number };
      expect(asset.durationMs).toBe(1000);
    } finally {
      await f.close();
    }
  });

  test('keeps a failing candidate with the inspection report and does not re-inspect on repeat', async () => {
    const f = await fixture();
    try {
      const input = {
        projectId: 'fixture',
        candidates: [{ name: 'broken.png', base64: Buffer.from('not a real png').toString('base64'), mimeType: 'image/png' }],
        autoAdopt: {},
      };
      const first = await f.service.command('registerCandidates', input) as Array<Record<string, unknown>>;
      expect(first[0]!.status).toBe('candidate');
      const inspection = first[0]!.inspection as { passed: boolean; reasons: string[] };
      expect(inspection.passed).toBe(false);
      expect(inspection.reasons.length).toBeGreaterThan(0);
      const stored = await f.service.query({ projectId: 'fixture', op: 'asset', id: first[0]!.id as string }) as { status: string; metadata?: Record<string, unknown> };
      expect(stored.status).toBe('candidate');
      expect(stored.metadata?.inspection).toEqual(inspection);
      const assetsBefore = await f.service.query({ projectId: 'fixture', op: 'assets' }) as { total?: number };

      const second = await f.service.command('registerCandidates', input) as Array<Record<string, unknown>>;
      expect(second[0]).toMatchObject({ id: first[0]!.id, status: 'candidate', inspection });
      const assetsAfter = await f.service.query({ projectId: 'fixture', op: 'assets' }) as { total?: number };
      expect(assetsAfter.total).toBe(assetsBefore.total);
    } finally {
      await f.close();
    }
  });

  test('rejects a candidate whose declared mimeType contradicts the sniffed bytes', async () => {
    const f = await fixture();
    try {
      const results = await f.service.command('registerCandidates', {
        projectId: 'fixture',
        candidates: [{ name: 'fake.wav', base64: PNG_1X1.toString('base64'), mimeType: 'audio/wav' }],
        autoAdopt: {},
      }) as Array<Record<string, unknown>>;
      expect(results[0]!.status).toBe('candidate');
      const inspection = results[0]!.inspection as { passed: boolean; reasons: string[] };
      expect(inspection.passed).toBe(false);
      expect(inspection.reasons.some((reason) => reason.includes('audio/wav') && reason.includes('image/png'))).toBe(true);
    } finally {
      await f.close();
    }
  });
});
