import { describe, expect, it } from "vitest";
import { loadPortalDeliverable, loadPortalFilePath, loadPortalHome, loadPortalProject, type PortalDb } from "@/lib/portal-data";

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

  it("deliverable: hides drafts, other clients' and archived projects' deliverables", async () => {
    const { db } = fixture();
    expect((await loadPortalDeliverable(db, A, "d1"))?.project).toEqual({ id: "pa", name: "Site" });
    expect(await loadPortalDeliverable(db, A, "d2")).toBeNull();
    expect(await loadPortalDeliverable(db, A, "d3")).toBeNull();
    expect(await loadPortalDeliverable(db, A, "d4")).toBeNull();
  });

  it("files: only from the client's non-archived projects", async () => {
    const { db } = fixture();
    expect(await loadPortalFilePath(db, A, "f1")).toBe("a/f1");
    expect(await loadPortalFilePath(db, A, "f2")).toBeNull();
    expect(await loadPortalFilePath(db, A, "f3")).toBeNull();
  });
});
