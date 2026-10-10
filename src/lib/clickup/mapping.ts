import type { CUList, CUTask, CUWebhookPayload } from "./types";

export const CLIENT_VISIBLE_FIELD = "Client visible";
export const NON_CLIENT_SPACES = ["carson poore consulting"];
export const WEBHOOK_EVENTS = [
  "taskCreated", "taskUpdated", "taskDeleted", "taskMoved", "taskCommentPosted",
  "listCreated", "listUpdated", "listDeleted",
] as const;

export interface TaskInput {
  project_id: string; clickup_task_id: string; name: string; status: string; status_color: string | null;
  due_date: string | null; client_visible: boolean; clickup_url: string | null;
  clickup_updated_at: string | null; deleted: boolean;
}
export interface ProjectInput {
  client_id: string; clickup_list_id: string; name: string; status: string | null; due_date: string | null; archived: boolean;
}

export function isClientVisible(task: CUTask): boolean {
  const field = task.custom_fields?.find(
    (f) => f.type === "checkbox" && f.name.trim().toLowerCase() === CLIENT_VISIBLE_FIELD.toLowerCase(),
  );
  return field?.value === true || field?.value === "true";
}

export function msToDate(ms: string | null | undefined): string | null {
  if (!ms) return null;
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(n));
}

function msToIso(ms: string | null | undefined): string | null {
  const n = Number(ms);
  return ms && Number.isFinite(n) ? new Date(n).toISOString() : null;
}

export function mapTask(task: CUTask, projectId: string): TaskInput {
  return {
    project_id: projectId,
    clickup_task_id: task.id,
    name: task.name.trim(),
    status: task.status.status,
    status_color: task.status.color ?? null,
    due_date: msToDate(task.due_date),
    client_visible: isClientVisible(task),
    clickup_url: task.url ?? null,
    clickup_updated_at: msToIso(task.date_updated),
    deleted: false,
  };
}

export function mapList(list: CUList, clientId: string): ProjectInput {
  return {
    client_id: clientId,
    clickup_list_id: list.id,
    name: list.name.trim(),
    status: list.status?.status ?? null,
    due_date: msToDate(list.due_date),
    archived: false,
  };
}

export function parseClientComment(text: string): string | null {
  const match = /^\s*#client(?![a-z0-9_])[\s:\-–—]*/i.exec(text);
  if (!match) return null;
  const rest = text.slice(match[0].length).trim();
  return rest || null;
}

export function isDefaultClientSpace(name: string): boolean {
  return !NON_CLIENT_SPACES.includes(name.trim().toLowerCase());
}

export function webhookEventId(p: CUWebhookPayload): string {
  const h = p.history_items?.[0];
  return [p.webhook_id, p.event, p.task_id ?? p.list_id ?? "", h?.id ?? h?.date ?? ""].join(":");
}
