import type { PortalDb } from "@/lib/portal-data";
import type { ActivityRow } from "@/lib/types";

export const ACTIVITY_PAGE = 50;

export type ActivityItem = ActivityRow & { href: string | null };

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** Maps each activity row to its admin deliverable page, with one batch query per ref table. */
async function resolveHrefs(db: PortalDb, rows: ActivityRow[]): Promise<ActivityItem[]> {
  const ids = (table: string) => [...new Set(rows.filter((r) => r.ref_table === table).map((r) => r.ref_id))];
  const versionIds = ids("deliverable_versions");
  const commentIds = ids("deliverable_comments");
  const deliverableOf = new Map<string, string>();
  if (versionIds.length) {
    const { data } = await db.from("deliverable_versions").select("id, deliverable_id").in("id", versionIds);
    for (const v of (data ?? []) as { id: string; deliverable_id: string }[]) deliverableOf.set(`deliverable_versions:${v.id}`, v.deliverable_id);
  }
  if (commentIds.length) {
    const { data } = await db.from("deliverable_comments").select("id, version:deliverable_versions(deliverable_id)").in("id", commentIds);
    for (const c of (data ?? []) as { id: string; version: unknown }[]) {
      const did = (one(c.version as { deliverable_id: string } | null))?.deliverable_id;
      if (did) deliverableOf.set(`deliverable_comments:${c.id}`, did);
    }
  }
  return rows.map((r) => {
    const did = deliverableOf.get(`${r.ref_table}:${r.ref_id}`);
    return { ...r, href: did ? `/admin/deliverables/${did}` : null };
  });
}

/** Keyset cursor is `${created_at}|${id}` so rows sharing a timestamp are never skipped. */
const CURSOR = /^([0-9T:.+\- Z]+)\|([0-9A-Za-z-]+)$/;

export async function loadClientActivity(db: PortalDb, clientId: string, before?: string): Promise<{ rows: ActivityItem[]; nextBefore: string | null }> {
  let q = db.from("client_activity").select("id, type, ref_table, ref_id, summary, created_at").eq("client_id", clientId);
  const m = before ? CURSOR.exec(before) : null;
  if (m) {
    const [, ts, id] = m;
    q = q.or(`created_at.lt."${ts}",and(created_at.eq."${ts}",id.lt."${id}")`);
  }
  const { data } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(ACTIVITY_PAGE + 1);
  const rows = (data ?? []) as ActivityRow[];
  const page = rows.slice(0, ACTIVITY_PAGE);
  const last = page[ACTIVITY_PAGE - 1];
  return { rows: await resolveHrefs(db, page), nextBefore: rows.length > ACTIVITY_PAGE ? `${last.created_at}|${last.id}` : null };
}
