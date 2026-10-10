import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncCounts } from "./engine";

export async function withSyncRun<T extends SyncCounts | void>(kind: "webhook" | "nightly" | "manual", fn: () => Promise<T>): Promise<T> {
  const db = createAdminClient();
  const { data: run } = await db.from("sync_runs").insert({ kind }).select("id").single();
  try {
    const result = await fn();
    const ok = !result || result.errors === 0;
    await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ok, counts: result ?? {} }).eq("id", run?.id);
    return result;
  } catch (err) {
    await db.from("sync_runs").update({
      finished_at: new Date().toISOString(), ok: false, error: err instanceof Error ? err.message : String(err),
    }).eq("id", run?.id);
    throw err;
  }
}
