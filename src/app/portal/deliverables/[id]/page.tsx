import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { signedDownloadUrl } from "@/lib/storage";
import type { DeliverableRow } from "@/lib/types";
import { DecisionForm } from "./decision-form";

export default async function PortalDeliverable({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  // Inner join: RLS limits projects to non-archived ones, so deliverables of archived projects 404.
  const { data } = await supabase.from("deliverables").select("*, project:projects!inner(id, name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const d = data as DeliverableRow & { project: { id: string; name: string } };
  const fileUrl = d.file_path ? await signedDownloadUrl(d.file_path, 3600) : null;
  const isImage = d.file_path ? /\.(png|jpe?g|gif|webp|svg)$/i.test(d.file_path) : false;
  const isPdf = d.file_path ? /\.pdf$/i.test(d.file_path) : false;
  const safeLink = d.link_url && /^https?:\/\//i.test(d.link_url) ? d.link_url : null;

  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/portal/projects/${d.project.id}`} className="font-semibold text-link">← {d.project.name}</Link></p>
      <PageHeader eyebrow="Deliverable" title={d.title} actions={<StatusPill status={d.status} />} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="space-y-4">
          {d.description ? <p className="whitespace-pre-line">{d.description}</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {fileUrl && isImage ? <img src={fileUrl} alt={d.title} className="w-full rounded-lg border border-line" /> : null}
          {fileUrl && isPdf ? <iframe src={fileUrl} title={d.title} className="h-[70vh] w-full rounded-lg border border-line" /> : null}
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            {fileUrl ? <a href={fileUrl} target="_blank" rel="noreferrer" className="text-link">Download file</a> : null}
            {safeLink ? <a href={safeLink} target="_blank" rel="noreferrer" className="text-link">Open link</a> : null}
          </div>
        </Card>
        <Card>
          {d.status === "awaiting_approval" ? (
            <DecisionForm deliverableId={d.id} />
          ) : (
            <div>
              <p className="font-bold">{d.status === "approved" ? "You approved this" : "You requested changes"}</p>
              <p className="text-sm text-muted">{formatDate(d.decided_at)}</p>
              {d.client_feedback ? <blockquote className="mt-3 border-l-2 border-gold pl-3 whitespace-pre-line">{d.client_feedback}</blockquote> : null}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
