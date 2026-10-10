"use client";
import { useState } from "react";
import { formatDate } from "@/components/ui";
import { formatHours } from "@/lib/time";
import { DeleteEntryButton, EditEntryForm, type EditableEntry } from "./time-forms";

export type ListEntry = EditableEntry & { clientName: string; projectName: string | null };

/** Stacked rows (not a table) so the list fits a phone with no horizontal scroll. */
export function EntryList({ entries, clients, projects }: {
  entries: ListEntry[]; clients: { id: string; name: string }[]; projects: { id: string; name: string; client_id: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => (
        <li key={e.id} className="py-3">
          {editing === e.id ? (
            <EditEntryForm entry={e} clients={clients} projects={projects} onDone={() => setEditing(null)} />
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{e.clientName}<span className="font-normal text-muted"> · {e.projectName ?? "No project"}</span></p>
                <p className="text-sm text-muted">{formatDate(e.work_date)}</p>
                {e.note ? <p className="mt-1 break-words text-sm">{e.note}</p> : null}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-semibold tabular-nums">{formatHours(e.minutes)} h</span>
                <button type="button" className="text-sm font-semibold text-link hover:underline" onClick={() => setEditing(e.id)}>Edit</button>
                <DeleteEntryButton id={e.id} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
