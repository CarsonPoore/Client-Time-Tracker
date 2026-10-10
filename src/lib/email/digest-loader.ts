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
  if (!ids.length) return { clientName, updates: [], awaiting: [], statusChanges: [], dueSoon: [], comments: [] };

  const [updates, awaiting, changed, due, comments] = await Promise.all([
    db.from("updates").select("project_id, body, published_at").in("project_id", ids).gte("published_at", weekAgo).lte("published_at", now.toISOString()).order("published_at"),
    db.from("deliverables").select("id, title, project_id, current_version:deliverable_versions!deliverables_current_version_id_fkey(number)").in("project_id", ids).eq("status", "awaiting_approval"),
    db.from("tasks").select("project_id, name, status").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("status_changed_at", weekAgo),
    db.from("tasks").select("project_id, name, due_date").in("project_id", ids).eq("client_visible", true).eq("deleted", false).gte("due_date", today).lte("due_date", inAWeek).order("due_date"),
    db.from("deliverable_comments")
      .select("id, version:deliverable_versions!inner(status, deliverable:deliverables!inner(id, title, project_id))")
      .eq("author_role", "admin").eq("kind", "comment").gte("created_at", weekAgo)
      .in("version.deliverable.project_id", ids).neq("version.status", "draft"),
  ]);

  for (const [label, r] of [["updates", updates], ["deliverables", awaiting], ["status changes", changed], ["due soon", due], ["comments", comments]] as const) {
    if (r.error) throw new Error(`Digest query "${label}" failed: ${r.error.message}`);
  }

  return {
    clientName,
    updates: (updates.data ?? []).map((u) => ({ project: name.get(u.project_id)!, body: u.body, date: u.published_at })),
    awaiting: (awaiting.data ?? []).map((d) => ({ id: d.id, title: d.title, project: name.get(d.project_id)!, version: one(d.current_version)?.number ?? 1 })),
    statusChanges: (changed.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, status: t.status })),
    dueSoon: (due.data ?? []).map((t) => ({ project: name.get(t.project_id)!, task: t.name, due: t.due_date })),
    comments: groupComments(comments.data ?? [], name),
  };
}

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}

type CommentHit = { version: Rel<{ status: string; deliverable: Rel<{ id: string; title: string; project_id: string }> }> };
function groupComments(rows: CommentHit[], name: Map<string, string>): DigestContent["comments"] {
  const out = new Map<string, DigestContent["comments"][number]>();
  for (const r of rows) {
    const d = one(one(r.version)?.deliverable ?? null);
    if (!d || !name.has(d.project_id)) continue;
    const cur = out.get(d.id) ?? { deliverableId: d.id, title: d.title, project: name.get(d.project_id)!, count: 0 };
    cur.count += 1;
    out.set(d.id, cur);
  }
  return [...out.values()];
}
