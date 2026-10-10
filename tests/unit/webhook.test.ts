import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { processWebhook, type EventLog } from "@/lib/sync/webhook";

const payload = { event: "taskUpdated", webhook_id: "W", task_id: "T", history_items: [{ id: "H" }] };
const raw = JSON.stringify(payload);
const sign = (body: string) => createHmac("sha256", "sec").update(body).digest("hex");

function memoryLog(): EventLog & { finished: Map<string, string | null> } {
  const seen = new Set<string>();
  const finished = new Map<string, string | null>();
  return {
    finished,
    getSecret: async () => "sec",
    record: async (id) => { if (seen.has(id)) return false; seen.add(id); return true; },
    finish: async (id, err) => { finished.set(id, err); },
  };
}

describe("processWebhook", () => {
  it("rejects bad signature", async () => {
    const handle = vi.fn();
    const res = await processWebhook(raw, sign("other"), { log: memoryLog(), handle });
    expect(res.status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("rejects when no secret is configured", async () => {
    const log = memoryLog();
    log.getSecret = async () => null;
    const res = await processWebhook(raw, sign(raw), { log, handle: vi.fn() });
    expect(res.status).toBe(401);
  });

  it("ignores duplicate deliveries", async () => {
    const handle = vi.fn(async () => {});
    const log = memoryLog();
    await processWebhook(raw, sign(raw), { log, handle });
    const second = await processWebhook(raw, sign(raw), { log, handle });
    expect(handle).toHaveBeenCalledOnce();
    expect(second).toEqual({ status: 200, body: "duplicate" });
  });

  it("records handler errors and still returns 200", async () => {
    const log = memoryLog();
    const res = await processWebhook(raw, sign(raw), { log, handle: async () => { throw new Error("db down"); } });
    expect(res.status).toBe(200);
    expect([...log.finished.values()]).toEqual(["db down"]);
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await processWebhook("not json", sign("not json"), { log: memoryLog(), handle: vi.fn() });
    expect(res.status).toBe(400);
  });
});
