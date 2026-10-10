import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@/lib/sync/engine", () => ({ reconcileAll: vi.fn() }));
vi.mock("@/lib/sync/factory", () => ({ getSyncDeps: vi.fn(), getWebhookSettings: vi.fn() }));
vi.mock("@/lib/sync/runs", () => ({ withSyncRun: vi.fn() }));

const calls: { op: string; payload?: unknown }[] = [];
let existing: { id: string } | null = null;
const table = {
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
  update: (payload: unknown) => { calls.push({ op: "update", payload }); return { eq: async () => ({ error: null }) }; },
  insert: async (payload: unknown) => { calls.push({ op: "insert", payload }); return { error: null }; },
  upsert: async (payload: unknown) => { calls.push({ op: "upsert", payload }); return { error: null }; },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => table }) }));

const { setSpaceIsClient } = await import("@/app/admin/actions");

beforeEach(() => { calls.length = 0; existing = null; });

describe("setSpaceIsClient", () => {
  it("inserts with the ClickUp name when no client row exists", async () => {
    await setSpaceIsClient("S1", "ClickUp Name", true);
    expect(calls).toEqual([{ op: "insert", payload: { clickup_space_id: "S1", name: "ClickUp Name", is_active: true } }]);
  });
  it("only updates is_active on an existing row, never the name", async () => {
    existing = { id: "c1" };
    await setSpaceIsClient("S1", "ClickUp Name", false);
    expect(calls).toEqual([{ op: "update", payload: { is_active: false } }]);
  });
});
