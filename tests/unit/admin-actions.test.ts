import { describe, expect, it } from "vitest";
import { parseClientForm } from "@/app/admin/client-form";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseClientForm", () => {
  it("accepts valid input and blanks to null", () => {
    expect(parseClientForm(fd({ name: " Blue Duck ", contact_name: "", contact_email: "ann@blueduck.com", quickbooks_invoices_url: "" })))
      .toEqual({ ok: true, data: { name: "Blue Duck", contact_name: null, contact_email: "ann@blueduck.com", quickbooks_invoices_url: null } });
  });
  it("rejects a bad email and a non-https invoice link", () => {
    const res = parseClientForm(fd({ name: "X", contact_email: "nope", quickbooks_invoices_url: "javascript:alert(1)" }));
    expect(res.ok).toBe(false);
  });
});
