"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

const schema = z.object({ email: z.email(), password: z.string().min(1) });
const GENERIC_ERROR = "That email and password don't match. Try again or reset your password.";

export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: GENERIC_ERROR };

  // Password login is for clients only; admins sign in with Google.
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "client") {
    await supabase.auth.signOut();
    return { error: GENERIC_ERROR };
  }
  redirect("/");
}
