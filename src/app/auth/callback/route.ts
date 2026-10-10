import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homeForRole, isAdminEmail } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import type { Role } from "@/lib/types";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=link_expired`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=link_expired`);
  const user = data.user;
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  let role = (profile?.role as Role | undefined) ?? null;

  if (!role && user.app_metadata.provider === "google") {
    if (isAdminEmail(user.email, serverEnv().ADMIN_EMAILS)) {
      await admin.from("profiles").insert({
        user_id: user.id, role: "admin", email: user.email!, full_name: user.user_metadata.full_name ?? null,
      });
      role = "admin";
    } else {
      await supabase.auth.signOut();
      await admin.auth.admin.deleteUser(user.id);
      return NextResponse.redirect(`${origin}/login?error=no_access`);
    }
  }

  if (!role) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  return NextResponse.redirect(`${origin}${homeForRole(role)}`);
}
