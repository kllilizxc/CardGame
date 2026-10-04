import { watch, type BigIntStats, type FSWatcher } from 'node:fs';
import {
  mkdir,
  link,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  lstat,
  writeFile,
  open,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { cardCollection } from './card-collections';
import {
  parseStoryRuleJson,
  validateInitialStoryState,
  validateStoryChoiceMetadata,
  validateStoryEffects,
} from './story-rules';
import {
  candidateSpriteMetadataPath,
  inspectMediaFile,
  mediaKindFromMime,
  mediaTypeFromPath,
  resolveMediaFile,
  sniffMediaMime,
  type MediaInspection,
} from './media';
import {
  ContentServiceError,
  type AdoptVersionInput,
  type AssetItem,
  type AssetVersion,
  type AutoAdoptOptions,
  type BacklinkItem,
  type CandidateInspection,
  type CardItem,
  type CandidateInput,
  type CompileStoryInput,
  type CompileStoryResult,
  type ContentCommandMethod,
  type ContentDocument,
  type ContentDocumentMeta,
  type ContentGraph,
  type ContentInvalidation,
  type ContentInvalidationListener,
  type ContentListItem,
  type ContentProject,
  type ContentQuery,
  type ContentService,
  type ContentServiceOptions,
  type ContentStatus,
  type DocumentLink,
  type GraphEdge,
  type GraphNode,
  type InspectionFinding,
  type InspectionKind,
  type MediaQuery,
  type MediaResponse,
  type MoveDocumentInput,
  type MovePreview,
  type Page,
  type RecentChangeItem,
  type RegisterCandidatesInput,
  type SaveDocumentInput,
  type StoryBuildItem,
  type StoryDiagnostic,
  type StoryScenePage,
  type UpdateAssetInput,
  type UpdateCardInput,
} from './types';

const MAX_PAGE_SIZE = 100;
// The host serves media through the bounded capability resolver.  Keeping the
// default at zero prevents ordinary queries from putting binary originals on
// the Worka resource wire; tests or a trusted caller can opt into a limit.
const DEFAULT_INLINE_MEDIA_LIMIT = 0;
const MANIFEST_FILE_NAME = 'asset-manifest.json';
const CARD_DIRECTORY = 'public/data/cards';
const ASSET_DIRECTORY = 'public/assets';
const STORY_DIRECTORY = 'public/data/story';
const CONTENT_CATALOG_PATH = 'public/data/content-catalog.json';
const IGNORED_DIRECTORY_NAMES = new Set(['.git', '.workbench', 'node_modules', 'dist', 'build']);
const CARD_KINDS = new Set(['unit', 'artifact', 'talisman', 'field', 'skill', 'pill']);
const CARD_RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const INSPECTION_KINDS: InspectionKind[] = ['broken-link', 'scene-dead-end', 'orphan-asset', 'card-missing-art', 'asset-missing-metadata'];
const CARD_ART_FIELDS = ['image', 'art', 'illustration', 'icon', 'sprite', 'portrait'];

interface SqliteStatement {
  all(...parameters: unknown[]): unknown[];
  get(...parameters: unknown[]): unknown;
  run(...parameters: unknown[]): unknown;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface ProjectState {
  input: ContentProject;
  root?: string;
  phase: ContentStatus['phase'];
  indexedAt?: string;
  errors: string[];
  watchers: FSWatcher[];
  watchDirectories: string[];
  watchedDirectories: Set<string>;
  pendingEvents: Map<string, NodeJS.Timeout>;
}

interface DocumentRow {
  project_id: string;
  id: string;
  path: string;
  title: string;
  content?: string;
  revision: string;
  mtime_ms: number;
  size: number;
  deleted: number;
  updated_at: string;
  search_text: string;
}

interface DocumentHeader {
  id: string;
  path: string;
  title: string;
  revision: string;
  size: number;
}

interface StorySceneIndexRow {
  revision: string;
  file_fingerprint: string;
  node_id: string;
  chapter: string;
  summary: string;
  dialogue_count: number;
  diagnostics_json: string;
}

interface CardRow {
  project_id: string;
  id: string;
  path: string;
  collection: string;
  kind: string;
  rarity?: string;
  labels_json?: string;
  name: string;
  description: string;
  json?: string;
  face_preview?: string;
  source_revision?: string;
  revision: string;
  mtime_ms: number;
  deleted: number;
  updated_at: string;
}

interface AssetRow {
  project_id: string;
  id: string;
  path: string;
  kind: AssetItem['kind'];
  mime_type: string;
  name?: string;
  tags_json?: string;
  metadata_revision?: string;
  revision: string;
  size: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  frame_count?: number;
  metadata_json: string;
  current_version_id?: string;
  deleted: number;
  updated_at: string;
}

interface AssetVersionRow {
  project_id: string;
  id: string;
  asset_id: string;
  path: string;
  revision: string;
  mime_type: string;
  size: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  frame_count?: number;
  source: AssetVersion['source'];
  candidate_id?: string;
  metadata_json: string;
  created_at: string;
  adopted: number;
}

interface CandidateRow {
  project_id: string;
  id: string;
  name: string;
  file_path: string;
  revision: string;
  mime_type: string;
  size: number;
  metadata_json: string;
  created_at: string;
}

interface StoryBuildRow {
  project_id: string;
  story_id: string;
  entry_path: string;
  output_path: string;
  source_paths_json: string;
  diagnostics_json: string;
  error_count: number;
  warning_count: number;
  node_count: number;
  choice_count: number;
  built_at: string;
}

interface LinkMatch {
  prefix: string;
  target: string;
  suffix: string;
  label: string;
  index: number;
}

interface ParsedTarget {
  local: boolean;
  targetPath: string;
  anchor?: string;
  query?: string;
}

interface AssetManifestEntry {
  id: string;
  path: string;
  currentPath?: string;
  currentVersionId?: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  metadataRevision?: string;
  versions?: Array<{
    id: string;
    path: string;
    revision?: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  }>;
}

interface AssetManifest {
  schemaVersion: 1;
  assets: AssetManifestEntry[];
  /** Lookup table kept out of the JSON file; indexing must not scan the full manifest per asset. */
  entriesByPath: Map<string, AssetManifestEntry>;
  entriesByFilePath: Map<string, AssetManifestEntry>;
}

function dynamicImport(specifier: string): Promise<any> {
  // Keeping the module specifier dynamic is intentional: the native host uses
  // node:sqlite while Bun tests use bun:sqlite.  The production host never
  // loads Bun's adapter.
  return Function('specifier', 'return import(specifier)')(specifier) as Promise<any>;
}

async function openSqlite(path: string): Promise<SqliteDatabase> {
  const runningInBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
  const module = await dynamicImport(runningInBun ? 'bun:sqlite' : 'node:sqlite');
  const Database = runningInBun ? module.Database : module.DatabaseSync;
  if (!Database) throw new Error('SQLite runtime is unavailable');
  const db = new Database(path) as SqliteDatabase;
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashBytes(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fileFingerprint(info: BigIntStats): string {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

async function hashFile(filePath: string): Promise<string> {
  const file = await open(filePath, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest('hex');
  } finally {
    await file.close();
  }
}

function stableId(prefix: string, projectId: string, path: string): string {
  return `${prefix}:${projectId}:${path}`;
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/');
}

function normalizeRelativePath(value: string, label = 'path'): string {
  const replaced = toPosixPath(value.trim());
  if (!replaced || replaced.startsWith('/') || /^[A-Za-z]:\//.test(replaced) || replaced.includes('\0')) {
    throw new ContentServiceError('PATH_ESCAPE', `${label} must be a non-empty relative path.`);
  }
  const normalized = posix.normalize(replaced);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new ContentServiceError('PATH_ESCAPE', `${label} escapes its project root.`);
  }
  return normalized.replace(/^\.\//, '');
}

function isContained(root: string, child: string): boolean {
  const childRelative = relative(root, child);
  return !isAbsolute(childRelative) && childRelative !== '..' && !childRelative.startsWith(`..${sep}`);
}

function clampLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
}

function encodeCursor(path: string): string {
  return Buffer.from(JSON.stringify({ path }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: unknown): string | undefined {
  if (typeof cursor !== 'string' || cursor.length === 0) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { path?: unknown };
    return typeof parsed.path === 'string' ? parsed.path : undefined;
  } catch {
    throw new ContentServiceError('INVALID_INPUT', 'cursor is malformed.');
  }
}

function normalizedSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function queryTerms(query: unknown): string[] {
  if (typeof query !== 'string') return [];
  const normalized = normalizedSearch(query);
  const terms: string[] = [];
  // A quoted run is one term, so `"中文 空格"` searches for that contiguous
  // phrase.  Unquoted runs retain the original token behaviour.  Empty quoted
  // terms are ignored and unmatched quotes degrade to ordinary text.
  for (const match of normalized.matchAll(/"([^"\n]*)"|([^\s"]+)/gu)) {
    const value = (match[1] ?? match[2] ?? '').trim();
    if (value) terms.push(value);
  }
  return terms;
}

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function addSearchSql(
  clauses: string[],
  parameters: unknown[],
  column: string,
  query: unknown,
): void {
  for (const term of queryTerms(query)) {
    clauses.push(`${column} LIKE ? ESCAPE '\\'`);
    parameters.push(`%${escapeLikeTerm(term)}%`);
  }
}

function stringFilterValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))];
}

function addCardFilterSql(
  clauses: string[],
  parameters: unknown[],
  input: { kind?: unknown; rarity?: unknown; tags?: unknown; labels?: unknown },
): void {
  if (typeof input.kind === 'string' && input.kind.trim()) {
    clauses.push('kind = ?');
    parameters.push(input.kind.trim());
  }
  if (typeof input.rarity === 'string' && input.rarity.trim()) {
    clauses.push('rarity = ?');
    parameters.push(input.rarity.trim());
  }
  const tags = stringFilterValues(input.tags ?? input.labels);
  for (const tag of tags) {
    // labels_json is a compact JSON array.  Quoted membership avoids matching
    // a short tag inside a longer one and keeps this filter index-friendly
    // without returning the full card JSON to list callers.
    clauses.push("labels_json LIKE ? ESCAPE '\\'");
    parameters.push(`%"${escapeLikeTerm(tag)}"%`);
  }
}

function matchesSearch(value: string, q: string | undefined): boolean {
  const terms = queryTerms(q);
  if (terms.length === 0) return true;
  const normalized = normalizedSearch(value);
  return terms.every((term) => normalized.includes(term));
}

function makeSnippet(content: string, q?: string): string | undefined {
  const terms = queryTerms(q);
  if (terms.length === 0) return undefined;
  const normalized = normalizedSearch(content);
  const index = terms.map((term) => normalized.indexOf(term)).filter((item) => item >= 0).sort((a, b) => a - b)[0];
  if (index === undefined) return undefined;
  const start = Math.max(0, index - 70);
  const end = Math.min(content.length, index + 150);
  return `${start > 0 ? '…' : ''}${content.slice(start, end).replace(/\s+/gu, ' ')}${end < content.length ? '…' : ''}`;
}

function titleFromMarkdown(path: string, content: string): string {
  const frontmatter = content.match(/^---\s*\n(?:.|\n)*?^title:\s*["']?(.+?)["']?\s*\n(?:.|\n)*?^---\s*$/mu);
  if (frontmatter?.[1]) return frontmatter[1].trim();
  const heading = content.match(/^#{1,6}\s+(.+?)\s*#*\s*$/mu);
  if (heading?.[1]) return heading[1].trim();
  return basename(path, extname(path));
}

function anchorForHeading(value: string): string {
  return normalizedSearch(value)
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff\s-]/gu, '')
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-');
}

function parseMarkdownTarget(rawTarget: string): ParsedTarget {
  const target = rawTarget.trim();
  if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(target)) {
    return { local: false, targetPath: target };
  }
  const hashIndex = target.indexOf('#');
  const withoutAnchor = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : undefined;
  const queryIndex = withoutAnchor.indexOf('?');
  const pathPart = queryIndex >= 0 ? withoutAnchor.slice(0, queryIndex) : withoutAnchor;
  const query = queryIndex >= 0 ? withoutAnchor.slice(queryIndex + 1) : undefined;
  return {
    local: true,
    targetPath: pathPart,
    ...(anchor ? { anchor } : {}),
    ...(query ? { query } : {}),
  };
}

function parseMarkdownLinks(content: string): LinkMatch[] {
  const result: LinkMatch[] = [];
  // This intentionally covers ordinary inline links/images, the syntax the
  // CardGame authoring guide uses. Reference definitions remain plain text and
  // do not get rewritten accidentally during a move.
  const pattern = /(!?\[[^\]]*\]\(\s*)(<[^>]+>|[^)\s]+)(\s*(?:["'][^)]*["'])?\s*\))/gu;
  for (const match of content.matchAll(pattern)) {
    const full = match[0] ?? '';
    const prefix = match[1] ?? '';
    const target = match[2] ?? '';
    const suffix = match[3] ?? '';
    const labelMatch = prefix.match(/^!?\[([^\]]*)\]/u);
    result.push({
      prefix,
      target,
      suffix,
      label: labelMatch?.[1] ?? '',
      index: match.index ?? content.indexOf(full),
    });
  }
  return result;
}

function linkTargetForSource(sourcePath: string, rawTarget: string): ParsedTarget & { path: string } {
  const parsed = parseMarkdownTarget(rawTarget.replace(/^<|>$/gu, ''));
  if (!parsed.local) return { ...parsed, path: parsed.targetPath };
  const rawPath = toPosixPath(parsed.targetPath);
  const combined = rawPath.startsWith('/')
    ? posix.normalize(rawPath.slice(1))
    : posix.normalize(posix.join(posix.dirname(sourcePath), rawPath || posix.basename(sourcePath)));
  return { ...parsed, path: combined.replace(/^\.\//, '') };
}

function sameDocumentTarget(resolvedPath: string, rawPath: string, expectedPath: string): boolean {
  if (resolvedPath === expectedPath) return true;
  if (extname(rawPath)) return false;
  return `${resolvedPath}.md` === expectedPath || `${resolvedPath}.markdown` === expectedPath;
}

function relativeLinkPath(sourcePath: string, targetPath: string, keepExtensionless: boolean, keepDotSlash: boolean): string {
  let value = posix.relative(posix.dirname(sourcePath), targetPath);
  if (!value) value = posix.basename(targetPath);
  if (keepExtensionless && extname(value).toLowerCase() === '.md') value = value.slice(0, -3);
  if (keepDotSlash && !value.startsWith('../') && !value.startsWith('./')) value = `./${value}`;
  return value;
}

function parseSpriteMetadata(value: unknown): { frameCount?: number; metadata?: Record<string, unknown> } {
  const record = asRecord(value);
  if (!record) return {};
  const frames = record.frames;
  if (Array.isArray(frames)) return { frameCount: frames.length, metadata: { frames: frames.length } };
  const frameRecord = asRecord(frames);
  if (frameRecord) return { frameCount: Object.keys(frameRecord).length, metadata: { frames: Object.keys(frameRecord).length } };
  return {};
}

export function frontmatterHasScene(content: string): boolean {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
  if (!frontmatter) return false;
  return /^\s*scene:\s*true\s*$/mu.test(frontmatter[1] ?? '');
}

function optionSectionRanges(content: string): Array<{ start: number; end: number }> {
  const lines = content.split('\n');
  const ranges: Array<{ start: number; end: number }> = [];
  let open: number | undefined;
  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/u);
    if (!heading) continue;
    const lineNumber = index + 1;
    const level = heading[1]!.length;
    if (open !== undefined && level <= 2) {
      ranges.push({ start: open, end: lineNumber - 1 });
      open = undefined;
    }
    if (level === 2 && heading[2] === '选项') open = lineNumber;
  }
  if (open !== undefined) ranges.push({ start: open, end: lines.length });
  return ranges;
}

const SCENE_FRONTMATTER_FIELDS = ['chapter', 'location', 'sublocation', 'locationId', 'sublocationId', 'timeHint'] as const;

/** Reads flat `key: value` frontmatter lines; nested YAML is intentionally out of scope. */
function sceneFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/u);
  const fields: Record<string, string> = {};
  if (!match) return fields;
  for (const line of (match[1] ?? '').split(/\r?\n/u)) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/u);
    if (!entry) continue;
    const value = (entry[2] ?? '').replace(/^["']|["']$/gu, '');
    if (value) fields[entry[1]!] = value;
  }
  return fields;
}

