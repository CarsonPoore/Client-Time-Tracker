import { z } from "zod";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-10" → first and last day (inclusive). Falls back to the current month in New York. */
export function monthRange(month: string | undefined, now = new Date()): { month: string; start: string; end: string } {
  const m = month && MONTH_RE.test(month) ? month : now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { month: m, start: `${m}-01`, end: `${m}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, mo] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string): string {
  const [y, mo] = month.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const formatHours = (minutes: number) => (minutes / 60).toFixed(2);

/** Hours as typed ("1.5", "1:30") → minutes rounded up to the nearest 15. */
export function parseHours(input: string): number | null {
  const s = input.trim();
  let minutes: number;
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (hm) minutes = Number(hm[1]) * 60 + Number(hm[2]);
  else if (/^\d*\.?\d+$/.test(s)) minutes = Number(s) * 60;
  else return null;
  const rounded = Math.ceil(Math.round(minutes) / 15) * 15;
  return rounded > 0 && rounded <= 1440 ? rounded : null;
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

const schema = z.object({
  client_id: z.uuid("Choose a client."),
  project_id: z.preprocess(blankToNull, z.uuid().nullable()),
  work_date: z.iso.date("Enter a date."),
  minutes: z.number({ error: "Enter hours like 1.5 or 1:30 (max 24)." }),
  note: z.preprocess(blankToNull, z.string().max(500, "Keep the note under 500 characters.").nullable()),
});

export type TimeEntryInput = z.infer<typeof schema>;

export function parseTimeEntryForm(form: FormData): { ok: true; data: TimeEntryInput } | { ok: false; error: string } {
  const minutes = parseHours(String(form.get("hours") ?? ""));
  const res = schema.safeParse({
    client_id: form.get("client_id") ?? "",
    project_id: form.get("project_id") ?? "",
    work_date: form.get("work_date") ?? "",
    minutes: minutes ?? undefined,
    note: form.get("note") ?? "",
  });
  return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error.issues[0].message };
}

export interface EntryForReport {
  minutes: number;
  client: { id: string; name: string };
  project: { id: string; name: string } | null;
}

export interface ClientHours {
  id: string;
  name: string;
  minutes: number;
  projects: { id: string | null; name: string; minutes: number }[];
}

/** Totals by client (largest first), each with its projects; unassigned time is grouped as "No project". */
export function hoursByClient(entries: EntryForReport[]): { total: number; clients: ClientHours[] } {
  const clients = new Map<string, ClientHours & { byProject: Map<string, { id: string | null; name: string; minutes: number }> }>();
  for (const e of entries) {
    let c = clients.get(e.client.id);
    if (!c) clients.set(e.client.id, (c = { id: e.client.id, name: e.client.name, minutes: 0, projects: [], byProject: new Map() }));
    c.minutes += e.minutes;
    const key = e.project?.id ?? "";
    let p = c.byProject.get(key);
    if (!p) c.byProject.set(key, (p = { id: e.project?.id ?? null, name: e.project?.name ?? "No project", minutes: 0 }));
    p.minutes += e.minutes;
  }
  const byMinutes = <T extends { minutes: number; name: string }>(a: T, b: T) => b.minutes - a.minutes || a.name.localeCompare(b.name);
  const list = [...clients.values()].map(({ byProject, ...c }) => ({ ...c, projects: [...byProject.values()].sort(byMinutes) })).sort(byMinutes);
  return { total: list.reduce((s, c) => s + c.minutes, 0), clients: list };
}

export interface EntryForExport {
  work_date: string;
  minutes: number;
  note: string | null;
  client: { id: string; name: string; quickbooks_customer_name: string | null };
  project: { id: string; name: string } | null;
}

/** One row per entry, oldest first. Hours are decimals; no rates or amounts. */
export function entryCsvRows(entries: EntryForExport[]): (string | number | null)[][] {
  const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date) || a.client.name.localeCompare(b.client.name));
  return [
    ["Date", "Client", "QuickBooks customer", "Project", "Hours", "Note"],
    ...sorted.map((e) => [e.work_date, e.client.name, e.client.quickbooks_customer_name, e.project?.name ?? "No project", formatHours(e.minutes), e.note]),
  ];
}

/** Client → project totals with a subtotal row per client and a grand total. */
export function summaryCsvRows(entries: EntryForExport[]): (string | number | null)[][] {
  const qb = new Map(entries.map((e) => [e.client.id, e.client.quickbooks_customer_name]));
  const report = hoursByClient(entries);
  const rows: (string | number | null)[][] = [["Client", "QuickBooks customer", "Project", "Hours"]];
  for (const c of report.clients) {
    for (const p of c.projects) rows.push([c.name, qb.get(c.id) ?? null, p.name, formatHours(p.minutes)]);
    rows.push([c.name, qb.get(c.id) ?? null, "Client total", formatHours(c.minutes)]);
  }
  rows.push(["Total", null, null, formatHours(report.total)]);
  return rows;
}

export interface WeekColumn { start: string; end: string; label: string; partial: boolean }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const short = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Monday-start weeks touching the month, clipped to it. Edge weeks that lose days are partial. */
export function weekColumns(month: string): WeekColumn[] {
  const { start, end } = monthRange(month);
  const cols: WeekColumn[] = [];
  const first = new Date(`${start}T00:00:00Z`);
  let monday = new Date(first);
  monday.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  while (iso(monday) <= end) {
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const s = iso(monday) < start ? start : iso(monday);
    const e = iso(sunday) > end ? end : iso(sunday);
    const partial = s !== iso(monday) || e !== iso(sunday);
    const range = s === e ? short(s) : `${short(s)}–${s.slice(5, 7) === e.slice(5, 7) ? Number(e.slice(8)) : short(e)}`;
    cols.push({ start: s, end: e, label: partial ? `${range} · partial` : range, partial });
    monday = new Date(monday);
    monday.setUTCDate(monday.getUTCDate() + 7);
  }
  return cols;
}

export interface WeekGrid {
  weeks: WeekColumn[];
  rows: { id: string; name: string; cells: number[]; minutes: number }[];
  totals: number[];
  total: number;
}

/** Client × week minutes for the month, rows sorted by total desc. Entries outside the month are ignored. */
export function hoursByClientWeek(month: string, entries: { work_date: string; minutes: number; client: { id: string; name: string } }[]): WeekGrid {
  const weeks = weekColumns(month);
  const rows = new Map<string, WeekGrid["rows"][number]>();
  for (const e of entries) {
    const i = weeks.findIndex((w) => e.work_date >= w.start && e.work_date <= w.end);
    if (i < 0) continue;
    let r = rows.get(e.client.id);
    if (!r) rows.set(e.client.id, (r = { id: e.client.id, name: e.client.name, cells: weeks.map(() => 0), minutes: 0 }));
    r.cells[i] += e.minutes;
    r.minutes += e.minutes;
  }
  const list = [...rows.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  const totals = weeks.map((_, i) => list.reduce((s, r) => s + r.cells[i], 0));
  return { weeks, rows: list, totals, total: totals.reduce((a, b) => a + b, 0) };
}
