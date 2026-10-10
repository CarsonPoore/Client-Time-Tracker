import { describe, expect, it } from "vitest";
import { hoursByClient, monthRange, parseHours, parseTimeEntryForm, shiftMonth } from "@/lib/time";

describe("parseHours", () => {
  it("accepts decimals and h:mm, rounding up to 15 minutes", () => {
    expect(parseHours("1.5")).toBe(90);
    expect(parseHours("1:30")).toBe(90);
    expect(parseHours(".1")).toBe(15);
    expect(parseHours("2.3")).toBe(150);
  });
  it("rejects zero, junk and more than 24 hours", () => {
    for (const v of ["0", "", "abc", "-1", "25", "1:75"]) expect(parseHours(v)).toBeNull();
  });
});

describe("months", () => {
  it("computes month bounds including leap years", () => {
    expect(monthRange("2028-02")).toEqual({ month: "2028-02", start: "2028-02-01", end: "2028-02-29" });
    expect(monthRange("bogus", new Date("2026-10-10T12:00:00Z")).month).toBe("2026-10");
  });
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("parseTimeEntryForm", () => {
  const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const base = { client_id: "10000000-0000-4000-8000-00000000000a", project_id: "", work_date: "2026-10-10", hours: "1.25", note: " " };
  it("parses a valid entry", () => {
    expect(parseTimeEntryForm(form(base))).toEqual({ ok: true, data: { client_id: base.client_id, project_id: null, work_date: "2026-10-10", minutes: 75, note: null } });
  });
  it("reports bad hours and missing client", () => {
    expect(parseTimeEntryForm(form({ ...base, hours: "x" }))).toMatchObject({ ok: false, error: expect.stringContaining("hours") });
    expect(parseTimeEntryForm(form({ ...base, client_id: "" }))).toMatchObject({ ok: false, error: "Choose a client." });
  });
});

describe("hoursByClient", () => {
  it("totals by client and project, largest first", () => {
    const A = { id: "a", name: "A Co" }, B = { id: "b", name: "B Co" };
    const r = hoursByClient([
      { minutes: 60, client: A, project: { id: "p1", name: "Site" } },
      { minutes: 30, client: A, project: null },
      { minutes: 45, client: A, project: { id: "p1", name: "Site" } },
      { minutes: 240, client: B, project: null },
    ]);
    expect(r.total).toBe(375);
    expect(r.clients.map((c) => [c.name, c.minutes])).toEqual([["B Co", 240], ["A Co", 135]]);
    expect(r.clients[1].projects).toEqual([{ id: "p1", name: "Site", minutes: 105 }, { id: null, name: "No project", minutes: 30 }]);
  });
});
