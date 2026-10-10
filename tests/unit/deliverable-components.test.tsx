import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentThread } from "@/components/deliverables/comment-thread";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";
import { VersionTabs } from "@/components/deliverables/version-tabs";

const base = {
  deliverable: { id: "d1", project_id: "p1", title: "Logo", description: null, status: "awaiting_approval", current_version_id: "v2", revision_limit: 1,
    project: { id: "p1", name: "Site", client_id: "c1" } },
  versions: [
    { id: "v1", deliverable_id: "d1", number: 1, file_path: "p1/deliverables/a.png", link_url: null, notes: null, status: "changes_requested", published_at: "2026-10-01", decided_at: "2026-10-02", decided_by: "u1", created_at: "2026-10-01" },
    { id: "v2", deliverable_id: "d1", number: 2, file_path: "p1/deliverables/b.png", link_url: null, notes: "Bluer", status: "awaiting_approval", published_at: "2026-10-03", decided_at: null, decided_by: null, created_at: "2026-10-03" },
  ],
  comments: { v1: [{ id: "c1", version_id: "v1", author_id: "u1", author_role: "client", body: "<script>x</script>\nline2", kind: "decision", pin_x: null, pin_y: null, created_at: "2026-10-02", attachments: [] }], v2: [] },
  names: { u1: "Dana" },
} as any;

describe("CommentThread", () => {
  it("escapes HTML and keeps line breaks", () => {
    const html = renderToStaticMarkup(<CommentThread comments={base.comments.v1} names={base.names} attachmentUrls={{}} viewerRole="client" />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toMatch(/whitespace-pre-wrap/);
    expect(html).toContain("Requested changes");
  });
});

describe("VersionTabs", () => {
  it("labels a non-current awaiting version as Superseded", () => {
    const vs = [{ ...base.versions[1], id: "v0", number: 1 }, base.versions[1]];
    const html = renderToStaticMarkup(<VersionTabs versions={vs} selectedId="v2" currentId="v2" hrefFor={(id) => `?v=${id}`} />);
    expect(html).toContain("v1 · Superseded");
    expect(html).toContain("v2 · Awaiting approval");
  });
});

describe("DeliverableWorkspace", () => {
  it("readOnly hides composer and decision bar", () => {
    const html = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly actions={null} />);
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Post comment");
    expect(html).toContain("Over limit (2 of 1)");
  });
  it("client sees decision bar only on current awaiting version", () => {
    const cur = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly={false} actions={{} as any} />);
    expect(cur).toContain("Approve");
    const old = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly={false} actions={{} as any} selectedVersionId="v1" />);
    expect(old).not.toContain("Approve");
    expect(old).toContain("Post comment");
  });
  it("admin never sees the decision bar", () => {
    const html = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="admin" readOnly={false} actions={{} as any} />);
    expect(html).not.toContain("Approve");
  });
});
