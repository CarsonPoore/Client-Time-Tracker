"use client";
import { useActionState } from "react";
import { Button, FormMessage, Textarea } from "@/components/ui";
import { submitRequest, type PortalResult } from "@/app/portal/actions";

export function RequestForm({ projectId, deliverableId, preview = false }: { projectId: string; deliverableId?: string; preview?: boolean }) {
  const [state, action, pending] = useActionState<PortalResult, FormData>(submitRequest, { error: null });
  return (
    <form action={preview ? undefined : action} className="space-y-3">
      <fieldset disabled={preview} className="space-y-3">
      <input type="hidden" name="project_id" value={projectId} />
      {deliverableId ? <input type="hidden" name="deliverable_id" value={deliverableId} /> : null}
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Type</legend>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="request" defaultChecked className="accent-royal" /> New request</label>
        <label className="flex items-center gap-2"><input type="radio" name="kind" value="comment" className="accent-royal" /> Comment</label>
      </fieldset>
      <Textarea name="body" aria-label="Your message" placeholder="What do you need?" required />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending || preview}>{pending ? "Sending…" : "Send"}</Button>
      </fieldset>
      {preview ? <p className="text-xs text-muted">Disabled in preview.</p> : null}
    </form>
  );
}
