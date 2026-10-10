import { notFound } from "next/navigation";
import { PortalDeliverableView, PreviewBanner } from "@/components/portal/views";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDownloadUrl } from "@/lib/storage";
import { previewContext } from "../../preview-context";

export default async function PreviewDeliverable({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params;
  const { db, client, mode } = await previewContext(id);
  const t = await loadPortalDeliverable(db, client.id, deliverableId, createAdminClient());
  if (!t) notFound();
  const v = t.versions.find((x) => x.id === t.deliverable.current_version_id) ?? t.versions[t.versions.length - 1];
  const fileUrl = v?.file_path ? await signedDownloadUrl(v.file_path, 3600) : null;
  return <><PreviewBanner clientName={client.name} clientId={client.id} /><PortalDeliverableView t={t} fileUrl={fileUrl} mode={mode} /></>;
}
