"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildStoragePath, createSignedUpload, removeObject } from "@/lib/storage";
import { notifyClientDeliverablePublished } from "@/lib/email/notify";
import { COMMENT_PROJECT_SELECT, commentProjectId, isCommentPath, parseComment, validateAttachment } from "@/lib/revisions";
import { parseDeliverableForm } from "./deliverable-form";
import type { ActionResult } from "./actions";

const refresh = (projectId: string) => revalidatePath(`/admin/projects/${projectId}`);

export async function createDeliverable(projectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = parseDeliverableForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const rawPath = String(form.get("file_path") ?? "").trim();
  if (rawPath && !pathBelongs(projectId, rawPath, "deliverables")) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { link_url, ...fields } = parsed.data;
  const { data: created, error } = await supabase.from("deliverables").insert({ project_id: projectId, ...fields }).select("id").single();
  if (error || !created) return { error: "Couldn't create the deliverable." };
  const { data: version, error: vErr } = await supabase.from("deliverable_versions").insert({
    deliverable_id: created.id, number: 1, status: "draft", file_path: rawPath || null, link_url, created_by: viewer.userId,
  }).select("id").single();
  if (vErr || !version) return { error: "Created the deliverable, but couldn't start its first version." };
  const { error: uErr } = await supabase.from("deliverables").update({ current_version_id: version.id }).eq("id", created.id);
  if (uErr) return { error: "Created the deliverable, but couldn't link its first version." };
  refresh(projectId);
  return { error: null, message: "Draft created. Add a file if needed, then send it for approval." };
}

export async function editDeliverable(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseDeliverableForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { link_url, ...fields } = parsed.data;
  const { data } = await supabase.from("deliverables").update(fields).eq("id", id)
    .in("status", ["draft", "changes_requested"]).select("project_id, current_version_id").maybeSingle();
  if (!data) return { error: "This deliverable can't be changed right now." };
  if (data.current_version_id) {
    const rawPath = String(form.get("file_path") ?? "").trim();
    if (rawPath && !pathBelongs(data.project_id, rawPath, "deliverables")) return { error: "Invalid upload." };
    const patch: { link_url: string | null; file_path?: string } = { link_url };
    if (rawPath) patch.file_path = rawPath;
    // Only a draft version is editable; publish_version promotes the draft row as-is.
    await supabase.from("deliverable_versions").update(patch).eq("id", data.current_version_id).eq("status", "draft");
  }
  refresh(data.project_id);
  return { error: null, message: "Saved." };
}

const publishSchema = z.object({
  file_path: z.string().nullable(),
  link_url: z.url({ protocol: /^https?$/, error: "Links must start with http:// or https://." }).nullable(),
  notes: z.string().max(5000, "Keep notes under 5,000 characters.").nullable(),
});
const blankToNull = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export async function publishVersion(deliverableId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = publishSchema.safeParse({
    file_path: blankToNull(form.get("file_path")), link_url: blankToNull(form.get("link_url")), notes: blankToNull(form.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: d } = await supabase.from("deliverables").select("project_id").eq("id", deliverableId).maybeSingle();
  if (!d) return { error: "Deliverable not found." };
  if (parsed.data.file_path && !pathBelongs(d.project_id, parsed.data.file_path, "deliverables")) return { error: "Invalid upload." };
  const { error } = await supabase.rpc("publish_version", {
    p_deliverable_id: deliverableId, p_file_path: parsed.data.file_path, p_link_url: parsed.data.link_url, p_notes: parsed.data.notes,
  });
  if (error) return { error: error.message.includes("file_required") ? "Attach a file or link first." : "Couldn't send it." };
  try {
    await notifyClientDeliverablePublished(deliverableId);
  } catch (e) {
    console.error("notifyClientDeliverablePublished failed", e);
  }
  refresh(d.project_id);
  revalidatePath(`/admin/deliverables/${deliverableId}`);
  return { error: null, message: "Sent to the client for approval." };
}

export async function publishDeliverable(id: string): Promise<ActionResult> {
  return publishVersion(id, { error: null }, new FormData());
}

const revisionLimitSchema = z.union([z.literal(""), z.coerce.number().int().min(1).max(50)]);

export async function setRevisionLimit(deliverableId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = revisionLimitSchema.safeParse(String(form.get("revision_limit") ?? "").trim());
  if (!parsed.success) return { error: "Revision limit must be a whole number from 1 to 50, or blank for none." };
  const supabase = await createClient();
  const { data } = await supabase.from("deliverables").update({ revision_limit: parsed.data === "" ? null : parsed.data })
    .eq("id", deliverableId).select("project_id").maybeSingle();
  if (!data) return { error: "Couldn't save the revision limit." };
  refresh(data.project_id);
  revalidatePath(`/admin/deliverables/${deliverableId}`);
  return { error: null, message: "Saved." };
}

export async function addAdminComment(
  versionId: string, deliverableId: string, _prev: ActionResult & { commentId?: string }, form: FormData,
): Promise<ActionResult & { commentId?: string }> {
  const viewer = await requireAdmin();
  const parsed = parseComment(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverable_comments").insert({
    version_id: versionId, author_id: viewer.userId, author_role: "admin", body: parsed.body,
    pin_x: parsed.pin?.x ?? null, pin_y: parsed.pin?.y ?? null,
  }).select("id").single();
  if (error || !data) return { error: "Couldn't post that. Please try again." };
  revalidatePath(`/admin/deliverables/${deliverableId}`);
  return { error: null, commentId: data.id as string };
}

async function commentProject(commentId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("deliverable_comments").select(COMMENT_PROJECT_SELECT).eq("id", commentId).maybeSingle();
  return data ? commentProjectId(data) : null;
}

export async function createAdminCommentUpload(
  commentId: string, file: { name: string; size: number; type: string },
): Promise<{ error: string } | { path: string; token: string }> {
  await requireAdmin();
  const bad = validateAttachment(file);
  if (bad) return { error: bad };
  const projectId = await commentProject(commentId);
  if (!projectId) return { error: "Invalid upload." };
  try {
    return await createSignedUpload(buildStoragePath(projectId, file.name, "comments", undefined, commentId));
  } catch {
    return { error: "Couldn't start the upload." };
  }
}

export async function attachAdminComment(commentId: string, file: UploadedFileInput): Promise<{ error: string | null }> {
  await requireAdmin();
  const bad = validateAttachment(file);
  if (bad) return { error: bad };
  const projectId = await commentProject(commentId);
  if (!projectId || !isCommentPath(file.path, projectId, commentId)) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("comment_attachments")
    .insert({ comment_id: commentId, storage_path: file.path, name: file.name, size_bytes: file.size, mime_type: file.type }).select("id").single();
  if (error || !data) {
    await removeObject(file.path).catch(() => undefined);
    return { error: "Couldn't attach that file." };
  }
  return { error: null };
}

export async function deleteDeliverable(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: versions } = await supabase.from("deliverable_versions").select("file_path").eq("deliverable_id", id);
  const { data } = await supabase.from("deliverables").delete().eq("id", id).eq("status", "draft").select("project_id").maybeSingle();
  if (!data) return { error: "Only drafts can be deleted." };
  for (const v of (versions ?? []) as { file_path: string | null }[]) {
    if (v.file_path) await removeObject(v.file_path).catch((e) => console.error("removeObject failed", e));
  }
  refresh(data.project_id);
  return { error: null };
}

