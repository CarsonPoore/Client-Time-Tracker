"use client";
import { useActionState, useState } from "react";
import { Button, FormMessage, Textarea } from "@/components/ui";

type DecideResult = { error: string | null; message?: string };
type Decide = (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; message?: string }>;

export function DecisionBar({ versionId, deliverableId, decide }: { versionId: string; deliverableId: string; decide?: Decide }) {
  const [changes, setChanges] = useState(false);
  const [state, submit, pending] = useActionState(
    async (prev: DecideResult, form: FormData): Promise<DecideResult> =>
      decide ? decide(versionId, deliverableId, prev, form) : { error: "Decisions aren't available right now." },
    { error: null } as DecideResult,
  );
  if (state.message) return <p role="status" className="rounded-lg bg-ok/15 p-3 text-ok">{state.message}</p>;
  const fid = `feedback-${versionId}`;
  return (
    <form action={submit} className="space-y-3 rounded-lg border border-line bg-surface p-3">
      {changes && <div className="space-y-1.5">
        <label htmlFor={fid} className="block text-sm font-semibold">What should change?</label>
        <Textarea id={fid} name="feedback" required maxLength={5000} rows={3} />
      </div>}
      <FormMessage error={state.error} />
      <div className="flex flex-wrap gap-2">
        {changes ? <>
          <Button name="decision" value="changes_requested" disabled={pending}>Send changes</Button>
          <Button type="button" variant="secondary" onClick={() => setChanges(false)}>Cancel</Button>
        </> : <>
          <Button name="decision" value="approved" disabled={pending}>Approve</Button>
          <Button type="button" variant="secondary" onClick={() => setChanges(true)}>Request changes</Button>
        </>}
      </div>
    </form>
  );
}
