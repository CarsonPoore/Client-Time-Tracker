import type { CommentRow } from "@/lib/types";

export function authorName(c: CommentRow, names: Record<string, string>, viewerRole: "client" | "admin") {
  if (c.author_role === "admin") return c.author_id && names[c.author_id] && viewerRole === "admin" ? names[c.author_id] : "Carson";
  return (c.author_id && names[c.author_id]) || "Client";
}

export function CommentThread({ comments, names, attachmentUrls, viewerRole }: {
  comments: CommentRow[]; names: Record<string, string>; attachmentUrls: Record<string, string | null>; viewerRole: "client" | "admin";
}) {
  if (!comments.length) return <p className="text-sm text-muted">No comments yet.</p>;
  let pin = 0;
  return (
    <ol className="space-y-4">
      {comments.map((c) => {
        const pinNo = c.pin_x != null ? ++pin : null;
        return (
          <li key={c.id} id={`comment-${c.id}`} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {pinNo && <span aria-label={`Pin ${pinNo}`} className="grid h-5 w-5 place-items-center rounded-full bg-royal text-xs text-white">{pinNo}</span>}
              <strong>{authorName(c, names, viewerRole)}</strong>
              {c.kind === "decision" && <span className="rounded bg-warn/15 px-1.5 text-xs font-semibold text-warn">Requested changes</span>}
              <time className="text-muted" dateTime={c.created_at}>
                {new Date(c.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            {c.attachments.length > 0 && (
              <ul aria-label="Attachments" className="mt-2 flex flex-wrap gap-2 text-sm">
                {c.attachments.map((a) => (
                  <li key={a.id}>
                    {attachmentUrls[a.id] ? <a className="text-link underline" href={attachmentUrls[a.id]!}>{a.name}</a> : a.name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
