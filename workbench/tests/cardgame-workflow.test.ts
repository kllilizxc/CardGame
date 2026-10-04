import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkflowService,
  WorkflowConflictError,
  WorkflowRequestIdReuseError,
  type WorkflowConnectionReceipt,
  type WorkflowStoreStatus,
} from "../plugins/cardgame-content/src/workflow";
import { adoptAsset, receiveResult, registerCandidates, rejectCandidate } from "../templates/cardgame-production/actions";
import { createTodo, productionRequest } from "../templates/cardgame-todo/actions";

let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "cardgame-workflow-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function service(dataRoot = root) {
  return createWorkflowService({ dataRoot, projects: [{ id: "project-a", root: "/trusted/cardgame" }] });
}

function actionContext(workflow: ReturnType<typeof service>, calls: Array<Record<string, unknown>>, connections: any = {}, published: Array<{ name: string; payload: any; options: any }> = []) {
  return {
    note: { id: "cardgame-production" },
    store: { read: async () => ({ value: { projectId: "project-a" }, revision: "config-1" }) },
    connections,
    events: { publish: async (name: string, payload: any, options: any) => {
      published.push({ name, payload, options });
      return { id: `event-${published.length}`, duplicate: false };
    } },
    extensions: {
      request: async (_extension: string, method: string, input: Record<string, unknown>) => {
        calls.push({ method, input });
        return workflow.command(method, input);
      },
    },
  } as any;
}

