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
