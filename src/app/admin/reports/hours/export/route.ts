import { requireAdmin } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { entryCsvRows, monthRange, summaryCsvRows, type EntryForExport } from "@/lib/time";

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "summary" ? "summary" : "entries";
  const { month, start, end } = monthRange(url.searchParams.get("month") ?? undefined);
  const { data, error } = await (await createClient()).from("time_entries")
    .select("work_date, minutes, note, clients(id, name, quickbooks_customer_name), projects(id, name)")
    .gte("work_date", start).lte("work_date", end);
  if (error) return new Response("Couldn't load hours.", { status: 500 });
  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const entries: EntryForExport[] = (data ?? []).map((e) => ({
    work_date: e.work_date, minutes: e.minutes, note: e.note, client: one(e.clients)!, project: one(e.projects),
  }));
  const csv = toCsv(kind === "summary" ? summaryCsvRows(entries) : entryCsvRows(entries));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hours-${month}-${kind}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
