import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { createContentService } from '../plugins/cardgame-content/src/content';

/**
 * The capacity fixture is opt-in because it creates about 23,600 files and a
 * large manifest.  Run it with CARDGAME_CONTENT_SCALE=1 when validating a
 * release build.  It stays in the backend test namespace so the fixture and
 * measurements remain reproducible without touching CardGame or .workbench.
 */
test('CardGame content backend scales to the approved content shape', async () => {
  if (process.env.CARDGAME_CONTENT_SCALE !== '1') return;

  const root = await mkdtemp(join(tmpdir(), 'cardgame-content-scale-root-'));
  const dataRoot = await mkdtemp(join(tmpdir(), 'cardgame-content-scale-data-'));
  const projectId = 'scale';
  const imageCount = 20_000;
    const audioCount = 600;
    const documentCount = 3_000;
    const cardCount = 3_000;
  const versionCount = 100_000;
  let service: ReturnType<typeof createContentService> | undefined;
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 32, g: 96, b: 160, alpha: 1 } } }).png().toBuffer();
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0); wav.writeUInt32LE(36, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(44_100, 24); wav.writeUInt32LE(176_400, 28); wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(0, 40);
  const pngRevision = createHash('sha256').update(png).digest('hex');
  const wavRevision = createHash('sha256').update(wav).digest('hex');
  const rssMiB = (): number => Math.round(process.memoryUsage().rss / (1024 * 1024));
  const rssBefore = rssMiB();

  const writeBatch = async (items: Array<() => Promise<void>>, batchSize = 256): Promise<void> => {
    for (let offset = 0; offset < items.length; offset += batchSize) {
      await Promise.all(items.slice(offset, offset + batchSize).map((write) => write()));
    }
  };

  try {
    await mkdir(join(root, 'notes'), { recursive: true });
    await mkdir(join(root, 'public', 'data', 'cards'), { recursive: true });
    await mkdir(join(root, 'public', 'assets'), { recursive: true });

    const documents = Array.from({ length: documentCount }, (_, index) => () => {
      const path = join(root, 'notes', `${String(index).padStart(5, '0')}.md`);
      const next = (index + 1) % documentCount;
      return writeFile(path, `# 文档 ${index}\n\n中文规模关键词 ${index}\n[下一篇](./${String(next).padStart(5, '0')}.md)\n`);
    });
    await writeBatch(documents);

    const cards = Array.from({ length: cardCount }, (_, index) => ({
      id: `SCALE_${String(index).padStart(4, '0')}`,
      name: `规模单位 ${index}`,
      kind: 'unit',
      description: '规模测试卡牌',
      rarity: 'common',
      realmId: 'realm_scale',
      race: '测试',
      attack: 2,
      health: 3,
      effects: [],
      gongfaIds: [],
    }));
    await writeFile(join(root, 'public', 'data', 'cards', 'units.json'), `${JSON.stringify({ units: cards })}\n`);

    const images = Array.from({ length: imageCount }, (_, index) => () => {
      const path = join(root, 'public', 'assets', `image-${String(index).padStart(5, '0')}.png`);
      return writeFile(path, png);
    });
    const audio = Array.from({ length: audioCount }, (_, index) => () => {
      const path = join(root, 'public', 'assets', `audio-${String(index).padStart(4, '0')}.wav`);
      return writeFile(path, wav);
    });
    await writeBatch(images);
    await writeBatch(audio);

    const manifestAssets: Array<Record<string, unknown>> = [];
    for (let index = 0; index < imageCount; index += 1) {
      const path = `public/assets/image-${String(index).padStart(5, '0')}.png`;
      // Every image has a canonical current version.  The image rows total
      // 99,400 versions; the 600 audio rows below contribute one each for an
      // exact 100,000 rows without implicit index-time versions.
      const count = index === 0 ? 5_000 : index <= 14_404 ? 5 : 4;
      const versions = Array.from({ length: count }, (_, version) => ({
        id: `scale-version-${String(index).padStart(5, '0')}-${String(version).padStart(5, '0')}`,
        path,
        revision: pngRevision,
        mimeType: 'image/png',
        metadata: { fixture: true },
      }));
      manifestAssets.push({
        id: `scale-asset-${String(index).padStart(5, '0')}`,
        path,
        ...(versions.length > 0 ? { currentVersionId: versions[versions.length - 1]!.id, versions } : {}),
      });
    }
    for (let index = 0; index < audioCount; index += 1) {
      const path = `public/assets/audio-${String(index).padStart(4, '0')}.wav`;
      const version = {
        id: `scale-audio-version-${String(index).padStart(4, '0')}`,
        path,
        revision: wavRevision,
        mimeType: 'audio/wav',
        metadata: { fixture: true },
      };
      manifestAssets.push({
        id: `scale-audio-asset-${String(index).padStart(4, '0')}`,
        path,
        currentVersionId: version.id,
        versions: [version],
      });
    }
    await writeFile(join(root, 'public', 'assets', 'asset-manifest.json'), JSON.stringify({ schemaVersion: 1, assets: manifestAssets }));

    const createStarted = performance.now();
    service = createContentService({ dataRoot, projects: [{ id: projectId, root }] });
    const contentService = service;
    let status: { phase: string; documents: number; cards: number; assets: number } | undefined;
    const readyDeadline = Date.now() + 900_000;
    while (Date.now() < readyDeadline) {
      status = await contentService.query({ projectId, op: 'status' }) as typeof status;
      if (status?.phase === 'ready' || status?.phase === 'error') break;
      await Bun.sleep(25);
    }
    const indexMs = performance.now() - createStarted;
    const rssReady = rssMiB();
    expect(status?.phase).toBe('ready');
    expect(status?.documents).toBe(documentCount);
    expect(status?.cards).toBe(cardCount);
    expect(status?.assets).toBe(imageCount + audioCount);

    const timings: Record<string, number> = {};
    const timed = async (name: string, query: Parameters<typeof contentService.query>[0]): Promise<unknown> => {
      const started = performance.now();
      const result = await contentService.query(query);
      timings[name] = performance.now() - started;
      return result;
    };
    const documentsPage = await timed('documents', { projectId, op: 'documents', q: '中文规模关键词', limit: 100 }) as { items: unknown[]; total?: number; nextCursor?: string };
    const cardsPage = await timed('cards', { projectId, op: 'cards', q: '规模单位', limit: 100 }) as { items: unknown[]; total?: number; nextCursor?: string };
    const assetsPage = await timed('assets', { projectId, op: 'assets', q: 'image-', limit: 100 }) as { items: unknown[]; total?: number; nextCursor?: string };
    const versionsPage = await timed('versions', { projectId, op: 'versions', assetId: 'scale-asset-00000', limit: 100 }) as { items: unknown[]; total?: number; nextCursor?: string };
    expect(documentsPage.items).toHaveLength(100);
    expect(documentsPage.total).toBe(documentCount);
    expect(cardsPage.items).toHaveLength(100);
    expect(cardsPage.total).toBe(cardCount);
    expect(assetsPage.items).toHaveLength(100);
    expect(assetsPage.total).toBe(imageCount);
    expect(versionsPage.items).toHaveLength(100);
    expect(versionsPage.total).toBe(5_000);
    expect(versionsPage.nextCursor).toBeTruthy();
    const repeatedQueryCount = 20;
    const repeatedStarted = performance.now();
    for (let index = 0; index < repeatedQueryCount; index += 1) {
      await contentService.query({ projectId, op: 'documents', q: '中文规模关键词', limit: 100 });
      await contentService.query({ projectId, op: 'cards', rarity: 'common', limit: 100 });
      await contentService.query({ projectId, op: 'assets', format: 'png', minWidth: 64, maxWidth: 64, limit: 100 });
      await contentService.query({ projectId, op: 'versions', assetId: 'scale-asset-00000', limit: 100 });
    }
    const repeatedQueryMs = performance.now() - repeatedStarted;
    const rssAfterQueries = rssMiB();
    await contentService.close();
    const sqlite = await import('bun:sqlite');
    const checkDb = new sqlite.Database(join(dataRoot, 'content.sqlite'), { readonly: true });
    const versionRow = checkDb.query('SELECT COUNT(*) AS count FROM asset_versions WHERE project_id = ?').get(projectId) as { count?: number };
    const actualVersionCount = Number(versionRow.count ?? 0);
    checkDb.close();
    expect(actualVersionCount).toBe(versionCount);
    const keepFixture = process.env.CARDGAME_CONTENT_KEEP_FIXTURE === '1';
    console.log(JSON.stringify({ scale: { root, dataRoot, documents: documentCount, cards: cardCount, images: imageCount, audio: audioCount, versions: actualVersionCount }, indexMs: Math.round(indexMs), queryMs: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value)])), repeatedQueryCount, repeatedQueryMs: Math.round(repeatedQueryMs), rssMiB: { before: rssBefore, ready: rssReady, afterQueries: rssAfterQueries }, keptFixture: keepFixture }));
  } finally {
    if (service) await service.close().catch(() => undefined);
    if (process.env.CARDGAME_CONTENT_KEEP_FIXTURE !== '1') {
      await rm(root, { recursive: true, force: true });
      await rm(dataRoot, { recursive: true, force: true });
    }
  }
}, 1_200_000);
