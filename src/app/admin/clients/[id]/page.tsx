import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, EmptyState, LinkButton, PageHeader, formatDate } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientForm, InviteButton } from "./client-forms";
import { ActivityCard } from "./activity-card";
import { loadClientActivity } from "@/lib/admin-data";
import { PortalHoursToggle } from "./portal-hours-toggle";
import { QuickBooksLink } from "./quickbooks-link";
import { suggestCustomer, type QBCustomer } from "@/lib/quickbooks/client";
import { getConnection, listCustomers, quickbooksConfig } from "@/lib/quickbooks/connection";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();
  const { data: projects } = await supabase.from("projects").select("id, name, status, due_date, archived")
    .eq("client_id", id).order("archived").order("name");
  const activity = await loadClientActivity(supabase, id);

  let portalStatus = "Not invited";
  if (client.portal_user_id) {
    const { data } = await createAdminClient().auth.admin.getUserById(client.portal_user_id);
    portalStatus = data.user?.last_sign_in_at ? `Active · last sign-in ${formatDate(data.user.last_sign_in_at)}` : "Invited, hasn't signed in";
  }

  const qbConfigured = Boolean(quickbooksConfig());
  const qbConnection = qbConfigured ? await getConnection() : null;
  let customers: QBCustomer[] = [];
  let qbError: string | null = null;
  if (qbConnection) {
    try {
      customers = (await listCustomers()) ?? [];
    } catch (e) {
      console.error("QuickBooks customer list failed", e);
      qbError = "Couldn't load customers from QuickBooks. Try reconnecting in Settings.";
    }
  }
  const suggested = client.quickbooks_customer_id ? null : suggestCustomer(client, customers);

  return (
    <>
      <PageHeader eyebrow="Client" title={client.name}
        actions={<LinkButton variant="secondary" href={`/admin/clients/${client.id}/preview`}>Preview portal</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Projects</h2>
          {projects?.length ? (
            <ul className="divide-y divide-line">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <Link href={`/admin/projects/${p.id}`} className={`font-semibold hover:text-link ${p.archived ? "text-muted line-through" : ""}`}>{p.name}</Link>
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
            <PortalHoursToggle clientId={client.id} checked={client.show_hours_in_portal} />
          </Card>
          {qbConfigured ? (
            <Card>
              <h2 className="text-lg font-bold">QuickBooks</h2>
              <p className="mt-1 text-sm text-muted">
                {client.quickbooks_customer_name ? `Linked to ${client.quickbooks_customer_name}.` : "Not linked to a QuickBooks customer."}
              </p>
              <div className="mt-4">
                {!qbConnection ? (
                  <p className="text-sm text-muted"><Link href="/admin/settings" className="font-semibold text-link">Connect QuickBooks</Link> to pick a customer.</p>
                ) : qbError ? (
                  <p className="text-sm text-danger">{qbError}</p>
                ) : (
                  <QuickBooksLink key={client.quickbooks_customer_id ?? "none"} clientId={client.id} linkedId={client.quickbooks_customer_id}
                    suggestedId={suggested?.id ?? null}
                    customers={customers.map(({ id, displayName, email }) => ({ id, displayName, email }))} />
                )}
              </div>
            </Card>
          ) : null}
          <Card>
            <h2 className="mb-4 text-lg font-bold">Details</h2>
            <ClientForm client={client} />
          </Card>
        </div>
      </div>
      <div className="mt-6"><ActivityCard rows={activity.rows} nextBefore={activity.nextBefore} clientId={client.id} /></div>
    </>
  );
}
