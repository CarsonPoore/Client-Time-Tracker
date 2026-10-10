import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const { DIGEST_COMMENTS_SELECT, groupComments } = await import("@/lib/email/digest-loader");

describe("digest comments", () => {
  it("embeds deliverables with an explicit FK hint (two relationships exist)", () => {
    expect(DIGEST_COMMENTS_SELECT).toContain("deliverables!deliverable_versions_deliverable_id_fkey!inner");
  });

  it("groups per deliverable, skipping draft versions and other clients' projects", () => {
    const name = new Map([["p1", "Site"]]);
    const row = (status: string, id: string, project_id: string) => ({ version: { status, deliverable: { id, title: `T-${id}`, project_id } } });
    const out = groupComments([
      row("awaiting_approval", "d1", "p1"),
      row("approved", "d1", "p1"),
      row("draft", "d2", "p1"),
      row("awaiting_approval", "d3", "other"),
    ], name);
    expect(out).toEqual([{ deliverableId: "d1", title: "T-d1", project: "Site", count: 2 }]);
  });
});
