import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncStore } from "./engine";

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseSyncStore(db: SupabaseClient): SyncStore {
  return {
    async getClientSpaces() {
      const rows = check(await db.from("clients").select("id, clickup_space_id").eq("is_active", true).not("clickup_space_id", "is", null));
      return (rows ?? []).map((r) => ({ clientId: r.id as string, spaceId: r.clickup_space_id as string }));
    },
    async upsertProject(p) {
      const row = check(await db.from("projects").upsert(p, { onConflict: "clickup_list_id" }).select("id").single());
      return (row as { id: string }).id;
    },
    async getProjectIdByList(listId) {
      const row = check(await db.from("projects").select("id").eq("clickup_list_id", listId).maybeSingle());
      return (row?.id as string | undefined) ?? null;
    },
    async upsertTasks(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        check(await db.from("tasks").upsert(rows.slice(i, i + 500), { onConflict: "clickup_task_id" }));
      }
    },
    async markTasksDeletedExcept(projectId, keep) {
      let q = db.from("tasks").update({ deleted: true }).eq("project_id", projectId).eq("deleted", false);
      if (keep.length) q = q.not("clickup_task_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      check(await q);
    },
    async markTaskDeleted(id) {
      check(await db.from("tasks").update({ deleted: true }).eq("clickup_task_id", id));
    },
    async archiveProjectsExcept(clientId, keep) {
      let q = db.from("projects").update({ archived: true }).eq("client_id", clientId).not("clickup_list_id", "is", null);
      if (keep.length) q = q.not("clickup_list_id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
      check(await q);
    },
    async archiveProjectByList(listId) {
      check(await db.from("projects").update({ archived: true }).eq("clickup_list_id", listId));
    },
    async insertClickUpUpdates(rows) {
      const inserted = check(await db.from("updates")
        .upsert(rows.map((r) => ({ ...r, source: "clickup" })), { onConflict: "clickup_comment_id", ignoreDuplicates: true })
        .select("id"));
      return inserted?.length ?? 0;
    },
  };
}
