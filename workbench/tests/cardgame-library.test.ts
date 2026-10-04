import { describe, expect, test } from "bun:test";
import { adoptVersion, moveDocument, queries, registerCandidates, rejectAssetVersion, saveDocument, updateAsset, updateCard } from "../templates/cardgame-library/actions";
import { queries as productionQueries } from "../templates/cardgame-production/actions";
import { decodeContentRef, encodeContentRef, locateAssetForChange, recentChangesForMode, resolveRelativePath } from "../templates/cardgame-library/model";
import type { AssetItem, RecentChangeItem } from "../templates/cardgame-library/model";

function context(options: { data?: unknown; error?: string; config?: Record<string, unknown>; calls?: unknown[] } = {}) {
  const calls = options.calls ?? [];
  return {
    note: { id: "library-note" },
    store: { read: async () => ({ value: options.config ?? { projectId: "demo-project" }, revision: "config-1" }) },
    resources: {
      read: async (request: unknown) => {
        calls.push(request);
        return { key: "key", epoch: "test", version: 1, stale: false, data: options.data, error: options.error };
      },
    },
    extensions: { request: async (...args: unknown[]) => {
      calls.push(args);
      const input = args[2] as Record<string, unknown>;
      if (args[1] === "saveDocument") return { id: input.id, path: input.path, title: "新稿", content: input.content, revision: "saved-1" };
      if (args[1] === "moveDocument") return { source: { id: input.id, path: input.toPath, title: "新稿", content: "# 新稿", revision: "moved-1" }, toPath: input.toPath, affected: [], conflicts: [], canApply: true };
      if (args[1] === "updateCard") return { id: input.id, name: (input.card as Record<string, unknown>).name, revision: "card-1" };
      if (args[1] === "registerCandidates") return [{ id: "candidate-1", name: "sprite.png" }];
      return { id: input.id ?? input.assetId, name: input.name ?? "素材", currentVersionId: input.versionId, metadataRevision: "asset-1" };
    } },
  } as any;
}

describe("CardGame content codec", () => {
  test("round trips the shared cg deep link and keeps optional location fields", () => {
    const encoded = encodeContentRef({ projectId: "p/中文", kind: "document", id: "doc-1", path: "章节/开场.md", anchor: "问心", revision: "r2", intent: "backlinks", context: { assetId: "asset-1" } });
    expect(encoded.startsWith("cg:")).toBe(true);
    expect(decodeContentRef(encoded)).toEqual({ projectId: "p/中文", kind: "document", id: "doc-1", path: "章节/开场.md", anchor: "问心", revision: "r2", intent: "backlinks", context: { assetId: "asset-1" } });
    expect(decodeContentRef("cg:not-json")).toBeUndefined();
  });
});

describe("CardGame Markdown URL paths", () => {
  test("decodes Markdown URL paths once before resolving relative paths", () => {
    expect(resolveRelativePath("public/data/docs/cards-artifacts-index.md", "./%E5%89%91%E4%BF%AE%E5%8D%A1%E7%BB%84%E8%AE%BE%E8%AE%A1.md")).toBe("public/data/docs/剑修卡组设计.md");
    expect(resolveRelativePath("docs/index.md", "./space%20name.md")).toBe("docs/space name.md");
    expect(resolveRelativePath("docs/index.md", "./name%23part%25.md")).toBe("docs/name#part%.md");
    expect(resolveRelativePath("docs/index.md", "./nested/next.md")).toBe("docs/nested/next.md");
    expect(resolveRelativePath("docs/index.md", "./twice%2520encoded.md")).toBe("docs/twice%20encoded.md");
  });
});

