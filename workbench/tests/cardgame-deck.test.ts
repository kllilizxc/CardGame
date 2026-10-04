import { asRecordStorage, type LegacyKvUnitLike as KvUnitLike } from './fixtures/record-storage';
import { expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentService } from '../plugins/cardgame-content/src/content';
import { createWorkflowService } from '../plugins/cardgame-content/src/workflow';
import { createGameCandidateService } from '../plugins/cardgame-content/src/game-candidates';
import { createGameAdoptionService } from '../plugins/cardgame-content/src/game-adoption';
import { createCardPipeline } from '../plugins/cardgame-content/src/card-pipeline';
import { assertDeckWriteAccess, inspectDeck, normalizeDeckPlan } from '../plugins/cardgame-content/src/deck-plan';
import { requiredGamePreviewChecks, candidatePreviewOptions } from '../plugins/cardgame-content/src/registration';
import { CoreStore } from '../src/core/store';
import { ConversationReferences } from '../src/application/conversation-references';
import { ReferenceSubmissionService } from '../src/application/reference-submission';
import type { CommentContextV1 } from '../src/comment-contract';


const unit=(id:string)=>({id,name:`Fixture ${id}`,description:'Isolated deck fixture',kind:'unit',rarity:'common',realmId:'qi1',race:'兽族',labels:['龙族'],attack:4,health:3,linggen:['木'],gongfaIds:[]});
const drafts=()=>Array.from({length:12},(_,i)=>({definition:unit(`D_${i}`)}));
const plan=()=>normalizeDeckPlan({id:'dragon-fixture',title:'Original dragon fixture',targetSize:24,entries:drafts().map(card=>({cardId:card.definition.id,count:2}))},'Original 24-card dragon deck');
test('deck counts distinguish twelve definitions and twenty-four copies, with real limits and target checks',()=>{
 const cards=drafts(),deck=plan();const report=inspectDeck(cards,deck,deck.basisBrief);
 expect([report.distinctCards,report.totalCopies,report.legal,report.confirmed]).toEqual([12,24,true,false]);
 expect(report.checkScope).toContain('不代表实战');
 expect(()=>normalizeDeckPlan({...deck,entries:[deck.entries[0],deck.entries[0]]},deck.basisBrief)).toThrow('唯一');
 expect(()=>normalizeDeckPlan({...deck,id:'../escape'},deck.basisBrief)).toThrow('安全');
 expect(()=>normalizeDeckPlan({...deck,entries:[{cardId:'D_0',count:1.5}]},deck.basisBrief)).toThrow('1–3');
 expect(inspectDeck(cards,{...deck,targetSize:25},deck.basisBrief).errors).toContain('当前 24 张，目标 25 张');
 (cards[0]!.definition as any).limitPerDeck=1;expect(inspectDeck(cards,deck,deck.basisBrief).legal).toBe(false);
});
test('confirmation cannot be forged by agent or generic batch writes; art changes do not invalidate a logic deck',()=>{
 expect(()=>assertDeckWriteAccess('confirmDeckDraft',{},'agent')).toThrow('用户');
 expect(()=>assertDeckWriteAccess('confirmDeckDraft',{},'user')).not.toThrow();
 expect(()=>assertDeckWriteAccess('updateProduction',{patch:{batch:{kind:'card-generation'}}},'agent')).toThrow('专用');
 expect(()=>assertDeckWriteAccess('upsertProduction',{batch:{kind:'card-generation'}},'user')).toThrow('专用');
 expect(()=>assertDeckWriteAccess('updateProduction',{patch:{brief:'New brief'}},'agent')).not.toThrow();
 const cards=drafts(),deck=plan();const fingerprint=inspectDeck(cards,deck,deck.basisBrief).fingerprint;
 (cards[0] as any).art={id:'fixture-art'};expect(inspectDeck(cards,deck,deck.basisBrief).fingerprint).toBe(fingerprint);
 expect(normalizeDeckPlan({...deck,approvedFingerprint:fingerprint},deck.basisBrief).approvedFingerprint).toBeUndefined();
});
test('combination target gaps are explicit warnings, never a balance verdict',()=>{
 const cards=drafts();(cards[0]!.definition as any).effects=[{target:{scope:'singleAlly',requiredLabelsAllOf:['missing-label']}}];
 const report=inspectDeck(cards,plan(),plan().basisBrief);expect(report.warnings).toHaveLength(1);expect(report.legal).toBe(true);
});

