import { notFound } from "next/navigation";
import { PortalProjectView } from "@/components/portal/views";
import { requireClient } from "@/lib/auth";
import { loadPortalProject } from "@/lib/portal-data";
import { createClient } from "@/lib/supabase/server";

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireClient();
  const { id } = await params;
  const data = await loadPortalProject(await createClient(), viewer.clientId, id);
  if (!data) notFound();
  return <PortalProjectView data={data} mode={{ base: "/portal", preview: false, filesBase: "/portal/files" }} />;
}
