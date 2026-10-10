"use client";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/ui";
import { setSpaceIsClient, type ActionResult } from "../actions";

export function SpaceToggle({ spaceId, name, checked }: { spaceId: string; name: string; checked: boolean }) {
  const [value, setValue] = useState(checked);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="font-semibold">{name}</span>
      <input type="checkbox" className="size-5 accent-royal" checked={value} disabled={pending}
        onChange={(e) => { const next = e.target.checked; setValue(next); start(async () => { const r = await setSpaceIsClient(spaceId, name, next); if (r.error) setValue(!next); }); }} />
    </label>
  );
}

export function ActionButton({ action, label, variant = "primary" }: { action: () => Promise<ActionResult>; label: string; variant?: "primary" | "secondary" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" variant={variant} disabled={pending} onClick={() => start(async () => setResult(await action()))}>
        {pending ? "Working…" : label}
      </Button>
      <FormMessage error={result?.error} success={result?.message} />
    </div>
  );
}
