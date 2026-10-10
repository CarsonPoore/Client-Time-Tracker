import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { resolveCallback } = await import("@/lib/auth-callback");
const allowlist = ["carson@example.com"];
const base = { profileError: false, provider: "google", email: "carson@example.com", allowlist };

describe("resolveCallback", () => {
  it("creates an admin for a new allowlisted Google user", () => {
    expect(resolveCallback({ ...base, profile: null })).toEqual({ kind: "create_admin" });
  });
  it("denies and deletes a new non-allowlisted Google user", () => {
    expect(resolveCallback({ ...base, profile: null, email: "eve@example.com" }))
      .toEqual({ kind: "deny", deleteUser: true });
  });
  it("allows an existing allowlisted admin", () => {
    expect(resolveCallback({ ...base, profile: { role: "admin" } })).toEqual({ kind: "allow", role: "admin" });
  });
  it("denies an admin removed from the allowlist and revokes their profile (keeps the auth user)", () => {
    expect(resolveCallback({ ...base, profile: { role: "admin" }, email: "eve@example.com" }))
      .toEqual({ kind: "deny", deleteUser: false, deleteProfile: true });
  });
  it("denies existing client and team profiles without deleting", () => {
    expect(resolveCallback({ ...base, profile: { role: "client" } })).toEqual({ kind: "deny", deleteUser: false });
    expect(resolveCallback({ ...base, profile: { role: "team" } })).toEqual({ kind: "deny", deleteUser: false });
  });
  it("fails closed on a profile lookup error, even for an allowlisted email", () => {
    expect(resolveCallback({ ...base, profile: null, profileError: true }))
      .toEqual({ kind: "deny", deleteUser: false });
  });
  it("denies a new non-Google user without deleting", () => {
    expect(resolveCallback({ ...base, profile: null, provider: "email" }))
      .toEqual({ kind: "deny", deleteUser: false });
  });
});

const { resolveConfirm } = await import("@/lib/auth-callback");
describe("resolveConfirm", () => {
  it("sends clients to set-password", () => {
    expect(resolveConfirm({ profile: { role: "client" }, profileError: false })).toBe("set_password");
  });
  it("denies admin, team, no profile and lookup error", () => {
    expect(resolveConfirm({ profile: { role: "admin" }, profileError: false })).toBe("deny");
    expect(resolveConfirm({ profile: { role: "team" }, profileError: false })).toBe("deny");
    expect(resolveConfirm({ profile: null, profileError: false })).toBe("deny");
    expect(resolveConfirm({ profile: { role: "client" }, profileError: true })).toBe("deny");
  });
});
