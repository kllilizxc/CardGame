export interface CardgameNotes {
  knowledge: string; cards: string; assets: string; production: string;
  todo: string; execution: string; preview: string;
  tracker?: string;
}

export type CardgameSkillKind = 'todo-desk' | 'desk-preview' | 'production-desk' | 'production-assets'
  | 'todo-production' | 'desk-references' | 'production-references';
export interface CardgameSkillRelation {
  kind: CardgameSkillKind;
  name: string;
  goal: string;
  nodeIds: string[];
}

/** The seven ongoing Skill relations that replace individual endpoint links. */
export function cardgameSkillRelations(notes: CardgameNotes): CardgameSkillRelation[] {
  return [
    { kind: 'todo-desk', name: '待办与执行台', goal: '只在明确交办后处理单项待办，并把可核对的执行进展写回原事项。', nodeIds: [notes.todo, notes.execution] },
    { kind: 'desk-preview', name: '执行台与试玩', goal: '按精确候选版本交付试玩，并把运行回执送回原执行任务。', nodeIds: [notes.execution, notes.preview] },
    { kind: 'production-desk', name: '制作与执行台', goal: '交办制作轮次并将执行结果按原请求和轮次写回制作记录。', nodeIds: [notes.production, notes.execution] },
    { kind: 'production-assets', name: '制作与资源库', goal: '登记制作候选；资源采用由用户明确操作并保留版本身份。', nodeIds: [notes.production, notes.assets] },
    { kind: 'todo-production', name: '待办与制作', goal: '将用户明确选择的资源事项建立为同一制作单草稿。', nodeIds: [notes.todo, notes.production] },
    { kind: 'desk-references', name: '执行台资料', goal: '按任务需要读取知识、卡牌、资源和功能进展的当前版本。', nodeIds: [notes.execution, notes.knowledge, notes.cards, notes.assets, ...(notes.tracker ? [notes.tracker] : [])] },
    { kind: 'production-references', name: '制作资料', goal: '按制作请求读取知识规范和明确版本的参考素材。', nodeIds: [notes.production, notes.knowledge, notes.assets] },
  ];
}
