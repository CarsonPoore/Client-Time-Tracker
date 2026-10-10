import { verifyClickUpSignature } from "@/lib/clickup/signature";
import { webhookEventId } from "@/lib/clickup/mapping";
import type { CUWebhookPayload } from "@/lib/clickup/types";

export interface EventLog {
  getSecret(): Promise<string | null>;
  record(eventId: string, event: string, payload: unknown): Promise<boolean>;
  finish(eventId: string, error: string | null): Promise<void>;
}

export async function processWebhook(
  raw: string,
  signature: string | null,
  deps: { log: EventLog; handle: (p: CUWebhookPayload) => Promise<void> },
): Promise<{ status: number; body: string }> {
  const secret = await deps.log.getSecret();
  if (!secret || !verifyClickUpSignature(raw, signature, secret)) return { status: 401, body: "invalid signature" };

  let payload: CUWebhookPayload;
  try {
    payload = JSON.parse(raw) as CUWebhookPayload;
  } catch {
    return { status: 400, body: "invalid json" };
  }

  const eventId = webhookEventId(payload);
  if (!(await deps.log.record(eventId, payload.event, payload))) return { status: 200, body: "duplicate" };

  try {
    await deps.handle(payload);
    await deps.log.finish(eventId, null);
  } catch (err) {
    await deps.log.finish(eventId, err instanceof Error ? err.message : String(err));
  }
  return { status: 200, body: "ok" };
}
