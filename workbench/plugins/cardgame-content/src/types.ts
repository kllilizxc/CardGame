/**
 * Public contract for the CardGame content backend.
 *
 * The backend deliberately returns plain JSON-shaped values.  This keeps the
 * contract usable from a native host, an iframe client, and Bun based tests
 * without leaking the SQLite implementation into the UI.
 */

export interface ContentProject {
  id: string;
  root: string;
  title?: string;
}

export interface ContentServiceOptions {
  /** Worka owned data directory.  The service creates its SQLite cache here. */
  dataRoot: string;
  projects: ContentProject[];
  /** Primarily useful for tests; defaults to `${dataRoot}/content.sqlite`. */
  dbPath?: string;
  /** Maximum number of bytes included inline by the media query. */
  inlineMediaLimit?: number;
}

export type ContentQueryOp =
  | 'status'
  | 'documents'
  | 'directories'
  | 'document'
  | 'documentMeta'
  | 'backlinks'
  | 'graph'
  | 'movePreview'
  | 'cards'
  | 'card'
  | 'assets'
  | 'asset'
  | 'versions'
  | 'inspection'
  | 'recentChanges'
  | 'storyBuilds'
  | 'storyScenePage'
  | 'media';

export interface ContentQueryBase {
  projectId: string;
  op: ContentQueryOp;
}

export interface ContentListQuery extends ContentQueryBase {
  op:
    | 'documents'
    | 'directories'
    | 'backlinks'
    | 'cards'
    | 'assets'
    | 'versions';
  q?: string;
  directory?: string;
  kind?: string;
  /** Asset format, with or without a leading dot (for example `png`). */
  format?: string;
  mimeType?: string;
  minWidth?: number;
  maxWidth?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  /** Asset state (`ready` for indexed project assets or `candidate`). */
  status?: string;
  /** Card rarity and labels/tags filters. */
  rarity?: string;
  tags?: string | string[];
  labels?: string | string[];
  cursor?: string;
  limit?: number;
  id?: string;
  path?: string;
  assetId?: string;
}

export interface ContentDetailQuery extends ContentQueryBase {
  op: 'document' | 'documentMeta' | 'card' | 'asset';
  id?: string;
  path?: string;
  assetId?: string;
  /** Refresh only this trusted card collection before binding a formal source revision. */
  freshKind?: string;
}

export interface GraphQuery extends ContentQueryBase {
  op: 'graph';
  id?: string;
  path?: string;
  depth?: number;
  maxNodes?: number;
}

export interface MovePreviewQuery extends ContentQueryBase {
  op: 'movePreview';
  id?: string;
  path?: string;
  toPath: string;
}

export interface MediaQuery extends ContentQueryBase {
  op: 'media';
  id?: string;
  path?: string;
  versionId?: string;
  variant?: 'thumbnail' | 'original' | 'waveform';
  from?: string;
}

export type InspectionKind =
  | 'broken-link'
  | 'scene-dead-end'
  | 'orphan-asset'
  | 'card-missing-art'
  | 'asset-missing-metadata';

export interface InspectionQuery extends ContentQueryBase {
  op: 'inspection';
  kinds?: InspectionKind[];
  cursor?: string;
  limit?: number;
}

export interface InspectionFinding {
  kind: InspectionKind;
  severity: 'info' | 'warning' | 'high';
  ref: { type: 'document' | 'card' | 'asset'; id?: string; path?: string };
  detail: string;
}

export interface InspectionResult {
  findings: InspectionFinding[];
  counts: Partial<Record<InspectionKind, number>>;
  nextCursor?: string;
}

export interface RecentChangesQuery extends ContentQueryBase {
  op: 'recentChanges';
  /** ISO timestamp; only changes after this instant are returned. */
  since?: string;
  cursor?: string;
  limit?: number;
}

export interface RecentChangeItem {
  kind: 'document' | 'card' | 'asset' | 'version';
  id?: string;
  path?: string;
  name?: string;
  change: 'created' | 'updated';
  at: string;
}

