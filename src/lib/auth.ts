import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export async function getViewer(): Promise<Viewer | null> {
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
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "admin") redirect(homeForRole(viewer.role));
  return viewer;
}

export async function requireClient(): Promise<Viewer & { clientId: string }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role !== "client" || !viewer.clientId) redirect(homeForRole(viewer.role));
  return viewer as Viewer & { clientId: string };
}
