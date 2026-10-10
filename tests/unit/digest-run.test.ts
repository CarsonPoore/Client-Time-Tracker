import { describe, expect, it, vi } from "vitest";
import { processClientDigest, type DigestDeps } from "@/lib/email/digest-run";
import type { DigestContent } from "@/lib/email/templates";

const c = { id: "c1", name: "Blue Duck", contact_email: "a@b.co" };
const empty: DigestContent = { clientName: "x", updates: [], awaiting: [], statusChanges: [], dueSoon: [] };
const full: DigestContent = { ...empty, awaiting: [{ id: "1", title: "t", project: "p" }] };

function deps(over: Partial<DigestDeps> = {}) {
  return {
    claim: vi.fn(async () => "claimed" as const),
    release: vi.fn(async () => {}),
    load: vi.fn(async () => full),
    send: vi.fn(async () => true),
    log: vi.fn(),
    ...over,
  };
}

describe("processClientDigest", () => {
  it("releases the claim and fails when load throws", async () => {
    const d = deps({ load: vi.fn(async () => { throw new Error("db"); }) });
    expect(await processClientDigest(c, d)).toBe("failed");
    expect(d.release).toHaveBeenCalledWith("c1");
    expect(d.send).not.toHaveBeenCalled();
  });
  it("releases the claim when send fails", async () => {
    const d = deps({ send: vi.fn(async () => false) });
    expect(await processClientDigest(c, d)).toBe("failed");
    expect(d.release).toHaveBeenCalledWith("c1");
  });
  it("keeps the claim when empty", async () => {
    const d = deps({ load: vi.fn(async () => empty) });
    expect(await processClientDigest(c, d)).toBe("empty");
    expect(d.release).not.toHaveBeenCalled();
  });
  it("counts a claim error as failed, not already, and does not release", async () => {
    const d = deps({ claim: vi.fn(async () => { throw new Error("db"); }) });
    expect(await processClientDigest(c, d)).toBe("failed");
    expect(d.release).not.toHaveBeenCalled();
  });
  it("skips already-claimed and reports sent", async () => {
    expect(await processClientDigest(c, deps({ claim: vi.fn(async () => "already" as const) }))).toBe("already");
    expect(await processClientDigest(c, deps())).toBe("sent");
  });
  it("logs but still fails when release throws", async () => {
    const d = deps({ send: vi.fn(async () => false), release: vi.fn(async () => { throw new Error("x"); }) });
    expect(await processClientDigest(c, d)).toBe("failed");
  });
});
