"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormMessage, Input, StatusPill, Textarea } from "@/components/ui";
import { FileUploader } from "@/components/file-uploader";
import type { DeliverableRow, FileRow } from "@/lib/types";
import type { ActionResult } from "../../actions";
import {
  attachDeliverableFile, createAdminUpload, createDeliverable, editDeliverable, deleteDeliverable, deleteFile, deleteUpdate,
  postUpdate, publishDeliverable, recordProjectFile, setRequestStatus,
} from "../../project-actions";

export function NewDeliverableForm({ projectId, tasks }: { projectId: string; tasks: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(createDeliverable.bind(null, projectId), { error: null });
  return (
    <details className="rounded-lg border border-line p-4">
      <summary className="cursor-pointer font-semibold text-link">New deliverable</summary>
      <form action={action} className="mt-4 space-y-4">
        <Field label="Title" htmlFor="title"><Input id="title" name="title" required /></Field>
        <Field label="Description" htmlFor="description"><Textarea id="description" name="description" /></Field>
        <Field label="Link (optional)" htmlFor="link_url" hint="Figma, Google Doc, staging site…"><Input id="link_url" name="link_url" type="url" /></Field>
        <Field label="Linked ClickUp task (optional)" htmlFor="clickup_task_id" hint="The client's decision is posted to this task as a comment.">
          <select id="clickup_task_id" name="clickup_task_id" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">None — post to the project list</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <FormMessage error={state.error} success={state.message} />
        <Button type="submit" disabled={pending}>Create draft</Button>
      </form>
    </details>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return { pending, result, run: (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn())) };
}

export type DeliverableWithVersion = DeliverableRow & { current_version: { file_path: string | null; link_url: string | null } | null };

function EditDeliverableForm({ d, tasks }: { d: DeliverableWithVersion; tasks: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(editDeliverable.bind(null, d.id), { error: null });
  return (
    <details className="mt-4 rounded-lg border border-line p-4">
      <summary className="cursor-pointer text-sm font-semibold text-link">Edit details</summary>
      <form action={action} className="mt-4 space-y-4">
        <Field label="Title" htmlFor={`title-${d.id}`}><Input id={`title-${d.id}`} name="title" required defaultValue={d.title} /></Field>
        <Field label="Description" htmlFor={`description-${d.id}`}><Textarea id={`description-${d.id}`} name="description" defaultValue={d.description ?? ""} /></Field>
        <Field label="Link (optional)" htmlFor={`link_url-${d.id}`}><Input id={`link_url-${d.id}`} name="link_url" type="url" defaultValue={d.current_version?.link_url ?? ""} /></Field>
        <Field label="Linked ClickUp task (optional)" htmlFor={`clickup_task_id-${d.id}`}>
          <select id={`clickup_task_id-${d.id}`} name="clickup_task_id" defaultValue={d.clickup_task_id ?? ""} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="">None — post to the project list</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <FormMessage error={state.error} success={state.message} />
        <Button type="submit" disabled={pending}>Save changes</Button>
      </form>
    </details>
  );
}

export function DeliverableCard({ deliverable: d, tasks }: { deliverable: DeliverableWithVersion; tasks: { id: string; name: string }[] }) {
  const { pending, result, run } = useAction();
  const editable = d.status === "draft" || d.status === "changes_requested";
  const filePath = d.current_version?.file_path ?? null;
  const linkUrl = d.current_version?.link_url ?? null;
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/admin/deliverables/${d.id}`} className="font-bold hover:text-link">{d.title}</Link>
        <StatusPill status={d.status} />
      </div>
      {d.description ? <p className="mt-2 whitespace-pre-line text-sm text-muted">{d.description}</p> : null}
      <p className="mt-2 text-sm">
        {filePath ? "File attached" : "No file"}{linkUrl ? <> · <a className="font-semibold text-link" href={linkUrl} target="_blank" rel="noreferrer">Link</a></> : null}
      </p>
      {d.status === "changes_requested" ? (
        <p className="mt-3 text-sm"><Link href={`/admin/deliverables/${d.id}`} className="font-semibold text-link">See the client&apos;s feedback</Link></p>
      ) : null}
      {editable ? <EditDeliverableForm d={d} tasks={tasks} /> : null}
      {editable ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <FileUploader projectId={d.project_id} kind="deliverables" label={filePath ? "Replace file" : "Attach file"}
            createUpload={createAdminUpload} record={attachDeliverableFile.bind(null, d.id)} />
          <Button type="button" disabled={pending || (!filePath && !linkUrl)} onClick={() => run(() => publishDeliverable(d.id))}>
            {d.status === "draft" ? "Send for approval" : "Send revised version"}
          </Button>
          {d.status === "draft" ? <Button type="button" variant="danger" disabled={pending} onClick={() => run(() => deleteDeliverable(d.id))}>Delete</Button> : null}
        </div>
      ) : null}
      <div className="mt-2"><FormMessage error={result?.error} success={result?.message} /></div>
    </div>
  );
}

export function UpdateForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(postUpdate.bind(null, projectId), { error: null });
  return (
    <form action={action} className="space-y-3">
      <Textarea name="body" aria-label="Update for the client" placeholder="What should the client know this week?" required />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>Post update</Button>
    </form>
  );
}

export function DeleteUpdateButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return <button type="button" className="mt-1 text-xs font-semibold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => deleteUpdate(id))}>Delete</button>;
}

export function ProjectFiles({ projectId, files }: { projectId: string; files: FileRow[] }) {
  const { pending, run } = useAction();
  return (
    <div className="space-y-4">
      <FileUploader projectId={projectId} kind="files" createUpload={createAdminUpload} record={recordProjectFile} />
      <ul className="divide-y divide-line text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between py-2">
            <span>{f.name}</span>
            <button type="button" className="text-xs font-semibold text-muted hover:text-danger" disabled={pending} onClick={() => run(() => deleteFile(f.id))}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RequestRowActions({ id, status }: { id: string; status: "open" | "done" }) {
  const { pending, run } = useAction();
  return (
    <button type="button" className="mt-2 text-sm font-semibold text-link" disabled={pending}
      onClick={() => run(() => setRequestStatus(id, status === "open" ? "done" : "open"))}>
      {status === "open" ? "Mark done" : "Reopen"}
    </button>
  );
}