async function fixture(copy?: { brief: string; cards: Record<string, any>[]; deck: any }){
 const directory=await mkdtemp(join(tmpdir(),'worka-deck-'));const root=join(directory,'game'),dataRoot=join(directory,'worka');
 const originals=Array.from({length:13},(_,i)=>unit(`O_${i}`));
 await mkdir(join(root,'public/data/cards'),{recursive:true});await mkdir(join(root,'public/data/decks'),{recursive:true});
 await mkdir(join(root,'src'),{recursive:true});await writeFile(join(root,'src/main.ts'),'export const fixture = true;\n');
 await writeFile(join(root,'public/data/cards/units.json'),JSON.stringify({units:originals}));
 await writeFile(join(root,'public/data/decks/starter-deck.json'),JSON.stringify({id:'original',cards:originals.map(card=>({id:card.id,count:2}))}));
 const git=promisify(execFile);await git('git',['init','-q',root]);await git('git',['-C',root,'add','-A']);await git('git',['-C',root,'-c','user.name=Test','-c','user.email=test@local.invalid','commit','-qm','fixture']);
 const options={dataRoot,projects:[{id:'p',root}]};const content=createContentService(options),workflow=createWorkflowService(options);
 const previews:any[]=[];const candidates=createGameCandidateService({...options,content,workflow,registerPreview:async item=>{previews.push(item);}});
 const pipeline=createCardPipeline(content,workflow,{},candidates);
 const fixturePlan=copy?.deck??plan();
 const made=await pipeline.command('createCardBatch',{projectId:'p',brief:copy?.brief??plan().basisBrief,featureId:'dragon-feature',deckPlan:{...fixturePlan,entries:[]}});
 const productionId=made.production.id;
 const get=()=>pipeline.query({projectId:'p',productionId,op:'cardBatch'});
 const run=async(operation:string,extra:any={})=>pipeline.command(operation,{projectId:'p',productionId,baseRevision:(await get()).production.revision,...extra});
 await run('setCardDrafts',{cards:copy?.cards??drafts().map(card=>card.definition),deckPlan:fixturePlan,_draftOrigin:copy?'unknown':'agent'});
 const adoption=createGameAdoptionService({...options,workflow,previewEvidence:async()=>{}});
 const confirm=async(candidate:any)=>adoption.confirm({projectId:'p',productionId,candidateId:candidate.id,featureId:candidate.featureId,candidateHash:candidate.candidateHash,targetBaseRevision:candidate.targetBaseRevision,validationManifest:candidate.validationManifest});
 const close=async()=>{await pipeline.close();await candidates.close();await adoption.close();await Promise.all([content.close(),workflow.close()]);await rm(directory,{recursive:true,force:true});};
 return{root,content,workflow,pipeline,previews,productionId,get,run,adoption,confirm,close};
}
test('whole-deck candidate stages all twenty-four copies, preserves original twenty-six bytes, and reuses exact retries',async()=>{
 const f=await fixture();try{
  const original=await readFile(join(f.root,'public/data/decks/starter-deck.json'));
  await expect(f.run('stageDeckCandidate')).rejects.toThrow('确认');
  await f.run('confirmDeckDraft');const staged=await f.run('stageDeckCandidate'),candidate=staged.candidate;
  expect(candidate.kind).toBe('deck');expect(candidate.deckCardIds).toHaveLength(12);expect(candidate.placeholderCardIds).toHaveLength(12);
  expect(candidate.changedPaths).not.toContain('public/data/decks/starter-deck.json');
  const separate=JSON.parse(await readFile(join(candidate.repo,candidate.deckPath),'utf8'));
  expect(separate.cards.reduce((sum:number,item:any)=>sum+item.count,0)).toBe(24);
  expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(original);
  expect((await f.run('stageDeckCandidate')).candidate.id).toBe(candidate.id);expect(f.previews).toHaveLength(2);
  expect(requiredGamePreviewChecks(candidate)).toEqual(['game-shell','content-catalog','deck-definition','deck-composition']);
  expect(candidatePreviewOptions(candidate)).toMatchObject({candidateKind:'deck',deckPath:candidate.deckPath});
  const list:any=await f.workflow.query({projectId:'p',op:'productions'});expect(list.items[0].deckProgress).toMatchObject({distinctCards:12,totalCopies:24,targetSize:24});
 }finally{await f.close();}
},20_000);
test('one-card revision keeps other cards, names the stale dependency and requires fresh confirmation',async()=>{
 const f=await fixture();try{
  await f.run('confirmDeckDraft');const staged=await f.run('stageDeckCandidate');const before=await f.get();
  await f.run('saveCardDraft',{cardId:'D_0',definition:{...before.batch.cards[0].definition,attack:5}});
  const after=await f.get();expect(after.batch.cards[1]).toEqual(before.batch.cards[1]);
  expect(after.deckInspection.changedCardIds).toEqual(['D_0']);expect(after.deckInspection.confirmed).toBe(false);expect(after.deckInspection.staleCandidateId).toBe(staged.candidate.id);
  await expect(f.run('stageDeckCandidate')).rejects.toThrow('确认');
  await f.run('confirmDeckDraft');expect((await f.run('stageDeckCandidate')).candidate.id).not.toBe(staged.candidate.id);
  await f.workflow.command('updateProduction',{projectId:'p',productionId:f.productionId,baseRevision:(await f.get()).production.revision,patch:{brief:'A steadier early game'}});
  expect((await f.get()).deckInspection.basisChanged).toBe(true);
 }finally{await f.close();}
},20_000);
test('explicit deck adoption and undo preserve original default deck and refuse unrelated source conflicts',async()=>{
 const f=await fixture();try{
  const starter=await readFile(join(f.root,'public/data/decks/starter-deck.json'));const units=await readFile(join(f.root,'public/data/cards/units.json'));
  await f.run('confirmDeckDraft');const{candidate}=await f.run('stageDeckCandidate');const adopted=await f.confirm(candidate);
  expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(starter);
  expect(JSON.parse(await readFile(join(f.root,candidate.deckPath),'utf8')).cards).toHaveLength(12);
  await f.adoption.undo({projectId:'p',productionId:f.productionId,candidateId:candidate.id,adoptionId:adopted.adoptionId,featureId:candidate.featureId,candidateHash:candidate.candidateHash,targetBaseRevision:candidate.targetBaseRevision,validationManifest:candidate.validationManifest});
  expect(await readFile(join(f.root,'public/data/cards/units.json'))).toEqual(units);
  expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(starter);
  expect(await readFile(join(f.root,candidate.deckPath)).catch(()=>null)).toBeNull();
  const again=(await f.run('stageDeckCandidate')).candidate;
  const external=JSON.parse(units.toString());external.units[0].attack=8;await writeFile(join(f.root,'public/data/cards/units.json'),JSON.stringify(external));
  await expect(f.confirm(again)).rejects.toThrow('依赖');
  expect(JSON.parse(await readFile(join(f.root,'public/data/cards/units.json'),'utf8')).units[0].attack).toBe(8);
 }finally{await f.close();}
},20_000);


