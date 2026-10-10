import Link from "next/link";
import type { VersionRow } from "@/lib/types";

const STATUS: Record<string, string> = {
  draft: "Draft", awaiting_approval: "Awaiting approval", approved: "Approved", changes_requested: "Changes requested",
};

export function versionStatusLabel(v: VersionRow, currentId: string | null) {
  if (v.status === "awaiting_approval" && v.id !== currentId) return "Superseded";
  return STATUS[v.status] ?? v.status;
}

export function VersionTabs({ versions, selectedId, currentId, hrefFor }: {
  versions: VersionRow[]; selectedId: string; currentId: string | null; hrefFor: (id: string) => string;
}) {
  return (
    <nav aria-label="Versions" className="flex flex-wrap gap-2">
      {versions.map((v) => (
        <Link key={v.id} href={hrefFor(v.id)} aria-current={v.id === selectedId ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${v.id === selectedId ? "border-fg bg-fg text-bg" : "border-line hover:bg-surface-2"}`}>
          v{v.number} · {versionStatusLabel(v, currentId)}
        </Link>
      ))}
    </nav>
  );
}
