"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error: string | null };

const schema = z
  .object({ password: z.string().min(10, "Use at least 10 characters."), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = schema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();

  // Only client accounts may hold a password; admins use Google.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your link has expired. Request a new one." };
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "client") {
    await supabase.auth.signOut();
    return { error: "This account signs in with Google. Password sign-in isn't available." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Couldn't save your password. Your link may have expired." };
  redirect("/");
}
