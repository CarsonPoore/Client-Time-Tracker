import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnVariants = {
  primary: "bg-royal text-white hover:bg-royal-hover",
  secondary: "border border-line bg-surface text-fg hover:bg-surface-2",
  danger: "border border-danger text-danger hover:bg-surface-2",
} as const;
type Variant = keyof typeof btnVariants;

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${btnBase} ${btnVariants[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${btnBase} ${btnVariants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`rounded-xl border border-line bg-surface p-5 shadow-sm ${className}`} {...props} />;
}

const pillTones: Record<string, string> = {
  draft: "bg-surface-2 text-muted",
  awaiting_approval: "bg-royal/10 text-link",
  approved: "bg-ok/15 text-ok",
  changes_requested: "bg-warn/15 text-warn",
  open: "bg-royal/10 text-link",
  done: "bg-ok/15 text-ok",
};
const pillLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  open: "Open",
  done: "Done",
};

export function StatusPill({ status, color }: { status: string; color?: string | null }) {
  const tone = pillTones[status] ?? "bg-surface-2 text-fg";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {color ? <span aria-hidden className="size-2 rounded-full" style={{ background: color }} /> : null}
      {pillLabels[status] ?? status}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={4} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function PageHeader({ eyebrow, title, actions }: { eyebrow?: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-widest text-muted">{eyebrow}</p> : null}
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-semibold">{title}</p>
      {body ? <p className="mt-1 text-sm text-muted">{body}</p> : null}
    </div>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (success) return <p role="status" className="text-sm text-ok">{success}</p>;
  return null;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}
