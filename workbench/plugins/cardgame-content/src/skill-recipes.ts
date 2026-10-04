import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SkillConnectionSelection, SkillConnectionView } from '../../../src/skill-connection-model';
import type { SkillConnectionSources } from '../../../src/skill-connection-source';
import type { CardgameNotes, CardgameSkillKind } from '../connections';
import { seedDeskPreviewSkill, selectDeskPreviewGrants } from '../../skill-connections/recipes';

const sourceRoot = resolve(import.meta.dirname, '../../../templates/skill-connections');

/** The imported legacy keys make the role unambiguous without trusting a display name. */
export function cardgameSkillKind(oldIds: readonly string[]): CardgameSkillKind {
  const has = (suffix: string) => oldIds.some(id => id.endsWith(`/${suffix}`));
  if (has('todoResult')) return 'todo-desk';
  if (has('preview')) return 'desk-preview';
  if (has('productionResult')) return 'production-desk';
  if (has('assetCandidates')) return 'production-assets';
  if (has('productionRequest')) return 'todo-production';
  if (has('cards') && has('tracker')) return 'desk-references';
  if (has('references')) return 'production-references';
  throw new Error(`CardGame 旧关系没有已核对的 Skill 方法：${oldIds.join('、')}`);
}

export const cardgameEventNames: Record<CardgameSkillKind, string[]> = {
  'todo-desk': ['cardgame.todo.delegationRequested', 'tasks.changed'],
  'desk-preview': ['tasks.candidateReady', 'tasks.previewControlRequested', 'tasks.previewTitleChanged', 'tasks.changed', 'candidates.feedbackReported'],
  'production-desk': ['cardgame.production.generationRequested', 'tasks.changed'],
  'production-assets': ['cardgame.production.candidatesRequested', 'cardgame.production.adoptionRequested'],
  'todo-production': ['cardgame.todo.productionRequested'],
  'desk-references': [],
  'production-references': [],
};

/** Installation selects reviewed names by known role IDs; legacy conversion keeps its existing grants. */
export function selectCardgameGrants(kind: CardgameSkillKind, relation: SkillConnectionView, notes: Partial<CardgameNotes>): SkillConnectionSelection[] {
  const select = (noteId: string | undefined, queries: string[], actions: string[] = [], events: string[] = []): SkillConnectionSelection => {
    const node = relation.nodes.find(node => node.noteId === noteId);
    if (!node || node.unavailable) throw new Error(`CardGame 连线缺少可用节点：${noteId}`);
    for (const [kind, names] of Object.entries({queries, actions, events}) as Array<['queries' | 'actions' | 'events', string[]]>)
      if (names.some(name => !node.available[kind].some(item => item.name === name) && !node.ungranted[kind].includes(name)))
        throw new Error(`CardGame 节点 ${noteId} 缺少所选公开能力 ${kind}`);
    return {noteId: node.noteId, codeVersion: node.codeVersion, queries: [...queries], actions: [...actions], events: [...events]};
  };
  switch (kind) {
    case 'todo-desk': return [
      select(notes.todo, ['todo'], ['bindExecution', 'feedback'], ['cardgame.todo.delegationRequested']),
      select(notes.execution, ['task', 'progress'], ['acceptRequirement'], ['tasks.changed']),
    ];
    case 'desk-preview': return selectDeskPreviewGrants(relation);
    case 'production-desk': return [
      select(notes.production, ['production'], ['bindExecution', 'receiveResult'], ['cardgame.production.generationRequested']),
      select(notes.execution, ['task'], ['acceptRequirement'], ['tasks.changed']),
    ];
    case 'production-assets': return [
      select(notes.production, ['production'], ['recordCandidates', 'recordAdoption'], cardgameEventNames[kind]),
      select(notes.assets, [], ['registerCandidates', 'adoptVersion']),
    ];
    case 'todo-production': return [
      select(notes.todo, ['todo'], [], ['cardgame.todo.productionRequested']),
      select(notes.production, [], ['upsertRequest', 'bindTodo']),
    ];
    case 'desk-references': return [
      select(notes.execution, ['task']), select(notes.knowledge, ['document']), select(notes.cards, ['card']),
      select(notes.assets, ['assets', 'asset', 'versions']),
      ...(notes.tracker ? [select(notes.tracker, ['summary', 'getFeature'])] : []),
    ];
    case 'production-references': return [
      select(notes.production, ['production']), select(notes.knowledge, ['document']), select(notes.assets, ['assets', 'asset', 'versions']),
    ];
  }
}

/** Copy a reviewed recipe and generate event identities for the current note IDs. */
export async function seedCardgameSkill(kind: CardgameSkillKind, relation: SkillConnectionView, sources: SkillConnectionSources, root = sourceRoot) {
  if (kind === 'desk-preview') {
    const draft = await seedDeskPreviewSkill(relation, sources, root);
    const skill = resolve(draft, 'SKILL.md');
    await writeFile(skill, (await readFile(skill, 'utf8')) + `\n## CardGame 试玩约定\n\n每次首次交付或继续修改可运行候选后，在最终 checkpoint 前核对本次实际预览。先从项目知识库索引读取权威启动脚本、验收方法和默认预览端清单；本机历史配置或只改了某一端，都不能自行缩小项目约定的范围。只有用户明确要求时才缩小，并记录该要求。回执保留原任务 ID、candidateKey、修订和 runId；失败、重启试玩均不授权自动启动模型，修复必须由用户在原任务明确发起。\n`);
    return draft;
  }
  const directory = resolve(root, `cardgame-${kind}`);
  const draft = await sources.createDraft(relation.id);
  const previous = await readFile(resolve(draft, 'SKILL.md'), 'utf8');
  if (!/^---\nname: worka-connection-/.test(previous) && !previous.startsWith(`---\nname: worka-cardgame-${kind}\n`))
    throw new Error(`连线 ${relation.id} 已有作者草稿，不能覆盖`);
  await writeFile(resolve(draft, 'SKILL.md'), await readFile(resolve(directory, 'SKILL.md')));
  const scripts = await readdir(resolve(directory, 'scripts')).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  if (scripts.length) await mkdir(resolve(draft, 'scripts'), { recursive: true });
  for (const name of scripts.filter(name => name.endsWith('.ts')))
    await writeFile(resolve(draft, 'scripts', name), await readFile(resolve(directory, 'scripts', name)));
  for (const name of cardgameEventNames[kind]) {
    const node = relation.nodes.find(node => node.available.events.some(event => event.name === name));
    if (!node) throw new Error(`关系 ${relation.id} 缺少事件 ${name}`);
    const script = name === 'tasks.changed' ? kind === 'todo-desk' ? 'progress' : 'result'
      : name.endsWith('delegationRequested') ? 'delegate'
      : name.endsWith('productionRequested') ? 'create'
      : name.endsWith('generationRequested') ? 'generate'
      : name.endsWith('candidatesRequested') ? 'candidates' : 'adopt';
    const sample = { schemaVersion: 1, event: { id: `sample-${script}`, noteId: node.noteId, name, payload: {} },
      responses: [], expectedOutcome: 'agent' };
    await writeFile(resolve(draft, 'scripts', `${script}.case.json`), JSON.stringify(sample, null, 2) + '\n');
  }
  return draft;
}
