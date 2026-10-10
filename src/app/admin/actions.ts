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
  const { data: current } = await supabase.from("clients").select("portal_user_id, contact_email").eq("id", clientId).maybeSingle();
  if (!current) return { error: "Couldn't find that client." };
  if (current.portal_user_id && (current.contact_email ?? null) !== parsed.data.contact_email) {
    return { error: "This client already has a portal login. Contact Carson's developer to change the login email." };
  }
  const { error } = await supabase.from("clients").update(parsed.data).eq("id", clientId);
  if (error) return { error: "Couldn't save the client." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Saved." };
}

async function resendSignIn(db: ReturnType<typeof createAdminClient>, userId: string, redirectTo: string): Promise<ActionResult> {
  const { data, error: uErr } = await db.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (uErr || !email) return { error: "Couldn't find the portal login for this client." };
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { error: "Couldn't resend the invite." } : { error: null, message: "Sign-in link sent again." };
}

async function removeAuthUser(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) console.error("inviteClient: failed to delete auth user", userId, error.message);
}

export async function inviteClient(clientId: string): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  const { data: client, error: cErr } = await db.from("clients").select("id, name, contact_name, contact_email, portal_user_id").eq("id", clientId).single();
  if (cErr || !client) return { error: "Couldn't find that client." };
  const redirectTo = `${serverEnv().APP_URL}/auth/confirm`;

  let existingUserId: string | null = client.portal_user_id;
  if (!existingUserId) {
    const { data: profile, error: pfErr } = await db.from("profiles").select("user_id")
      .eq("client_id", client.id).eq("role", "client").limit(1).maybeSingle();
    if (pfErr) return { error: "Couldn't check for an existing portal login." };
    if (profile) {
      const { error: linkErr } = await db.from("clients").update({ portal_user_id: profile.user_id }).eq("id", client.id);
      if (linkErr) return { error: "Couldn't link the existing portal login." };
      existingUserId = profile.user_id;
    }
  }
  if (existingUserId) {
    const res = await resendSignIn(db, existingUserId, redirectTo);
    revalidatePath(`/admin/clients/${clientId}`);
    return res;
  }

  if (!client.contact_email) return { error: "Add a contact email before inviting." };
  const { data, error } = await db.auth.admin.inviteUserByEmail(client.contact_email, { redirectTo, data: { client_id: client.id } });
  if (error || !data.user) return { error: error?.message.includes("already") ? "That email already has an account. Use a different contact email." : "Couldn't send the invite." };
  const userId = data.user.id;

  const { error: pErr } = await db.from("profiles").insert({
    user_id: userId, role: "client", client_id: client.id, email: client.contact_email, full_name: client.contact_name,
  });
  if (pErr) {
    await removeAuthUser(db, userId);
    return { error: "Couldn't create the portal login. Try again." };
  }
  const { error: lErr } = await db.from("clients").update({ portal_user_id: userId }).eq("id", client.id);
  if (lErr) {
    // Profile is removed by the auth user's cascade; delete explicitly in case it isn't.
    const { error: delProfile } = await db.from("profiles").delete().eq("user_id", userId);
    if (delProfile) console.error("inviteClient: failed to delete profile", userId, delProfile.message);
    await removeAuthUser(db, userId);
    return { error: "Couldn't link the portal login. Try again." };
  }
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: "Invite sent." };
}

const CLICKUP_UNREACHABLE = "Couldn't reach ClickUp. Check the API token.";

export async function importSpaces(): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  let spaces: { id: string; name: string }[];
  try {
    spaces = await getSyncDeps().cu.getSpaces(serverEnv().CLICKUP_TEAM_ID);
  } catch {
    return { error: CLICKUP_UNREACHABLE };
  }
  const { data: existing, error: exErr } = await db.from("clients").select("clickup_space_id").not("clickup_space_id", "is", null);
  if (exErr) return { error: "Couldn't import spaces." };
  const known = new Set((existing ?? []).map((c) => c.clickup_space_id as string));
  const rows = spaces
    .filter((s) => !known.has(s.id) && isDefaultClientSpace(s.name))
    .map((s) => ({ name: s.name, clickup_space_id: s.id, is_active: true }));
  if (rows.length) {
    const { error } = await db.from("clients").upsert(rows, { onConflict: "clickup_space_id", ignoreDuplicates: true });
    if (error) return { error: "Couldn't import spaces." };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/clients");
  return { error: null, message: rows.length ? `Added ${rows.length} client space${rows.length === 1 ? "" : "s"}.` : "No new client spaces to add." };
}

export async function setSpaceIsClient(spaceId: string, name: string, isClient: boolean): Promise<ActionResult> {
  await requireAdmin();
  const db = createAdminClient();
  // Only insert (with the ClickUp space name) when no row exists, so admin-edited names survive toggles.
  const { data: existing, error: lookupError } = await db.from("clients").select("id").eq("clickup_space_id", spaceId).maybeSingle();
  if (lookupError) return { error: "Couldn't update that space." };
  const { error } = existing
    ? await db.from("clients").update({ is_active: isClient }).eq("clickup_space_id", spaceId)
    : await db.from("clients").insert({ clickup_space_id: spaceId, name, is_active: isClient });
  if (error) return { error: "Couldn't update that space." };
  revalidatePath("/admin/settings");
  return { error: null };
}

export async function connectWebhook(): Promise<ActionResult> {
  await requireAdmin();
  const env = serverEnv();
  const { cu } = getSyncDeps();
  const db = createAdminClient();
  const existing = await getWebhookSettings();

  let hook: { id: string; secret: string };
  try {
    hook = await cu.createWebhook(env.CLICKUP_TEAM_ID, `${env.APP_URL}/api/clickup/webhook`, WEBHOOK_EVENTS);
  } catch {
    return { error: CLICKUP_UNREACHABLE };
  }
  const { error } = await db.from("app_settings")
    .upsert({ key: "clickup_webhook", value: hook, updated_at: new Date().toISOString() });
  if (error) {
    await cu.deleteWebhook(hook.id).catch((e) => console.error("connectWebhook: cleanup failed", e));
    return { error: "Couldn't save the webhook. Try again." };
  }
  if (existing && existing.id !== hook.id) {
    await cu.deleteWebhook(existing.id).catch((e) => console.error("connectWebhook: old webhook delete failed (may already be gone)", e));
  }
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
