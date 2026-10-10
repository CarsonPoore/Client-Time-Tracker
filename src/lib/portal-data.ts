import type { DeliverableRow, FileRow, TaskRow, UpdateRow } from "@/lib/types";

/**
 * The one place that decides what a client sees. The portal queries through the client's own session
 * (RLS also applies); the admin preview queries through the admin session, which RLS lets see everything,
 * so every client filter is applied here explicitly. Keep these in step with the client_read policies
 * in supabase/migrations/0002_access.sql.
 */

// Minimal structural type so tests can pass a recording fake instead of a real Supabase client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PortalDb = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any };

type Result<T> = { data: T | null };

export interface PortalProjectSummary { id: string; name: string; status: string | null; due_date: string | null }

export async function clientProjects(db: PortalDb, clientId: string): Promise<PortalProjectSummary[]> {
  const { data } = (await db.from("projects").select("id, name, status, due_date")
    .eq("client_id", clientId).eq("archived", false).order("name")) as Result<PortalProjectSummary[]>;
  return data ?? [];
}

export async function loadPortalHome(db: PortalDb, clientId: string, now = new Date()) {
  const [{ data: client }, projects] = await Promise.all([
    db.from("clients").select("name, quickbooks_invoices_url").eq("id", clientId).maybeSingle() as Promise<Result<{ name: string; quickbooks_invoices_url: string | null }>>,
    clientProjects(db, clientId),
  ]);
  const ids = projects.map((p) => p.id);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  if (!ids.length) return { client, projects, awaiting: [], updates: [] };
  const [{ data: awaiting }, { data: updates }] = await Promise.all([
    db.from("deliverables").select("id, title, project_id, published_at")
      .in("project_id", ids).eq("status", "awaiting_approval").order("published_at") as Promise<Result<{ id: string; title: string; project_id: string; published_at: string | null }[]>>,
    db.from("updates").select("id, body, published_at, project_id")
      .in("project_id", ids).not("published_at", "is", null).lte("published_at", now.toISOString())
      .order("published_at", { ascending: false }).limit(5) as Promise<Result<{ id: string; body: string; published_at: string; project_id: string }[]>>,
  ]);
  return {
    client,
    projects,
    awaiting: awaiting ?? [],
    updates: (updates ?? []).map((u) => ({ ...u, projectName: names.get(u.project_id) ?? "" })),
  };
}

/** A non-archived project belonging to the client, or null. */
async function ownProject(db: PortalDb, clientId: string, projectId: string) {
  const { data } = (await db.from("projects").select("id, name, status, due_date")
    .eq("id", projectId).eq("client_id", clientId).eq("archived", false).maybeSingle()) as Result<PortalProjectSummary>;
  return data;
}

export async function loadPortalProject(db: PortalDb, clientId: string, projectId: string, now = new Date()) {
  const project = await ownProject(db, clientId, projectId);
  if (!project) return null;
  const [tasks, deliverables, updates, files] = await Promise.all([
    db.from("tasks").select("*").eq("project_id", projectId).eq("client_visible", true).eq("deleted", false)
      .order("due_date", { nullsFirst: false }) as Promise<Result<TaskRow[]>>,
    db.from("deliverables").select("*").eq("project_id", projectId).neq("status", "draft")
      .order("published_at", { ascending: false }) as Promise<Result<DeliverableRow[]>>,
    db.from("updates").select("*").eq("project_id", projectId).not("published_at", "is", null).lte("published_at", now.toISOString())
      .order("published_at", { ascending: false }) as Promise<Result<UpdateRow[]>>,
    db.from("files").select("*").eq("project_id", projectId).order("created_at", { ascending: false }) as Promise<Result<FileRow[]>>,
  ]);
  return { project, tasks: tasks.data ?? [], deliverables: deliverables.data ?? [], updates: updates.data ?? [], files: files.data ?? [] };
}

export type PortalDeliverable = DeliverableRow & { project: { id: string; name: string } };

export async function loadPortalDeliverable(db: PortalDb, clientId: string, id: string): Promise<PortalDeliverable | null> {
  const { data } = (await db.from("deliverables").select("*").eq("id", id).neq("status", "draft").maybeSingle()) as Result<DeliverableRow>;
  if (!data) return null;
  const project = await ownProject(db, clientId, data.project_id);
  if (!project) return null;
  return { ...data, project: { id: project.id, name: project.name } };
}

export async function loadPortalFilePath(db: PortalDb, clientId: string, id: string): Promise<string | null> {
  const { data } = (await db.from("files").select("storage_path, project_id").eq("id", id).maybeSingle()) as Result<{ storage_path: string; project_id: string }>;
  if (!data) return null;
  return (await ownProject(db, clientId, data.project_id)) ? data.storage_path : null;
}

export interface PortalHours { rows: { project_id: string | null; label: string; minutes: number }[]; total: number }

/**
 * Hours this month by project, or null when the client hasn't been opted in. portal_hours() enforces the
 * toggle for client sessions; admins bypass it in SQL, so the toggle is checked here too for the preview.
 */
export async function loadPortalHours(db: PortalDb, clientId: string, monthStart: string): Promise<PortalHours | null> {
  const { data: client } = (await db.from("clients").select("show_hours_in_portal").eq("id", clientId).maybeSingle()) as Result<{ show_hours_in_portal: boolean }>;
  if (!client?.show_hours_in_portal || !db.rpc) return null;
  const { data } = (await db.rpc("portal_hours", { p_client_id: clientId, p_month: monthStart })) as Result<PortalHours["rows"]>;
  const rows = data ?? [];
  return rows.length ? { rows, total: rows.reduce((s, r) => s + r.minutes, 0) } : null;
}
