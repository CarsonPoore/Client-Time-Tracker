"use client";
import { useActionState, useTransition } from "react";
import { Button, FormMessage, Textarea } from "@/components/ui";
import { fileDownloadUrl, submitRequest, type PortalResult } from "../../actions";

export function RequestForm({ projectId, deliverableId }: { projectId: string; deliverableId?: string }) {
  const [state, action, pending] = useActionState<PortalResult, FormData>(submitRequest, { error: null });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {deliverableId ? <input type="hidden" name="deliverable_id" value={deliverableId} /> : null}
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Type</legend>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="request" defaultChecked className="accent-royal" /> New request</label>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="comment" className="accent-royal" /> Comment</label>
      </fieldset>
      <Textarea name="body" aria-label="Your message" placeholder="What do you need?" required />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
    </form>
  );
}

export function FileLink({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="text-left font-semibold text-royal hover:underline"
      onClick={() => start(async () => { const url = await fileDownloadUrl(id); if (url) window.open(url, "_blank", "noopener"); })}>
      {pending ? "Preparing…" : name}
    </button>
  );
}
