import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill } from "@/components/ui";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";
import { requireAdmin } from "@/lib/auth";
import { signThreadUrls } from "@/lib/deliverable-urls";
import { loadDeliverableThread } from "@/lib/portal-data";
import { revisionLabel } from "@/lib/revisions";
import { createClient } from "@/lib/supabase/server";
import { addAdminComment, attachAdminComment, createAdminCommentUpload } from "../../project-actions";
import { AdminControls } from "./admin-controls";

export const metadata = { title: "Deliverable" };

export default async function AdminDeliverable({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  await requireAdmin();
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const thread = await loadDeliverableThread(await createClient(), id, { includeDrafts: true, scopeNamesToClient: false });
  if (!thread) notFound();
  const urls = await signThreadUrls(thread);
  const d = thread.deliverable;
  const current = thread.versions.find((x) => x.id === d.current_version_id) ?? thread.versions[thread.versions.length - 1] ?? null;
  const label = current ? revisionLabel(current.number, d.revision_limit) : null;
  const expanded = d.status === "changes_requested" || !current || current.status === "draft" || current.status === "changes_requested";

  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/admin/projects/${d.project.id}`} className="font-semibold text-link">← {d.project.name}</Link></p>
      <PageHeader eyebrow="Deliverable" title={d.title} actions={<StatusPill status={d.status} />} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <DeliverableWorkspace thread={thread} {...urls} role="admin" readOnly={false} selectedVersionId={v}
            actions={{ addComment: addAdminComment, createUpload: createAdminCommentUpload, attach: attachAdminComment }} />
        </Card>
        <Card>
          <AdminControls deliverableId={d.id} projectId={d.project.id} revisionLimit={d.revision_limit}
            labelText={label?.text ?? "No versions yet"} over={label?.over ?? false} expanded={expanded} />
        </Card>
      </div>
    </>
  );
}
