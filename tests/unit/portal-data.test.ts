import { describe, expect, it } from "vitest";
import { loadDeliverableThread, loadPortalDeliverable, loadPortalFilePath, loadPortalHome, loadPortalProject, type PortalDb } from "@/lib/portal-data";

type Call = [string, ...unknown[]];

/**
 * A fake that behaves like an all-seeing (admin) session: it applies the filters it is given
 * to in-memory rows, and records them so tests can also assert which filters were used.
 */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const log: { table: string; calls: Call[] }[] = [];
  const db: PortalDb = {
    from(table: string) {
      const calls: Call[] = [];
      log.push({ table, calls });
      let rows = [...(tables[table] ?? [])];
      let single = false;
      const q: Record<string, unknown> = {};
      const chain = (name: string, fn?: (...a: never[]) => void) => (...args: unknown[]) => {
        calls.push([name, ...args]);
        (fn as ((...a: unknown[]) => void) | undefined)?.(...args);
        return q;
      };
      Object.assign(q, {
        select: chain("select"),
        order: chain("order"),
        limit: chain("limit", (n: number) => { rows = rows.slice(0, n); }),
        eq: chain("eq", (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); }),
        neq: chain("neq", (c: string, v: unknown) => { rows = rows.filter((r) => r[c] !== v); }),
        in: chain("in", (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); }),
        lte: chain("lte", (c: string, v: string) => { rows = rows.filter((r) => r[c] != null && String(r[c]) <= v); }),
        not: chain("not", (c: string, op: string, v: unknown) => { if (op === "is" && v === null) rows = rows.filter((r) => r[c] != null); }),
        maybeSingle: chain("maybeSingle", () => { single = true; }),
        then: (resolve: (v: unknown) => void) => resolve({ data: single ? (rows[0] ?? null) : rows }),
      });
      return q;
    },
  };
  return { db, log };
}

const NOW = new Date("2026-10-10T12:00:00Z");
const A = "client-a", B = "client-b";

