"use client";
import { useActionState, useState } from "react";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";
import { FileUploader, type UploadedFile } from "@/components/file-uploader";
import type { ActionResult } from "../../actions";
import { createAdminUpload, publishVersion, setRevisionLimit } from "../../project-actions";

function RevisionLimitForm({ deliverableId, revisionLimit }: { deliverableId: string; revisionLimit: number | null }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(setRevisionLimit.bind(null, deliverableId), { error: null });
  return (
    <form action={action} className="space-y-3">
      <Field label="Revision limit" htmlFor="revision_limit" hint="Blank for no limit.">
        <Input id="revision_limit" name="revision_limit" type="number" min={1} max={50} defaultValue={revisionLimit ?? ""} />
      </Field>
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" variant="secondary" disabled={pending}>Save limit</Button>
    </form>
  );
}

function NewVersionForm({ deliverableId, projectId }: { deliverableId: string; projectId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(publishVersion.bind(null, deliverableId), { error: null });
  const [file, setFile] = useState<UploadedFile | null>(null);
  async function record(_projectId: string, f: UploadedFile) {
    setFile(f);
    return { error: null };
  }
  return (
    <form action={action} className="space-y-3">
      <div>
        <FileUploader projectId={projectId} kind="deliverables" label={file ? "Replace file" : "Choose file"}
          createUpload={createAdminUpload} record={record} />
        {file ? <p className="mt-1 text-sm text-muted">Ready: {file.name}</p> : null}
        <input type="hidden" name="file_path" value={file?.path ?? ""} />
      </div>
      <Field label="Link (optional)" htmlFor="new_link_url"><Input id="new_link_url" name="link_url" type="url" /></Field>
      <Field label="Notes for the client" htmlFor="new_notes"><Textarea id="new_notes" name="notes" /></Field>
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>Send new version</Button>
    </form>
  );
}

export function AdminControls({ deliverableId, projectId, revisionLimit, labelText, over, expanded }: {
  deliverableId: string; projectId: string; revisionLimit: number | null; labelText: string; over: boolean; expanded: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-muted">{labelText}</p>
        {over ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Over revision limit</span> : null}
      </div>
      {expanded ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Upload new version</h2>
          <NewVersionForm deliverableId={deliverableId} projectId={projectId} />
        </section>
      ) : (
        <details className="rounded-lg border border-line p-4">
          <summary className="cursor-pointer font-semibold text-link">⋯ More</summary>
          <div className="mt-4 space-y-3">
            <h2 className="text-lg font-bold">Upload new version</h2>
            <NewVersionForm deliverableId={deliverableId} projectId={projectId} />
          </div>
        </details>
      )}
      <RevisionLimitForm deliverableId={deliverableId} revisionLimit={revisionLimit} />
    </div>
  );
}
