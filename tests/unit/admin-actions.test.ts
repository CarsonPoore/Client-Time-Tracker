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

// ---- admin server actions (Release 3a) ----
import { beforeEach, vi } from "vitest";

type Call = { table: string; op: string; args: unknown[] };
const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  removeObject: vi.fn(async () => undefined),
  notify: vi.fn(async () => undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ userId: "admin1", fullName: "Carson" })) }));
vi.mock("@/lib/email/notify", () => ({ notifyClientDeliverablePublished: h.notify }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<typeof import("@/lib/storage")>()), removeObject: h.removeObject, createSignedUpload: vi.fn(async (path: string) => ({ path, token: "t" })) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: h.rpc,
    from: (table: string) => {
      const next = () => (h.results[table]?.shift() ?? { data: null, error: null });
      const b: Record<string, unknown> = {};
      for (const op of ["insert", "update", "delete", "select", "eq", "in", "order"]) {
        b[op] = (...args: unknown[]) => (h.calls.push({ table, op, args }), b);
      }
      b.single = async () => next();
      b.maybeSingle = async () => next();
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(next()).then(res, rej);
      return b;
    },
  }),
}));

const admin = await import("@/app/admin/project-actions");
const P = "8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11";
const C = "0b9f4c1e-1111-4222-8333-444455556666";
const ops = (table: string, op: string) => h.calls.filter((c: Call) => c.table === table && c.op === op).map((c: Call) => c.args);

beforeEach(() => { vi.clearAllMocks(); h.calls.length = 0; for (const k of Object.keys(h.results)) delete h.results[k]; });

describe("publishVersion", () => {
  it("calls publish_version and maps file_required", async () => {
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    h.rpc.mockResolvedValue({ error: { message: "file_required" } });
    const r = await admin.publishVersion("d1", { error: null }, fd({ notes: "v2 notes" }));
    expect(h.rpc).toHaveBeenCalledWith("publish_version", { p_deliverable_id: "d1", p_file_path: null, p_link_url: null, p_notes: "v2 notes" });
    expect(r.error).toBe("Attach a file or link first.");
  });
  it("rejects a file path from another project", async () => {
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    const r = await admin.publishVersion("d1", { error: null }, fd({ file_path: `other/deliverables/x.png` }));
    expect(r.error).toBe("Invalid upload.");
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("notifies on success", async () => {
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    h.rpc.mockResolvedValue({ error: null });
    const r = await admin.publishVersion("d1", { error: null }, fd({ link_url: "https://x.com/a" }));
    expect(r.error).toBeNull();
    expect(h.rpc).toHaveBeenCalledWith("publish_version", { p_deliverable_id: "d1", p_file_path: null, p_link_url: "https://x.com/a", p_notes: null });
    expect(h.notify).toHaveBeenCalledWith("d1");
  });
});

describe("setRevisionLimit", () => {
  it.each(["0", "51", "abc", "2.5"])("rejects %s", async (v) => {
    const r = await admin.setRevisionLimit("d1", { error: null }, fd({ revision_limit: v }));
    expect(r.error).toBeTruthy();
    expect(ops("deliverables", "update")).toEqual([]);
  });
  it("accepts blank as null", async () => {
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    const r = await admin.setRevisionLimit("d1", { error: null }, fd({ revision_limit: "" }));
    expect(r.error).toBeNull();
    expect(ops("deliverables", "update")).toEqual([[{ revision_limit: null }]]);
  });
  it("accepts 3", async () => {
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    await admin.setRevisionLimit("d1", { error: null }, fd({ revision_limit: "3" }));
    expect(ops("deliverables", "update")).toEqual([[{ revision_limit: 3 }]]);
  });
});

describe("createDeliverable", () => {
  it("inserts the deliverable, a v1 draft, then sets current_version_id", async () => {
    h.results.deliverables = [{ data: { id: "d1" }, error: null }, { data: null, error: null }];
    h.results.deliverable_versions = [{ data: { id: "v1" }, error: null }];
    const r = await admin.createDeliverable(P, { error: null }, fd({ title: "Logo", link_url: "https://x.com" }));
    expect(r.error).toBeNull();
    expect(ops("deliverables", "insert")[0][0]).toMatchObject({ project_id: P, title: "Logo" });
    expect(ops("deliverable_versions", "insert")).toEqual([[{ deliverable_id: "d1", number: 1, status: "draft", file_path: null, link_url: "https://x.com", created_by: "admin1" }]]);
    expect(ops("deliverables", "update")).toEqual([[{ current_version_id: "v1" }]]);
  });
});

describe("addAdminComment", () => {
  it("inserts as admin", async () => {
    h.results.deliverable_comments = [{ data: { id: "cm1" }, error: null }];
    const r = await admin.addAdminComment("v1", "d1", { error: null }, fd({ body: "ok" }));
    expect(r).toEqual({ error: null, commentId: "cm1" });
    expect(ops("deliverable_comments", "insert")).toEqual([[{ version_id: "v1", author_id: "admin1", author_role: "admin", body: "ok", pin_x: null, pin_y: null }]]);
  });
});

describe("admin comment attachments", () => {
  const nested = { id: C, version: { deliverable: { project_id: P } } };
  it("issues an upload under the comment folder", async () => {
    h.results.deliverable_comments = [{ data: nested, error: null }];
    const r = await admin.createAdminCommentUpload(C, { name: "a.png", size: 5, type: "image/png" });
    expect((r as { path: string }).path).toMatch(new RegExp(`^${P}/comments/${C}/[^/]+-a\\.png$`));
  });
  it("rejects a bad path", async () => {
    h.results.deliverable_comments = [{ data: nested, error: null }];
    const r = await admin.attachAdminComment(C, { path: `${P}/comments/${C}/../x.png`, name: "a.png", size: 5, type: "image/png" });
    expect(r.error).toBe("Invalid upload.");
  });
  it("records and cleans up on failure", async () => {
    h.results.deliverable_comments = [{ data: nested, error: null }];
    h.results.comment_attachments = [{ data: null, error: { message: "x" } }];
    const path = `${P}/comments/${C}/x-a.png`;
    const r = await admin.attachAdminComment(C, { path, name: "a.png", size: 5, type: "image/png" });
    expect(r.error).toBe("Couldn't attach that file.");
    expect(h.removeObject).toHaveBeenCalledWith(path);
  });
});

describe("deleteDeliverable", () => {
  it("removes every version file", async () => {
    h.results.deliverable_versions = [{ data: [{ file_path: "a" }, { file_path: null }, { file_path: "b" }], error: null }];
    h.results.deliverables = [{ data: { project_id: P }, error: null }];
    expect((await admin.deleteDeliverable("d1")).error).toBeNull();
    expect(h.removeObject.mock.calls).toEqual([["a"], ["b"]]);
  });
});
