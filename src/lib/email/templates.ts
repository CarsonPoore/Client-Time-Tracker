export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const nl2br = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

export function renderEmail({ preheader, heading, bodyHtml, bodyText, cta }: {
  preheader: string; heading: string; bodyHtml: string; bodyText: string; cta?: { label: string; url: string };
}): { html: string; text: string } {
  const button = cta
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(cta.url)}" style="background:#1e4fd8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f8f7f4;font-family:Figtree,Helvetica,Arial,sans-serif;color:#0b1b33">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:#0b1b33;padding:24px 28px;border-radius:12px 12px 0 0">
<p style="margin:0;color:#f8f7f4;font-weight:900;letter-spacing:.08em;font-size:13px">CARSON POORE CONSULTING</p>
<div style="width:56px;height:3px;background:#e0a030;margin-top:12px"></div>
<h1 style="margin:16px 0 0;color:#ffffff;font-size:26px;line-height:1.2;font-weight:900">${escapeHtml(heading)}</h1>
</td></tr>
<tr><td style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;font-size:16px;line-height:1.6;color:#2d3748">${bodyHtml}${button}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${heading}\n\n${bodyText}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\nCarson Poore Consulting`;
  return { html, text };
}

export function adminDecisionEmail(i: { clientName: string; title: string; decision: "approved" | "changes_requested"; feedback: string | null; url: string }) {
  const verb = i.decision === "approved" ? "approved" : "requested changes on";
  const feedbackHtml = i.feedback ? `<blockquote style="margin:16px 0 0;border-left:3px solid #e0a030;padding-left:12px">${nl2br(i.feedback)}</blockquote>` : "";
  return {
    subject: `${i.clientName} ${verb} "${i.title}"`,
    ...renderEmail({
      preheader: `${i.clientName} ${verb} ${i.title}`,
      heading: i.decision === "approved" ? "Deliverable approved" : "Changes requested",
      bodyHtml: `<p style="margin:0"><strong>${escapeHtml(i.clientName)}</strong> ${verb} <strong>${escapeHtml(i.title)}</strong>.</p>${feedbackHtml}`,
      bodyText: `${i.clientName} ${verb} "${i.title}".${i.feedback ? `\n\n${i.feedback}` : ""}`,
      cta: { label: "Open project", url: i.url },
    }),
  };
}

export function adminRequestEmail(i: { clientName: string; kind: "comment" | "request"; body: string; projectName: string | null; url: string }) {
  const label = i.kind === "request" ? "New request" : "New comment";
  return {
    subject: `${label} from ${i.clientName}`,
    ...renderEmail({
      preheader: i.body.slice(0, 90),
      heading: label,
      bodyHtml: `<p style="margin:0 0 12px;color:#4a5568;font-size:14px">${escapeHtml(i.clientName)}${i.projectName ? ` · ${escapeHtml(i.projectName)}` : ""}</p><p style="margin:0">${nl2br(i.body)}</p>`,
      bodyText: `${i.clientName}${i.projectName ? ` · ${i.projectName}` : ""}\n\n${i.body}`,
      cta: { label: "Open dashboard", url: i.url },
    }),
  };
}

export function clientPublishedEmail(i: { title: string; projectName: string; url: string }) {
  return {
    subject: `Ready for your review: ${i.title}`,
    ...renderEmail({
      preheader: `${i.title} is ready for your review.`,
      heading: "Ready for your review",
      bodyHtml: `<p style="margin:0"><strong>${escapeHtml(i.title)}</strong> for ${escapeHtml(i.projectName)} is ready. Take a look and approve it or tell us what to change.</p>`,
      bodyText: `${i.title} for ${i.projectName} is ready. Approve it or tell us what to change.`,
      cta: { label: "Review it", url: i.url },
    }),
  };
}

export interface DigestContent {
  clientName: string;
  updates: { project: string; body: string; date: string }[];
  awaiting: { id: string; title: string; project: string }[];
  statusChanges: { project: string; task: string; status: string }[];
  dueSoon: { project: string; task: string; due: string }[];
}

function section<T>(title: string, items: T[], html: (t: T) => string, text: (t: T) => string) {
  if (!items.length) return { html: "", text: "" };
  return {
    html: `<h2 style="margin:24px 0 8px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#0b1b33">${escapeHtml(title)}</h2><ul style="margin:0;padding-left:20px">${items.map((i) => `<li style="margin:6px 0">${html(i)}</li>`).join("")}</ul>`,
    text: `\n${title}\n${items.map((i) => `- ${text(i)}`).join("\n")}\n`,
  };
}

export function digestEmail(c: DigestContent, appUrl: string) {
  const parts = [
    section("Waiting on you", c.awaiting,
      (a) => `<a href="${escapeHtml(`${appUrl}/portal/deliverables/${a.id}`)}" style="color:#1e4fd8;font-weight:700">${escapeHtml(a.title)}</a> · ${escapeHtml(a.project)}`,
      (a) => `${a.title} (${a.project}): ${appUrl}/portal/deliverables/${a.id}`),
    section("Updates", c.updates, (u) => `<strong>${escapeHtml(u.project)}:</strong> ${nl2br(u.body)}`, (u) => `${u.project}: ${u.body}`),
    section("Status changes", c.statusChanges, (s) => `${escapeHtml(s.task)} → <strong>${escapeHtml(s.status)}</strong> · ${escapeHtml(s.project)}`, (s) => `${s.task} → ${s.status} (${s.project})`),
    section("Coming up", c.dueSoon, (d) => `${escapeHtml(d.task)} · due ${escapeHtml(d.due)} · ${escapeHtml(d.project)}`, (d) => `${d.task}, due ${d.due} (${d.project})`),
  ];
  return {
    subject: `Your week with Carson Poore Consulting`,
    ...renderEmail({
      preheader: c.awaiting.length ? `${c.awaiting.length} item(s) waiting on your review.` : "Here's where your projects stand.",
      heading: `This week, ${c.clientName}`,
      bodyHtml: parts.map((p) => p.html).join(""),
      bodyText: parts.map((p) => p.text).join(""),
      cta: { label: "Open your portal", url: `${appUrl}/portal` },
    }),
  };
}
