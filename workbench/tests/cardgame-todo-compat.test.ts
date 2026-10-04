import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addTodo,
  clearCompleted,
  editTodo,
  generateSuggestions,
  removeTodo,
  toggleTodo,
  updateStatus,
} from "../templates/cardgame-todo/actions";
import { createWorkflowService, WorkflowConflictError } from "../plugins/cardgame-content/src/workflow";

let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "cardgame-todo-compat-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function service() {
  return createWorkflowService({ dataRoot: root, projects: [{ id: "project-a", root: "/trusted/cardgame" }] });
}

function actionContext(workflow: ReturnType<typeof service>, agent?: any) {
  return {
    note: { id: "cardgame-todo" },
    store: { read: async () => ({ value: { projectId: "project-a" }, revision: "config-1" }) },
    resources: { read: async (request: any) => ({ data: await workflow.query(request.input), stale: false }) },
    extensions: { request: async (_extension: string, method: string, input: Record<string, unknown>) => workflow.command(method, input) },
    agent: agent ?? {
      infer: async () => ({ id: "run-1" }),
      result: async () => ({ status: "completed", text: "[]" }),
    },
  } as any;
}

describe("CardGame Todo legacy action compatibility", () => {
  it("uses durable revisions for legacy edits, status changes, and fixed clear lists", async () => {
    const workflow = service();
    const ctx = actionContext(workflow);
    const created = await addTodo({ title: "原始需求", description: "验收", category: "开发" }, ctx);
    const edited = await editTodo({ itemId: created.item.id, title: "更新需求", description: "新的验收", base: { title: "原始需求", description: "验收" } }, ctx);
    expect(edited.item.title).toBe("更新需求");

    const done = await addTodo({ title: "已完成", status: "done" }, ctx);
    const untouched = await addTodo({ title: "未加载的已完成", status: "done" }, ctx);
    const doneDetail = await workflow.query({ op: "todo", projectId: "project-a", id: done.item.id }) as any;
    const untouchedDetail = await workflow.query({ op: "todo", projectId: "project-a", id: untouched.item.id }) as any;
    const cleared = await clearCompleted({ items: [{ id: done.item.id, baseRevision: doneDetail.item.revision }] }, ctx);
    expect(cleared.removedCount).toBe(1);
    await expect(workflow.query({ op: "todo", projectId: "project-a", id: done.item.id })).rejects.toThrow("找不到 Todo");
    expect((await workflow.query({ op: "todo", projectId: "project-a", id: untouched.item.id }) as any).item.revision).toBe(untouchedDetail.item.revision);

    const editedDetail = await workflow.query({ op: "todo", projectId: "project-a", id: edited.item.id }) as any;
    const moved = await updateStatus({ id: edited.item.id, status: "done", baseRevision: editedDetail.item.revision }, ctx);
    const reopened = await toggleTodo({ id: edited.item.id, baseRevision: moved.item.revision }, ctx);
    expect(reopened.item.status).toBe("todo");
    await removeTodo({ id: edited.item.id, baseRevision: reopened.item.revision }, ctx);
    await expect(workflow.query({ op: "todo", projectId: "project-a", id: edited.item.id })).rejects.toThrow("找不到 Todo");
    await workflow.close();
  });

  it("rejects stale legacy edit bases before overwriting the durable requirement", async () => {
    const workflow = service();
    const ctx = actionContext(workflow);
    const created = await addTodo({ title: "原始标题" }, ctx);
    await workflow.command("updateTodo", { projectId: "project-a", id: created.item.id, baseRevision: created.item.revision, patch: { title: "并发标题" } });
    await expect(editTodo({ itemId: created.item.id, title: "旧客户端覆盖", base: { title: "原始标题", description: "" } }, ctx)).rejects.toThrow("该需求已被修改");
    await expect(workflow.command("updateTodo", { projectId: "project-a", id: created.item.id, baseRevision: created.item.revision, patch: { title: "再次覆盖" } })).rejects.toBeInstanceOf(WorkflowConflictError);
    await workflow.close();
  });

  it("reads all Todo pages before generating deduplicated durable suggestions", async () => {
    const workflow = service();
    await workflow.command("importTodos", {
      projectId: "project-a",
      items: Array.from({ length: 101 }, (_, index) => ({ id: `legacy-${index}`, title: index === 100 ? "第二页已有" : `已有 ${index}` })),
    });
    const agent = {
      infer: async () => ({ id: "run-1" }),
      result: async () => ({ status: "completed", text: JSON.stringify([
        { title: "第二页已有", category: "开发", priority: "high", status: "todo" },
        { title: "新增建议", category: "开发", priority: "medium", status: "in_progress" },
      ]) }),
    };
    const result = await generateSuggestions({ prompt: "继续迭代" }, actionContext(workflow, agent));
    expect(result.addedCount).toBe(1);
    expect((await workflow.query({ op: "todos", projectId: "project-a", limit: 100 }) as any).total).toBe(102);
    await workflow.close();
  });

  it("keeps pasted images in durable requirements and checks concurrent edits", async () => {
    const workflow = service();
    const ctx = actionContext(workflow);
    const image = { id: "screenshot-1", dataUrl: "data:image/png;base64,aGVsbG8=", name: "screenshot.png", type: "image/png" as const };
    const created = await addTodo({ title: "截图需求", images: [image] }, ctx);
    expect(created.item.images).toEqual([image]);
    const delegated = await workflow.command("delegateTodo", { projectId: "project-a", itemId: created.item.id, requestId: "image-request" }) as any;
    expect(delegated.payload.requirement.images).toEqual([image]);
    await workflow.close();
    const reopened = service();
    const storedImage = await reopened.query({ op: "todo", projectId: "project-a", id: created.item.id }) as any;
    expect(storedImage.item.images).toEqual([image]);
    const reopenedCtx = actionContext(reopened);
    const edited = await editTodo({ itemId: created.item.id, title: "截图需求", images: [], base: { title: "截图需求", images: [image] } }, reopenedCtx);
    expect(edited.item.images).toBeUndefined();
    expect(edited.item.requirementRevision).toBe(created.item.requirementRevision + 1);
    await expect(editTodo({ itemId: created.item.id, title: "旧图片", images: [image], base: { title: "截图需求", images: [image] } }, reopenedCtx)).rejects.toThrow("该需求已被修改");
    await expect(addTodo({ title: "无效附件", images: [{ ...image, dataUrl: "data:text/plain;base64,aGVsbG8=" }] }, reopenedCtx)).rejects.toThrow("仅支持 PNG");
    const stored = await reopened.query({ op: "todo", projectId: "project-a", id: created.item.id }) as any;
    expect(stored.item.images).toBeUndefined();
    expect(stored.item.requirementRevision).toBe(edited.item.requirementRevision);
    await reopened.close();
  });

  it("does not delete a Todo while its execution binding is active", async () => {
    const workflow = service();
    const created = await workflow.command("createTodo", { projectId: "project-a", title: "执行中的任务" }) as any;
    const running = await workflow.command("todoFeedback", { projectId: "project-a", itemId: created.item.id, execution: { delegationId: "desk-task", status: "running" } }) as any;
    await expect(workflow.command("deleteTodo", { projectId: "project-a", id: created.item.id, baseRevision: running.item.revision })).rejects.toThrow("无法删除");
    const completed = await workflow.command("todoFeedback", { projectId: "project-a", itemId: created.item.id, execution: { status: "completed" } }) as any;
    const deleted = await workflow.command("deleteTodo", { projectId: "project-a", id: created.item.id, baseRevision: completed.item.revision }) as any;
    expect(deleted.deleted).toBe(true);
    await workflow.close();
  });
});
