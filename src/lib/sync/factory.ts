import "server-only";
import { ClickUpClient } from "@/lib/clickup/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { supabaseSyncStore } from "./store";

export function getSyncDeps() {
  return { cu: new ClickUpClient(serverEnv().CLICKUP_API_TOKEN), store: supabaseSyncStore(createAdminClient()) };
}

export async function getWebhookSettings(): Promise<{ id: string; secret: string } | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "clickup_webhook").maybeSingle();
  return (data?.value as { id: string; secret: string } | undefined) ?? null;
}
