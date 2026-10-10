import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn(() => { throw new Error("NEXT_REDIRECT"); });
vi.mock("next/navigation", () => ({ redirect }));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { signInWithPassword } = await import("@/app/login/actions");
const { setPassword } = await import("@/app/set-password/actions");

function fakeSupabase(role: string | null, opts: { user?: boolean } = {}) {
  const signOut = vi.fn();
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const user = { id: "u1" };
  return {
    signOut, updateUser,
    client: {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: opts.user === false ? null : user } }),
        signOut, updateUser,
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }),
    },
  };
}
const loginForm = () => { const f = new FormData(); f.set("email", "a@b.com"); f.set("password", "x"); return f; };
const pwForm = () => { const f = new FormData(); f.set("password", "longenough1"); f.set("confirm", "longenough1"); return f; };

beforeEach(() => { redirect.mockClear(); });

describe("signInWithPassword role check", () => {
  it.each(["admin", "team", null])("rejects role %s and signs out", async (role) => {
    const s = fakeSupabase(role); createClient.mockResolvedValue(s.client);
    const r = await signInWithPassword({ error: null }, loginForm());
    expect(r.error).toMatch(/don't match/);
    expect(s.signOut).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("lets a client in", async () => {
    const s = fakeSupabase("client"); createClient.mockResolvedValue(s.client);
    await expect(signInWithPassword({ error: null }, loginForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(s.signOut).not.toHaveBeenCalled();
  });
});

describe("setPassword role check", () => {
  it.each(["admin", "team", null])("refuses role %s and does not update", async (role) => {
    const s = fakeSupabase(role); createClient.mockResolvedValue(s.client);
    const r = await setPassword({ error: null }, pwForm());
    expect(r.error).toBeTruthy();
    expect(s.updateUser).not.toHaveBeenCalled();
    expect(s.signOut).toHaveBeenCalled();
  });
  it("refuses when signed out", async () => {
    const s = fakeSupabase("client", { user: false }); createClient.mockResolvedValue(s.client);
    const r = await setPassword({ error: null }, pwForm());
    expect(r.error).toBeTruthy();
    expect(s.updateUser).not.toHaveBeenCalled();
  });
  it("lets a client set a password", async () => {
    const s = fakeSupabase("client"); createClient.mockResolvedValue(s.client);
    await expect(setPassword({ error: null }, pwForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(s.updateUser).toHaveBeenCalled();
  });
});
