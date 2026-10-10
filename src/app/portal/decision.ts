export type Decision = "approved" | "changes_requested";

export function parseDecision(form: FormData): { ok: true; decision: Decision; feedback: string | null } | { ok: false; error: string } {
  const decision = form.get("decision");
  if (decision !== "approved" && decision !== "changes_requested") return { ok: false, error: "Choose approve or request changes." };
  const raw = String(form.get("feedback") ?? "").trim();
  if (decision === "changes_requested" && !raw) return { ok: false, error: "Tell us what to change." };
  if (raw.length > 5000) return { ok: false, error: "Keep feedback under 5,000 characters." };
  return { ok: true, decision, feedback: raw || null };
}

