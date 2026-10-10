import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb } from "./harness";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ALICE = "00000000-0000-0000-0000-0000000000a1";
const BOB = "00000000-0000-0000-0000-0000000000b1";
const A = "10000000-0000-0000-0000-00000000000a";
const B = "10000000-0000-0000-0000-00000000000b";
const SITE = "20000000-0000-0000-0000-00000000000a";
const OLD = "20000000-0000-0000-0000-0000000000a2";
const BRAND = "20000000-0000-0000-0000-00000000000b";

let db: PGlite;
type Row = { project_id: string | null; label: string; minutes: number };
const hours = (user: string | null, client: string) =>
  asUser(db, user, (tx) => tx.query<Row>("select * from portal_hours($1, '2026-10-01')", [client])).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'a@x.com'), ('${ALICE}', 'al@a.com'), ('${BOB}', 'b@b.com');
    insert into clients (id, name, show_hours_in_portal) values ('${A}', 'A Co', true), ('${B}', 'B Co', true);
    insert into profiles (user_id, role, client_id, email) values
      ('${ADMIN}', 'admin', null, 'a@x.com'), ('${ALICE}', 'client', '${A}', 'al@a.com'), ('${BOB}', 'client', '${B}', 'b@b.com');
    insert into projects (id, client_id, name) values ('${SITE}', '${A}', 'Site'), ('${BRAND}', '${B}', 'Brand');
    insert into projects (id, client_id, name, archived) values ('${OLD}', '${A}', 'Old', true);
    insert into time_entries (client_id, project_id, work_date, minutes, note) values
      ('${A}', '${SITE}', '2026-10-02', 60, 'secret note'),
      ('${A}', '${SITE}', '2026-10-31', 30, null),
      ('${A}', '${OLD}', '2026-10-05', 15, null),
      ('${A}', null, '2026-10-06', 45, null),
      ('${A}', '${SITE}', '2026-09-30', 600, null),
      ('${B}', '${BRAND}', '2026-10-03', 120, null);
  `);
});

describe("portal_hours", () => {
  it("clients cannot read time_entries directly", async () => {
    const r = await asUser(db, ALICE, (tx) => tx.query("select * from time_entries"));
    expect(r.rows).toHaveLength(0);
  });

  it("returns own project totals with archived + unassigned as Other work, month only", async () => {
    expect(await hours(ALICE, A)).toEqual([
      { project_id: SITE, label: "Site", minutes: 90 },
      { project_id: null, label: "Other work", minutes: 60 },
    ]);
  });

  it("exposes only totals, never notes", async () => {
    const r = await hours(ALICE, A);
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(Object.keys(r[0]).sort()).toEqual(["label", "minutes", "project_id"]);
  });

  it("cross-client request is empty", async () => {
    expect(await hours(ALICE, B)).toEqual([]);
    expect(await hours(BOB, A)).toEqual([]);
  });

  it("toggle off → empty for the client, admin still sees it", async () => {
    await db.exec(`update clients set show_hours_in_portal = false where id = '${A}'`);
    expect(await hours(ALICE, A)).toEqual([]);
    expect((await hours(ADMIN, A)).length).toBe(2);
    await db.exec(`update clients set show_hours_in_portal = true where id = '${A}'`);
  });

  it("anon cannot execute", async () => {
    await expect(hours(null, A)).rejects.toThrow(/permission denied/);
  });

  it("clients cannot flip their own toggle", async () => {
    await asUser(db, BOB, (tx) => tx.query(`update clients set show_hours_in_portal = false where id = '${B}'`));
    const r = await db.query<{ show_hours_in_portal: boolean }>(`select show_hours_in_portal from clients where id = '${B}'`);
    expect(r.rows[0].show_hours_in_portal).toBe(true);
  });
});
