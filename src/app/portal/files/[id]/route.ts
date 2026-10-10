import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "client") return notFound();
  const { id } = await params;
  const supabase = await createClient();
  // Inner join: RLS limits projects to non-archived ones the client can see.
  const { data } = await supabase.from("files").select("storage_path, project:projects!inner(id)").eq("id", id).maybeSingle();
  if (!data) return notFound();
  const url = await signedDownloadUrl(data.storage_path, 300);
  if (!url) return notFound();
  return NextResponse.redirect(url, 302);
}
