import type { ClickUpClient } from "@/lib/clickup/client";
import { mapList, mapTask, parseClientComment, type ProjectInput, type TaskInput } from "@/lib/clickup/mapping";
import type { CUWebhookPayload } from "@/lib/clickup/types";

export type ClickUpApi = Pick<ClickUpClient, "getListsInSpace" | "getList" | "getTasks" | "getTask" | "getTaskComments">;

export interface SyncStore {
  getClientSpaces(): Promise<{ clientId: string; spaceId: string }[]>;
  upsertProject(p: ProjectInput): Promise<string>;
  getProjectIdByList(listId: string): Promise<string | null>;
  upsertTasks(rows: TaskInput[]): Promise<void>;
  markTasksDeletedExcept(projectId: string, keepClickupIds: string[]): Promise<void>;
  markTaskDeleted(clickupTaskId: string): Promise<void>;
  archiveProjectsExcept(clientId: string, keepListIds: string[]): Promise<void>;
  archiveProjectByList(listId: string): Promise<void>;
  insertClickUpUpdates(rows: { project_id: string; clickup_comment_id: string; body: string; author_name: string | null; published_at: string }[]): Promise<number>;
}

export interface SyncCounts { projects: number; tasks: number; updates: number; errors: number; errorMessages: string[] }

const isNotFound = (e: unknown) => typeof e === "object" && e !== null && (e as { status?: number }).status === 404;

function msToIso(ms: string): string {
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n).toISOString() : new Date().toISOString();
}

export async function syncTaskComments(cu: ClickUpApi, store: SyncStore, taskId: string, projectId?: string): Promise<number> {
  let pid = projectId;
  if (!pid) {
    const task = await cu.getTask(taskId);
    pid = (await projectForList(cu, store, task.list.id, task.space?.id)) ?? undefined;
  }
  if (!pid) return 0;
  const comments = await cu.getTaskComments(taskId);
  const rows = comments.flatMap((c) => {
    const body = parseClientComment(c.comment_text ?? "");
    return body
      ? [{ project_id: pid, clickup_comment_id: c.id, body, author_name: c.user?.username ?? null, published_at: msToIso(c.date) }]
      : [];
  });
  return rows.length ? store.insertClickUpUpdates(rows) : 0;
}

export async function reconcileAll(cu: ClickUpApi, store: SyncStore, opts: { commentsSince?: Date } = {}): Promise<SyncCounts> {
  const counts: SyncCounts = { projects: 0, tasks: 0, updates: 0, errors: 0, errorMessages: [] };
  for (const { clientId, spaceId } of await store.getClientSpaces()) {
    try {
      const lists = await cu.getListsInSpace(spaceId);
      for (const list of lists) {
        const projectId = await store.upsertProject(mapList(list, clientId));
        counts.projects++;
        const tasks = await cu.getTasks(list.id);
        await store.upsertTasks(tasks.map((t) => mapTask(t, projectId)));
        await store.markTasksDeletedExcept(projectId, tasks.map((t) => t.id));
        counts.tasks += tasks.length;
        if (opts.commentsSince) {
          const since = opts.commentsSince.getTime();
          for (const t of tasks.filter((t) => Number(t.date_updated) >= since)) {
            counts.updates += await syncTaskComments(cu, store, t.id, projectId);
          }
        }
      }
      await store.archiveProjectsExcept(clientId, lists.map((l) => l.id));
    } catch (err) {
      counts.errors++;
      counts.errorMessages.push(`space ${spaceId}: ${err instanceof Error ? err.message : String(err)}`);
      console.error(`Reconcile failed for space ${spaceId}`, err);
    }
  }
  return counts;
}

async function projectForList(cu: ClickUpApi, store: SyncStore, listId: string, spaceId?: string): Promise<string | null> {
  const existing = await store.getProjectIdByList(listId);
  const spaces = await store.getClientSpaces();
  const list = await cu.getList(listId);
  const space = spaceId ?? list.space?.id;
  const client = spaces.find((s) => s.spaceId === space);
  if (!client) {
    if (existing) await store.archiveProjectByList(listId);
    return null;
  }
  return store.upsertProject(mapList(list, client.clientId));
}

export async function syncTask(cu: ClickUpApi, store: SyncStore, taskId: string): Promise<void> {
  let task;
  try {
    task = await cu.getTask(taskId);
  } catch (e) {
    if (isNotFound(e)) return store.markTaskDeleted(taskId);
    throw e;
  }
  const projectId = await projectForList(cu, store, task.list.id, task.space?.id);
  if (!projectId) return store.markTaskDeleted(taskId);
  await store.upsertTasks([mapTask(task, projectId)]);
}

export async function syncList(cu: ClickUpApi, store: SyncStore, listId: string): Promise<void> {
  try {
    await projectForList(cu, store, listId);
  } catch (e) {
    if (isNotFound(e)) return store.archiveProjectByList(listId);
    throw e;
  }
}

export async function handleEvent(cu: ClickUpApi, store: SyncStore, p: CUWebhookPayload): Promise<void> {
  switch (p.event) {
    case "taskCreated":
    case "taskUpdated":
    case "taskMoved":
      if (p.task_id) await syncTask(cu, store, p.task_id);
      return;
    case "taskDeleted":
      if (p.task_id) await store.markTaskDeleted(p.task_id);
      return;
    case "taskCommentPosted":
      if (p.task_id) await syncTaskComments(cu, store, p.task_id);
      return;
    case "listCreated":
    case "listUpdated":
      if (p.list_id) await syncList(cu, store, p.list_id);
      return;
    case "listDeleted":
      if (p.list_id) await store.archiveProjectByList(p.list_id);
      return;
    default:
      return;
  }
}
