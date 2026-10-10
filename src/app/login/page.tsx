"use client";
import Image from "next/image";
import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { GoogleButton } from "./google-button";
import { signInWithPassword, type LoginState } from "./actions";

const errors: Record<string, string> = {
  no_access: "That account doesn't have access. Contact Carson if you think this is a mistake.",
  link_expired: "That link has expired. Request a new one below.",
};

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<LoginState, FormData>(signInWithPassword, { error: null });
  const urlError = errors[params.get("error") ?? ""] ?? null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-navy p-12 text-offwhite lg:flex lg:flex-col lg:justify-between">
        <Image src="/brand/cpc-lockup-white.svg" alt="Carson Poore Consulting" width={200} height={40} priority />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-offwhite/60">Client portal</p>
          <h1 className="mt-3 max-w-md text-5xl font-black leading-tight">
            Your project, <span className="text-gold">in one place.</span>
          </h1>
        </div>
        <Image aria-hidden src="/brand/cpc-mark-offwhite.svg" alt="" width={520} height={520}
          className="pointer-events-none absolute -right-24 -bottom-24 opacity-[0.06]" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Image src="/brand/cpc-mark-royalblue.svg" alt="" width={40} height={40} className="lg:hidden" />
          <h2 className="text-2xl font-black">Sign in</h2>
          <FormMessage error={state.error ?? urlError} />
          <form action={action} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          </form>
          <Link href="/forgot-password" className="block text-sm font-semibold text-link">Forgot your password?</Link>
          <div className="border-t border-line pt-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Carson Poore Consulting team</p>
            <GoogleButton />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
