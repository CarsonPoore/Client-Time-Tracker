import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleEvent } from "@/lib/sync/engine";
import { getSyncDeps, getWebhookSettings } from "@/lib/sync/factory";
import { processWebhook } from "@/lib/sync/webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const db = createAdminClient();
  const { cu, store } = getSyncDeps();
  const result = await processWebhook(raw, request.headers.get("x-signature"), {
    log: {
      getSecret: async () => (await getWebhookSettings())?.secret ?? null,
      record: async (eventId, event, payload) => {
        const { data, error } = await db.from("clickup_events")
          .upsert({ event_id: eventId, event, payload }, { onConflict: "event_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        return (data?.length ?? 0) > 0;
      },
      finish: async (eventId, error) => {
        await db.from("clickup_events").update({ processed_at: new Date().toISOString(), error }).eq("event_id", eventId);
      },
    },
    handle: (payload) => handleEvent(cu, store, payload),
  });
  return new NextResponse(result.body, { status: result.status });
}
