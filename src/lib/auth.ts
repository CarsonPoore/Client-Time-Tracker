import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import type { Role } from "@/lib/types";

export interface Viewer {
  userId: string;
  email: string;
  role: Role;
  clientId: string | null;
  fullName: string | null;
}

export function homeForRole(role: Role | null): string {
  if (role === "admin") return "/admin";
  if (role === "client") return "/portal";
  return "/login?error=no_access";
}

export function isAdminEmail(email: string | null | undefined, allow: string[]): boolean {
  if (!email) return false;
  return allow.includes(email.trim().toLowerCase());
}

export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/")) return null;
  if (/^\/[/\\]/.test(next) || next.includes("\\") || /[\x00-\x1f\x7f]/.test(next)) return null;
  return next;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    userId: user.id,
    email: profile.email,
    role: profile.role as Role,
    clientId: profile.client_id,
    fullName: profile.full_name,
  };
});

/** An admin dropped from ADMIN_EMAILS loses DB access: delete their profile (service role) and end the session. */
async function revokeAdmin(userId: string): Promise<void> {
  try {
    const { error } = await createAdminClient().from("profiles").delete().eq("user_id", userId);
    if (error) console.error("requireAdmin: profile delete failed", error.message);
  } catch (e) {
    console.error("requireAdmin: profile delete failed", e);
  }
  try {
    await (await createClient()).auth.signOut();
  } catch (e) {
    console.error("requireAdmin: signOut failed", e);
  }
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "admin") redirect(homeForRole(viewer.role));
  if (!isAdminEmail(viewer.email, serverEnv().ADMIN_EMAILS)) {
    await revokeAdmin(viewer.userId);
    redirect("/login?error=no_access");
  }
  return viewer;
}

export async function requireClient(): Promise<Viewer & { clientId: string }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "client" || !viewer.clientId) redirect(homeForRole(viewer.role));
  return viewer as Viewer & { clientId: string };
}
