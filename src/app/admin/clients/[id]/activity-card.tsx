import { Card, EmptyState } from "@/components/ui";
import type { ActivityItem } from "@/lib/admin-data";
import { ActivityMore } from "./activity-more";
import { ActivityRowItem } from "./activity-row";

export function ActivityCard({ rows, nextBefore, clientId }: { rows: ActivityItem[]; nextBefore: string | null; clientId: string }) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold">Activity</h2>
      {rows.length ? (
        <>
          <ul className="divide-y divide-line">{rows.map((r) => <ActivityRowItem key={r.id} row={r} />)}</ul>
          <ActivityMore clientId={clientId} nextBefore={nextBefore} />
        </>
      ) : <EmptyState title="No activity yet" />}
    </Card>
  );
}
