import Link from "next/link";
import { Card, EmptyState, LinkButton, PageHeader, formatDate } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview" };

export default async function PortalHome() {
  const viewer = await requireClient();
  const supabase = await createClient();
  const [{ data: client }, { data: projects }, { data: awaiting }, { data: updates }] = await Promise.all([
    supabase.from("clients").select("name, quickbooks_invoices_url").eq("id", viewer.clientId).single(),
    supabase.from("projects").select("id, name, status, due_date").order("name"),
    supabase.from("deliverables").select("id, title, project_id, published_at, project:projects!inner(id)").eq("status", "awaiting_approval").order("published_at"),
    supabase.from("updates").select("id, body, published_at, project:projects!inner(name)").order("published_at", { ascending: false }).limit(5),
  ]);
  const awaitingByProject = new Map<string, number>();
  awaiting?.forEach((d) => awaitingByProject.set(d.project_id, (awaitingByProject.get(d.project_id) ?? 0) + 1));

  return (
    <>
      <PageHeader eyebrow="Client portal" title={client?.name ?? "Welcome"}
        actions={client?.quickbooks_invoices_url
          ? <LinkButton variant="secondary" href={client.quickbooks_invoices_url} target="_blank" rel="noreferrer">View invoices</LinkButton>
          : undefined} />

      {awaiting?.length ? (
        <section aria-labelledby="needs-you" className="relative mb-8 overflow-hidden rounded-xl bg-navy p-6 text-offwhite">
          <p id="needs-you" className="text-xs font-semibold uppercase tracking-widest text-gold">Needs your review</p>
          <ul className="mt-3 space-y-2">
            {awaiting.map((d) => (
              <li key={d.id}>
                <Link href={`/portal/deliverables/${d.id}`} className="text-xl font-bold hover:text-gold">{d.title} →</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="projects-h">
          <h2 id="projects-h" className="mb-4 text-lg font-bold">Projects</h2>
          {projects?.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p, i) => (
                <Link key={p.id} href={`/portal/projects/${p.id}`} className={i === 0 ? "sm:col-span-2" : ""}>
                  <Card className="h-full transition-colors hover:border-royal">
                    <p className={i === 0 ? "text-2xl font-black" : "text-lg font-bold"}>{p.name}</p>
                    <p className="mt-2 text-sm text-muted">
                      {p.status ? `${p.status} · ` : ""}{p.due_date ? `Due ${formatDate(p.due_date)}` : "No due date"}
                    </p>
                    {awaitingByProject.get(p.id) ? (
                      <p className="mt-3 text-sm font-semibold text-royal">{awaitingByProject.get(p.id)} awaiting your approval</p>
                    ) : null}
                  </Card>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No active projects" body="Your projects will appear here once work begins." />}
        </section>
        <section aria-labelledby="updates-h">
          <h2 id="updates-h" className="mb-4 text-lg font-bold">Latest updates</h2>
          {updates?.length ? (
            <ul className="space-y-4">
              {updates.map((u) => (
                <li key={u.id} className="border-l-2 border-gold pl-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {formatDate(u.published_at)} · {(u.project as unknown as { name: string } | null)?.name}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{u.body}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No updates yet" />}
        </section>
      </div>
    </>
  );
}
