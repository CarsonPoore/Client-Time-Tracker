import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PortalViewMode } from "@/components/portal/views";

/** Admin check + the client being previewed. Every preview page and route starts here. */
export async function previewContext(clientId: string) {
  await requireAdmin();
  const db = await createClient();
  const { data: client } = await db.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) notFound();
  const base = `/admin/clients/${clientId}/preview`;
  const mode: PortalViewMode = { base, preview: true, filesBase: `${base}/files` };
  return { db, client: client as { id: string; name: string }, mode };
}
