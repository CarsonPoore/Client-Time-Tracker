import { isDigestEmpty } from "./digest";
import type { DigestContent } from "./templates";

export interface DigestDeps {
  claim(clientId: string): Promise<"claimed" | "already">; // throws on DB error
  release(clientId: string): Promise<void>; // throws on DB error
  load(clientId: string, clientName: string): Promise<DigestContent>;
  send(contactEmail: string, content: DigestContent): Promise<boolean>;
  log?(message: string, err?: unknown): void;
}

export type DigestOutcome = "sent" | "empty" | "already" | "failed";

/** Processes one client. Never throws; releases the claim on any failure after claiming. */
export async function processClientDigest(
  c: { id: string; name: string; contact_email: string },
  deps: DigestDeps,
): Promise<DigestOutcome> {
  const log = deps.log ?? ((m, e) => console.error(m, e));
  let claimed = false;
  try {
    if ((await deps.claim(c.id)) === "already") return "already";
    claimed = true;
    const content = await deps.load(c.id, c.name);
    if (isDigestEmpty(content)) return "empty";
    if (await deps.send(c.contact_email, content)) return "sent";
    throw new Error("send failed");
  } catch (err) {
    log(`Digest failed for client ${c.id}`, err);
    if (claimed) {
      try { await deps.release(c.id); } catch (releaseErr) { log(`Digest claim release failed for client ${c.id}`, releaseErr); }
    }
    return "failed";
  }
}
