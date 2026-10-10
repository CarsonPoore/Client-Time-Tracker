import { NextResponse } from "next/server";
import { getViewer, isAdminEmail } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { loadPortalFilePath } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";

/** Admin-only file download for the portal preview; same visibility rules as /portal/files. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin" || !isAdminEmail(viewer.email, serverEnv().ADMIN_EMAILS)) return notFound();
  const { id, fileId } = await params;
  const path = await loadPortalFilePath(await createClient(), id, fileId);
  const url = path ? await signedDownloadUrl(path, 300) : null;
  if (!url) return notFound();
  return NextResponse.redirect(url, 302);
}
