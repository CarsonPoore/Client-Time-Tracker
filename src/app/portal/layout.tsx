import { AppShell } from "@/components/shell";
import { requireClient } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireClient();
  return (
    <AppShell area="portal" userLabel={viewer.email}
      nav={[{ href: "/portal", label: "Overview" }, { href: "/portal/account", label: "Account" }]}>
      {children}
    </AppShell>
  );
}
