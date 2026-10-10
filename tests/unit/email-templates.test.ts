import { describe, expect, it } from "vitest";
import { adminDecisionEmail, adminRequestEmail, digestEmail, escapeHtml } from "@/lib/email/templates";

const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>`;

describe("email templates", () => {
  it("escapes client text", () => {
    const a = adminDecisionEmail({ clientName: evil, title: evil, decision: "changes_requested", feedback: evil, url: "https://os.x/admin" });
    const b = adminRequestEmail({ clientName: "A", kind: "request", body: evil, projectName: evil, url: "https://os.x/admin" });
    for (const html of [a.html, b.html]) {
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("escapeHtml covers quotes and ampersands", () => {
    expect(escapeHtml(`"&'<>`)).toBe("&quot;&amp;&#39;&lt;&gt;");
  });

  it("digest lists each section that has content", () => {
    const { html, text } = digestEmail({
      clientName: "Blue Duck",
      updates: [{ project: "Site", body: "Launched staging", date: "2026-10-05" }],
      awaiting: [{ id: "d1", title: "Homepage", project: "Site" }],
      statusChanges: [],
      dueSoon: [{ project: "Site", task: "Copy", due: "2026-10-14" }],
    }, "https://os.x");
    expect(html).toContain("Launched staging");
    expect(html).toContain("https://os.x/portal/deliverables/d1");
    expect(html).not.toContain("Status changes");
    expect(text).toContain("Homepage");
  });
});

describe("clientPublishedEmail version subject", () => {
  it("adds v{n} only when n > 1", async () => {
    const { clientPublishedEmail } = await import("@/lib/email/templates");
    expect(clientPublishedEmail({ title: "Logo", projectName: "P", url: "https://x", versionNumber: 1 }).subject).toBe("Ready for your review: Logo");
    expect(clientPublishedEmail({ title: "Logo", projectName: "P", url: "https://x", versionNumber: 3 }).subject).toBe("Ready for your review: Logo (v3)");
  });
});
