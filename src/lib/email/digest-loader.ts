import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DigestContent } from "./templates";

export async function loadDigest(clientId: string, clientName: string, now: Date): Promise<DigestContent> {
  const db = createAdminClient();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const inAWeek = new Date(now.getTime() + 7 * 86400_000).toISOString().slice(0, 10);

  const { data: projects, error: projectsError } = await db.from("projects").select("id, name").eq("client_id", clientId).eq("archived", false);
  if (projectsError) throw new Error(`Digest query "projects" failed: ${projectsError.message}`);
  const ids = (projects ?? []).map((p) => p.id);
  const name = new Map((projects ?? []).map((p) => [p.id, p.name as string]));
  if (!ids.length) return { clientName, updates: [], awaiting: [], statusChanges: [], dueSoon: [] };

  const [updates, awaiting, changed, due] = await Promise.all([
    db.from("updates").select("project_id, body, published_at").in("project_id", ids).gte("published_at", weekAgo).lte("published_at", now.toISOString()).order("published_at"),
    db.from("deliverables").select("id, title, project_id").in("project_id", ids).eq("status", "awaiting_approval"),
    db.from("tasks").select("project_id, name, status").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("status_changed_at", weekAgo),
    db.from("tasks").select("project_id, name, due_date").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("due_date", today).lte("due_date", inAWeek).order("due_date"),
  ]);

  for (const [label, r] of [["updates", updates], ["deliverables", awaiting], ["status changes", changed], ["due soon", due]] as const) {
    if (r.error) throw new Error(`Digest query "${label}" failed: ${r.error.message}`);
  }

  return {
    clientName,
    updates: (updates.data ?? []).map((u) => ({ project: name.get(u.project_id)!, body: u.body, date: u.published_at })),
    awaiting: (awaiting.data ?? []).map((d) => ({ id: d.id, title: d.title, project: name.get(d.project_id)! })),
    statusChanges: (changed.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, status: t.status })),
    dueSoon: (due.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, due: t.due_date })),
  };
}
