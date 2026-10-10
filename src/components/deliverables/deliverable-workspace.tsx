"use client";
import { useState } from "react";
import type { DeliverableThread } from "@/lib/portal-data";
import { isImagePath, pinForVersion, revisionLabel } from "@/lib/revisions";
import { CommentComposer } from "./comment-composer";
import { CommentThread } from "./comment-thread";
import { DecisionBar } from "./decision-bar";
import { PinLayer } from "./pin-layer";
import { VersionTabs } from "./version-tabs";

export type WorkspaceActions = {
  addComment: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; commentId?: string }>;
  createUpload: (commentId: string, file: { name: string; size: number; type: string }) => Promise<{ error: string } | { path: string; token: string }>;
  attach: (commentId: string, file: { path: string; name: string; size: number; type: string }) => Promise<{ error: string | null }>;
  decide?: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; message?: string }>;
} | null;

export function DeliverableWorkspace({ thread, fileUrls, attachmentUrls, role, readOnly, selectedVersionId, actions, hrefFor = (id) => `?v=${id}` }: {
  thread: DeliverableThread; fileUrls: Record<string, string | null>; attachmentUrls: Record<string, string | null>;
  role: "client" | "admin"; readOnly: boolean; selectedVersionId?: string; actions: WorkspaceActions; hrefFor?: (id: string) => string;
}) {
  const { deliverable: d, versions, comments, names } = thread;
  const [pendingPin, setPendingPin] = useState<{ versionId: string; x: number; y: number } | null>(null);
  const current = versions.find((v) => v.id === d.current_version_id) ?? versions[versions.length - 1];
  if (!current) return <p className="text-sm text-muted">No versions yet.</p>;
  const selected = versions.find((v) => v.id === selectedVersionId) ?? current;
  const pin = pinForVersion(pendingPin, selected.id);
  const label = revisionLabel(current.number, d.revision_limit);
  const url = fileUrls[selected.id] ?? null;
  const canWrite = !readOnly && !!actions;
  const decider = selected.decided_by ? names[selected.decided_by] ?? "the client" : null;
  const showDecision = canWrite && role === "client" && selected.id === current.id && selected.status === "awaiting_approval";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className={`text-sm font-semibold ${label.over ? "text-warn" : "text-muted"}`}>{label.text}</p>
        {versions.length > 1 && <VersionTabs versions={versions} selectedId={selected.id} currentId={current.id} hrefFor={hrefFor} />}
      </header>

      <section aria-label={`Version ${selected.number}`} className="space-y-3">
        {selected.notes && <p className="whitespace-pre-wrap">{selected.notes}</p>}
        {url && isImagePath(selected.file_path)
          ? <PinLayer src={url} alt={`${d.title} v${selected.number}`} comments={comments[selected.id] ?? []}
              onPick={canWrite ? (p) => setPendingPin({ versionId: selected.id, ...p }) : null} picked={pin} />
          : url ? <a className="text-link underline" href={url}>Download v{selected.number}</a> : null}
        {selected.link_url && <a className="block text-link underline" href={selected.link_url} rel="noopener noreferrer" target="_blank">Open link</a>}
        {selected.status === "approved" && selected.decided_at &&
          <p className="text-sm text-ok">Approved v{selected.number} on {new Date(selected.decided_at).toLocaleDateString("en-US", { dateStyle: "medium" })}{decider ? ` by ${decider}` : ""}</p>}
      </section>

      {showDecision && <DecisionBar versionId={selected.id} deliverableId={d.id} decide={actions!.decide} />}

      <section aria-label="Comments" className="space-y-4">
        <h2 className="text-lg font-semibold">Comments on v{selected.number}</h2>
        <CommentThread comments={comments[selected.id] ?? []} names={names} attachmentUrls={attachmentUrls} viewerRole={role} />
        {canWrite && <CommentComposer key={selected.id} versionId={selected.id} deliverableId={d.id} actions={actions!} pin={pin} clearPin={() => setPendingPin(null)} />}
      </section>
    </div>
  );
}
