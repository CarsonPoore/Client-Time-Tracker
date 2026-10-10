import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { loadPortalFilePath } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "client" || !viewer.clientId) return notFound();
  const { id } = await params;
  const path = await loadPortalFilePath(await createClient(), viewer.clientId, id);
  const url = path ? await signedDownloadUrl(path, 300) : null;
  if (!url) return notFound();
  return NextResponse.redirect(url, 302);
}
