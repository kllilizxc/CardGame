import type { CoreStore } from '../../../src/core/store';

const fileTools = new Set(['bash', 'shell', 'terminal', 'exec', 'exec_command', 'edit', 'write', 'multi_edit', 'apply_patch', 'notebook_edit', 'python']);
const contentModes = new Set(['cards', 'knowledge', 'assets']);
const contentKinds = new Set(['production', 'todo', 'execution', 'preview']);

/** Content conversations write through note actions so their working directory cannot become the adoption target. */
export async function cardgameNativeWriteDenial(core: Pick<CoreStore, 'getSession' | 'getNote' | 'readRecord'>,
  sessionId: string | undefined, tool: string, nativeParentId?: string): Promise<string | undefined> {
  if (!sessionId || !fileTools.has(tool.toLowerCase())) return undefined;
  let current: string | undefined = sessionId;
  const seen = new Set<string>();
  for (let depth = 0; current && depth < 8 && !seen.has(current); depth++) {
    seen.add(current);
    const session = await core.getSession(current);
    const noteId = session?.value.noteId;
    if (noteId) {
      const note = await core.getNote(noteId);
      const config = await core.readRecord<Record<string, unknown>>('states', `${noteId}:config`);
      const value = config?.value;
      const mode = value?.mode;
      const kind = (value?.catalogRef as { kind?: unknown } | undefined)?.kind;
      const isCardgameContent = typeof value?.projectId === 'string' && value.projectId.trim() &&
        (contentModes.has(String(mode)) || contentKinds.has(String(kind)));
      if (isCardgameContent || note?.value.actions?.includes('confirmGameCandidate')) {
        return 'CardGame 内容会话不能用文件编辑或命令工具改项目源码。当前工作目录可能是已登记的正式项目；请先建立独立候选：卡牌制作沿用卡牌库或制作便笺的候选动作，知识库资料与剧情从知识库会话调用已登记的 cardgame-content 候选方法，再在原试玩便笺验证。直接工程开发请另开工程会话。';
      }
    }
    current = session?.value.parentSessionId ?? (depth === 0 ? nativeParentId : undefined);
  }
  return undefined;
}
