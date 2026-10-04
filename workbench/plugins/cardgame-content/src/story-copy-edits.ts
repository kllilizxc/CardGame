type CopyField = 'description' | 'summary' | 'detail' | 'label' | 'statusText';

export interface StoryCopyEdit {
  path: string;
  expectedRevision: string;
  edits: Array<{ targetId: string; field: CopyField; value: string }>;
}

const hubPath = /^public\/data\/hub\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/u;
const worldMapPath = 'public/data/world/world-map.json';
const idPattern = /^[A-Za-z][A-Za-z0-9._-]{1,127}$/u;
const revisionPattern = /^[0-9a-f]{64}$/u;
const fields = {
  root: new Set<CopyField>(['description']),
  location: new Set<CopyField>(['summary', 'detail']),
  action: new Set<CopyField>(['label', 'description', 'statusText']),
  destination: new Set<CopyField>(['label', 'description', 'statusText']),
};
type Target = { value: Record<string, unknown>; kind: keyof typeof fields };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function validStoryCopyPath(path: string): boolean {
  return (hubPath.test(path) || path === worldMapPath) && !path.split('/').some(part => part === '.' || part === '..');
}

export function validateStoryCopyEdits(copyEdits: StoryCopyEdit[] | undefined): void {
  if (copyEdits === undefined) return;
  if (!Array.isArray(copyEdits) || copyEdits.length < 1 || copyEdits.length > 8) throw Error('剧情文案候选每批需包含 1–8 份已有地图或据点文件');
  const paths = new Set<string>();
  for (const edit of copyEdits) {
    if (!record(edit) || typeof edit.path !== 'string' || !validStoryCopyPath(edit.path) || paths.has(edit.path)
      || typeof edit.expectedRevision !== 'string' || !revisionPattern.test(edit.expectedRevision)
      || !Array.isArray(edit.edits) || edit.edits.length < 1 || edit.edits.length > 32) throw Error(`剧情文案目标或源版本无效：${edit?.path}`);
    paths.add(edit.path);
    const changedFields = new Set<string>();
    for (const change of edit.edits) {
      if (!record(change) || typeof change.targetId !== 'string' || !idPattern.test(change.targetId)
        || typeof change.field !== 'string' || !['description', 'summary', 'detail', 'label', 'statusText'].includes(change.field)
        || typeof change.value !== 'string' || !change.value.trim() || change.value.length > 600
        || /[\u0000-\u001f\u007f]/u.test(change.value) || changedFields.has(`${change.targetId}:${change.field}`)) {
        throw Error(`剧情文案修改无效：${edit.path}`);
      }
      changedFields.add(`${change.targetId}:${change.field}`);
    }
  }
}

/** Mutates only existing player-facing copy fields, keeping routing and IDs byte-for-byte equivalent as values. */
export function applyStoryCopyEdits(path: string, content: string, edits: StoryCopyEdit['edits']): string {
  if (!validStoryCopyPath(path)) throw Error(`剧情文案路径无效：${path}`);
  const document: unknown = JSON.parse(content);
  if (!record(document)) throw Error(`剧情文案文件格式无效：${path}`);
  const targets = new Map<string, Target>();
  const add = (id: unknown, value: unknown, kind: Target['kind']) => {
    if (typeof id !== 'string' || !record(value) || targets.has(id)) throw Error(`剧情文案对象 ID 无效或重复：${path}/${id}`);
    targets.set(id, { value, kind });
  };
  if (path === worldMapPath) {
    add(document.id, document, 'root');
    if (!Array.isArray(document.destinations)) throw Error(`世界地图目的地无效：${path}`);
    for (const destination of document.destinations) add(record(destination) ? destination.id : undefined, destination, 'destination');
  } else {
    add(document.hubId, document, 'root');
    if (!Array.isArray(document.locations)) throw Error(`据点地点无效：${path}`);
    for (const location of document.locations) {
      add(record(location) ? location.id : undefined, location, 'location');
      if (!record(location) || !Array.isArray(location.actions)) throw Error(`据点行动无效：${path}`);
      for (const action of location.actions) add(record(action) ? action.id : undefined, action, 'action');
    }
  }
  for (const edit of edits) {
    const target = targets.get(edit.targetId);
    if (!target || !fields[target.kind].has(edit.field) || typeof target.value[edit.field] !== 'string') {
      throw Error(`剧情文案字段不存在或不可修改：${path}/${edit.targetId}/${edit.field}`);
    }
    const value = edit.value.trim();
    if (target.value[edit.field] === value) throw Error(`剧情文案没有变化：${path}/${edit.targetId}/${edit.field}`);
    target.value[edit.field] = value;
  }
  return JSON.stringify(document, null, 2) + '\n';
}
