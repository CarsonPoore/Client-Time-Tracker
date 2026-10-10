import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ALICE = "00000000-0000-0000-0000-0000000000a1";
const BOB = "00000000-0000-0000-0000-0000000000b1";
const STRANGER = "00000000-0000-0000-0000-0000000000c1";
const CLIENT_A = "10000000-0000-0000-0000-00000000000a";
const CLIENT_B = "10000000-0000-0000-0000-00000000000b";
const PROJ_A = "20000000-0000-0000-0000-00000000000a";
const PROJ_B = "20000000-0000-0000-0000-00000000000b";
const DEL_AWAIT = "30000000-0000-0000-0000-000000000001";
const DEL_DRAFT = "30000000-0000-0000-0000-000000000002";
const DEL_B = "30000000-0000-0000-0000-000000000003";

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN}', 'admin@x.com'), ('${ALICE}', 'alice@a.com'), ('${BOB}', 'bob@b.com'), ('${STRANGER}', 's@x.com');
    insert into clients (id, name) values ('${CLIENT_A}', 'A Co'), ('${CLIENT_B}', 'B Co');
    insert into profiles (user_id, role, client_id, email) values
      ('${ADMIN}', 'admin', null, 'admin@x.com'),
      ('${ALICE}', 'client', '${CLIENT_A}', 'alice@a.com'),
      ('${BOB}', 'client', '${CLIENT_B}', 'bob@b.com');
    insert into projects (id, client_id, name) values ('${PROJ_A}', '${CLIENT_A}', 'Site'), ('${PROJ_B}', '${CLIENT_B}', 'Brand');
    insert into projects (client_id, name, archived) values ('${CLIENT_A}', 'Old', true);
    insert into tasks (project_id, clickup_task_id, name, status, client_visible) values
      ('${PROJ_A}', 't1', 'Visible', 'open', true),
      ('${PROJ_A}', 't2', 'Hidden', 'open', false),
      ('${PROJ_B}', 't3', 'B task', 'open', true);
    insert into tasks (project_id, clickup_task_id, name, status, client_visible, deleted) values
      ('${PROJ_A}', 't4', 'Deleted', 'open', true, true);
    insert into deliverables (id, project_id, title, status) values
      ('${DEL_AWAIT}', '${PROJ_A}', 'Homepage', 'awaiting_approval'),
      ('${DEL_DRAFT}', '${PROJ_A}', 'Draft', 'draft'),
      ('${DEL_B}', '${PROJ_B}', 'B logo', 'awaiting_approval');
    insert into updates (project_id, body) values ('${PROJ_A}', 'A update'), ('${PROJ_B}', 'B update');
    insert into updates (project_id, body, published_at) values ('${PROJ_A}', 'Unpublished', null);
    insert into sync_runs (kind, ok) values ('manual', true);
  `);
});

const names = (rows: { name?: string; title?: string; body?: string }[]) =>
  rows.map((r) => r.name ?? r.title ?? r.body).sort();

describe("client isolation", () => {
  it("client sees only their own client row", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from clients"));
    expect(names(rows.rows)).toEqual(["A Co"]);
  });

  it("client sees only own non-archived projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from projects"));
    expect(names(rows.rows)).toEqual(["Site"]);
  });

  it("client sees only visible, non-deleted tasks of own projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ name: string }>("select name from tasks"));
    expect(names(rows.rows)).toEqual(["Visible"]);
  });

  it("client never sees drafts or other clients' deliverables", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ title: string }>("select title from deliverables"));
    expect(names(rows.rows)).toEqual(["Homepage"]);
  });

  it("client sees only published updates of own projects", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ body: string }>("select body from updates"));
    expect(names(rows.rows)).toEqual(["A update"]);
  });

  it("client cannot read internal tables", async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query("select * from sync_runs"));
    expect(rows.rows).toHaveLength(0);
  });

  it("user without a profile sees nothing", async () => {
    const rows = await asUser(db, STRANGER, (tx) => tx.query("select * from projects"));
    expect(rows.rows).toHaveLength(0);
  });

  it("anonymous cannot read tables", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from clients"))).rejects.toThrow(/permission denied/);
  });

  it("admin sees everything", async () => {
    const rows = await asUser(db, ADMIN, (tx) => tx.query("select * from tasks"));
    expect(rows.rows).toHaveLength(4);
  });
});

describe("privilege escalation", () => {
  it("client cannot promote themselves", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("update profiles set role = 'admin', client_id = null where user_id = $1 returning *", [ALICE]));
    expect(res.rows).toHaveLength(0);
  });

  it("client cannot update a deliverable directly", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("update deliverables set status = 'approved' where id = $1 returning *", [DEL_AWAIT]));
    expect(res.rows).toHaveLength(0);
  });
});

describe("profile privilege trigger", () => {
  it("trigger blocks role/client_id change even if RLS would allow the update", async () => {
    await expect(asUser(db, ALICE, async (tx) => {
      await tx.exec("reset role");
      await tx.exec("create policy tmp_open on public.profiles for update to authenticated using (true) with check (true)");
      await tx.exec("set local role authenticated");
      return tx.query("update profiles set role = 'admin', client_id = null where user_id = $1", [ALICE]);
    })).rejects.toThrow(/profile_privileges_locked/);
  });

  it("admin can still change a client's client_id", async () => {
    const res = await asUser(db, ADMIN, (tx) =>
      tx.query<{ client_id: string }>("update profiles set client_id = $1 where user_id = $2 returning client_id", [CLIENT_A, BOB]));
    expect(res.rows[0].client_id).toBe(CLIENT_A);
  });
});

describe("requests", () => {
  it("client can file a request for own project", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, project_id, kind, body, created_by) values ($1, $2, 'request', 'New page', $3) returning id",
        [CLIENT_A, PROJ_A, ALICE]));
    expect(res.rows).toHaveLength(1);
  });

  it("client cannot file a request against another client's project", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, project_id, kind, body, created_by) values ($1, $2, 'request', 'x', $3)",
        [CLIENT_A, PROJ_B, ALICE]))).rejects.toThrow(/row-level security/);
  });

  it("client cannot file a request as another client", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("insert into requests (client_id, kind, body, created_by) values ($1, 'comment', 'x', $2)",
        [CLIENT_B, ALICE]))).rejects.toThrow(/row-level security/);
  });
});

describe("decide_deliverable", () => {
  it("anonymous cannot call decide_deliverable", async () => {
    await expect(asUser(db, null, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_AWAIT]))).rejects.toThrow(/permission denied/);
  });

  it("decide_deliverable requires feedback for changes", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'changes_requested', '   ')", [DEL_AWAIT])))
      .rejects.toThrow(/feedback_required/);
  });

  it("client cannot decide another client's deliverable", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_B]))).rejects.toThrow(/not_found/);
  });

  it("client cannot decide a draft", async () => {
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_DRAFT]))).rejects.toThrow(/not_found/);
  });

  it("client approves own awaiting deliverable once", async () => {
    const res = await asUser(db, ALICE, (tx) =>
      tx.query<{ status: string; decided_by: string }>("select * from decide_deliverable($1, 'approved', null)", [DEL_AWAIT]));
    expect(res.rows[0]).toMatchObject({ status: "approved", decided_by: ALICE });
    await expect(asUser(db, ALICE, (tx) =>
      tx.query("select * from decide_deliverable($1, 'approved', null)", [DEL_AWAIT]))).rejects.toThrow(/not_awaiting_approval/);
  });
});

describe("task status tracking", () => {
  it("leaves status_changed_at null on insert and sets it on a real status change", async () => {
    await db.exec(`insert into tasks (project_id, clickup_task_id, name, status, client_visible) values ('${PROJ_A}', 'fresh', 'Fresh', 'open', true)`);
    let r = await db.query<{ status_changed_at: Date | null }>("select status_changed_at from tasks where clickup_task_id = 'fresh'");
    expect(r.rows[0].status_changed_at).toBeNull();
    await db.exec("update tasks set status = 'done' where clickup_task_id = 'fresh'");
    r = await db.query<{ status_changed_at: Date | null }>("select status_changed_at from tasks where clickup_task_id = 'fresh'");
    expect(r.rows[0].status_changed_at).not.toBeNull();
  });
  it("bumps status_changed_at only when status changes", async () => {
    await db.exec("update tasks set status_changed_at = '2020-01-01' where clickup_task_id = 't1'");
    await db.exec("update tasks set name = 'Visible!' where clickup_task_id = 't1'");
    let r = await db.query<{ status_changed_at: Date }>("select status_changed_at from tasks where clickup_task_id = 't1'");
    expect(r.rows[0].status_changed_at.getUTCFullYear()).toBe(2020);
    await db.exec("update tasks set status = 'done' where clickup_task_id = 't1'");
    r = await db.query<{ status_changed_at: Date }>("select status_changed_at from tasks where clickup_task_id = 't1'");
    expect(r.rows[0].status_changed_at.getUTCFullYear()).toBeGreaterThan(2020);
  });
});
