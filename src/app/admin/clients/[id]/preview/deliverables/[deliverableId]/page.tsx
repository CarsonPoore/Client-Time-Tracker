import { notFound } from "next/navigation";
import { PortalDeliverableView, PreviewBanner } from "@/components/portal/views";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { signedDownloadUrl } from "@/lib/storage";
import { previewContext } from "../../preview-context";

export default async function PreviewDeliverable({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id, deliverableId } = await params;
  const { db, client, mode } = await previewContext(id);
  const d = await loadPortalDeliverable(db, client.id, deliverableId);
  if (!d) notFound();
  const fileUrl = d.file_path ? await signedDownloadUrl(d.file_path, 3600) : null;
  return <><PreviewBanner clientName={client.name} clientId={client.id} /><PortalDeliverableView d={d} fileUrl={fileUrl} mode={mode} /></>;
}
