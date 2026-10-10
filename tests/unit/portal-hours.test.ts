import { describe, expect, it } from "vitest";
import { loadPortalHours, type PortalDb } from "@/lib/portal-data";

function db(toggle: boolean, rows: unknown[]) {
  const calls: unknown[] = [];
  const d: PortalDb = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { show_hours_in_portal: toggle } }) }) }) }),
    rpc: async (fn, args) => { calls.push([fn, args]); return { data: rows }; },
  };
  return { d, calls };
}

describe("loadPortalHours", () => {
  it("returns null without calling rpc when toggle is off (admin preview path)", async () => {
    const { d, calls } = db(false, [{ project_id: "p", label: "Site", minutes: 60 }]);
    expect(await loadPortalHours(d, "c", "2026-10-01")).toBeNull();
    expect(calls).toEqual([]);
  });
  it("returns rows and total when on", async () => {
    const { d, calls } = db(true, [{ project_id: "p", label: "Site", minutes: 60 }, { project_id: null, label: "Other work", minutes: 15 }]);
    expect(await loadPortalHours(d, "c", "2026-10-01")).toEqual({ rows: expect.any(Array), total: 75 });
    expect(calls).toEqual([["portal_hours", { p_client_id: "c", p_month: "2026-10-01" }]]);
  });
  it("returns null when on but no hours", async () => {
    expect(await loadPortalHours(db(true, []).d, "c", "2026-10-01")).toBeNull();
  });
});
