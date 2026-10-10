// tests/db/drop-legacy.test.ts — 0009 re-backfills before dropping the legacy deliverable columns.
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrationsFrom, createDb } from "./harness";

const ALICE = "00000000-0000-0000-0000-0000000000a1";
const A = "10000000-0000-0000-0000-00000000000a";
const SITE = "20000000-0000-0000-0000-00000000000a";
const D_LATE = "30000000-0000-0000-0000-000000000010";
const D_DRAFT = "30000000-0000-0000-0000-000000000011";
const D_STALE = "30000000-0000-0000-0000-000000000012";

let db: PGlite;

beforeAll(async () => {
  db = await createDb({ before: "0009" });
  await db.exec(`
    insert into auth.users (id, email) values ('${ALICE}','al@a.com');
    insert into clients (id, name) values ('${A}','A Co');
    insert into profiles (user_id, role, client_id, email) values ('${ALICE}','client','${A}','al@a.com');
    insert into projects (id, client_id, name) values ('${SITE}','${A}','Site');
    -- Created by old app code after 0008 ran: legacy columns only, no version.
    insert into deliverables (id, project_id, title, file_path, status, client_feedback, published_at, decided_at, decided_by) values
      ('${D_LATE}','${SITE}','Late','${SITE}/deliverables/late.png','changes_requested','Bigger please','2026-10-05','2026-10-06T00:00:00Z','${ALICE}');
    -- Has a draft v1 (backfilled while draft), then old code set a link on the legacy column.
    insert into deliverables (id, project_id, title) values ('${D_DRAFT}','${SITE}','Draft');
    insert into deliverables (id, project_id, title, status, published_at) values ('${D_STALE}','${SITE}','Stale','awaiting_approval','2026-10-05');
  `);
  for (const id of [D_DRAFT, D_STALE]) {
    const v = await db.query<{ id: string }>(
      `insert into deliverable_versions (deliverable_id, number, status) select id, 1, status from deliverables where id = $1 returning id`, [id]);
    await db.query(`update deliverables set current_version_id = $1 where id = $2`, [v.rows[0].id, id]);
  }
  await db.query(`update deliverables set link_url = 'https://figma.com/d' where id = $1`, [D_DRAFT]);
  await db.query(`update deliverables set file_path = '${SITE}/deliverables/stale.pdf' where id = $1`, [D_STALE]);
  await applyMigrationsFrom(db, "0009");
});

const current = (id: string) => db.query<{ number: number; status: string; file_path: string | null; link_url: string | null; decided_by: string | null }>(
  `select v.number, v.status, v.file_path, v.link_url, v.decided_by from deliverables d join deliverable_versions v on v.id = d.current_version_id where d.id = $1`, [id]).then((r) => r.rows[0]);

describe("0009 re-backfill", () => {
  it("creates v1 for a deliverable that had no version, with its file, status and decision", async () => {
    expect(await current(D_LATE)).toEqual({ number: 1, status: "changes_requested", file_path: `${SITE}/deliverables/late.png`, link_url: null, decided_by: ALICE });
    const c = await db.query<{ body: string; kind: string }>(
      `select c.body, c.kind from deliverable_comments c join deliverable_versions v on v.id = c.version_id where v.deliverable_id = $1`, [D_LATE]);
    expect(c.rows).toEqual([{ body: "Bigger please", kind: "decision" }]);
  });

  it("copies legacy file/link onto a current version that lacks them", async () => {
    expect((await current(D_DRAFT)).link_url).toBe("https://figma.com/d");
    expect((await current(D_STALE)).file_path).toBe(`${SITE}/deliverables/stale.pdf`);
  });

  it("drops the legacy columns and leaves no deliverable without a current version", async () => {
    const cols = await db.query(`select column_name from information_schema.columns where table_name = 'deliverables' and column_name in ('file_path','link_url','client_feedback')`);
    expect(cols.rows).toEqual([]);
    const orphans = await db.query(`select id from deliverables where current_version_id is null`);
    expect(orphans.rows).toEqual([]);
  });
});
