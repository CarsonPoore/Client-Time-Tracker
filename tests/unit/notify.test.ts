import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  results: {} as Record<string, unknown[]>,
  sendEmail: vi.fn(async () => undefined),
  postTaskComment: vi.fn(async () => undefined),
  postListComment: vi.fn(async () => undefined),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_URL: "https://app", ADMIN_EMAILS: "a@x.com", CLICKUP_API_TOKEN: "t" }) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: h.sendEmail }));
vi.mock("@/lib/clickup/client", () => ({
  ClickUpClient: class { postTaskComment = h.postTaskComment; postListComment = h.postListComment; },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit", "insert"]) b[op] = () => b;
      const next = async () => h.results[table]?.shift() ?? { data: null, error: null };
      b.single = next; b.maybeSingle = next;
      return b;
    },
  }),
}));

const { notifyAdminDecision, postDecisionToClickUp } = await import("@/lib/email/notify");

const deliverable = {
  id: "d1", title: "Logo", status: "awaiting_approval", clickup_task_id: "cu1", current_version_id: "v2",
  project: { id: "p1", name: "Site", clickup_list_id: null, client: { id: "c1", name: "Blue Duck", contact_email: null, portal_user_id: null } },
};
const seed = (note: string | null) => {
  h.results.deliverables = [{ data: { ...deliverable } }];
  h.results.deliverable_versions = [{ data: { number: 2, status: "changes_requested", file_path: null, link_url: null } }];
  h.results.deliverable_comments = [{ data: note ? { body: note } : null }];
};

beforeEach(() => { vi.clearAllMocks(); for (const k of Object.keys(h.results)) delete h.results[k]; });

describe("decision notifications", () => {
  it("emails the note from the current version's decision comment and uses version status", async () => {
    seed("Make it bluer");
    await notifyAdminDecision("d1");
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.sendEmail.mock.calls[0])).toContain("Make it bluer");
  });
  it("posts the decision comment note to ClickUp", async () => {
    seed("Make it bluer");
    await postDecisionToClickUp("d1");
    expect(h.postTaskComment).toHaveBeenCalledWith("cu1", expect.stringContaining("Make it bluer"));
  });
  it("posts no stale note when the version has no decision comment", async () => {
    seed(null);
    await postDecisionToClickUp("d1");
    expect(h.postTaskComment).toHaveBeenCalledWith("cu1", 'Client requested changes on "Logo" in the CPC portal:\n\n');
  });
});
