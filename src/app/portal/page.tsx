import { PortalHomeView } from "@/components/portal/views";
import { requireClient } from "@/lib/auth";
import { loadPortalHome, loadPortalHours } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";
import { monthRange } from "@/lib/time";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const viewer = await requireClient();
  const db = await createClient();
  const [data, hours] = await Promise.all([loadPortalHome(db, viewer.clientId), loadPortalHours(db, viewer.clientId, monthRange(undefined).start)]);
  return <PortalHomeView data={data} hours={hours} mode={{ base: "/portal", preview: false, filesBase: "/portal/files" }} />;
}
