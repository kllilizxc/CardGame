import { test, expect } from 'bun:test';
import { mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { inspectMediaFile, resolveMediaFile } from '../plugins/cardgame-content/src/media';

test('real thumbnails are bounded, cached and originals are never inlined by default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-media-'));
  try {
    const source = join(root, 'sheet.png');
    await sharp({ create: { width: 2048, height: 1024, channels: 4, background: '#1166aa' } }).png().toFile(source);
    const options = { root, absolutePath: source, cacheRoot: join(root, 'cache'), id: 'sheet', revision: 'v1' };
    const image = await resolveMediaFile({ ...options, variant: 'thumbnail' });
    const info = await sharp(image.absolutePath).metadata();
    expect(info.width).toBe(256); expect(info.height).toBe(128);
    expect(image.absolutePath).not.toBe(source);
    const before = await stat(image.absolutePath);
    const again = await resolveMediaFile({ ...options, variant: 'thumbnail' });
    expect((await stat(again.absolutePath)).mtimeMs).toBe(before.mtimeMs);
    const original = await resolveMediaFile({ ...options, indexed: { mimeType: 'image/png', size: (await stat(source)).size, frameCount: 8, metadata: { columns: 4, rows: 2, frameWidth: 512, frameHeight: 512 } } });
    expect(original.data).toBeUndefined(); expect(original.width).toBe(2048);
    expect(original.frameCount).toBe(8);
    expect(original.metadata).toEqual({ columns: 4, rows: 2, frameWidth: 512, frameHeight: 512 });
    await symlink('/etc/passwd', join(root, 'escaped.png'));
    await expect(resolveMediaFile({ ...options, absolutePath: join(root, 'escaped.png') })).rejects.toThrow('symlink');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('audio inspection extracts actual duration without embedding audio bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cardgame-audio-'));
  try {
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    const path = join(root, 'tone.wav'); await writeFile(path, wav);
    const inspection = await inspectMediaFile(path);
    expect(inspection.durationMs).toBe(1000); expect(inspection.size).toBe(wav.length);
  } finally { await rm(root, { recursive: true, force: true }); }
});
