import { describe, expect, it } from "vitest";
import { parseDecision } from "@/app/portal/decision";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseDecision", () => {
  it("accepts approval without feedback", () => {
    expect(parseDecision(fd({ decision: "approved" }))).toEqual({ ok: true, decision: "approved", feedback: null });
  });
  it("requires feedback for changes", () => {
    expect(parseDecision(fd({ decision: "changes_requested", feedback: "  " }))).toEqual({ ok: false, error: "Tell us what to change." });
  });
  it("rejects unknown decisions", () => {
    expect(parseDecision(fd({ decision: "draft" })).ok).toBe(false);
  });
});

