import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { reconcileAll } from "@/lib/sync/engine";
import { getSyncDeps } from "@/lib/sync/factory";
import { withSyncRun } from "@/lib/sync/runs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const { cu, store } = getSyncDeps();
  const counts = await withSyncRun("nightly", () =>
    reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 48 * 3600_000) }));
  return NextResponse.json(counts);
}
