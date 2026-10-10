import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);

const schema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  contact_name: z.preprocess(blankToNull, z.string().nullable()),
  contact_email: z.preprocess(blankToNull, z.email("Enter a valid email.").nullable()),
  quickbooks_invoices_url: z.preprocess(blankToNull, z.url({ protocol: /^https$/, error: "Use an https:// link." }).nullable()),
});

export type ClientFormData = z.infer<typeof schema>;

export function parseClientForm(form: FormData): { ok: true; data: ClientFormData } | { ok: false; error: string } {
  const res = schema.safeParse({
    name: form.get("name") ?? "",
    contact_name: form.get("contact_name") ?? "",
    contact_email: form.get("contact_email") ?? "",
    quickbooks_invoices_url: form.get("quickbooks_invoices_url") ?? "",
  });
  return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error.issues[0].message };
}
