import type { PortalDb } from "@/lib/portal-data";
import type { ActivityRow } from "@/lib/types";

export const ACTIVITY_PAGE = 50;

export async function loadClientActivity(db: PortalDb, clientId: string, before?: string) {
  let q = db.from("client_activity").select("id, type, ref_table, ref_id, summary, created_at").eq("client_id", clientId);
  if (before) q = q.lt("created_at", before);
  const { data } = await q.order("created_at", { ascending: false }).limit(ACTIVITY_PAGE + 1);
  const rows = (data ?? []) as ActivityRow[];
  return { rows: rows.slice(0, ACTIVITY_PAGE), nextBefore: rows.length > ACTIVITY_PAGE ? rows[ACTIVITY_PAGE - 1].created_at : null };
}
