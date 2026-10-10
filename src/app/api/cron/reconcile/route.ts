import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { reconcileAll } from "@/lib/sync/engine";
import { getSyncDeps } from "@/lib/sync/factory";
import { withSyncRun } from "@/lib/sync/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const { cu, store } = getSyncDeps();
  const counts = await withSyncRun("nightly", () =>
    reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 48 * 3600_000) }));
  return NextResponse.json(counts);
}
