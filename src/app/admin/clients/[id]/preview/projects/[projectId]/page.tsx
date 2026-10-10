import { notFound } from "next/navigation";
import { PortalProjectView, PreviewBanner } from "@/components/portal/views";
import { loadPortalProject } from "@/lib/portal-data";
import { previewContext } from "../../preview-context";

export default async function PreviewProject({ params }: { params: Promise<{ id: string; projectId: string }> }) {
  const { id, projectId } = await params;
  const { db, client, mode } = await previewContext(id);
  const data = await loadPortalProject(db, client.id, projectId);
  if (!data) notFound();
  return <><PreviewBanner clientName={client.name} clientId={client.id} /><PortalProjectView data={data} mode={mode} /></>;
}
