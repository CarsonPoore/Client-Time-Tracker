// tests/db/revisions.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrationsFrom, asUser, createDb } from "./harness";

export const ADMIN = "00000000-0000-0000-0000-00000000000a";
export const ALICE = "00000000-0000-0000-0000-0000000000a1";
export const BOB = "00000000-0000-0000-0000-0000000000b1";
const A = "10000000-0000-0000-0000-00000000000a";
const B = "10000000-0000-0000-0000-00000000000b";
const SITE = "20000000-0000-0000-0000-00000000000a";
const BRAND = "20000000-0000-0000-0000-00000000000b";
const D_FEEDBACK = "30000000-0000-0000-0000-000000000001";
const D_APPROVED = "30000000-0000-0000-0000-000000000002";
const D_DRAFT = "30000000-0000-0000-0000-000000000003";
const D_LINK = "30000000-0000-0000-0000-000000000004";
const D_BOB = "30000000-0000-0000-0000-000000000005";

let db: PGlite;

beforeAll(async () => {
  db = await createDb({ before: "0008" });
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}','a@x.com'),('${ALICE}','al@a.com'),('${BOB}','b@b.com');
    insert into clients (id, name) values ('${A}','A Co'),('${B}','B Co');
    insert into profiles (user_id, role, client_id, email) values
      ('${ADMIN}','admin',null,'a@x.com'),('${ALICE}','client','${A}','al@a.com'),('${BOB}','client','${B}','b@b.com');
    insert into projects (id, client_id, name) values ('${SITE}','${A}','Site'),('${BRAND}','${B}','Brand');
    insert into deliverables (id, project_id, title, file_path, status, client_feedback, published_at, decided_at, decided_by) values
      ('${D_FEEDBACK}','${SITE}','Logo','${SITE}/deliverables/x-logo.png','changes_requested','Make it bluer','2026-10-01','2026-10-02T00:00:00Z','${ALICE}'),
      ('${D_APPROVED}','${SITE}','Header','${SITE}/deliverables/y-h.png','approved',null,'2026-10-01','2026-10-03','${ALICE}'),
      ('${D_BOB}','${BRAND}','Bob thing','${BRAND}/deliverables/z.pdf','awaiting_approval',null,'2026-10-01',null,null);
    insert into deliverables (id, project_id, title) values ('${D_DRAFT}','${SITE}','Draft');
    insert into deliverables (id, project_id, title, link_url, status, published_at) values
      ('${D_LINK}','${SITE}','Figma','https://figma.com/x','awaiting_approval','2026-10-04');
  `);
  await applyMigrationsFrom(db, "0008");
});

describe("backfill", () => {
  it("creates v1 for every deliverable and points current_version_id at it", async () => {
    const r = await db.query<{ id: string; number: number; status: string; file_path: string | null; link_url: string | null }>(
      `select d.id, v.number, v.status, v.file_path, v.link_url from deliverables d join deliverable_versions v on v.id = d.current_version_id order by d.id`);
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every((x) => x.number === 1)).toBe(true);
    expect(r.rows.find((x) => x.id === D_DRAFT)!.status).toBe("draft");
    expect(r.rows.find((x) => x.id === D_LINK)!.link_url).toBe("https://figma.com/x");
  });

  it("turns client_feedback into a decision comment on v1", async () => {
    const r = await db.query<{ body: string; kind: string; author_id: string; author_role: string; created_at: string }>(
      `select c.body, c.kind, c.author_id, c.author_role, c.created_at from deliverable_comments c
       join deliverable_versions v on v.id = c.version_id where v.deliverable_id = $1`, [D_FEEDBACK]);
    expect(r.rows).toEqual([expect.objectContaining({ body: "Make it bluer", kind: "decision", author_id: ALICE, author_role: "client" })]);
    expect(new Date(r.rows[0].created_at).toISOString()).toBe(new Date("2026-10-02").toISOString());
  });

  it("copies decision fields onto v1", async () => {
    const r = await db.query<{ decided_by: string }>(`select v.decided_by from deliverable_versions v where v.deliverable_id = $1`, [D_APPROVED]);
    expect(r.rows[0].decided_by).toBe(ALICE);
  });

  it("mirrors version status onto deliverables", async () => {
    const v = await db.query<{ current_version_id: string }>(`select current_version_id from deliverables where id = $1`, [D_LINK]);
    await db.query(`update deliverable_versions set status = 'approved' where id = $1`, [v.rows[0].current_version_id]);
    const d = await db.query<{ status: string }>(`select status from deliverables where id = $1`, [D_LINK]);
    expect(d.rows[0].status).toBe("approved");
    await db.query(`update deliverable_versions set status = 'awaiting_approval' where id = $1`, [v.rows[0].current_version_id]);
  });
});

const versionsOf = (user: string | null, deliverable: string) =>
  asUser(db, user, (tx) => tx.query<{ number: number }>(
    "select number from deliverable_versions where deliverable_id = $1 order by number", [deliverable])).then((r) => r.rows.map((x) => x.number));

const currentVersion = async (deliverable: string) =>
  (await db.query<{ current_version_id: string }>("select current_version_id from deliverables where id = $1", [deliverable])).rows[0].current_version_id;

describe("rls", () => {
  it("client sees own non-draft versions only", async () => {
    expect(await versionsOf(ALICE, D_FEEDBACK)).toEqual([1]);
    expect(await versionsOf(ALICE, D_DRAFT)).toEqual([]);
    expect(await versionsOf(ALICE, D_BOB)).toEqual([]);
    await expect(versionsOf(null, D_FEEDBACK)).rejects.toThrow(/permission denied/);
    expect(await versionsOf(ADMIN, D_DRAFT)).toEqual([1]);
  });

  it("a new draft version is hidden while earlier versions stay visible", async () => {
    await db.query(`insert into deliverable_versions (deliverable_id, number, status) values ($1, 2, 'draft')`, [D_APPROVED]);
    expect(await versionsOf(ALICE, D_APPROVED)).toEqual([1]);
  });

  it("client reads comments only on visible versions", async () => {
    const r = await asUser(db, ALICE, (tx) => tx.query("select body from deliverable_comments"));
    expect(r.rows).toEqual([{ body: "Make it bluer" }]);
    const bob = await asUser(db, BOB, (tx) => tx.query("select body from deliverable_comments"));
    expect(bob.rows).toEqual([]);
    await expect(asUser(db, null, (tx) => tx.query("select body from deliverable_comments"))).rejects.toThrow(/permission denied/);
  });

  it("client can comment on own visible version", async () => {
    const v = await currentVersion(D_FEEDBACK);
    await asUser(db, ALICE, (tx) => tx.query(
      `insert into deliverable_comments (version_id, author_id, author_role, body, pin_x, pin_y) values ($1, $2, 'client', 'Love the font', 10.5, 90)`, [v, ALICE]));
  });

  it.each([
    ["forged decision kind", `'client', 'x', 'decision'`, "ALICE"],
    ["forged admin role", `'admin', 'x', 'comment'`, "ALICE"],
    ["forged author", `'client', 'x', 'comment'`, "BOB_ID"],
  ])("rejects %s", async (_n, values, author) => {
    const v = await currentVersion(D_FEEDBACK);
    const authorId = author === "ALICE" ? ALICE : BOB;
    await expect(asUser(db, ALICE, (tx) => tx.query(
      `insert into deliverable_comments (version_id, author_id, author_role, body, kind) values ($1, $2, ${values})`, [v, authorId]))).rejects.toThrow();
  });

  it("rejects comments on another client's version and on drafts", async () => {
    const bobV = await currentVersion(D_BOB);
    await expect(asUser(db, ALICE, (tx) => tx.query(
      `insert into deliverable_comments (version_id, author_id, author_role, body) values ($1, $2, 'client', 'hi')`, [bobV, ALICE]))).rejects.toThrow();
    const draftV = await currentVersion(D_DRAFT);
    await expect(asUser(db, ALICE, (tx) => tx.query(
      `insert into deliverable_comments (version_id, author_id, author_role, body) values ($1, $2, 'client', 'hi')`, [draftV, ALICE]))).rejects.toThrow();
  });

  it("rejects pins outside 0-100 and half pins", async () => {
    const v = await currentVersion(D_FEEDBACK);
    for (const pins of ["101, 5", "-1, 5", "5, null"]) {
      await expect(asUser(db, ALICE, (tx) => tx.query(
        `insert into deliverable_comments (version_id, author_id, author_role, body, pin_x, pin_y) values ($1, $2, 'client', 'x', ${pins})`, [v, ALICE]))).rejects.toThrow();
    }
  });

  it("attachments: own comment only, path must match", async () => {
    const v = await currentVersion(D_FEEDBACK);
    const mine = (await asUser(db, ALICE, (tx) => tx.query<{ id: string }>(
      `insert into deliverable_comments (version_id, author_id, author_role, body) values ($1, $2, 'client', 'see file') returning id`, [v, ALICE]))).rows[0].id;
    await asUser(db, ALICE, (tx) => tx.query(
      `insert into comment_attachments (comment_id, storage_path, name, size_bytes, mime_type) values ($1, $2, 'a.png', 10, 'image/png')`,
      [mine, `${SITE}/comments/${mine}/1-a.png`]));
    await expect(asUser(db, ALICE, (tx) => tx.query(
      `insert into comment_attachments (comment_id, storage_path, name) values ($1, $2, 'b.png')`,
      [mine, `${BRAND}/comments/${mine}/1-b.png`]))).rejects.toThrow();
    const adminComment = (await asUser(db, ADMIN, (tx) => tx.query<{ id: string }>(
      `insert into deliverable_comments (version_id, author_id, author_role, body) values ($1, $2, 'admin', 'ok') returning id`, [v, ADMIN]))).rows[0].id;
    await expect(asUser(db, ALICE, (tx) => tx.query(
      `insert into comment_attachments (comment_id, storage_path, name) values ($1, $2, 'c.png')`,
      [adminComment, `${SITE}/comments/${adminComment}/1-c.png`]))).rejects.toThrow();
    const bob = await asUser(db, BOB, (tx) => tx.query("select * from comment_attachments"));
    expect(bob.rows).toEqual([]);
  });

  it("clients cannot update or delete comments", async () => {
    const r = await asUser(db, ALICE, (tx) => tx.query("update deliverable_comments set body = 'edited' returning id"));
    expect(r.rows).toEqual([]);
    const d = await asUser(db, ALICE, (tx) => tx.query("delete from deliverable_comments returning id"));
    expect(d.rows).toEqual([]);
  });

  it("client_activity is admin only", async () => {
    expect((await asUser(db, ALICE, (tx) => tx.query("select * from client_activity"))).rows).toEqual([]);
    expect((await asUser(db, ADMIN, (tx) => tx.query("select * from client_activity"))).rows.length).toBeGreaterThan(0);
  });

  it("clients cannot write versions directly", async () => {
    const r = await asUser(db, ALICE, (tx) => tx.query("update deliverable_versions set status = 'approved' returning id"));
    expect(r.rows).toEqual([]);
  });
});

const rpc = <T>(user: string | null, sql: string, args: unknown[]) =>
  asUser(db, user, (tx) => tx.query<T>(sql, args)).then((r) => r.rows[0]);

describe("publish_version / decide_version", () => {
  it("non-admin cannot publish", async () => {
    await expect(rpc(ALICE, "select * from publish_version($1, null, 'https://x', null)", [D_FEEDBACK])).rejects.toThrow(/forbidden/);
  });

  it("publishing after changes requested creates v2 awaiting and moves the pointer", async () => {
    const v2 = await rpc<{ number: number; status: string; id: string }>(ADMIN,
      "select * from publish_version($1, $2, null, 'Bluer now')", [D_FEEDBACK, `${SITE}/deliverables/v2.png`]);
    expect(v2).toMatchObject({ number: 2, status: "awaiting_approval" });
    const d = await db.query<{ status: string; current_version_id: string }>("select status, current_version_id from deliverables where id = $1", [D_FEEDBACK]);
    expect(d.rows[0]).toEqual({ status: "awaiting_approval", current_version_id: v2.id });
    expect(await versionsOf(ALICE, D_FEEDBACK)).toEqual([1, 2]);
  });

  it("publishing a draft deliverable promotes v1 in place", async () => {
    await db.query("update deliverable_versions set file_path = $2 where deliverable_id = $1", [D_DRAFT, `${SITE}/deliverables/d.png`]);
    const v = await rpc<{ number: number; status: string; file_path: string }>(ADMIN, "select * from publish_version($1, null, null, null)", [D_DRAFT]);
    expect(v).toMatchObject({ number: 1, status: "awaiting_approval", file_path: `${SITE}/deliverables/d.png` });
  });

  it("publishing without file or link on a non-draft fails", async () => {
    await expect(rpc(ADMIN, "select * from publish_version($1, null, null, null)", [D_APPROVED])).rejects.toThrow(/file_required/);
  });

  it("client cannot decide an old version", async () => {
    const v1 = (await db.query<{ id: string }>("select id from deliverable_versions where deliverable_id = $1 and number = 1", [D_FEEDBACK])).rows[0].id;
    await expect(rpc(ALICE, "select * from decide_version($1, 'approved', null)", [v1])).rejects.toThrow(/not_current_version/);
  });

  it("other client gets not_found", async () => {
    await expect(rpc(BOB, "select * from decide_version($1, 'approved', null)", [await currentVersion(D_FEEDBACK)])).rejects.toThrow(/not_found/);
  });

  it("changes_requested needs a note and writes a decision comment", async () => {
    const v = await currentVersion(D_FEEDBACK);
    await expect(rpc(ALICE, "select * from decide_version($1, 'changes_requested', '  ')", [v])).rejects.toThrow(/feedback_required/);
    await expect(rpc(ALICE, "select * from decide_version($1, 'draft', null)", [v])).rejects.toThrow(/invalid_decision/);
    const r = await rpc<{ status: string; decided_by: string }>(ALICE, "select * from decide_version($1, 'changes_requested', 'Still too dark')", [v]);
    expect(r).toMatchObject({ status: "changes_requested", decided_by: ALICE });
    const c = await db.query("select body, kind, author_role from deliverable_comments where version_id = $1 and kind = 'decision'", [v]);
    expect(c.rows).toEqual([{ body: "Still too dark", kind: "decision", author_role: "client" }]);
    await expect(rpc(ALICE, "select * from decide_version($1, 'approved', null)", [v])).rejects.toThrow(/not_awaiting_approval/);
  });

  it("approve with optional note; mirror updates deliverable", async () => {
    const v3 = await rpc<{ id: string; number: number }>(ADMIN, "select * from publish_version($1, null, 'https://x/v3', null)", [D_FEEDBACK]);
    expect(v3.number).toBe(3);
    await rpc(ALICE, "select * from decide_version($1, 'approved', null)", [v3.id]);
    const d = await db.query<{ status: string }>("select status from deliverables where id = $1", [D_FEEDBACK]);
    expect(d.rows[0].status).toBe("approved");
  });

  it("admin cannot decide a version", async () => {
    await expect(rpc(ADMIN, "select * from decide_version($1, 'approved', null)", [await currentVersion(D_LINK)])).rejects.toThrow(/not_found/);
  });

  it("rejects an over-long note", async () => {
    const v = (await db.query<{ id: string }>("select id from deliverable_versions where deliverable_id = $1 and status = 'awaiting_approval' limit 1", [D_LINK])).rows[0]?.id ?? await currentVersion(D_LINK);
    await db.query("update deliverable_versions set status = 'awaiting_approval' where id = $1", [v]);
    await expect(rpc(ALICE, "select * from decide_version($1, 'changes_requested', $2)", [v, "x".repeat(5001)])).rejects.toThrow(/feedback_too_long/);
  });

  it("legacy decide_deliverable delegates to the current version", async () => {
    await rpc(ALICE, "select * from decide_deliverable($1, 'approved', null)", [D_LINK]);
    const v = await db.query<{ status: string }>("select status from deliverable_versions where id = $1", [await currentVersion(D_LINK)]);
    expect(v.rows[0].status).toBe("approved");
  });
});

describe("activity", () => {
  const activity = async (types: string[]) =>
    (await db.query<{ type: string; summary: string }>(
      "select type, summary from client_activity where client_id = $1 and type = any($2) order by created_at, summary", [A, types])).rows;

  it("logs publish, decision and comment once each", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int n from client_activity")).rows[0].n;
    const v = await rpc<{ id: string; number: number }>(ADMIN, "select * from publish_version($1, null, 'https://x/v4', null)", [D_LINK]);
    await rpc(ALICE, "select * from decide_version($1, 'changes_requested', 'More contrast')", [v.id]);
    await asUser(db, ALICE, (tx) => tx.query(
      "insert into deliverable_comments (version_id, author_id, author_role, body) values ($1, $2, 'client', 'Also the margin')", [v.id, ALICE]));
    const after = (await db.query<{ n: number }>("select count(*)::int n from client_activity")).rows[0].n;
    expect(after - before).toBe(3); // the decision comment does not add a separate comment_added row
    const rows = await activity(["version_published", "changes_requested", "comment_added"]);
    expect(rows.map((r) => r.summary)).toEqual(expect.arrayContaining([
      `Figma v${v.number} sent for approval`, `Figma v${v.number}: changes requested`, `Client commented on Figma v${v.number}`]));
  });

  it("backfill rows are not duplicated by triggers", async () => {
    const r = await db.query<{ n: number }>(
      "select count(*)::int n from client_activity where type = 'version_approved' and summary = 'Header v1 approved'");
    expect(r.rows[0].n).toBe(1);
  });
});
