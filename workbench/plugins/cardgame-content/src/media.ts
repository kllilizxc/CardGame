import { mkdir, open, readFile, realpath, rename, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { parseFile } from 'music-metadata';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { MediaResponse } from './types';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.json': 'application/json',
};

export interface MediaInspection {
  mimeType: string;
  kind: 'image' | 'audio' | 'spritesheet' | 'other';
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  metadata?: Record<string, unknown>;
}

export interface ResolveMediaFileOptions {
  root: string;
  absolutePath: string;
  id: string;
  revision: string;
  versionId?: string;
  variant?: 'thumbnail' | 'original' | 'waveform';
  inlineLimit?: number;
  cacheRoot?: string;
  /** Metadata computed while indexing, such as spritesheet frame counts. */
  indexed?: Partial<MediaInspection>;
}

export function mediaTypeFromPath(filePath: string): string {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function sniffMediaMime(bytes: Uint8Array): string | undefined {
  const ascii = (start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp';
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'image/x-icon';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  if (bytes.length >= 3 && (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') {
    const brand = ascii(8, 4);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) return 'audio/mp4';
  }
  return undefined;
}

export function mediaKindFromMime(
  mimeType: string,
  filePath = '',
  frameCount?: number,
): MediaInspection['kind'] {
  if (mimeType.startsWith('image/')) return frameCount && frameCount > 1 ? 'spritesheet' : 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (filePath.toLowerCase().endsWith('.json') && frameCount && frameCount > 0) return 'spritesheet';
  return 'other';
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function parsePng(bytes: Uint8Array): Pick<MediaInspection, 'width' | 'height'> | undefined {
  if (
    bytes.length >= 24
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  return undefined;
}

function parseGif(bytes: Uint8Array): Pick<MediaInspection, 'width' | 'height'> | undefined {
  if (
    bytes.length >= 10
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
  ) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }
  return undefined;
}

function parseWebp(bytes: Uint8Array): Pick<MediaInspection, 'width' | 'height'> | undefined {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') {
    return undefined;
  }

  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return {
      width: 1 + readUint24LittleEndian(bytes, 24),
      height: 1 + readUint24LittleEndian(bytes, 27),
    };
  }

  if (chunk === 'VP8 ' && bytes.length >= 30) {
    // A lossy VP8 frame stores dimensions after a short frame header.  The
    // signature check keeps malformed files from producing misleading values.
    for (let i = 20; i + 9 < bytes.length; i += 1) {
      if (bytes[i] === 0x9d && bytes[i + 1] === 0x01 && bytes[i + 2] === 0x2a) {
        return {
          width: (bytes[i + 3] | (bytes[i + 4] << 8)) & 0x3fff,
          height: (bytes[i + 5] | (bytes[i + 6] << 8)) & 0x3fff,
        };
      }
    }
  }

  return undefined;
}

function parseJpeg(bytes: Uint8Array): Pick<MediaInspection, 'width' | 'height'> | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) break;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame && offset + 7 < bytes.length) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }
  return undefined;
}

function parseWav(bytes: Uint8Array): Pick<MediaInspection, 'durationMs'> | undefined {
  if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WAVE') {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate: number | undefined;
  let dataSize: number | undefined;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    offset += 8;
    if (id === 'fmt ' && size >= 12 && offset + size <= bytes.length) {
      byteRate = view.getUint32(offset + 8, true);
    } else if (id === 'data') {
      dataSize = Math.min(size, bytes.length - offset);
      break;
    }
    offset += size + (size % 2);
  }
  return byteRate && dataSize !== undefined ? { durationMs: Math.round((dataSize / byteRate) * 1000) } : undefined;
}

function parseOgg(bytes: Uint8Array): Pick<MediaInspection, 'durationMs'> | undefined {
  // Ogg files can carry a granule position in the final page.  Without a
  // codec specific sample rate we leave duration unset; the index still
  // exposes a bounded, playable file path.
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === 'OggS') return undefined;
  return undefined;
}

export function inspectMediaBytes(
  bytes: Uint8Array,
  filePath: string,
  indexed?: Partial<MediaInspection>,
): MediaInspection {
  const mimeType = indexed?.mimeType ?? mediaTypeFromPath(filePath);
  const dimensions = parsePng(bytes) ?? parseGif(bytes) ?? parseWebp(bytes) ?? parseJpeg(bytes);
  const audio = parseWav(bytes) ?? parseOgg(bytes);
  const frameCount = indexed?.frameCount;
  return {
    mimeType,
    kind: indexed?.kind ?? mediaKindFromMime(mimeType, filePath, frameCount),
    size: bytes.byteLength,
    ...(dimensions ?? {}),
    ...(audio ?? {}),
    ...(frameCount === undefined ? {} : { frameCount }),
    ...(indexed?.metadata ? { metadata: indexed.metadata } : {}),
  };
}

