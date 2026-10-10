import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const supabase = await createClient();
  const [awaiting, decided, requests, lastRun] = await Promise.all([
    supabase.from("deliverables").select("id, title, published_at, project:projects(id, name, client:clients(name))")
      .eq("status", "awaiting_approval").order("published_at", { ascending: true }),
    supabase.from("deliverables").select("id, title, status, decided_at, client_feedback, project:projects(id, name, client:clients(name))")
      .in("status", ["approved", "changes_requested"]).order("decided_at", { ascending: false }).limit(8),
    supabase.from("requests").select("id, kind, body, created_at, project_id, client:clients(id, name)")
      .eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const run = lastRun.data;
  const stale = Boolean(run && !run.finished_at && Date.now() - new Date(run.started_at).getTime() > 10 * 60_000);
  const syncLabel = !run ? "Not run yet" : run.ok ? "Healthy" : run.finished_at || stale ? "Needs attention" : "Running";

  return (
    <>
      <PageHeader eyebrow="Carson Poore Consulting" title="Dashboard" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Client requests <span className="text-muted">({requests.data?.length ?? 0})</span></h2>
            {requests.data?.length ? (
              <ul className="divide-y divide-line">
                {requests.data.map((r) => {
                  const client = r.client as unknown as { id: string; name: string } | null;
                  return (
                    <li key={r.id} className="py-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{client?.name} · {r.kind}</p>
                      <p className="mt-1 whitespace-pre-line">{r.body}</p>
                      {r.project_id ? <Link className="text-sm font-semibold text-royal" href={`/admin/projects/${r.project_id}`}>Open project</Link> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="No open requests" />}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Waiting on clients</h2>
            {awaiting.data?.length ? (
              <ul className="divide-y divide-line">
                {awaiting.data.map((d) => {
                  const project = d.project as unknown as { id: string; name: string; client: { name: string } };
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <Link href={`/admin/projects/${project.id}`} className="font-semibold hover:text-royal">{d.title}</Link>
                        <p className="text-sm text-muted">{project.client.name} · {project.name} · sent {formatDate(d.published_at)}</p>
                      </div>
                      <StatusPill status="awaiting_approval" />
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="Nothing waiting on clients" />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="bg-navy text-offwhite border-navy">
            <p className="text-xs font-semibold uppercase tracking-widest text-offwhite/60">ClickUp sync</p>
            <p className="mt-2 text-2xl font-black">
              {syncLabel}
            </p>
            <p className="mt-1 text-sm text-offwhite/70">{run ? `Last ${run.kind} sync ${formatDate(run.started_at)}` : "Connect ClickUp in Settings."}</p>
            {run?.error ? <p className="mt-2 text-sm text-gold">{run.error}</p> : null}
            {stale && !run?.error ? <p className="mt-2 text-sm text-gold">The last run didn&apos;t finish.</p> : null}
            <Link href="/admin/settings" className="mt-4 inline-block text-sm font-semibold text-gold">Sync settings</Link>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Recent decisions</h2>
            {decided.data?.length ? (
              <ul className="space-y-3">
                {decided.data.map((d) => {
                  const project = d.project as unknown as { id: string; name: string; client: { name: string } };
                  return (
                    <li key={d.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/admin/projects/${project.id}`} className="font-semibold">{d.title}</Link>
                        <StatusPill status={d.status} />
                      </div>
                      <p className="text-sm text-muted">{project.client.name} · {formatDate(d.decided_at)}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyState title="No decisions yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
