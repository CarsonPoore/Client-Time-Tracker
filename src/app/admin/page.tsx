import Link from "next/link";
import { Card, EmptyState, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatMonth, hoursByClient, monthRange } from "@/lib/time";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createClient();
  const { month, start, end } = monthRange(undefined);
  const [awaiting, decided, requests, lastRun, time] = await Promise.all([
    supabase.from("deliverables").select("id, title, published_at, project:projects(id, name, client:clients(name))")
      .eq("status", "awaiting_approval").order("published_at", { ascending: true }),
    supabase.from("deliverables").select("id, title, status, decided_at, project:projects(id, name, client:clients(name))")
      .in("status", ["approved", "changes_requested"]).order("decided_at", { ascending: false }).limit(8),
    supabase.from("requests").select("id, kind, body, created_at, project_id, client:clients(id, name)")
      .eq("status", "open").order("created_at", { ascending: false }),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("time_entries").select("minutes, clients(id, name)").gte("work_date", start).lte("work_date", end),
  ]);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const thisMonth = hoursByClient((time.data ?? []).map((e) => ({ minutes: e.minutes, client: one(e.clients)!, project: null })));
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
                      {r.project_id ? <Link className="text-sm font-semibold text-link" href={`/admin/projects/${r.project_id}`}>Open project</Link> : null}
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
                        <Link href={`/admin/deliverables/${d.id}`} className="font-semibold hover:text-link">{d.title}</Link>
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
          <Card>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">This month · {formatMonth(month)}</p>
            <p className="mt-2 text-3xl font-black tabular-nums">{formatHours(thisMonth.total)} h</p>
            {thisMonth.clients.length ? (
              <ol className="mt-3 space-y-1 text-sm">
                {thisMonth.clients.slice(0, 3).map((c) => (
                  <li key={c.id} className="flex justify-between gap-4"><span className="truncate">{c.name}</span><span className="tabular-nums text-muted">{formatHours(c.minutes)}</span></li>
                ))}
              </ol>
            ) : <p className="mt-1 text-sm text-muted">No time logged yet.</p>}
            <Link href={`/admin/reports/hours?month=${month}`} className="mt-4 inline-block text-sm font-semibold text-link">Hours report</Link>
          </Card>
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
                        <Link href={`/admin/deliverables/${d.id}`} className="font-semibold">{d.title}</Link>
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
