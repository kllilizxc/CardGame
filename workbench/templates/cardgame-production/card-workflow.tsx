import { DeckOutcome } from './deck-outcome';
import { CompanionContext } from './companion-context';
import { CompanionCreate } from './companion-create';
import { useNoteDraft, useActions, useResource, useWorkbench, type NoteDraftSource } from '@dsh-workbench/react';
import { Button, Input, Label, ScrollShadow, Spinner, TextArea, TextField } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { CARD_FACE_THEMES, CARD_KIND_LABELS, cardRules } from './card-face';

const LABELS: Record<string, string> = { review: '核对定义', art: '等待插画', assemble: '待组装', integrate: '待建候选', done: '候选已建立' };

export function CreateCardWorkflow({ projectId, onCreated }: { projectId: string; onCreated: (id: string) => void | Promise<void> }) {
  const actions = useActions<typeof import('./actions')>();
  const features = useResource<{ items: Array<{ id: string; title: string }> }>('featureChoices', {});
  const created = useRef<string | undefined>(undefined);
  const [navigationError, setNavigationError] = useState('');
  const draft = useNoteDraft({ key: `create-card:${projectId}`, value: { brief: '', featureId: '' }, save: async (value, context) => {
    const result = await actions.cardWorkflow({ operation: 'createCardBatch', projectId, ...value, requestId: context.requestId }, context);
    if (!context.signal.aborted) created.current = result.production.id;
    return { value: { brief: '', featureId: '' } };
  } });
  const { brief, featureId } = draft.value;
  const setBrief = (brief: string) => draft.set(value => ({ ...value, brief }));
  const setFeatureId = (featureId: string) => draft.set(value => ({ ...value, featureId }));
  const busy = draft.saving;
  const error = draft.error?.message ?? navigationError;
  async function openCreated() {
    if (!created.current) return;
    try { await onCreated(created.current); setNavigationError(''); }
    catch (cause) { setNavigationError(`制作单已保存，打开失败：${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  async function create() { setNavigationError(''); if (await draft.save()) await openCreated(); }
  return <><div className="cw-create"><style>{STYLE + REFINEMENTS + COMPACT_REFINEMENTS + REUSE_STYLE}</style><TextField value={brief} onChange={setBrief} isDisabled={busy} fullWidth><Label>卡牌生成工作流</Label><Input placeholder="例如：设计一套青云宗灵兽卡组，先制作 3 张" /></TextField><label className="cw-feature">所属功能<select aria-label="所属功能" disabled={busy} value={featureId} onChange={event => setFeatureId(event.target.value)}><option value="">选择已有功能</option>{(features.data?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><Button isDisabled={!brief.trim() || !featureId || busy} onPress={() => { void create(); }}>{busy ? '创建中…' : '新建卡牌工作流'}</Button>{features.error && <p role="alert" className="cw-error">{features.error.message}</p>}{error && <p role="alert" className="cw-error">{error}</p>}{navigationError && created.current && <Button variant="secondary" onPress={() => { void openCreated(); }}>打开已创建制作单</Button>}</div><CompanionCreate projectId={projectId} onCreated={onCreated} /></>;
}

export function CardWorkflow({ projectId, productionId, libraryNoteId }: { projectId: string; productionId: string; libraryNoteId?: string }) {
  const resource = useResource<any>('cardBatch', { projectId, productionId });
  const actions = useActions<typeof import('./actions')>();
  const workbench = useWorkbench();
  const [selected, setSelected] = useState<string>();
  const [showSteps, setShowSteps] = useState(false);
  const value = resource.data;
  const [editing, setEditing] = useState(false);
  if (!value) return <div className="cw-workflow"><style>{STYLE + REFINEMENTS + COMPACT_REFINEMENTS + REUSE_STYLE}</style>{resource.error ? <p role="alert">{resource.error.message}</p> : <Spinner />}</div>;
  const { batch, production, stages } = value;
  if (batch.deck) return <DeckOutcome projectId={projectId} value={value} />;
  const card = batch.cards.find((item: any) => item.definition.id === selected) ?? batch.cards[0];
  const currentStep = !card ? 0 : ({ review: 1, art: 2, assemble: 3, integrate: 4, done: 5 } as Record<string, number>)[stages[card.definition.id]] ?? 0;
  return <section className="cw-workflow"><style>{STYLE + REFINEMENTS + COMPACT_REFINEMENTS + REUSE_STYLE}</style>
    <CompanionContext projectId={projectId} production={production} />
    <header className="cw-heading"><div><span className="cw-muted">卡牌生成 · Codex 插画</span><h2>{production.brief}</h2></div><span>{batch.cards.length} 张</span></header>
    <Button className="cw-step-toggle" variant="tertiary" aria-expanded={showSteps} aria-controls="cw-production-steps" onPress={() => setShowSteps(value => !value)}>{currentStep >= 5 ? "制作已完成" : `第 ${currentStep + 1}/5 步 · ${card ? LABELS[stages[card.definition.id]] : "草稿"}`} · {showSteps ? "收起步骤" : "查看步骤"}</Button>
    <ol id="cw-production-steps" className={`cw-steps${showSteps ? " is-expanded" : ""}`} aria-label="制作进度">{['AI 卡组草稿', '人工微调', 'Codex 生图', '模板组装', '试玩候选'].map((step, index) => <li key={step} className={index < currentStep ? 'is-complete' : index === currentStep ? 'is-current' : ''} aria-current={index === currentStep ? 'step' : undefined}><span>{index < currentStep ? '✓' : index + 1}</span>{step}</li>)}</ol>
    {!card ? <div className="cw-empty"><strong>等待卡组草稿</strong><p>在便笺原生对话中描述想要的卡组，草稿会保存在这份制作单中。</p></div> : <>
      {batch.cards.length > 1 && <div className="cw-card-nav">{batch.cards.map((item: any) => <Button key={item.definition.id} size="sm" isDisabled={editing} variant={card.definition.id === item.definition.id ? 'primary' : 'tertiary'} onPress={() => setSelected(item.definition.id)}>{item.definition.name} · {LABELS[stages[item.definition.id]]}</Button>)}</div>}
      <CardEditor key={card.definition.id} card={card} stage={stages[card.definition.id]} projectId={projectId} productionId={productionId} featureId={production.featureId} companion={batch.companion} adopted={production.gameCandidates?.filter((candidate: any) => candidate.cardId === card.definition.id).at(-1)?.status === "adopted"} baseRevision={production.revision} source={resource.draftSource(next => {
        const latest = next?.batch.cards.find((item: any) => item.definition.id === card.definition.id);
        if (!latest) throw new Error('卡牌已不存在，请重新选择');
        return { value: cardEditorValue(latest), revision: next.production.revision };
      })} onDirty={setEditing} onOpenLibrary={libraryNoteId ? () => { void workbench.openNote(libraryNoteId, `cg:${encodeURIComponent(JSON.stringify({ projectId, kind: 'card', id: card.definition.id }))}`); } : undefined} />
    </>}
  </section>;
}

const REFINEMENTS = `
.cw-workflow{width:min(100%,1120px);margin:0 auto;padding:8px 0 28px;background:transparent}
.cw-heading{align-items:center}.cw-heading h2{margin:4px 0 0;font-size:22px;line-height:1.35}.cw-heading>span{color:var(--wb-muted);font-size:12px}
.cw-steps{gap:clamp(8px,2vw,26px);margin:14px 0 26px;padding:13px 0 0}.cw-steps li{color:var(--wb-muted);font-weight:600}.cw-steps li>span{width:23px;height:23px;padding:0;display:grid;place-items:center;background:var(--wb-surface-deep);border-radius:50%}.cw-steps li.is-current{color:var(--wb-ink)}.cw-steps li.is-current>span{background:var(--wb-accent);color:var(--wb-accent-foreground)}.cw-steps li.is-complete>span{background:var(--wb-success-pale);color:var(--wb-success)}
.cw-editor{gap:clamp(20px,4vw,48px);align-items:start}.cw-preview-image{width:min(100%,290px);background:transparent}.cw-preview>strong{font-size:15px}.cw-controls{gap:18px;padding:24px 26px;background:var(--wb-surface);border-radius:var(--wb-radius)}
.cw-stage-intro h3{font-size:21px;line-height:1.3;margin:3px 0 8px}.cw-stage-intro p{margin:0;color:var(--wb-muted);font-size:13px;line-height:1.6}.cw-eyebrow{font-size:12px;color:var(--wb-accent);font-weight:650}
.cw-edit-fields{display:flex;flex-direction:column;gap:14px}.cw-definition-summary{display:flex;flex-direction:column;gap:8px;padding:15px 18px;border-radius:var(--wb-radius-small);background:var(--wb-surface-deep)}.cw-definition-summary strong{font-size:16px}.cw-definition-summary span{font-size:13px;color:var(--wb-ink-soft)}.cw-definition-summary p{margin:0;white-space:pre-wrap;line-height:1.7;font-size:13px}
.cw-next{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cw-file-pick{position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:37px;padding:7px 14px;border-radius:var(--wb-radius-small);background:var(--wb-accent-pale);color:var(--wb-accent);font-size:13px;font-weight:600;cursor:pointer}.cw-file-pick:focus-within{outline:2px solid var(--wb-accent);outline-offset:2px}.cw-file-pick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.cw-revise,.cw-request{color:var(--wb-ink-soft);font-size:13px}.cw-revise summary,.cw-request summary{cursor:pointer;padding:7px 0}.cw-revise .cw-edit-fields{padding:12px 0}.cw-theme-buttons{justify-content:center}
@media(max-width:680px){.cw-workflow{padding:4px 0 20px}.cw-heading h2{font-size:18px}.cw-steps{margin:10px 0 18px;gap:9px}.cw-steps li{font-size:11px}.cw-steps li>span{width:20px;height:20px}.cw-controls{padding:18px}.cw-preview-image{width:min(100%,235px)}.cw-editor.stage-review .cw-preview{flex-direction:row;justify-content:center;flex-wrap:wrap}.cw-editor.stage-review .cw-preview-image{width:86px}.cw-editor.stage-review .cw-preview strong{font-size:14px}.cw-editor.stage-art .cw-preview{display:none}}
`;

function cardBoostEffect(card: any) {
  const effect = card.definition.kind === 'talisman' && card.definition.effects?.length === 1 ? card.definition.effects[0] : undefined;
  return effect?.timing === 'reaction' && effect.target?.scope === 'singleAlly' && effect.target.requiredLabelsAllOf?.length === 1 && effect.actions?.length === 1 && effect.actions[0].type === 'modifyAttack' && effect.actions[0].duration === 'turn' ? effect : undefined;
}

function cardEditorValue(card: any) {
  const effect = cardBoostEffect(card);
  return { name: card.definition.name as string, description: card.definition.description as string, attack: String(card.definition.attack), health: String(card.definition.health), artBrief: card.artBrief as string, boost: String(effect ? effect.actions[0].value : '') };
}

function CardEditor({ card, stage, projectId, productionId, featureId, companion, adopted, baseRevision, source, onDirty, onOpenLibrary }: { card: any; stage: string; projectId: string; productionId: string; featureId?: string; companion?: { cardId: string; revision: string }; adopted?: boolean; baseRevision: number; source: NoteDraftSource<ReturnType<typeof cardEditorValue>>; onDirty: (dirty: boolean) => void; onOpenLibrary?: () => void }) {
  const actions = useActions<typeof import('./actions')>();
  const workbench = useWorkbench();
  const effect = cardBoostEffect(card);
  const canEditBoost = Boolean(effect);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const draft = useNoteDraft({ key: `card:${projectId}:${productionId}:${card.definition.id}`, source,
    save: async (value, context) => {
      const { name, description, attack, health, artBrief, boost } = value;
      if (!name.trim() || !description.trim()) throw new Error('名称和说明不能为空');
      const unit = card.definition.kind === 'unit';
      if (unit && (!Number.isInteger(Number(attack)) || !Number.isInteger(Number(health)) || Number(attack) < 0 || Number(health) < 1 || Number(attack) > 999 || Number(health) > 999)) throw new Error('攻防需要有效整数');
      if (canEditBoost && (!Number.isInteger(Number(boost)) || Number(boost) < 1 || Number(boost) > 9)) throw new Error('攻击增益需要 1–9 的整数');
      const rule = canEditBoost ? `使一个带有「${effect.target.requiredLabelsAllOf[0]}」标签的己方单位本回合攻击 +${Number(boost)}。` : undefined;
      const boostPatch = canEditBoost ? { description: rule, effects: [{ ...effect, text: rule, actions: [{ ...effect.actions[0], value: Number(boost) }] }] } : {};
      const result = await actions.cardWorkflow({ projectId, productionId, cardId: card.definition.id, baseRevision: context.revision, requestId: context.requestId, operation: 'saveCardDraft', definition: { ...card.definition, name, description, ...(unit ? { attack: Number(attack), health: Number(health) } : {}), ...boostPatch }, artBrief }, context);
      return { revision: result.production?.revision };
    } });
  const { name, description, attack, health, artBrief, boost } = draft.value;
  const dirty = draft.dirty;
  const [chosenFeatureId, setChosenFeatureId] = useState(featureId ?? '');
  const features = useResource<{ items: Array<{ id: string; title: string }> }>('featureChoices', {}, { enabled: !featureId });
  const [reuseSourceId, setReuseSourceId] = useState(companion?.cardId ?? '');
  const reuseChoices = useResource<any>('companionChoices', { projectId }, { enabled: stage === 'review' || stage === 'art' });
  const reuseSource = useResource<any>('sourceCard', { projectId, id: reuseSourceId }, { enabled: Boolean(reuseSourceId) });
  useEffect(() => { onDirty(dirty || draft.saving); return () => onDirty(false); }, [dirty, draft.saving, onDirty]);
  function edit(field: keyof typeof draft.value, value: string) { draft.set(previous => ({ ...previous, [field]: value })); }
  const args = { projectId, productionId, cardId: card.definition.id, baseRevision };
  const previewId = stage === 'art' ? undefined : ['integrate', 'done'].includes(stage) ? card.assembly?.variants?.[card.presentation.themeId]?.previewId : card.art?.id;
  const media = useResource<any>('media', { projectId, id: previewId, variant: 'original' }, { enabled: Boolean(previewId) });
  async function run(operation: Parameters<typeof import('./actions').cardWorkflow>[0]['operation'], extra: Record<string, any> = {}) {
    setBusy(operation); setError(''); setFeedback('');
    try { const result = await actions.cardWorkflow({ ...args, operation, ...extra }); return result; }
    catch (error) { setError((error as Error).message); return undefined; }
    finally { setBusy(''); }
  }
  async function requestArt() {
    const result = await run('requestCardArt');
    if (result?.reusedArt) { setFeedback('已沿用当前插画，可以继续组装卡面。'); return; }
    if (result?.automaticGeneration) { setFeedback('Codex 正在生成插画；完成后会自动组装卡面并建立试玩候选。'); return; }
    if (result?.handoff) { try { await workbench.copyText(result.handoff); setFeedback('生图任务已复制，发到 Codex 后回填图片。'); } catch (error) { setError((error as Error).message); } }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 20_000_000) { setError('图片需要小于 20 MB'); return; }
    setBusy('upload');
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
      await run('attachCardArt', { requestId: card.artRequest?.id, base64 });
    } catch (error) { setError((error as Error).message); } finally { setBusy(''); }
  }
  const disabled = Boolean(busy) || dirty || draft.saving;
  const unit = card.definition.kind === 'unit';
  const editFields = <div className="cw-edit-fields">
    <div className={`cw-fields${unit ? '' : ' cw-fields-single'}`}><TextField value={name} onChange={value => edit('name', value)}><Label>名称</Label><Input /></TextField>{unit && <><TextField value={attack} onChange={value => edit('attack', value)}><Label>攻击</Label><Input type="number" min={0} max={999} /></TextField><TextField value={health} onChange={value => edit('health', value)}><Label>生命</Label><Input type="number" min={1} max={999} /></TextField></>}</div>
    <TextField value={description} onChange={value => edit('description', value)} fullWidth><Label>说明</Label><TextArea rows={2} /></TextField>
    {canEditBoost && <TextField value={boost} onChange={value => edit('boost', value)}><Label>本回合攻击增益</Label><Input type="number" min={1} max={9} /></TextField>}
    <p className="cw-rules">{cardRules(card.definition)}</p>
    <TextField value={artBrief} onChange={value => edit('artBrief', value)} fullWidth><Label>插画要求</Label><TextArea rows={3} /></TextField>
    {dirty && <div className="cw-actions"><Button size="sm" isDisabled={Boolean(busy) || draft.saving} onPress={() => { void draft.save(); }}>保存微调</Button><span className="cw-muted">尚未保存</span></div>}
    {draft.error && <p role="alert" className="cw-error">{draft.error.message}</p>}
  </div>;
  const generation = card.artGeneration;
  const generating = stage === 'art' && generation?.status === 'running';
  const stageTitle = stage === 'review' ? '核对卡牌定义' : stage === 'art' ? generating ? 'Codex 正在生成插画' : '生成并回填插画' : stage === 'assemble' ? '组装卡面' : stage === 'integrate' ? '建立可试玩候选' : adopted ? '这张卡已加入我的游戏' : '试玩候选已建立';
  const stageHint = stage === 'review' ? '确认名称、说明、规则与插画要求后，开始自动制作。' : stage === 'art' ? generating ? '完成后会自动组装两套卡面并建立试玩候选。' : generation?.status === 'failed' ? '生图未完成，可重试当前请求或上传插画。' : generation?.status === 'unavailable' ? '当前宿主无法自动生图，可复制任务到 Codex 并上传插画。' : '用 Codex 生成插画；也可以上传已有的插画。' : stage === 'assemble' ? '插画已就绪。两套卡面会使用同一张插画。' : stage === 'integrate' ? '卡牌定义与资源将写入隔离的候选版本；确认采用只在功能进展中进行。' : adopted ? '当前卡牌候选已本地采用；可在卡牌库查看正式卡面，或回到来源记录查看验收结论。' : '候选已登记到试玩便笺。';
  return <div className={`cw-editor stage-${stage}`}>
    <div className="cw-preview"><div className="cw-preview-image">{media.data?.url ? <img src={media.data.url} alt={`${card.definition.name} · ${['integrate', 'done'].includes(stage) ? '卡面' : '插画'}`} /> : <span>{media.loading ? '读取预览…' : stage === 'art' ? '等待当前要求的插画' : '等待插画'}</span>}</div>{media.error && <p className="cw-error">{media.error.message}</p>}<div className="cw-preview-identity"><strong>{card.definition.name}</strong><small>{card.definition.id}</small></div>
      {(stage === 'integrate' || stage === 'done') && <><div className="cw-theme-buttons" aria-label="卡面主题">{CARD_FACE_THEMES.map(theme => <Button key={theme.id} size="sm" isDisabled={disabled} variant={theme.id === card.presentation.themeId ? 'primary' : 'secondary'} onPress={() => void run('saveCardDraft', { presentation: { themeId: theme.id } })}>{theme.name}</Button>)}</div><span className="cw-muted">切换主题会生成新的候选版本</span></>}
      {stage === 'done' && <span className="cw-muted">请在试玩便笺体验，然后到对应功能项确认采用。</span>}
    </div>
    <div className="cw-controls"><div className="cw-stage-intro" aria-live="polite"><span className="cw-eyebrow">{LABELS[stage]}</span><h3>{stageTitle}</h3><p>{stageHint}</p></div>
      {stage === 'done' && <><div className="cw-definition-summary"><strong>{card.definition.name}</strong><span>{CARD_KIND_LABELS[card.definition.kind] ?? card.definition.kind}{unit ? ` · 攻击 ${card.definition.attack} · 生命 ${card.definition.health}` : ''}</span><p>{cardRules(card.definition)}</p></div><details className="cw-revise" open={dirty}><summary>修改卡牌定义或插画要求{dirty ? ' · 未保存' : ''}</summary>{editFields}</details><div className="cw-next"><Button isDisabled={disabled} onPress={() => void run('integrateCard')}>重新建立试玩候选</Button></div></>}
      {stage !== 'done' && <>
        {stage === 'review' || stage === 'art' ? editFields : <details className="cw-revise" open={dirty}><summary>修改卡牌定义或插画要求{dirty ? ' · 未保存' : ''}</summary>{editFields}</details>}
        {(stage === 'review' || stage === 'art') && <div className="cw-reuse"><label>复用现有插画<select aria-label="复用插画来源" value={reuseSourceId} disabled={disabled} onChange={event => setReuseSourceId(event.target.value)}><option value="">选择已有卡牌</option>{(reuseChoices.data?.units ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button variant="secondary" isDisabled={disabled || !reuseSource.data?.json?.cardFace?.artwork} onPress={() => void run('reuseCardArt', { sourceCardId: reuseSourceId, sourceRevision: reuseSourceId === companion?.cardId ? companion.revision : reuseSource.data?.revision })}>复用选中卡牌的插画</Button>{reuseSource.error && <p role="alert">{reuseSource.error.message}</p>}</div>}
        {card.art?.provider === 'existing' && <p className="cw-muted">插画复用自 {reuseSource.data?.name ?? card.art.sourceCardId}，已保存来源与版本。</p>}
        <div className="cw-next">
          {stage === 'review' && <Button isDisabled={disabled} onPress={() => void requestArt()}>继续制作</Button>}
          {stage === 'art' && <><Button isDisabled={disabled || generating} onPress={() => void requestArt()}>{generating ? 'Codex 生图中…' : generation?.status === 'unavailable' ? '复制给 Codex 的生图任务' : generation?.status === 'failed' ? '重试 Codex 生图' : '用 Codex 生成插画'}</Button>{card.artRequest && !generating && <label className="cw-file-pick">上传生成的插画<input aria-label="上传生成的插画" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>}</>}
          {stage === 'assemble' && <Button isDisabled={disabled} onPress={() => void run('assembleCardFaces')}>组装青玉与宣纸卡面</Button>}
          {stage === 'integrate' && !featureId && <label className="cw-feature">所属功能<select aria-label="所属功能" value={chosenFeatureId} onChange={event => setChosenFeatureId(event.target.value)}><option value="">选择已有功能</option>{(features.data?.items ?? []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button size="sm" isDisabled={!chosenFeatureId || disabled} onPress={() => { setBusy('feature'); setError(''); void actions.updateProduction({ projectId, productionId, baseRevision, patch: { featureId: chosenFeatureId } }).catch(error => setError(error.message)).finally(() => setBusy('')); }}>绑定功能</Button></label>}
          {stage === 'integrate' && featureId && <Button isDisabled={disabled} onPress={() => void run('integrateCard')}>建立试玩候选</Button>}
        </div>
        {card.artRequest && (stage === 'art' || stage === 'assemble') && <details className="cw-request"><summary>查看生图提示词</summary><ScrollShadow className="cw-prompt">{card.artRequest.prompt}</ScrollShadow></details>}
        {stage === 'integrate' && <p className="cw-muted">新卡的掉落、商店和初始牌组入口由游戏内容配置决定。</p>}
      </>}
      {generating && <span className="cw-muted" role="status">Codex 正在生成插画…</span>}{generation?.status === 'failed' && <p role="alert" className="cw-error">{generation.error}</p>}{busy && <span className="cw-muted" role="status">正在处理…</span>}{error && <p role="alert" className="cw-error">{error}</p>}{feedback && <p role="status">{feedback}</p>}
    </div>
  </div>;
}

const STYLE = `.cw-create{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.cw-create>div{flex:1;min-width:180px}.cw-feature{display:grid;gap:5px;color:var(--wb-ink-soft);font-size:12px}.cw-feature select{min-height:38px;max-width:260px;border:1px solid var(--wb-muted-light);border-radius:var(--wb-radius-small);background:var(--wb-surface);color:var(--wb-ink);padding:5px 8px}.cw-workflow{color:var(--wb-ink);background:var(--wb-surface);padding:20px;border-radius:var(--wb-radius);min-width:0}.cw-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}.cw-heading h2{margin:6px 0 14px;font-size:20px}.cw-muted,.cw-preview small{color:var(--wb-muted);font-size:12px;line-height:1.65}.cw-steps{padding:0;margin:0;display:flex;gap:16px;list-style:none;flex-wrap:wrap}.cw-steps li{display:flex;align-items:center;gap:6px;font-size:12px}.cw-card-nav,.cw-actions,.cw-theme-buttons{display:flex;gap:8px;flex-wrap:wrap}.cw-card-nav{margin:18px 0}.cw-card-nav button{white-space:normal;height:auto;min-height:30px}.cw-editor{display:grid;grid-template-columns:minmax(180px,300px) minmax(0,1fr);gap:24px}.cw-preview{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0}.cw-preview-image{width:min(100%,270px);aspect-ratio:540/780;background:var(--wb-paper);display:grid;place-items:center;border-radius:10px;overflow:hidden}.cw-preview-image img{width:100%;height:100%;object-fit:contain}.cw-controls{display:flex;flex-direction:column;gap:14px;min-width:0}.cw-fields{display:grid;grid-template-columns:minmax(0,2fr) minmax(65px,1fr) minmax(65px,1fr);gap:10px}.cw-fields-single{grid-template-columns:minmax(0,1fr)}.cw-rules{line-height:1.8;margin:0;white-space:pre-wrap;font-size:13px}.cw-upload{display:flex;flex-direction:column;gap:6px;font-size:12px;max-width:100%;overflow-wrap:anywhere}.cw-upload input{max-width:100%;font-size:12px}.cw-error{color:var(--wb-danger);overflow-wrap:anywhere}.cw-prompt{max-height:160px;white-space:pre-wrap;font-size:12px;line-height:1.7;overflow-wrap:anywhere}.cw-empty{padding:30px 0;display:grid;gap:12px;justify-items:start}.cw-empty p{margin:0;color:var(--wb-muted)}@media(max-width:680px){.cw-workflow{padding:12px}.cw-editor{grid-template-columns:minmax(0,1fr)}.cw-preview-image{width:220px}.cw-fields{grid-template-columns:minmax(0,1fr) minmax(60px,.5fr) minmax(60px,.5fr)}.cw-fields-single{grid-template-columns:minmax(0,1fr)}}`;

const COMPACT_REFINEMENTS = "\n.cg-production:has(>.cw-workflow)>.cg-header{display:none}\n.cw-step-toggle{display:none}.cw-preview-identity{display:flex;align-items:baseline;justify-content:center;gap:8px;flex-wrap:wrap}.cw-preview-identity strong{font-size:15px}\n.cw-preview-image{display:block;position:relative;min-width:0;min-height:0;flex:none;overflow:visible;aspect-ratio:540/780}.cw-preview-image img{display:block;width:100%;height:auto;max-height:none;aspect-ratio:540/780;object-fit:contain;border-radius:inherit}\n@media(max-width:680px){\n .cg-production:has(>.cw-workflow){position:relative;padding:8px 12px max(144px,calc(env(safe-area-inset-bottom) + 144px));gap:6px}\n .cg-production:has(>.cw-workflow)>.cg-card-route{position:absolute;top:8px;left:12px;z-index:2}.cg-card-route .button{min-height:44px;padding-inline:0}\n .cw-workflow{padding:0}.cw-heading{padding-left:72px;min-height:44px;gap:8px}.cw-heading .cw-muted{display:none}.cw-heading h2{font-size:16px;margin:0;line-height:1.4}.cw-heading>span{flex:none;font-size:11px}\n .cw-step-toggle{display:flex;min-height:38px;margin:4px 0 8px;font-size:12px}.cw-steps:not(.is-expanded){display:none}.cw-steps.is-expanded{margin:0 0 12px;padding:0;gap:8px}\n .cw-preview-image{width:min(100%,210px)}.cw-preview{gap:8px}.cw-preview-identity strong{font-size:14px}.cw-editor{gap:14px}.cw-controls{padding:12px;gap:12px}.cw-stage-intro h3{font-size:18px}.cw-stage-intro .cw-eyebrow{display:none}\n .cw-editor.stage-integrate .cw-next{position:fixed;bottom:max(76px,calc(env(safe-area-inset-bottom) + 76px));left:12px;right:12px;z-index:5;padding:8px 0;background:var(--wb-paper);border-top:1px solid var(--wb-line-soft)}.cw-editor.stage-integrate .cw-next .button{width:100%;min-height:44px}\n}\n";

const REUSE_STYLE = `.cw-reuse{display:flex;flex-direction:column;gap:10px}.cw-reuse label{display:flex;flex-direction:column;gap:6px}.cw-reuse select{width:100%;min-height:44px;min-width:0;border:1px solid var(--wb-line);border-radius:var(--wb-radius-small);color:var(--wb-ink);background:var(--wb-surface);padding:8px}`;