test('isolated reference Add performs no rewrite; one explicit submission carries the selected card (model response stub)', async () => {
 const copied = process.env.WORKA_DECK_TEST_DRAFT ? JSON.parse(await readFile(process.env.WORKA_DECK_TEST_DRAFT, 'utf8')) : undefined;
 const f=await fixture(copied ? { brief: copied.production.brief, cards: copied.batch.cards.map((card: any) => card.definition), deck: copied.batch.deck } : undefined);
 class MemoryUnit implements KvUnitLike {
  tables:Record<string,Record<string,unknown>>={};
  async loadAll(){return{tables:structuredClone(this.tables),global:null};}
  async putRecord(table:string,key:string,value:unknown){(this.tables[table]??={})[key]=structuredClone(value);}
  async deleteRecord(table:string,key:string){delete this.tables[table]?.[key];}
  async close(){}
 }
 const core=await CoreStore.open(asRecordStorage(new MemoryUnit()));
 try {
  await f.run('approveCardDrafts');await f.run('confirmDeckDraft');const candidate=(await f.run('stageDeckCandidate')).candidate;
  const before=await f.get();const target=before.batch.cards[2]!.definition;const originalStarter=await readFile(join(f.root,'public/data/decks/starter-deck.json'));
  const others=JSON.stringify(before.batch.cards.filter((card:any)=>card.definition.id!==target.id));
  await core.writeRecord('desktops','fixture-desk',{id:'fixture-desk',name:'Isolated annotation fixture'},{expectedRevision:null});
  await core.writeRecord('notes','fixture-production',{id:'fixture-production',desktopId:'fixture-desk',name:'Production copy'},{expectedRevision:null});
  const owner={desktopId:'fixture-desk',sessionId:'fixture-note-session'};
  await core.saveSession({id:owner.sessionId,desktopId:owner.desktopId,noteId:'fixture-production',updatedAt:Date.now()});
  const references=new ConversationReferences({core,validateCapture:async()=>{}});
  const sends:Array<{sessionId:string;requestId:string;content:string}>=[];
  const sender=new ReferenceSubmissionService({references,images:{read:async()=>{throw Error('fixture has no screenshot');}},native:{
    receipt:async()=>undefined,admit:async(sessionId,requestId,parts)=>{sends.push({sessionId,requestId,content:JSON.stringify(parts)});return 'fixture-native-receipt';},
  }});
  const context:CommentContextV1={schemaVersion:1,capturedAt:Date.now(),desktopId:'fixture-desk',selection:{kind:'rect',screenRect:{x:20,y:60,width:200,height:80}},
   surfaces:[{surfaceId:'fixture-production:expanded',kind:'note',noteId:'fixture-production',mode:'expanded',viewport:{width:390,height:738},viewVersion:'fixture-build',objectRevision:String(before.production.revision),semantic:{anchorId:`deck-card-${target.id}`,itemId:target.id},text:{exact:`${target.name} · card ${target.id} · attack ${target.attack}`,method:'region-intersection',truncated:false},capture:'partial',missing:['image']}],relatedSessionIds:[],relatedRunIds:[],capture:'partial',missing:['image']};
  const input={referenceId:'isolated-card-reference',body:`Only increase ${target.id} attack by 1; preserve all other cards, copies and materials.`,context,source:{id:'local',label:'我的批注'}};
  await references.add(owner,input);await references.add(owner,input);
  expect(sends).toHaveLength(0);
  expect((await f.get()).batch.cards).toEqual(before.batch.cards);
  const request={owner,requestId:'explicit-main-send',text:'',references:[{referenceId:input.referenceId,revision:1}],delivery:{mode:'queue' as const,attachments:[]}};
  expect((await sender.submit(request)).state).toBe('accepted');
  expect((await sender.submit(request)).state).toBe('accepted');
  expect(sends).toHaveLength(1);
  expect(sends[0]!.sessionId).toBe(owner.sessionId);
  expect(sends[0]!.content).toContain(target.id);
  expect(await references.list(owner)).toEqual([]);
  // Fixed rewrite output through the real business pipeline; no live model call.
  const rewritten={...target,attack:target.attack+1};await f.run('saveCardDraft',{cardId:target.id,definition:rewritten});
  const after=await f.get();
  expect(JSON.stringify(after.batch.cards.filter((card:any)=>card.definition.id!==target.id))).toBe(others);
  expect(after.batch.deck.entries).toEqual(before.batch.deck.entries);
  expect(after.batch.cards.find((card:any)=>card.definition.id===target.id).definition.attack).toBe(target.attack+1);
  expect(after.deckInspection.changedCardIds).toEqual([target.id]);
  expect(after.deckInspection.staleCandidateId).toBe(candidate.id);expect(after.deckInspection.confirmed).toBe(false);
  expect(after.stages[target.id]).toBe('review');
  for(const card of after.batch.cards)if(card.definition.id!==target.id)expect(after.stages[card.definition.id]).toBe(before.stages[card.definition.id]);
  expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(originalStarter);
  if(process.env.WORKA_DECK_TEST_RECEIPT)await writeFile(process.env.WORKA_DECK_TEST_RECEIPT,JSON.stringify({
    input:'Private copy of the unconfirmed draft',model:'Fixed native admission and rewrite response stub; no live model or external service called',selection:'Constructed native annotation protocol fixture; no browser pointer gesture',
    nativeImplementation:['ConversationReferences.add','ReferenceSubmissionService.submit','card pipeline saveCardDraft','deck staleness inspection'],
    selectedCardId:target.id,attackBefore:target.attack,attackAfter:rewritten.attack,
    otherDefinitionsByteUnchanged:JSON.stringify(after.batch.cards.filter((card:any)=>card.definition.id!==target.id))===others,
    copyEntriesUnchanged:JSON.stringify(after.batch.deck.entries)===JSON.stringify(before.batch.deck.entries),
    totalCopies:after.deckInspection.totalCopies,changedCardIds:after.deckInspection.changedCardIds,
    selectedStageBefore:before.stages[target.id],selectedStageAfter:after.stages[target.id],
    otherStagesUnchanged:after.batch.cards.filter((card:any)=>card.definition.id!==target.id).every((card:any)=>after.stages[card.definition.id]===before.stages[card.definition.id]),
    oldCandidateId:candidate.id,staleCandidateId:after.deckInspection.staleCandidateId,confirmationInvalidated:!after.deckInspection.confirmed,
    isolatedStarter26ByteUnchanged:true,nativeAdmissions:sends.length
  },null,2));
 }finally{await core.close();await f.close();}
},20000);

