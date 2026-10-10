import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { serverEnv } from "@/lib/env";
import { isDefaultClientSpace } from "@/lib/clickup/mapping";
import { ActionButton, SpaceToggle } from "./space-toggle";
import { connectWebhook, importSpaces, syncNow } from "../actions";
import { disconnectQuickBooks } from "../quickbooks-actions";
import { getConnection, quickbooksConfig } from "@/lib/quickbooks/connection";

export const metadata = { title: "Settings" };

const STALE_RUN_MS = 10 * 60_000;

const QB_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "QuickBooks connected.", ok: true },
  denied: { text: "QuickBooks access was declined.", ok: false },
  bad_state: { text: "That QuickBooks sign-in expired or didn't match. Try again.", ok: false },
  failed: { text: "Couldn't connect to QuickBooks. Try again.", ok: false },
  not_configured: { text: "QuickBooks credentials aren't set on the server.", ok: false },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ qb?: string }> }) {
  await requireAdmin();
  const qbNotice = QB_MESSAGES[(await searchParams).qb ?? ""];
  const qbConfigured = Boolean(quickbooksConfig());
  const qbConnection = qbConfigured ? await getConnection() : null;
  const supabase = await createClient();
  const [{ data: clients }, { data: runs }, webhook] = await Promise.all([
    supabase.from("clients").select("clickup_space_id, is_active").not("clickup_space_id", "is", null),
    supabase.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
    getWebhookSettings(),
  ]);
  let spaces: { id: string; name: string }[] = [];
  let clickupError: string | null = null;
  try {
    spaces = await getSyncDeps().cu.getSpaces(serverEnv().CLICKUP_TEAM_ID);
  } catch {
    clickupError = "Couldn't reach ClickUp. Check the API token.";
  }
  const state = new Map((clients ?? []).map((c) => [c.clickup_space_id as string, c.is_active as boolean]));
  const hasNewDefaults = spaces.some((s) => !state.has(s.id) && isDefaultClientSpace(s.name));
  const now = Date.now();

  return (
    <>
      <PageHeader eyebrow="Settings" title="Connections" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">Live updates</h2>
          <p className="mt-1 text-sm text-muted">{webhook ? "Connected. ClickUp sends changes as they happen." : "Not connected yet."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton action={connectWebhook} label={webhook ? "Reconnect webhook" : "Connect webhook"} />
            <ActionButton action={syncNow} label="Sync now" variant="secondary" />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">Which spaces are clients?</h2>
          {clickupError ? <p className="mt-2 text-sm text-danger">{clickupError}</p> : null}
          {hasNewDefaults ? (
            <div className="mt-4"><ActionButton action={importSpaces} label="Add new client spaces" /></div>
          ) : null}
          <ul className="mt-4 divide-y divide-line">
            {spaces.map((s) => (
              <li key={`${s.id}:${state.get(s.id) ?? "new"}`} className="py-2">
                <SpaceToggle spaceId={s.id} name={s.name} checked={state.get(s.id) ?? false} isNew={!state.has(s.id)} />
              </li>
            ))}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold">QuickBooks</h2>
          {qbNotice ? <p className={`mt-2 text-sm ${qbNotice.ok ? "text-ok" : "text-danger"}`}>{qbNotice.text}</p> : null}
          <p className="mt-1 text-sm text-muted">
            {!qbConfigured ? "Not set up. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to the server environment."
              : qbConnection ? `Connected to ${qbConnection.companyName ?? `company ${qbConnection.realmId}`}. Read-only: CPC OS only reads your customer list. Reconnect before ${new Date(qbConnection.refreshExpiresAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}.`
              : "Not connected. Connect to link each client to its QuickBooks customer."}
          </p>
          {qbConfigured ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <LinkButton href="/api/quickbooks/connect" prefetch={false}>{qbConnection ? "Reconnect QuickBooks" : "Connect QuickBooks"}</LinkButton>
              {qbConnection ? <ActionButton action={disconnectQuickBooks} label="Disconnect" variant="secondary" /> : null}
            </div>
          ) : null}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">Sync history</h2>
          {runs?.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="py-2">When</th><th>Type</th><th>Result</th><th>Details</th></tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const stale = !r.finished_at && now - new Date(r.started_at).getTime() > STALE_RUN_MS;
                  const result = r.ok ? "OK" : r.finished_at ? "Failed" : stale ? "Didn't finish" : "Running";
                  const detail = r.error ?? (stale ? "This run didn't finish." : Object.entries(r.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(", "));
                  return (
                    <tr key={r.id}>
                      <td className="py-2">{new Date(r.started_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
                      <td className="capitalize">{r.kind}</td>
                      <td className={r.ok ? "text-ok" : r.finished_at || stale ? "text-danger" : "text-muted"}>{result}</td>
                      <td className="text-muted">{detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <EmptyState title="No syncs yet" />}
        </Card>
      </div>
    </>
  );
}
