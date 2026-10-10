import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { homeForRole, isAdminEmail, safeNext } = await import("@/lib/auth");

describe("homeForRole", () => {
  it("routes each role", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("client")).toBe("/portal");
    expect(homeForRole("team")).toBe("/login?error=no_access");
    expect(homeForRole(null)).toBe("/login?error=no_access");
  });
});

describe("isAdminEmail", () => {
  it("matches case-insensitively and trims", () => {
    expect(isAdminEmail(" Carson@Example.com ", ["carson@example.com"])).toBe(true);
    expect(isAdminEmail("eve@example.com", ["carson@example.com"])).toBe(false);
    expect(isAdminEmail(undefined, ["carson@example.com"])).toBe(false);
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/portal/account")).toBe("/portal/account");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
