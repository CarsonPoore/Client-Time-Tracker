import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/** Constant-time check of `Authorization: Bearer ${CRON_SECRET}`. */
export function isAuthorizedCron(request: Request): boolean {
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
