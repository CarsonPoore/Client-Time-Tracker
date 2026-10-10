import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHours, hoursByClient, monthRange, type EntryForReport } from "@/lib/time";
import { MonthNav } from "../../month-nav";

export const metadata = { title: "Hours by client" };

export default async function HoursReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const { month, start, end } = monthRange((await searchParams).month);
  const { data, error } = await (await createClient()).from("time_entries")
    .select("minutes, clients(id, name), projects(id, name)").gte("work_date", start).lte("work_date", end);
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const entries: EntryForReport[] = (data ?? []).map((e) => ({ minutes: e.minutes, client: one(e.clients)!, project: one(e.projects) }));
  const report = hoursByClient(entries);

  return (
    <>
      <PageHeader eyebrow="Reports" title="Hours by client" actions={<MonthNav month={month} basePath="/admin/reports/hours" />} />
      <Card>
        {error ? <p className="text-sm text-danger">Couldn&apos;t load hours.</p> : report.clients.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="py-2">Client / project</th><th className="text-right">Hours</th><th className="text-right">Share</th></tr></thead>
              {report.clients.map((c) => (
                <tbody key={c.id} className="border-t border-line">
                  <tr className="font-semibold">
                    <td className="py-2"><Link href={`/admin/clients/${c.id}`} className="hover:text-link">{c.name}</Link></td>
                    <td className="text-right tabular-nums">{formatHours(c.minutes)}</td>
                    <td className="text-right tabular-nums text-muted">{Math.round((c.minutes / report.total) * 100)}%</td>
                  </tr>
                  {c.projects.map((p) => (
                    <tr key={p.id ?? "none"} className="text-muted">
                      <td className="py-1 pl-6">{p.name}</td>
                      <td className="text-right tabular-nums">{formatHours(p.minutes)}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot className="border-t-2 border-line font-bold">
                <tr><td className="py-2">Total</td><td className="text-right tabular-nums">{formatHours(report.total)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        ) : <EmptyState title="No hours this month" body="Log time on the Time page and it shows up here." />}
      </Card>
    </>
  );
}
