import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { ClickUpClient } from "@/lib/clickup/client";
import { sendEmail } from "./send";
import { adminDecisionEmail, adminRequestEmail, clientPublishedEmail } from "./templates";

async function loadDeliverable(id: string) {
  const { data } = await createAdminClient().from("deliverables")
    .select("id, title, status, client_feedback, clickup_task_id, project:projects(id, name, clickup_list_id, client:clients(id, name, contact_email, portal_user_id))")
    .eq("id", id).single();
  return data as unknown as {
    id: string; title: string; status: "approved" | "changes_requested" | "awaiting_approval" | "draft";
    client_feedback: string | null; clickup_task_id: string | null;
    project: { id: string; name: string; clickup_list_id: string | null; client: { id: string; name: string; contact_email: string | null; portal_user_id: string | null } };
  } | null;
}

export async function notifyClientDeliverablePublished(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d?.project.client.contact_email || !d.project.client.portal_user_id) return;
  const email = clientPublishedEmail({ title: d.title, projectName: d.project.name, url: `${serverEnv().APP_URL}/portal/deliverables/${d.id}` });
  await sendEmail({ to: d.project.client.contact_email, ...email });
}

export async function notifyAdminDecision(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d || (d.status !== "approved" && d.status !== "changes_requested")) return;
  const env = serverEnv();
  const email = adminDecisionEmail({
    clientName: d.project.client.name, title: d.title, decision: d.status, feedback: d.client_feedback,
    url: `${env.APP_URL}/admin/projects/${d.project.id}`,
  });
  await sendEmail({ to: env.ADMIN_EMAILS, ...email });
}

export async function notifyAdminRequest(id: string): Promise<void> {
  const { data } = await createAdminClient().from("requests")
    .select("kind, body, project:projects(id, name), client:clients(name)").eq("id", id).single();
  if (!data) return;
  const env = serverEnv();
  const project = data.project as unknown as { id: string; name: string } | null;
  const email = adminRequestEmail({
    clientName: (data.client as unknown as { name: string }).name, kind: data.kind, body: data.body,
    projectName: project?.name ?? null, url: `${env.APP_URL}${project ? `/admin/projects/${project.id}` : "/admin"}`,
  });
  await sendEmail({ to: env.ADMIN_EMAILS, ...email });
}

export async function postDecisionToClickUp(id: string): Promise<void> {
  const d = await loadDeliverable(id);
  if (!d || (d.status !== "approved" && d.status !== "changes_requested")) return;
  const text = d.status === "approved"
    ? `Client approved "${d.title}" in the CPC portal.`
    : `Client requested changes on "${d.title}" in the CPC portal:\n\n${d.client_feedback ?? ""}`;
  const cu = new ClickUpClient(serverEnv().CLICKUP_API_TOKEN);
  try {
    if (d.clickup_task_id) await cu.postTaskComment(d.clickup_task_id, text);
    else if (d.project.clickup_list_id) await cu.postListComment(d.project.clickup_list_id, text);
  } catch (err) {
    await createAdminClient().from("sync_runs").insert({
      kind: "webhook", finished_at: new Date().toISOString(), ok: false,
      error: `Couldn't post decision on "${d.title}" to ClickUp: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
