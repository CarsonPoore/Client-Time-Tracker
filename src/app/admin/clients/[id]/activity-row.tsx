import Link from "next/link";
import type { ActivityItem } from "@/lib/admin-data";

const TYPES: Record<string, { icon: string; label: string }> = {
  version_published: { icon: "📤", label: "Version published" },
  version_approved: { icon: "✅", label: "Approved" },
  changes_requested: { icon: "✏️", label: "Changes requested" },
  comment_added: { icon: "💬", label: "Comment" },
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];

export function relativeTime(iso: string, now = Date.now()): string {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  const fmt = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const [unit, size] of UNITS) if (Math.abs(secs) >= size) return fmt.format(Math.trunc(secs / size), unit);
  return "just now";
}

export function ActivityRowItem({ row }: { row: ActivityItem }) {
  const t = TYPES[row.type] ?? { icon: "•", label: row.type };
  const body = <span className="font-semibold">{row.summary}</span>;
  return (
    <li className="flex items-start gap-3 py-3">
      <span aria-hidden="true">{t.icon}</span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t.label}: </span>
        {row.href ? <Link href={row.href} className="hover:text-link">{body}</Link> : body}
        <p className="text-sm text-muted">
          <time dateTime={row.created_at} title={new Date(row.created_at).toLocaleString("en-US")} suppressHydrationWarning>{relativeTime(row.created_at)}</time>
        </p>
      </div>
    </li>
  );
}
