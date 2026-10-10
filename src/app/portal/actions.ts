"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyAdminDecision, notifyAdminRequest, postDecisionToClickUp } from "@/lib/email/notify";
import { decisionErrorMessage, parseDecision } from "./decision";
import { COMMENT_PROJECT_SELECT, commentProjectId, isCommentPath, parseComment, validateAttachment, versionErrorMessage } from "@/lib/revisions";
import { buildStoragePath, createSignedUpload, removeObject } from "@/lib/storage";

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

export async function decideVersion(versionId: string, _deliverableId: string, _prev: PortalResult, form: FormData): Promise<PortalResult> {
  await requireClient();
  const parsed = parseDecision(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_version", { p_version_id: versionId, p_decision: parsed.decision, p_note: parsed.feedback });
  if (error) return { error: versionErrorMessage(error.message) };
  // Trust the deliverable the RPC actually decided, not the client-supplied id.
  const decidedId = (data as { deliverable_id?: string } | null)?.deliverable_id;
  if (decidedId) {
    await Promise.allSettled([postDecisionToClickUp(decidedId), notifyAdminDecision(decidedId)]);
    revalidatePath(`/portal/deliverables/${decidedId}`);
  }
  revalidatePath("/portal");
  return { error: null, message: parsed.decision === "approved" ? "Approved. Thank you!" : "Got it. We'll make those changes." };
}

export async function addComment(
  versionId: string, deliverableId: string, _prev: PortalResult & { commentId?: string }, form: FormData,
): Promise<PortalResult & { commentId?: string }> {
  const viewer = await requireClient();
  const parsed = parseComment(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverable_comments").insert({
    version_id: versionId, author_id: viewer.userId, author_role: "client", body: parsed.body,
    pin_x: parsed.pin?.x ?? null, pin_y: parsed.pin?.y ?? null,
  }).select("id").single();
  if (error || !data) return { error: "Couldn't post that. Please try again." };
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  return { error: null, commentId: data.id as string };
}

async function ownedComment(commentId: string, userId: string): Promise<{ projectId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("deliverable_comments").select(COMMENT_PROJECT_SELECT).eq("id", commentId).maybeSingle();
  if (!data || (data as { author_id: string | null }).author_id !== userId) return null;
  const projectId = commentProjectId(data);
  return projectId ? { projectId } : null;
}

export async function createCommentUpload(
  commentId: string, file: { name: string; size: number; type: string },
): Promise<{ error: string } | { path: string; token: string }> {
  const viewer = await requireClient();
  const bad = validateAttachment(file);
  if (bad) return { error: bad };
  const owned = await ownedComment(commentId, viewer.userId);
  if (!owned) return { error: "Invalid upload." };
  try {
    return await createSignedUpload(buildStoragePath(owned.projectId, file.name, "comments", undefined, commentId));
  } catch {
    return { error: "Couldn't start the upload." };
  }
}

export async function attachToComment(
  commentId: string, file: { path: string; name: string; size: number; type: string },
): Promise<{ error: string | null }> {
  const viewer = await requireClient();
  const bad = validateAttachment(file);
  if (bad) return { error: bad };
  const owned = await ownedComment(commentId, viewer.userId);
  if (!owned || !isCommentPath(file.path, owned.projectId, commentId)) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("comment_attachments")
    .insert({ comment_id: commentId, storage_path: file.path, name: file.name, size_bytes: file.size, mime_type: file.type }).select("id").single();
  if (error || !data) {
    await removeObject(file.path).catch(() => undefined);
    return { error: "Couldn't attach that file." };
  }
  return { error: null };
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
