export type QuestStageStatus = 'available' | 'active' | 'completed' | 'failed';

export interface QuestStageDefinition {
    id: string;
    status: QuestStageStatus;
    label: string;
    objective: string;
}

export interface QuestDefinition {
    id: string;
    title: string;
    summary: string;
    actorIds: string[];
    stages: QuestStageDefinition[];
}

export interface QuestCatalog {
    schemaVersion: 1;
    quests: QuestDefinition[];
}

export interface QuestJournalEntry {
    questId: string;
    title: string;
    summary: string;
    stageId: string;
    status: QuestStageStatus | 'unknown';
    stageLabel: string;
    objective: string;
}

export function questStageStatusLabel(status: QuestJournalEntry['status']): string {
    return status === 'active' ? '进行中' : status === 'available' ? '可接取'
        : status === 'completed' ? '已完成' : status === 'failed' ? '已失败' : '资料异常';
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9._-]{1,127}$/u.test(value);
const nonempty = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;

export function parseQuestCatalog(value: unknown): QuestCatalog {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('任务目录必须是对象');
    const catalog = value as Record<string, unknown>;
    if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.quests)) throw new Error('任务目录版本或列表无效');
    const questIds = new Set<string>();
    const quests: QuestDefinition[] = catalog.quests.map((raw, index) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`任务定义无效：${index}`);
        const quest = raw as Record<string, unknown>;
        if (!validId(quest.id) || questIds.has(quest.id) || !nonempty(quest.title, 40) || !nonempty(quest.summary, 500)
            || !Array.isArray(quest.actorIds) || quest.actorIds.length > 16 || quest.actorIds.some(id => !validId(id))
            || new Set(quest.actorIds).size !== quest.actorIds.length
            || !Array.isArray(quest.stages) || quest.stages.length < 1 || quest.stages.length > 32) {
            throw new Error(`任务定义无效：${String(quest.id ?? index)}`);
        }
        questIds.add(quest.id);
        const stageIds = new Set<string>();
        const stages: QuestStageDefinition[] = quest.stages.map((rawStage, stageIndex) => {
            if (!rawStage || typeof rawStage !== 'object' || Array.isArray(rawStage)) throw new Error(`任务阶段无效：${quest.id}/${stageIndex}`);
            const stage = rawStage as Record<string, unknown>;
            if (!validId(stage.id) || stageIds.has(stage.id)
                || !['available', 'active', 'completed', 'failed'].includes(String(stage.status))
                || !nonempty(stage.label, 40) || !nonempty(stage.objective, 80)) {
                throw new Error(`任务阶段无效：${quest.id}/${String(stage.id ?? stageIndex)}`);
            }
            stageIds.add(stage.id);
            return { id: stage.id, status: stage.status as QuestStageStatus, label: stage.label.trim(), objective: stage.objective.trim() };
        });
        return { id: quest.id, title: quest.title.trim(), summary: quest.summary.trim(), actorIds: [...quest.actorIds] as string[], stages };
    });
    return { schemaVersion: 1, quests };
}

export function questJournalEntries(catalog: QuestCatalog, questStages: Record<string, string> = {}): QuestJournalEntry[] {
    const byId = new Map(catalog.quests.map(quest => [quest.id, quest]));
    const entries = Object.entries(questStages).map(([questId, stageId]): QuestJournalEntry => {
        const quest = byId.get(questId);
        const stage = quest?.stages.find(item => item.id === stageId);
        if (!quest || !stage) return {
            questId, stageId, title: '任务资料已变更', summary: '当前任务进度与内容版本不匹配。',
            status: 'unknown', stageLabel: '无法读取进度', objective: '请检查任务内容或存档版本。',
        };
        return { questId, stageId, title: quest.title, summary: quest.summary, status: stage.status,
            stageLabel: stage.label, objective: stage.objective };
    });
    const order: Record<QuestJournalEntry['status'], number> = { active: 0, available: 1, unknown: 2, completed: 3, failed: 4 };
    return entries.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title));
}

/** Phaser's default word wrap does not split an unspaced Chinese sentence. */
export function wrapQuestJournalText(value: string, maxUnits = 20): string {
    const lines: string[] = [];
    let line = '';
    let units = 0;
    for (const character of value) {
        if (character === '\n') { lines.push(line); line = ''; units = 0; continue; }
        const width = /^[\u0000-\u007f]$/u.test(character) ? 1 : 2;
        if (line && units + width > maxUnits) { lines.push(line); line = ''; units = 0; }
        line += character;
        units += width;
    }
    if (line) lines.push(line);
    return lines.join('\n');
}
