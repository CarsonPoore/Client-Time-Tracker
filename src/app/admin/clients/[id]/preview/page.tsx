import { PortalHomeView, PreviewBanner } from "@/components/portal/views";
import { loadPortalHome, loadPortalHours } from "@/lib/portal-data";
import { monthRange } from "@/lib/time";
import { previewContext } from "./preview-context";

export const metadata = { title: "Portal preview" };

export default async function PreviewHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, client, mode } = await previewContext(id);
  const [data, hours] = await Promise.all([loadPortalHome(db, client.id), loadPortalHours(db, client.id, monthRange(undefined).start)]);
  return <><PreviewBanner clientName={client.name} clientId={client.id} /><PortalHomeView data={data} hours={hours} mode={mode} /></>;
}
