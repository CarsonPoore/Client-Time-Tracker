import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableRow, FileRow, TaskRow, UpdateRow } from "@/lib/types";
import { RequestForm } from "./request-form";

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("id, name, status, due_date").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [tasks, deliverables, updates, files] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).order("due_date", { nullsFirst: false }),
    supabase.from("deliverables").select("*").eq("project_id", id).order("published_at", { ascending: false }),
    supabase.from("updates").select("*").eq("project_id", id).order("published_at", { ascending: false }),
    supabase.from("files").select("*").eq("project_id", id).order("created_at", { ascending: false }),
  ]);
  const taskRows = (tasks.data ?? []) as TaskRow[];
  const byStatus = Map.groupBy(taskRows, (t) => t.status);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/portal" className="font-semibold text-link">← Overview</Link></p>
      <PageHeader eyebrow={project.due_date ? `Due ${formatDate(project.due_date)}` : "Project"} title={project.name} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Deliverables</h2>
            {(deliverables.data as DeliverableRow[] | null)?.length ? (
              <ul className="divide-y divide-line">
                {(deliverables.data as DeliverableRow[]).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                    <Link href={`/portal/deliverables/${d.id}`} className="font-semibold hover:text-link">{d.title}</Link>
                    <StatusPill status={d.status} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No deliverables yet" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Progress</h2>
            {taskRows.length ? (
              <div className="space-y-5">
                {[...byStatus.entries()].map(([status, list]) => (
                  <div key={status}>
                    <StatusPill status={status} color={list[0].status_color} />
                    <ul className="mt-2 space-y-1">
                      {list.map((t) => (
                        <li key={t.id} className="flex justify-between gap-4 text-sm">
                          <span>{t.name}</span>
                          <span className="text-muted">{t.due_date ? formatDate(t.due_date) : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No shared tasks yet" />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Send a request or comment</h2>
            <RequestForm projectId={id} />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Updates</h2>
            {(updates.data as UpdateRow[] | null)?.length ? (
              <ul className="space-y-4">
                {(updates.data as UpdateRow[]).map((u) => (
                  <li key={u.id} className="border-l-2 border-gold pl-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">{formatDate(u.published_at)}</p>
                    <p className="mt-1 whitespace-pre-line">{u.body}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No updates yet" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Files</h2>
            {(files.data as FileRow[] | null)?.length ? (
              <ul className="space-y-2">{(files.data as FileRow[]).map((f) => <li key={f.id}><a href={`/portal/files/${f.id}`} target="_blank" rel="noreferrer" className="font-semibold text-link hover:underline">{f.name}</a></li>)}</ul>
            ) : <EmptyState title="No files yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
