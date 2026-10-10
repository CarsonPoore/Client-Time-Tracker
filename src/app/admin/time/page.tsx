import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatHours, monthRange } from "@/lib/time";
import { MonthNav } from "../month-nav";
import { EntryList } from "./entry-list";
import { TimeEntryForm } from "./time-forms";

export const metadata = { title: "Time" };

export default async function TimePage({ searchParams }: { searchParams: Promise<{ month?: string; client?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { month, start, end } = monthRange(sp.month);
  const supabase = await createClient();
  let entriesQuery = supabase.from("time_entries").select("id, client_id, project_id, work_date, minutes, note, clients(name), projects(name)")
    .gte("work_date", start).lte("work_date", end).order("work_date", { ascending: false }).order("created_at", { ascending: false });
  const filter = sp.client && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : null;
  if (filter) entriesQuery = entriesQuery.eq("client_id", filter);
  const [{ data: clients }, { data: projects }, { data: entries }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("is_active", true).order("name"),
    supabase.from("projects").select("id, name, client_id").eq("archived", false).order("name"),
    entriesQuery,
  ]);
  const total = (entries ?? []).reduce((s, e) => s + e.minutes, 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const list = (entries ?? []).map((e) => ({
    id: e.id, client_id: e.client_id, project_id: e.project_id, work_date: e.work_date, minutes: e.minutes, note: e.note,
    clientName: one(e.clients)?.name ?? "", projectName: one(e.projects)?.name ?? null,
  }));
  const chip = (active: boolean) => `shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${active ? "border-navy bg-navy text-offwhite" : "border-line hover:border-royal"}`;

  return (
    <>
      <PageHeader eyebrow="Time" title="Log time" actions={<MonthNav month={month} basePath="/admin/time" keep={filter ? `client=${filter}` : ""} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="min-w-0">
          <h2 className="mb-4 text-lg font-bold">New entry</h2>
          <TimeEntryForm clients={clients ?? []} projects={projects ?? []} today={today} />
        </Card>
        <Card className="min-w-0">
          <h2 className="mb-3 text-lg font-bold">Entries · {formatHours(total)} h</h2>
          <nav aria-label="Filter by client" className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            <Link href={`/admin/time?month=${month}`} className={chip(!filter)}>All</Link>
            {(clients ?? []).map((c) => (
              <Link key={c.id} href={`/admin/time?month=${month}&client=${c.id}`} className={chip(filter === c.id)}>{c.name}</Link>
            ))}
          </nav>
          {list.length ? <EntryList entries={list} clients={clients ?? []} projects={projects ?? []} />
            : <EmptyState title={filter ? "No time for this client this month" : "No time this month"} body="Entries you log appear here." />}
        </Card>
      </div>
    </>
  );
}
