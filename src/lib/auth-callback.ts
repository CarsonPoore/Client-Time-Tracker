import { isAdminEmail } from "@/lib/auth";
import type { Role } from "@/lib/types";

export type CallbackDecision =
  | { kind: "create_admin" }
  | { kind: "allow"; role: "admin" }
  | { kind: "deny"; deleteUser: boolean };

export function resolveCallback(input: {
  profile: { role: Role } | null;
  profileError: boolean;
  provider: string | undefined;
  email: string | null | undefined;
  allowlist: string[];
}): CallbackDecision {
  const { profile, profileError, provider, email, allowlist } = input;
  if (profileError) return { kind: "deny", deleteUser: false };
  const allowed = isAdminEmail(email, allowlist);
  if (profile) {
    if (profile.role === "admin" && allowed) return { kind: "allow", role: "admin" };
    return { kind: "deny", deleteUser: false };
  }
  if (provider === "google") {
    return allowed ? { kind: "create_admin" } : { kind: "deny", deleteUser: true };
  }
  return { kind: "deny", deleteUser: false };
}
