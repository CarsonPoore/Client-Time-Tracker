import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyClickUpSignature } from "@/lib/clickup/signature";

const body = JSON.stringify({ event: "taskUpdated", task_id: "1" });
const sig = createHmac("sha256", "secret").update(body).digest("hex");

describe("verifyClickUpSignature", () => {
  it("accepts a correct signature", () => expect(verifyClickUpSignature(body, sig, "secret")).toBe(true));
  it("rejects a wrong secret", () => expect(verifyClickUpSignature(body, sig, "other")).toBe(false));
  it("rejects a tampered body", () => expect(verifyClickUpSignature(body + " ", sig, "secret")).toBe(false));
  it("rejects missing or malformed signatures", () => {
    expect(verifyClickUpSignature(body, null, "secret")).toBe(false);
    expect(verifyClickUpSignature(body, "zz", "secret")).toBe(false);
  });
});
