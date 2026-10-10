"use client";
import { useActionState, useState } from "react";
import { Button, Field, FormMessage, Textarea } from "@/components/ui";
import { decideDeliverable, type PortalResult } from "../../actions";

export function DecisionForm({ deliverableId }: { deliverableId: string }) {
  const [state, action, pending] = useActionState<PortalResult, FormData>(decideDeliverable.bind(null, deliverableId), { error: null });
  const [mode, setMode] = useState<"approve" | "changes">("approve");
  if (state.message) return <FormMessage success={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <p className="font-bold">Ready for your review</p>
      {mode === "changes" ? (
        <Field label="What should change?" htmlFor="feedback">
          <Textarea id="feedback" name="feedback" required autoFocus />
        </Field>
      ) : (
        <Field label="Notes (optional)" htmlFor="feedback"><Textarea id="feedback" name="feedback" rows={2} /></Field>
      )}
      <FormMessage error={state.error} />
      <div className="flex flex-wrap gap-3">
        {mode === "approve" ? (
          <>
            <Button type="submit" name="decision" value="approved" disabled={pending}>Approve</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("changes")}>Request changes</Button>
          </>
        ) : (
          <>
            <Button type="submit" name="decision" value="changes_requested" disabled={pending}>Send change request</Button>
            <Button type="button" variant="secondary" onClick={() => setMode("approve")}>Cancel</Button>
          </>
        )}
      </div>
    </form>
  );
}
