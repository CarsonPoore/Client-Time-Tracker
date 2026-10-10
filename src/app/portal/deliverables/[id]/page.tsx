import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusPill } from "@/components/ui";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";
import { requireClient } from "@/lib/auth";
import { signThreadUrls } from "@/lib/deliverable-urls";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { addComment, attachToComment, createCommentUpload, decideVersion } from "../../actions";

export default async function PortalDeliverable({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const viewer = await requireClient();
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const thread = await loadPortalDeliverable(await createClient(), viewer.clientId, id, createAdminClient());
  if (!thread) notFound();
  const urls = await signThreadUrls(thread);
  const d = thread.deliverable;
  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/portal/projects/${d.project.id}`} className="font-semibold text-link">← {d.project.name}</Link></p>
      <PageHeader eyebrow="Deliverable" title={d.title} actions={<StatusPill status={d.status} />} />
      {d.description ? <p className="mb-6 whitespace-pre-line">{d.description}</p> : null}
      <DeliverableWorkspace thread={thread} {...urls} role="client" readOnly={false} selectedVersionId={v}
        actions={{ addComment, createUpload: createCommentUpload, attach: attachToComment, decide: decideVersion }} />
    </>
  );
}
