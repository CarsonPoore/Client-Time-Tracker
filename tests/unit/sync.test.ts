import { describe, expect, it } from "vitest";
import { handleEvent, reconcileAll, syncTask, type ClickUpApi, type SyncStore } from "@/lib/sync/engine";
import type { CUComment, CUList, CUTask } from "@/lib/clickup/types";
import type { ProjectInput, TaskInput } from "@/lib/clickup/mapping";

function fakeStore(spaces: { clientId: string; spaceId: string }[]) {
  const projects = new Map<string, ProjectInput & { id: string }>();
  const tasks = new Map<string, TaskInput>();
  const updates = new Map<string, string>();
  const store: SyncStore = {
    getClientSpaces: async () => spaces,
    upsertProject: async (p) => {
      const id = projects.get(p.clickup_list_id)?.id ?? `proj-${p.clickup_list_id}`;
      projects.set(p.clickup_list_id, { ...p, id });
      return id;
    },
    getProjectIdByList: async (listId) => projects.get(listId)?.id ?? null,
    upsertTasks: async (rows) => rows.forEach((r) => tasks.set(r.clickup_task_id, r)),
    markTasksDeletedExcept: async (projectId, keep) => {
      for (const t of tasks.values()) if (t.project_id === projectId && !keep.includes(t.clickup_task_id)) t.deleted = true;
    },
    markTaskDeleted: async (id) => { const t = tasks.get(id); if (t) t.deleted = true; },
    archiveProjectsExcept: async (clientId, keep) => {
      for (const p of projects.values()) if (p.client_id === clientId && !keep.includes(p.clickup_list_id)) p.archived = true;
    },
    archiveProjectByList: async (listId) => { const p = projects.get(listId); if (p) p.archived = true; },
    insertClickUpUpdates: async (rows) => {
      let n = 0;
      for (const r of rows) if (!updates.has(r.clickup_comment_id)) { updates.set(r.clickup_comment_id, r.body); n++; }
      return n;
    },
  };
  return { store, projects, tasks, updates };
}

const mkTask = (id: string, listId: string, spaceId: string, visible = true, updated = Date.now()): CUTask => ({
  id, name: `Task ${id}`, status: { status: "open" }, due_date: null, url: `u/${id}`, date_updated: String(updated),
  list: { id: listId }, space: { id: spaceId },
  custom_fields: [{ name: "Client visible", type: "checkbox", value: visible }],
});

function fakeCu(data: { lists: Record<string, CUList[]>; tasks: Record<string, CUTask[]>; comments?: Record<string, CUComment[]> }): ClickUpApi {
  const allTasks = Object.values(data.tasks).flat();
  return {
    getListsInSpace: async (spaceId) => data.lists[spaceId] ?? [],
    getList: async (listId) => {
      const found = Object.entries(data.lists).flatMap(([space, ls]) => ls.map((l) => ({ ...l, space: { id: space } }))).find((l) => l.id === listId);
      if (!found) throw Object.assign(new Error("nf"), { status: 404 });
      return found;
    },
    getTasks: async (listId) => data.tasks[listId] ?? [],
    getTask: async (id) => {
      const t = allTasks.find((x) => x.id === id);
      if (!t) throw Object.assign(new Error("nf"), { status: 404 });
      return t;
    },
    getTaskComments: async (id) => data.comments?.[id] ?? [],
  };
}

