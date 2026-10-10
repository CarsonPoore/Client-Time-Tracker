"use client";
import { useState, useTransition } from "react";
import { Button, FormMessage } from "@/components/ui";
import type { ActionResult } from "../../actions";
import { linkQuickBooksCustomer } from "../../quickbooks-actions";

export function QuickBooksLink({ clientId, linkedId, suggestedId, customers }: {
  clientId: string;
  linkedId: string | null;
  suggestedId: string | null;
  customers: { id: string; displayName: string; email: string | null }[];
}) {
  const [value, setValue] = useState(linkedId ?? suggestedId ?? "");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const save = (id: string) => start(async () => setResult(await linkQuickBooksCustomer(clientId, id)));
  return (
    <div className="space-y-3">
      <label htmlFor="qb_customer" className="block text-sm font-semibold">QuickBooks customer</label>
      <select id="qb_customer" value={value} disabled={pending} onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
        <option value="">Not linked</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>{c.displayName}{c.email ? ` (${c.email})` : ""}{c.id === suggestedId && !linkedId ? " (suggested)" : ""}</option>
        ))}
      </select>
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={pending || value === (linkedId ?? "")} onClick={() => save(value)}>
          {pending ? "Saving…" : "Save link"}
        </Button>
      </div>
      <FormMessage error={result?.error} success={result?.message} />
    </div>
  );
}
