import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusPill } from "@/components/ui";
import { PreviewBanner } from "@/components/portal/views";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";
import { signThreadUrls } from "@/lib/deliverable-urls";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewContext } from "../../preview-context";

export default async function PreviewDeliverable({ params, searchParams }: {
  params: Promise<{ id: string; deliverableId: string }>; searchParams: Promise<{ v?: string }>;
}) {
  const [{ id, deliverableId }, { v }] = await Promise.all([params, searchParams]);
  const { db, client, mode } = await previewContext(id);
  const thread = await loadPortalDeliverable(db, client.id, deliverableId, createAdminClient());
  if (!thread) notFound();
  const urls = await signThreadUrls(thread);
  const d = thread.deliverable;
  // Version tabs use the workspace's default `?v=<id>` hrefs, which stay on this preview route.
  return (
    <>
      <PreviewBanner clientName={client.name} clientId={client.id} />
      <p className="mb-2 text-sm"><Link href={`${mode.base}/projects/${d.project.id}`} className="font-semibold text-link">← {d.project.name}</Link></p>
      <PageHeader eyebrow="Deliverable" title={d.title} actions={<StatusPill status={d.status} />} />
      {d.description ? <p className="mb-6 whitespace-pre-line">{d.description}</p> : null}
      <DeliverableWorkspace thread={thread} {...urls} role="client" readOnly selectedVersionId={v} actions={null} />
    </>
  );
}