export interface StoryBuildsQuery extends ContentQueryBase {
  op: 'storyBuilds';
  cursor?: string;
  limit?: number;
}

export interface StoryScenePageQuery extends ContentQueryBase {
  op: 'storyScenePage';
  id?: string;
  path?: string;
  /** Zero-based dialogue position in this one scene. */
  offset?: number;
  /** 1–50 lines. */
  limit?: number;
  /** Keeps consecutive pages on the same source revision. */
  expectedRevision?: string;
}

export interface StoryScenePage {
  id: string;
  path: string;
  revision: string;
  nodeId: string;
  title: string;
  chapter: string;
  summary: string;
  dialogueCount: number;
  offset: number;
  nextOffset?: number;
  items: Array<{ id: string; speakerId: string; speakerName: string; text: string; emotion?: string; line: number }>;
  diagnostics: StoryDiagnostic[];
}

export interface StoryDiagnostic {
  severity: 'error' | 'warning';
  /** Project-relative source document the diagnostic points at. */
  path: string;
  line?: number;
  detail: string;
}

export interface StoryBuildItem {
  storyId: string;
  entryPath: string;
  outputPath: string;
  sourcePaths: string[];
  errorCount: number;
  warningCount: number;
  nodeCount: number;
  choiceCount: number;
  builtAt: string;
}

export interface CompileStoryInput {
  projectId: string;
  /** Project-relative path of the entry scene document. */
  entry: string;
  /** Overrides the derived `story.<entry-path>` identifier. */
  storyId?: string;
  /** Compiles and validates without touching the project or the build log. */
  dryRun?: boolean;
}

export interface CompileStoryResult {
  storyId: string;
  outputPath: string;
  catalogUpdated: boolean;
  nodeCount: number;
  choiceCount: number;
  diagnostics: StoryDiagnostic[];
}

export type ContentQuery =
  | (ContentQueryBase & { op: 'status' })
  | ContentListQuery
  | ContentDetailQuery
  | GraphQuery
  | MovePreviewQuery
  | InspectionQuery
  | RecentChangesQuery
  | StoryBuildsQuery
  | StoryScenePageQuery
  | MediaQuery;

export interface Page<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export interface ContentStatus {
  projectId: string;
  phase: 'pending' | 'indexing' | 'ready' | 'error' | 'closed';
  indexedAt?: string;
  documents: number;
  directories: number;
  cards: number;
  assets: number;
  errors: string[];
}

export interface ContentListItem {
  id: string;
  title: string;
  path: string;
  revision: string;
  type: string;
  [key: string]: unknown;
}

export interface DocumentLink {
  targetPath: string;
  targetKind: 'document' | 'asset' | 'unknown' | 'external';
  targetId?: string;
  anchor?: string;
  label?: string;
  line: number;
  rawTarget: string;
}

export interface ContentDocument extends ContentListItem {
  type: 'document';
  /** Omitted from list rows; populated by the document detail query. */
  content?: string;
  links: DocumentLink[];
  size: number;
  updatedAt?: string;
  snippet?: string;
}

export interface ContentDocumentMeta {
  id: string;
  path: string;
  title: string;
  revision: string;
  size: number;
  isScene: boolean;
}

export interface BacklinkItem extends ContentListItem {
  type: 'backlink';
  sourceId: string;
  sourcePath: string;
  targetPath: string;
  line: number;
  label?: string;
  anchor?: string;
  snippet?: string;
}

export interface GraphNode extends ContentListItem {
  type: 'document' | 'asset';
  depth: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId?: string;
  sourcePath: string;
  targetPath: string;
  kind: 'document' | 'asset' | 'unknown' | 'external';
  anchor?: string;
}

export interface ContentGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface MoveAffectedDocument {
  id: string;
  path: string;
  revision: string;
  changed: boolean;
  changedLinks: number;
}

export interface MovePreview {
  source: ContentDocument;
  toPath: string;
  affected: MoveAffectedDocument[];
  conflicts: string[];
  canApply: boolean;
}

