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
