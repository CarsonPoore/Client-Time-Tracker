import { timingSafeEqual } from "node:crypto";

export const STATE_COOKIE = "qb_oauth_state";

export function sameState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
