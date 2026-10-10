import { notFound } from "next/navigation";
import { PortalDeliverableView } from "@/components/portal/views";
import { requireClient } from "@/lib/auth";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";

export default async function PortalDeliverable({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireClient();
  const { id } = await params;
  const d = await loadPortalDeliverable(await createClient(), viewer.clientId, id);
  if (!d) notFound();
  const fileUrl = d.file_path ? await signedDownloadUrl(d.file_path, 3600) : null;
  return <PortalDeliverableView d={d} fileUrl={fileUrl} mode={{ base: "/portal", preview: false, filesBase: "/portal/files" }} />;
}
