"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyAdminDecision, notifyAdminRequest, postDecisionToClickUp } from "@/lib/email/notify";
import { decisionErrorMessage, parseDecision } from "./decision";

export type PortalResult = { error: string | null; message?: string };

export async function decideDeliverable(deliverableId: string, _prev: PortalResult, form: FormData): Promise<PortalResult> {
  await requireClient();
  const parsed = parseDecision(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_deliverable", { p_id: deliverableId, p_decision: parsed.decision, p_feedback: parsed.feedback });
  if (error) return { error: decisionErrorMessage(error.message) };
  await Promise.allSettled([postDecisionToClickUp(deliverableId), notifyAdminDecision(deliverableId)]);
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  revalidatePath("/portal");
  return { error: null, message: parsed.decision === "approved" ? "Approved. Thank you!" : "Got it. We'll make those changes." };
}

const requestSchema = z.object({
  kind: z.enum(["comment", "request"]),
  body: z.string().trim().min(1, "Write a message first.").max(5000, "Keep it under 5,000 characters."),
  project_id: z.uuid().nullable(),
  deliverable_id: z.uuid().nullable(),
});

export async function submitRequest(_prev: PortalResult, form: FormData): Promise<PortalResult> {
  const viewer = await requireClient();
  const parsed = requestSchema.safeParse({
    kind: form.get("kind"),
    body: form.get("body"),
    project_id: form.get("project_id") || null,
    deliverable_id: form.get("deliverable_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from("requests")
    .insert({ ...parsed.data, client_id: viewer.clientId, created_by: viewer.userId }).select("id").single();
  if (error || !data) return { error: "Couldn't send that. Please try again." };
  await notifyAdminRequest(data.id).catch(() => undefined);
  if (parsed.data.project_id) revalidatePath(`/portal/projects/${parsed.data.project_id}`);
  return { error: null, message: "Sent. Carson will follow up." };
}
