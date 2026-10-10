import { describe, expect, it } from "vitest";
import { entryCsvRows, hoursByClientWeek, summaryCsvRows, weekColumns } from "@/lib/time";

describe("weekColumns", () => {
  it("Oct 2026 (starts Thu) has partial edges", () => {
    const w = weekColumns("2026-10");
    expect(w.map((c) => [c.start, c.end, c.partial])).toEqual([
      ["2026-10-01", "2026-10-04", true], ["2026-10-05", "2026-10-11", false], ["2026-10-12", "2026-10-18", false],
      ["2026-10-19", "2026-10-25", false], ["2026-10-26", "2026-10-31", true],
    ]);
    expect(w[0].label).toBe("Oct 1–4 · partial");
    expect(w[1].label).toBe("Oct 5–11");
  });
  it("month starting Sunday gets a one-day partial first week", () => {
    const w = weekColumns("2026-11"); // Nov 1 2026 is a Sunday
    expect(w[0]).toEqual({ start: "2026-11-01", end: "2026-11-01", label: "Nov 1 · partial", partial: true });
    expect(w.at(-1)!.end).toBe("2026-11-30");
  });
  it("Feb 2027 starting Monday has no partial first week", () => {
    expect(weekColumns("2027-02")[0].partial).toBe(false);
  });
});

describe("hoursByClientWeek", () => {
  it("buckets by week with row/column totals", () => {
    const a = { id: "a", name: "A" }, b = { id: "b", name: "B" };
    const g = hoursByClientWeek("2026-10", [
      { work_date: "2026-10-02", minutes: 60, client: a },
      { work_date: "2026-10-05", minutes: 30, client: a },
      { work_date: "2026-10-31", minutes: 120, client: b },
      { work_date: "2026-09-30", minutes: 999, client: b },
    ]);
    expect(g.rows.map((r) => [r.name, r.cells, r.minutes])).toEqual([["B", [0, 0, 0, 0, 120], 120], ["A", [60, 30, 0, 0, 0], 90]]);
    expect(g.totals).toEqual([60, 30, 0, 0, 120]);
    expect(g.total).toBe(210);
  });
});

describe("csv rows", () => {
  const c = { id: "c", name: "Acme", quickbooks_customer_name: "Acme LLC" };
  const entries = [
    { work_date: "2026-10-03", minutes: 90, note: "=HYPERLINK()", client: c, project: { id: "p", name: "Site" } },
    { work_date: "2026-10-01", minutes: 15, note: null, client: c, project: null },
  ];
  it("entry rows are oldest first with QB name", () => {
    expect(entryCsvRows(entries)).toEqual([
      ["Date", "Client", "QuickBooks customer", "Project", "Hours", "Note"],
      ["2026-10-01", "Acme", "Acme LLC", "No project", "0.25", null],
      ["2026-10-03", "Acme", "Acme LLC", "Site", "1.50", "=HYPERLINK()"],
    ]);
  });
  it("summary rows include subtotals and total", () => {
    expect(summaryCsvRows(entries)).toEqual([
      ["Client", "QuickBooks customer", "Project", "Hours"],
      ["Acme", "Acme LLC", "Site", "1.50"],
      ["Acme", "Acme LLC", "No project", "0.25"],
      ["Acme", "Acme LLC", "Client total", "1.75"],
      ["Total", null, null, "1.75"],
    ]);
  });
});
