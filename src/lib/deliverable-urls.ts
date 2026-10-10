import "server-only";
import type { DeliverableThread } from "@/lib/portal-data";
import { isCommentPath } from "@/lib/revisions";
import { signedDownloadUrl } from "@/lib/storage";

type ThreadForUrls = Pick<DeliverableThread, "versions" | "comments"> & { deliverable: { project_id: string } };

/**
 * Signs every version file and comment attachment in a thread. Link-only versions map to null.
 * Defence in depth: an attachment is signed only when its path sits directly in its own comment's folder.
 */
export async function signThreadUrls(t: ThreadForUrls) {
  const projectId = t.deliverable.project_id;
  const fileEntries = await Promise.all(t.versions.map(async (v) => [v.id, v.file_path ? await signedDownloadUrl(v.file_path) : null] as const));
  const atts = Object.values(t.comments).flat().flatMap((c) => c.attachments.map((a) => ({ a, commentId: c.id })));
  const attEntries = await Promise.all(atts.map(async ({ a, commentId }) =>
    [a.id, isCommentPath(a.storage_path, projectId, commentId) ? await signedDownloadUrl(a.storage_path) : null] as const));
  return {
    fileUrls: Object.fromEntries(fileEntries) as Record<string, string | null>,
    attachmentUrls: Object.fromEntries(attEntries) as Record<string, string | null>,
  };
}
