"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { disconnect, getCustomer } from "@/lib/quickbooks/connection";
import type { ActionResult } from "./actions";

export async function disconnectQuickBooks(): Promise<ActionResult> {
  await requireAdmin();
  try {
    await disconnect();
  } catch (e) {
    console.error(e);
    return { error: "Couldn't disconnect QuickBooks." };
  }
  revalidatePath("/admin/settings");
  return { error: null, message: "QuickBooks disconnected. Client links were kept." };
}

/** Links a client to a QuickBooks customer, or clears the link when customerId is empty. */
export async function linkQuickBooksCustomer(clientId: string, customerId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  let patch: { quickbooks_customer_id: string | null; quickbooks_customer_name: string | null } = { quickbooks_customer_id: null, quickbooks_customer_name: null };
  if (customerId) {
    let customer;
    try {
      customer = await getCustomer(customerId);
    } catch (e) {
      console.error(e);
      return { error: "Couldn't reach QuickBooks. Try again." };
    }
    if (!customer) return { error: "That customer isn't in QuickBooks." };
    patch = { quickbooks_customer_id: customer.id, quickbooks_customer_name: customer.displayName };
  }
  const { error } = await supabase.from("clients").update(patch).eq("id", clientId);
  if (error?.code === "23505") return { error: "That QuickBooks customer is already linked to another client." };
  if (error) return { error: "Couldn't save the link." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, message: customerId ? `Linked to ${patch.quickbooks_customer_name}.` : "Link removed." };
}
