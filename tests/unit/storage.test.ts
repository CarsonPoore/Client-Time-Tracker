import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const { buildStoragePath } = await import("@/lib/storage");

const P = "11111111-2222-3333-4444-555555555555";

describe("buildStoragePath", () => {
  it("scopes by project and kind and sanitizes the name", () => {
    expect(buildStoragePath(P, "My Logo (final).PNG", "deliverables", "abc"))
      .toBe(`${P}/deliverables/abc-my-logo-final.png`);
  });
  it("cannot escape the project folder", () => {
    expect(buildStoragePath(P, "../../etc/passwd", "files", "x")).toBe(`${P}/files/x-etc-passwd`);
  });
  it("keeps a fallback name", () => {
    expect(buildStoragePath(P, "///", "files", "x")).toBe(`${P}/files/x-file`);
  });
  it("rejects a non-UUID project id", () => {
    expect(() => buildStoragePath("p1/../p2", "a.png", "files", "x")).toThrow();
    expect(() => buildStoragePath("p1", "a.png", "files", "x")).toThrow();
  });
  it("rejects a bad kind", () => {
    expect(() => buildStoragePath(P, "a.png", "x/../../p2/files" as never, "x")).toThrow();
  });
  it("rejects a bad id", () => {
    expect(() => buildStoragePath(P, "a.png", "files", "../x")).toThrow();
    expect(() => buildStoragePath(P, "a.png", "files", "")).toThrow();
  });
  it("keeps tricky names contained", () => {
    const re = new RegExp(`^${P}/files/x-[a-z0-9-]+(\\.[a-z0-9]+)?$`);
    for (const name of ["..\\..\\x", "archive.tar.gz", ".env", "a".repeat(300), "a".repeat(300) + ".png"]) {
      expect(buildStoragePath(P, name, "files", "x")).toMatch(re);
    }
  });
});

describe("buildStoragePath comments", () => {
  it("builds comment paths under the comment id", () => {
    const p = buildStoragePath("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11", "Screen Shot.PNG", "comments", "abc", "0b9f4c1e-1111-4222-8333-444455556666");
    expect(p).toBe("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11/comments/0b9f4c1e-1111-4222-8333-444455556666/abc-screen-shot.png");
  });
  it("requires a uuid comment id for comment paths", () => {
    expect(() => buildStoragePath("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11", "a.png", "comments", "abc", "../x")).toThrow();
  });
});
