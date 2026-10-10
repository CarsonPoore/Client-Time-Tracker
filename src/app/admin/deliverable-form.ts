import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : null);

const schema = z.object({
  title: z.string().trim().min(1, "Give the deliverable a title."),
  description: z.preprocess(blank, z.string().nullable()),
  link_url: z.preprocess(blank, z.url({ protocol: /^https?$/, error: "Links must start with http:// or https://." }).nullable()),
  clickup_task_id: z.preprocess(blank, z.string().nullable()),
});

export type DeliverableFormData = z.infer<typeof schema>;

export function parseDeliverableForm(form: FormData): { ok: true; data: DeliverableFormData } | { ok: false; error: string } {
  const res = schema.safeParse({
    title: form.get("title") ?? "",
    description: form.get("description"),
    link_url: form.get("link_url"),
    clickup_task_id: form.get("clickup_task_id"),
  });
  return res.success ? { ok: true, data: res.data } : { ok: false, error: res.error.issues[0].message };
}