describe("reconcileAll", () => {
  it("creates projects and tasks and soft-deletes vanished ones", async () => {
    const { store, projects, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    tasks.set("gone", { project_id: "proj-L1", clickup_task_id: "gone", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false });
    const cu = fakeCu({ lists: { S1: [{ id: "L1", name: "Website" }] }, tasks: { L1: [mkTask("t1", "L1", "S1")] } });
    const counts = await reconcileAll(cu, store);
    expect(projects.get("L1")).toMatchObject({ id: "proj-L1", client_id: "C1", name: "Website" });
    expect(tasks.get("t1")).toMatchObject({ project_id: "proj-L1", client_visible: true, deleted: false });
    expect(tasks.get("gone")?.deleted).toBe(true);
    expect(counts).toMatchObject({ projects: 1, tasks: 1, errors: 0 });
  });

  it("imports #client comments for recently updated tasks only", async () => {
    const { store, updates } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    const cu = fakeCu({
      lists: { S1: [{ id: "L1", name: "Website" }] },
      tasks: { L1: [mkTask("new", "L1", "S1", true, Date.now()), mkTask("old", "L1", "S1", true, Date.parse("2020-01-01"))] },
      comments: {
        new: [{ id: "c1", comment_text: "#client Draft ready", date: String(Date.now()) }, { id: "c2", comment_text: "internal", date: String(Date.now()) }],
        old: [{ id: "c3", comment_text: "#client Old news", date: "1577836800000" }],
      },
    });
    await reconcileAll(cu, store, { commentsSince: new Date(Date.now() - 48 * 3600_000) });
    expect([...updates.entries()]).toEqual([["c1", "Draft ready"]]);
  });

  it("keeps going when one space fails and counts the error", async () => {
    const { store } = fakeStore([{ clientId: "C1", spaceId: "BAD" }, { clientId: "C2", spaceId: "S2" }]);
    const cu = fakeCu({ lists: { S2: [{ id: "L2", name: "B" }] }, tasks: { L2: [] } });
    cu.getListsInSpace = async (id) => { if (id === "BAD") throw new Error("boom"); return [{ id: "L2", name: "B" }]; };
    const counts = await reconcileAll(cu, store);
    expect(counts.errors).toBe(1);
    expect(counts.projects).toBe(1);
    expect(counts.errorMessages).toEqual(["space BAD: boom"]);
  });
});

describe("syncTask", () => {
  it("upserts a task in a known project", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertProject({ client_id: "C1", clickup_list_id: "L1", name: "W", status: null, due_date: null, archived: false });
    await syncTask(fakeCu({ lists: { S1: [{ id: "L1", name: "W" }] }, tasks: { L1: [mkTask("t1", "L1", "S1", false)] } }), store, "t1");
    expect(tasks.get("t1")?.client_visible).toBe(false);
  });

  it("creates the project when a task lands in a new list of a client space", async () => {
    const { store, projects, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await syncTask(fakeCu({ lists: { S1: [{ id: "L9", name: "New" }] }, tasks: { L9: [mkTask("t9", "L9", "S1")] } }), store, "t9");
    expect(projects.get("L9")?.client_id).toBe("C1");
    expect(tasks.get("t9")?.project_id).toBe("proj-L9");
  });

  it("hides task moved to a non-client space", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertProject({ client_id: "C1", clickup_list_id: "L1", name: "W", status: null, due_date: null, archived: false });
    await store.upsertTasks([{ project_id: "proj-L1", clickup_task_id: "t1", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false }]);
    await syncTask(fakeCu({ lists: { CPC: [{ id: "LX", name: "Admin" }] }, tasks: { LX: [mkTask("t1", "LX", "CPC")] } }), store, "t1");
    expect(tasks.get("t1")?.deleted).toBe(true);
  });

  it("marks a task deleted when ClickUp returns 404", async () => {
    const { store, tasks } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertTasks([{ project_id: "p", clickup_task_id: "t1", name: "x", status: "open", status_color: null, due_date: null, client_visible: true, clickup_url: null, clickup_updated_at: null, deleted: false }]);
    await syncTask(fakeCu({ lists: {}, tasks: {} }), store, "t1");
    expect(tasks.get("t1")?.deleted).toBe(true);
  });
});

describe("syncTaskComments", () => {
  it("imports nothing for a task whose list is not in a client space", async () => {
    const { store, updates } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    await store.upsertProject({ client_id: "C1", clickup_list_id: "LX", name: "Old", status: null, due_date: null, archived: false });
    const cu = fakeCu({
      lists: { CPC: [{ id: "LX", name: "Old" }] },
      tasks: { LX: [mkTask("t1", "LX", "CPC")] },
      comments: { t1: [{ id: "c1", comment_text: "#client Leak", date: "1" }] },
    });
    await handleEvent(cu, store, { event: "taskCommentPosted", webhook_id: "w", task_id: "t1" });
    expect(updates.size).toBe(0);
  });
});

describe("handleEvent", () => {
  it("routes taskDeleted, listDeleted and taskCommentPosted", async () => {
    const { store, tasks, projects, updates } = fakeStore([{ clientId: "C1", spaceId: "S1" }]);
    const cu = fakeCu({
      lists: { S1: [{ id: "L1", name: "W" }] },
      tasks: { L1: [mkTask("t1", "L1", "S1")] },
      comments: { t1: [{ id: "c1", comment_text: "#client Hi", date: "1" }] },
    });
    await handleEvent(cu, store, { event: "taskCreated", webhook_id: "w", task_id: "t1" });
    await handleEvent(cu, store, { event: "taskCommentPosted", webhook_id: "w", task_id: "t1" });
    expect(updates.get("c1")).toBe("Hi");
    await handleEvent(cu, store, { event: "taskDeleted", webhook_id: "w", task_id: "t1" });
    expect(tasks.get("t1")?.deleted).toBe(true);
    await handleEvent(cu, store, { event: "listDeleted", webhook_id: "w", list_id: "L1" });
    expect(projects.get("L1")?.archived).toBe(true);
  });
});
