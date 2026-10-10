"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildStoragePath, createSignedUpload, removeObject } from "@/lib/storage";
import { notifyClientDeliverablePublished } from "@/lib/email/notify";
import { parseDeliverableForm } from "./deliverable-form";
import type { ActionResult } from "./actions";

const refresh = (projectId: string) => revalidatePath(`/admin/projects/${projectId}`);

export async function createDeliverable(projectId: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseDeliverableForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.from("deliverables").insert({ project_id: projectId, ...parsed.data });
  if (error) return { error: "Couldn't create the deliverable." };
  refresh(projectId);
  return { error: null, message: "Draft created. Add a file if needed, then send it for approval." };
}

export async function publishDeliverable(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: current } = await supabase.from("deliverables").select("file_path, link_url").eq("id", id).maybeSingle();
  if (!current) return { error: "Deliverable not found." };
  if (!current.file_path && !current.link_url) return { error: "Attach a file or link first." };
  const { data, error } = await supabase.from("deliverables")
    .update({ status: "awaiting_approval", published_at: new Date().toISOString(), client_feedback: null, decided_at: null, decided_by: null })
    .eq("id", id).in("status", ["draft", "changes_requested"]).select("project_id, file_path, link_url").single();
  if (error || !data) return { error: "Couldn't send it. It may already be with the client." };
  try {
    await notifyClientDeliverablePublished(id);
  } catch (e) {
    console.error("notifyClientDeliverablePublished failed", e);
  }
  refresh(data.project_id);
  return { error: null, message: "Sent to the client for approval." };
}

export async function deleteDeliverable(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("deliverables").delete().eq("id", id).eq("status", "draft").select("project_id, file_path").maybeSingle();
  if (!data) return { error: "Only drafts can be deleted." };
  if (data.file_path) await removeObject(data.file_path);
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
  const { data } = await supabase.from("updates").delete().eq("id", id).select("project_id").maybeSingle();
  if (data) refresh(data.project_id);
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
  const { data: old } = await supabase.from("deliverables").select("file_path").eq("id", deliverableId).single();
  const { error } = await supabase.from("deliverables").update({ file_path: file.path }).eq("id", deliverableId).eq("project_id", projectId);
  if (!error && old?.file_path) await removeObject(old.file_path);
  refresh(projectId);
  return { error: error ? "Couldn't attach the file." : null };
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
