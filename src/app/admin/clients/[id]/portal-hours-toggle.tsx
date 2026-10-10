"use client";
import { useState, useTransition } from "react";
import { setPortalHours } from "../../time-actions";

export function PortalHoursToggle({ clientId, checked }: { clientId: string; checked: boolean }) {
  const [value, setValue] = useState(checked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 border-t border-line pt-4">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="font-semibold">Show hours this month</span>
          <span className="block text-sm text-muted">Project totals only. Notes and entries stay private.</span>
        </span>
        <input type="checkbox" className="size-5 shrink-0 accent-royal" checked={value} disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setValue(next);
            start(async () => { const r = await setPortalHours(clientId, next); setError(r.error); if (r.error) setValue(!next); });
          }} />
      </label>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
