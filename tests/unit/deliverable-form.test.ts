import { describe, expect, it } from "vitest";
import { parseDeliverableForm } from "@/app/admin/deliverable-form";

const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

describe("parseDeliverableForm", () => {
  it("requires a title", () => {
    expect(parseDeliverableForm(fd({ title: "  " })).ok).toBe(false);
  });
  it("normalizes optional fields", () => {
    expect(parseDeliverableForm(fd({ title: "Logo", description: "", link_url: "https://figma.com/x", clickup_task_id: "" })))
      .toEqual({ ok: true, data: { title: "Logo", description: null, link_url: "https://figma.com/x", clickup_task_id: null } });
  });
  it("rejects non-http links", () => {
    expect(parseDeliverableForm(fd({ title: "x", link_url: "javascript:alert(1)" })).ok).toBe(false);
  });
});
