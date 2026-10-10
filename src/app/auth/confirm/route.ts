import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveConfirm } from "@/lib/auth-callback";
import type { Role } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=link_expired`);

  // Only client accounts use password links; admins sign in with Google.
  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("user_id", data.user.id).maybeSingle();
  const decision = resolveConfirm({
    profile: profile ? { role: profile.role as Role } : null,
    profileError: !!profileError,
  });
  if (decision === "deny") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=no_access`);
  }
  return NextResponse.redirect(`${origin}/set-password`);
}
