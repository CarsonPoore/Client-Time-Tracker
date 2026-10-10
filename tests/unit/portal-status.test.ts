import { describe, expect, it } from "vitest";
import { portalStatus } from "@/app/admin/portal-status";

describe("portalStatus", () => {
  it("maps the three states", () => {
    expect(portalStatus(null, null)).toBe("not_invited");
    expect(portalStatus("u1", null)).toBe("invited");
    expect(portalStatus("u1", undefined)).toBe("invited");
    expect(portalStatus("u1", "2026-01-01T00:00:00Z")).toBe("active");
  });
});
