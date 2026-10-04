import { useActions, useResource } from '@dsh-workbench/react';
import { Button } from '@heroui/react';
import { useState } from 'react';
import { CARD_FACE_THEMES, CARD_KIND_LABELS, cardRules } from './card-face';

const STATES: Record<string,string> = { adopted:'已加入正式游戏', 'basis-changed':'简报已变化', incomplete:'方案待补齐', 'needs-review':'待确认草案', candidate:'候选已建立', stale:'候选待更新', ready:'草案已确认' };

/** Readable outcomes, native conversation/annotation editing, one explicit approval. */
export function DeckOutcome({ projectId, value }: { projectId: string; value: any }) {
  const actions=useActions<typeof import('./actions')>();
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const { batch, production, deckInspection: report }=value;
  const plan=batch.deck;
  const [theme,setTheme]=useState('jade');
  const ready=batch.cards.filter((card:any)=>['integrate','done'].includes(value.stages[card.definition.id])).length;
  const artworkStarted=batch.cards.some((card:any)=>card.artRequest||card.art);
  const current=production.gameCandidates?.find((item:any)=>item.id===report.candidateId);
  const artCandidate=Boolean(current?.deckArtFingerprints);
  const artAdopted=artCandidate&&current.status==='adopted';
  async function confirm() {
    setBusy(true);setError('');
    try {
      const approved=await actions.cardWorkflow({operation:'confirmDeckDraft',projectId,productionId:production.id,baseRevision:production.revision});
      await actions.cardWorkflow({operation:'stageDeckCandidate',projectId,productionId:production.id,baseRevision:approved.production.revision});
    } catch(cause) {setError((cause as Error).message);} finally {setBusy(false);}
  }
  async function stage() {
    setBusy(true);setError('');
    try {await actions.cardWorkflow({operation:'stageDeckCandidate',projectId,productionId:production.id,baseRevision:production.revision});}
    catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  }
  return <section className="deck-outcome" aria-label="独立牌组成果"><style>{STYLE}</style>
    <header><span>独立牌组 · {STATES[report.status]}</span><h2>{plan.title}</h2><strong>{report.distinctCards} 种 · {report.totalCopies}/{plan.targetSize} 张</strong></header>
    <p className="deck-brief">{production.brief}</p>
    <p className="deck-next" aria-live="polite">下一步 · {report.next}</p>
    <p className="deck-edit-hint">在便笺对话中调整整套策略，或标注一张卡局部修改；其余成果会保留。</p>
    {batch.draftOrigin && <small>草稿来源 · {batch.draftOrigin==='agent'?'便笺原生 AI 会话':batch.draftOrigin==='user'?'用户写入':'尚未核实'}</small>}
    {report.basisChanged && <p role="status">简报与原方案不同。对话会核对受影响的卡牌，再保存方案；不会清空其他成果。</p>}
    {report.staleCandidateId && <p role="status">旧候选保留可追溯；{report.changedCardIds.length?`需核对：${report.changedCardIds.join('、')}`:'数量或简报方案已变更'}。当前草案需重新确认。</p>}
    {report.errors.length>0 && <ul aria-label="待补齐项">{report.errors.map((text:string)=><li key={text}>{text}</li>)}</ul>}
    {report.warnings.length>0 && <ul aria-label="组合提示">{report.warnings.map((text:string)=><li key={text}>{text}</li>)}</ul>}
    {artworkStarted&&<section className="deck-art-status" aria-label="插画交付进度"><strong>{artAdopted?'原创卡面已加入正式游戏':`两套卡面已组装 ${ready}/${batch.cards.length} 种`}</strong><p>{artAdopted?'全部插画和青玉、宣纸主题已随整套牌组交付。':ready===batch.cards.length?'查看每张卡面后，建立整套素材试玩候选。':'插画完成后自动组装两套卡面；在原生对话中调整主体或裁切。'}</p><div className="deck-themes" aria-label="预览卡面主题">{CARD_FACE_THEMES.map(item=><Button key={item.id} size="sm" variant={theme===item.id?'primary':'tertiary'} onPress={()=>setTheme(item.id)}>{item.name}</Button>)}</div></section>}
    <div className="deck-cards" aria-label="牌组卡牌与副本">{plan.entries.map((entry:any)=>{
      const item=batch.cards.find((item:any)=>item.definition.id===entry.cardId);
      const card=item?.definition;
      return <article key={entry.cardId} id={`deck-card-${entry.cardId}`} data-card-id={entry.cardId}><details><summary><span><strong>{card?.name??entry.cardId}</strong><small>{CARD_KIND_LABELS[card?.kind]??'草稿未就绪'}</small></span><b>×{entry.count}</b></summary>
        {item&&artworkStarted&&<DeckCardArtwork projectId={projectId} card={item} stage={value.stages[entry.cardId]} theme={theme}/>}
        {card&&<><p>{cardRules(card)}</p>{card.kind==='unit'&&<p>攻击 {card.attack} · 生命 {card.health}</p>}<small>卡牌对象 · {card.id}</small></>}
      </details></article>;
    })}</div>
    <small>{report.checkScope}。{artworkStarted?'当前素材在原制作单逐张保留；正式交付以整套素材候选的采用记录为准。':'整套逻辑试玩使用占位卡面；可在原生对话中继续制作原创插画。'}</small>
    {!report.candidateId&&report.legal&&!report.basisChanged&&<Button isDisabled={busy} onPress={()=>void(report.confirmed?stage():confirm())}>{busy?'正在建立候选…':report.confirmed?'更新整套试玩候选':'确认草案并建立试玩'}</Button>}
    {ready===batch.cards.length&&artworkStarted&&!artCandidate&&<Button isDisabled={busy} onPress={()=>void stage()}>{busy?'正在建立候选…':'建立整套卡面试玩候选'}</Button>}
    {report.status==='adopted'?<p>整套卡牌和副本计划已正式采用。在游戏的「牌组试炼」选择这套牌组即可开局；原牌组仍可选择。</p>:report.candidateId&&<p>整套候选已登记到试玩便笺。实际试玩后，可通过对话或标注提出调整；正式采用仍在功能进展中确认。</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
function DeckCardArtwork({projectId,card,stage,theme}:{projectId:string;card:any;stage:string;theme:string}) {
  const assembled=['integrate','done'].includes(stage);
  const id=assembled?card.assembly?.variants?.[theme]?.previewId:card.art?.id;
  const media=useResource<any>('media',{projectId,id,variant:'original'},{enabled:Boolean(id)});
  const generation=card.artGeneration;
  return <div className="deck-card-art">{media.data?.url?<img src={media.data.url} alt={`${card.definition.name} · ${assembled?theme==='jade'?'青玉卡面':'宣纸卡面':'原创插画'}`} loading="lazy"/>:<p>{media.loading?'读取卡面…':generation?.status==='running'?'插画正在生成…':generation?.status==='failed'?'插画需要重试':'等待原创插画'}</p>}{generation?.status==='failed'&&<p role="status">{generation.error}</p>}{media.error&&<p role="alert">{media.error.message}</p>}</div>;
}
const STYLE=`.deck-outcome{display:grid;gap:16px;max-width:920px;margin:0 auto;padding:8px 0 28px;color:var(--wb-ink)}.deck-outcome header>span,.deck-outcome small{color:var(--wb-muted);font-size:12px}.deck-outcome h2{margin:5px 0 8px;font-size:24px;overflow-wrap:anywhere}.deck-outcome p{margin:0;line-height:1.7;overflow-wrap:anywhere}.deck-next{font-weight:650;color:var(--wb-accent)}.deck-edit-hint{color:var(--wb-muted);font-size:13px}.deck-cards{display:grid;align-items:start;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px}.deck-cards article{padding:14px 16px;background:var(--wb-surface);border-radius:var(--wb-radius-small);min-width:0}.deck-cards summary{display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer;min-height:44px}.deck-cards summary>span{min-width:0}.deck-cards summary strong{display:block;overflow-wrap:anywhere}.deck-cards summary small{display:block;margin-top:3px}.deck-cards details[open] p{margin:10px 0}.deck-art-status{display:grid;gap:8px}.deck-themes{display:flex;gap:8px}.deck-card-art{display:grid;justify-items:center;gap:8px;margin:12px 0}.deck-card-art img{display:block;max-width:100%;width:260px;height:auto;object-fit:contain}.deck-card-art>p{font-size:13px;color:var(--wb-muted)}.deck-outcome>button{justify-self:start;height:auto;min-height:44px;white-space:normal}.deck-outcome ul{margin:0;padding-left:20px;line-height:1.7}@media(max-width:680px){.deck-outcome{gap:14px;padding:4px 0 20px}.deck-outcome h2{font-size:20px}.deck-cards{grid-template-columns:minmax(0,1fr)}}`;
