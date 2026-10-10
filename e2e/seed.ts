import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const e2eEnabled = Boolean(
  process.env.E2E_BASE_URL && process.env.E2E_CLIENT_EMAIL && process.env.E2E_CLIENT_PASSWORD &&
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
);

const CLIENT_NAME = "E2E Test Client";
const PROJECT_NAME = "E2E Project";

// Throws on any Supabase error. Returns data typed as any: callers read only fields they just selected.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(res: { data: unknown; error: { message: string } | null }, what: string): any {
  if (res.error) throw new Error(`E2E seed: ${what} failed: ${res.error.message}`);
  return res.data;
}

// The seed runs with the service role, often against production. Refuse anything that is not clearly a test mailbox.
function connect(): { db: SupabaseClient; email: string; password: string } {
  const email = process.env.E2E_CLIENT_EMAIL!;
  if (!email.toLowerCase().includes("+e2e@")) {
    throw new Error('E2E seed refused: E2E_CLIENT_EMAIL must contain "+e2e@" (e.g. carsonpoore+e2e@gmail.com).');
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return { db, email, password: process.env.E2E_CLIENT_PASSWORD! };
}

async function findUserId(db: SupabaseClient, email: string): Promise<string | null> {
  const list: { users: { id: string; email?: string }[] } = must(await db.auth.admin.listUsers({ perPage: 1000 }), "listUsers");
  return list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function findE2EClientId(db: SupabaseClient): Promise<string | null> {
  const rows: { id: string }[] = must(await db.from("clients").select("id").eq("name", CLIENT_NAME).is("clickup_space_id", null).limit(1), "find client");
  return rows[0]?.id ?? null;
}

export async function seedE2E(): Promise<{ projectId: string; deliverableId: string }> {
  const { db, email, password } = connect();

  // Hidden from real workflows: no ClickUp space and inactive (admin list, digest and reconcile skip it).
  let clientId = await findE2EClientId(db);
  if (!clientId) {
    clientId = must(await db.from("clients").insert({ name: CLIENT_NAME, clickup_space_id: null, is_active: false, contact_email: email }).select("id").single(), "create client").id;
  }

  let userId = await findUserId(db, email);
  if (userId) {
    const existing = must(await db.from("profiles").select("role, client_id").eq("user_id", userId).maybeSingle(), "read profile");
    if (existing && (existing.role !== "client" || existing.client_id !== clientId)) {
      throw new Error("E2E seed refused: that user already has a profile that is not the E2E client. Use a dedicated +e2e@ address.");
    }
    must(await db.auth.admin.updateUserById(userId, { password }), "set password");
  } else {
    userId = must(await db.auth.admin.createUser({ email, password, email_confirm: true }), "create user").user.id;
  }
  must(await db.from("profiles").upsert({ user_id: userId, role: "client", client_id: clientId, email }), "upsert profile");
  must(await db.from("clients").update({ portal_user_id: userId }).eq("id", clientId), "link portal user");

  const found = must(await db.from("projects").select("id").eq("client_id", clientId).eq("name", PROJECT_NAME).limit(1), "find project");
  const projectId = found[0]?.id ?? must(await db.from("projects").insert({ client_id: clientId, clickup_list_id: null, name: PROJECT_NAME }).select("id").single(), "create project").id;

  const d = must(await db.from("deliverables").insert({
    project_id: projectId, title: `E2E deliverable ${Date.now()}`, link_url: "https://example.com",
    status: "awaiting_approval", published_at: new Date().toISOString(),
  }).select("id").single(), "create deliverable");
  return { projectId, deliverableId: d.id };
}

// Deletes the E2E client (projects, deliverables, requests and the profile cascade) and the E2E auth user.
export async function teardownE2E(): Promise<void> {
  const { db, email } = connect();
  const clientId = await findE2EClientId(db);
  const userId = await findUserId(db, email);
  if (userId) {
    const p = must(await db.from("profiles").select("role, client_id").eq("user_id", userId).maybeSingle(), "read profile");
    if (p && (p.role !== "client" || p.client_id !== clientId)) {
      throw new Error("E2E teardown refused: user profile is not the E2E client.");
    }
  }
  if (clientId) must(await db.from("clients").delete().eq("id", clientId), "delete client");
  if (userId) must(await db.auth.admin.deleteUser(userId), "delete user");
}