export async function inspectMediaFile(
  filePath: string,
  indexed?: Partial<MediaInspection>,
): Promise<MediaInspection> {
  const info = await stat(filePath);
  const mimeType = indexed?.mimeType ?? mediaTypeFromPath(filePath);
  const result: MediaInspection = { ...indexed, mimeType, kind: indexed?.kind ?? mediaKindFromMime(mimeType, filePath, indexed?.frameCount), size: info.size };
  if (mimeType.startsWith('image/')) {
    try {
      const metadata = await sharp(filePath, { limitInputPixels: 64 * 1024 * 1024 }).metadata();
      result.width = metadata.width;
      result.height = metadata.pageHeight ?? metadata.height;
      result.frameCount = indexed?.frameCount ?? metadata.pages;
    } catch {
      // Header-only fallback keeps malformed/unsupported formats bounded.
      const file = await open(filePath, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(info.size, 64 * 1024));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        const header = inspectMediaBytes(buffer.subarray(0, bytesRead), filePath, indexed);
        result.width = header.width; result.height = header.height;
      } finally { await file.close(); }
    }
  } else if (mimeType.startsWith('audio/')) {
    try {
      const metadata = await parseFile(filePath, { duration: true, skipCovers: true });
      if (metadata.format.duration !== undefined) result.durationMs = Math.round(metadata.format.duration * 1000);
    } catch { /* Preserve an indexable file even if its codec is unsupported. */ }
  }
  return result;
}

sharp.cache({ memory: 32, files: 16, items: 64 });
sharp.concurrency(2);
const thumbnails = new Map<string, Promise<string>>();

async function thumbnail(source: string, options: ResolveMediaFileOptions, mtime: number, size: number): Promise<string> {
  const cacheRoot = options.cacheRoot ?? resolve(tmpdir(), 'worka-cardgame-media');
  const key = createHash('sha256').update(`${source}\0${options.revision}\0${mtime}\0${size}\0thumbnail-v1`).digest('hex');
  const destination = resolve(cacheRoot, `${key}.png`);
  try { await stat(destination); return destination; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const pending = thumbnails.get(destination);
  if (pending) return pending;
  const work = (async () => {
    await mkdir(cacheRoot, { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await sharp(source, { animated: false, limitInputPixels: 64 * 1024 * 1024 })
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
      .png().toFile(temporary);
    await rename(temporary, destination);
    return destination;
  })();
  thumbnails.set(destination, work);
  try { return await work; } finally { thumbnails.delete(destination); }
}

/**
 * Resolve a previously indexed media file while checking both the lexical and
 * real path.  The host can expose `absolutePath` through a capability route;
 * this helper never follows a symlink outside the project root.
 */
export async function resolveMediaFile(options: ResolveMediaFileOptions): Promise<MediaResponse> {
  const root = await realpath(options.root);
  const absolutePath = resolve(options.absolutePath);
  const lexicalRelative = relative(root, absolutePath);
  if (isAbsolute(lexicalRelative) || lexicalRelative === '..' || lexicalRelative.startsWith(`..${sep}`)) {
    throw new Error('media path escapes project root');
  }

  const resolved = await realpath(absolutePath);
  const actualRelative = relative(root, resolved);
  if (isAbsolute(actualRelative) || actualRelative === '..' || actualRelative.startsWith(`..${sep}`)) {
    throw new Error('media symlink escapes project root');
  }

  const fileStat = await stat(resolved);
  if (!fileStat.isFile()) throw new Error('media path is not a regular file');
  const indexed = options.indexed;
  const completeInspection = indexed?.size !== undefined && indexed.mimeType
    && (!indexed.mimeType.startsWith('image/') || (indexed.width !== undefined && indexed.height !== undefined))
    && (!indexed.mimeType.startsWith('audio/') || indexed.durationMs !== undefined);
  const inspection = completeInspection
    ? { ...indexed, size: fileStat.size, mimeType: indexed!.mimeType! }
    : await inspectMediaFile(resolved, options.indexed);
  const variant = options.variant ?? 'original';
  if (variant === 'waveform') throw new Error('Waveforms are decoded on demand in the selected audio preview');
  const servedPath = variant === 'thumbnail' && inspection.mimeType.startsWith('image/')
    ? await thumbnail(resolved, options, fileStat.mtimeMs, fileStat.size) : resolved;
  const servedStat = servedPath === resolved ? fileStat : await stat(servedPath);
  const response: MediaResponse = {
    id: options.id,
    path: actualRelative.split(sep).join('/'),
    ...(options.versionId ? { versionId: options.versionId } : {}),
    variant,
    mimeType: servedPath === resolved ? inspection.mimeType : 'image/png',
    size: servedStat.size,
    revision: options.revision,
    ...(inspection.width === undefined ? {} : { width: inspection.width }),
    ...(inspection.height === undefined ? {} : { height: inspection.height }),
    ...(inspection.durationMs === undefined ? {} : { durationMs: inspection.durationMs }),
    ...(inspection.frameCount === undefined ? {} : { frameCount: inspection.frameCount }),
    ...(inspection.metadata ? { metadata: inspection.metadata } : {}),
    absolutePath: servedPath,
  };

  // Original bytes are inline only for small files.  Thumbnail and waveform
  // requests remain path based so a host can stream or transform them.
  if (variant === 'original' && options.inlineLimit !== undefined && inspection.size <= options.inlineLimit) {
    const bytes = await readFile(resolved);
    response.data = `data:${inspection.mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  return response;
}

export function candidateSpriteMetadataPath(filePath: string): string[] {
  const ext = extname(filePath);
  const base = ext ? filePath.slice(0, -ext.length) : filePath;
  return [`${filePath}.json`, `${base}.json`];
}

export function normalizeMediaPath(filePath: string): string {
  return filePath.split(sep).join('/');
}

export function isMediaPathWithin(root: string, filePath: string): boolean {
  const child = relative(resolve(root), resolve(filePath));
  return !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`);
}

export function mediaDirectory(filePath: string): string {
  return dirname(filePath);
}
