"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { requestReset, type ForgotState } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestReset, { error: null, sent: false });
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-black">Reset your password</h1>
        <FormMessage error={state.error} success={state.sent ? "If that email has an account, a reset link is on its way." : null} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>Send reset link</Button>
        <Link href="/login" className="block text-sm font-semibold text-royal">Back to sign in</Link>
      </form>
    </div>
  );
}
