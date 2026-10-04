/** The authoring format uses the same condition/effect objects as CardGame's playable StoryState graph. */
type Rule = Record<string, unknown>;

function record(value: unknown, label: string): Rule {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
  }
  return value as Rule;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空文本。`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} 必须是有限数值。`);
  return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${label} 必须是布尔值。`);
  return value;
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组。`);
  return value;
}

export function parseStoryRuleJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`${label} 不是有效 JSON。`);
  }
}

export function validateStoryCondition(value: unknown, label: string): Rule {
  const input = record(value, label);
  const kind = string(input.kind, `${label}.kind`);
  switch (kind) {
    case 'always':
      return { kind };
    case 'attribute':
    case 'relation': {
      const operator = string(input.operator, `${label}.operator`);
      if (!['>', '>=', '<', '<=', '==', '!='].includes(operator)) throw new Error(`${label}.operator 不受支持。`);
      return { kind, [kind === 'attribute' ? 'attribute' : 'relationId']: string(input[kind === 'attribute' ? 'attribute' : 'relationId'], `${label}.${kind === 'attribute' ? 'attribute' : 'relationId'}`), operator, value: number(input.value, `${label}.value`) };
    }
    case 'actorAbility': {
      const operator = string(input.operator, `${label}.operator`);
      if (!['>', '>=', '<', '<=', '==', '!='].includes(operator)) throw new Error(`${label}.operator 不受支持。`);
      return { kind, actorId: string(input.actorId, `${label}.actorId`), ability: string(input.ability, `${label}.ability`), operator, value: number(input.value, `${label}.value`) };
    }
    case 'itemCount': {
      const operator = string(input.operator, `${label}.operator`);
      const value = number(input.value, `${label}.value`);
      if (!['>', '>=', '<', '<=', '==', '!='].includes(operator)) throw new Error(`${label}.operator 不受支持。`);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}.value 必须是非负整数。`);
      return { kind, itemId: string(input.itemId, `${label}.itemId`), operator, value };
    }
    case 'knowledge':
      return { kind, actorId: string(input.actorId, `${label}.actorId`), knowledgeId: string(input.knowledgeId, `${label}.knowledgeId`), ...(optionalBoolean(input.expected, `${label}.expected`) === undefined ? {} : { expected: input.expected }) };
    case 'questStage':
      return { kind, questId: string(input.questId, `${label}.questId`), stage: string(input.stage, `${label}.stage`) };
    case 'flag':
      return { kind, flag: string(input.flag, `${label}.flag`), ...(optionalBoolean(input.expected, `${label}.expected`) === undefined ? {} : { expected: input.expected }) };
    case 'visitedNode':
      return { kind, nodeId: string(input.nodeId, `${label}.nodeId`), ...(optionalBoolean(input.expected, `${label}.expected`) === undefined ? {} : { expected: input.expected }) };
    case 'triggeredDialogue':
      return { kind, dialogueId: string(input.dialogueId, `${label}.dialogueId`), ...(optionalBoolean(input.expected, `${label}.expected`) === undefined ? {} : { expected: input.expected }) };
    case 'all':
    case 'any': {
      const conditions = requiredArray(input.conditions, `${label}.conditions`);
      if (!conditions.length) throw new Error(`${label}.conditions 不能为空。`);
      return { kind, conditions: conditions.map((condition, index) => validateStoryCondition(condition, `${label}.conditions[${index}]`)) };
    }
    case 'not':
      return { kind, condition: validateStoryCondition(input.condition, `${label}.condition`) };
    default:
      throw new Error(`${label}.kind 不受支持：${kind}。`);
  }
}

function validateBattle(value: unknown, label: string): Rule {
  const input = record(value, label);
  const output: Rule = {
    battleId: string(input.battleId, `${label}.battleId`),
    encounterId: string(input.encounterId, `${label}.encounterId`),
    encounterFile: string(input.encounterFile, `${label}.encounterFile`),
    deckFile: string(input.deckFile, `${label}.deckFile`),
    onVictoryNodeId: string(input.onVictoryNodeId, `${label}.onVictoryNodeId`),
    onDefeatNodeId: string(input.onDefeatNodeId, `${label}.onDefeatNodeId`),
  };
  for (const field of ['encounterResourceId', 'deckResourceId', 'launchText'] as const) {
    if (input[field] !== undefined) output[field] = string(input[field], `${label}.${field}`);
  }
  if (input.deterministicBattleSetup !== undefined) {
    const setup = record(input.deterministicBattleSetup, `${label}.deterministicBattleSetup`);
    if (setup.deckOrder !== 'preserve-json-order') throw new Error(`${label}.deterministicBattleSetup.deckOrder 不受支持。`);
    output.deterministicBattleSetup = { deckOrder: setup.deckOrder };
  }
  return output;
}

export function validateStoryEffects(value: unknown, label: string): Rule[] {
  return requiredArray(value, label).map((entry, index) => {
    const at = `${label}[${index}]`;
    const input = record(entry, at);
    const kind = string(input.kind, `${at}.kind`);
    switch (kind) {
      case 'setFlag':
        return { kind, flag: string(input.flag, `${at}.flag`), ...(optionalBoolean(input.value, `${at}.value`) === undefined ? {} : { value: input.value }) };
      case 'clearFlag':
        return { kind, flag: string(input.flag, `${at}.flag`) };
      case 'recordVisitedNode':
      case 'goToNode':
        return { kind, nodeId: string(input.nodeId, `${at}.nodeId`) };
      case 'recordDialogue':
        return { kind, dialogueId: string(input.dialogueId, `${at}.dialogueId`) };
      case 'setAttribute':
        return { kind, attribute: string(input.attribute, `${at}.attribute`), value: number(input.value, `${at}.value`) };
      case 'adjustAttribute':
        return { kind, attribute: string(input.attribute, `${at}.attribute`), delta: number(input.delta, `${at}.delta`) };
      case 'setRelation':
        return { kind, relationId: string(input.relationId, `${at}.relationId`), value: number(input.value, `${at}.value`) };
      case 'adjustRelation':
        return { kind, relationId: string(input.relationId, `${at}.relationId`), delta: number(input.delta, `${at}.delta`) };
      case 'moveTo':
        return { kind, locationId: string(input.locationId, `${at}.locationId`), sublocationId: string(input.sublocationId, `${at}.sublocationId`), ...(input.nodeId === undefined ? {} : { nodeId: string(input.nodeId, `${at}.nodeId`) }) };
      case 'setLocationLabel':
        return { kind, location: string(input.location, `${at}.location`) };
      case 'learnKnowledge':
        return { kind, actorId: string(input.actorId, `${at}.actorId`), knowledgeId: string(input.knowledgeId, `${at}.knowledgeId`) };
      case 'setQuestStage':
        return { kind, questId: string(input.questId, `${at}.questId`), stage: string(input.stage, `${at}.stage`) };
      case 'grantCard': {
        const count = number(input.count, `${at}.count`);
        if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${at}.count 必须是正整数。`);
        return { kind, grantId: string(input.grantId, `${at}.grantId`), cardId: string(input.cardId, `${at}.cardId`), count };
      }
      case 'grantItem':
      case 'consumeItem': {
        const count = number(input.count, `${at}.count`);
        const itemType = string(input.itemType, `${at}.itemType`);
        if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${at}.count 必须是正整数。`);
        if (!['artifact', 'tool', 'consumable', 'material', 'quest'].includes(itemType)) throw new Error(`${at}.itemType 不受支持。`);
        return { kind, transactionId: string(input.transactionId, `${at}.transactionId`), itemId: string(input.itemId, `${at}.itemId`), itemType, count };
      }
      case 'once':
        return { kind, eventId: string(input.eventId, `${at}.eventId`), effects: validateStoryEffects(input.effects, `${at}.effects`) };
      case 'startBattle':
        return { kind, battle: validateBattle(input.battle, `${at}.battle`) };
      default:
        throw new Error(`${at}.kind 不受支持：${kind}。`);
    }
  });
}

export function validateStoryChoiceMetadata(value: unknown, label: string): Rule {
  const input = record(value, label);
  const output: Rule = { id: string(input.id, `${label}.id`) };
  if (input.description !== undefined) output.description = string(input.description, `${label}.description`);
  if (input.visibleWhen !== undefined) output.visibleWhen = validateStoryCondition(input.visibleWhen, `${label}.visibleWhen`);
  if (input.enabledWhen !== undefined) output.enabledWhen = validateStoryCondition(input.enabledWhen, `${label}.enabledWhen`);
  if (input.effects !== undefined) output.effects = validateStoryEffects(input.effects, `${label}.effects`);
  if (input.flags !== undefined) output.flags = requiredArray(input.flags, `${label}.flags`).map((flag, index) => string(flag, `${label}.flags[${index}]`));
  return output;
}

export function validateInitialStoryState(value: unknown, label: string): Rule {
  const input = record(value, label);
  const output: Rule = {};
  for (const field of ['attributes', 'relations'] as const) {
    if (input[field] === undefined) continue;
    const values = record(input[field], `${label}.${field}`);
    output[field] = Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, number(entry, `${label}.${field}.${key}`)]));
  }
  if (input.flags !== undefined) {
    const values = record(input.flags, `${label}.flags`);
    output.flags = Object.fromEntries(Object.entries(values).map(([key, entry]) => {
      if (typeof entry !== 'boolean') throw new Error(`${label}.flags.${key} 必须是布尔值。`);
      return [key, entry];
    }));
  }
  if (input.knowledge !== undefined) {
    const knowledge = record(input.knowledge, `${label}.knowledge`);
    output.knowledge = Object.fromEntries(Object.entries(knowledge).map(([actorId, ids]) => [actorId, requiredArray(ids, `${label}.knowledge.${actorId}`).map((id, index) => string(id, `${label}.knowledge.${actorId}[${index}]`))]));
  }
  if (input.questStages !== undefined) {
    const stages = record(input.questStages, `${label}.questStages`);
    output.questStages = Object.fromEntries(Object.entries(stages).map(([questId, stage]) => [questId, string(stage, `${label}.questStages.${questId}`)]));
  }
  if (input.settledEventIds !== undefined) output.settledEventIds = requiredArray(input.settledEventIds, `${label}.settledEventIds`).map((id, index) => string(id, `${label}.settledEventIds[${index}]`));
  return output;
}
