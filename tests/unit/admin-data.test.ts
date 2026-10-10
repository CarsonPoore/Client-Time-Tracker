import { describe, expect, it } from "vitest";
import { loadClientActivity } from "@/lib/admin-data";

function activityDb(rows: { id: string; created_at: string }[]) {
  const calls: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {
    select: () => q, eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
    lt: (...a: unknown[]) => (calls.push(["lt", ...a]), q), order: () => q,
    limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
  };
  return { db: { from: () => q }, calls };
}

describe("loadClientActivity", () => {
  it("pages by 50 with a cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i), created_at: `2026-10-${String(51 - i).padStart(2, "0")}` }));
    const { db } = activityDb(rows);
    const r = await loadClientActivity(db, "c1");
    expect(r.rows).toHaveLength(50);
    expect(r.nextBefore).toBe(rows[49].created_at);
  });
  it("no cursor when fewer than 51", async () => {
    const { db, calls } = activityDb([{ id: "1", created_at: "2026-10-01" }]);
    const r = await loadClientActivity(db, "c1", "2026-10-09");
    expect(r.nextBefore).toBeNull();
    expect(calls).toContainEqual(["lt", "created_at", "2026-10-09"]);
  });
});

function hrefDb(activity: object[], versions: object[], comments: object[]) {
  const ins: unknown[][] = [];
  const table = (name: string, rows: object[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, lt: () => q, order: () => q,
      limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      in: (col: string, ids: string[]) => (ins.push([name, col, ids]), Promise.resolve({ data: rows, error: null })),
    };
    return q;
  };
  const db = { from: (t: string) => t === "client_activity" ? table(t, activity) : t === "deliverable_versions" ? table(t, versions) : table(t, comments) };
  return { db, ins };
}

describe("loadClientActivity hrefs", () => {
  it("resolves version and comment refs to admin deliverable links in batch", async () => {
    const { db, ins } = hrefDb(
      [
        { id: "a1", type: "published", ref_table: "deliverable_versions", ref_id: "v1", summary: "s", created_at: "2026-10-03" },
        { id: "a2", type: "comment", ref_table: "deliverable_comments", ref_id: "c1", summary: "s", created_at: "2026-10-02" },
        { id: "a3", type: "other", ref_table: "requests", ref_id: "r1", summary: "s", created_at: "2026-10-01" },
      ],
      [{ id: "v1", deliverable_id: "d1" }],
      [{ id: "c1", version: { deliverable_id: "d2" } }],
    );
    const r = await loadClientActivity(db, "c1");
    expect(r.rows.map((x) => x.href)).toEqual(["/admin/deliverables/d1", "/admin/deliverables/d2", null]);
    expect(ins).toEqual([["deliverable_versions", "id", ["v1"]], ["deliverable_comments", "id", ["c1"]]]);
  });
  it("skips lookups when no refs need resolving", async () => {
    const { db, ins } = hrefDb([], [], []);
    const r = await loadClientActivity(db, "c1");
    expect(r.rows).toEqual([]);
    expect(ins).toEqual([]);
  });
});
