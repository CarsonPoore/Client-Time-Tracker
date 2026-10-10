import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { QuickBooksClient, type QBConfig, type QBCustomer, type QBTokens } from "./client";

const REFRESH_MARGIN_MS = 5 * 60_000;

export interface QBConnection {
  realmId: string;
  companyName: string | null;
  connectedAt: string;
  refreshExpiresAt: string;
}

/** QuickBooks is optional: without credentials the feature stays hidden. */
export function quickbooksConfig(env: Record<string, string | undefined> = process.env): QBConfig | null {
  const clientId = env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    environment: env.QUICKBOOKS_ENVIRONMENT?.trim() === "sandbox" ? "sandbox" : "production",
    redirectUri: `${serverEnv().APP_URL}/api/quickbooks/callback`,
  };
}

export function getQuickBooksClient(): QuickBooksClient | null {
  const config = quickbooksConfig();
  return config ? new QuickBooksClient(config) : null;
}

export async function getConnection(): Promise<QBConnection | null> {
  const { data } = await createAdminClient().from("quickbooks_connection")
    .select("realm_id, company_name, connected_at, refresh_expires_at").maybeSingle();
  if (!data) return null;
  return { realmId: data.realm_id, companyName: data.company_name, connectedAt: data.connected_at, refreshExpiresAt: data.refresh_expires_at };
}

export async function saveConnection(realmId: string, companyName: string | null, t: QBTokens): Promise<void> {
  const { error } = await createAdminClient().from("quickbooks_connection").upsert({
    id: true,
    realm_id: realmId,
    company_name: companyName,
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    access_expires_at: t.accessExpiresAt.toISOString(),
    refresh_expires_at: t.refreshExpiresAt.toISOString(),
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Couldn't save the QuickBooks connection: ${error.message}`);
}

/** Returns a live access token, refreshing (and storing the rotated refresh token) when it's near expiry. */
async function accessToken(qb: QuickBooksClient): Promise<{ token: string; realmId: string } | null> {
  const db = createAdminClient();
  const { data } = await db.from("quickbooks_connection").select("*").maybeSingle();
  if (!data) return null;
  if (new Date(data.access_expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return { token: data.access_token, realmId: data.realm_id };
  }
  const t = await qb.refresh(data.refresh_token);
  const { error } = await db.from("quickbooks_connection").update({
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    access_expires_at: t.accessExpiresAt.toISOString(),
    refresh_expires_at: t.refreshExpiresAt.toISOString(),
  }).eq("id", true);
  if (error) throw new Error(`Couldn't store refreshed QuickBooks tokens: ${error.message}`);
  return { token: t.accessToken, realmId: data.realm_id };
}

export async function listCustomers(): Promise<QBCustomer[] | null> {
  const qb = getQuickBooksClient();
  if (!qb) return null;
  const auth = await accessToken(qb);
  return auth ? qb.listCustomers(auth.token, auth.realmId) : null;
}

export async function getCustomer(id: string): Promise<QBCustomer | null> {
  const qb = getQuickBooksClient();
  if (!qb) return null;
  const auth = await accessToken(qb);
  return auth ? qb.getCustomer(auth.token, auth.realmId, id) : null;
}

/** Revokes at Intuit (best effort) and deletes the stored tokens. Client links are kept. */
export async function disconnect(): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("quickbooks_connection").select("refresh_token").maybeSingle();
  const qb = getQuickBooksClient();
  if (data && qb) {
    try { await qb.revoke(data.refresh_token); } catch (e) { console.error("QuickBooks revoke failed", e); }
  }
  const { error } = await db.from("quickbooks_connection").delete().eq("id", true);
  if (error) throw new Error(`Couldn't remove the QuickBooks connection: ${error.message}`);
}
