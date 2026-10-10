"use server";
import { requireAdmin } from "@/lib/auth";
import { loadClientActivity } from "@/lib/admin-data";
import { createClient } from "@/lib/supabase/server";

export async function loadMoreActivity(clientId: string, before: string) {
  await requireAdmin();
  return loadClientActivity(await createClient(), clientId, before);
}
