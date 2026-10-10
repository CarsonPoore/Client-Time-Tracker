"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, FormMessage, Input, Textarea } from "@/components/ui";
import type { ActionResult } from "../actions";
import { addTimeEntry, deleteTimeEntry, updateTimeEntry } from "../time-actions";

const selectCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg";
const LAST_KEY = "cpc.time.last";
const QUICK = ["0.25", "0.5", "1", "2"];

type Client = { id: string; name: string };
type Project = { id: string; name: string; client_id: string };
export type EditableEntry = { id: string; client_id: string; project_id: string | null; work_date: string; minutes: number; note: string | null };

function readLast(): { client_id: string; project_id: string } | null {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null"); } catch { return null; }
}
function writeLast(v: { client_id: string; project_id: string }) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

/** Client, project, date, hours (with quick picks) and note. Shared by the add and inline-edit forms. */
function EntryFields({ clients, projects, idPrefix, initial }: {
  clients: Client[]; projects: Project[]; idPrefix: string;
  initial: { client_id: string; project_id: string; work_date: string; hours: string; note: string };
}) {
  const [clientId, setClientId] = useState(initial.client_id);
  const [projectId, setProjectId] = useState(initial.project_id);
  const [hours, setHours] = useState(initial.hours);
  useEffect(() => { setClientId(initial.client_id); setProjectId(initial.project_id); }, [initial.client_id, initial.project_id]);
  const options = projects.filter((p) => p.client_id === clientId);
  const id = (n: string) => `${idPrefix}${n}`;
  return (
    <>
      <Field label="Client" htmlFor={id("client_id")}>
        <select id={id("client_id")} name="client_id" required className={selectCls} value={clientId}
          onChange={(e) => { setClientId(e.target.value); setProjectId(""); }}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Project" htmlFor={id("project_id")}>
        <select id={id("project_id")} name="project_id" className={selectCls} disabled={!clientId} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">No project</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor={id("work_date")}><Input id={id("work_date")} name="work_date" type="date" defaultValue={initial.work_date} required /></Field>
        <Field label="Hours" htmlFor={id("hours")} hint="1.5 or 1:30. Rounded up to 15 min.">
          <Input id={id("hours")} name="hours" inputMode="decimal" required value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick hours">
        {QUICK.map((h) => (
          <button key={h} type="button" onClick={() => setHours(h)} aria-pressed={hours === h}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${hours === h ? "border-royal bg-royal text-white" : "border-line text-fg hover:border-royal"}`}>
            {h} h
          </button>
        ))}
      </div>
      <Field label="Note" htmlFor={id("note")}><Textarea id={id("note")} name="note" rows={2} maxLength={500} defaultValue={initial.note} /></Field>
    </>
  );
}

export function TimeEntryForm({ clients, projects, today }: { clients: Client[]; projects: Project[]; today: string }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const r = await addTimeEntry(prev, form);
    if (!r.error) writeLast({ client_id: String(form.get("client_id") ?? ""), project_id: String(form.get("project_id") ?? "") });
    return r;
  }, { error: null });
  const [last, setLast] = useState({ client_id: "", project_id: "" });
  const [formKey, setFormKey] = useState(0);
  const prevState = useRef(state);
  useEffect(() => {
    const l = readLast();
    if (l && clients.some((c) => c.id === l.client_id)) {
      setLast({ client_id: l.client_id, project_id: projects.some((p) => p.id === l.project_id && p.client_id === l.client_id) ? l.project_id : "" });
    }
  }, [clients, projects]);
  useEffect(() => {
    // After a successful save, reset hours/note but keep the remembered client/project.
    if (state !== prevState.current && !state.error) { const l = readLast(); if (l) setLast(l); setFormKey((k) => k + 1); }
    prevState.current = state;
  }, [state]);
  return (
    <form action={action} className="space-y-4" key={formKey}>
      <EntryFields clients={clients} projects={projects} idPrefix="new-" initial={{ ...last, work_date: today, hours: "", note: "" }} />
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log time"}</Button>
    </form>
  );
}

export function EditEntryForm({ entry, clients, projects, onDone }: { entry: EditableEntry; clients: Client[]; projects: Project[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, form) => {
    const r = await updateTimeEntry(entry.id, prev, form);
    if (!r.error) onDone();
    return r;
  }, { error: null });
  return (
    <form action={action} className="space-y-4 rounded-lg border border-royal p-4">
      <EntryFields clients={clients} projects={projects} idPrefix={`e-${entry.id}-`}
        initial={{ client_id: entry.client_id, project_id: entry.project_id ?? "", work_date: entry.work_date, hours: String(entry.minutes / 60), note: entry.note ?? "" }} />
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
      </div>
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
