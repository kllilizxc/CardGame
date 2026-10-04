import { expect, test } from 'bun:test';
import { cardgameSkillRelations } from '../plugins/cardgame-content/connections';
import { cardgameEventNames } from '../plugins/cardgame-content/src/skill-recipes';

const notes = { knowledge:'kb', cards:'cards', assets:'assets', production:'production', todo:'todo', execution:'execution', preview:'preview' };
test('CardGame keeps seven grouped Skill relations with the expected members', () => {
  const relations = cardgameSkillRelations({ ...notes, tracker: 'tracker' });
  expect(relations).toHaveLength(7);
  expect(new Set(relations.map(relation => relation.kind)).size).toBe(7);
  expect(relations.find(relation => relation.kind === 'todo-desk')?.nodeIds).toEqual(['todo', 'execution']);
  expect(relations.find(relation => relation.kind === 'production-assets')?.nodeIds).toEqual(['production', 'assets']);
  expect(relations.find(relation => relation.kind === 'desk-references')?.nodeIds).toEqual(['execution', 'kb', 'cards', 'assets', 'tracker']);
  expect(relations.every(relation => relation.goal.trim() && new Set(relation.nodeIds).size === relation.nodeIds.length)).toBe(true);
});

test('only active workflows subscribe to events; reference relations are read on demand', () => {
  expect(cardgameEventNames['production-assets']).toEqual([
    'cardgame.production.candidatesRequested', 'cardgame.production.adoptionRequested',
  ]);
  expect(cardgameEventNames['todo-production']).toEqual(['cardgame.todo.productionRequested']);
  expect(cardgameEventNames['desk-references']).toEqual([]);
  expect(cardgameEventNames['production-references']).toEqual([]);
});

test('fresh CardGame recipes select only reviewed names with the observed code version', async () => {
  const { selectCardgameGrants } = await import('../plugins/cardgame-content/src/skill-recipes');
  const { describeCapabilities } = await import('@dsh-workbench/runtime');
  const sources = {
    kb: await import('../templates/cardgame-library/actions'),
    cards: await import('../templates/cardgame-library/actions'),
    assets: await import('../templates/cardgame-library/actions'),
    production: await import('../templates/cardgame-production/actions'),
    todo: await import('../templates/cardgame-todo/actions'),
    execution: await import('../templates/execution-note/actions'),
    preview: await import('../templates/candidate-preview/actions'),
    tracker: await import('../templates/feature-progress/actions'),
  };
  const allNotes = {...notes, tracker: 'tracker'};
  for (const spec of cardgameSkillRelations(allNotes)) {
    const relation: import('../src/skill-connection-model').SkillConnectionView = {schemaVersion: 2, id: spec.kind, name: spec.name, goal: spec.goal,
      constraints: [], grants: [], enabled: false, archived: false, createdAt: 1, updatedAt: 1, revision: 'r1', nodeIds: spec.nodeIds, nodes: spec.nodeIds.map(noteId => {
      const published = describeCapabilities(sources[noteId as keyof typeof sources]);
      return {noteId, name: noteId, codeVersion: `${noteId}-v1`, available: {queries: [], actions: [], events: []},
        missing: {queries: [], actions: [], events: []}, ungranted: {
          queries: published.queries.filter(item => item.visibility !== 'private').map(item => item.name),
          actions: published.actions.filter(item => item.visibility !== 'private').map(item => item.name),
          events: published.events.filter(item => item.visibility !== 'private').map(item => item.name),
        }};
    })};
    const before = structuredClone(relation);
    const grants = selectCardgameGrants(spec.kind, relation, allNotes);
    expect(relation).toEqual(before);
    expect(grants.map(grant => grant.noteId).sort()).toEqual([...spec.nodeIds].sort());
    expect(grants.every(grant => grant.codeVersion === `${grant.noteId}-v1`)).toBe(true);
    expect(grants.flatMap(grant => grant.events).sort()).toEqual([...cardgameEventNames[spec.kind]].sort());
    if (spec.kind.endsWith('references')) expect(grants.every(grant => !grant.actions.length && !grant.events.length)).toBe(true);
    if (spec.kind === 'production-assets') expect(grants.find(grant => grant.noteId === 'assets')).toEqual({
      noteId: 'assets', codeVersion: 'assets-v1', queries: [], actions: ['registerCandidates', 'adoptVersion'], events: [],
    });
    if (spec.kind === 'todo-desk') expect(grants.find(grant => grant.noteId === 'todo')!.actions).toEqual(['bindExecution', 'feedback']);
    if (spec.kind === 'desk-references') expect(grants.find(grant => grant.noteId === 'kb')!.queries).toEqual(['document']);
  }
});
