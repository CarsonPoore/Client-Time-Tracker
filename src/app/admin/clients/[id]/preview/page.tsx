import { PortalHomeView, PreviewBanner } from "@/components/portal/views";
import { loadPortalHome } from "@/lib/portal-data";
import { previewContext } from "./preview-context";

export const metadata = { title: "Portal preview" };

export default async function PreviewHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, client, mode } = await previewContext(id);
  const data = await loadPortalHome(db, client.id);
  return <><PreviewBanner clientName={client.name} clientId={client.id} /><PortalHomeView data={data} mode={mode} /></>;
}