describe("CardGame content queries", () => {
  test('card and production selectors use the official progress note on their desktop', async () => {
    const requests: unknown[] = [];
    const ctx = {
      note: { id: 'cards' },
      notes: {
        read: async () => ({ id: 'cards', desktopId: 'desktop-1' }),
        lookup: async () => [{ id: 'tracker', actions: ['setArchiveStatus', 'confirmGameCandidate'], archived: false }],
      },
      resources: { read: async (request: unknown) => { requests.push(request); return { data: { features: [{ id: 'f1', title: '灵狐卡牌', archived: false }] } }; } },
    } as any;
    expect(await queries.featureChoices({}, ctx)).toEqual({ items: [{ id: 'f1', title: '灵狐卡牌' }] });
    expect(await productionQueries.featureChoices({}, ctx)).toEqual({ items: [{ id: 'f1', title: '灵狐卡牌' }] });
    expect(requests).toEqual(Array(2).fill({ name: 'extension.official-feature-tracker.state', input: { targetNoteId: 'tracker' } }));
  });
  test("passes config projectId and op, then returns resource snapshot data", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls, data: { items: [{ id: "doc-1", title: "开场", path: "开场.md", revision: "r1" }], nextCursor: "next" } });
    const result = await queries.documents({ query: "开场", limit: 100 }, ctx);
    expect(result).toEqual({ items: [{ id: "doc-1", title: "开场", path: "开场.md", revision: "r1" }], nextCursor: "next" });
    expect(calls[0]).toEqual({ name: "extension.cardgame-content.query", input: { q: "开场", limit: 100, projectId: "demo-project", op: "documents" } });
  });

  test("keeps registered reference document query compatible", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls, data: { id: "design/index.md", title: "设计", path: "design/index.md", revision: "r1", content: "# 设计" } });
    const result = await queries.document({ resourcePath: "design", path: "index.md", from: "README.md" }, ctx);
    expect(result).toEqual({ id: "design/index.md", title: "设计", path: "design/index.md", revision: "r1", content: "# 设计" });
    expect(calls[0]).toEqual({ name: "extension.reference.file", input: { resourcePath: "design", path: "index.md", from: "README.md" } });
  });

  test("passes media identity and variant to the backend query", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls, data: { url: "https://capability/media", variant: "thumbnail" } });
    await queries.media({ id: "asset-1", path: "sprites/a.png", variant: "thumbnail" }, ctx);
    expect(calls[0]).toEqual({ name: "extension.cardgame-content.query", input: { id: "asset-1", path: "sprites/a.png", variant: "thumbnail", projectId: "demo-project", op: "media" } });
  });

  test("keeps asset or card reference backlinks path-only", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls, data: { items: [], nextCursor: null } });
    await queries.backlinks({ path: "sprites/hero.png", limit: 100 }, ctx);
    expect(calls[0]).toEqual({ name: "extension.cardgame-content.query", input: { path: "sprites/hero.png", limit: 100, projectId: "demo-project", op: "backlinks" } });
  });

  test("forwards inspection and recentChanges queries with their own parameters", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls, data: { findings: [], counts: {} } });
    await queries.inspection({ kinds: ["broken-link", "orphan-asset"], limit: 50 }, ctx);
    expect(calls[0]).toEqual({ name: "extension.cardgame-content.query", input: { kinds: ["broken-link", "orphan-asset"], limit: 50, projectId: "demo-project", op: "inspection" } });
    await queries.recentChanges({ since: "2026-09-18T00:00:00.000Z", limit: 100 }, ctx);
    expect(calls[1]).toEqual({ name: "extension.cardgame-content.query", input: { since: "2026-09-18T00:00:00.000Z", limit: 100, projectId: "demo-project", op: "recentChanges" } });
  });
});

describe("CardGame content commands", () => {
  test("forward commands with configured projectId and preserve CAS input", async () => {
    const calls: unknown[] = [];
    const ctx = context({ calls });
    await saveDocument({ id: "doc-1", path: "a.md", content: "# 新稿", revision: "r1" }, ctx);
    await moveDocument({ id: "doc-1", from: "a.md", to: "b.md", revision: "r2" }, ctx);
    await updateCard({ id: "card-1", value: { name: "新卡" }, revision: "r4" }, ctx);
    await updateAsset({ id: "asset-1", name: "新资源", tags: ["精选"], metadataRevision: "m1" }, ctx);
    await registerCandidates({ candidates: [{ name: "sprite.png", sourcePath: "/data/sprite.png" }] }, ctx);
    await adoptVersion({ assetId: "asset-1", versionId: "v2", revision: "r3" }, ctx);
    expect(calls).toEqual([
      ["cardgame-content", "saveDocument", { id: "doc-1", path: "a.md", content: "# 新稿", expectedRevision: "r1", projectId: "demo-project" }],
      ["cardgame-content", "moveDocument", { id: "doc-1", path: "a.md", toPath: "b.md", expectedRevision: "r2", updateLinks: true, projectId: "demo-project" }],
      ["cardgame-content", "updateCard", { id: "card-1", card: { name: "新卡" }, expectedRevision: "r4", projectId: "demo-project" }],
      ["cardgame-content", "updateAsset", { id: "asset-1", name: "新资源", tags: ["精选"], expectedMetadataRevision: "m1", projectId: "demo-project" }],
      ["cardgame-content", "registerCandidates", { candidates: [{ name: "sprite.png", sourcePath: "/data/sprite.png" }], projectId: "demo-project" }],
      ["cardgame-content", "adoptVersion", { assetId: "asset-1", versionId: "v2", projectId: "demo-project" }],
    ]);
  });
});

