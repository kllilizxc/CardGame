import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ContentServiceError,
  createContentService,
  type ContentService,
} from '../plugins/cardgame-content/src/content';

async function fixture(cardCount = 1): Promise<{ root: string; dataRoot: string; service: ContentService; close: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-content-root-'));
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-content-data-'));
  await mkdir(join(root, 'notes', 'chapter'), { recursive: true });
  await mkdir(join(root, 'public', 'data', 'cards'), { recursive: true });
  await mkdir(join(root, 'public', 'assets'), { recursive: true });
  await writeFile(join(root, 'notes', 'chapter', 'one.md'), '# 第一章\n\n前往[第二章](./two.md#入口)。');
  await writeFile(join(root, 'notes', 'chapter', 'two.md'), '# 第二章\n\n中文关键词。中文 空格。');
  const cards = Array.from({ length: cardCount }, (_, index) => ({
    id: index === 0 ? 'CR_001' : `CR_${String(index + 1).padStart(3, '0')}`,
    name: index === 0 ? '青云灵狐' : `测试单位 ${index + 1}`,
    kind: 'unit',
    description: '灵兽单位',
    rarity: index % 2 === 0 ? 'common' : 'rare',
    labels: index % 3 === 0 ? ['featured'] : [],
    realmId: 'realm_qi_1',
    race: '兽族',
    attack: 2,
    health: 3,
    effects: [],
  }));
  await writeFile(join(root, 'public', 'data', 'cards', 'units.json'), JSON.stringify({ units: cards }, null, 2));
  await writeFile(join(root, 'public', 'assets', 'sound.wav'), Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt '));
  await writeFile(join(root, 'public', 'assets', 'icon.png'), Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cf00000002010001e221bc330000000049454e44ae426082', 'hex'));
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

describe('CardGame content backend', () => {
  test('indexes Markdown, searches Chinese text, paginates, and exposes backlinks', async () => {
    const f = await fixture();
    try {
      await writeFile(join(f.root, 'notes', 'chapter', 'preview.png'), Buffer.from('unindexed preview'));
      const unindexedMedia = await f.service.resolveMedia({ projectId: 'fixture', op: 'media', path: './preview.png', from: 'notes/chapter/one.md', variant: 'original' });
      expect(unindexedMedia.path).toBe('notes/chapter/preview.png');
      const page = await f.service.query({ projectId: 'fixture', op: 'documents', q: '中文', limit: 1 }) as { items: Array<{ path: string }>; nextCursor?: string; total?: number };
      expect(page.total).toBe(1);
      expect(page.items[0]?.path).toBe('notes/chapter/two.md');
      const phrase = await f.service.query({ projectId: 'fixture', op: 'documents', q: '"中文 空格"' }) as { total?: number };
      expect(phrase.total).toBe(1);
      const contiguousPhrase = await f.service.query({ projectId: 'fixture', op: 'documents', q: '"中文关键词"' }) as { total?: number };
      expect(contiguousPhrase.total).toBe(1);
      const document = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' }) as { links: Array<{ targetPath: string; targetKind: string }> };
      expect(document.links[0]).toMatchObject({ targetPath: 'notes/chapter/two.md', targetKind: 'document' });
      const backlinks = await f.service.query({ projectId: 'fixture', op: 'backlinks', path: 'notes/chapter/two.md' }) as { items: Array<{ sourcePath: string }> };
      expect(backlinks.items.map((item) => item.sourcePath)).toEqual(['notes/chapter/one.md']);
    } finally {
      await f.close();
    }
  });

  test('updates an edited document link without disturbing other backlinks', async () => {
    const f = await fixture();
    try {
      const original = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' }) as { revision: string };
      await f.service.command('saveDocument', {
        projectId: 'fixture', path: 'notes/chapter/three.md',
        content: '# 第三章\n\n[第二章](./two.md)',
      });
      const before = await f.service.query({ projectId: 'fixture', op: 'backlinks', path: 'notes/chapter/two.md' }) as { items: Array<{ sourcePath: string }> };
      expect(before.items.map(item => item.sourcePath)).toEqual(['notes/chapter/one.md', 'notes/chapter/three.md']);

      await f.service.command('saveDocument', {
        projectId: 'fixture', path: 'notes/chapter/one.md', expectedRevision: original.revision,
        content: '# 第一章\n\n前往[第三章](./three.md)。',
      });
      const updated = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' }) as { links: Array<{ targetPath: string; targetKind: string }> };
      expect(updated.links).toMatchObject([{ targetPath: 'notes/chapter/three.md', targetKind: 'document' }]);
      const secondBacklinks = await f.service.query({ projectId: 'fixture', op: 'backlinks', path: 'notes/chapter/two.md' }) as { items: Array<{ sourcePath: string }> };
      expect(secondBacklinks.items.map(item => item.sourcePath)).toEqual(['notes/chapter/three.md']);
      const thirdBacklinks = await f.service.query({ projectId: 'fixture', op: 'backlinks', path: 'notes/chapter/three.md' }) as { items: Array<{ sourcePath: string }> };
      expect(thirdBacklinks.items.map(item => item.sourcePath)).toEqual(['notes/chapter/one.md']);
    } finally { await f.close(); }
  });

  test('replaces indexed links when the file watcher sees a Markdown edit', async () => {
    const f = await fixture();
    try {
      await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' });
      const indexed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Markdown watcher did not reindex the edit')); }, 3000);
        const unsubscribe = f.service.subscribe(event => {
          if (event.reason !== 'index' || !event.paths?.includes('notes/chapter/one.md')) return;
          clearTimeout(timer);
          unsubscribe();
          resolve();
        });
      });
      await writeFile(join(f.root, 'notes/chapter/one.md'), '# 第一章\n\n请读[第二章](./two.md)。');
      await indexed;
      const document = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' }) as { links: Array<{ label: string }> };
      expect(document.links.map(link => link.label)).toEqual(['第二章']);
    } finally {
      await f.close();
    }
  });

  test('does not invalidate documents when a new directory has no indexed content', async () => {
    const f = await fixture();
    try {
      await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/one.md' });
      const indexed = new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Directory watcher did not index the new directory')); }, 3000);
        const unsubscribe = f.service.subscribe(event => {
          if (event.reason !== 'index' || !event.paths?.includes('public/data/story')) return;
          clearTimeout(timer);
          unsubscribe();
          resolve(event.kinds ?? []);
        });
      });
      await mkdir(join(f.root, 'public/data/story'));
      expect(await indexed).toEqual(['directory', 'status']);
      const backlinks = await f.service.query({ projectId: 'fixture', op: 'backlinks', path: 'notes/chapter/two.md' }) as { items: Array<{ sourcePath: string }> };
      expect(backlinks.items.map(item => item.sourcePath)).toEqual(['notes/chapter/one.md']);
    } finally { await f.close(); }
  });

  test('uses document CAS and safely updates links during rename', async () => {
    const f = await fixture();
    try {
      const before = await f.service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/two.md' }) as { id: string; revision: string };
      await expect(f.service.command('saveDocument', {
        projectId: 'fixture',
        id: before.id,
        content: '# changed',
        expectedRevision: 'stale',
      })).rejects.toMatchObject({ code: 'CONTENT_CONFLICT' });
      const moved = await f.service.command('moveDocument', {
        projectId: 'fixture',
        id: before.id,
        toPath: 'notes/chapter/final.md',
        expectedRevision: before.revision,
      }) as { source: { path: string } };
      expect(moved.source.path).toBe('notes/chapter/final.md');
      const source = await readFile(join(f.root, 'notes', 'chapter', 'one.md'), 'utf8');
      expect(source).toContain('./final.md#入口');
      expect(source).not.toContain('./two.md#入口');
    } finally {
      await f.close();
    }
  });

  test('requires a fresh disk CAS and rewrites cross-directory outbound links', async () => {
    const f = await fixture();
    let service = f.service;
    try {
      const current = await service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/two.md' }) as { id: string; revision: string };
      await expect(service.command('saveDocument', {
        projectId: 'fixture', id: current.id, content: '# 无条件覆盖',
      })).rejects.toMatchObject({ code: 'CONTENT_CONFLICT' });
      await writeFile(join(f.root, 'notes', 'chapter', 'two.md'), '# 外部改动');
      await expect(service.command('saveDocument', {
        projectId: 'fixture', id: current.id, content: '# 覆盖外部改动', expectedRevision: current.revision,
      })).rejects.toMatchObject({ code: 'CONTENT_CONFLICT' });

      // Reopen to obtain a fresh indexed revision without relying on watcher
      // debounce timing; the preceding assertion is intentionally immediate.
      await service.close();
      service = createContentService({ dataRoot: f.dataRoot, projects: [{ id: 'fixture', root: f.root }] });
      const refreshed = await service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/two.md' }) as { id: string; revision: string };
      await service.command('saveDocument', {
        projectId: 'fixture', id: refreshed.id, expectedRevision: refreshed.revision,
        content: '# 中文入口\n\n[前章](./one.md#第一章) [自身](#中文入口) ![素材](../../public/assets/sound.wav#试听)',
      });
      const latest = await service.query({ projectId: 'fixture', op: 'document', path: 'notes/chapter/two.md' }) as { id: string; revision: string };
      await service.command('moveDocument', {
        projectId: 'fixture', id: latest.id, toPath: 'notes/final.md', expectedRevision: latest.revision,
      });
      const moved = await readFile(join(f.root, 'notes', 'final.md'), 'utf8');
      expect(moved).toContain('[前章](./chapter/one.md#第一章)');
      expect(moved).toContain('[自身](#中文入口)');
      expect(moved).toContain('![素材](../public/assets/sound.wav#试听)');
      const incoming = await readFile(join(f.root, 'notes', 'chapter', 'one.md'), 'utf8');
      expect(incoming).toContain('../final.md#入口');
    } finally {
      await service.close();
      await f.close();
    }
  });

  test('validates card updates before writing and keeps IDs/schema', async () => {
    const f = await fixture();
    try {
      const card = await f.service.query({ projectId: 'fixture', op: 'card', id: 'CR_001' }) as { revision: string; json: Record<string, unknown> };
      await expect(f.service.command('updateCard', {
        projectId: 'fixture', id: 'CR_001', expectedRevision: card.revision,
        patch: { id: 'changed-id' },
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await f.service.command('updateCard', {
        projectId: 'fixture', id: 'CR_001', expectedRevision: card.revision,
        patch: { name: '青云灵狐·新' },
      });
      const file = JSON.parse(await readFile(join(f.root, 'public', 'data', 'cards', 'units.json'), 'utf8')) as { units: Array<{ id: string; name: string }> };
      expect(file.units[0]?.id).toBe('CR_001');
      expect(file.units[0]?.name).toBe('青云灵狐·新');
    } finally {
      await f.close();
    }
  });

  test('applies card rarity and label filters before cursor pagination', async () => {
    const f = await fixture(125);
    try {
      const page = await f.service.query({ projectId: 'fixture', op: 'cards', rarity: 'rare', tags: 'featured', limit: 1 }) as { total?: number; items: Array<{ id: string; rarity?: string; labels?: string[] }>; nextCursor?: string };
      expect(page.total).toBe(21);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.rarity).toBe('rare');
      expect(page.items[0]?.labels).toContain('featured');
      expect(page.nextCursor).toBeTruthy();
      const next = await f.service.query({ projectId: 'fixture', op: 'cards', rarity: 'rare', tags: 'featured', limit: 1, cursor: page.nextCursor }) as { total?: number; items: Array<{ id: string; rarity?: string; labels?: string[] }> };
      expect(next.total).toBe(21);
      expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
      expect(next.items[0]?.rarity).toBe('rare');
      expect(next.items[0]?.labels).toContain('featured');
    } finally {
      await f.close();
    }
  });

  test('registers candidates, adopts a version, indexes media metadata, and persists history', async () => {
    const f = await fixture();
    try {
      const candidates = await f.service.command('registerCandidates', {
        projectId: 'fixture',
        candidates: [{ name: 'portrait.png', base64: Buffer.from('candidate').toString('base64'), mimeType: 'image/png' }],
      }) as Array<{ id: string }>;
      const candidateMedia = await f.service.resolveMedia({ projectId: 'fixture', op: 'media', id: candidates[0]!.id, variant: 'original' });
      expect(candidateMedia.id).toBe(candidates[0]!.id);
      const asset = await f.service.command('adoptVersion', {
        projectId: 'fixture', candidateId: candidates[0]!.id, fileName: 'portrait.png',
      }) as { id: string; path: string; currentVersionId?: string };
      expect(asset.path).toBe('public/assets/portrait.png');
      expect(asset.currentVersionId).toBeTruthy();
      const versions = await f.service.query({ projectId: 'fixture', op: 'versions', assetId: asset.id }) as { items: unknown[] };
      expect(versions.items.length).toBe(1);
      const media = await f.service.resolveMedia({ projectId: 'fixture', op: 'media', id: asset.id, variant: 'original' });
      expect(media.mimeType).toBe('image/png');
      // SQL NULL represents missing optional metadata in every public read.
      for (const item of [asset, ...versions.items, media]) {
        const metadata = item as { durationMs?: number; frameCount?: number };
        expect(metadata.durationMs).toBeUndefined();
        expect(metadata.frameCount).toBeUndefined();
      }
      const metadataRevision = (asset as { metadataRevision?: string }).metadataRevision;
      const renamed = await f.service.command('updateAsset', {
        projectId: 'fixture', id: asset.id, name: '精选肖像', tags: ['精选', '肖像'], expectedMetadataRevision: metadataRevision,
      }) as { name?: string; tags?: string[]; metadataRevision?: string };
      expect(renamed).toMatchObject({ name: '精选肖像', tags: ['精选', '肖像'] });
      expect(renamed.metadataRevision).not.toBe(metadataRevision);
      await expect(f.service.command('updateAsset', {
        projectId: 'fixture', id: asset.id, name: '过期写入', expectedMetadataRevision: metadataRevision,
      })).rejects.toMatchObject({ code: 'CONTENT_CONFLICT' });
      const filteredAssets = await f.service.query({ projectId: 'fixture', op: 'assets', q: '精选', limit: 1 }) as { total?: number; items: Array<{ name?: string; tags?: string[]; status?: string }> };
      expect(filteredAssets.total).toBe(1);
      expect(filteredAssets.items[0]).toMatchObject({ name: '精选肖像', status: 'ready' });
      const candidateFiltered = await f.service.query({ projectId: 'fixture', op: 'assets', status: 'candidate', format: 'png', limit: 1 }) as { total?: number; items: Array<{ id: string; status?: string; format?: string }> };
      expect(candidateFiltered.total).toBe(1);
      expect(candidateFiltered.items[0]).toMatchObject({ id: candidates[0]!.id, status: 'candidate', format: 'png' });
      const dimensionFiltered = await f.service.query({ projectId: 'fixture', op: 'assets', format: 'png', minWidth: 1, maxWidth: 1, limit: 1 }) as { total?: number; items: Array<{ path: string; width?: number }> };
      expect(dimensionFiltered.total).toBe(1);
      expect(dimensionFiltered.items[0]).toMatchObject({ path: 'public/assets/icon.png', width: 1 });
      const duplicate = await f.service.command('registerCandidates', {
        projectId: 'fixture', candidates: [{ id: 'fixed-candidate', name: 'same.bin', base64: Buffer.from('same').toString('base64') }],
      }) as Array<{ id: string }>;
      const duplicateRetry = await f.service.command('registerCandidates', {
        projectId: 'fixture', candidates: [{ id: 'fixed-candidate', name: 'different-name.bin', base64: Buffer.from('same').toString('base64') }],
      }) as Array<{ id: string }>;
      expect(duplicateRetry[0]?.id).toBe(duplicate[0]?.id);
      await expect(f.service.command('registerCandidates', {
        projectId: 'fixture', candidates: [{ id: 'fixed-candidate', name: 'same.bin', base64: Buffer.from('changed').toString('base64') }],
      })).rejects.toMatchObject({ code: 'CONTENT_CONFLICT' });
      await f.service.close();
      const reopened = createContentService({ dataRoot: f.dataRoot, projects: [{ id: 'fixture', root: f.root }] });
      const reopenedAsset = await reopened.query({ projectId: 'fixture', op: 'asset', id: asset.id }) as { id: string };
      expect(reopenedAsset.id).toBe(asset.id);
      const reopenedVersions = await reopened.query({ projectId: 'fixture', op: 'versions', assetId: asset.id }) as { items: unknown[] };
      expect(reopenedVersions.items.length).toBe(1);
      await reopened.close();
    } finally {
      // close is idempotent; the reopen branch has already closed its service.
      await f.close();
    }
  });

  test('adoption keeps old bytes and rejects a changed immutable version', async () => {
    const f = await fixture();
    try {
      const oldBytes = await readFile(join(f.root, 'public', 'assets', 'sound.wav'));
      const candidates = await f.service.command('registerCandidates', {
        projectId: 'fixture', candidates: [{ name: 'sound.wav', base64: Buffer.from('new-version').toString('base64'), mimeType: 'audio/wav' }],
      }) as Array<{ id: string }>;
      const asset = await f.service.command('adoptVersion', {
        projectId: 'fixture', candidateId: candidates[0]!.id, fileName: 'sound.wav',
      }) as { id: string; path: string; currentVersionId?: string };
      expect(asset.path).toBe('public/assets/sound.wav');
      const afterBytes = await readFile(join(f.root, 'public', 'assets', 'sound.wav'));
      expect(Buffer.compare(oldBytes, afterBytes)).toBe(0);
      expect(asset.currentVersionId).toBeTruthy();
      const versions = await f.service.query({ projectId: 'fixture', op: 'versions', assetId: asset.id }) as { items: Array<{ id: string; path: string }> };
      const current = versions.items.find((version) => version.id === asset.currentVersionId);
      expect(current?.path).toMatch(/^public\/assets\/sound\.[a-f0-9]{16}\.wav$/u);
      await expect(f.service.resolveMedia({ projectId: 'fixture', op: 'media', id: asset.id, versionId: current!.id, variant: 'original' })).resolves.toMatchObject({ versionId: current!.id });
      await writeFile(join(f.root, current!.path), Buffer.from('tampered-version'));
      await expect(f.service.resolveMedia({ projectId: 'fixture', op: 'media', id: asset.id, versionId: current!.id, variant: 'original' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    } finally {
      await f.close();
    }
  });

  test('rejects symlink escapes on reads and writes', async () => {
    const f = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'cardgame-content-outside-'));
    try {
      await writeFile(join(outside, 'secret.md'), '# secret');
      await symlink(join(outside, 'secret.md'), join(f.root, 'notes', 'secret.md'));
      const documents = await f.service.query({ projectId: 'fixture', op: 'documents' }) as { items: Array<{ path: string }> };
      expect(documents.items.some((item) => item.path === 'notes/secret.md')).toBe(false);
      await expect(f.service.command('saveDocument', {
        projectId: 'fixture', path: 'notes/secret.md', content: '# overwrite',
      })).rejects.toBeInstanceOf(ContentServiceError);
    } finally {
      await f.close();
      await rm(outside, { recursive: true, force: true });
    }
  });
});
