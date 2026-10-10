import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients").select("id, name, is_active, portal_user_id, projects(count)")
    .eq("is_active", true).order("name");

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
                  {(c.projects as unknown as { count: number }[])[0]?.count ?? 0} projects · {c.portal_user_id ? "Portal invited" : "Not invited"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      ) : <EmptyState title="No clients yet" body="Import your ClickUp spaces in Settings." />}
    </>
  );
}