function fixture() {
  return fakeDb({
    clients: [{ id: A, name: "Blue Duck", quickbooks_invoices_url: null }, { id: B, name: "Other", quickbooks_invoices_url: null }],
    projects: [
      { id: "pa", client_id: A, archived: false, name: "Site", status: null, due_date: null },
      { id: "pa-old", client_id: A, archived: true, name: "Old", status: null, due_date: null },
      { id: "pb", client_id: B, archived: false, name: "Theirs", status: null, due_date: null },
    ],
    tasks: [
      { id: "t1", project_id: "pa", client_visible: true, deleted: false, status: "doing", name: "Visible" },
      { id: "t2", project_id: "pa", client_visible: false, deleted: false, status: "doing", name: "Internal" },
      { id: "t3", project_id: "pa", client_visible: true, deleted: true, status: "doing", name: "Deleted" },
      { id: "t4", project_id: "pb", client_visible: true, deleted: false, status: "doing", name: "Other client" },
    ],
    deliverables: [
      { id: "d1", project_id: "pa", status: "awaiting_approval", title: "Logo", published_at: "2026-10-01" },
      { id: "d2", project_id: "pa", status: "draft", title: "Draft", published_at: null },
      { id: "d3", project_id: "pa-old", status: "awaiting_approval", title: "Archived", published_at: "2026-10-01" },
      { id: "d4", project_id: "pb", status: "awaiting_approval", title: "Theirs", published_at: "2026-10-01" },
    ],
    updates: [
      { id: "u1", project_id: "pa", body: "Live", published_at: "2026-10-09T00:00:00Z" },
      { id: "u2", project_id: "pa", body: "Unpublished", published_at: null },
      { id: "u3", project_id: "pa", body: "Scheduled", published_at: "2026-12-01T00:00:00Z" },
      { id: "u4", project_id: "pb", body: "Theirs", published_at: "2026-10-09T00:00:00Z" },
    ],
    files: [
      { id: "f1", project_id: "pa", storage_path: "a/f1", name: "a.pdf" },
      { id: "f2", project_id: "pb", storage_path: "b/f2", name: "b.pdf" },
      { id: "f3", project_id: "pa-old", storage_path: "a/f3", name: "old.pdf" },
    ],
  });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("portal data loader (client visibility)", () => {
  it("home shows only the client's non-archived projects, non-draft awaiting deliverables and published updates", async () => {
    const { db } = fixture();
    const home = await loadPortalHome(db, A, NOW);
    expect(home.client?.name).toBe("Blue Duck");
    expect(ids(home.projects)).toEqual(["pa"]);
    expect(ids(home.awaiting)).toEqual(["d1"]);
    expect(ids(home.updates)).toEqual(["u1"]);
    expect(home.updates[0].projectName).toBe("Site");
  });

  it("project shows only client-visible, non-deleted tasks, no drafts, only published updates", async () => {
    const { db, log } = fixture();
    const p = await loadPortalProject(db, A, "pa", NOW);
    expect(p).not.toBeNull();
    expect(ids(p!.tasks)).toEqual(["t1"]);
    expect(ids(p!.deliverables)).toEqual(["d1"]);
    expect(ids(p!.updates)).toEqual(["u1"]);
    expect(ids(p!.files)).toEqual(["f1"]);
    const taskCalls = log.find((l) => l.table === "tasks")!.calls;
    expect(taskCalls).toContainEqual(["eq", "client_visible", true]);
    expect(taskCalls).toContainEqual(["eq", "deleted", false]);
  });

  it("refuses another client's project and archived projects", async () => {
    const { db } = fixture();
    expect(await loadPortalProject(db, A, "pb", NOW)).toBeNull();
    expect(await loadPortalProject(db, A, "pa-old", NOW)).toBeNull();
  });

  it("files: only from the client's non-archived projects", async () => {
    const { db } = fixture();
    expect(await loadPortalFilePath(db, A, "f1")).toBe("a/f1");
    expect(await loadPortalFilePath(db, A, "f2")).toBeNull();
    expect(await loadPortalFilePath(db, A, "f3")).toBeNull();
  });
});

describe("loadDeliverableThread", () => {
  const proj = { id: "p1", name: "Site", client_id: "c1", archived: false };
  const base = () => ({
    deliverables: [{ id: "d1", project_id: "p1", title: "Logo", status: "awaiting_approval", current_version_id: "v2", revision_limit: 3, project: proj }],
    deliverable_versions: [
      { id: "v1", deliverable_id: "d1", number: 1, status: "changes_requested", decided_by: "u1" },
      { id: "v2", deliverable_id: "d1", number: 2, status: "awaiting_approval", decided_by: null },
      { id: "v3", deliverable_id: "d1", number: 3, status: "draft", decided_by: null },
    ],
    deliverable_comments: [
      { id: "c1", version_id: "v1", author_id: "u1", body: "bluer", kind: "decision", created_at: "2026-10-02", comment_attachments: [] },
      { id: "c2", version_id: "v2", author_id: "admin1", body: "nice", kind: "comment", created_at: "2026-10-05", comment_attachments: [{ id: "a1", name: "x.png" }] },
    ],
    profiles: [
      { user_id: "u1", client_id: "c1", full_name: null, email: "dana@x.com" },
      { user_id: "admin1", client_id: null, full_name: "Carson", email: "c@y.com" },
    ],
  });

  it("excludes draft versions for clients, groups comments by version, restricts names to the client", async () => {
    const { db } = fakeDb(base());
    const t = await loadPortalDeliverable(db, "c1", "d1");
    expect(t!.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(t!.comments.v1.map((c) => c.body)).toEqual(["bluer"]);
    expect(t!.comments.v2[0].attachments).toHaveLength(1);
    expect(t!.names).toEqual({ u1: "dana@x.com" });
  });

  it("admin view includes drafts and resolves admin names", async () => {
    const { db } = fakeDb(base());
    const t = await loadDeliverableThread(db, "d1", { includeDrafts: true });
    expect(t!.versions.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(t!.names).toEqual({ u1: "dana@x.com", admin1: "Carson" });
  });

  it("queries names with namesDb when given", async () => {
    const { db } = fakeDb({ ...base(), profiles: [] });
    const { db: namesDb } = fakeDb(base());
    const t = await loadPortalDeliverable(db, "c1", "d1", namesDb);
    expect(t!.names.u1).toBe("dana@x.com");
  });

  it("returns null for another client's, archived or draft deliverable", async () => {
    const mk = (over: Record<string, unknown>, projOver: Record<string, unknown> = {}) => {
      const b = base();
      b.deliverables = [{ ...b.deliverables[0], ...over, project: { ...proj, ...projOver } }];
      return fakeDb(b).db;
    };
    expect(await loadPortalDeliverable(mk({}, { client_id: "c2" }), "c1", "d1")).toBeNull();
    expect(await loadPortalDeliverable(mk({}, { archived: true }), "c1", "d1")).toBeNull();
    expect(await loadPortalDeliverable(mk({ status: "draft" }), "c1", "d1")).toBeNull();
  });
});
