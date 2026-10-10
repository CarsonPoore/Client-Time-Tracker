import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const { buildStoragePath } = await import("@/lib/storage");

describe("buildStoragePath", () => {
  it("scopes by project and kind and sanitizes the name", () => {
    expect(buildStoragePath("p1", "My Logo (final).PNG", "deliverables", "abc"))
      .toBe("p1/deliverables/abc-my-logo-final.png");
  });
  it("cannot escape the project folder", () => {
    expect(buildStoragePath("p1", "../../etc/passwd", "files", "x")).toBe("p1/files/x-etc-passwd");
  });
  it("keeps a fallback name", () => {
    expect(buildStoragePath("p1", "///", "files", "x")).toBe("p1/files/x-file");
  });
});
