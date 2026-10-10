export type PortalStatus = "not_invited" | "invited" | "active";

export function portalStatus(portalUserId: string | null, lastSignInAt: string | null | undefined): PortalStatus {
  if (!portalUserId) return "not_invited";
  return lastSignInAt ? "active" : "invited";
}

export const PORTAL_STATUS_LABEL: Record<PortalStatus, string> = {
  not_invited: "Not invited",
  invited: "Invited",
  active: "Active",
};
