"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isDefaultClientSpace, WEBHOOK_EVENTS } from "@/lib/clickup/mapping";
import { reconcileAll } from "@/lib/sync/engine";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { withSyncRun } from "@/lib/sync/runs";
import { parseClientForm } from "./client-form";

export type ActionResult = { error: string | null; message?: string };

export async function updateClient(clientId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseClientForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(parsed.data).eq("id", clientId);
  if (error) return { error: "Couldn't save the client." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Saved." };
}

export async function inviteClient(clientId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: client } = await db.from("clients").select("id, name, contact_name, contact_email, portal_user_id").eq("id", clientId).single();
  if (!client?.contact_email) return { error: "Add a contact email before inviting." };
  const redirectTo = `${serverEnv().APP_URL}/auth/confirm`;

  if (client.portal_user_id) {
    const { error } = await db.auth.resetPasswordForEmail(client.contact_email, { redirectTo });
    return error ? { error: "Couldn't resend the invite." } : { error: null, message: "Sign-in link sent again." };
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(client.contact_email, { redirectTo, data: { client_id: client.id } });
  if (error || !data.user) return { error: error?.message.includes("already") ? "That email already has an account. Use a different contact email." : "Couldn't send the invite." };

  const { error: pErr } = await db.from("profiles").insert({
    user_id: data.user.id, role: "client", client_id: client.id, email: client.contact_email, full_name: client.contact_name,
  });
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: "Couldn't create the portal login." };
  }
  await db.from("clients").update({ portal_user_id: data.user.id }).eq("id", client.id);
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Invite sent." };
}

export async function importSpaces(): Promise<ActionResult> {
  await requireAdmin();
  const { cu } = getSyncDeps();
  const spaces = await cu.getSpaces(serverEnv().CLICKUP_TEAM_ID);
  const db = createAdminClient();
  const rows = spaces.filter((s) => isDefaultClientSpace(s.name)).map((s) => ({ name: s.name, clickup_space_id: s.id, is_active: true }));
  const { error } = await db.from("clients").upsert(rows, { onConflict: "clickup_space_id", ignoreDuplicates: true });
  if (error) return { error: "Couldn't import spaces." };
  revalidatePath("/admin/settings");
  return { error: null, message: `Imported ${rows.length} client spaces.` };
}

export async function setSpaceIsClient(spaceId: string, name: string, isClient: boolean): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  const { error } = await db.from("clients")
    .upsert({ clickup_space_id: spaceId, name, is_active: isClient }, { onConflict: "clickup_space_id" });
  if (error) return { error: "Couldn't update that space." };
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function connectWebhook(): Promise<ActionResult> {
  await requireAdmin();
  const env = serverEnv();
  const { cu } = getSyncDeps();
  const existing = await getWebhookSettings();
  if (existing) await cu.deleteWebhook(existing.id).catch(() => undefined);
  const hook = await cu.createWebhook(env.CLICKUP_TEAM_ID, `${env.APP_URL}/api/clickup/webhook`, WEBHOOK_EVENTS);
  const { error } = await createAdminClient().from("app_settings")
    .upsert({ key: "clickup_webhook", value: hook, updated_at: new Date().toISOString() });
  if (error) return { error: "Webhook created but couldn't be saved. Try again." };
  revalidatePath("/admin/settings");
  return { error: null, message: "ClickUp is now sending live updates." };
}

export async function syncNow(): Promise<ActionResult> {
  await requireAdmin();
  const { cu, store } = getSyncDeps();
  try {
    const counts = await withSyncRun("manual", () => reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 7 * 86400_000) }));
    revalidatePath("/admin", "layout");
    return counts.errors
      ? { error: `Synced with ${counts.errors} error(s). See sync history.` }
      : { error: null, message: `Synced ${counts.projects} projects and ${counts.tasks} tasks.` };
  } catch {
    return { error: "Sync failed. See sync history." };
  }
}
