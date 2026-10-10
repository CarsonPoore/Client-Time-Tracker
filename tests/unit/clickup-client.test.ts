import { describe, expect, it, vi } from "vitest";
import { ClickUpClient, ClickUpError } from "@/lib/clickup/client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("ClickUpClient", () => {
  it("paginates tasks until last_page", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ tasks: [{ id: "1" }], last_page: false }))
      .mockResolvedValueOnce(json({ tasks: [{ id: "2" }], last_page: true }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    const tasks = await cu.getTasks("L1");
    expect(tasks.map((t) => t.id)).toEqual(["1", "2"]);
    expect(fetchImpl.mock.calls[0][0]).toContain("/list/L1/task?");
    expect(fetchImpl.mock.calls[0][0]).toContain("page=0");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("tok");
  });

  it("retries after 429 then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ err: "rate" }, 429))
      .mockResolvedValueOnce(json({ spaces: [{ id: "S", name: "A" }] }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, sleep);
    expect(await cu.getSpaces("T")).toEqual([{ id: "S", name: "A" }]);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("throws ClickUpError with status on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ err: "nope" }, 404));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    await expect(cu.getTask("x")).rejects.toMatchObject({ status: 404 });
    await expect(cu.getTask("x")).rejects.toBeInstanceOf(ClickUpError);
  });

  it("combines folderless and folder lists", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ lists: [{ id: "A", name: "A" }] }))
      .mockResolvedValueOnce(json({ folders: [{ lists: [{ id: "B", name: "B" }] }] }));
    const cu = new ClickUpClient("tok", fetchImpl as unknown as typeof fetch, async () => {});
    expect((await cu.getListsInSpace("S")).map((l) => l.id)).toEqual(["A", "B"]);
  });
});
