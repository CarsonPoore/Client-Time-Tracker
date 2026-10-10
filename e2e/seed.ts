import { createClient } from "@supabase/supabase-js";

export const e2eEnabled = Boolean(
  process.env.E2E_BASE_URL && process.env.E2E_CLIENT_EMAIL && process.env.E2E_CLIENT_PASSWORD &&
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export async function seedE2E(): Promise<{ projectId: string; deliverableId: string }> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = process.env.E2E_CLIENT_EMAIL!;
  const password = process.env.E2E_CLIENT_PASSWORD!;

  const { data: client } = await db.from("clients").upsert({ name: "E2E Test Client", clickup_space_id: "e2e-space", contact_email: email }, { onConflict: "clickup_space_id" }).select("id").single();
  let userId: string;
  const { data: created } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.user) userId = created.user.id;
  else {
    const { data: list } = await db.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)!.id;
    await db.auth.admin.updateUserById(userId, { password });
  }
  await db.from("profiles").upsert({ user_id: userId, role: "client", client_id: client!.id, email });
  await db.from("clients").update({ portal_user_id: userId }).eq("id", client!.id);
  const { data: project } = await db.from("projects").upsert({ client_id: client!.id, clickup_list_id: "e2e-list", name: "E2E Project" }, { onConflict: "clickup_list_id" }).select("id").single();
  const { data: d } = await db.from("deliverables").insert({
    project_id: project!.id, title: `E2E deliverable ${Date.now()}`, link_url: "https://example.com",
    status: "awaiting_approval", published_at: new Date().toISOString(),
  }).select("id").single();
  return { projectId: project!.id, deliverableId: d!.id };
}
