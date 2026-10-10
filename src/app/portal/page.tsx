import { PortalHomeView } from "@/components/portal/views";
import { requireClient } from "@/lib/auth";
import { loadPortalHome } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const viewer = await requireClient();
  const data = await loadPortalHome(await createClient(), viewer.clientId);
  return <PortalHomeView data={data} mode={{ base: "/portal", preview: false, filesBase: "/portal/files" }} />;
}
