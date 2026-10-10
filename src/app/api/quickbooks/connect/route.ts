import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getQuickBooksClient } from "@/lib/quickbooks/connection";
import { serverEnv } from "@/lib/env";
import { STATE_COOKIE } from "@/lib/quickbooks/oauth-state";

export async function GET() {
  await requireAdmin();
  const qb = getQuickBooksClient();
  if (!qb) return NextResponse.redirect(`${serverEnv().APP_URL}/admin/settings?qb=not_configured`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(qb.authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/quickbooks", maxAge: 600 });
  return res;
}
