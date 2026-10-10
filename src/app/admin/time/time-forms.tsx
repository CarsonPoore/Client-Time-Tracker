"use client";
import { useActionState, useState, useTransition } from "react";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";
import type { ActionResult } from "../actions";
import { addTimeEntry, deleteTimeEntry } from "../time-actions";

const selectCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg";

export function TimeEntryForm({ clients, projects, today }: {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; client_id: string }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTimeEntry, { error: null });
  const [clientId, setClientId] = useState("");
  const options = projects.filter((p) => p.client_id === clientId);
  return (
    <form action={action} className="space-y-4">
      <Field label="Client" htmlFor="client_id">
        <select id="client_id" name="client_id" required className={selectCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Project" htmlFor="project_id">
        <select id="project_id" name="project_id" key={clientId} className={selectCls} disabled={!clientId}>
          <option value="">No project</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" htmlFor="work_date"><Input id="work_date" name="work_date" type="date" defaultValue={today} required /></Field>
        <Field label="Hours" htmlFor="hours" hint="1.5 or 1:30. Rounded up to 15 min.">
          <Input id="hours" name="hours" inputMode="decimal" required />
        </Field>
      </div>
      <Field label="Note" htmlFor="note"><Textarea id="note" name="note" rows={2} maxLength={500} /></Field>
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log time"}</Button>
    </form>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={pending} className="text-sm font-semibold text-danger hover:underline disabled:opacity-50"
        onClick={() => { if (confirm("Delete this time entry?")) start(async () => setError((await deleteTimeEntry(id)).error)); }}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <span className="ml-2 text-sm text-danger">{error}</span> : null}
    </>
  );
}
