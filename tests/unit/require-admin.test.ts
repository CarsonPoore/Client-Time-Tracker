import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ ADMIN_EMAILS: ["carson@example.com"] }) }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { requireAdmin } = await import("@/lib/auth");

function mockViewer(email: string, role: string) {
  createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
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
  it("redirects non-admin roles home", async () => {
    mockViewer("carson@example.com", "client");
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/portal");
  });
});
