import Link from "next/link";
import { formatMonth, shiftMonth } from "@/lib/time";

/** `keep` is extra query string (e.g. "view=weeks") carried across month changes. */
export function MonthNav({ month, basePath, keep = "" }: { month: string; basePath: string; keep?: string }) {
  const q = keep ? `&${keep}` : "";
  const link = "rounded-md px-2 py-1 text-sm font-semibold text-link hover:bg-line";
  return (
    <div className="flex items-center gap-2">
      <Link className={link} href={`${basePath}?month=${shiftMonth(month, -1)}${q}`} aria-label="Previous month">←</Link>
      <span className="min-w-36 text-center font-semibold">{formatMonth(month)}</span>
      <Link className={link} href={`${basePath}?month=${shiftMonth(month, 1)}${q}`} aria-label="Next month">→</Link>
    </div>
  );
}