export interface CardItem extends ContentListItem {
  type: 'card';
  kind: string;
  name: string;
  description?: string;
  rarity?: string;
  labels?: string[];
  /** Small list projection; the full card definition remains detail-only. */
  facePreview?: string;
  /** Omitted from card list rows; populated by the card detail query. */
  json?: Record<string, unknown>;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  path: string;
  revision: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  source: 'project' | 'candidate' | 'adopted';
  candidateId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  adopted: boolean;
}

export interface AssetItem extends ContentListItem {
  type: 'asset';
  name?: string;
  tags?: string[];
  metadataRevision?: string;
  format?: string;
  status?: 'ready' | 'candidate' | string;
  kind: 'image' | 'audio' | 'spritesheet' | 'other';
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  currentVersionId?: string;
  metadata?: Record<string, unknown>;
  versions?: AssetVersion[];
}

export interface MediaResponse {
  id: string;
  path: string;
  versionId?: string;
  variant: 'thumbnail' | 'original' | 'waveform';
  mimeType: string;
  size: number;
  revision: string;
  width?: number;
  height?: number;
  durationMs?: number;
  frameCount?: number;
  metadata?: Record<string, unknown>;
  /** The host can turn this bounded path into a capability URL. */
  absolutePath: string;
  /** Present only for small media and only when explicitly requested. */
  data?: string;
}

export interface SaveDocumentInput {
  projectId: string;
  id?: string;
  path?: string;
  content: string;
  expectedRevision?: string;
  title?: string;
}

export interface MoveDocumentInput {
  projectId: string;
  id?: string;
  path?: string;
  toPath: string;
  expectedRevision?: string;
  /** Expected revisions for link-bearing documents shown by movePreview. */
  expectedRevisions?: Record<string, string>;
  updateLinks?: boolean;
}

export interface UpdateCardInput {
  projectId: string;
  id: string;
  card?: Record<string, unknown>;
  patch?: Record<string, unknown>;
  expectedRevision?: string;
}

export interface CandidateInput {
  id?: string;
  name?: string;
  fileName?: string;
  mimeType?: string;
  data?: string;
  base64?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterCandidatesInput {
  projectId: string;
  candidates: CandidateInput[];
  /**
   * When set, each registered candidate is machine-checked immediately and
   * adopted through the regular adoptVersion path when the check passes.
   * Failed candidates stay candidates and carry the report in their metadata.
   */
  autoAdopt?: AutoAdoptOptions;
}

export interface AutoAdoptOptions {
  /** Target asset path; normalized under public/assets/ like adoptVersion. */
  path?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
}

export interface CandidateInspection {
  passed: boolean;
  reasons: string[];
}

export interface AdoptVersionInput {
  projectId: string;
  candidateId?: string;
  versionId?: string;
  assetId?: string;
  path?: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAssetInput {
  projectId: string;
  id: string;
  name?: string;
  tags?: string[];
  expectedMetadataRevision?: string;
}

export type ContentCommandMethod =
  | 'saveDocument'
  | 'moveDocument'
  | 'updateCard'
  | 'savePipelineCard'
  | 'updateAsset'
  | 'registerCandidates'
  | 'adoptVersion'
  | 'compileStory';

export interface ContentInvalidation {
  projectId?: string;
  paths?: string[];
  kinds?: Array<'document' | 'card' | 'asset' | 'directory' | 'status'>;
  reason: 'index' | 'save' | 'move' | 'card' | 'candidate' | 'adopt';
}

export type ContentInvalidationListener = (event: ContentInvalidation) => void;

export interface ContentService {
  query(input: ContentQuery): Promise<unknown>;
  command(method: ContentCommandMethod, input: unknown): Promise<unknown>;
  subscribe(listener: ContentInvalidationListener): () => void;
  resolveMedia(input: MediaQuery): Promise<MediaResponse>;
  close(): Promise<void>;
}

export class ContentServiceError extends Error {
  readonly code:
    | 'CONTENT_CONFLICT'
    | 'PATH_ESCAPE'
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'SERVICE_CLOSED';
  readonly details?: unknown;

  constructor(
    code: ContentServiceError['code'],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ContentServiceError';
    this.code = code;
    this.details = details;
  }
}
