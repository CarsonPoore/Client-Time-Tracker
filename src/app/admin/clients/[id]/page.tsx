import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader, formatDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientForm, InviteButton } from "./client-forms";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const { data: projects } = await supabase.from("projects").select("id, name, status, due_date, archived")
    .eq("client_id", id).order("archived").order("name");

  let portalStatus = "Not invited";
  if (client.portal_user_id) {
    const { data } = await createAdminClient().auth.admin.getUserById(client.portal_user_id);
    portalStatus = data.user?.last_sign_in_at ? `Active · last sign-in ${formatDate(data.user.last_sign_in_at)}` : "Invited, hasn't signed in";
  }

  return (
    <>
      <PageHeader eyebrow="Client" title={client.name} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Projects</h2>
          {projects?.length ? (
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <Link href={`/admin/projects/${p.id}`} className={`font-semibold hover:text-royal ${p.archived ? "text-muted line-through" : ""}`}>{p.name}</Link>
                  <span className="text-sm text-muted">{p.due_date ? `Due ${formatDate(p.due_date)}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No projects" body="Projects appear when lists exist in this client's ClickUp space." />}
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold">Portal access</h2>
            <p className="mt-1 text-sm text-muted">{portalStatus}</p>
            <div className="mt-4"><InviteButton clientId={client.id} invited={Boolean(client.portal_user_id)} /></div>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Details</h2>
            <ClientForm client={client} />
          </Card>
        </div>
      </div>
    </>
  );
}
