import { AppShell } from "@/components/shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  return (
    <AppShell area="admin" userLabel={viewer.fullName ?? viewer.email}
      nav={[
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/clients", label: "Clients" },
        { href: "/admin/settings", label: "Settings" },
      ]}>
      {children}
    </AppShell>
  );
}
