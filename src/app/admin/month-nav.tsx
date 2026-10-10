import Link from "next/link";
import { formatMonth, shiftMonth } from "@/lib/time";

export function MonthNav({ month, basePath }: { month: string; basePath: string }) {
  const link = "rounded-md px-2 py-1 text-sm font-semibold text-link hover:bg-line";
  return (
    <div className="flex items-center gap-2">
      <Link className={link} href={`${basePath}?month=${shiftMonth(month, -1)}`} aria-label="Previous month">←</Link>
      <span className="min-w-36 text-center font-semibold">{formatMonth(month)}</span>
      <Link className={link} href={`${basePath}?month=${shiftMonth(month, 1)}`} aria-label="Next month">→</Link>
    </div>
  );
}
