import Link from "next/link";
import { Card, EmptyState, LinkButton, PageHeader, StatusPill, formatDate } from "@/components/ui";
import type { PortalHours, loadPortalHome, loadPortalProject } from "@/lib/portal-data";
import { formatHours } from "@/lib/time";
import { RequestForm } from "./request-form";

/**
 * Portal screens shared by the client portal (base "/portal") and the admin preview
 * (base "/admin/clients/<id>/preview", preview = true: forms disabled, files via the admin route).
 */
export interface PortalViewMode { base: string; preview: boolean; filesBase: string }

export function PreviewBanner({ clientName, clientId }: { clientName: string; clientId: string }) {
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-navy px-4 py-3 text-sm text-offwhite">
      <p><span className="font-semibold text-gold">Previewing as {clientName}</span> · read-only</p>
      <Link href={`/admin/clients/${clientId}`} className="font-semibold hover:text-gold">Exit preview</Link>
    </div>
  );
}

export function PortalHomeView({ data, mode, hours = null }: { data: Awaited<ReturnType<typeof loadPortalHome>>; mode: PortalViewMode; hours?: PortalHours | null }) {
  const { client, projects, awaiting, updates } = data;
  const awaitingByProject = new Map<string, number>();
  awaiting.forEach((d) => awaitingByProject.set(d.project_id, (awaitingByProject.get(d.project_id) ?? 0) + 1));

  return (
    <>
      <PageHeader eyebrow="Client portal" title={client?.name ?? "Welcome"}
        actions={client?.quickbooks_invoices_url
          ? <LinkButton variant="secondary" href={client.quickbooks_invoices_url} target="_blank" rel="noreferrer">View invoices</LinkButton>
          : undefined} />

      {awaiting.length ? (
        <section aria-labelledby="needs-you" className="relative mb-8 overflow-hidden rounded-xl bg-navy p-6 text-offwhite">
          <p id="needs-you" className="text-xs font-semibold uppercase tracking-widest text-gold">Needs your review</p>
          <ul className="mt-3 space-y-2">
            {awaiting.map((d) => (
              <li key={d.id}>
                <Link href={`${mode.base}/deliverables/${d.id}`} className="text-xl font-bold hover:text-gold">{d.title} →</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mb-4 text-lg font-bold">Projects</h2>
          {projects.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p, i) => (
                <Link key={p.id} href={`${mode.base}/projects/${p.id}`} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Card className="h-full transition-colors hover:border-royal">
                    <p className={i === 0 ? "text-2xl font-black" : "text-lg font-bold"}>{p.name}</p>
                    <p className="mt-2 text-sm text-muted">
                      {p.status ? `${p.status} · ` : ""}{p.due_date ? `Due ${formatDate(p.due_date)}` : "No due date"}
                    </p>
                    {awaitingByProject.get(p.id) ? (
                      <p className="mt-3 text-sm font-semibold text-link">{awaitingByProject.get(p.id)} awaiting your approval</p>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No active projects" body="Your projects will appear here once work begins." />}
        </section>
        <div className="space-y-6">
        {hours ? (
          <section aria-labelledby="hours-h">
            <Card>
              <h2 id="hours-h" className="mb-3 text-lg font-bold">Hours this month</h2>
              <ul className="divide-y divide-line text-sm">
                {hours.rows.map((r) => (
                  <li key={r.project_id ?? "other"} className="flex justify-between gap-4 py-2">
                    <span className={r.project_id ? "" : "text-muted"}>{r.label}</span>
                    <span className="tabular-nums">{formatHours(r.minutes)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-4 py-2 font-bold"><span>Total</span><span className="tabular-nums">{formatHours(hours.total)}</span></li>
              </ul>
            </Card>
          </section>
        ) : null}
        <section aria-labelledby="updates-h">
          <h2 id="updates-h" className="mb-4 text-lg font-bold">Latest updates</h2>
          {updates.length ? (
            <ul className="space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="border-l-2 border-gold pl-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {formatDate(u.published_at)} · {u.projectName}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No updates yet" />}
        </section>
        </div>
      </div>
    </>
  );
}

export function PortalProjectView({ data, mode }: { data: NonNullable<Awaited<ReturnType<typeof loadPortalProject>>>; mode: PortalViewMode }) {
  const { project, tasks, deliverables, updates, files } = data;
  const byStatus = Map.groupBy(tasks, (t) => t.status);

  return (
    <>
      <p className="mb-2 text-sm"><Link href={mode.base} className="font-semibold text-link">← Overview</Link></p>
      <PageHeader eyebrow={project.due_date ? `Due ${formatDate(project.due_date)}` : "Project"} title={project.name} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Deliverables</h2>
            {deliverables.length ? (
              <ul className="divide-y divide-line">
                {deliverables.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                    <Link href={`${mode.base}/deliverables/${d.id}`} className="font-semibold hover:text-link">{d.title}</Link>
                    <StatusPill status={d.status} />
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No deliverables yet" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Progress</h2>
            {tasks.length ? (
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
            <RequestForm projectId={project.id} preview={mode.preview} />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Updates</h2>
            {updates.length ? (
              <ul className="space-y-4">
                {updates.map((u) => (
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
            {files.length ? (
              <ul className="space-y-2">{files.map((f) => <li key={f.id}><a href={`${mode.filesBase}/${f.id}`} target="_blank" rel="noreferrer" className="font-semibold text-link hover:underline">{f.name}</a></li>)}</ul>
            ) : <EmptyState title="No files yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