describe("CardGame asset version rejection", () => {
  function rejectionContext(options: { asset: Record<string, unknown>; versions: Array<Record<string, unknown>> }) {
    const calls: Array<unknown[]> = [];
    const reads: unknown[] = [];
    const ctx = {
      note: { id: "library-note" },
      store: { read: async () => ({ value: { projectId: "demo-project" }, revision: "config-1" }) },
      resources: {
        read: async (request: any) => {
          reads.push(request);
          const op = request?.input?.op;
          return { key: "key", epoch: "test", version: 1, stale: false, data: op === "asset" ? options.asset : { items: options.versions, nextCursor: null } };
        },
      },
      extensions: {
        request: async (...args: unknown[]) => {
          calls.push(args);
          return args[1] === "createTodo" ? { item: { id: "todo-rework-1" }, revision: 1 } : { accepted: true };
        },
      },
    } as any;
    return { ctx, calls, reads };
  }

  test("reverts to the most recent earlier adopted version and opens a rework Todo", async () => {
    const { ctx, calls } = rejectionContext({
      asset: { id: "asset-1", name: "立绘", currentVersionId: "version-3" },
      versions: [
        { id: "version-1", adopted: true, createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "version-3", adopted: true, createdAt: "2026-03-01T00:00:00.000Z" },
        { id: "version-2", adopted: true, createdAt: "2026-02-01T00:00:00.000Z" },
        { id: "version-0", adopted: false, createdAt: "2025-12-01T00:00:00.000Z" },
      ],
    });
    const result = await rejectAssetVersion({ assetId: "asset-1", reason: "颜色不对" }, ctx);
    expect(result).toEqual({ reverted: true, versionId: "version-2", todoId: "todo-rework-1" });
    expect(calls[0]).toEqual(["cardgame-content", "adoptVersion", { assetId: "asset-1", versionId: "version-2", projectId: "demo-project" }]);
    expect(calls[1][0]).toBe("cardgame-content");
    expect(calls[1][1]).toBe("createTodo");
    expect(calls[1][2]).toMatchObject({
      projectId: "demo-project",
      title: "返修：立绘",
      priority: "high",
      category: "返修",
      context: { projectId: "demo-project", kind: "asset", id: "asset-1" },
    });
    expect((calls[1][2] as Record<string, unknown>).description).toContain("颜色不对");
    expect((calls[1][2] as Record<string, unknown>).description).toContain("已回退到版本 version-2");
  });

  test("only opens a rework Todo when no earlier adopted version exists", async () => {
    const { ctx, calls } = rejectionContext({
      asset: { id: "asset-1", currentVersionId: "version-1" },
      versions: [{ id: "version-1", adopted: true, createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    const result = await rejectAssetVersion({ assetId: "asset-1" }, ctx);
    expect(result).toEqual({ reverted: false, todoId: "todo-rework-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("createTodo");
    expect((calls[0][2] as Record<string, unknown>).description).toContain("未回退");
  });

  test("requires an assetId", async () => {
    const { ctx, calls } = rejectionContext({ asset: {}, versions: [] });
    await expect(rejectAssetVersion({ assetId: " " }, ctx)).rejects.toThrow("rejectAssetVersion 需要 assetId");
    expect(calls).toHaveLength(0);
  });
});

describe("CardGame recent changes view helpers", () => {
  const items: RecentChangeItem[] = [
    { kind: "document", id: "doc-1", path: "开场.md", change: "updated", at: "2026-09-19T01:00:00.000Z" },
    { kind: "card", id: "card-1", name: "剑修", change: "created", at: "2026-09-19T02:00:00.000Z" },
    { kind: "asset", id: "asset-1", name: "立绘", change: "updated", at: "2026-09-19T03:00:00.000Z" },
    { kind: "version", id: "v3", path: "sprites/hero.v3.png", change: "created", at: "2026-09-19T04:00:00.000Z" },
  ];

  test("filters the change stream per library mode", () => {
    expect(recentChangesForMode(items, "cards").map(item => item.id)).toEqual(["card-1"]);
    expect(recentChangesForMode(items, "assets").map(item => item.id)).toEqual(["asset-1", "v3"]);
    expect(recentChangesForMode(items, "knowledge").map(item => item.id)).toEqual(["doc-1"]);
  });

  test("maps version changes to the owning asset for locating", () => {
    const assets = [{ id: "asset-1", currentVersionId: "v3" }, { id: "asset-2", versionId: "v2" }] as AssetItem[];
    expect(locateAssetForChange(items[3]!, assets)).toBe("asset-1");
    expect(locateAssetForChange(items[2]!, assets)).toBe("asset-1");
    expect(locateAssetForChange({ kind: "version", id: "v9", change: "created", at: "" }, assets)).toBeUndefined();
    expect(locateAssetForChange(items[1]!, assets)).toBeUndefined();
  });
});

