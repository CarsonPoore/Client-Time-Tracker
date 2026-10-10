import { notFound } from "next/navigation";
import { PortalDeliverableView } from "@/components/portal/views";
import { requireClient } from "@/lib/auth";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";

export default async function PortalDeliverable({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireClient();
  const { id } = await params;
  const t = await loadPortalDeliverable(await createClient(), viewer.clientId, id, createAdminClient());
  if (!t) notFound();
  const v = t.versions.find((x) => x.id === t.deliverable.current_version_id) ?? t.versions[t.versions.length - 1];
  const fileUrl = v?.file_path ? await signedDownloadUrl(v.file_path, 3600) : null;
  return <PortalDeliverableView t={t} fileUrl={fileUrl} mode={{ base: "/portal", preview: false, filesBase: "/portal/files" }} />;
}
