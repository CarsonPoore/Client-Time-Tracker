"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseTimeEntryForm } from "@/lib/time";
import type { ActionResult } from "./actions";

export async function addTimeEntry(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseTimeEntryForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const { error } = await (await createClient()).from("time_entries").insert(parsed.data);
  if (error?.code === "23514") return { error: "That project doesn't belong to this client." };
  if (error) return { error: "Couldn't save the entry." };
  revalidatePath("/admin/time");
  revalidatePath("/admin/reports/hours");
  return { error: null, message: "Time logged." };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await (await createClient()).from("time_entries").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the entry." };
  revalidatePath("/admin/time");
  revalidatePath("/admin/reports/hours");
  return { error: null, message: "Entry deleted." };
}

export async function updateTimeEntry(id: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = parseTimeEntryForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const { error } = await (await createClient()).from("time_entries").update(parsed.data).eq("id", id);
  if (error?.code === "23514") return { error: "That project doesn't belong to this client." };
  if (error) return { error: "Couldn't save the entry." };
  revalidatePath("/admin/time");
  revalidatePath("/admin/reports/hours");
  return { error: null, message: "Entry updated." };
}

export async function setPortalHours(clientId: string, on: boolean): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await (await createClient()).from("clients").update({ show_hours_in_portal: on }).eq("id", clientId);
  if (error) return { error: "Couldn't update the setting." };
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/portal");
  return { error: null };
}
