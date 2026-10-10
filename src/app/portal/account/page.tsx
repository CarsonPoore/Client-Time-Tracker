import { Card, LinkButton, PageHeader } from "@/components/ui";
import { requireClient } from "@/lib/auth";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const viewer = await requireClient();
  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" />
      <Card className="max-w-lg space-y-4">
        <p><span className="text-sm text-muted">Signed in as</span><br /><span className="font-semibold">{viewer.email}</span></p>
        <LinkButton variant="secondary" href="/set-password">Change password</LinkButton>
      </Card>
    </>
  );
}
