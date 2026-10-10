import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ signedDownloadUrl: vi.fn(async (p: string) => `signed:${p}`) }));
const { signThreadUrls } = await import("@/lib/deliverable-urls");

describe("signThreadUrls", () => {
  it("signs version files and attachments, null for links", async () => {
    const r = await signThreadUrls({
      deliverable: { project_id: "p" },
      versions: [{ id: "v1", file_path: "p/a.png" }, { id: "v2", file_path: null, link_url: "https://x" }],
      comments: { v1: [{ id: "c", attachments: [{ id: "a1", comment_id: "c", storage_path: "p/comments/c/x.pdf" }] }], v2: [] },
    } as any);
    expect(r).toEqual({ fileUrls: { v1: "signed:p/a.png", v2: null }, attachmentUrls: { a1: "signed:p/comments/c/x.pdf" } });
  });

  it("refuses to sign attachment paths outside the comment's own folder", async () => {
    const att = (id: string, storage_path: string) => ({ id, comment_id: "c", storage_path });
    const r = await signThreadUrls({
      deliverable: { project_id: "p" },
      versions: [],
      comments: { v1: [{ id: "c", attachments: [
        att("dots", "p/comments/c/../../q/secret.pdf"),
        att("nested", "p/comments/c/a/b.png"),
        att("otherComment", "p/comments/d/x.png"),
        att("otherProject", "q/comments/c/x.png"),
        att("ok", "p/comments/c/fine.png"),
      ] }] },
    } as any);
    expect(r.attachmentUrls).toEqual({ dots: null, nested: null, otherComment: null, otherProject: null, ok: "signed:p/comments/c/fine.png" });
  });
});
