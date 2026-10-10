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
