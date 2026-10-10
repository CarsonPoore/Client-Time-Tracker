import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternHour, isDigestEmpty, weekStartEastern } from "@/lib/email/digest";
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
  const { data: clients } = await db.from("clients").select("id, name, contact_email").eq("is_active", true).not("portal_user_id", "is", null);
  const result = { sent: 0, empty: 0, already: 0, failed: 0 };

  for (const c of clients ?? []) {
    if (!c.contact_email) continue;
    const { data: claimed } = await db.from("digest_sends")
      .upsert({ client_id: c.id, week_start: week }, { onConflict: "client_id,week_start", ignoreDuplicates: true }).select("id");
    if (!claimed?.length) { result.already++; continue; }
    const content = await loadDigest(c.id, c.name, now);
    if (isDigestEmpty(content)) { result.empty++; continue; }
    const ok = await sendEmail({ to: c.contact_email, ...digestEmail(content, env.APP_URL) });
    if (ok) result.sent++;
    else {
      result.failed++;
      await db.from("digest_sends").delete().eq("client_id", c.id).eq("week_start", week);
    }
  }
  return NextResponse.json(result);
}
