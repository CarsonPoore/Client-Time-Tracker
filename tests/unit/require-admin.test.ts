import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ ADMIN_EMAILS: ["carson@example.com"] }) }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));
const deleteEq = vi.fn(async () => ({ error: null }));
const adminFrom = vi.fn(() => ({ delete: () => ({ eq: deleteEq }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: adminFrom }) }));
const signOut = vi.fn(async () => ({}));

const { requireAdmin } = await import("@/lib/auth");

function mockViewer(email: string, role: string) {
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { role, client_id: null, full_name: null, email }, error: null }) }) }) }),
  });
}

describe("requireAdmin", () => {
  it("allows an allowlisted admin", async () => {
    mockViewer("Carson@example.com", "admin");
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });
  it("rejects an admin removed from the allowlist", async () => {
    mockViewer("eve@example.com", "admin");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login?error=no_access");
  });
  it("deletes the profile via service role and signs out when removed from the allowlist", async () => {
    deleteEq.mockClear(); adminFrom.mockClear(); signOut.mockClear();
    mockViewer("eve@example.com", "admin");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login?error=no_access");
    expect(adminFrom).toHaveBeenCalledWith("profiles");
    expect(deleteEq).toHaveBeenCalledWith("user_id", "u1");
    expect(signOut).toHaveBeenCalled();
  });
  it("does not touch the profile for an allowlisted admin or a non-admin role", async () => {
    deleteEq.mockClear(); signOut.mockClear();
    mockViewer("carson@example.com", "admin");
    await requireAdmin();
    mockViewer("eve@example.com", "client");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/portal");
    expect(deleteEq).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it("redirects non-admin roles home", async () => {
    mockViewer("carson@example.com", "client");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/portal");
  });
});
