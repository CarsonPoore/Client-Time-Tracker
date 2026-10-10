import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableRow, FileRow, RequestRow, TaskRow, UpdateRow } from "@/lib/types";
import { DeliverableCard, NewDeliverableForm, ProjectFiles, RequestRowActions, UpdateForm, DeleteUpdateButton } from "./forms";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*, client:clients(id, name)").eq("id", id).maybeSingle();
  if (!project) notFound();
  const client = project.client as { id: string; name: string };

  const [tasks, deliverables, updates, files, requests] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).eq("deleted", false).order("status").order("due_date", { nullsFirst: false }),
    supabase.from("deliverables").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("updates").select("*").eq("project_id", id).order("published_at", { ascending: false }).limit(30),
    supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("requests").select("*").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const taskRows = (tasks.data ?? []) as TaskRow[];

  const taskOptions = taskRows.map((t) => ({ id: t.clickup_task_id, name: t.name }));

  return (
    <>
      <p className="mb-2 text-sm"><Link className="font-semibold text-link" href={`/admin/clients/${client.id}`}>{client.name}</Link></p>
      <PageHeader eyebrow="Project" title={project.name} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Deliverables</h2>
            <NewDeliverableForm projectId={id} tasks={taskOptions} />
            <div className="mt-6 space-y-4">
              {(deliverables.data as DeliverableRow[] | null)?.length
                ? (deliverables.data as DeliverableRow[]).map((d) => <DeliverableCard key={d.id} deliverable={d} tasks={taskOptions} />)
                : <EmptyState title="No deliverables yet" />}
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Updates</h2>
            <UpdateForm projectId={id} />
            <ul className="mt-6 space-y-4">
              {(updates.data as UpdateRow[] | null)?.map((u) => (
                <li key={u.id} className="border-l-2 border-gold pl-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {formatDate(u.published_at)} · {u.source === "clickup" ? "From ClickUp" : u.author_name}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                  {u.source === "clickup" ? <p className="mt-1 text-xs text-muted">Edit or remove in ClickUp</p> : <DeleteUpdateButton id={u.id} />}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Client requests</h2>
            {(requests.data as RequestRow[] | null)?.length ? (
              <ul className="divide-y divide-line">
                {(requests.data as RequestRow[]).map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-center justify-between"><StatusPill status={r.status} /><span className="text-xs text-muted">{formatDate(r.created_at)}</span></div>
                    <p className="mt-2 whitespace-pre-line">{r.body}</p>
                    <RequestRowActions id={r.id} status={r.status} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No requests" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Files</h2>
            <ProjectFiles projectId={id} files={(files.data ?? []) as FileRow[]} />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">ClickUp tasks</h2>
            <ul className="space-y-2 text-sm">
              {taskRows.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <a href={t.clickup_url ?? "#"} target="_blank" rel="noreferrer" className="hover:text-link">{t.name}</a>
                  <span className="flex items-center gap-2">
                    {t.client_visible ? <span className="text-xs font-semibold text-ok">Visible</span> : <span className="text-xs text-muted">Internal</span>}
                    <StatusPill status={t.status} color={t.status_color} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
