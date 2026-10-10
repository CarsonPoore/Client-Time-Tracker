import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHours, hoursByClient, hoursByClientWeek, monthRange, type EntryForReport } from "@/lib/time";
import { MonthNav } from "../../month-nav";

export const metadata = { title: "Hours by client" };

const tabCls = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? "bg-navy text-offwhite" : "text-muted hover:text-fg"}`;

export default async function HoursReportPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view = sp.view === "weeks" ? "weeks" : "clients";
  const { month, start, end } = monthRange(sp.month);
  const { data, error } = await (await createClient()).from("time_entries")
    .select("work_date, minutes, clients(id, name), projects(id, name)").gte("work_date", start).lte("work_date", end);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const entries = (data ?? []).map((e) => ({ work_date: e.work_date, minutes: e.minutes, client: one(e.clients)!, project: one(e.projects) }));
  const report = hoursByClient(entries satisfies EntryForReport[]);
  const grid = hoursByClientWeek(month, entries);
  const base = `/admin/reports/hours?month=${month}`;

  return (
    <>
      <PageHeader eyebrow="Reports" title="Hours by client" actions={<MonthNav month={month} basePath="/admin/reports/hours" keep={view === "weeks" ? "view=weeks" : ""} />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Report view" className="flex gap-1">
          <Link href={base} className={tabCls(view === "clients")} aria-current={view === "clients" ? "page" : undefined}>By client</Link>
          <Link href={`${base}&view=weeks`} className={tabCls(view === "weeks")} aria-current={view === "weeks" ? "page" : undefined}>By week</Link>
        </nav>
        {report.total ? (
          <div className="flex flex-wrap gap-3 text-sm font-semibold">
            <a className="text-link hover:underline" href={`/admin/reports/hours/export?month=${month}&kind=entries`}>Download entries CSV</a>
            <a className="text-link hover:underline" href={`/admin/reports/hours/export?month=${month}&kind=summary`}>Download summary CSV</a>
          </div>
        ) : null}
      </div>
      <Card>
        {error ? <p className="text-sm text-danger">Couldn&apos;t load hours.</p> : !report.clients.length ? (
          <EmptyState title="No hours this month" body={<>Nothing logged yet. <Link href={`/admin/time?month=${month}`} className="font-semibold text-link">Log time for this month</Link>.</>} />
        ) : view === "clients" ? (
          <div className="space-y-1">
            {report.clients.map((c) => {
              const pct = Math.round((c.minutes / report.total) * 100);
              return (
                <details key={c.id} className="group border-b border-line py-2 last:border-0">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="w-4 text-muted transition-transform group-open:rotate-90" aria-hidden>›</span>
                    <span className="min-w-0 flex-1 font-semibold">{c.name}</span>
                    <span className="hidden h-2 w-32 overflow-hidden rounded-full bg-line sm:block" aria-hidden>
                      <span className="block h-full rounded-full bg-royal" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-10 text-right text-sm tabular-nums text-muted">{pct}%</span>
                    <span className="w-14 text-right font-semibold tabular-nums">{formatHours(c.minutes)}</span>
                  </summary>
                  <ul className="mt-2 space-y-1 pl-8 text-sm text-muted">
                    {c.projects.map((p) => (
                      <li key={p.id ?? "none"} className="flex justify-between gap-4"><span>{p.name}</span><span className="tabular-nums">{formatHours(p.minutes)}</span></li>
                    ))}
                    <li><Link href={`/admin/clients/${c.id}`} className="font-semibold text-link">Open client</Link></li>
                  </ul>
                </details>
              );
            })}
            <p className="flex justify-between pt-3 font-bold"><span>Total</span><span className="tabular-nums">{formatHours(report.total)}</span></p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-4">Client</th>
                  {grid.weeks.map((w) => <th key={w.start} className={`px-2 text-right whitespace-nowrap ${w.partial ? "italic" : ""}`}>{w.label}</th>)}
                  <th className="pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {grid.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 font-semibold whitespace-nowrap">{r.name}</td>
                    {r.cells.map((m, i) => <td key={i} className="px-2 text-right tabular-nums">{m ? formatHours(m) : <span className="text-muted">—</span>}</td>)}
                    <td className="pl-2 text-right font-semibold tabular-nums">{formatHours(r.minutes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-bold">
                <tr>
                  <td className="py-2 pr-4">Total</td>
                  {grid.totals.map((m, i) => <td key={i} className="px-2 text-right tabular-nums">{formatHours(m)}</td>)}
                  <td className="pl-2 text-right tabular-nums">{formatHours(grid.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
