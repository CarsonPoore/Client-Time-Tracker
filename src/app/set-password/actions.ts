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
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Couldn't save your password. Your link may have expired." };
  redirect("/");
}
