import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ signedDownloadUrl: vi.fn(async (p: string) => `signed:${p}`) }));
const { signThreadUrls } = await import("@/lib/deliverable-urls");

describe("signThreadUrls", () => {
  it("signs version files and attachments, null for links", async () => {
    const r = await signThreadUrls({
      versions: [{ id: "v1", file_path: "p/a.png" }, { id: "v2", file_path: null, link_url: "https://x" }],
      comments: { v1: [{ attachments: [{ id: "a1", storage_path: "p/comments/c/x.pdf" }] }], v2: [] },
    } as any);
    expect(r).toEqual({ fileUrls: { v1: "signed:p/a.png", v2: null }, attachmentUrls: { a1: "signed:p/comments/c/x.pdf" } });
  });
});