function sceneTags(content: string): string[] {
  const fields = sceneFrontmatter(content);
  const raw = fields.tags;
  if (!raw) return [];
  const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  return inner.split(',').map((tag) => tag.trim().replace(/^["']|["']$/gu, '')).filter(Boolean);
}

function kebabCase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}

function storyNodeId(path: string, fields: Record<string, string> = {}): string {
  if (fields.nodeId) return fields.nodeId;
  const relative = path.startsWith('knowledge/') ? path.slice('knowledge/'.length) : path;
  return `n:${relative}`;
}

function storyChoiceMetadata(lines: readonly string[], line: number): Record<string, unknown> | undefined {
  const sourceLine = lines[line - 1] ?? '';
  const marker = sourceLine.match(/<!--\s*story-choice:\s*([\s\S]*?)\s*-->/u);
  if (!marker) return undefined;
  return validateStoryChoiceMetadata(
    parseStoryRuleJson(marker[1] ?? '', `第 ${line} 行 story-choice`),
    `第 ${line} 行 story-choice`,
  );
}

/** Introductory prose stays separate from paged dialogue and choices. */
function sceneNarrative(content: string, title: string): { summary: string; detail: string } {
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '');
  const lines = body.split(/\r?\n/u);
  const ranges = optionSectionRanges(body);
  const dialogueStart = lines.findIndex(line => /^##\s+对话\s*$/u.test(line.trim()));
  const cut = Math.min(ranges.length > 0 ? ranges[0]!.start - 1 : lines.length, dialogueStart < 0 ? lines.length : dialogueStart);
  const prose = lines.slice(0, cut)
    .filter((line) => !/^#{1,6}\s/u.test(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  const detail = prose || title;
  const summary = (prose.split(/\n\s*\n/u).find((paragraph) => paragraph.trim()) ?? '').trim() || detail;
  return { summary, detail };
}

interface CompiledStoryDialogue {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  emotion?: string;
}

interface SourceStoryDialogue extends CompiledStoryDialogue { line: number }

function sceneDialogues(content: string, path: string, fail: (path: string, detail: string, line?: number) => void): SourceStoryDialogue[] {
  const lines = content.split(/\r?\n/u);
  const headings = lines.flatMap((line, index) => /^##\s+对话\s*$/u.test(line.trim()) ? [index] : []);
  const heading = headings[0] ?? -1;
  if (heading < 0) return [];
  for (const extra of headings.slice(1)) fail(path, '一个场景只能有一个 ## 对话 章节。', extra + 1);
  const options = lines.findIndex(line => /^##\s+选项\s*$/u.test(line.trim()));
  if (options >= 0 && heading > options) fail(path, '## 对话 必须写在 ## 选项 之前。', heading + 1);
  const result: SourceStoryDialogue[] = [];
  for (let index = heading + 1; index < lines.length && !/^##\s+/u.test(lines[index]!.trim()); index++) {
    const line = lines[index]!.trim();
    if (!line) continue;
    const match = line.match(/^-\s*([^：:]+)[：:]\s*(.*?)\s*<!--\s*story-line:\s*(.*?)\s*-->\s*$/u);
    if (!match) { fail(path, '对白需独占一行，格式为 - 说话者：台词 <!-- story-line: {"id":"...","speakerId":"..."} -->。', index + 1); continue; }
    try {
      const metadata = parseStoryRuleJson(match[3]!, `第 ${index + 1} 行 story-line`);
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Error('story-line 需要 JSON 对象');
      const fields = metadata as Record<string, unknown>;
      const id = fields.id, speakerId = fields.speakerId, emotion = fields.emotion;
      const speakerName = match[1]!.trim(), text = match[2]!.trim();
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(id)
        || typeof speakerId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(speakerId)
        || !speakerName || !text || text.length > 500 || emotion !== undefined && (typeof emotion !== 'string' || emotion.length > 80)) {
        throw Error('对白 ID、speakerId、说话者或台词无效（单条台词最多 500 字）');
      }
      result.push({ id, speakerId, speakerName, text, ...(emotion ? { emotion } : {}), line: index + 1 });
    } catch (error) { fail(path, error instanceof Error ? error.message : String(error), index + 1); }
  }
  return result;
}

export async function inspectCandidateFile(filePath: string, declaredMime: string, size: number): Promise<CandidateInspection> {
  const reasons: string[] = [];
  if (size === 0) reasons.push('candidate bytes are empty.');
  let sniffed: string | undefined;
  if (size > 0) {
    const file = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(size, 64 * 1024));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      sniffed = sniffMediaMime(buffer.subarray(0, bytesRead));
    } finally {
      await file.close();
    }
  }
  const mime = declaredMime || sniffed || mediaTypeFromPath(filePath);
  if (sniffed && declaredMime && sniffed !== declaredMime) {
    reasons.push(`declared mimeType ${declaredMime} does not match sniffed ${sniffed}.`);
  }
  if (mime.startsWith('image/')) {
    const inspection = await inspectMediaFile(filePath, { mimeType: mime }).catch(() => undefined);
    if (!inspection || inspection.width === undefined || inspection.height === undefined) {
      reasons.push('image candidate is not decodable or lacks dimensions.');
    }
  } else if (mime.startsWith('audio/')) {
    const inspection = await inspectMediaFile(filePath, { mimeType: mime }).catch(() => undefined);
    if (!inspection || inspection.durationMs === undefined) {
      reasons.push('audio candidate is not decodable or lacks a duration.');
    }
  }
  return { passed: reasons.length === 0, reasons };
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContentServiceError('INVALID_INPUT', `${label} must be a non-empty string.`);
  }
  return value;
}

function contentDocumentFromRow(row: DocumentRow, links: DocumentLink[], q?: string, includeContent = true): ContentDocument {
  const source = row.content ?? '';
  const snippet = makeSnippet(`${row.title}\n${row.path}\n${source}`, q);
  return {
    id: row.id,
    title: row.title,
    path: row.path,
    revision: row.revision,
    type: 'document',
    ...(includeContent ? { content: source } : {}),
    links,
    size: row.size,
    updatedAt: row.updated_at,
    ...(snippet ? { snippet } : {}),
  };
}

function cardFromRow(row: CardRow): CardItem {
  const json = parseJson<Record<string, unknown>>(row.json, {});
  const rarity = row.rarity || (typeof json.rarity === 'string' ? json.rarity : undefined);
  const labels = row.labels_json
    ? parseJson<unknown[]>(row.labels_json, []).filter((label): label is string => typeof label === 'string')
    : (Array.isArray(json.labels) ? json.labels.filter((label): label is string => typeof label === 'string') : []);
  return {
    id: row.id,
    title: row.name,
    path: row.path,
    revision: row.revision,
    type: 'card',
    kind: row.kind,
    name: row.name,
    description: row.description,
    ...(rarity ? { rarity } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(typeof row.face_preview === 'string' && row.face_preview.startsWith('/assets/card-faces/') ? { facePreview: row.face_preview } : {}),
    ...(row.json ? { json } : {}),
  };
}

function assetVersionFromRow(row: AssetVersionRow): AssetVersion {
  return {
    id: row.id,
    assetId: row.asset_id,
    path: row.path,
    revision: row.revision,
    mimeType: row.mime_type,
    size: row.size,
    ...(row.width == null ? {} : { width: row.width }),
    ...(row.height == null ? {} : { height: row.height }),
    ...(row.duration_ms == null ? {} : { durationMs: row.duration_ms }),
    ...(row.frame_count == null ? {} : { frameCount: row.frame_count }),
    source: row.source,
    ...(row.candidate_id ? { candidateId: row.candidate_id } : {}),
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
    adopted: row.adopted !== 0,
  };
}

function assetFromRow(row: AssetRow, versions?: AssetVersion[]): AssetItem {
  const storedMetadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
  const metadataName = typeof storedMetadata.name === 'string' ? storedMetadata.name : undefined;
  const metadataTags = Array.isArray(storedMetadata.tags) ? storedMetadata.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const name = row.name?.trim() || metadataName;
  const tags = row.tags_json ? parseJson<string[]>(row.tags_json, metadataTags).filter((tag) => typeof tag === 'string') : metadataTags;
  const { name: _storedName, tags: _storedTags, ...metadata } = storedMetadata;
  const metadataRevision = row.metadata_revision || hashBytes(row.metadata_json);
  return {
    id: row.id,
    title: name || basename(row.path, extname(row.path)),
    path: row.path,
    revision: row.revision,
    type: 'asset',
    ...(name ? { name } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    metadataRevision,
    kind: row.kind,
    mimeType: row.mime_type,
    size: row.size,
    ...(row.width == null ? {} : { width: row.width }),
    ...(row.height == null ? {} : { height: row.height }),
    ...(row.duration_ms == null ? {} : { durationMs: row.duration_ms }),
    ...(row.frame_count == null ? {} : { frameCount: row.frame_count }),
    ...(row.current_version_id ? { currentVersionId: row.current_version_id } : {}),
    format: extname(row.path).replace(/^\./u, '').toLowerCase() || undefined,
    status: 'ready',
    metadata,
    ...(versions ? { versions } : {}),
  };
}

function addAssetFilterSql(
  clauses: string[],
  parameters: unknown[],
  input: { kind?: unknown; mimeType?: unknown; format?: unknown; minWidth?: unknown; maxWidth?: unknown; minDurationMs?: unknown; maxDurationMs?: unknown },
): void {
  if (typeof input.kind === 'string' && input.kind.trim()) {
    clauses.push('(kind = ? OR mime_type = ?)');
    parameters.push(input.kind.trim(), input.kind.trim());
  }
  if (typeof input.mimeType === 'string' && input.mimeType.trim()) {
    clauses.push('lower(mime_type) = lower(?)');
    parameters.push(input.mimeType.trim());
  }
  if (typeof input.format === 'string' && input.format.trim()) {
    const format = input.format.trim().replace(/^\.+/u, '').toLowerCase();
    if (format) {
      clauses.push("lower(path) LIKE ? ESCAPE '\\'");
      parameters.push(`%.${escapeLikeTerm(format)}`);
    }
  }
  const ranges: Array<[unknown, string]> = [
    [input.minWidth, 'width >= ?'],
    [input.maxWidth, 'width <= ?'],
    [input.minDurationMs, 'duration_ms >= ?'],
    [input.maxDurationMs, 'duration_ms <= ?'],
  ];
  for (const [value, clause] of ranges) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const column = clause.startsWith('width') ? 'width' : 'duration_ms';
    clauses.push(`${column} IS NOT NULL AND ${clause}`);
    parameters.push(value);
  }
}

function candidateAssetFromRow(row: CandidateRow, dataRoot: string): AssetItem {
  const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
  const frameCount = readNumber(metadata.frameCount ?? metadata.frames);
  const metadataKind = typeof metadata.kind === 'string' && ['image', 'audio', 'spritesheet', 'other'].includes(metadata.kind)
    ? metadata.kind as AssetItem['kind']
    : undefined;
  const path = toPosixPath(relative(dataRoot, row.file_path));
  const kind = metadataKind ?? mediaKindFromMime(row.mime_type, row.file_path, frameCount);
  const name = row.name || basename(row.file_path);
  return {
    id: row.id,
    title: name,
    path,
    revision: row.revision,
    type: 'asset',
    name,
    format: extname(row.file_path).replace(/^\./u, '').toLowerCase() || undefined,
    status: 'candidate',
    kind,
    mimeType: row.mime_type,
    size: row.size,
    ...(readNumber(metadata.width) === undefined ? {} : { width: readNumber(metadata.width) }),
    ...(readNumber(metadata.height) === undefined ? {} : { height: readNumber(metadata.height) }),
    ...(readNumber(metadata.durationMs) === undefined ? {} : { durationMs: readNumber(metadata.durationMs) }),
    ...(frameCount === undefined ? {} : { frameCount }),
    metadata,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  root TEXT NOT NULL,
  title TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  revision TEXT NOT NULL,
  mtime_ms REAL NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, id),
  UNIQUE (project_id, path)
);
CREATE INDEX IF NOT EXISTS documents_path_idx ON documents(project_id, deleted, path);
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents(project_id, deleted, search_text);
CREATE TABLE IF NOT EXISTS story_scene_index (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  revision TEXT NOT NULL,
  file_fingerprint TEXT NOT NULL,
  node_id TEXT NOT NULL,
  chapter TEXT NOT NULL,
  summary TEXT NOT NULL,
  dialogue_count INTEGER NOT NULL,
  diagnostics_json TEXT NOT NULL,
  PRIMARY KEY(project_id, path)
);
CREATE TABLE IF NOT EXISTS story_dialogue_lines (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  id TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  emotion TEXT,
  source_line INTEGER NOT NULL,
  PRIMARY KEY(project_id, path, ordinal)
);
CREATE INDEX IF NOT EXISTS story_dialogue_speaker_idx ON story_dialogue_lines(project_id, speaker_id, path);
CREATE TABLE IF NOT EXISTS document_revisions (
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, document_id, revision)
);
CREATE TABLE IF NOT EXISTS document_links (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_path TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT,
  anchor TEXT,
  label TEXT,
  line INTEGER NOT NULL,
  raw_target TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS document_links_target_idx ON document_links(project_id, target_path);
CREATE INDEX IF NOT EXISTS document_links_source_idx ON document_links(project_id, source_id);
CREATE TABLE IF NOT EXISTS directories (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  revision TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(project_id, path)
);
CREATE TABLE IF NOT EXISTS cards (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  collection TEXT NOT NULL,
  kind TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  json TEXT NOT NULL,
  source_revision TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL,
  mtime_ms REAL NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, id)
);
CREATE INDEX IF NOT EXISTS cards_path_idx ON cards(project_id, path, deleted);
CREATE INDEX IF NOT EXISTS cards_search_idx ON cards(project_id, deleted, name, kind);
CREATE TABLE IF NOT EXISTS card_revisions (
  project_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, card_id, revision)
);
CREATE TABLE IF NOT EXISTS assets (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_revision TEXT NOT NULL DEFAULT '',
  revision TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  duration_ms REAL,
  frame_count REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  current_version_id TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, id),
  UNIQUE(project_id, path)
);
CREATE INDEX IF NOT EXISTS assets_path_idx ON assets(project_id, deleted, path);
CREATE TABLE IF NOT EXISTS asset_versions (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  path TEXT NOT NULL,
  revision TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  width REAL,
  height REAL,
  duration_ms REAL,
  frame_count REAL,
  source TEXT NOT NULL,
  candidate_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  adopted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(project_id, id)
);
CREATE INDEX IF NOT EXISTS asset_versions_asset_idx ON asset_versions(project_id, asset_id, created_at DESC);
CREATE TABLE IF NOT EXISTS candidates (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  revision TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, id)
);
CREATE TABLE IF NOT EXISTS story_builds (
  project_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  entry_path TEXT NOT NULL DEFAULT '',
  output_path TEXT NOT NULL,
  source_paths_json TEXT NOT NULL DEFAULT '[]',
  diagnostics_json TEXT NOT NULL DEFAULT '[]',
  error_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  node_count INTEGER NOT NULL DEFAULT 0,
  choice_count INTEGER NOT NULL DEFAULT 0,
  built_at TEXT NOT NULL,
  PRIMARY KEY(project_id, story_id)
);
`;

class ContentServiceImpl implements ContentService {
  private readonly options: ContentServiceOptions;
  private readonly dataRoot: string;
  private readonly projects = new Map<string, ProjectState>();
  private readonly listeners = new Set<ContentInvalidationListener>();
  private readonly pendingStoryRebuilds = new Set<string>();
  private readonly inlineMediaLimit: number;
  private readonly dbReady: Promise<SqliteDatabase>;
  private readonly ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private db?: SqliteDatabase;
  private closed = false;
  private manifestCache = new Map<string, AssetManifest>();

  constructor(options: ContentServiceOptions) {
    if (!options || typeof options.dataRoot !== 'string' || !Array.isArray(options.projects)) {
      throw new ContentServiceError('INVALID_INPUT', 'dataRoot and projects are required.');
    }
    this.options = options;
    this.dataRoot = resolve(options.dataRoot);
    this.inlineMediaLimit = options.inlineMediaLimit ?? DEFAULT_INLINE_MEDIA_LIMIT;
    for (const project of options.projects) {
      if (!project || typeof project.id !== 'string' || project.id.trim().length === 0 || typeof project.root !== 'string') {
        throw new ContentServiceError('INVALID_INPUT', 'each project requires a non-empty id and root.');
      }
      if (this.projects.has(project.id)) {
        throw new ContentServiceError('INVALID_INPUT', `duplicate project id: ${project.id}`);
      }
      this.projects.set(project.id, {
        input: { ...project },
        phase: 'pending',
        errors: [],
        watchers: [],
        watchDirectories: [],
        watchedDirectories: new Set(),
        pendingEvents: new Map(),
      });
    }
    const dbPath = options.dbPath === ':memory:' ? options.dbPath : resolve(options.dbPath ?? `${this.dataRoot}/content.sqlite`);
    this.dbReady = this.openDatabase(dbPath);
    this.ready = this.initialize();
    this.ready.catch(() => {});
  }

  private async openDatabase(dbPath: string): Promise<SqliteDatabase> {
    if (dbPath !== ':memory:') await mkdir(dirname(dbPath), { recursive: true });
    const db = await openSqlite(dbPath);
    db.exec(SCHEMA_SQL);
    // Databases created by the first backend revision did not record the
    // source collection hash.  Keep them readable and let the next index fill
    // the new CAS column instead of discarding canonical card history.
    try {
      db.exec("ALTER TABLE cards ADD COLUMN source_revision TEXT NOT NULL DEFAULT ''");
    } catch {
      // Column already exists on a current database.
    }
    try {
      db.exec("ALTER TABLE story_builds ADD COLUMN entry_path TEXT NOT NULL DEFAULT ''");
    } catch {
      // Column already exists on a current database.
    }
    for (const statement of [
      "ALTER TABLE cards ADD COLUMN rarity TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE cards ADD COLUMN labels_json TEXT NOT NULL DEFAULT '[]'",
    ]) {
      try { db.exec(statement); } catch { /* Column already exists on a current database. */ }
    }
    for (const statement of [
      "ALTER TABLE assets ADD COLUMN name TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE assets ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE assets ADD COLUMN metadata_revision TEXT NOT NULL DEFAULT ''",
    ]) {
      try { db.exec(statement); } catch { /* Column already exists on a current database. */ }
    }
    // This index references migrated card columns, so create it only after
    // upgrades have added those columns to an older content.sqlite.
    db.exec('CREATE INDEX IF NOT EXISTS cards_filter_idx ON cards(project_id, deleted, rarity, kind, path, id)');
    this.db = db;
    return db;
  }

  private async initialize(): Promise<void> {
    const db = await this.dbReady;
    if (this.closed) return;
    for (const state of this.projects.values()) {
      try {
        state.root = await realpath(resolve(state.input.root));
        db.prepare('INSERT INTO projects(id, root, title) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET root=excluded.root, title=excluded.title')
          .run(state.input.id, state.root, state.input.title ?? null);
        state.phase = 'indexing';
      } catch (error) {
        state.phase = 'error';
        state.errors.push(`Unable to register project ${state.input.id}: ${toErrorMessage(error)}`);
      }
    }

    // A single SQLite connection backs all projects.  Serialize initial
    // project transactions so concurrent BEGINs cannot contend while keeping
    // the constructor itself asynchronous and status-visible.
    for (const state of this.projects.values()) {
      if (!state.root || state.phase === 'error' || this.closed) continue;
      try {
        await this.indexProject(state);
        state.phase = 'ready';
        state.indexedAt = nowIso();
        this.startWatcher(state);
        this.notify({ projectId: state.input.id, reason: 'index', kinds: ['status', 'document', 'directory', 'card', 'asset'] });
      } catch (error) {
        state.phase = 'error';
        state.errors.push(toErrorMessage(error));
      }
    }
  }

  private getDatabase(): SqliteDatabase {
    if (!this.db) throw new ContentServiceError('SERVICE_CLOSED', 'content database is not ready.');
    return this.db;
  }

  private project(projectId: string): ProjectState {
    const state = this.projects.get(projectId);
    if (!state) throw new ContentServiceError('NOT_FOUND', `unknown content project: ${projectId}`);
    return state;
  }

  private async requireReady(): Promise<void> {
    if (this.closed) throw new ContentServiceError('SERVICE_CLOSED', 'content service is closed.');
    await this.dbReady;
    await this.ready;
    await this.writeQueue;
  }

  private async requireInitialized(): Promise<void> {
    if (this.closed) throw new ContentServiceError('SERVICE_CLOSED', 'content service is closed.');
    await this.dbReady;
    await this.ready;
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = this.writeQueue.then(async () => operation());
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private notify(event: ContentInvalidation): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A subscriber cannot break indexing or a mutation.
      }
    }
  }

  subscribe(listener: ContentInvalidationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async query(input: ContentQuery): Promise<unknown> {
    if (!input || typeof input !== 'object') throw new ContentServiceError('INVALID_INPUT', 'query input must be an object.');
    const projectId = ensureString((input as { projectId?: unknown }).projectId, 'projectId');
    this.project(projectId);
    if (input.op === 'status') return this.queryStatus(projectId);
    await this.requireReady();
    switch (input.op) {
      case 'documents': return this.queryDocuments(input);
      case 'directories': return this.queryDirectories(input);
      case 'document': return this.queryDocument(input);
      case 'documentMeta': return this.queryDocumentMeta(input);
      case 'backlinks': return this.queryBacklinks(input);
      case 'graph': return this.queryGraph(input);
      case 'movePreview': return this.queryMovePreview(input);
      case 'cards': return this.queryCards(input);
      case 'card': return this.queryCard(input);
      case 'assets': return this.queryAssets(input);
      case 'asset': return this.queryAsset(input);
      case 'versions': return this.queryVersions(input);
      case 'inspection': return this.queryInspection(input);
      case 'recentChanges': return this.queryRecentChanges(input);
      case 'storyBuilds': return this.queryStoryBuilds(input);
      case 'storyScenePage': return this.queryStoryScenePage(input);
      case 'media': return this.queryMedia(input);
      default: throw new ContentServiceError('INVALID_INPUT', `unknown content query operation: ${(input as { op?: unknown }).op}`);
    }
  }

  async command(method: ContentCommandMethod, input: unknown): Promise<unknown> {
    if (this.closed) throw new ContentServiceError('SERVICE_CLOSED', 'content service is closed.');
    await this.requireInitialized();
    switch (method) {
      case 'saveDocument': return this.enqueue(() => this.saveDocument(input as SaveDocumentInput));
      case 'moveDocument': return this.enqueue(() => this.moveDocument(input as MoveDocumentInput));
      case 'updateCard': return this.enqueue(() => this.updateCard(input as UpdateCardInput));
      case 'savePipelineCard': return this.enqueue(() => this.savePipelineCard(input as any));
      case 'updateAsset': return this.enqueue(() => this.updateAsset(input as UpdateAssetInput));
      case 'registerCandidates': return this.enqueue(() => this.registerCandidates(input as RegisterCandidatesInput));
      case 'adoptVersion': return this.enqueue(() => this.adoptVersion(input as AdoptVersionInput));
      case 'compileStory': return this.enqueue(() => this.compileStory(input as CompileStoryInput));
      default: throw new ContentServiceError('INVALID_INPUT', `unknown content command: ${method}`);
    }
  }

  async resolveMedia(input: MediaQuery): Promise<MediaResponse> {
    if (!input || input.op !== 'media') throw new ContentServiceError('INVALID_INPUT', 'resolveMedia requires a media query.');
    const projectId = ensureString(input.projectId, 'projectId');
    await this.requireInitialized();
    return this.resolveMediaQuery(input, projectId);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const state of this.projects.values()) {
      for (const watcher of state.watchers) watcher.close();
      state.watchers.length = 0;
      state.watchedDirectories.clear();
      for (const timer of state.pendingEvents.values()) clearTimeout(timer);
      state.pendingEvents.clear();
      state.phase = 'closed';
    }
    await this.ready.catch(() => undefined);
    // Drain an already-authorized mutation before closing SQLite.  New
    // commands are rejected by `closed`, while an in-flight queue item still
    // owns the database connection until it resolves.
    await this.writeQueue.catch(() => undefined);
    await this.dbReady.then((db) => db.close(), () => undefined);
    this.db = undefined;
    this.listeners.clear();
  }

  private async queryStatus(projectId: string): Promise<ContentStatus> {
    const state = this.project(projectId);
    await this.dbReady.catch(() => undefined);
    const db = this.db;
    if (!db) {
      return { projectId, phase: state.phase, indexedAt: state.indexedAt, documents: 0, directories: 0, cards: 0, assets: 0, errors: [...state.errors] };
    }
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ? AND deleted = 0`).get(projectId) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    };
    return {
      projectId,
      phase: state.phase,
      ...(state.indexedAt ? { indexedAt: state.indexedAt } : {}),
      documents: count('documents'),
      directories: count('directories'),
      cards: count('cards'),
      assets: count('assets'),
      errors: [...state.errors],
    };
  }

  private async listProjectFiles(root: string): Promise<{
    directories: string[];
    documents: string[];
    cards: string[];
    assets: string[];
  }> {
    const directories: string[] = [];
    const documents: string[] = [];
    const cards: string[] = [];
    const assets: string[] = [];
    const walk = async (absolute: string, relativeDirectory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(absolute, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..' || IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
        const childAbsolute = resolve(absolute, entry.name);
        const childRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) {
          // Symlinks are ignored during indexing.  Serving or writing through
          // one could otherwise turn a relative project path into an escape.
          continue;
        }
        if (entry.isDirectory()) {
          directories.push(childRelative);
          await walk(childAbsolute, childRelative);
          continue;
        }
        if (!entry.isFile()) continue;
        const normalized = toPosixPath(childRelative);
        if (/\.(?:md|markdown)$/iu.test(normalized)) documents.push(normalized);
        if (normalized.startsWith(`${CARD_DIRECTORY}/`) && extname(normalized).toLowerCase() === '.json') cards.push(normalized);
        if (normalized.startsWith(`${ASSET_DIRECTORY}/`) && normalized !== `${ASSET_DIRECTORY}/${MANIFEST_FILE_NAME}`) assets.push(normalized);
      }
    };
    await walk(root, '');
    return { directories, documents, cards, assets };
  }

  private async indexProject(state: ProjectState): Promise<void> {
    if (!state.root) return;
    const db = this.getDatabase();
    const files = await this.listProjectFiles(state.root);
    // The watcher is installed per directory after this initial walk.  Linux
    // does not support a bounded recursive fs.watch for this use case, and a
    // recursive watcher would also traverse a symlinked node_modules tree.
    state.watchDirectories = files.directories;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE documents SET deleted = 1 WHERE project_id = ?').run(state.input.id);
      db.prepare('UPDATE directories SET deleted = 1 WHERE project_id = ?').run(state.input.id);
      db.prepare('UPDATE cards SET deleted = 1 WHERE project_id = ?').run(state.input.id);
      db.prepare('UPDATE assets SET deleted = 1 WHERE project_id = ?').run(state.input.id);

      for (const path of files.directories) {
        const revision = hashBytes(path);
        db.prepare(`
          INSERT INTO directories(project_id, path, revision, deleted)
          VALUES (?, ?, ?, 0)
          ON CONFLICT(project_id, path) DO UPDATE SET revision=excluded.revision, deleted=0
        `).run(state.input.id, path, revision);
      }
      for (const path of files.documents) await this.indexDocumentFile(state, path);
      db.prepare('DELETE FROM story_dialogue_lines WHERE project_id = ? AND path NOT IN (SELECT path FROM documents WHERE project_id = ? AND deleted = 0)').run(state.input.id, state.input.id);
      db.prepare('DELETE FROM story_scene_index WHERE project_id = ? AND path NOT IN (SELECT path FROM documents WHERE project_id = ? AND deleted = 0)').run(state.input.id, state.input.id);
      for (const path of files.cards) await this.indexCardFile(state, path);
      await this.loadManifest(state.input.id);
      for (const path of files.assets) await this.indexAssetFile(state, path);
      this.rebuildAllLinks(state.input.id);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* Preserve the original index error. */ }
      throw error;
    }
  }

  private async indexDocumentFile(state: ProjectState, path: string): Promise<DocumentRow | undefined> {
    if (!state.root) return undefined;
    const safePath = normalizeRelativePath(path);
    const absolute = await this.safeExistingPath(state, safePath);
    if (!absolute) {
      this.markDocumentDeleted(state.input.id, safePath);
      return undefined;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const beforeRead = await stat(absolute, { bigint: true });
      if (!beforeRead.isFile()) return undefined;
      const content = await readFile(absolute, 'utf8');
      const afterRead = await stat(absolute, { bigint: true });
      if (afterRead.isFile() && fileFingerprint(beforeRead) === fileFingerprint(afterRead)) {
        return this.upsertDocument(state.input.id, safePath, content, afterRead);
      }
    }
    throw new ContentServiceError('CONTENT_CONFLICT', `document changed during indexing: ${safePath}`);
  }

  private upsertDocument(projectId: string, path: string, content: string, fileStat: BigIntStats): DocumentRow {
    const db = this.getDatabase();
    const existing = db.prepare('SELECT * FROM documents WHERE project_id = ? AND path = ?').get(projectId, path) as DocumentRow | undefined;
    const id = existing?.id ?? stableId('document', projectId, path);
    const revision = hashBytes(content);
    const mtimeMs = Number(fileStat.mtimeNs) / 1_000_000;
    const size = Number(fileStat.size);
    const title = titleFromMarkdown(path, content);
    const updatedAt = nowIso();
    const searchText = normalizedSearch(`${path}\n${title}\n${content}`);
    db.prepare(`
      INSERT INTO documents(project_id, id, path, title, content, revision, mtime_ms, size, deleted, updated_at, search_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET
        path=excluded.path, title=excluded.title, content=excluded.content,
        revision=excluded.revision, mtime_ms=excluded.mtime_ms, size=excluded.size,
        deleted=0, updated_at=excluded.updated_at, search_text=excluded.search_text
    `).run(projectId, id, path, title, content, revision, mtimeMs, size, updatedAt, searchText);
    if (!existing || existing.revision !== revision) {
      db.prepare('INSERT OR IGNORE INTO document_revisions(project_id, document_id, revision, content, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, id, revision, content, updatedAt);
    }
    this.updateStorySceneIndex(projectId, path, content, revision, title, fileStat);
    return db.prepare('SELECT * FROM documents WHERE project_id = ? AND id = ?').get(projectId, id) as DocumentRow;
  }

  private updateStorySceneIndex(projectId: string, path: string, content: string, revision: string, title: string, fileStat: BigIntStats): void {
    const db = this.getDatabase();
    if (!frontmatterHasScene(content)) {
      this.deleteStorySceneIndex(projectId, path);
      return;
    }
    const fingerprint = fileFingerprint(fileStat);
    const previous = db.prepare('SELECT revision, file_fingerprint FROM story_scene_index WHERE project_id = ? AND path = ?')
      .get(projectId, path) as Pick<StorySceneIndexRow, 'revision' | 'file_fingerprint'> | undefined;
    if (previous?.revision === revision && previous.file_fingerprint === fingerprint) return;

    const fields = sceneFrontmatter(content);
    const diagnostics: StoryDiagnostic[] = [];
    const lines = sceneDialogues(content, path, (sourcePath, detail, line) => {
      diagnostics.push({ severity: 'error', path: sourcePath, ...(line !== undefined ? { line } : {}), detail });
    });
    const narrative = sceneNarrative(content, title);
    db.exec('SAVEPOINT story_scene_index_update');
    try {
      db.prepare('DELETE FROM story_dialogue_lines WHERE project_id = ? AND path = ?').run(projectId, path);
      const insert = db.prepare(`
        INSERT INTO story_dialogue_lines(project_id, path, ordinal, id, speaker_id, speaker_name, text, emotion, source_line)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [ordinal, line] of lines.entries()) {
        insert.run(projectId, path, ordinal, line.id, line.speakerId, line.speakerName, line.text, line.emotion ?? null, line.line);
      }
      db.prepare(`
        INSERT INTO story_scene_index(project_id, path, revision, file_fingerprint, node_id, chapter, summary, dialogue_count, diagnostics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, path) DO UPDATE SET
          revision=excluded.revision, file_fingerprint=excluded.file_fingerprint, node_id=excluded.node_id,
          chapter=excluded.chapter, summary=excluded.summary, dialogue_count=excluded.dialogue_count,
          diagnostics_json=excluded.diagnostics_json
      `).run(projectId, path, revision, fingerprint, storyNodeId(path, fields), fields.chapter ?? '',
        narrative.summary.slice(0, 240), lines.length, jsonStringify(diagnostics));
      db.exec('RELEASE SAVEPOINT story_scene_index_update');
    } catch (error) {
      db.exec('ROLLBACK TO SAVEPOINT story_scene_index_update');
      db.exec('RELEASE SAVEPOINT story_scene_index_update');
      throw error;
    }
  }

  private deleteStorySceneIndex(projectId: string, path: string): void {
    const db = this.getDatabase();
    db.prepare('DELETE FROM story_dialogue_lines WHERE project_id = ? AND path = ?').run(projectId, path);
    db.prepare('DELETE FROM story_scene_index WHERE project_id = ? AND path = ?').run(projectId, path);
  }

  private markDocumentDeleted(projectId: string, path: string): void {
    const db = this.getDatabase();
    db.prepare('UPDATE documents SET deleted = 1, updated_at = ? WHERE project_id = ? AND path = ?').run(nowIso(), projectId, path);
    this.deleteStorySceneIndex(projectId, path);
  }

  private async indexCardFile(state: ProjectState, path: string): Promise<void> {
    if (!state.root) return;
    const absolute = await this.safeExistingPath(state, path);
    if (!absolute) {
      this.markCardsDeletedByPath(state.input.id, path);
      return;
    }
    let parsed: unknown;
    let sourceRevision: string;
    try {
      const sourceText = await readFile(absolute, 'utf8');
      sourceRevision = hashBytes(sourceText);
      parsed = JSON.parse(sourceText);
    } catch (error) {
      state.errors.push(`${path}: invalid JSON: ${toErrorMessage(error)}`);
      this.markCardsDeletedByPath(state.input.id, path);
      return;
    }
    const rootRecord = asRecord(parsed);
    if (!rootRecord) {
      state.errors.push(`${path}: card collection must be an object.`);
      return;
    }
    const collections = Object.entries(rootRecord).filter(([, value]) => Array.isArray(value));
    const fileStat = await stat(absolute);
    const seen = new Set<string>();
    for (const [collection, values] of collections) {
      for (const value of values as unknown[]) {
        try {
          validateCard(value);
        } catch (error) {
          state.errors.push(`${path} ${collection}: ${toErrorMessage(error)}`);
          continue;
        }
        const card = value as Record<string, unknown>;
        const id = String(card.id);
        seen.add(id);
        const cardJson = jsonStringify(card);
        const rarity = typeof card.rarity === 'string' ? card.rarity : '';
        const labels = Array.isArray(card.labels)
          ? card.labels.filter((label): label is string => typeof label === 'string')
          : [];
        const revision = hashBytes(cardJson);
        const existing = this.getDatabase().prepare('SELECT revision FROM cards WHERE project_id = ? AND id = ?').get(state.input.id, id) as { revision?: string } | undefined;
        this.getDatabase().prepare(`
          INSERT INTO cards(project_id, id, path, collection, kind, rarity, labels_json, name, description, json, source_revision, revision, mtime_ms, deleted, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
          ON CONFLICT(project_id, id) DO UPDATE SET
            path=excluded.path, collection=excluded.collection, kind=excluded.kind,
            rarity=excluded.rarity, labels_json=excluded.labels_json,
            name=excluded.name, description=excluded.description, json=excluded.json,
            source_revision=excluded.source_revision, revision=excluded.revision, mtime_ms=excluded.mtime_ms, deleted=0, updated_at=excluded.updated_at
        `).run(
          state.input.id,
          id,
          path,
          collection,
          String(card.kind),
          rarity,
          jsonStringify(labels),
          String(card.name),
          typeof card.description === 'string' ? card.description : '',
          cardJson,
          sourceRevision,
          revision,
          fileStat.mtimeMs,
          nowIso(),
        );
        if (!existing || existing.revision !== revision) {
          this.getDatabase().prepare('INSERT OR IGNORE INTO card_revisions(project_id, card_id, revision, json, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(state.input.id, id, revision, cardJson, nowIso());
        }
      }
    }
    const db = this.getDatabase();
    const stale = db.prepare('SELECT id FROM cards WHERE project_id = ? AND path = ? AND deleted = 0').all(state.input.id, path) as Array<{ id: string }>;
    for (const row of stale) if (!seen.has(row.id)) db.prepare('UPDATE cards SET deleted = 1 WHERE project_id = ? AND id = ?').run(state.input.id, row.id);
  }

  private markCardsDeletedByPath(projectId: string, path: string): void {
    this.getDatabase().prepare('UPDATE cards SET deleted = 1 WHERE project_id = ? AND path = ?').run(projectId, path);
  }

  private async indexAssetFile(state: ProjectState, path: string): Promise<void> {
    if (!state.root) return;
    const manifest = this.manifestCache.get(state.input.id);
    const manifestEntry = manifest?.entriesByFilePath.get(path);
    // Historical version files stay in the project for reproducibility but do
    // not become duplicate main-list assets.  If adoption moved the current
    // file, the old logical usage path is also kept out of the scan; its
    // logical asset row is rehydrated from the current version path.
    if (manifestEntry?.currentPath && path !== manifestEntry.currentPath) return;
    const absolute = await this.safeExistingPath(state, path);
    if (!absolute) {
      this.getDatabase().prepare('UPDATE assets SET deleted = 1 WHERE project_id = ? AND path = ?').run(state.input.id, path);
      return;
    }
    const fileStat = await stat(absolute);
    if (!fileStat.isFile()) return;
    // Hash media incrementally.  Asset indexing must remain bounded even for
    // large audio files and a project with tens of thousands of images.
    const revision = await hashFile(absolute);
    const isJsonAsset = extname(path).toLowerCase() === '.json';
    const jsonBytes = isJsonAsset ? await readFile(absolute) : undefined;
    let spriteInfo: { frameCount?: number; metadata?: Record<string, unknown> } = {};
    if (extname(path).toLowerCase() !== '.json') {
      for (const metadataPath of candidateSpriteMetadataPath(absolute)) {
        try {
          const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown;
          spriteInfo = parseSpriteMetadata(metadata);
          if (spriteInfo.frameCount) break;
        } catch {
          // Optional spritesheet metadata.
        }
      }
    } else if (jsonBytes) {
      try {
        spriteInfo = parseSpriteMetadata(JSON.parse(jsonBytes.toString()));
      } catch {
        // A JSON file can still be an ordinary project asset.
      }
    }
    const inspection = await inspectMediaFile(absolute, spriteInfo.frameCount ? spriteInfo : undefined);
    if (spriteInfo.frameCount && inspection.kind !== 'spritesheet') inspection.kind = 'spritesheet';
    const assetPath = manifestEntry?.path ?? path;
    const existing = manifestEntry?.id
      ? this.getDatabase().prepare('SELECT * FROM assets WHERE project_id = ? AND id = ?').get(state.input.id, manifestEntry.id) as AssetRow | undefined
      : this.getDatabase().prepare('SELECT * FROM assets WHERE project_id = ? AND path = ?').get(state.input.id, assetPath) as AssetRow | undefined;
    const id = existing?.id ?? manifestEntry?.id ?? stableId('asset', state.input.id, assetPath);
    const manifestCurrent = manifestEntry?.versions?.find((version) => version.id === manifestEntry.currentVersionId);
    const versionId = manifestCurrent?.revision === revision && manifestEntry?.currentVersionId
      ? manifestEntry.currentVersionId
      : `version:${state.input.id}:${hashBytes(`${id}:${revision}`)}`;
    const existingMetadata = existing ? parseJson<Record<string, unknown>>(existing.metadata_json, {}) : {};
    const manifestMetadata = manifestEntry?.metadata ?? {};
    const name = existing?.name?.trim() || manifestEntry?.name || '';
    const tags = existing?.tags_json
      ? parseJson<string[]>(existing.tags_json, []).filter((tag) => typeof tag === 'string')
      : (manifestEntry?.tags ?? []);
    const metadata = {
      ...(inspection.metadata ?? {}),
      ...(spriteInfo.metadata ?? {}),
      ...manifestMetadata,
      ...existingMetadata,
      ...(name ? { name } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
    const metadataJson = jsonStringify(metadata);
    const metadataRevision = hashBytes(metadataJson);
    const unchanged = existing != null
      && existing.revision === revision
      && existing.metadata_revision === metadataRevision
      && existing.path === assetPath
      && existing.current_version_id === versionId;
    const updatedAt = unchanged ? existing!.updated_at : nowIso();
    const db = this.getDatabase();
    db.prepare(`
      INSERT INTO assets(project_id, id, path, kind, mime_type, name, tags_json, metadata_revision, revision, size, width, height, duration_ms, frame_count, metadata_json, current_version_id, deleted, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET
        path=excluded.path, kind=excluded.kind, mime_type=excluded.mime_type, revision=excluded.revision,
        size=excluded.size, width=excluded.width, height=excluded.height, duration_ms=excluded.duration_ms,
        frame_count=excluded.frame_count, metadata_json=excluded.metadata_json, metadata_revision=excluded.metadata_revision,
        name=excluded.name, tags_json=excluded.tags_json, current_version_id=excluded.current_version_id,
        deleted=0, updated_at=excluded.updated_at
    `).run(
      state.input.id,
      id,
      assetPath,
      inspection.kind,
      inspection.mimeType,
      name,
      jsonStringify(tags),
      metadataRevision,
      revision,
      inspection.size,
      inspection.width ?? null,
      inspection.height ?? null,
      inspection.durationMs ?? null,
      inspection.frameCount ?? null,
      metadataJson,
      versionId,
      updatedAt,
    );
    db.prepare(`
      INSERT INTO asset_versions(project_id, id, asset_id, path, revision, mime_type, size, width, height, duration_ms, frame_count, source, candidate_id, metadata_json, created_at, adopted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(project_id, id) DO NOTHING
    `).run(
      state.input.id,
      versionId,
      id,
      path,
      revision,
      inspection.mimeType,
      inspection.size,
      inspection.width ?? null,
      inspection.height ?? null,
      inspection.durationMs ?? null,
      inspection.frameCount ?? null,
      manifestCurrent?.id === versionId ? 'adopted' : 'project',
      metadataJson,
      updatedAt,
      manifestCurrent?.id === versionId ? 1 : 0,
    );
    // A manifest is the durable source for canonical version identities. If a
    // rebuild starts with an empty cache, rehydrate historical rows before the
    // next query so IDs/history do not silently change. Old files may no
    // longer be present; their metadata remains queryable through versions.
    for (const historic of manifestEntry?.versions ?? []) {
      if (historic.id === versionId) continue;
      db.prepare(`
        INSERT OR IGNORE INTO asset_versions(project_id, id, asset_id, path, revision, mime_type, size, width, height, duration_ms, frame_count, source, candidate_id, metadata_json, created_at, adopted)
        VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, 'adopted', NULL, ?, ?, 1)
      `).run(state.input.id, historic.id, id, historic.path, historic.revision ?? historic.id, historic.mimeType ?? inspection.mimeType, jsonStringify(historic.metadata ?? {}), updatedAt);
    }
  }

  private rebuildAllLinks(projectId: string): void {
    const db = this.getDatabase();
    db.prepare('DELETE FROM document_links WHERE project_id = ?').run(projectId);
    const documents = db.prepare('SELECT * FROM documents WHERE project_id = ? AND deleted = 0').all(projectId) as DocumentRow[];
    for (const document of documents) this.rebuildLinksForDocument(projectId, document);
  }

  private rebuildLinksForDocument(projectId: string, document: DocumentRow): void {
    const db = this.getDatabase();
    // A large scene can contain hundreds of choices.  Commit its outbound
    // links as one unit, including when this runs outside the initial scan's
    // transaction after a single-document save or watcher update.
    db.exec('SAVEPOINT document_links_update');
    try {
      db.prepare('DELETE FROM document_links WHERE project_id = ? AND source_id = ?').run(projectId, document.id);
      const content = document.content ?? '';
      const matches = parseMarkdownLinks(content);
      const insert = db.prepare('INSERT INTO document_links(project_id, source_id, target_path, target_kind, target_id, anchor, label, line, raw_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const match of matches) {
        const target = linkTargetForSource(document.path, match.target);
        const parsed = parseMarkdownTarget(match.target.replace(/^<|>$/gu, ''));
        if (!parsed.local) {
          insert.run(projectId, document.id, target.path, 'external', null, null, match.label, content.slice(0, match.index).split('\n').length, match.target);
          continue;
        }
        const normalizedTarget = this.resolveKnownTarget(projectId, target.path, target.targetPath);
        const targetPath = normalizedTarget.path;
        const targetDoc = db.prepare('SELECT id FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, targetPath) as { id?: string } | undefined;
        const targetAsset = db.prepare('SELECT id FROM assets WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, targetPath) as { id?: string } | undefined;
        const extension = extname(targetPath).toLowerCase();
        const targetKind: DocumentLink['targetKind'] = targetDoc?.id ? 'document' : targetAsset?.id ? 'asset' : extension === '.md' || extension === '.markdown' ? 'document' : 'unknown';
        insert.run(
          projectId,
          document.id,
          targetPath,
          targetKind,
          targetDoc?.id ?? targetAsset?.id ?? null,
          parsed.anchor ?? null,
          match.label,
          content.slice(0, match.index).split('\n').length,
          match.target,
        );
      }
      db.exec('RELEASE SAVEPOINT document_links_update');
    } catch (error) {
      db.exec('ROLLBACK TO SAVEPOINT document_links_update');
      db.exec('RELEASE SAVEPOINT document_links_update');
      throw error;
    }
  }

  private resolveKnownTarget(projectId: string, path: string, rawPath: string): { path: string } {
    const db = this.getDatabase();
    if (!extname(path)) {
      const markdown = `${path}.md`;
      const found = db.prepare('SELECT 1 FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, markdown);
      if (found) return { path: markdown };
    }
    return { path: path || rawPath };
  }

  private async safeExistingPath(state: ProjectState, path: string): Promise<string | undefined> {
    if (!state.root) return undefined;
    const lexical = resolve(state.root, ...normalizeRelativePath(path).split('/'));
    if (!isContained(state.root, lexical)) throw new ContentServiceError('PATH_ESCAPE', `path escapes project root: ${path}`);
    try {
      const info = await lstat(lexical);
      if (info.isSymbolicLink()) return undefined;
      const resolved = await realpath(lexical);
      return isContained(state.root, resolved) ? resolved : undefined;
    } catch {
      return undefined;
    }
  }

  private startWatcher(state: ProjectState): void {
    if (!state.root || this.closed) return;
    const directories = ['', ...state.watchDirectories];
    for (const directory of directories) this.watchDirectory(state, directory);
  }

  private watchDirectory(state: ProjectState, relativeDirectory: string): void {
    if (!state.root || this.closed || state.watchedDirectories.has(relativeDirectory)) return;
    const normalized = relativeDirectory ? normalizeRelativePath(relativeDirectory, 'watch directory') : '';
    const absolute = normalized ? resolve(state.root, ...normalized.split('/')) : state.root;
    if (!isContained(state.root, absolute)) return;
    try {
      const watcher = watch(absolute, { recursive: false }, (_event, filename) => {
        if (!filename || this.closed) return;
        const name = toPosixPath(String(filename));
        if (!name || name === '.' || name === '..') return;
        const relativePath = normalized ? `${normalized}/${name}` : name;
        if (this.isIgnoredPath(relativePath)) return;
        const previous = state.pendingEvents.get(relativePath);
        if (previous) clearTimeout(previous);
        const timer = setTimeout(() => {
          state.pendingEvents.delete(relativePath);
          void this.enqueue(() => this.reindexChangedPath(state, relativePath));
        }, 80);
        state.pendingEvents.set(relativePath, timer);
      });
      state.watchers.push(watcher);
      state.watchedDirectories.add(normalized);
      watcher.on('error', (error) => {
        state.errors.push(`watcher ${normalized || '.'}: ${toErrorMessage(error)}`);
      });
    } catch (error) {
      state.errors.push(`watcher unavailable ${normalized || '.'}: ${toErrorMessage(error)}`);
    }
  }

  private isIgnoredPath(path: string): boolean {
    return path.split('/').some((part) => IGNORED_DIRECTORY_NAMES.has(part));
  }

  private async reindexChangedPath(state: ProjectState, relativePath: string): Promise<void> {
    if (!state.root || this.closed) return;
    const path = normalizeRelativePath(relativePath);
    const existing = await this.safeExistingPath(state, path);
    if (existing) {
      const info = await lstat(existing);
      if (info.isDirectory()) {
        const previouslyWatched = state.watchedDirectories.has(path);
        const hasIndexedContent = await this.indexChangedDirectory(state, path);
        if (previouslyWatched || hasIndexedContent) {
          this.rebuildAllLinks(state.input.id);
          this.queueStoryRebuilds(state.input.id, [path]);
        }
        this.notify({ projectId: state.input.id, paths: [path],
          kinds: previouslyWatched || hasIndexedContent ? ['document', 'directory', 'card', 'asset', 'status'] : ['directory', 'status'], reason: 'index' });
        return;
      }
    } else if (!extname(path)) {
      // A directory removal arrives as a rename event for the old directory.
      // Tombstone only that subtree so unrelated records remain untouched.
      this.markDeletedSubtree(state.input.id, path);
      this.rebuildAllLinks(state.input.id);
      this.notify({ projectId: state.input.id, paths: [path], kinds: ['document', 'directory', 'card', 'asset', 'status'], reason: 'index' });
      this.queueStoryRebuilds(state.input.id, [path]);
      return;
    }
    if (path === `${ASSET_DIRECTORY}/${MANIFEST_FILE_NAME}`) {
      this.manifestCache.delete(state.input.id);
      await this.loadManifest(state.input.id);
      this.notify({ projectId: state.input.id, paths: [path], kinds: ['asset', 'status'], reason: 'index' });
      return;
    }
    if (/\.(?:md|markdown)$/iu.test(path)) {
      const document = await this.indexDocumentFile(state, path);
      if (document) this.rebuildLinksForDocument(state.input.id, document);
      else this.rebuildAllLinks(state.input.id);
      this.notify({ projectId: state.input.id, paths: [path], kinds: ['document', 'status'], reason: 'index' });
      this.queueStoryRebuilds(state.input.id, [path]);
      return;
    }
    if (path.startsWith(`${CARD_DIRECTORY}/`) && extname(path).toLowerCase() === '.json') {
      await this.indexCardFile(state, path);
      this.notify({ projectId: state.input.id, paths: [path], kinds: ['card', 'status'], reason: 'index' });
      return;
    }
    if (path.startsWith(`${ASSET_DIRECTORY}/`)) {
      await this.indexAssetFile(state, path);
      this.rebuildAllLinks(state.input.id);
      this.notify({ projectId: state.input.id, paths: [path], kinds: ['asset', 'status'], reason: 'index' });
    }
  }

  private async indexChangedDirectory(state: ProjectState, relativeDirectory: string): Promise<boolean> {
    if (!state.root) return false;
    const absolute = await this.safeExistingPath(state, relativeDirectory);
    if (!absolute) return false;
    this.watchDirectory(state, relativeDirectory);
    const db = this.getDatabase();
    db.prepare(`
      INSERT INTO directories(project_id, path, revision, deleted)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(project_id, path) DO UPDATE SET revision=excluded.revision, deleted=0
    `).run(state.input.id, relativeDirectory, hashBytes(relativeDirectory));
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return false;
    }
    let hasIndexedContent = false;
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..' || IGNORED_DIRECTORY_NAMES.has(entry.name) || entry.isSymbolicLink()) continue;
      const child = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        hasIndexedContent = await this.indexChangedDirectory(state, child) || hasIndexedContent;
        continue;
      }
      if (!entry.isFile()) continue;
      const normalized = toPosixPath(child);
      if (/\.(?:md|markdown)$/iu.test(normalized)) {
        await this.indexDocumentFile(state, normalized);
        hasIndexedContent = true;
      } else if (normalized.startsWith(`${CARD_DIRECTORY}/`) && extname(normalized).toLowerCase() === '.json') {
        await this.indexCardFile(state, normalized);
        hasIndexedContent = true;
      } else if (normalized.startsWith(`${ASSET_DIRECTORY}/`) && normalized !== `${ASSET_DIRECTORY}/${MANIFEST_FILE_NAME}`) {
        await this.indexAssetFile(state, normalized);
        hasIndexedContent = true;
      }
    }
    return hasIndexedContent;
  }

  private markDeletedSubtree(projectId: string, path: string): void {
    const db = this.getDatabase();
    const prefix = `${path}/%`;
    db.prepare('UPDATE documents SET deleted = 1 WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
    db.prepare('DELETE FROM story_dialogue_lines WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
    db.prepare('DELETE FROM story_scene_index WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
    db.prepare('UPDATE directories SET deleted = 1 WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
    db.prepare('UPDATE cards SET deleted = 1 WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
    db.prepare('UPDATE assets SET deleted = 1 WHERE project_id = ? AND (path = ? OR path LIKE ?)').run(projectId, path, prefix);
  }

  private documentLinks(projectId: string, documentId: string): DocumentLink[] {
    const rows = this.getDatabase().prepare('SELECT target_path, target_kind, target_id, anchor, label, line, raw_target FROM document_links WHERE project_id = ? AND source_id = ? ORDER BY line, rowid')
      .all(projectId, documentId) as Array<{
        target_path: string;
        target_kind: DocumentLink['targetKind'];
        target_id?: string;
        anchor?: string;
        label?: string;
        line: number;
        raw_target: string;
      }>;
    return rows.map((row) => ({
      targetPath: row.target_path,
      targetKind: row.target_kind,
      ...(row.target_id ? { targetId: row.target_id } : {}),
      ...(row.anchor ? { anchor: row.anchor } : {}),
      ...(row.label ? { label: row.label } : {}),
      line: row.line,
      rawTarget: row.raw_target,
    }));
  }

  private page<T extends { path: string }>(items: T[], cursor: unknown, limit: unknown): Page<T> {
    const after = decodeCursor(cursor);
    const filtered = after === undefined ? items : items.filter((item) => item.path > after);
    const pageLimit = clampLimit(limit);
    const pageItems = filtered.slice(0, pageLimit);
    return {
      items: pageItems,
      ...(filtered.length > pageItems.length && pageItems.length > 0 ? { nextCursor: encodeCursor(pageItems[pageItems.length - 1]!.path) } : {}),
      total: items.length,
    };
  }

  private pageSql<T extends { path: string }>(items: T[], cursor: unknown, limit: unknown, total: number): Page<T> {
    const pageLimit = clampLimit(limit);
    const hasMore = items.length > pageLimit;
    const pageItems = items.slice(0, pageLimit);
    return {
      items: pageItems,
      ...(hasMore && pageItems.length > 0 ? { nextCursor: encodeCursor(pageItems[pageItems.length - 1]!.path) } : {}),
      total,
    };
  }

  private pageSqlKey<T>(items: T[], limit: unknown, total: number, key: (item: T) => string): Page<T> {
    const pageLimit = clampLimit(limit);
    const hasMore = items.length > pageLimit;
    const pageItems = items.slice(0, pageLimit);
    return {
      items: pageItems,
      ...(hasMore && pageItems.length > 0 ? { nextCursor: encodeCursor(key(pageItems[pageItems.length - 1]!)) } : {}),
      total,
    };
  }

  private async queryDocuments(input: import('./types').ContentListQuery): Promise<Page<ContentDocument>> {
    const directory = input.directory ? normalizeRelativePath(input.directory, 'directory') : undefined;
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?', 'deleted = 0'];
    const parameters: unknown[] = [input.projectId];
    if (directory) {
      clauses.push('(path = ? OR path LIKE ?)');
      parameters.push(directory, `${directory}/%`);
    }
    addSearchSql(clauses, parameters, 'search_text', input.q);
    if (after) {
      clauses.push('path > ?');
      parameters.push(after);
    }
    const where = clauses.join(' AND ');
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT id, path, title, revision, size, updated_at, substr(content, 1, 360) AS content FROM documents WHERE ${where} ORDER BY path, id LIMIT ?`)
      .all(...parameters, pageLimit + 1) as DocumentRow[];
    const countParameters: unknown[] = [input.projectId];
    const countClauses = ['project_id = ?', 'deleted = 0'];
    if (directory) {
      countClauses.push('(path = ? OR path LIKE ?)');
      countParameters.push(directory, `${directory}/%`);
    }
    addSearchSql(countClauses, countParameters, 'search_text', input.q);
    const count = db.prepare(`SELECT COUNT(*) AS count FROM documents WHERE ${countClauses.join(' AND ')}`).get(...countParameters) as { count?: number } | undefined;
    const items = rows.map((row) => contentDocumentFromRow(row, this.documentLinks(input.projectId, row.id), input.q, false));
    return this.pageSql(items, input.cursor, input.limit, Number(count?.count ?? 0));
  }

  private async queryDirectories(input: import('./types').ContentListQuery): Promise<Page<ContentListItem>> {
    const directory = input.directory ? normalizeRelativePath(input.directory, 'directory') : undefined;
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?', 'deleted = 0'];
    const parameters: unknown[] = [input.projectId];
    if (directory) {
      clauses.push('(path = ? OR path LIKE ?)');
      parameters.push(directory, `${directory}/%`);
    }
    addSearchSql(clauses, parameters, 'path', input.q);
    if (after) {
      clauses.push('path > ?');
      parameters.push(after);
    }
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT path, revision FROM directories WHERE ${clauses.join(' AND ')} ORDER BY path LIMIT ?`)
      .all(...parameters, pageLimit + 1) as Array<{ path: string; revision: string }>;
    const countParameters: unknown[] = [input.projectId];
    const countClauses = ['project_id = ?', 'deleted = 0'];
    if (directory) {
      countClauses.push('(path = ? OR path LIKE ?)');
      countParameters.push(directory, `${directory}/%`);
    }
    addSearchSql(countClauses, countParameters, 'path', input.q);
    const count = db.prepare(`SELECT COUNT(*) AS count FROM directories WHERE ${countClauses.join(' AND ')}`).get(...countParameters) as { count?: number } | undefined;
    const items = rows.map((row) => ({
        id: stableId('directory', input.projectId, row.path),
        title: basename(row.path),
        path: row.path,
        revision: row.revision,
        type: 'directory',
      }));
    return this.pageSql(items, input.cursor, input.limit, Number(count?.count ?? 0));
  }

  private resolveDocument(projectId: string, id?: string, path?: string): DocumentRow {
    const db = this.getDatabase();
    let row: DocumentRow | undefined;
    if (id) row = db.prepare('SELECT * FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as DocumentRow | undefined;
    if (!row && path) {
      const normalized = normalizeRelativePath(path);
      row = db.prepare('SELECT * FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, normalized) as DocumentRow | undefined;
    }
    if (!row) throw new ContentServiceError('NOT_FOUND', 'document was not found.');
    return row;
  }

  private resolveDocumentHeader(projectId: string, id?: string, path?: string): DocumentHeader {
    const db = this.getDatabase();
    let row: DocumentHeader | undefined;
    if (id) row = db.prepare('SELECT id, path, title, revision, size FROM documents WHERE project_id = ? AND id = ? AND deleted = 0')
      .get(projectId, id) as DocumentHeader | undefined;
    if (!row && path) row = db.prepare('SELECT id, path, title, revision, size FROM documents WHERE project_id = ? AND path = ? AND deleted = 0')
      .get(projectId, normalizeRelativePath(path)) as DocumentHeader | undefined;
    if (!row) throw new ContentServiceError('NOT_FOUND', 'document was not found.');
    return row;
  }

  private async queryDocument(input: import('./types').ContentDetailQuery): Promise<ContentDocument> {
    const row = this.resolveDocument(input.projectId, input.id, input.path);
    return contentDocumentFromRow(row, this.documentLinks(input.projectId, row.id));
  }

  private async queryDocumentMeta(input: import('./types').ContentDetailQuery): Promise<ContentDocumentMeta> {
    const row = this.resolveDocumentHeader(input.projectId, input.id, input.path);
    const scene = this.getDatabase().prepare('SELECT revision FROM story_scene_index WHERE project_id = ? AND path = ?')
      .get(input.projectId, row.path) as { revision: string } | undefined;
    return { ...row, isScene: scene?.revision === row.revision };
  }

  private async queryBacklinks(input: import('./types').ContentListQuery): Promise<Page<BacklinkItem>> {
    let targetPath = input.path ? normalizeRelativePath(input.path) : undefined;
    if (input.id) {
      const target = this.resolveDocument(input.projectId, input.id);
      targetPath = target.path;
    }
    if (!targetPath) throw new ContentServiceError('INVALID_INPUT', 'backlinks requires id or path.');
    const after = decodeCursor(input.cursor);
    const pageLimit = clampLimit(input.limit);
    const cursorClause = after ? 'AND d.path > ?' : '';
    const rowsParameters: unknown[] = [input.projectId, targetPath];
    if (after) rowsParameters.push(after);
    const rows = this.getDatabase().prepare(`
      SELECT l.*, d.path AS source_path, d.title AS source_title, d.revision AS source_revision, d.content AS source_content
      FROM document_links l JOIN documents d ON d.project_id = l.project_id AND d.id = l.source_id
      WHERE l.project_id = ? AND l.target_path = ? AND d.deleted = 0
        ${cursorClause}
      ORDER BY d.path, l.line
      LIMIT ?
    `).all(...rowsParameters, pageLimit + 1) as Array<{
      source_id: string;
      source_path: string;
      source_title: string;
      source_revision: string;
      target_path: string;
      line: number;
      label?: string;
      anchor?: string;
      source_content: string;
    }>;
    const items: BacklinkItem[] = rows.map((row) => ({
      id: row.source_id,
      title: row.source_title,
      path: row.source_path,
      revision: row.source_revision,
      type: 'backlink',
      sourceId: row.source_id,
      sourcePath: row.source_path,
      targetPath: row.target_path,
      line: row.line,
      ...(row.label ? { label: row.label } : {}),
      ...(row.anchor ? { anchor: row.anchor } : {}),
      snippet: row.source_content.split('\n').slice(Math.max(0, row.line - 2), row.line + 1).join(' ').slice(0, 220),
    }));
    const count = this.getDatabase().prepare(`SELECT COUNT(*) AS count FROM document_links l JOIN documents d ON d.project_id = l.project_id AND d.id = l.source_id WHERE l.project_id = ? AND l.target_path = ? AND d.deleted = 0`).get(input.projectId, targetPath) as { count?: number } | undefined;
    return this.pageSql(items, input.cursor, input.limit, Number(count?.count ?? 0));
  }

  private async queryGraph(input: import('./types').GraphQuery): Promise<ContentGraph> {
    const root = this.resolveDocument(input.projectId, input.id, input.path);
    const depthLimit = Math.max(0, Math.min(4, Math.floor(input.depth ?? 2)));
    const maxNodes = Math.max(1, Math.min(200, Math.floor(input.maxNodes ?? 100)));
    const maxEdges = Math.min(800, Math.max(8, maxNodes * 8));
    const db = this.getDatabase();
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const queue: Array<{ id: string; path: string; depth: number }> = [{ id: root.id, path: root.path, depth: 0 }];
    let truncated = false;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (nodes.has(current.id)) continue;
      if (nodes.size >= maxNodes) {
        truncated = true;
        break;
      }
      const doc = db.prepare('SELECT id, path, title, revision FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(input.projectId, current.id) as DocumentRow | undefined;
      const asset = db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(input.projectId, current.id) as AssetRow | undefined;
      if (doc) {
        nodes.set(doc.id, { id: doc.id, title: doc.title, path: doc.path, revision: doc.revision, type: 'document', depth: current.depth });
      } else if (asset) {
        nodes.set(asset.id, { id: asset.id, title: basename(asset.path), path: asset.path, revision: asset.revision, type: 'asset', depth: current.depth });
      } else {
        continue;
      }
      if (current.depth >= depthLimit || !doc) continue;
      const links = db.prepare('SELECT target_path, target_kind, target_id, anchor FROM document_links WHERE project_id = ? AND source_id = ? ORDER BY rowid LIMIT ?')
        .all(input.projectId, doc.id, maxEdges) as Array<{ target_path: string; target_kind: GraphEdge['kind']; target_id?: string; anchor?: string }>;
      for (const link of links) {
        if (edges.length >= maxEdges) {
          truncated = true;
          break;
        }
        edges.push({ sourceId: doc.id, sourcePath: doc.path, targetPath: link.target_path, kind: link.target_kind, ...(link.target_id ? { targetId: link.target_id } : {}), ...(link.anchor ? { anchor: link.anchor } : {}) });
        if (link.target_id && (link.target_kind === 'document' || link.target_kind === 'asset')) {
          queue.push({ id: link.target_id, path: link.target_path, depth: current.depth + 1 });
        }
      }
    }
    return { nodes: [...nodes.values()], edges, truncated };
  }

  private async queryMovePreview(input: import('./types').MovePreviewQuery): Promise<MovePreview> {
    const source = this.resolveDocument(input.projectId, input.id, input.path);
    const toPath = normalizeRelativePath(input.toPath, 'toPath');
    const db = this.getDatabase();
    const destination = db.prepare('SELECT id FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(input.projectId, toPath) as { id?: string } | undefined;
    const conflicts: string[] = [];
    if (destination && destination.id !== source.id) conflicts.push(`destination already exists: ${toPath}`);
    const affected: MovePreview['affected'] = [];
    const incoming = db.prepare('SELECT DISTINCT source_id FROM document_links WHERE project_id = ? AND target_path = ?').all(input.projectId, source.path) as Array<{ source_id: string }>;
    const affectedIds = new Set([source.id, ...incoming.map((row) => row.source_id)]);
    const allDocuments = [...affectedIds]
      .map((id) => db.prepare('SELECT * FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(input.projectId, id) as DocumentRow | undefined)
      .filter((document): document is DocumentRow => Boolean(document));
    for (const document of allDocuments) {
      const rewrite = document.id === source.id
        ? this.rewriteMovedDocumentOutboundLinks(document.content ?? '', source.path, toPath)
        : this.rewriteDocumentLinks(document.content ?? '', document.path, source.path, toPath);
      if (rewrite.changed) affected.push({ id: document.id, path: document.path, revision: document.revision, changed: true, changedLinks: rewrite.changedLinks });
    }
    affected.unshift({ id: source.id, path: source.path, revision: source.revision, changed: true, changedLinks: affected.find((item) => item.id === source.id)?.changedLinks ?? 0 });
    return {
      source: contentDocumentFromRow(source, this.documentLinks(input.projectId, source.id)),
      toPath,
      affected: affected.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index),
      conflicts,
      canApply: conflicts.length === 0,
    };
  }

  private async queryCards(input: import('./types').ContentListQuery): Promise<Page<CardItem>> {
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?', 'deleted = 0'];
    const parameters: unknown[] = [input.projectId];
    addCardFilterSql(clauses, parameters, input);
    addSearchSql(clauses, parameters, '(id || char(10) || name || char(10) || kind || char(10) || description || char(10) || rarity || char(10) || labels_json)', input.q);
    if (after) {
      const [afterPath, afterId = ''] = after.split('|');
      clauses.push('(path > ? OR (path = ? AND id > ?))');
      parameters.push(afterPath, afterPath, afterId);
    }
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT id, path, collection, kind, rarity, labels_json, name, description, revision,
      json_extract(json, '$.cardFace.variants.' || json_extract(json, '$.cardFace.themeId') || '.preview') AS face_preview
      FROM cards WHERE ${clauses.join(' AND ')} ORDER BY path, id LIMIT ?`)
      .all(...parameters, pageLimit + 1) as CardRow[];
    const countParameters: unknown[] = [input.projectId];
    const countClauses = ['project_id = ?', 'deleted = 0'];
    addCardFilterSql(countClauses, countParameters, input);
    addSearchSql(countClauses, countParameters, '(id || char(10) || name || char(10) || kind || char(10) || description || char(10) || rarity || char(10) || labels_json)', input.q);
    const count = db.prepare(`SELECT COUNT(*) AS count FROM cards WHERE ${countClauses.join(' AND ')}`).get(...countParameters) as { count?: number } | undefined;
    const items = rows.map(cardFromRow);
    return this.pageSqlKey(items, input.limit, Number(count?.count ?? 0), (item) => `${item.path}|${item.id}`);
  }

  private async queryCard(input: import('./types').ContentDetailQuery): Promise<CardItem> {
    if (input.freshKind) await this.enqueue(() => this.indexCardFile(this.project(input.projectId), cardCollection(input.freshKind).path));
    const id = ensureString(input.id, 'card id');
    const row = this.getDatabase().prepare('SELECT * FROM cards WHERE project_id = ? AND id = ? AND deleted = 0').get(input.projectId, id) as CardRow | undefined;
    if (!row) throw new ContentServiceError('NOT_FOUND', `card was not found: ${id}`);
    return cardFromRow(row);
  }

  private async queryAssets(input: import('./types').ContentListQuery): Promise<Page<AssetItem>> {
    if (input.status === 'candidate') return this.queryCandidateAssets(input);
    if (input.status && input.status !== 'ready') return { items: [], total: 0 };
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?', 'deleted = 0'];
    const parameters: unknown[] = [input.projectId];
    addAssetFilterSql(clauses, parameters, input);
    addSearchSql(clauses, parameters, '(path || char(10) || name || char(10) || tags_json || char(10) || kind || char(10) || mime_type || char(10) || metadata_json)', input.q);
    if (after) {
      clauses.push('path > ?');
      parameters.push(after);
    }
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT project_id, id, path, kind, mime_type, name, tags_json, metadata_revision, revision, size, width, height, duration_ms, frame_count, metadata_json, current_version_id, deleted, updated_at FROM assets WHERE ${clauses.join(' AND ')} ORDER BY path, id LIMIT ?`)
      .all(...parameters, pageLimit + 1) as AssetRow[];
    const countParameters: unknown[] = [input.projectId];
    const countClauses = ['project_id = ?', 'deleted = 0'];
    addAssetFilterSql(countClauses, countParameters, input);
    addSearchSql(countClauses, countParameters, '(path || char(10) || name || char(10) || tags_json || char(10) || kind || char(10) || mime_type || char(10) || metadata_json)', input.q);
    const count = db.prepare(`SELECT COUNT(*) AS count FROM assets WHERE ${countClauses.join(' AND ')}`).get(...countParameters) as { count?: number } | undefined;
    const items = rows.map((row) => assetFromRow(row));
    return this.pageSql(items, input.cursor, input.limit, Number(count?.count ?? 0));
  }

  private async queryCandidateAssets(input: import('./types').ContentListQuery): Promise<Page<AssetItem>> {
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?'];
    const parameters: unknown[] = [input.projectId];
    if (typeof input.kind === 'string' && input.kind.trim()) {
      const kind = input.kind.trim().toLowerCase();
      clauses.push("(lower(mime_type) LIKE ? ESCAPE '\\' OR lower(metadata_json) LIKE ? ESCAPE '\\')");
      parameters.push(`${escapeLikeTerm(kind)}/%`, `%\"kind\":\"${escapeLikeTerm(kind)}\"%`);
    }
    if (typeof input.mimeType === 'string' && input.mimeType.trim()) {
      clauses.push('lower(mime_type) = lower(?)');
      parameters.push(input.mimeType.trim());
    }
    if (typeof input.format === 'string' && input.format.trim()) {
      const format = input.format.trim().replace(/^\.+/u, '').toLowerCase();
      if (format) {
        clauses.push("lower(file_path) LIKE ? ESCAPE '\\'");
        parameters.push(`%.${escapeLikeTerm(format)}`);
      }
    }
    for (const [value, expression, field] of [
      [input.minWidth, "CAST(json_extract(metadata_json, '$.width') AS REAL) >= ?", 'width'],
      [input.maxWidth, "CAST(json_extract(metadata_json, '$.width') AS REAL) <= ?", 'width'],
      [input.minDurationMs, "CAST(json_extract(metadata_json, '$.durationMs') AS REAL) >= ?", 'durationMs'],
      [input.maxDurationMs, "CAST(json_extract(metadata_json, '$.durationMs') AS REAL) <= ?", 'durationMs'],
    ] as Array<[unknown, string, string]>) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      clauses.push(`${expression} AND json_extract(metadata_json, '$.${field}') IS NOT NULL`);
      parameters.push(value);
    }
    addSearchSql(clauses, parameters, '(id || char(10) || name || char(10) || mime_type || char(10) || file_path || char(10) || metadata_json)', input.q);
    if (after) {
      clauses.push('file_path > ?');
      parameters.push(resolve(this.dataRoot, ...after.split('/')));
    }
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT project_id, id, name, file_path, revision, mime_type, size, metadata_json, created_at FROM candidates WHERE ${clauses.join(' AND ')} ORDER BY file_path, id LIMIT ?`)
      .all(...parameters, pageLimit + 1) as CandidateRow[];
    const countParameters = parameters.slice(0, after ? -1 : undefined);
    const countClauses = clauses.slice(0, after ? -1 : undefined);
    const count = db.prepare(`SELECT COUNT(*) AS count FROM candidates WHERE ${countClauses.join(' AND ')}`).get(...countParameters) as { count?: number } | undefined;
    const items = rows.map((row) => candidateAssetFromRow(row, this.dataRoot));
    return this.pageSql(items, input.cursor, input.limit, Number(count?.count ?? 0));
  }

  private async queryAsset(input: import('./types').ContentDetailQuery): Promise<AssetItem> {
    const id = input.id ?? input.assetId;
    if (!id) throw new ContentServiceError('INVALID_INPUT', 'asset query requires id.');
    const row = this.getDatabase().prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(input.projectId, id) as AssetRow | undefined;
    if (!row) {
      const candidate = this.getDatabase().prepare('SELECT * FROM candidates WHERE project_id = ? AND id = ?').get(input.projectId, id) as CandidateRow | undefined;
      if (candidate) return candidateAssetFromRow(candidate, this.dataRoot);
      throw new ContentServiceError('NOT_FOUND', `asset was not found: ${id}`);
    }
    return assetFromRow(row);
  }

  private async queryVersions(input: import('./types').ContentListQuery): Promise<Page<AssetVersion>> {
    const assetId = input.assetId ?? input.id;
    if (!assetId) throw new ContentServiceError('INVALID_INPUT', 'versions query requires assetId.');
    const after = decodeCursor(input.cursor);
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const cursorClause = after ? "AND (path || '|' || id) > ?" : '';
    const params: unknown[] = [input.projectId, assetId];
    if (after) params.push(after);
    const rows = db.prepare(`SELECT * FROM asset_versions WHERE project_id = ? AND asset_id = ? ${cursorClause} ORDER BY path, id LIMIT ?`)
      .all(...params, pageLimit + 1) as AssetVersionRow[];
    const count = db.prepare('SELECT COUNT(*) AS count FROM asset_versions WHERE project_id = ? AND asset_id = ?').get(input.projectId, assetId) as { count?: number } | undefined;
    const items = rows.map(assetVersionFromRow);
    return this.pageSqlKey(items, input.limit, Number(count?.count ?? 0), (item) => `${item.path}|${item.id}`);
  }

  private async linkTargetExists(state: ProjectState, targetPath: string): Promise<boolean> {
    const candidates = extname(targetPath) ? [targetPath] : [targetPath, `${targetPath}.md`, `${targetPath}.markdown`];
    for (const candidate of candidates) {
      try {
        if (await this.safeExistingPath(state, normalizeRelativePath(candidate))) return true;
      } catch {
        // An unsafe or malformed target still counts as unresolved.
      }
    }
    return false;
  }

  private async queryInspection(input: import('./types').InspectionQuery): Promise<import('./types').InspectionResult> {
    const requested = input.kinds === undefined ? INSPECTION_KINDS : input.kinds;
    if (!Array.isArray(requested)) throw new ContentServiceError('INVALID_INPUT', 'inspection kinds must be an array.');
    const kinds = new Set<InspectionKind>();
    for (const kind of requested) {
      if (!INSPECTION_KINDS.includes(kind)) throw new ContentServiceError('INVALID_INPUT', `unknown inspection kind: ${String(kind)}`);
      kinds.add(kind);
    }
    const state = this.project(input.projectId);
    const db = this.getDatabase();
    const keyed: Array<{ key: string; finding: InspectionFinding }> = [];
    const push = (order: number, finding: InspectionFinding, discriminator: string | number): void => {
      keyed.push({ key: `${order}|${finding.ref.path ?? ''}|${finding.ref.id ?? ''}|${discriminator}|${finding.detail}`, finding });
    };

    if (kinds.has('broken-link') || kinds.has('scene-dead-end')) {
      const scenes = new Map<string, Array<{ start: number; end: number }>>();
      const sceneCandidates = db.prepare("SELECT id, content FROM documents WHERE project_id = ? AND deleted = 0 AND content LIKE '%scene:%'")
        .all(input.projectId) as Array<{ id: string; content: string }>;
      for (const row of sceneCandidates) {
        if (frontmatterHasScene(row.content)) scenes.set(row.id, optionSectionRanges(row.content));
      }
      const links = db.prepare(`
        SELECT l.rowid AS row_id, l.source_id, l.raw_target, l.target_path, l.line, d.path AS source_path
        FROM document_links l JOIN documents d ON d.project_id = l.project_id AND d.id = l.source_id
        WHERE l.project_id = ? AND l.target_id IS NULL AND l.target_kind != 'external' AND d.deleted = 0
        ORDER BY d.path, l.line, l.rowid
      `).all(input.projectId) as Array<{ row_id: number; source_id: string; raw_target: string; target_path: string; line: number; source_path: string }>;
      const existence = new Map<string, boolean>();
      for (const link of links) {
        let exists = existence.get(link.target_path);
        if (exists === undefined) {
          exists = await this.linkTargetExists(state, link.target_path);
          existence.set(link.target_path, exists);
        }
        if (exists) continue;
        const inOptionSection = (scenes.get(link.source_id) ?? []).some((range) => link.line >= range.start && link.line <= range.end);
        if (inOptionSection) {
          if (kinds.has('scene-dead-end')) {
            push(1, {
              kind: 'scene-dead-end',
              severity: 'high',
              ref: { type: 'document', id: link.source_id, path: link.source_path },
              detail: `unresolved option link at line ${link.line}: ${link.raw_target}`,
            }, link.row_id);
          }
        } else if (kinds.has('broken-link')) {
          push(0, {
            kind: 'broken-link',
            severity: 'warning',
            ref: { type: 'document', id: link.source_id, path: link.source_path },
            detail: `unresolved link at line ${link.line}: ${link.raw_target}`,
          }, link.row_id);
        }
      }
    }

    if (kinds.has('orphan-asset')) {
      const rows = db.prepare(`
        SELECT a.id, a.path FROM assets a
        WHERE a.project_id = ? AND a.deleted = 0
          AND NOT EXISTS (SELECT 1 FROM document_links l WHERE l.project_id = a.project_id AND l.target_id = a.id)
          AND NOT EXISTS (
            SELECT 1 FROM cards c WHERE c.project_id = a.project_id AND c.deleted = 0 AND (
              c.json LIKE '%' || REPLACE(REPLACE(REPLACE(a.path, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
              OR c.json LIKE '%' || REPLACE(REPLACE(REPLACE(a.id, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'
            )
          )
        ORDER BY a.path, a.id
      `).all(input.projectId) as Array<{ id: string; path: string }>;
      for (const row of rows) {
        push(2, {
          kind: 'orphan-asset',
          severity: 'info',
          ref: { type: 'asset', id: row.id, path: row.path },
          detail: 'asset is not referenced by any document or card.',
        }, row.id);
      }
    }

    if (kinds.has('card-missing-art')) {
      const artExpression = CARD_ART_FIELDS.map((field) => `json_extract(c.json, '$.${field}')`).join(', ');
      const rows = db.prepare(`
        SELECT * FROM (
          SELECT c.id AS card_id, c.path AS card_path, c.name AS card_name, COALESCE(${artExpression}) AS art
          FROM cards c WHERE c.project_id = ? AND c.deleted = 0
        )
        WHERE typeof(art) = 'text' AND NOT EXISTS (
          SELECT 1 FROM assets a WHERE a.project_id = ? AND a.deleted = 0
            AND (a.id = art OR a.path = art OR a.path = '${ASSET_DIRECTORY}/' || art)
        )
        ORDER BY card_path, card_id
      `).all(input.projectId, input.projectId) as Array<{ card_id: string; card_path: string; card_name: string; art: string }>;
      for (const row of rows) {
        push(3, {
          kind: 'card-missing-art',
          severity: 'warning',
          ref: { type: 'card', id: row.card_id, path: row.card_path },
          detail: `card ${row.card_name} references missing art: ${row.art}`,
        }, row.card_id);
      }
    }

    if (kinds.has('asset-missing-metadata')) {
      const rows = db.prepare(`
        SELECT id, path, kind, width, height, duration_ms FROM assets
        WHERE project_id = ? AND deleted = 0 AND (
          (kind IN ('image', 'spritesheet') AND (width IS NULL OR height IS NULL))
          OR (kind = 'audio' AND duration_ms IS NULL)
        )
        ORDER BY path, id
      `).all(input.projectId) as Array<{ id: string; path: string; kind: AssetRow['kind']; width?: number | null; height?: number | null; duration_ms?: number | null }>;
      for (const row of rows) {
        const missing = row.kind === 'audio'
          ? ['durationMs']
          : [...(row.width == null ? ['width'] : []), ...(row.height == null ? ['height'] : [])];
        push(4, {
          kind: 'asset-missing-metadata',
          severity: 'info',
          ref: { type: 'asset', id: row.id, path: row.path },
          detail: `asset is missing metadata: ${missing.join(', ')}`,
        }, row.id);
      }
    }

    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const after = decodeCursor(input.cursor);
    const filtered = after === undefined ? keyed : keyed.filter((item) => item.key > after);
    const pageLimit = clampLimit(input.limit);
    const pageItems = filtered.slice(0, pageLimit);
    const counts: Partial<Record<InspectionKind, number>> = {};
    for (const kind of kinds) counts[kind] = keyed.filter((item) => item.finding.kind === kind).length;
    return {
      findings: pageItems.map((item) => item.finding),
      counts,
      ...(filtered.length > pageItems.length && pageItems.length > 0 ? { nextCursor: encodeCursor(pageItems[pageItems.length - 1]!.key) } : {}),
    };
  }

  private async queryRecentChanges(input: import('./types').RecentChangesQuery): Promise<Page<RecentChangeItem>> {
    let since: string | undefined;
    if (input.since !== undefined) {
      if (typeof input.since !== 'string' || Number.isNaN(Date.parse(input.since))) {
        throw new ContentServiceError('INVALID_INPUT', 'recentChanges since must be a valid timestamp.');
      }
      since = new Date(input.since).toISOString();
    }
    let after: { at: string; kind: string; id: string } | undefined;
    const afterKey = decodeCursor(input.cursor);
    if (afterKey !== undefined) {
      const parts = afterKey.split('|');
      if (parts.length < 3) throw new ContentServiceError('INVALID_INPUT', 'cursor is malformed.');
      after = { at: parts[0]!, kind: parts[1]!, id: parts.slice(2).join('|') };
    }
    const union = `
      SELECT 'document' AS kind, d.id AS id, d.path AS path, d.title AS name,
        CASE WHEN r.created_at = f.first_at THEN 'created' ELSE 'updated' END AS change, r.created_at AS at
      FROM document_revisions r
      JOIN (SELECT document_id, MIN(created_at) AS first_at FROM document_revisions WHERE project_id = ? GROUP BY document_id) f ON f.document_id = r.document_id
      JOIN documents d ON d.project_id = r.project_id AND d.id = r.document_id AND d.deleted = 0
      WHERE r.project_id = ?
      UNION ALL
      SELECT 'card', c.id, c.path, c.name,
        CASE WHEN r.created_at = f.first_at THEN 'created' ELSE 'updated' END, r.created_at
      FROM card_revisions r
      JOIN (SELECT card_id, MIN(created_at) AS first_at FROM card_revisions WHERE project_id = ? GROUP BY card_id) f ON f.card_id = r.card_id
      JOIN cards c ON c.project_id = r.project_id AND c.id = r.card_id AND c.deleted = 0
      WHERE r.project_id = ?
      UNION ALL
      SELECT 'asset', a.id, a.path, a.name, 'created', f.first_at
      FROM assets a
      JOIN (SELECT asset_id, MIN(created_at) AS first_at FROM asset_versions WHERE project_id = ? GROUP BY asset_id) f ON f.asset_id = a.id
      WHERE a.project_id = ? AND a.deleted = 0
      UNION ALL
      SELECT 'asset', a.id, a.path, a.name, 'updated', a.updated_at
      FROM assets a
      JOIN (SELECT asset_id, MIN(created_at) AS first_at FROM asset_versions WHERE project_id = ? GROUP BY asset_id) f ON f.asset_id = a.id
      WHERE a.project_id = ? AND a.deleted = 0 AND a.updated_at > f.first_at
      UNION ALL
      SELECT 'version', v.id, v.path, NULL, 'created', v.created_at
      FROM asset_versions v
      WHERE v.project_id = ?
    `;
    const baseParameters: unknown[] = Array.from({ length: 9 }, () => input.projectId);
    const filters: string[] = [];
    const filterParameters: unknown[] = [];
    if (since) {
      filters.push('at > ?');
      filterParameters.push(since);
    }
    if (after) {
      filters.push('(at < ? OR (at = ? AND (kind > ? OR (kind = ? AND id > ?))))');
      filterParameters.push(after.at, after.at, after.kind, after.kind, after.id);
    }
    const where = filters.length > 0 ? ` WHERE ${filters.join(' AND ')}` : '';
    const db = this.getDatabase();
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT * FROM (${union})${where} ORDER BY at DESC, kind ASC, id ASC LIMIT ?`)
      .all(...baseParameters, ...filterParameters, pageLimit + 1) as Array<{
        kind: RecentChangeItem['kind'];
        id: string;
        path: string;
        name?: string | null;
        change: RecentChangeItem['change'];
        at: string;
      }>;
    const count = db.prepare(`SELECT COUNT(*) AS count FROM (${union})${since ? ' WHERE at > ?' : ''}`)
      .get(...baseParameters, ...(since ? [since] : [])) as { count?: number } | undefined;
    const items: RecentChangeItem[] = rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      ...(row.path ? { path: row.path } : {}),
      ...(row.name ? { name: row.name } : {}),
      change: row.change,
      at: row.at,
    }));
    return this.pageSqlKey(items, input.limit, Number(count?.count ?? 0), (item) => `${item.at}|${item.kind}|${item.id}`);
  }

  private async queryMedia(input: MediaQuery): Promise<MediaResponse> {
    return this.resolveMediaQuery(input, input.projectId);
  }

  private async resolveMediaQuery(input: MediaQuery, projectId: string): Promise<MediaResponse> {
    const db = this.getDatabase();
    let row: AssetRow | undefined;
    if (input.id) row = db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, input.id) as AssetRow | undefined;
    if (!row && input.id) {
      const candidate = db.prepare('SELECT * FROM candidates WHERE project_id = ? AND id = ?').get(projectId, input.id) as CandidateRow | undefined;
      if (candidate) return this.resolveCandidateMedia(candidate, input);
    }
    if (!row && input.path) {
      const requestedPath = input.from
        ? linkTargetForSource(normalizeRelativePath(input.from, 'from'), input.path).path
        : normalizeRelativePath(input.path);
      row = db.prepare('SELECT * FROM assets WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, requestedPath) as AssetRow | undefined;
      if (!row && requestedPath.startsWith(`candidates/${projectId}/`)) {
        const candidatePath = resolve(this.dataRoot, ...requestedPath.split('/'));
        const candidate = db.prepare('SELECT * FROM candidates WHERE project_id = ? AND file_path = ?').get(projectId, candidatePath) as CandidateRow | undefined;
        if (candidate) return this.resolveCandidateMedia(candidate, input);
      }
    }
    const state = this.project(projectId);
    if (!row && input.path) {
      // Markdown may point at an ordinary project image before the initial
      // asset scan has seen it (or outside the public/assets convention).  A
      // bounded, symlink-safe file resolver still makes that normal relative
      // link previewable without manufacturing an asset row.
      const requestedPath = input.from
        ? linkTargetForSource(normalizeRelativePath(input.from, 'from'), input.path).path
        : normalizeRelativePath(input.path);
      if (!state.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
      const unresolved = await this.safeExistingPath(state, requestedPath);
      if (unresolved) {
        const info = await stat(unresolved);
        if (info.isFile()) {
          return resolveMediaFile({
            root: state.root,
            absolutePath: unresolved,
            id: stableId('media', projectId, requestedPath),
            revision: await hashFile(unresolved),
            variant: input.variant,
            inlineLimit: this.inlineMediaLimit,
            cacheRoot: resolve(this.dataRoot, 'media-cache'),
          });
        }
      }
    }
    if (!row) throw new ContentServiceError('NOT_FOUND', 'media asset was not found.');
    let path = row.path;
    let versionId = row.current_version_id;
    let revision = row.revision;
    let selectedVersion: AssetVersionRow | undefined;
    if (input.versionId || row.current_version_id) {
      const requestedVersionId = input.versionId ?? row.current_version_id;
      selectedVersion = db.prepare('SELECT * FROM asset_versions WHERE project_id = ? AND id = ? AND asset_id = ?').get(projectId, requestedVersionId, row.id) as AssetVersionRow | undefined;
    }
    if (input.versionId) {
      const version = selectedVersion;
      if (!version) throw new ContentServiceError('NOT_FOUND', 'media version was not found.');
      path = version.path;
      versionId = version.id;
      revision = version.revision;
    } else if (selectedVersion) {
      path = selectedVersion.path;
      versionId = selectedVersion.id;
      revision = selectedVersion.revision;
    }
    if (!state.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
    const resolvedPath = await this.safeExistingPath(state, path);
    if (!resolvedPath) throw new ContentServiceError('NOT_FOUND', `media file is unavailable: ${path}`);
    if (selectedVersion) {
      const actualRevision = await hashFile(resolvedPath);
      if (actualRevision !== selectedVersion.revision) {
        throw new ContentServiceError('NOT_FOUND', `media version is unavailable or has changed: ${selectedVersion.id}`, {
          expected: selectedVersion.revision,
          actual: actualRevision,
        });
      }
    }
    return resolveMediaFile({
      root: state.root,
      absolutePath: resolvedPath,
      id: row.id,
      revision,
      ...(versionId ? { versionId } : {}),
      variant: input.variant,
      inlineLimit: this.inlineMediaLimit,
      cacheRoot: resolve(this.dataRoot, 'media-cache'),
      indexed: {
        mimeType: row.mime_type,
        kind: row.kind,
        size: row.size,
        ...(row.width == null ? {} : { width: row.width }),
        ...(row.height == null ? {} : { height: row.height }),
        ...(row.duration_ms == null ? {} : { durationMs: row.duration_ms }),
        ...(row.frame_count == null ? {} : { frameCount: row.frame_count }),
        metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
      },
    });
  }

  private async resolveCandidateMedia(candidate: CandidateRow, input: MediaQuery): Promise<MediaResponse> {
    const candidateRoot = await realpath(this.candidateRoot(candidate.project_id)).catch(() => undefined);
    const candidateReal = await realpath(candidate.file_path).catch(() => undefined);
    const dataRootReal = await realpath(this.dataRoot);
    if (!candidateRoot || !candidateReal || !isContained(dataRootReal, candidateReal) || !isContained(candidateRoot, candidateReal)) {
      throw new ContentServiceError('PATH_ESCAPE', 'candidate media path escapes the authorized candidate root.');
    }
    const actualRevision = await hashFile(candidateReal);
    if (actualRevision !== candidate.revision) {
      throw new ContentServiceError('NOT_FOUND', `candidate media changed: ${candidate.id}`, {
        expected: candidate.revision,
        actual: actualRevision,
      });
    }
    return resolveMediaFile({
      root: dataRootReal,
      absolutePath: candidateReal,
      id: candidate.id,
      revision: candidate.revision,
      variant: input.variant,
      inlineLimit: this.inlineMediaLimit,
      cacheRoot: resolve(this.dataRoot, 'media-cache'),
      indexed: {
        mimeType: candidate.mime_type,
        size: candidate.size,
        metadata: parseJson<Record<string, unknown>>(candidate.metadata_json, {}),
      },
    });
  }

  private rewriteDocumentLinks(content: string, sourcePath: string, oldPath: string, newPath: string): { content: string; changed: boolean; changedLinks: number } {
    let changedLinks = 0;
    const matches = parseMarkdownLinks(content);
    if (matches.length === 0) return { content, changed: false, changedLinks: 0 };
    let output = '';
    let cursor = 0;
    for (const match of matches) {
      const rawTarget = match.target.replace(/^<|>$/gu, '');
      const resolved = linkTargetForSource(sourcePath, rawTarget);
      const parsed = parseMarkdownTarget(rawTarget);
      if (!resolved.local || !sameDocumentTarget(resolved.path, parsed.targetPath, oldPath)) continue;
      const targetWithoutAnchor = rawTarget.split('#', 1)[0]?.split('?', 1)[0] ?? rawTarget;
      const extensionless = !extname(targetWithoutAnchor);
      const replacementPath = relativeLinkPath(sourcePath, newPath, extensionless, targetWithoutAnchor.startsWith('./'));
      const replacementTarget = `${replacementPath}${parsed.query ? `?${parsed.query}` : ''}${parsed.anchor ? `#${parsed.anchor}` : ''}`;
      const wrapped = match.target.startsWith('<') ? `<${replacementTarget}>` : replacementTarget;
      output += content.slice(cursor, match.index);
      output += `${match.prefix}${wrapped}${match.suffix}`;
      cursor = match.index + match.prefix.length + match.target.length + match.suffix.length;
      changedLinks += 1;
    }
    if (changedLinks === 0) return { content, changed: false, changedLinks: 0 };
    output += content.slice(cursor);
    return { content: output, changed: true, changedLinks };
  }

  private rewriteMovedDocumentOutboundLinks(content: string, oldSourcePath: string, newSourcePath: string): { content: string; changed: boolean; changedLinks: number } {
    const matches = parseMarkdownLinks(content);
    if (matches.length === 0) return { content, changed: false, changedLinks: 0 };
    let output = '';
    let cursor = 0;
    let changedLinks = 0;
    for (const match of matches) {
      const rawTarget = match.target.replace(/^<|>$/gu, '');
      const parsed = parseMarkdownTarget(rawTarget);
      if (!parsed.local || rawTarget.startsWith('#') || rawTarget.startsWith('?')) continue;
      const resolved = linkTargetForSource(oldSourcePath, rawTarget);
      const isSelfTarget = sameDocumentTarget(resolved.path, parsed.targetPath, oldSourcePath);
      let replacementPath: string;
      if (parsed.targetPath.startsWith('/')) {
        const movedTarget = isSelfTarget ? newSourcePath : resolved.path;
        replacementPath = `/${movedTarget}`;
      } else {
        const movedTarget = isSelfTarget ? newSourcePath : resolved.path;
        replacementPath = relativeLinkPath(
          newSourcePath,
          movedTarget,
          !extname(parsed.targetPath),
          parsed.targetPath.startsWith('./'),
        );
      }
      const replacementTarget = `${replacementPath}${parsed.query ? `?${parsed.query}` : ''}${parsed.anchor ? `#${parsed.anchor}` : ''}`;
      const wrapped = match.target.startsWith('<') ? `<${replacementTarget}>` : replacementTarget;
      if (wrapped === match.target) continue;
      output += content.slice(cursor, match.index);
      output += `${match.prefix}${wrapped}${match.suffix}`;
      cursor = match.index + match.prefix.length + match.target.length + match.suffix.length;
      changedLinks += 1;
    }
    if (changedLinks === 0) return { content, changed: false, changedLinks: 0 };
    output += content.slice(cursor);
    return { content: output, changed: true, changedLinks };
  }

  private async safeWriteText(state: ProjectState, path: string, content: string, exclusive = false): Promise<string> {
    return this.safeWriteBytes(state, path, Buffer.from(content, 'utf8'), exclusive);
  }

  private async safeWriteBytes(state: ProjectState, path: string, bytes: Uint8Array, exclusive = false): Promise<string> {
    if (!state.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
    const normalized = normalizeRelativePath(path);
    const absolute = resolve(state.root, ...normalized.split('/'));
    if (!isContained(state.root, absolute)) throw new ContentServiceError('PATH_ESCAPE', 'write path escapes project root.');
    await mkdir(dirname(absolute), { recursive: true });
    const parent = await realpath(dirname(absolute));
    if (!isContained(state.root, parent)) throw new ContentServiceError('PATH_ESCAPE', 'write parent escapes project root.');
    try {
      const existing = await lstat(absolute);
      if (existing.isSymbolicLink()) throw new ContentServiceError('PATH_ESCAPE', 'refusing to write through a symlink.');
    } catch (error) {
      if (error instanceof ContentServiceError) throw error;
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    const temporary = `${absolute}.workbench-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { mode: 0o600 });
      if (exclusive) {
        try {
          // A hard link makes the completed temporary file visible at the
          // destination without the overwrite race of rename().
          await link(temporary, absolute);
        } catch (error) {
          if ((error as { code?: string }).code === 'EEXIST') {
            throw new ContentServiceError('CONTENT_CONFLICT', `destination already exists: ${normalized}`);
          }
          throw error;
        }
        await rm(temporary, { force: true });
      } else {
        await rename(temporary, absolute);
      }
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    const resolved = await realpath(absolute);
    if (!isContained(state.root, resolved)) throw new ContentServiceError('PATH_ESCAPE', 'written path escapes project root.');
    return resolved;
  }

  private checkExpectedRevision(actual: string, expected: string | undefined, label: string): void {
    if (expected !== undefined && expected !== actual) {
      throw new ContentServiceError('CONTENT_CONFLICT', `${label} changed since it was read.`, { expected, actual });
    }
  }

  private async readFreshDocument(state: ProjectState, row: DocumentRow): Promise<string> {
    const absolute = await this.safeExistingPath(state, row.path);
    if (!absolute) {
      throw new ContentServiceError('CONTENT_CONFLICT', `document disappeared or is unsafe: ${row.path}`, { expected: row.revision });
    }
    let content: string;
    try {
      content = await readFile(absolute, 'utf8');
    } catch (error) {
      throw new ContentServiceError('CONTENT_CONFLICT', `document changed or disappeared: ${row.path}`, { cause: toErrorMessage(error) });
    }
    const actual = hashBytes(content);
    if (actual !== row.revision) {
      throw new ContentServiceError('CONTENT_CONFLICT', `document changed since it was read: ${row.path}`, {
        expected: row.revision,
        actual,
      });
    }
    return content;
  }

  private async queryStoryScenePage(input: import('./types').StoryScenePageQuery): Promise<StoryScenePage> {
    if (!input.id && !input.path) throw new ContentServiceError('INVALID_INPUT', 'storyScenePage requires id or path.');
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 24;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1) {
      throw new ContentServiceError('INVALID_INPUT', 'storyScenePage offset and limit must be non-negative integer positions.');
    }
    const row = this.resolveDocumentHeader(input.projectId, input.id, input.path);
    this.checkExpectedRevision(row.revision, input.expectedRevision, row.path);
    const db = this.getDatabase();
    const scene = db.prepare('SELECT * FROM story_scene_index WHERE project_id = ? AND path = ?')
      .get(input.projectId, row.path) as StorySceneIndexRow | undefined;
    if (!scene) throw new ContentServiceError('VALIDATION_ERROR', `${row.path} is not a story scene.`);
    if (scene.revision !== row.revision) throw new ContentServiceError('CONTENT_CONFLICT', `story scene index is stale: ${row.path}`);
    const absolute = await this.safeExistingPath(this.project(input.projectId), row.path);
    if (!absolute) throw new ContentServiceError('CONTENT_CONFLICT', `document disappeared or is unsafe: ${row.path}`);
    const assertFreshFile = async (): Promise<void> => {
      let info: BigIntStats;
      try { info = await stat(absolute, { bigint: true }); }
      catch { throw new ContentServiceError('CONTENT_CONFLICT', `document changed or disappeared: ${row.path}`); }
      if (!info.isFile() || fileFingerprint(info) !== scene.file_fingerprint) {
        throw new ContentServiceError('CONTENT_CONFLICT', `document changed since it was indexed: ${row.path}`, { expected: row.revision });
      }
    };
    await assertFreshFile();
    const pageLimit = Math.min(limit, 50);
    const lines = db.prepare(`
      SELECT id, speaker_id, speaker_name, text, emotion, source_line FROM story_dialogue_lines
      WHERE project_id = ? AND path = ? ORDER BY ordinal LIMIT ? OFFSET ?
    `).all(input.projectId, row.path, pageLimit, Math.min(offset, scene.dialogue_count)) as Array<{
      id: string; speaker_id: string; speaker_name: string; text: string; emotion: string | null; source_line: number;
    }>;
    await assertFreshFile();
    const nextOffset = offset + pageLimit;
    return {
      id: row.id,
      path: row.path,
      revision: row.revision,
      nodeId: scene.node_id,
      title: row.title,
      chapter: scene.chapter,
      summary: scene.summary,
      dialogueCount: scene.dialogue_count,
      offset,
      ...(nextOffset < scene.dialogue_count ? { nextOffset } : {}),
      items: lines.map(line => ({ id: line.id, speakerId: line.speaker_id, speakerName: line.speaker_name,
        text: line.text, ...(line.emotion ? { emotion: line.emotion } : {}), line: line.source_line })),
      diagnostics: parseJson<StoryDiagnostic[]>(scene.diagnostics_json, []),
    };
  }

  private async queryStoryBuilds(input: import('./types').StoryBuildsQuery): Promise<Page<StoryBuildItem>> {
    const db = this.getDatabase();
    const after = decodeCursor(input.cursor);
    const clauses = ['project_id = ?'];
    const parameters: unknown[] = [input.projectId];
    if (after) {
      clauses.push('story_id > ?');
      parameters.push(after);
    }
    const pageLimit = clampLimit(input.limit);
    const rows = db.prepare(`SELECT * FROM story_builds WHERE ${clauses.join(' AND ')} ORDER BY story_id LIMIT ?`)
      .all(...parameters, pageLimit + 1) as StoryBuildRow[];
    const count = db.prepare('SELECT COUNT(*) AS count FROM story_builds WHERE project_id = ?').get(input.projectId) as { count?: number } | undefined;
    const items: StoryBuildItem[] = rows.map((row) => {
      const sourcePaths = parseJson<string[]>(row.source_paths_json, []).filter((path) => typeof path === 'string');
      return {
        storyId: row.story_id,
        entryPath: row.entry_path || sourcePaths[0] || '',
        outputPath: row.output_path,
        sourcePaths,
        errorCount: row.error_count,
        warningCount: row.warning_count,
        nodeCount: row.node_count,
        choiceCount: row.choice_count,
        builtAt: row.built_at,
      };
    });
    return this.pageSqlKey(items, input.limit, Number(count?.count ?? 0), (item) => item.storyId);
  }

  private async compileStory(input: CompileStoryInput): Promise<CompileStoryResult> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const state = this.project(projectId);
    await this.requireInitialized();
    const entryPath = normalizeRelativePath(ensureString(input?.entry, 'entry'), 'entry');
    const dryRun = input?.dryRun === true;
    const db = this.getDatabase();
    const diagnostics: StoryDiagnostic[] = [];
    const warn = (path: string, detail: string, line?: number): void => {
      diagnostics.push({ severity: 'warning', path, ...(line !== undefined ? { line } : {}), detail });
    };
    const fail = (path: string, detail: string, line?: number): void => {
      diagnostics.push({ severity: 'error', path, ...(line !== undefined ? { line } : {}), detail });
    };

    const entry = this.resolveDocument(projectId, undefined, entryPath);
    const entryFields = sceneFrontmatter(entry.content ?? '');
    const requiresStableIds = entryFields.shareFactsAcrossStories === 'true';
    const entryBase = (entryPath.startsWith('knowledge/') ? entryPath.slice('knowledge/'.length) : entryPath).replace(/\.(?:md|markdown)$/iu, '');
    const requestedStoryId = typeof input?.storyId === 'string' ? input.storyId.trim() : '';
    if (requiresStableIds && !requestedStoryId && !entryFields.storyId) {
      fail(entry.path, '共享剧情入口必须声明稳定 storyId，不能使用随文档路径变化的默认 ID。');
    }
    if (requestedStoryId && entryFields.storyId && requestedStoryId !== entryFields.storyId) {
      fail(entry.path, `入口 storyId ${entryFields.storyId} 与编译请求 ${requestedStoryId} 不一致。`);
    }
    const storyId = requestedStoryId
      ? requestedStoryId
      : entryFields.storyId ?? `story.${kebabCase(entryBase) || hashBytes(entryPath).slice(0, 12)}`;
    const outputName = storyId.replace(/^story\./u, '').replace(/[^A-Za-z0-9._-]+/gu, '-') || 'story';
    const outputPath = `${STORY_DIRECTORY}/${outputName}.json`;

    const nodes: Array<Record<string, unknown>> = [];
    const choices: Array<Record<string, unknown>> = [];
    const sourcePaths: string[] = [];
    const visited = new Set<string>();
    const nodeIds = new Map<string, string>();
    const choiceIds = new Map<string, string>();
    const dialogueIds = new Map<string, string>();
    const targetDocuments = new Map<string, DocumentRow>();
    const queue: DocumentRow[] = [];

    if (!frontmatterHasScene(entry.content ?? '')) {
      fail(entry.path, '入口文档缺少 frontmatter 标记 scene: true，不能作为剧情入口。');
    } else {
      queue.push(entry);
    }

    while (queue.length > 0) {
      const row = queue.shift()!;
      if (visited.has(row.path)) continue;
      visited.add(row.path);
      sourcePaths.push(row.path);
      const content = row.content ?? '';
      const fields = sceneFrontmatter(content);
      const nodeId = storyNodeId(row.path, fields);
      if (requiresStableIds && !fields.nodeId) {
        fail(row.path, '共享剧情场景必须声明稳定 nodeId，不能使用随文档路径变化的默认 ID。');
      }
      if (fields.nodeId && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(fields.nodeId)) {
        fail(row.path, `nodeId 格式无效：${fields.nodeId}。`);
      }
      const priorNode = nodeIds.get(nodeId);
      if (priorNode) fail(row.path, `nodeId ${nodeId} 已用于 ${priorNode}。`);
      else nodeIds.set(nodeId, row.path);
      const missing = SCENE_FRONTMATTER_FIELDS.filter((field) => !fields[field]);
      if (missing.length > 0) {
        warn(row.path, `场景缺少 frontmatter 字段：${missing.join(', ')}，编译结果以空字符串占位。`);
      }
      const { summary, detail } = sceneNarrative(content, row.title);
      const dialogues: CompiledStoryDialogue[] = sceneDialogues(content, row.path, fail).map(({ line: _line, ...dialogue }) => dialogue);
      for (const dialogue of dialogues) {
        const prior = dialogueIds.get(dialogue.id);
        if (prior) fail(row.path, `对白 ID ${dialogue.id} 已用于 ${prior}。`);
        else dialogueIds.set(dialogue.id, row.path);
      }
      const backgroundAsset = fields.backgroundAsset;
      if (backgroundAsset) {
        if (!/^assets\/story\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.png$/u.test(backgroundAsset)
          || backgroundAsset.split('/').some(part => part === '.' || part === '..')) {
          fail(row.path, `场景背景路径无效：${backgroundAsset}。`);
        } else if (!await this.safeExistingPath(state, `public/${backgroundAsset}`)) {
          fail(row.path, `场景背景文件不存在：public/${backgroundAsset}。`);
        }
      }
      let onEnter: Record<string, unknown>[] = [];
      if (fields.onEnter) {
        try {
          onEnter = validateStoryEffects(parseStoryRuleJson(fields.onEnter, 'onEnter'), 'onEnter');
        } catch (error) {
          fail(row.path, error instanceof Error ? error.message : String(error));
        }
      }
      nodes.push({
        id: nodeId,
        type: 'story',
        title: row.title,
        summary,
        detail,
        ...(dialogues.length ? { dialogues } : {}),
        tags: sceneTags(content),
        chapter: fields.chapter ?? '',
        location: fields.location ?? '',
        sublocation: fields.sublocation ?? '',
        locationId: fields.locationId ?? '',
        sublocationId: fields.sublocationId ?? '',
        timeHint: fields.timeHint ?? '',
        ...(backgroundAsset ? { backgroundAsset } : {}),
        onEnter,
      });
      const ranges = optionSectionRanges(content);
      const options = this.documentLinks(projectId, row.id)
        .filter((link) => ranges.some((range) => link.line >= range.start && link.line <= range.end));
      const sourceLines = content.split(/\r?\n/u);
      const optionLineCounts = new Map<number, number>();
      for (const option of options) optionLineCounts.set(option.line, (optionLineCounts.get(option.line) ?? 0) + 1);
      if (options.length === 0) {
        warn(row.path, '场景没有任何 ## 选项 分支，游玩到此结束。');
      }
      let ordinal = 0;
      for (const option of options) {
        ordinal += 1;
        let metadata: Record<string, unknown> | undefined;
        try {
          metadata = storyChoiceMetadata(sourceLines, option.line);
          if (metadata && optionLineCounts.get(option.line) !== 1) {
            fail(row.path, '带 story-choice 规则的选项必须独占一行。', option.line);
            continue;
          }
        } catch (error) {
          fail(row.path, error instanceof Error ? error.message : String(error), option.line);
          continue;
        }
        if (option.targetKind === 'external') {
          fail(row.path, `选项指向外部链接：${option.rawTarget}`, option.line);
          continue;
        }
        let target = option.targetId ? targetDocuments.get(option.targetId) : undefined;
        if (option.targetId && !target) {
          target = db.prepare('SELECT * FROM documents WHERE project_id = ? AND id = ? AND deleted = 0')
            .get(projectId, option.targetId) as DocumentRow | undefined;
          if (target) targetDocuments.set(option.targetId, target);
        }
        if (!target) {
          fail(row.path, `选项指向不存在的文档：${option.rawTarget}`, option.line);
          continue;
        }
        if (!frontmatterHasScene(target.content ?? '')) {
          fail(row.path, `选项目标缺少 scene: true 标记：${target.path}`, option.line);
          continue;
        }
        const text = option.label?.trim() || target.title;
        if (requiresStableIds && typeof metadata?.id !== 'string') {
          fail(row.path, '共享剧情选项必须在 story-choice 中声明稳定 id，不能使用随选项顺序变化的默认 ID。', option.line);
          continue;
        }
        const choiceId = typeof metadata?.id === 'string' ? metadata.id : `c:${nodeId}#${ordinal}`;
        if (metadata && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(choiceId)) {
          fail(row.path, `选项 ID 格式无效：${choiceId}。`, option.line);
          continue;
        }
        const priorChoice = choiceIds.get(choiceId);
        if (priorChoice) {
          fail(row.path, `选项 ID ${choiceId} 已用于 ${priorChoice}。`, option.line);
          continue;
        }
        choiceIds.set(choiceId, `${row.path}:${option.line}`);
        choices.push({
          id: choiceId,
          from: nodeId,
          to: storyNodeId(target.path, sceneFrontmatter(target.content ?? '')),
          text,
          description: typeof metadata?.description === 'string' ? metadata.description : text,
          ...(metadata?.visibleWhen ? { visibleWhen: metadata.visibleWhen } : {}),
          ...(metadata?.enabledWhen ? { enabledWhen: metadata.enabledWhen } : {}),
          effects: metadata?.effects ?? [],
          flags: metadata?.flags ?? [],
        });
        if (!visited.has(target.path)) queue.push(target);
      }
    }

    let initialState: Record<string, unknown> = {
      locationId: entryFields.locationId ?? '',
      sublocationId: entryFields.sublocationId ?? '',
    };
    if (entryFields.initialState) {
      try {
        initialState = {
          ...initialState,
          ...validateInitialStoryState(parseStoryRuleJson(entryFields.initialState, 'initialState'), 'initialState'),
        };
      } catch (error) {
        fail(entry.path, error instanceof Error ? error.message : String(error));
      }
    }
    if (entryFields.shareFactsAcrossStories && !['true', 'false'].includes(entryFields.shareFactsAcrossStories)) {
      fail(entry.path, 'shareFactsAcrossStories 必须是 true 或 false。');
    }
    const priorBuildOwner = db.prepare('SELECT story_id FROM story_builds WHERE project_id = ? AND output_path = ? AND story_id <> ? LIMIT 1')
      .get(projectId, outputPath, storyId) as { story_id: string } | undefined;
    if (priorBuildOwner) {
      fail(entry.path, `剧情产物 ${outputPath} 已属于 ${priorBuildOwner.story_id}，请使用不会映射到同一文件名的 storyId。`);
    }
    const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    const result: CompileStoryResult = {
      storyId,
      outputPath,
      catalogUpdated: false,
      nodeCount: nodes.length,
      choiceCount: choices.length,
      diagnostics,
    };

    const recordBuild = (): void => {
      const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
      db.prepare(`
        INSERT INTO story_builds(project_id, story_id, entry_path, output_path, source_paths_json, diagnostics_json, error_count, warning_count, node_count, choice_count, built_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, story_id) DO UPDATE SET
          entry_path=excluded.entry_path, output_path=excluded.output_path, source_paths_json=excluded.source_paths_json,
          diagnostics_json=excluded.diagnostics_json, error_count=excluded.error_count,
          warning_count=excluded.warning_count, node_count=excluded.node_count,
          choice_count=excluded.choice_count, built_at=excluded.built_at
      `).run(projectId, storyId, entryPath, outputPath, jsonStringify(sourcePaths), jsonStringify(diagnostics), errors,
        diagnostics.length - errors, nodes.length, choices.length, nowIso());
    };
    if (priorBuildOwner || errorCount > 0) {
      if (!dryRun && !priorBuildOwner) recordBuild();
      return result;
    }

    const graph = {
      storyId,
      title: entry.title,
      entryNodeId: storyNodeId(entry.path, entryFields),
      initialState,
      nodes,
      choices,
      ...(entryFields.shareFactsAcrossStories === 'true' ? { shareFactsAcrossStories: true } : {}),
    };
    let catalog: { schemaVersion?: unknown; resources?: unknown } = { schemaVersion: 1, resources: [] };
    const catalogAbsolute = await this.safeExistingPath(state, CONTENT_CATALOG_PATH);
    if (catalogAbsolute) {
      try {
        catalog = JSON.parse(await readFile(catalogAbsolute, 'utf8')) as typeof catalog;
      } catch {
        throw new ContentServiceError('VALIDATION_ERROR', `${CONTENT_CATALOG_PATH} is not valid JSON; refusing to update it.`);
      }
    }
    const resources = Array.isArray(catalog.resources) ? catalog.resources as Array<Record<string, unknown>> : [];
    const publicPath = `data/story/${outputName}.json`;
    const catalogOwner = resources.find((resource) => asRecord(resource)?.publicPath === publicPath
      && asRecord(resource)?.resourceId !== storyId);
    if (catalogOwner) {
      fail(entry.path, `剧情产物 ${outputPath} 已在内容目录中属于 ${String(asRecord(catalogOwner)?.resourceId)}，请使用不会映射到同一文件名的 storyId。`);
    }
    const existingOutput = await this.safeExistingPath(state, outputPath);
    const existingStoryJson = existingOutput ? await readFile(existingOutput, 'utf8') : undefined;
    if (existingStoryJson) {
      try {
        const existingGraph = asRecord(JSON.parse(existingStoryJson) as unknown);
        if (existingGraph?.storyId && existingGraph.storyId !== storyId) {
          fail(entry.path, `剧情产物 ${outputPath} 已属于 ${String(existingGraph.storyId)}，请使用不会映射到同一文件名的 storyId。`);
        }
      } catch {
        // Invalid generated JSON may be repaired by a successful recompilation.
      }
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error') || dryRun) return result;
    const storyJson = `${JSON.stringify(graph, null, 2)}\n`;
    if (existingStoryJson !== storyJson) {
      await this.safeWriteText(state, outputPath, storyJson);
    }
    const index = resources.findIndex((resource) => asRecord(resource)?.resourceId === storyId);
    const current = index >= 0 ? asRecord(resources[index]) : undefined;
    if (!current || current.kind !== 'story' || current.schemaVersion !== 1 || current.publicPath !== publicPath) {
      const entry2 = { resourceId: storyId, kind: 'story', schemaVersion: 1, publicPath };
      if (index >= 0) resources[index] = entry2;
      else resources.push(entry2);
      await this.safeWriteText(state, CONTENT_CATALOG_PATH, `${JSON.stringify({ ...catalog, schemaVersion: 1, resources }, null, 2)}\n`);
      result.catalogUpdated = true;
    }

    recordBuild();
    this.notify({ projectId, paths: [outputPath, CONTENT_CATALOG_PATH], kinds: ['status'], reason: 'save' });
    return result;
  }

  private queueStoryRebuilds(projectId: string, changedPaths: string[]): void {
    if (this.closed || changedPaths.length === 0) return;
    void this.enqueue(async () => {
      try {
        await this.rebuildStoriesForDocuments(projectId, changedPaths);
      } catch {
        // A failed rebuild is recorded on the build row; it must not break indexing.
      }
    });
  }

  private async rebuildStoriesForDocuments(projectId: string, changedPaths: string[]): Promise<void> {
    const db = this.getDatabase();
    const rows = db.prepare('SELECT * FROM story_builds WHERE project_id = ?').all(projectId) as StoryBuildRow[];
    for (const row of rows) {
      const sources = parseJson<string[]>(row.source_paths_json, []).filter((path) => typeof path === 'string');
      const affected = sources.some((source) => changedPaths.some((changed) => source === changed || source.startsWith(`${changed}/`)));
      if (!affected) continue;
      const key = `${projectId}:${row.story_id}`;
      if (this.pendingStoryRebuilds.has(key)) continue;
      this.pendingStoryRebuilds.add(key);
      try {
        const entry = row.entry_path || sources[0];
        if (!entry) continue;
        await this.compileStory({ projectId, entry, storyId: row.story_id });
      } catch (error) {
        const diagnostics: StoryDiagnostic[] = [{ severity: 'error', path: row.entry_path || row.output_path, detail: `自动重编译失败：${toErrorMessage(error)}` }];
        db.prepare('UPDATE story_builds SET diagnostics_json = ?, error_count = ?, warning_count = 0, built_at = ? WHERE project_id = ? AND story_id = ?')
          .run(jsonStringify(diagnostics), 1, nowIso(), projectId, row.story_id);
        this.notify({ projectId, paths: [row.output_path], kinds: ['status'], reason: 'save' });
      } finally {
        this.pendingStoryRebuilds.delete(key);
      }
    }
  }

  private remapStoryBuildPaths(projectId: string, fromPath: string, toPath: string): void {
    const db = this.getDatabase();
    const rows = db.prepare('SELECT * FROM story_builds WHERE project_id = ?').all(projectId) as StoryBuildRow[];
    for (const row of rows) {
      const sources = parseJson<string[]>(row.source_paths_json, []).filter((path) => typeof path === 'string');
      const remapped = sources.map((path) => (path === fromPath ? toPath : path));
      const entryPath = row.entry_path === fromPath ? toPath : row.entry_path;
      if (remapped.every((path, index) => path === sources[index]) && entryPath === row.entry_path) continue;
      db.prepare('UPDATE story_builds SET source_paths_json = ?, entry_path = ? WHERE project_id = ? AND story_id = ?')
        .run(jsonStringify(remapped), entryPath, projectId, row.story_id);
    }
  }

  private async saveDocument(input: SaveDocumentInput): Promise<ContentDocument> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const state = this.project(projectId);
    await this.requireInitialized();
    if (typeof input.content !== 'string') throw new ContentServiceError('INVALID_INPUT', 'content must be a string.');
    let existing: DocumentRow | undefined;
    if (input.id || input.path) {
      try {
        existing = this.resolveDocument(projectId, input.id, input.path);
      } catch (error) {
        if (!(error instanceof ContentServiceError) || error.code !== 'NOT_FOUND') throw error;
      }
    }
    const path = normalizeRelativePath(input.path ?? existing?.path ?? 'notes/new.md');
    if (existing) {
      if (input.expectedRevision === undefined) {
        throw new ContentServiceError('CONTENT_CONFLICT', `document ${existing.path} requires expectedRevision for an existing file.`);
      }
      this.checkExpectedRevision(existing.revision, input.expectedRevision, `document ${existing.path}`);
      await this.readFreshDocument(state, existing);
    } else if (input.expectedRevision) {
      throw new ContentServiceError('CONTENT_CONFLICT', 'new document cannot have an expected revision.');
    }
    const oldPath = existing?.path;
    if (oldPath && oldPath !== path) {
      const destination = this.getDatabase().prepare('SELECT id FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, path) as { id?: string } | undefined;
      if (destination && destination.id !== existing?.id) throw new ContentServiceError('CONTENT_CONFLICT', `destination already exists: ${path}`);
    }
    if (!existing) {
      const destinationAbsolute = resolve(state.root!, ...path.split('/'));
      try {
        const destinationInfo = await lstat(destinationAbsolute);
        if (destinationInfo.isSymbolicLink()) throw new ContentServiceError('PATH_ESCAPE', 'refusing to overwrite a symlink.');
        if (destinationInfo.isFile()) throw new ContentServiceError('CONTENT_CONFLICT', `destination already exists: ${path}`);
        if (destinationInfo.isDirectory()) throw new ContentServiceError('CONTENT_CONFLICT', `destination is a directory: ${path}`);
      } catch (error) {
        if (error instanceof ContentServiceError) throw error;
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
    }
    await this.safeWriteText(state, path, input.content, !existing);
    const info = await stat(resolve(state.root!, ...path.split('/')), { bigint: true });
    const row = this.upsertDocument(projectId, path, input.content, info);
    if (oldPath && oldPath !== path) {
      this.getDatabase().prepare('UPDATE documents SET deleted = 1 WHERE project_id = ? AND id = ? AND path = ?').run(projectId, existing!.id, oldPath);
      this.deleteStorySceneIndex(projectId, oldPath);
    }
    if (input.title && input.title.trim()) {
      this.getDatabase().prepare('UPDATE documents SET title = ?, search_text = ? WHERE project_id = ? AND id = ?')
        .run(input.title.trim(), normalizedSearch(`${path}\n${input.title.trim()}\n${input.content}`), projectId, row.id);
    }
    // An in-place edit can only change this document's outbound links.  Keep
    // incoming links intact and avoid reindexing every document on each save.
    if (existing && oldPath === path) this.rebuildLinksForDocument(projectId, row);
    else this.rebuildAllLinks(projectId);
    const outputRow = this.getDatabase().prepare('SELECT * FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, row.id) as DocumentRow;
    this.notify({ projectId, paths: [path, ...(oldPath && oldPath !== path ? [oldPath] : [])], kinds: ['document', 'directory', 'status'], reason: 'save' });
    if (oldPath && oldPath !== path) this.remapStoryBuildPaths(projectId, oldPath, path);
    this.queueStoryRebuilds(projectId, oldPath && oldPath !== path ? [path, oldPath] : [path]);
    return contentDocumentFromRow(outputRow, this.documentLinks(projectId, row.id));
  }

  private async moveDocument(input: MoveDocumentInput): Promise<MovePreview> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const state = this.project(projectId);
    await this.requireInitialized();
    const source = this.resolveDocument(projectId, input.id, input.path);
    const toPath = normalizeRelativePath(input.toPath, 'toPath');
    this.checkExpectedRevision(source.revision, input.expectedRevision, `document ${source.path}`);
    const destination = this.getDatabase().prepare('SELECT id FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, toPath) as { id?: string } | undefined;
    if (destination && destination.id !== source.id) throw new ContentServiceError('CONTENT_CONFLICT', `destination already exists: ${toPath}`);

    const preview = await this.queryMovePreview({ projectId, op: 'movePreview', id: source.id, toPath });
    if (!preview.canApply) throw new ContentServiceError('CONTENT_CONFLICT', 'document move has conflicts.', preview.conflicts);
    const expectedRevisions = input.expectedRevisions ?? {};
    for (const affected of preview.affected) {
      if (expectedRevisions[affected.id] !== undefined && expectedRevisions[affected.id] !== affected.revision) {
        throw new ContentServiceError('CONTENT_CONFLICT', `linked document changed: ${affected.path}`);
      }
      const current = this.getDatabase().prepare('SELECT revision FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, affected.id) as { revision?: string } | undefined;
      if (!current || current.revision !== affected.revision) throw new ContentServiceError('CONTENT_CONFLICT', `linked document changed: ${affected.path}`);
    }

    const affectedIds = new Set(preview.affected.map((item) => item.id));
    const allDocuments = [...affectedIds]
      .map((id) => this.getDatabase().prepare('SELECT * FROM documents WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as DocumentRow | undefined)
      .filter((document): document is DocumentRow => Boolean(document));
    for (const document of allDocuments) {
      document.content = await this.readFreshDocument(state, document);
    }
    const rewritten = new Map<string, { path: string; content: string; changedLinks: number }>();
    for (const document of allDocuments) {
      const result = document.id === source.id
        ? this.rewriteMovedDocumentOutboundLinks(document.content ?? '', source.path, toPath)
        : this.rewriteDocumentLinks(document.content ?? '', document.path, source.path, toPath);
      rewritten.set(document.id, {
        path: document.id === source.id ? toPath : document.path,
        content: result.content,
        changedLinks: result.changedLinks,
      });
    }
    const sourceAbsolute = resolve(state.root!, ...source.path.split('/'));
    const destinationAbsolute = resolve(state.root!, ...toPath.split('/'));
    const sourceResolved = await realpath(sourceAbsolute).catch(() => undefined);
    if (!sourceResolved || !isContained(state.root!, sourceResolved)) throw new ContentServiceError('PATH_ESCAPE', 'source path is outside project root.');
    await mkdir(dirname(destinationAbsolute), { recursive: true });
    const destinationParent = await realpath(dirname(destinationAbsolute));
    if (!isContained(state.root!, destinationParent)) throw new ContentServiceError('PATH_ESCAPE', 'destination parent escapes project root.');
    try {
      const destinationInfo = await lstat(destinationAbsolute);
      if (destinationInfo.isSymbolicLink()) throw new ContentServiceError('PATH_ESCAPE', 'refusing to replace a destination symlink.');
      throw new ContentServiceError('CONTENT_CONFLICT', `destination already exists: ${toPath}`);
    } catch (error) {
      if (error instanceof ContentServiceError) throw error;
      if ((error as { code?: string }).code !== 'ENOENT') throw error;
    }
    await rename(sourceResolved, destinationAbsolute);
    try {
      for (const document of allDocuments) {
        const change = rewritten.get(document.id)!;
        if (!change.content || change.content === document.content) continue;
        await this.safeWriteText(state, change.path, change.content);
      }
    } catch (error) {
      // The rename is recoverable if a later link write failed. Restore the
      // source name before surfacing the failure; already written links remain
      // CAS protected and are re-indexed from disk below.
      await rename(destinationAbsolute, sourceResolved).catch(() => undefined);
      throw error;
    }
    for (const document of allDocuments) {
      const change = rewritten.get(document.id)!;
      const targetPath = change.path;
      const info = await stat(resolve(state.root!, ...targetPath.split('/')), { bigint: true });
      this.upsertDocument(projectId, targetPath, change.content, info);
      if (document.id !== source.id && change.content === document.content) continue;
    }
    this.getDatabase().prepare('UPDATE documents SET deleted = 1 WHERE project_id = ? AND id = ? AND path = ?').run(projectId, source.id, source.path);
    this.deleteStorySceneIndex(projectId, source.path);
    // The destination document keeps the original identity and history. The
    // path update above may have conflicted with the unique index, so explicitly
    // restore it as one row after the source-path tombstone.
    const moved = this.getDatabase().prepare('SELECT * FROM documents WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, toPath) as DocumentRow | undefined;
    if (moved && moved.id !== source.id) {
      this.getDatabase().prepare('DELETE FROM documents WHERE project_id = ? AND id = ?').run(projectId, moved.id);
    }
    if (!moved || moved.id !== source.id) {
      const sourceRevision = hashBytes(rewritten.get(source.id)!.content);
      this.getDatabase().prepare('UPDATE documents SET path = ?, content = ?, revision = ?, title = ?, deleted = 0, size = ?, updated_at = ?, search_text = ? WHERE project_id = ? AND id = ?')
        .run(toPath, rewritten.get(source.id)!.content, sourceRevision, titleFromMarkdown(toPath, rewritten.get(source.id)!.content), rewritten.get(source.id)!.content.length, nowIso(), normalizedSearch(`${toPath}\n${rewritten.get(source.id)!.content}`), projectId, source.id);
    }
    this.rebuildAllLinks(projectId);
    this.notify({ projectId, paths: [source.path, toPath, ...preview.affected.map((item) => item.path)], kinds: ['document', 'status'], reason: 'move' });
    this.remapStoryBuildPaths(projectId, source.path, toPath);
    this.queueStoryRebuilds(projectId, [toPath, source.path]);
    const movedRow = this.resolveDocument(projectId, source.id);
    return {
      ...preview,
      source: contentDocumentFromRow(movedRow, this.documentLinks(projectId, movedRow.id)),
      toPath,
    };
  }

  private async savePipelineCard(input: { projectId: string; card: Record<string, unknown>; expectedRevision: string | null }): Promise<CardItem> {
    await this.requireInitialized();
    const card = validateCard(input.card);
    const projectId = ensureString(input.projectId, 'projectId');
    const id = String(card.id);
    const state = this.project(projectId);
    const existing = this.getDatabase().prepare('SELECT * FROM cards WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as CardRow | undefined;
    if (existing) {
      if (typeof input.expectedRevision !== 'string') throw new ContentServiceError('CONTENT_CONFLICT', `card ${id} already exists; import it before editing.`);
      return this.updateCard({ projectId, id, card, expectedRevision: input.expectedRevision });
    }
    if (input.expectedRevision !== null) throw new ContentServiceError('CONTENT_CONFLICT', `card ${id} disappeared since this draft was created.`);
    await this.validateCardReferences(state, card);
    const { path, key } = cardCollection(card.kind);
    const absolute = await this.safeExistingPath(state, path);
    const source = absolute ? JSON.parse(await readFile(absolute, 'utf8')) : { [key]: [] };
    if (!Array.isArray(source[key])) throw new ContentServiceError('VALIDATION_ERROR', `${path} needs a ${key} array.`);
    if (source[key].some((item: any) => item?.id === id)) throw new ContentServiceError('CONTENT_CONFLICT', `card ${id} already exists on disk.`);
    await this.safeWriteText(state, path, JSON.stringify({ ...source, [key]: [...source[key], card] }, null, 2) + '\n');
    await this.indexCardFile(state, path);
    this.notify({ projectId, paths: [path], kinds: ['card', 'status'], reason: 'card' });
    const row = this.getDatabase().prepare('SELECT * FROM cards WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as CardRow;
    return cardFromRow(row);
  }

  private async updateCard(input: UpdateCardInput): Promise<CardItem> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const id = ensureString(input?.id, 'card id');
    const state = this.project(projectId);
    await this.requireInitialized();
    const db = this.getDatabase();
    const row = db.prepare('SELECT * FROM cards WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as CardRow | undefined;
    if (!row) throw new ContentServiceError('NOT_FOUND', `card was not found: ${id}`);
    this.checkExpectedRevision(row.revision, input.expectedRevision, `card ${id}`);
    const current = parseJson<Record<string, unknown>>(row.json, {});
    const updated = input.card ?? { ...current, ...(input.patch ?? {}) };
    if (updated.id !== id) throw new ContentServiceError('VALIDATION_ERROR', 'card id is immutable.');
    if (!updated.kind || updated.kind !== row.kind) throw new ContentServiceError('VALIDATION_ERROR', 'card kind is immutable and must remain valid.');
    validateCard(updated);
    await this.validateCardReferences(state, updated);
    const sourceAbsolute = resolve(state.root!, ...row.path.split('/'));
    let sourceText: string;
    try {
      sourceText = await readFile(sourceAbsolute, 'utf8');
    } catch (error) {
      throw new ContentServiceError('CONTENT_CONFLICT', `card source changed or disappeared: ${row.path}`, { cause: toErrorMessage(error) });
    }
    const currentSourceRevision = hashBytes(sourceText);
    if (row.source_revision && currentSourceRevision !== row.source_revision) {
      throw new ContentServiceError('CONTENT_CONFLICT', `card source changed since it was read: ${row.path}`, {
        expected: row.source_revision,
        actual: currentSourceRevision,
      });
    }
    let collectionJson: unknown;
    try {
      collectionJson = JSON.parse(sourceText) as unknown;
    } catch (error) {
      throw new ContentServiceError('CONTENT_CONFLICT', `card source is no longer valid JSON: ${row.path}`, { cause: toErrorMessage(error) });
    }
    const collection = asRecord(collectionJson);
    const values = collection?.[row.collection];
    if (!Array.isArray(values)) throw new ContentServiceError('VALIDATION_ERROR', `${row.path} no longer contains collection ${row.collection}.`);
    const index = values.findIndex((value) => asRecord(value)?.id === id);
    if (index < 0) throw new ContentServiceError('CONTENT_CONFLICT', `card ${id} is missing from its source file.`);
    const nextValues = values.slice();
    nextValues[index] = updated;
    const nextCollection = { ...collection, [row.collection]: nextValues };
    await this.safeWriteText(state, row.path, `${JSON.stringify(nextCollection, null, 2)}\n`);
    await this.indexCardFile(state, row.path);
    const output = db.prepare('SELECT * FROM cards WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as CardRow;
    this.notify({ projectId, paths: [row.path], kinds: ['card', 'status'], reason: 'card' });
    return cardFromRow(output);
  }

  private async updateAsset(input: UpdateAssetInput): Promise<AssetItem> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const id = ensureString(input?.id, 'asset id');
    await this.requireInitialized();
    const db = this.getDatabase();
    const row = db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as AssetRow | undefined;
    if (!row) throw new ContentServiceError('NOT_FOUND', `asset was not found: ${id}`);
    const actualMetadataRevision = row.metadata_revision || hashBytes(row.metadata_json);
    if (input.expectedMetadataRevision === undefined) {
      throw new ContentServiceError('CONTENT_CONFLICT', `asset ${id} requires expectedMetadataRevision.`);
    }
    if (input.expectedMetadataRevision !== actualMetadataRevision) {
      throw new ContentServiceError('CONTENT_CONFLICT', `asset metadata changed since it was read: ${id}`, {
        expected: input.expectedMetadataRevision,
        actual: actualMetadataRevision,
      });
    }
    if (input.name !== undefined && typeof input.name !== 'string') throw new ContentServiceError('INVALID_INPUT', 'asset.name must be a string.');
    if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== 'string'))) {
      throw new ContentServiceError('INVALID_INPUT', 'asset.tags must be an array of strings.');
    }
    const storedMetadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
    const currentName = row.name?.trim() || (typeof storedMetadata.name === 'string' ? storedMetadata.name : '');
    const currentTags = row.tags_json ? parseJson<string[]>(row.tags_json, []) : (Array.isArray(storedMetadata.tags) ? storedMetadata.tags.filter((tag): tag is string => typeof tag === 'string') : []);
    const name = input.name === undefined ? currentName : input.name.trim();
    const tags = input.tags === undefined ? currentTags : [...input.tags];
    const metadata = { ...storedMetadata, name, tags };
    const metadataJson = jsonStringify(metadata);
    const metadataRevision = hashBytes(metadataJson);
    db.prepare('UPDATE assets SET name = ?, tags_json = ?, metadata_json = ?, metadata_revision = ?, updated_at = ? WHERE project_id = ? AND id = ? AND deleted = 0')
      .run(name, jsonStringify(tags), metadataJson, metadataRevision, nowIso(), projectId, id);
    await this.writeManifest(projectId);
    const output = db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, id) as AssetRow;
    this.notify({ projectId, paths: [output.path], kinds: ['asset', 'status'], reason: 'adopt' });
    return assetFromRow(output);
  }

  /**
   * Keep the local write guard aligned with CardGame's contentIdRegistry.  A
   * fixture or another small project may not carry the canonical data files;
   * in that case the shape validator still protects the write and there is no
   * registry available to consult.  When a registry is present, an unknown ID
   * is a source validation error before the source JSON is touched.
   */
  private async validateCardReferences(state: ProjectState, card: Record<string, unknown>): Promise<void> {
    const readRegistry = async (
      path: string,
      collection: string,
    ): Promise<Set<string> | undefined> => {
      const absolute = await this.safeExistingPath(state, path);
      if (!absolute) return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(absolute, 'utf8'));
      } catch (error) {
        throw new ContentServiceError('VALIDATION_ERROR', `${path} is not valid JSON: ${toErrorMessage(error)}`);
      }
      const record = asRecord(parsed);
      const entries = record?.[collection];
      if (!Array.isArray(entries)) {
        throw new ContentServiceError('VALIDATION_ERROR', `${path} must contain a ${collection} array.`);
      }
      const ids = new Set<string>();
      for (const entry of entries) {
        const id = asRecord(entry)?.id;
        if (typeof id === 'string' && id.trim()) ids.add(id);
      }
      return ids;
    };

    const requireRegistryId = (
      registry: Set<string> | undefined,
      id: unknown,
      field: string,
      registryPath: string,
    ): void => {
      if (registry === undefined || typeof id !== 'string' || id.trim().length === 0) return;
      if (!registry.has(id)) {
        throw new ContentServiceError(
          'VALIDATION_ERROR',
          `card.${field} references unknown id ${id} in ${registryPath}.`,
          { field, id, registryPath },
        );
      }
    };

    const kind = asString(card.kind);
    if (kind === 'unit') {
      const registry = await readRegistry('public/data/config/combat-baseline.json', 'realms');
      requireRegistryId(registry, card.realmId, 'realmId', 'public/data/config/combat-baseline.json');
    }
    if (kind === 'artifact') {
      const registry = await readRegistry('public/data/config/artifact-grade.json', 'grades');
      requireRegistryId(registry, card.gradeId, 'gradeId', 'public/data/config/artifact-grade.json');
    }

    if (card.gongfaIds !== undefined && Array.isArray(card.gongfaIds)) {
      const registry = await readRegistry('public/data/gongfa/gongfa-list.json', 'gongfa');
      if (registry !== undefined) {
        for (const [index, id] of card.gongfaIds.entries()) {
          requireRegistryId(registry, id, `gongfaIds[${index}]`, 'public/data/gongfa/gongfa-list.json');
        }
      }
    }

    const statusRegistry = await readRegistry('public/data/config/status-definitions.json', 'statuses');
    if (statusRegistry === undefined) return;
    const visitActions = (value: unknown, context: string): void => {
      const record = asRecord(value);
      if (!record) return;
      const actions = record.actions;
      if (Array.isArray(actions)) {
        for (const [index, action] of actions.entries()) {
          const actionRecord = asRecord(action);
          if (actionRecord?.type === 'applyStatus') {
            requireRegistryId(statusRegistry, actionRecord.statusId, `${context}.actions[${index}].statusId`, 'public/data/config/status-definitions.json');
          }
        }
      }
      const schema = asRecord(record.schema);
      if (schema) visitActions(schema, `${context}.schema`);
    };
    if (Array.isArray(card.effects)) {
      for (const [index, effect] of card.effects.entries()) visitActions(effect, `card.effects[${index}]`);
    }
  }

  private candidateRoot(projectId: string): string {
    return resolve(this.dataRoot, 'candidates', projectId);
  }

  private async registerCandidates(input: RegisterCandidatesInput): Promise<Array<Record<string, unknown>>> {
    const projectId = ensureString(input?.projectId, 'projectId');
    this.project(projectId);
    await this.requireInitialized();
    if (!Array.isArray(input.candidates)) throw new ContentServiceError('INVALID_INPUT', 'candidates must be an array.');
    const candidateRoot = this.candidateRoot(projectId);
    await mkdir(candidateRoot, { recursive: true });
    const results: Array<Record<string, unknown>> = [];
    for (const candidate of input.candidates) {
      const candidateInput = candidate as CandidateInput;
      const name = String(candidateInput.name ?? candidateInput.fileName ?? 'candidate.bin').trim() || 'candidate.bin';
      const fileName = basename(name).replace(/[^\p{L}\p{N}._-]+/gu, '_');
      let bytes: Buffer;
      if (candidateInput.data !== undefined || candidateInput.base64 !== undefined) {
        const encoded = candidateInput.base64 ?? candidateInput.data!;
        const source = encoded.startsWith('data:') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
        bytes = Buffer.from(source, 'base64');
      } else if (candidateInput.sourcePath) {
        const sourcePath = resolve(candidateInput.sourcePath);
        const dataRootReal = await realpath(this.dataRoot);
        const sourceReal = await realpath(sourcePath).catch(() => undefined);
        if (!sourceReal || !isContained(dataRootReal, sourceReal)) throw new ContentServiceError('PATH_ESCAPE', 'candidate source must be inside dataRoot.');
        bytes = await readFile(sourceReal);
      } else {
        throw new ContentServiceError('INVALID_INPUT', `candidate ${name} requires data, base64, or sourcePath.`);
      }
      const revision = hashBytes(bytes);
      const id = candidateInput.id?.trim() || `candidate:${projectId}:${revision}`;
      const previous = this.getDatabase().prepare('SELECT * FROM candidates WHERE project_id = ? AND id = ?').get(projectId, id) as CandidateRow | undefined;
      let row: CandidateRow;
      if (previous) {
        if (previous.revision !== revision) {
          throw new ContentServiceError('CONTENT_CONFLICT', `candidate ${id} already contains different bytes.`, {
            expected: previous.revision,
            actual: revision,
          });
        }
        row = previous;
      } else {
        const candidateDir = resolve(candidateRoot, id.replace(/[^\p{L}\p{N}._-]+/gu, '_'));
        await mkdir(candidateDir, { recursive: true });
        const filePath = resolve(candidateDir, fileName);
        await writeFile(filePath, bytes, { mode: 0o600 });
        const mimeType = candidateInput.mimeType ?? mediaTypeFromPath(fileName);
        const metadata = candidateInput.metadata ?? {};
        const createdAt = nowIso();
        this.getDatabase().prepare(`
          INSERT INTO candidates(project_id, id, name, file_path, revision, mime_type, size, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, id) DO UPDATE SET name=excluded.name, file_path=excluded.file_path,
            revision=excluded.revision, mime_type=excluded.mime_type, size=excluded.size,
            metadata_json=excluded.metadata_json, created_at=excluded.created_at
        `).run(projectId, id, name, filePath, revision, mimeType, bytes.byteLength, jsonStringify(metadata), createdAt);
        row = this.getDatabase().prepare('SELECT * FROM candidates WHERE project_id = ? AND id = ?').get(projectId, id) as CandidateRow;
      }
      const base: Record<string, unknown> = {
        id: row.id,
        title: row.name,
        path: toPosixPath(relative(this.dataRoot, row.file_path)),
        revision: row.revision,
        mimeType: row.mime_type,
        size: row.size,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
      };
      results.push(input.autoAdopt ? await this.autoAdoptCandidate(projectId, row, input.autoAdopt, base) : base);
    }
    this.notify({ projectId, kinds: ['asset', 'status'], reason: 'candidate' });
    return results;
  }

  private async autoAdoptCandidate(
    projectId: string,
    row: CandidateRow,
    options: AutoAdoptOptions,
    base: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const db = this.getDatabase();
    const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
    const storedInspection = (value: unknown): CandidateInspection | undefined => {
      const record = asRecord(value);
      if (!record || typeof record.passed !== 'boolean' || !Array.isArray(record.reasons)) return undefined;
      return { passed: record.passed, reasons: record.reasons.filter((reason): reason is string => typeof reason === 'string') };
    };
    const adopted = db.prepare('SELECT * FROM asset_versions WHERE project_id = ? AND candidate_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(projectId, row.id) as AssetVersionRow | undefined;
    if (adopted) {
      const inspection = storedInspection(metadata.inspection) ?? { passed: true, reasons: [] };
      return { ...base, metadata, status: 'adopted', inspection, assetId: adopted.asset_id, assetPath: adopted.path, versionId: adopted.id };
    }
    const inspection = storedInspection(metadata.inspection) ?? await inspectCandidateFile(row.file_path, row.mime_type, row.size);
    if (!inspection.passed) {
      const nextMetadata = { ...metadata, inspection };
      db.prepare('UPDATE candidates SET metadata_json = ? WHERE project_id = ? AND id = ?').run(jsonStringify(nextMetadata), projectId, row.id);
      return { ...base, metadata: nextMetadata, status: 'candidate', inspection };
    }
    const path = asString(options.path) ?? asString(metadata.path);
    const assetId = asString(options.assetId) ?? asString(metadata.assetId);
    const asset = await this.adoptVersion({
      projectId,
      candidateId: row.id,
      ...(path ? { path } : {}),
      ...(assetId ? { assetId } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    });
    const nextMetadata = { ...metadata, inspection };
    db.prepare('UPDATE candidates SET metadata_json = ? WHERE project_id = ? AND id = ?').run(jsonStringify(nextMetadata), projectId, row.id);
    return {
      ...base,
      metadata: nextMetadata,
      status: 'adopted',
      inspection,
      assetId: asset.id,
      assetPath: asset.path,
      ...(asset.currentVersionId ? { versionId: asset.currentVersionId } : {}),
    };
  }

  private async adoptVersion(input: AdoptVersionInput): Promise<AssetItem> {
    const projectId = ensureString(input?.projectId, 'projectId');
    const state = this.project(projectId);
    await this.requireInitialized();
    const db = this.getDatabase();
    let candidate: CandidateRow | undefined;
    if (input.candidateId) candidate = db.prepare('SELECT * FROM candidates WHERE project_id = ? AND id = ?').get(projectId, input.candidateId) as CandidateRow | undefined;
    let existingVersion: AssetVersionRow | undefined;
    if (input.versionId) existingVersion = db.prepare('SELECT * FROM asset_versions WHERE project_id = ? AND id = ?').get(projectId, input.versionId) as AssetVersionRow | undefined;
    if (!candidate && !existingVersion) throw new ContentServiceError('NOT_FOUND', 'candidate or version was not found.');
    if (candidate && !existingVersion) {
      const source = await realpath(candidate.file_path).catch(() => undefined);
      const dataRootReal = await realpath(this.dataRoot);
      if (!source || !isContained(dataRootReal, source)) throw new ContentServiceError('PATH_ESCAPE', 'candidate path escapes dataRoot.');
    }
    const sourcePath = candidate?.file_path ?? existingVersion!.path;
    const bytes = candidate ? await readFile(sourcePath) : await this.readVersionBytes(state, existingVersion!);
    const desiredPath = normalizeAssetDestination(input.path ?? input.fileName ?? candidate?.name ?? basename(existingVersion?.path ?? 'asset.bin'));
    const revision = hashBytes(bytes);
    const existingById = input.assetId
      ? db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, input.assetId) as AssetRow | undefined
      : undefined;
    if (input.assetId && !existingById) throw new ContentServiceError('NOT_FOUND', `asset was not found: ${input.assetId}`);
    const existingAtPath = db.prepare('SELECT * FROM assets WHERE project_id = ? AND path = ? AND deleted = 0').get(projectId, desiredPath) as AssetRow | undefined;
    const logicalAsset = existingById ?? existingAtPath;
    const assetId = input.assetId ?? existingAtPath?.id ?? `asset:${projectId}:${desiredPath}`;
    let existingVersionByHash = db.prepare('SELECT * FROM asset_versions WHERE project_id = ? AND asset_id = ? AND revision = ? ORDER BY created_at DESC LIMIT 1')
      .get(projectId, assetId, revision) as AssetVersionRow | undefined;
    if (existingVersionByHash) {
      const reusablePath = await this.safeExistingPath(state, existingVersionByHash.path);
      if (!reusablePath || await hashFile(reusablePath) !== revision) existingVersionByHash = undefined;
    }
    const adoptedPath = existingVersionByHash?.path ?? await this.chooseAdoptPath(state, desiredPath, revision, logicalAsset?.path);
    const versionId = existingVersionByHash?.id ?? `version:${projectId}:${hashBytes(`${assetId}:${revision}`)}`;
    if (!existingVersionByHash) await this.safeWriteBytes(state, adoptedPath, bytes, true);
    const inspection = await inspectMediaFile(resolve(state.root!, ...adoptedPath.split('/')));
    const existingMetadata = logicalAsset ? parseJson<Record<string, unknown>>(logicalAsset.metadata_json, {}) : {};
    const name = logicalAsset?.name?.trim() ?? '';
    const tags = logicalAsset?.tags_json ? parseJson<string[]>(logicalAsset.tags_json, []) : [];
    const metadata = {
      ...existingMetadata,
      ...(inspection.metadata ?? {}),
      ...(candidate ? parseJson<Record<string, unknown>>(candidate.metadata_json, {}) : {}),
      ...(input.metadata ?? {}),
      ...(name ? { name } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
    const metadataJson = jsonStringify(metadata);
    const metadataRevision = hashBytes(metadataJson);
    const createdAt = nowIso();
    const logicalPath = logicalAsset?.path ?? desiredPath;
    db.prepare(`
      INSERT INTO assets(project_id, id, path, kind, mime_type, name, tags_json, metadata_revision, revision, size, width, height, duration_ms, frame_count, metadata_json, current_version_id, deleted, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET path=excluded.path, kind=excluded.kind, mime_type=excluded.mime_type,
        revision=excluded.revision, size=excluded.size, width=excluded.width, height=excluded.height,
        duration_ms=excluded.duration_ms, frame_count=excluded.frame_count, metadata_json=excluded.metadata_json,
        metadata_revision=excluded.metadata_revision,
        current_version_id=excluded.current_version_id, deleted=0, updated_at=excluded.updated_at
    `).run(projectId, assetId, logicalPath, inspection.kind, inspection.mimeType, name, jsonStringify(tags), metadataRevision, revision, inspection.size, inspection.width ?? null, inspection.height ?? null, inspection.durationMs ?? null, inspection.frameCount ?? null, metadataJson, versionId, createdAt);
    db.prepare(`
      INSERT INTO asset_versions(project_id, id, asset_id, path, revision, mime_type, size, width, height, duration_ms, frame_count, source, candidate_id, metadata_json, created_at, adopted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'adopted', ?, ?, ?, 1)
      ON CONFLICT(project_id, id) DO NOTHING
    `).run(projectId, versionId, assetId, adoptedPath, revision, inspection.mimeType, inspection.size, inspection.width ?? null, inspection.height ?? null, inspection.durationMs ?? null, inspection.frameCount ?? null, candidate?.id ?? null, metadataJson, createdAt);
    await this.writeManifest(projectId);
    const output = db.prepare('SELECT * FROM assets WHERE project_id = ? AND id = ? AND deleted = 0').get(projectId, assetId) as AssetRow;
    this.notify({ projectId, paths: [logicalPath, adoptedPath], kinds: ['asset', 'status'], reason: 'adopt' });
    return assetFromRow(output);
  }

  private async chooseAdoptPath(state: ProjectState, desiredPath: string, revision: string, logicalPath?: string): Promise<string> {
    if (!state.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
    const exists = async (path: string): Promise<boolean> => {
      const absolute = resolve(state.root!, ...path.split('/'));
      try {
        const info = await lstat(absolute);
        if (info.isSymbolicLink()) throw new ContentServiceError('PATH_ESCAPE', `refusing to adopt through a symlink: ${path}`);
        return true;
      } catch (error) {
        if (error instanceof ContentServiceError) throw error;
        if ((error as { code?: string }).code === 'ENOENT') return false;
        throw error;
      }
    };
    if (!(await exists(desiredPath)) && desiredPath !== logicalPath) return desiredPath;
    const extension = extname(desiredPath);
    const stem = extension ? desiredPath.slice(0, -extension.length) : desiredPath;
    const suffix = `.${revision.slice(0, 16)}`;
    for (let index = 0; index < 1000; index += 1) {
      const candidate = `${stem}${suffix}${index === 0 ? '' : `-${index}`}${extension}`;
      if (!(await exists(candidate))) return candidate;
    }
    throw new ContentServiceError('CONTENT_CONFLICT', `unable to allocate an immutable path for ${desiredPath}.`);
  }

  private async readVersionBytes(state: ProjectState, version: AssetVersionRow): Promise<Buffer> {
    if (!state.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
    const absolute = await this.safeExistingPath(state, version.path);
    if (!absolute) throw new ContentServiceError('NOT_FOUND', 'asset version file is unavailable.');
    return readFile(absolute);
  }

  private async loadManifest(projectId: string): Promise<AssetManifest> {
    const cached = this.manifestCache.get(projectId);
    if (cached) return cached;
    const project = this.project(projectId);
    const projectPath = project.root ? resolve(project.root, ASSET_DIRECTORY, MANIFEST_FILE_NAME) : undefined;
    const workaPath = resolve(this.dataRoot, `${projectId}-${MANIFEST_FILE_NAME}`);
    const sharedPath = resolve(this.dataRoot, MANIFEST_FILE_NAME);
    let parsed: unknown;
    try {
      parsed = projectPath ? JSON.parse(await readFile(projectPath, 'utf8')) : undefined;
    } catch {
      try {
        parsed = JSON.parse(await readFile(workaPath, 'utf8'));
      } catch {
        try {
          parsed = JSON.parse(await readFile(sharedPath, 'utf8'));
        } catch {
          parsed = undefined;
        }
      }
    }
    const record = asRecord(parsed);
    const assets = Array.isArray(record?.assets) ? record.assets.filter((value): value is AssetManifestEntry => {
      const item = asRecord(value);
      return typeof item?.id === 'string' && typeof item.path === 'string';
    }) : [];
    const manifest: AssetManifest = {
      schemaVersion: 1,
      assets,
      entriesByPath: new Map(assets.map((asset) => [asset.path, asset])),
      entriesByFilePath: new Map(),
    };
    for (const asset of assets) {
      manifest.entriesByFilePath.set(asset.path, asset);
      if (asset.currentPath) manifest.entriesByFilePath.set(asset.currentPath, asset);
      for (const version of asset.versions ?? []) {
        if (!manifest.entriesByFilePath.has(version.path)) manifest.entriesByFilePath.set(version.path, asset);
      }
    }
    this.manifestCache.set(projectId, manifest);
    return manifest;
  }

  private async writeManifest(projectId: string): Promise<void> {
    const manifest = await this.loadManifest(projectId);
    const db = this.getDatabase();
    const rows = db.prepare('SELECT * FROM assets WHERE project_id = ? AND deleted = 0 ORDER BY path').all(projectId) as AssetRow[];
    manifest.assets = rows.map((row) => ({
      id: row.id,
      path: row.path,
      ...(row.name ? { name: row.name } : {}),
      ...(row.tags_json ? { tags: parseJson<string[]>(row.tags_json, []) } : {}),
      metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
      ...(row.metadata_revision ? { metadataRevision: row.metadata_revision } : {}),
      ...(row.current_version_id
        ? (() => {
          const current = db.prepare('SELECT path FROM asset_versions WHERE project_id = ? AND id = ?').get(projectId, row.current_version_id) as { path?: string } | undefined;
          return current?.path && current.path !== row.path ? { currentPath: current.path } : {};
        })()
        : {}),
      ...(row.current_version_id ? { currentVersionId: row.current_version_id } : {}),
      versions: (db.prepare('SELECT id, path, revision, mime_type, metadata_json FROM asset_versions WHERE project_id = ? AND asset_id = ? ORDER BY created_at').all(projectId, row.id) as Array<{ id: string; path: string; revision: string; mime_type: string; metadata_json: string }>).map((version) => ({
        id: version.id,
        path: version.path,
        revision: version.revision,
        mimeType: version.mime_type,
        metadata: parseJson<Record<string, unknown>>(version.metadata_json, {}),
      })),
    }));
    manifest.entriesByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
    manifest.entriesByFilePath = new Map();
    for (const asset of manifest.assets) {
      manifest.entriesByFilePath.set(asset.path, asset);
      if (asset.currentPath) manifest.entriesByFilePath.set(asset.currentPath, asset);
      for (const version of asset.versions ?? []) {
        if (!manifest.entriesByFilePath.has(version.path)) manifest.entriesByFilePath.set(version.path, asset);
      }
    }
    const project = this.project(projectId);
    if (!project.root) throw new ContentServiceError('NOT_FOUND', 'project root is unavailable.');
    await this.safeWriteText(project, `${ASSET_DIRECTORY}/${MANIFEST_FILE_NAME}`, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function normalizeAssetDestination(value: string): string {
  const normalized = normalizeRelativePath(value, 'asset path');
  if (normalized === ASSET_DIRECTORY || !normalized.startsWith(`${ASSET_DIRECTORY}/`)) {
    return `${ASSET_DIRECTORY}/${basename(normalized)}`;
  }
  return normalized;
}

function requireCardRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) throw new ContentServiceError('VALIDATION_ERROR', 'card must be an object.');
  return record;
}

function requireCardString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContentServiceError('VALIDATION_ERROR', `card.${field} must be a non-empty string.`);
  }
  return value;
}

function requireFiniteNumber(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
    throw new ContentServiceError('VALIDATION_ERROR', `card.${field} must be a finite number.`);
  }
}

function requireBoolean(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] !== 'boolean') throw new ContentServiceError('VALIDATION_ERROR', `card.${field} must be boolean.`);
}

function requireArray(record: Record<string, unknown>, field: string, required = false): unknown[] | undefined {
  const value = record[field];
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value)) throw new ContentServiceError('VALIDATION_ERROR', `card.${field} must be an array.`);
  return value;
}

function validateEffect(value: unknown, context: string): void {
  const effect = asRecord(value);
  if (!effect) throw new ContentServiceError('VALIDATION_ERROR', `${context} must be an object.`);
  const actions = effect.actions;
  if (actions !== undefined && !Array.isArray(actions)) throw new ContentServiceError('VALIDATION_ERROR', `${context}.actions must be an array.`);
  const conditions = effect.conditions;
  if (conditions !== undefined && !Array.isArray(conditions)) throw new ContentServiceError('VALIDATION_ERROR', `${context}.conditions must be an array.`);
  const schema = asRecord(effect.schema);
  if (effect.schema !== undefined && !schema) throw new ContentServiceError('VALIDATION_ERROR', `${context}.schema must be an object.`);
  if (schema) {
    if (!asRecord(schema.event)) throw new ContentServiceError('VALIDATION_ERROR', `${context}.schema.event must be an object.`);
    if (!Array.isArray(schema.actions)) throw new ContentServiceError('VALIDATION_ERROR', `${context}.schema.actions must be an array.`);
  }
}

/**
 * CardGame's runtime has pure catalog checks for the card collection: a
 * discriminated `kind`, required fields for each `public/data/types/cards/*`
 * interface, and effect arrays.  These checks are intentionally local so the
 * Worka service can validate a proposed CAS write before touching the source
 * JSON file; the game still remains the final cross-resource catalog validator.
 */
export function validateCard(value: unknown): Record<string, unknown> {
  const card = requireCardRecord(value);
  const id = requireCardString(card, 'id');
  if (!/^[A-Za-z0-9_.:-]+$/u.test(id)) throw new ContentServiceError('VALIDATION_ERROR', 'card.id contains unsupported characters.');
  requireCardString(card, 'name');
  requireCardString(card, 'description');
  const kind = requireCardString(card, 'kind');
  if (!CARD_KINDS.has(kind)) throw new ContentServiceError('VALIDATION_ERROR', `card.kind must be one of ${[...CARD_KINDS].join(', ')}.`);
  const rarity = requireCardString(card, 'rarity');
  if (!CARD_RARITIES.has(rarity)) throw new ContentServiceError('VALIDATION_ERROR', `card.rarity is not recognized: ${rarity}`);
  if (card.labels !== undefined && (!Array.isArray(card.labels) || card.labels.some((label) => typeof label !== 'string'))) {
    throw new ContentServiceError('VALIDATION_ERROR', 'card.labels must be an array of strings.');
  }
  if (card.limitPerDeck !== undefined && (typeof card.limitPerDeck !== 'number' || !Number.isInteger(card.limitPerDeck) || card.limitPerDeck < 1)) {
    throw new ContentServiceError('VALIDATION_ERROR', 'card.limitPerDeck must be a positive integer.');
  }
  switch (kind) {
    case 'unit':
      requireCardString(card, 'realmId');
      requireCardString(card, 'race');
      requireFiniteNumber(card, 'attack');
      requireFiniteNumber(card, 'health');
      requireArray(card, 'linggen');
      requireArray(card, 'gongfaIds');
      break;
    case 'artifact':
      requireCardString(card, 'gradeId');
      // The current CardGame data also uses `field` for field equipment even
      // though the historical public type only documented unit/player.
      if (card.equipTarget !== 'unit' && card.equipTarget !== 'player' && card.equipTarget !== 'field') throw new ContentServiceError('VALIDATION_ERROR', 'artifact.equipTarget must be unit, player, or field.');
      requireArray(card, 'elements', true);
      if (card.attackBonus !== undefined) requireFiniteNumber(card, 'attackBonus');
      if (card.healthBonus !== undefined) requireFiniteNumber(card, 'healthBonus');
      break;
    case 'talisman':
      requireBoolean(card, 'isInstant');
      requireCardString(card, 'target');
      requireArray(card, 'effects', true);
      break;
    case 'field':
      requireBoolean(card, 'symmetric');
      requireArray(card, 'effects', true);
      break;
    case 'skill':
      requireCardString(card, 'cooldownType');
      requireArray(card, 'effects', true);
      break;
    case 'pill':
      if (typeof card.grade !== 'number' || !Number.isInteger(card.grade) || card.grade < 1 || card.grade > 9) throw new ContentServiceError('VALIDATION_ERROR', 'pill.grade must be an integer from 1 to 9.');
      requireBoolean(card, 'isInstant');
      requireCardString(card, 'target');
      requireArray(card, 'effects', true);
      break;
  }
  for (const [field, value] of Object.entries(card)) {
    if (field === 'effects' && Array.isArray(value)) value.forEach((effect, index) => validateEffect(effect, `card.effects[${index}]`));
  }
  return card;
}

export function createContentService(options: ContentServiceOptions): ContentService {
  return new ContentServiceImpl(options);
}

export { ContentServiceError } from './types';
export type * from './types';
