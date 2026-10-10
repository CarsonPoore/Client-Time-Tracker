import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTAL_STATUS_LABEL, portalStatus } from "../portal-status";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients").select("id, name, is_active, portal_user_id, projects(count)")
    .eq("is_active", true).order("name");

  const needsUsers = (clients ?? []).some((c) => c.portal_user_id);
  const lastSignIn = new Map<string, string | null>();
  if (needsUsers) {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
  }

  return (
    <>
      <PageHeader eyebrow="Clients" title="Everyone you're working with" />
      {clients?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/admin/clients/${c.id}`}>
              <Card className="h-full transition-colors hover:border-royal">
                <p className="text-lg font-bold">{c.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {(c.projects as unknown as { count: number }[])[0]?.count ?? 0} projects · {PORTAL_STATUS_LABEL[portalStatus(c.portal_user_id, c.portal_user_id ? lastSignIn.get(c.portal_user_id) : null)]}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No clients yet" body="Import your ClickUp spaces in Settings." />}
    </>
  );
}
