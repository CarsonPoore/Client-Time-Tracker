import "server-only";
import type { DeliverableThread } from "@/lib/portal-data";
import { signedDownloadUrl } from "@/lib/storage";

/** Signs every version file and comment attachment in a thread. Link-only versions map to null. */
export async function signThreadUrls(t: Pick<DeliverableThread, "versions" | "comments">) {
  const fileEntries = await Promise.all(t.versions.map(async (v) => [v.id, v.file_path ? await signedDownloadUrl(v.file_path) : null] as const));
  const atts = Object.values(t.comments).flat().flatMap((c) => c.attachments);
  const attEntries = await Promise.all(atts.map(async (a) => [a.id, await signedDownloadUrl(a.storage_path)] as const));
  return {
    fileUrls: Object.fromEntries(fileEntries) as Record<string, string | null>,
    attachmentUrls: Object.fromEntries(attEntries) as Record<string, string | null>,
  };
}
