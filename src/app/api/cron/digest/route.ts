import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternHour, weekStartEastern } from "@/lib/email/digest";
import { processClientDigest, type DigestDeps } from "@/lib/email/digest-run";
import { loadDigest } from "@/lib/email/digest-loader";
import { digestEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return new NextResponse("unauthorized", { status: 401 });
  const env = serverEnv();
  const now = new Date();
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && easternHour(now) < 7) return NextResponse.json({ skipped: "too early" });

  const db = createAdminClient();
  const week = weekStartEastern(now);
  const { data: clients, error: clientsError } = await db.from("clients").select("id, name, contact_email").eq("is_active", true).not("portal_user_id", "is", null);
  if (clientsError) {
    console.error("Digest clients query failed", clientsError);
    return NextResponse.json({ error: "clients query failed" }, { status: 500 });
  }
  const result = { sent: 0, empty: 0, already: 0, failed: 0 };

  const deps: DigestDeps = {
    async claim(clientId) {
      const { data, error } = await db.from("digest_sends")
        .upsert({ client_id: clientId, week_start: week }, { onConflict: "client_id,week_start", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(`claim failed: ${error.message}`);
      return data?.length ? "claimed" : "already";
    },
    async release(clientId) {
      const { error } = await db.from("digest_sends").delete().eq("client_id", clientId).eq("week_start", week);
      if (error) throw new Error(`release failed: ${error.message}`);
    },
    load: (id, name) => loadDigest(id, name, now),
    send: (to, content) => sendEmail({ to, ...digestEmail(content, env.APP_URL) }),
  };

  for (const c of clients ?? []) {
    if (!c.contact_email) continue;
    result[await processClientDigest({ id: c.id, name: c.name, contact_email: c.contact_email }, deps)]++;
  }
  return NextResponse.json(result);
}