describe("CardGame workflow backing", () => {
  it("keeps Todo pages bounded and follows a stable cursor", async () => {
    const workflow = service();
    for (let index = 0; index < 205; index += 1) {
      await workflow.command("createTodo", { projectId: "project-a", id: `todo-${String(index).padStart(3, "0")}`, title: `任务 ${index}` });
    }
    const first = await workflow.query({ op: "todos", projectId: "project-a", limit: 500 }) as any;
    expect(first.items).toHaveLength(100);
    expect(first.limit).toBe(100);
    expect(first.nextCursor).toBeString();
    const second = await workflow.query({ op: "todos", projectId: "project-a", limit: 100, cursor: first.nextCursor }) as any;
    expect(second.items).toHaveLength(100);
    const secondIds = new Set(second.items.map((item: any) => item.id));
    expect(first.items.some((item: any) => secondIds.has(item.id))).toBe(false);
    const third = await workflow.query({ op: "todos", projectId: "project-a", limit: 100, cursor: second.nextCursor }) as any;
    expect(third.items).toHaveLength(5);
    expect(third.nextCursor).toBeUndefined();
    await workflow.close();
  });

  it("deduplicates production drafts by stable todoId", async () => {
    const workflow = service();
    const first = await workflow.command("upsertProduction", { projectId: "project-a", todoId: "todo-1", brief: "角色头像" }) as any;
    const second = await workflow.command("upsertProduction", { projectId: "project-a", todoId: "todo-1", brief: "角色头像的更新版" }) as any;
    expect(second.created).toBe(false);
    expect(second.production.id).toBe(first.production.id);
    const page = await workflow.query({ op: "productions", projectId: "project-a" }) as any;
    expect(page.items).toHaveLength(1);
    expect(page.items[0].brief).toBe("角色头像的更新版");
    await workflow.close();
  });

  it("rejects CAS conflicts without replacing the current requirement", async () => {
    const workflow = service();
    const created = await workflow.command("createTodo", { projectId: "project-a", id: "stable", title: "原始标题" }) as any;
    const edited = await workflow.command("updateTodo", { projectId: "project-a", id: "stable", baseRevision: created.revision, patch: { title: "用户的并发修改" } }) as any;
    await expect(workflow.command("updateTodo", { projectId: "project-a", id: "stable", baseRevision: created.revision, patch: { title: "旧客户端覆盖" } })).rejects.toBeInstanceOf(WorkflowConflictError);
    const feedback = await workflow.command("todoFeedback", { projectId: "project-a", itemId: "stable", requirementRevision: 1, status: "in_progress", conclusion: "执行台已回报" }) as any;
    expect(feedback.item.title).toBe("用户的并发修改");
    expect(feedback.requirementChanged).toBe(true);
    expect(edited.item.title).toBe("用户的并发修改");
    await workflow.close();
  });

  it("marks old production results stale and deduplicates repeated receipts", async () => {
    const workflow = service();
    const created = await workflow.command("upsertProduction", { projectId: "project-a", id: "production-1", brief: "背景图" }) as any;
    const first = await workflow.command("reserveProduction", { projectId: "project-a", productionId: created.production.id, requestId: "request-1" }) as any;
    const oldResult = { projectId: "project-a", productionId: created.production.id, requestId: "request-1", round: 1, revision: first.round.requirementRevision, status: "completed", conclusion: "第一轮" };
    expect((await workflow.command("productionResult", oldResult) as any).accepted).toBe(true);
    expect((await workflow.command("productionResult", oldResult) as any).duplicate).toBe(true);
    const second = await workflow.command("reserveProduction", { projectId: "project-a", productionId: created.production.id, newRound: true, requestId: "request-2" }) as any;
    const stale = await workflow.command("productionResult", oldResult) as any;
    expect(stale.stale).toBe(true);
    expect(stale.production.rounds.at(-1).requestId).toBe(second.requestId);
    const current = await workflow.command("productionResult", { projectId: "project-a", productionId: created.production.id, requestId: "request-2", round: 2, revision: second.round.requirementRevision, status: "completed", conclusion: "第二轮" }) as any;
    expect(current.accepted).toBe(true);
    await workflow.close();
  });

  it("prepares one durable requestId for event retries and rejects changed reuse", async () => {
    const workflow = service();
    await workflow.command("createTodo", { projectId: "project-a", id: "todo-1", title: "修复缺陷" });
    const first = await workflow.command("delegateTodo", { projectId: "project-a", itemId: "todo-1", requestId: "repair-1", goal: "修复" }) as any;
    const second = await workflow.command("delegateTodo", { projectId: "project-a", itemId: "todo-1", requestId: "repair-1", goal: "修复" }) as any;
    expect(first.requestId).toBe("repair-1");
    expect(second.requestId).toBe("repair-1");
    expect(first.pending && second.pending).toBe(true);
    expect(second.payload).toEqual(first.payload);
    await expect(workflow.command("delegateTodo", { projectId: "project-a", itemId: "todo-1", requestId: "repair-1", goal: "完全不同的工作" })).rejects.toBeInstanceOf(WorkflowRequestIdReuseError);
    await workflow.close();
  });

  it("queues exact generation candidates, then records library-owned identities", async () => {
    const workflow = service();
    const created = await workflow.command("upsertProduction", { projectId: "project-a", id: "production-actions-1", brief: "候选登记" }) as any;
    const reserved = await workflow.command("reserveProduction", { projectId: "project-a", productionId: created.production.id, requestId: "generation-actions-1" }) as any;
    const published: Array<{ name: string; payload: any; options: any }> = [];
    const extensionCalls: Array<Record<string, unknown>> = [];
    const ctx = actionContext(workflow, extensionCalls, {}, published);
    const input = { projectId: "project-a", productionId: created.production.id, requestId: reserved.requestId, round: reserved.round.round, revision: reserved.round.requirementRevision, status: "completed", candidateRefs: [{ sourcePath: "incoming/generated.png", name: "generated.png" }] };
    const first = await receiveResult(input, ctx);
    expect(first.assetRegistration?.status).toBe("queued");
    if (first.assetRegistration?.status !== "queued") throw new Error("Candidate registration was not queued");
    expect(published).toHaveLength(1);
    expect(published[0].name).toBe("cardgame.production.candidatesRequested");
    const candidatePayload = published[0].payload;
    expect(candidatePayload.projectId).toBe("project-a");
    expect(candidatePayload.candidates[0].sourcePath).toBe("incoming/generated.png");
    expect(candidatePayload.candidates[0].id).toStartWith("candidate:");
    let detail = await workflow.query({ op: "production", projectId: "project-a", id: created.production.id }) as any;
    expect(detail.production.candidateRegistration).toBeUndefined();
    await workflow.command("recordCandidates", { projectId: "project-a", productionId: created.production.id, round: reserved.round.round,
      requestId: first.assetRegistration.requestId, candidates: [{ id: "backend-candidate-1", title: "生成图", path: "candidates/project-a/backend-candidate-1/generated.png", revision: "rev-1", mimeType: "image/png" }] });
    detail = await workflow.query({ op: "production", projectId: "project-a", id: created.production.id }) as any;
    expect(detail.production.candidateRefs.some((candidate: any) => candidate.id === "backend-candidate-1")).toBe(true);
    expect(detail.production.candidateRegistration.status).toBe("completed");
    await receiveResult(input, ctx);
    expect(published).toHaveLength(1);
    await workflow.command("reserveProduction", { projectId: "project-a", productionId: created.production.id, newRound: true, requestId: "generation-actions-2" });
    await receiveResult(input, ctx);
    expect(published).toHaveLength(1);
    await workflow.close();
  });

  it("does not record adoption until the Skill relation returns exact IDs", async () => {
    const workflow = service();
    const created = await workflow.command("upsertProduction", { projectId: "project-a", id: "production-actions-2", brief: "采用候选" }) as any;
    await workflow.command("recordCandidates", { projectId: "project-a", productionId: created.production.id, candidates: [{ id: "candidate-adopt-1", sourcePath: "incoming/candidate.png" }] });
    const published: Array<{ name: string; payload: any; options: any }> = [];
    const ctx = actionContext(workflow, [], {}, published);
    const queued = await adoptAsset({ projectId: "project-a", productionId: created.production.id, candidateId: "candidate-adopt-1" }, ctx);
    expect(queued.status).toBe("queued");
    let detail = await workflow.query({ op: "production", projectId: "project-a", id: created.production.id }) as any;
    expect(detail.production.adoption).toBeUndefined();
    const adopted = await workflow.command("recordAdoption", { projectId: "project-a", productionId: created.production.id,
      candidateId: "candidate-adopt-1", assetId: "asset-backend-2", versionId: "version-backend-2", requestId: queued.requestId }) as any;
    expect(adopted.production.adoption.assetId).toBe("asset-backend-2");
    expect(adopted.production.adoption.version).toBe("version-backend-2");
    expect(published[0].payload.candidateId).toBe("candidate-adopt-1");
    detail = await workflow.query({ op: "production", projectId: "project-a", id: created.production.id }) as any;
    expect(detail.production.status).toBe("adopted");
    await workflow.close();
  });

  it("keeps submit completion separate from generation completion", async () => {
    const workflow = service();
    const created = await workflow.command("upsertProduction", { projectId: "project-a", id: "production-actions-3", brief: "执行台状态" }) as any;
    const reserved = await workflow.command("reserveProduction", { projectId: "project-a", productionId: created.production.id, requestId: "generation-actions-3" }) as any;
    const bound = await workflow.command("bindProduction", { projectId: "project-a", productionId: created.production.id, requestId: reserved.requestId, receipt: { status: "completed", result: { taskId: "desk-task-3" } } }) as any;
    expect(bound.production.status).toBe("running");
    expect(bound.production.rounds.at(-1).status).toBe("running");
    expect(bound.production.execution.transportStatus).toBe("completed");
    expect(bound.production.execution.status).toBe("running");
    await workflow.close();
  });

  it("publishes a Todo production request without creating a draft or running AI", async () => {
    const workflow = service();
    const extensionCalls: Array<Record<string, unknown>> = [];
    const published: Array<{ name: string; payload: any; options: any }> = [];
    const result = await productionRequest({ projectId: "project-a", todoId: "todo-resource-1", brief: "资源引用草稿", context: { projectId: "project-a", kind: "asset", id: "asset-1", revision: "v3" } }, actionContext(workflow, extensionCalls, {}, published));
    expect(result.status).toBe("queued");
    expect(published).toHaveLength(1);
    expect(published[0].name).toBe("cardgame.todo.productionRequested");
    expect(published[0].payload.businessKey).toBe("todo:project-a:todo-resource-1");
    expect(extensionCalls).toHaveLength(0);
    expect((await workflow.query({ op: "productions", projectId: "project-a" }) as any).items).toHaveLength(0);
    await workflow.close();
  });

  it("saves a cg draft context without submitting execution", async () => {
    const workflow = service();
    const extensionCalls: Array<Record<string, unknown>> = [];
    const connectionCalls: Array<{ key: string; input: any; options?: any }> = [];
    const connections = {
      get: async (key: string) => ({ id: key, enabled: true, effectivePaused: false }),
      invoke: async (key: string, input: any, options?: any): Promise<WorkflowConnectionReceipt> => {
        connectionCalls.push({ key, input, options });
        return { status: "completed", result: {} };
      },
    };
    const context = { projectId: "project-a", kind: "asset", id: "asset-draft-1", revision: "v7" };
    const created = await createTodo({ projectId: "project-a", title: "处理资源草稿", context }, actionContext(workflow, extensionCalls, connections));
    expect(created.item.context).toEqual(context);
    expect(extensionCalls).toHaveLength(1);
    expect(extensionCalls[0].method).toBe("createTodo");
    expect(connectionCalls).toHaveLength(0);
    await workflow.close();
  });

  it("retains facts across service restarts and imports legacy rows idempotently", async () => {
    const first = service();
    const imported = await first.command("importTodos", { projectId: "project-a", items: [{ id: "legacy-1", title: "旧记录", status: "todo" }] }) as any;
    expect(imported.imported).toBe(1);
    await first.close();
    const second = service();
    const repeated = await second.command("importTodos", { projectId: "project-a", items: [{ id: "legacy-1", title: "旧记录", status: "todo" }] }) as any;
    expect(repeated.imported).toBe(0);
    expect(repeated.skipped).toBe(1);
    const detail = await second.query({ op: "todo", projectId: "project-a", id: "legacy-1" }) as any;
    expect(detail.item.title).toBe("旧记录");
    await second.close();
  });

  it("marks a rejected candidate and opens a high-priority rework Todo", async () => {
    const workflow = service();
    await workflow.command("upsertProduction", { projectId: "project-a", id: "production-reject-1", brief: "角色立绘" });
    const registered = await workflow.command("recordCandidates", { projectId: "project-a", productionId: "production-reject-1", candidates: [{ id: "candidate-1", sourcePath: "incoming/a.png", assetId: "asset-1" }, { id: "candidate-2", sourcePath: "incoming/b.png" }] }) as any;
    const rejected = await workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-1", candidateId: "candidate-1", baseRevision: registered.production.revision, reason: "色调不对", requestId: "reject-1" }) as any;
    expect(rejected.todoId).toBeString();
    const marked = rejected.production.candidateRefs.find((item: any) => item.id === "candidate-1");
    expect(marked.rejectedAt).toBeString();
    expect(marked.rejectReason).toBe("色调不对");
    expect(rejected.production.candidateRefs.find((item: any) => item.id === "candidate-2").rejectedAt).toBeUndefined();
    expect(rejected.production.revision).toBe(registered.production.revision + 1);
    const todo = await workflow.query({ op: "todo", projectId: "project-a", id: rejected.todoId }) as any;
    expect(todo.item.title).toBe("返修：角色立绘");
    expect(todo.item.priority).toBe("high");
    expect(todo.item.category).toBe("返修");
    expect(todo.item.status).toBe("todo");
    expect(todo.item.productionId).toBe("production-reject-1");
    expect(todo.item.context).toEqual({ projectId: "project-a", kind: "production", id: "production-reject-1" });
    expect(todo.item.description).toContain("色调不对");
    expect(todo.item.description).toContain("asset-1");
    await workflow.close();
  });

  it("enforces baseRevision, requestId idempotency, and known candidates on rejection", async () => {
    const workflow = service();
    await workflow.command("upsertProduction", { projectId: "project-a", id: "production-reject-2", brief: "背景返修" });
    const registered = await workflow.command("recordCandidates", { projectId: "project-a", productionId: "production-reject-2", candidates: [{ id: "candidate-1", sourcePath: "incoming/a.png" }] }) as any;
    await expect(workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "candidate-1" })).rejects.toBeInstanceOf(WorkflowConflictError);
    await expect(workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "candidate-1", baseRevision: registered.production.revision + 1 })).rejects.toBeInstanceOf(WorkflowConflictError);
    await expect(workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "missing", baseRevision: registered.production.revision })).rejects.toMatchObject({ code: "not-found" });
    const first = await workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "candidate-1", baseRevision: registered.production.revision, reason: "重做", requestId: "reject-2" }) as any;
    const detail = await workflow.query({ op: "production", projectId: "project-a", id: "production-reject-2" }) as any;
    const second = await workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "candidate-1", baseRevision: detail.production.revision, reason: "重做", requestId: "reject-2" }) as any;
    expect(second.todoId).toBe(first.todoId);
    const todos = await workflow.query({ op: "todos", projectId: "project-a" }) as any;
    expect(todos.items).toHaveLength(1);
    await expect(workflow.command("rejectCandidate", { projectId: "project-a", productionId: "production-reject-2", candidateId: "candidate-1", baseRevision: detail.production.revision, reason: "另一个原因", requestId: "reject-2" })).rejects.toBeInstanceOf(WorkflowRequestIdReuseError);
    await workflow.close();
  });

  it("routes candidate rejection through the production note action", async () => {
    const workflow = service();
    await workflow.command("upsertProduction", { projectId: "project-a", id: "production-reject-3", brief: "音效返修" });
    const registered = await workflow.command("recordCandidates", { projectId: "project-a", productionId: "production-reject-3", candidates: [{ id: "candidate-1", sourcePath: "incoming/a.wav" }] }) as any;
    const extensionCalls: Array<Record<string, unknown>> = [];
    const connections = {
      get: async (key: string) => ({ id: key, enabled: true, effectivePaused: false }),
      invoke: async (): Promise<WorkflowConnectionReceipt> => ({ status: "completed", result: {} }),
    };
    const result = await rejectCandidate({ projectId: "project-a", productionId: "production-reject-3", candidateId: "candidate-1", baseRevision: registered.production.revision, reason: "杂音" }, actionContext(workflow, extensionCalls, connections));
    expect(result.todoId).toBeString();
    expect(extensionCalls).toHaveLength(1);
    expect(extensionCalls[0].method).toBe("rejectCandidate");
    expect(extensionCalls[0].input).toMatchObject({ projectId: "project-a", productionId: "production-reject-3", candidateId: "candidate-1", reason: "杂音", requestId: "reject-candidate:project-a:production-reject-3:candidate-1" });
    await expect(rejectCandidate({ projectId: "project-a", productionId: "production-reject-3", candidateId: "", baseRevision: registered.production.revision }, actionContext(workflow, [], connections))).rejects.toThrow("rejectCandidate 需要 candidateId");
    await workflow.close();
  });

  it("keeps indexed counts and bounded pages at the 10k Todo/production scale", async () => {
    const workflow = service();
    const total = 10_000;
    const legacyItems = Array.from({ length: total }, (_, index) => ({
      id: `scale-todo-${String(index).padStart(5, "0")}`,
      title: `规模验收 Todo ${index}`,
      status: "todo",
    }));
    const imported = await workflow.command("importTodos", { projectId: "project-a", items: legacyItems }) as any;
    expect(imported.imported).toBe(total);

    const productionItems = Array.from({ length: total }, (_, index) => ({
      id: `scale-production-${String(index).padStart(5, "0")}`,
      todoId: `scale-todo-${String(index).padStart(5, "0")}`,
      brief: `规模验收素材 ${index}`,
    }));
    const productions = await workflow.command("importProductions", { projectId: "project-a", items: productionItems }) as any;
    expect(productions.imported).toBe(total);

    const todoPage = await workflow.query({ op: "todos", projectId: "project-a", limit: 100 }) as any;
    const productionPage = await workflow.query({ op: "productions", projectId: "project-a", limit: 100 }) as any;
    expect(todoPage.items).toHaveLength(100);
    expect(todoPage.total).toBe(total);
    expect(productionPage.items).toHaveLength(100);
    expect(productionPage.total).toBe(total);
    expect(todoPage.nextCursor).toBeString();
    expect(productionPage.nextCursor).toBeString();

    const status = await workflow.query({ op: "workflowStatus", projectId: "project-a" }) as any;
    expect(status.counts.todos).toBe(total);
    expect(status.counts.todo).toBe(total);
    expect(status.counts.productions).toBe(total);
    expect(status.counts.productionDrafts).toBe(total);
    await workflow.close();
  }, 120_000);
});

