import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncCounts } from "./engine";

export async function withSyncRun<T extends SyncCounts | void>(kind: "webhook" | "nightly" | "manual", fn: () => Promise<T>): Promise<T> {
  const db = createAdminClient();
  const { data: run, error: insertError } = await db.from("sync_runs").insert({ kind }).select("id").single();
  if (insertError) console.error("Could not create sync_runs row", insertError.message);
  const finish = async (patch: Record<string, unknown>) => {
    if (!run?.id) return;
    const { error } = await db.from("sync_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id);
    if (error) console.error("Could not update sync_runs row", error.message);
  };
  try {
    const result = await fn();
    const ok = !result || result.errors === 0;
    const messages = result?.errorMessages ?? [];
    await finish({ ok, counts: result ?? {}, ...(messages.length ? { error: messages.join("; ").slice(0, 2000) } : {}) });
    return result;
  } catch (err) {
    await finish({ ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 2000) });
    throw err;
  }
}
