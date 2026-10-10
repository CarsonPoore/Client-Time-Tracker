import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET = "project-files";

export function buildStoragePath(projectId: string, fileName: string, kind: "files" | "deliverables", id: string = randomUUID()): string {
  // A dot only starts an extension if no path separator follows it ("../../etc/passwd" has none).
  const lastDot = fileName.lastIndexOf(".");
  const dot = /[\\/]/.test(fileName.slice(lastDot + 1)) ? -1 : lastDot;
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "file";
  return `${projectId}/${kind}/${id}-${slug}${ext ? `.${ext}` : ""}`;
}

export async function signedDownloadUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function createSignedUpload(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path, token: data.token };
}

export async function removeObject(path: string): Promise<void> {
  await createAdminClient().storage.from(BUCKET).remove([path]);
}
