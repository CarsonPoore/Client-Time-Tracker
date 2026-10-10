export const MAX_ATTACHMENT_BYTES = 26214400;
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/zip",
]);

export function revisionLabel(n: number, limit: number | null): { text: string; over: boolean } {
  if (!limit) return { text: `Revision ${n}`, over: false };
  if (n > limit) return { text: `Over limit (${n} of ${limit})`, over: true };
  return { text: `Revision ${n} of ${limit}`, over: false };
}

const clampPct = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;

export function pinFromClick(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return {
    x: clampPct(((clientX - rect.left) / rect.width) * 100),
    y: clampPct(((clientY - rect.top) / rect.height) * 100),
  };
}

export function validateAttachment(f: { name: string; size: number; type: string }): string | null {
  if (f.size <= 0) return "That file is empty.";
  if (f.size > MAX_ATTACHMENT_BYTES) return "Files must be 25 MB or smaller.";
  if (!ALLOWED_MIME.has(f.type)) return "That file type isn't supported. Use an image, PDF, Office document, text, CSV or zip.";
  return null;
}

export function parseComment(form: FormData):
  { ok: true; body: string; pin: { x: number; y: number } | null } | { ok: false; error: string } {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > 5000) return { ok: false, error: "Keep comments under 5,000 characters." };
  const rx = form.get("pin_x"), ry = form.get("pin_y");
  if (rx == null && ry == null) return { ok: true, body, pin: null };
  const x = Number(rx), y = Number(ry);
  if (rx == null || ry == null || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return { ok: false, error: "That pin is off the image." };
  }
  return { ok: true, body, pin: { x, y } };
}

export function versionErrorMessage(message: string): string {
  if (message.includes("not_current_version")) return "A newer version was posted. Refresh to see it.";
  if (message.includes("not_awaiting_approval")) return "This version has already been decided.";
  if (message.includes("feedback_required")) return "Tell us what to change.";
  if (message.includes("not_found")) return "We couldn't find that version.";
  return "Something went wrong. Please try again.";
}

export function isImagePath(path: string | null): boolean {
  return !!path && /\.(png|jpe?g|gif|webp)$/i.test(path);
}

/** Exact match for `<projectId>/comments/<commentId>/<one filename segment>`; rejects traversal and backslashes. */
export function isCommentPath(path: string, projectId: string, commentId: string): boolean {
  if (path.includes("..") || path.includes("\\")) return false;
  const prefix = `${projectId}/comments/${commentId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

type CommentProjectRow = { version: { deliverable: { project_id: string } | null } | null } | null;
export const COMMENT_PROJECT_SELECT = "id, author_id, version:deliverable_versions(deliverable:deliverables!deliverable_versions_deliverable_id_fkey(project_id))";
export function commentProjectId(row: unknown): string | null {
  return (row as CommentProjectRow)?.version?.deliverable?.project_id ?? null;
}

/** A comment is pinned only when both coordinates are present. */
export function hasPin(c: { pin_x: number | null; pin_y: number | null }): boolean {
  return c.pin_x != null && c.pin_y != null;
}

/** Returns the pending pin only if it was dropped on the version being shown. */
export function pinForVersion(pin: { versionId: string; x: number; y: number } | null, versionId: string) {
  return pin && pin.versionId === versionId ? { x: pin.x, y: pin.y } : null;
}
