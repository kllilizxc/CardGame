import { describe, test, expect } from 'bun:test';
import { publishedDecks, normalizeDeckTrial } from './publishedDecks';
describe('shipped deck trial selection',()=>{
 test('keeps independent and original decks with exact copy counts',()=>{
  const old={name:'Original',cards:Array.from({length:26},(_,i)=>({id:`old-${i}`,count:1}))};
  const next={name:'New',cards:Array.from({length:8},(_,i)=>({id:`new-${i}`,count:3}))};
  const choices=publishedDecks({'../../../public/data/decks/worka-new.json':next,'../../../public/data/decks/starter-deck.json':old});
  expect(choices.map(d=>[d.name,d.total])).toEqual([['Original',26],['New',24]]);
  expect(normalizeDeckTrial({mode:'deck-trial',deckId:choices[1].id,deckFile:choices[1].file})?.deckFile).toBe('data/decks/worka-new.json');
  expect(old.cards).toHaveLength(26);
 });
 test('rejects duplicate entries, illegal sizes, limits and unsafe paths',()=>{
  const cards=[{id:'a',count:3},{id:'a',count:3}];
  expect(publishedDecks({'public/data/decks/duplicate.json':{cards},'public/data/decks/small.json':{cards:[{id:'a',count:1}]},'public/data/decks/too-many.json':{cards:[{id:'a',count:24}]}})).toEqual([]);
  expect(normalizeDeckTrial({mode:'deck-trial',deckId:'secret',deckFile:'data/decks/../secret.json'})).toBeNull();
  expect(normalizeDeckTrial({mode:'deck-trial',deckId:'wrong',deckFile:'data/decks/starter-deck.json'})).toBeNull();
  expect(normalizeDeckTrial({mode:'story',deckId:'starter-deck',deckFile:'data/decks/starter-deck.json'})).toBeNull();
 });
});
