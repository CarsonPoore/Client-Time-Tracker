"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

export type ForgotState = { error: string | null; sent: boolean };

export async function requestReset(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email.", sent: false };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${serverEnv().APP_URL}/auth/confirm` });
  return { error: null, sent: true };
}