test('whole-deck artwork update binds all resources, rejects stale faces, preserves rules and starter bytes, and recovers exact before bytes',async()=>{
 const f=await fixture();try{
  const starter=await readFile(join(f.root,'public/data/decks/starter-deck.json'));
  await f.run('confirmDeckDraft');const logical=(await f.run('stageDeckCandidate')).candidate;await f.confirm(logical);
  const before=await readFile(join(f.root,'public/data/cards/units.json'));
  const deckBefore=await readFile(join(f.root,logical.deckPath));
  const logic=(await f.get()).deckInspection.fingerprint;
  // Source binding explicitly refreshes its one collection; no watcher timing assumption.
  await f.run('prepareDeckArt');
  expect((await f.run('stageDeckCandidate')).candidate.id).toBe(logical.id);
  // Isolated bitmap fixture only; live deliverables must be real imagegen illustrations.
  const sharp=(await import('sharp')).default;
  const png=(await sharp({create:{width:256,height:256,channels:4,background:'#456c59'}}).png().toBuffer()).toString('base64');
  for(const item of (await f.get()).batch.cards){
   const cardId=item.definition.id;const requested=await f.run('requestCardArt',{cardId});
   await f.run('attachCardArt',{cardId,requestId:requested.request.id,base64:png});
   await f.run('assembleCardFaces',{cardId});
  }
  const assembled=await f.get();expect(assembled.deckInspection.fingerprint).toBe(logic);expect(assembled.deckInspection.confirmed).toBe(true);
  const {candidate}=await f.run('stageDeckCandidate');expect(candidate.placeholderCardIds).toEqual([]);expect(Object.keys(candidate.deckArtFingerprints)).toHaveLength(12);
  expect(candidate.dependencies.filter((dep:any)=>dep.path.startsWith('public/assets/card-faces/'))).toHaveLength(60);
  expect(requiredGamePreviewChecks(candidate)).toContain('deck-art');expect(candidatePreviewOptions(candidate)).toHaveProperty('deckArtFingerprints');
  expect(candidate.changedPaths).not.toContain('public/data/decks/starter-deck.json');
  expect(await readFile(join(f.root,'public/data/cards/units.json'))).toEqual(before);
  await f.run('saveCardDraft',{cardId:'D_0',presentation:{zoom:1.1}});
  await expect(f.confirm(candidate)).rejects.toThrow('草案已更新');
  await expect(f.run('stageDeckCandidate')).rejects.toThrow('尚未全部');
  await f.run('saveCardDraft',{cardId:'D_0',presentation:{zoom:1}});
  expect((await f.run('stageDeckCandidate')).candidate.id).toBe(candidate.id);
  const adoption=await f.confirm(candidate);expect((await f.confirm(candidate)).reused).toBe(true);
  expect((await f.get()).deckInspection.status).toBe('adopted');
  const updated=JSON.parse(await readFile(join(f.root,'public/data/cards/units.json'),'utf8'));
  const originals=JSON.parse(before.toString()).units;
  expect(updated.units.map(({cardFace,...card}:any)=>card)).toEqual(originals);
  expect(updated.units.filter((card:any)=>card.id.startsWith('D_')).every((card:any)=>card.cardFace.variants.jade&&card.cardFace.variants.scroll)).toBe(true);
  expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(starter);
  expect(await readFile(join(f.root,candidate.deckPath))).toEqual(deckBefore);
  const manifest=JSON.parse(await readFile(join(f.root,'public/assets/asset-manifest.json'),'utf8'));expect(manifest.assets).toHaveLength(60);
  await f.adoption.undo({projectId:'p',productionId:f.productionId,candidateId:candidate.id,adoptionId:adoption.adoptionId,featureId:candidate.featureId,candidateHash:candidate.candidateHash,targetBaseRevision:candidate.targetBaseRevision,validationManifest:candidate.validationManifest});
  expect(await readFile(join(f.root,'public/data/cards/units.json'))).toEqual(before);
  expect(await readFile(join(f.root,candidate.deckPath))).toEqual(deckBefore);expect(await readFile(join(f.root,'public/data/decks/starter-deck.json'))).toEqual(starter);
  expect(await readFile(join(f.root,'public/assets/asset-manifest.json')).catch(()=>null)).toBeNull();
 }finally{await f.close();}
},120_000);
