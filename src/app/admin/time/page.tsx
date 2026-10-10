import { Card, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHours, monthRange } from "@/lib/time";
import { MonthNav } from "../month-nav";
import { DeleteEntryButton, TimeEntryForm } from "./time-forms";

export const metadata = { title: "Time" };

export default async function TimePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const { month, start, end } = monthRange((await searchParams).month);
  const supabase = await createClient();
  const [{ data: clients }, { data: projects }, { data: entries }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("is_active", true).order("name"),
    supabase.from("projects").select("id, name, client_id").eq("archived", false).order("name"),
    supabase.from("time_entries").select("id, work_date, minutes, note, clients(name), projects(name)")
      .gte("work_date", start).lte("work_date", end).order("work_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const total = (entries ?? []).reduce((s, e) => s + e.minutes, 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;

  return (
    <>
      <PageHeader eyebrow="Time" title="Log time" actions={<MonthNav month={month} basePath="/admin/time" />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold">New entry</h2>
          <TimeEntryForm clients={clients ?? []} projects={projects ?? []} today={today} />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold">Entries · {formatHours(total)} h</h2>
          {entries?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted"><tr><th className="py-2">Date</th><th>Client</th><th>Project</th><th className="text-right">Hours</th><th>Note</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 whitespace-nowrap">{formatDate(e.work_date)}</td>
                      <td>{one(e.clients)?.name}</td>
                      <td className="text-muted">{one(e.projects)?.name ?? "—"}</td>
                      <td className="text-right tabular-nums">{formatHours(e.minutes)}</td>
                      <td className="max-w-xs truncate text-muted" title={e.note ?? ""}>{e.note}</td>
                      <td className="text-right"><DeleteEntryButton id={e.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No time this month" body="Entries you log appear here." />}
        </Card>
      </div>
    </>
  );
}