describe("CardGame workflow store status", () => {
  const projects = [{ id: "project-a", root: "/trusted/cardgame" }];

  it("reports sqlite-ready on a healthy open", async () => {
    const events: WorkflowStoreStatus[] = [];
    const workflow = createWorkflowService({ dataRoot: root, projects, onStoreStatus: event => events.push(event) });
    await workflow.query({ op: "todos", projectId: "project-a" });
    expect(events.map(event => event.kind)).toEqual(["sqlite-ready"]);
    await workflow.close();
  });

  it("reports SQLite open failure and keeps serving through the JSON fallback", async () => {
    await mkdir(join(root, "cardgame-workflow.sqlite"));
    const events: WorkflowStoreStatus[] = [];
    const workflow = createWorkflowService({ dataRoot: root, projects, onStoreStatus: event => events.push(event) });
    await workflow.command("createTodo", { projectId: "project-a", id: "todo-degraded", title: "降级写入" });
    expect(events.map(event => event.kind)).toEqual(["sqlite-open-failed"]);
    await workflow.close();
    const mirror = JSON.parse(await readFile(join(root, "cardgame-workflow.json"), "utf8")) as any;
    expect(Object.keys(mirror.todos)).toHaveLength(1);
    expect((Object.values(mirror.todos)[0] as any).title).toBe("降级写入");

    await rm(join(root, "cardgame-workflow.sqlite"), { recursive: true });
    const recovered: WorkflowStoreStatus[] = [];
    const next = createWorkflowService({ dataRoot: root, projects, onStoreStatus: event => recovered.push(event) });
    await next.query({ op: "todos", projectId: "project-a" });
    expect(recovered.map(event => event.kind)).toEqual(["sqlite-ready", "fallback-diverged"]);
    await next.close();
  });
});
