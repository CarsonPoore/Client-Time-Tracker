import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getQuickBooksClient, saveConnection } from "@/lib/quickbooks/connection";
import { serverEnv } from "@/lib/env";
import { STATE_COOKIE, sameState } from "@/lib/quickbooks/oauth-state";

export async function GET(request: NextRequest) {
  await requireAdmin();
  const settings = `${serverEnv().APP_URL}/admin/settings`;
  const done = (qb: string) => {
    const res = NextResponse.redirect(`${settings}?qb=${qb}`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/quickbooks" });
    return res;
  };
  const p = request.nextUrl.searchParams;
  if (!sameState(p.get("state"), request.cookies.get(STATE_COOKIE)?.value)) return done("bad_state");
  if (p.get("error")) return done("denied");
  const code = p.get("code");
  const realmId = p.get("realmId");
  const qb = getQuickBooksClient();
  if (!qb) return done("not_configured");
  if (!code || !realmId) return done("failed");
  try {
    const tokens = await qb.exchangeCode(code);
    const companyName = await qb.getCompanyName(tokens.accessToken, realmId).catch(() => null);
    await saveConnection(realmId, companyName, tokens);
  } catch (e) {
    console.error("QuickBooks connect failed", e);
    return done("failed");
  }
  return done("connected");
}
