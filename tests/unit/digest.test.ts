import { describe, expect, it } from "vitest";
import { easternHour, isDigestEmpty, weekStartEastern } from "@/lib/email/digest";

describe("digest helpers", () => {
  it("finds the Monday of the Eastern week", () => {
    expect(weekStartEastern(new Date("2026-10-12T12:00:00Z"))).toBe("2026-10-12");
    expect(weekStartEastern(new Date("2026-10-15T03:00:00Z"))).toBe("2026-10-12");
    expect(weekStartEastern(new Date("2026-10-12T02:00:00Z"))).toBe("2026-10-05");
  });
  it("reads the Eastern hour across DST", () => {
    expect(easternHour(new Date("2026-10-12T12:00:00Z"))).toBe(8);
    expect(easternHour(new Date("2026-12-07T13:00:00Z"))).toBe(8);
  });
  it("detects empty digests", () => {
    expect(isDigestEmpty({ clientName: "x", updates: [], awaiting: [], statusChanges: [], dueSoon: [], comments: [] })).toBe(true);
    expect(isDigestEmpty({ clientName: "x", updates: [], awaiting: [{ id: "1", title: "t", project: "p", version: 1 }], statusChanges: [], dueSoon: [], comments: [] })).toBe(false);
  });
  it("is not empty when only comments exist", () => {
    expect(isDigestEmpty({ clientName: "A", updates: [], awaiting: [], statusChanges: [], dueSoon: [], comments: [{ deliverableId: "d", title: "t", project: "p", count: 1 }] })).toBe(false);
  });
});
