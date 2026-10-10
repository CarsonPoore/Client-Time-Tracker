import type { CUComment, CUList, CUSpace, CUTask } from "./types";

const BASE = "https://api.clickup.com/api/v2";

export class ClickUpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ClickUpError";
  }
}

export class ClickUpClient {
  constructor(
    private token: string,
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async req<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: this.token, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 429 && attempt < 3) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const waitMs = Number.isFinite(reset) && reset > 0 ? Math.max(0, reset * 1000 - Date.now()) : 2 ** attempt * 1000;
      await this.sleep(Math.min(waitMs, 60_000));
      return this.req<T>(path, init, attempt + 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ClickUpError(res.status, `ClickUp ${init.method ?? "GET"} ${path} failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getSpaces(teamId: string): Promise<CUSpace[]> {
    return (await this.req<{ spaces: CUSpace[] }>(`/team/${teamId}/space?archived=false`)).spaces;
  }

  async getListsInSpace(spaceId: string): Promise<CUList[]> {
    const folderless = await this.req<{ lists: CUList[] }>(`/space/${spaceId}/list?archived=false`);
    const folders = await this.req<{ folders: { lists: CUList[] }[] }>(`/space/${spaceId}/folder?archived=false`);
    return [...folderless.lists, ...folders.folders.flatMap((f) => f.lists)];
  }

  getList(listId: string): Promise<CUList> {
    return this.req<CUList>(`/list/${listId}`);
  }

  async getTasks(listId: string): Promise<CUTask[]> {
    const all: CUTask[] = [];
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ page: String(page), include_closed: "true", subtasks: "true", archived: "false" });
      const res = await this.req<{ tasks: CUTask[]; last_page?: boolean }>(`/list/${listId}/task?${q}`);
      all.push(...res.tasks);
      const done = res.last_page === true || (res.last_page === undefined && res.tasks.length < 100);
      if (done || res.tasks.length === 0) break;
    }
    return all;
  }

  getTask(taskId: string): Promise<CUTask> {
    return this.req<CUTask>(`/task/${taskId}`);
  }

  async getTaskComments(taskId: string): Promise<CUComment[]> {
    return (await this.req<{ comments: CUComment[] }>(`/task/${taskId}/comment`)).comments;
  }

  async postTaskComment(taskId: string, text: string): Promise<void> {
    await this.req(`/task/${taskId}/comment`, { method: "POST", body: JSON.stringify({ comment_text: text, notify_all: false }) });
  }

  async postListComment(listId: string, text: string): Promise<void> {
    await this.req(`/list/${listId}/comment`, { method: "POST", body: JSON.stringify({ comment_text: text, notify_all: false }) });
  }

  async createWebhook(teamId: string, endpoint: string, events: readonly string[]): Promise<{ id: string; secret: string }> {
    const res = await this.req<{ id: string; webhook: { id: string; secret: string } }>(`/team/${teamId}/webhook`, {
      method: "POST",
      body: JSON.stringify({ endpoint, events }),
    });
    return { id: res.webhook?.id ?? res.id, secret: res.webhook.secret };
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.req(`/webhook/${id}`, { method: "DELETE" });
  }
}
