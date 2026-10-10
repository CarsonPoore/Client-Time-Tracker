"use client";
import { useActionState, useTransition, useState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { inviteClient, updateClient, type ActionResult } from "../../actions";
import type { ClientRow } from "@/lib/types";

export function ClientForm({ client }: { client: ClientRow }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateClient.bind(null, client.id), { error: null });
  return (
    <form action={action} className="space-y-4">
      <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={client.name} required /></Field>
      <Field label="Main contact" htmlFor="contact_name"><Input id="contact_name" name="contact_name" defaultValue={client.contact_name ?? ""} /></Field>
      <Field label="Contact email" htmlFor="contact_email" hint="The portal invite goes here.">
        <Input id="contact_email" name="contact_email" type="email" defaultValue={client.contact_email ?? ""} />
      </Field>
      <Field label="QuickBooks invoices link" htmlFor="quickbooks_invoices_url">
        <Input id="quickbooks_invoices_url" name="quickbooks_invoices_url" type="url" defaultValue={client.quickbooks_invoices_url ?? ""} />
      </Field>
      <FormMessage error={state.error} success={state.message} />
      <Button type="submit" disabled={pending}>Save</Button>
    </form>
  );
}

export function InviteButton({ clientId, invited }: { clientId: string; invited: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await inviteClient(clientId)))}>
        {invited ? "Resend sign-in link" : "Send portal invite"}
      </Button>
      <FormMessage error={result?.error} success={result?.message} />
    </div>
  );
}