const updateSchema = z.object({ body: z.string().trim().min(1, "Write something first.").max(5000) });

export async function postUpdate(projectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = updateSchema.safeParse({ body: form.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("updates").insert({
    project_id: projectId, body: parsed.data.body, source: "os", author_name: viewer.fullName ?? "Carson Poore",
  });
  if (error) return { error: "Couldn't post the update." };
  refresh(projectId);
  return { error: null, message: "Posted." };
}

export async function deleteUpdate(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("updates").delete().eq("id", id).eq("source", "os").select("project_id").maybeSingle();
  if (!data) return { error: "Only updates posted here can be deleted. Edit or remove ClickUp updates in ClickUp." };
  refresh(data.project_id);
  return { error: null };
}

export async function createAdminUpload(projectId: string, fileName: string, kind: "files" | "deliverables") {
  await requireAdmin();
  try {
    return await createSignedUpload(buildStoragePath(projectId, fileName, kind));
  } catch {
    return { error: "Couldn't start the upload." };
  }
}

export interface UploadedFileInput { path: string; name: string; size: number; type: string }

function pathBelongs(projectId: string, path: string, kind: "files" | "deliverables") {
  return path.startsWith(`${projectId}/${kind}/`) && !path.includes("..") && !path.includes("\\");
}

export async function recordProjectFile(projectId: string, file: UploadedFileInput): Promise<{ error: string | null }> {
  const viewer = await requireAdmin();
  if (!pathBelongs(projectId, file.path, "files")) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { error } = await supabase.from("files").insert({
    project_id: projectId, storage_path: file.path, name: file.name, size_bytes: file.size, mime_type: file.type || null, uploaded_by: viewer.userId,
  });
  refresh(projectId);
  return { error: error ? "Uploaded, but couldn't save the file record." : null };
}

export async function attachDeliverableFile(deliverableId: string, projectId: string, file: UploadedFileInput): Promise<{ error: string | null }> {
  await requireAdmin();
  if (!pathBelongs(projectId, file.path, "deliverables")) return { error: "Invalid upload." };
  const supabase = await createClient();
  const { data: d } = await supabase.from("deliverables").select("current_version_id").eq("id", deliverableId).eq("project_id", projectId).maybeSingle();
  const versionId = d?.current_version_id as string | null | undefined;
  const { data: old } = versionId
    ? await supabase.from("deliverable_versions").select("file_path").eq("id", versionId).maybeSingle()
    : { data: null };
  const { data: changed, error } = versionId
    ? await supabase.from("deliverable_versions").update({ file_path: file.path })
      .eq("id", versionId).eq("status", "draft").select("id").maybeSingle()
    : { data: null, error: null };
  if (error || !changed) {
    await removeObject(file.path);
    refresh(projectId);
    return { error: error ? "Couldn't attach the file." : "Only a draft version can take a new file. Start a new version instead." };
  }
  if (old?.file_path && old.file_path !== file.path) await removeObject(old.file_path);
  refresh(projectId);
  return { error: null };
}

export async function deleteFile(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("files").delete().eq("id", id).select("project_id, storage_path").maybeSingle();
  if (data) {
    await removeObject(data.storage_path);
    refresh(data.project_id);
  }
  return { error: null };
}

export async function setRequestStatus(id: string, status: "open" | "done"): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("requests").update({ status }).eq("id", id).select("project_id").maybeSingle();
  revalidatePath("/admin");
  if (data?.project_id) refresh(data.project_id);
  return { error: null };
}
