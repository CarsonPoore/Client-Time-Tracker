"use client";
import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { setPassword, type PasswordState } from "./actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { error: null });
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-black">Set your password</h1>
        <FormMessage error={state.error} />
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>Save password</Button>
      </form>
    </div>
  );
}
