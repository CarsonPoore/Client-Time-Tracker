import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const insert = vi.fn();
const single = vi.fn();
const maybeSingle = vi.fn();
const createSignedUpload = vi.fn();
const removeObject = vi.fn(async () => undefined);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireClient: vi.fn(async () => ({ userId: "u1", clientId: "c1" })) }));
vi.mock("@/lib/email/notify", () => ({ notifyAdminDecision: vi.fn(), postDecisionToClickUp: vi.fn(), notifyAdminRequest: vi.fn(), notifyAdminComment: vi.fn() }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<typeof import("@/lib/storage")>()), createSignedUpload, removeObject }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: () => ({ insert: (row: unknown) => (insert(row), { select: () => ({ single }) }), select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const { decideVersion, addComment, createCommentUpload, attachToComment } = await import("@/app/portal/actions");
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

const PROJECT = "8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11";
const COMMENT = "0b9f4c1e-1111-4222-8333-444455556666";
const owned = { id: COMMENT, author_id: "u1", version: { deliverable: { project_id: PROJECT } } };

beforeEach(() => vi.clearAllMocks());

describe("decideVersion", () => {
  it("maps not_current_version", async () => {
    rpc.mockResolvedValue({ error: { message: "not_current_version" } });
    const r = await decideVersion("v1", "d1", { error: null }, fd({ decision: "approved" }));
    expect(r.error).toBe("A newer version was posted. Refresh to see it.");
    expect(rpc).toHaveBeenCalledWith("decide_version", { p_version_id: "v1", p_decision: "approved", p_note: null });
  });
});

describe("decideVersion notifications", () => {
  it("notifies using the deliverable the RPC decided, not the client-supplied id", async () => {
    const notify = await import("@/lib/email/notify");
    rpc.mockResolvedValue({ data: { id: "v1", deliverable_id: "real-d" }, error: null });
    const r = await decideVersion("v1", "spoofed-d", { error: null }, fd({ decision: "approved" }));
    expect(r.error).toBeNull();
    expect(notify.notifyAdminDecision).toHaveBeenCalledWith("real-d");
    expect(notify.postDecisionToClickUp).toHaveBeenCalledWith("real-d");
  });
});

describe("addComment", () => {
  it("inserts as the signed-in client with pin", async () => {
    single.mockResolvedValue({ data: { id: "cm1" }, error: null });
    const r = await addComment("v1", "d1", { error: null }, fd({ body: "hi", pin_x: "5", pin_y: "6" }));
    expect(insert).toHaveBeenCalledWith({ version_id: "v1", author_id: "u1", author_role: "client", body: "hi", pin_x: 5, pin_y: 6 });
    expect(r).toEqual({ error: null, commentId: "cm1" });
  });
  it("rejects empty body without calling db", async () => {
    const r = await addComment("v1", "d1", { error: null }, fd({ body: " " }));
    expect(r.error).toBe("Write a comment first.");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("createCommentUpload", () => {
  it("rejects bad file before issuing a URL", async () => {
    const r = await createCommentUpload(COMMENT, { name: "a.exe", size: 5, type: "application/x-msdownload" });
    expect(r).toEqual({ error: expect.stringMatching(/type/) });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });
  it("rejects a comment the user doesn't own", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const r = await createCommentUpload(COMMENT, { name: "a.png", size: 5, type: "image/png" });
    expect(r).toEqual({ error: "Invalid upload." });
  });
  it("rejects someone else's comment", async () => {
    maybeSingle.mockResolvedValue({ data: { ...owned, author_id: "u2" } });
    const r = await createCommentUpload(COMMENT, { name: "a.png", size: 5, type: "image/png" });
    expect(r).toEqual({ error: "Invalid upload." });
  });
  it("issues a signed upload under the comment folder", async () => {
    maybeSingle.mockResolvedValue({ data: owned });
    createSignedUpload.mockImplementation(async (path: string) => ({ path, token: "t" }));
    const r = await createCommentUpload(COMMENT, { name: "a.png", size: 5, type: "image/png" });
    expect((r as { path: string }).path).toMatch(new RegExp(`^${PROJECT}/comments/${COMMENT}/[^/]+-a\\.png$`));
  });
});

describe("attachToComment", () => {
  it("removes the object when the row insert fails", async () => {
    maybeSingle.mockResolvedValue({ data: owned });
    single.mockResolvedValue({ data: null, error: { message: "rls" } });
    const path = `${PROJECT}/comments/${COMMENT}/x-a.png`;
    const r = await attachToComment(COMMENT, { path, name: "a.png", size: 5, type: "image/png" });
    expect(r.error).toBe("Couldn't attach that file.");
    expect(removeObject).toHaveBeenCalledWith(path);
  });
  it("records the attachment", async () => {
    maybeSingle.mockResolvedValue({ data: owned });
    single.mockResolvedValue({ data: { id: "a1" }, error: null });
    const path = `${PROJECT}/comments/${COMMENT}/x-a.png`;
    expect(await attachToComment(COMMENT, { path, name: "a.png", size: 5, type: "image/png" })).toEqual({ error: null });
    expect(insert).toHaveBeenCalledWith({ comment_id: COMMENT, storage_path: path, name: "a.png", size_bytes: 5, mime_type: "image/png" });
  });
  it.each([
    `${PROJECT}/comments/${COMMENT}/../x.png`,
    `${PROJECT}/comments/${COMMENT}/sub/x.png`,
    `${PROJECT}/comments/${COMMENT}/a\\b.png`,
    `${PROJECT}/comments/other/x.png`,
    `${PROJECT}/comments/${COMMENT}/`,
  ])("rejects path %s", async (path) => {
    maybeSingle.mockResolvedValue({ data: owned });
    const r = await attachToComment(COMMENT, { path, name: "a.png", size: 5, type: "image/png" });
    expect(r.error).toBe("Invalid upload.");
    expect(insert).not.toHaveBeenCalled();
  });
});
