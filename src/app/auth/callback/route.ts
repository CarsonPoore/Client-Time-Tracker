import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole } from "@/lib/auth";
import { resolveCallback } from "@/lib/auth-callback";
import { serverEnv } from "@/lib/env";
import type { Role } from "@/lib/types";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const expired = () => NextResponse.redirect(`${origin}/login?error=link_expired`);
  const denied = () => NextResponse.redirect(`${origin}/login?error=no_access`);

  const code = request.nextUrl.searchParams.get("code");
  if (!code) return expired();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return expired();
  const user = data.user;
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("user_id", user.id).maybeSingle();

  const decision = resolveCallback({
    profile: profile ? { role: profile.role as Role } : null,
    profileError: !!profileError,
    provider: user.app_metadata.provider,
    email: user.email,
    allowlist: serverEnv().ADMIN_EMAILS,
  });

  if (decision.kind === "deny") {
    await supabase.auth.signOut();
    if (decision.deleteUser) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      if (delError) console.error("callback: deleteUser failed", delError.message);
    }
    return denied();
  }

  if (decision.kind === "create_admin") {
    const { error: insertError } = await admin.from("profiles").insert({
      user_id: user.id, role: "admin", email: user.email!, full_name: user.user_metadata.full_name ?? null,
    });
    if (insertError) {
      await supabase.auth.signOut();
      return denied();
    }
  }
  return NextResponse.redirect(`${origin}${homeForRole("admin")}`);
}
