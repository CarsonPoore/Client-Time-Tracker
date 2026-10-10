"use client";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/ui";
import type { ActivityItem } from "@/lib/admin-data";
import { loadMoreActivity } from "../../activity-actions";
import { ActivityRowItem } from "./activity-row";

export function ActivityMore({ clientId, nextBefore }: { clientId: string; nextBefore: string | null }) {
  const [rows, setRows] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState(nextBefore);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function more() {
    if (!cursor) return;
    start(async () => {
      try {
        const r = await loadMoreActivity(clientId, cursor);
        setRows((prev) => [...prev, ...r.rows]);
        setCursor(r.nextBefore);
        setError(null);
      } catch {
        setError("Couldn't load more activity.");
      }
    });
  }
  return (
    <>
      {rows.length ? <ul className="divide-y divide-line border-t border-line">{rows.map((r) => <ActivityRowItem key={r.id} row={r} />)}</ul> : null}
      {cursor ? <div className="mt-3"><Button type="button" variant="secondary" disabled={pending} onClick={more}>{pending ? "Loading…" : "Load more"}</Button></div> : null}
      <FormMessage error={error} />
    </>
  );
}
