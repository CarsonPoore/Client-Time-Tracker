# Release 3a — Revisions, Feedback Threads, Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give deliverables numbered versions, a per-version comment thread (attachments and image pins), version-bound approval, a soft revision limit, and an admin per-client activity timeline.

**Architecture:**
- A new `deliverable_versions` table holds file, status and decision per version.
- `deliverables.status` mirrors the current version through a trigger, so the dashboard, digest and ClickUp keep working.
- Comments, attachments and activity are new tables with RLS. State changes go through security-definer RPCs, and activity rows are written by triggers.
- The UI is shared client components used by the portal, the Preview portal (`readOnly`) and admin.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (Postgres + storage), zod 4, vitest, PGlite (`tests/db/harness.ts`).

**Spec:** `docs/superpowers/specs/2026-10-10-release3a-revisions-feedback-design.md`

## Global Constraints

- New migrations: `supabase/migrations/0008_revisions.sql`. Legacy column drop goes in `0009_drop_legacy_deliverable_columns.sql`. This is a deviation from the spec's single file, so each commit stays typecheck-green.
- Security-definer functions: `language plpgsql security definer set search_path = public`. Then `revoke all … from public, anon` and `grant execute … to authenticated`.
- RPC error codes, exactly: `not_found`, `not_current_version`, `not_awaiting_approval`, `invalid_decision`, `feedback_required`, `forbidden`.
- Attachment cap: `26214400` bytes (25 MB).
- MIME allowlist:
  - images: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
  - `application/pdf`
  - Word: `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - Excel: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - PowerPoint: `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`
  - `text/plain`, `text/csv`, `application/zip`
- Storage path for comment attachments: `<project_id>/comments/<comment_id>/<uuid>-<slug>.<ext>`.
- Revision label text:
  - `Revision n of L`
  - `Over limit (n of L)` when n > L
  - `Revision n` when there is no limit
- Comment body: 1–5,000 characters, trimmed. Pins are `numeric`, 0–100, both set or both null.
- Activity page size is 50, with keyset paging on `created_at`.
- Do not apply migrations to production or deploy without asking Carson.
- `npm run typecheck`, `npm test` and `npm run build` stay green at the end of every task.

**Deviation from spec, flagged:** the codebase has no `storage.objects` policies. All storage access goes through the service-role client with signed upload URLs and `pathBelongs()` checks (`src/app/admin/project-actions.ts`). Comment attachments follow that pattern: the server action checks that the project belongs to the client and the comment belongs to the user before issuing a signed upload. RLS on `comment_attachments` stays the database-level guarantee.

## Review Focus

1. A client opens a deliverable whose current version is a new draft (v3 being prepared) while v2 was approved. They should still see v1–v2 and nothing of v3. Test in Task 2.
2. The admin publishes a new version while the client has the page open and then clicks Approve on the stale version. They should get `not_current_version` with a plain message, not approve the old file. Tests in Task 3 (`not_current_version`) and Task 7 (message mapping).
3. A deliverable created before 3a with `changes_requested` and feedback. After migration it shows v1 "Changes requested" with the feedback as the first comment, and the admin can upload v2. Test in Task 1 (backfill) plus Task 3 (publish on a backfilled row).
4. A client uploads a 26 MB file or an `.exe` as an attachment. It is rejected before any upload URL is issued. Test in Task 5 (`validateAttachment`).
5. Comment text with `<script>` or newlines renders as text with line breaks, never HTML. Test in Task 8 (render test).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0008_revisions.sql` | Tables, backfill, mirror trigger, RLS, RPCs, activity triggers |
| `supabase/migrations/0009_drop_legacy_deliverable_columns.sql` | Drop `file_path`, `link_url`, `client_feedback`, `decided_at`, `decided_by`, and `changes_need_feedback` from `deliverables` |
| `tests/db/harness.ts` | Add `createDb({ before })` + `applyMigrationsFrom()` for the backfill test |
| `tests/db/revisions.test.ts` | Backfill, RLS, RPC and activity tests |
| `src/lib/revisions.ts` | Pure helpers: `revisionLabel`, `pinFromClick`, `validateAttachment`, `parseComment`, `versionErrorMessage` |
| `src/lib/storage.ts` | Add the `"comments"` kind to `buildStoragePath` |
| `src/lib/types.ts` | `VersionRow`, `CommentRow`, `AttachmentRow`, `ActivityRow`; slim `DeliverableRow` |
| `src/lib/portal-data.ts` | `loadPortalDeliverable` returns versions + comments + attachments |
| `src/lib/admin-data.ts` (new) | `loadAdminDeliverable`, `loadClientActivity` |
| `src/app/portal/actions.ts` | `decideVersion`, `addComment`, `createCommentUpload`, `attachToComment` |
| `src/app/admin/project-actions.ts` | Create a deliverable with a v1 draft, `publishVersion`, attach a file to the current draft, set the revision limit, admin comments |
| `src/components/deliverables/*.tsx` | `VersionTabs`, `CommentThread`, `CommentComposer`, `PinLayer`, `DecisionBar`, `DeliverableWorkspace` |
| `src/app/admin/deliverables/[id]/page.tsx` | Admin deliverable page |
| `src/app/portal/deliverables/[id]/page.tsx` | Rewire to `DeliverableWorkspace` |
| `src/app/admin/clients/[id]/preview/deliverables/[deliverableId]/page.tsx` | `readOnly` workspace |
| `src/app/admin/clients/[id]/activity-card.tsx` | Activity card + load more |
| `src/lib/email/digest-loader.ts`, `templates.ts` | "New comments" section; "awaiting" includes version number |

---

### Task 1: Versions table, backfill, status mirror

**Files:**
- Create: `supabase/migrations/0008_revisions.sql`
- Modify: `tests/db/harness.ts`
- Test: `tests/db/revisions.test.ts`

**Interfaces:**
- Produces:
  - table `deliverable_versions`
  - columns `deliverables.current_version_id` and `deliverables.revision_limit`
  - trigger `deliverable_versions_mirror`
  - harness `createDb(opts?: { before?: string })`, which stops before the named migration prefix, and `applyMigrationsFrom(db, prefix: string)`

- [ ] **Step 1: Extend the harness**

```ts
// tests/db/harness.ts — replace createDb
function migrationFiles(): string[] {
  const dir = join(process.cwd(), "supabase/migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => join(dir, f));
}

export async function createDb(opts: { before?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    if (opts.before && file.split("/").pop()!.startsWith(opts.before)) break;
    await db.exec(readFileSync(file, "utf8"));
  }
  return db;
}

export async function applyMigrationsFrom(db: PGlite, prefix: string): Promise<void> {
  let on = false;
  for (const file of migrationFiles()) {
    if (file.split("/").pop()!.startsWith(prefix)) on = true;
    if (on) await db.exec(readFileSync(file, "utf8"));
  }
}
```

- [ ] **Step 2: Write the failing backfill test**

```ts
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
      ('${D_FEEDBACK}','${SITE}','Logo','${SITE}/deliverables/x-logo.png','changes_requested','Make it bluer','2026-10-01','2026-10-02','${ALICE}'),
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

export { db, A, B, SITE, BRAND, D_FEEDBACK, D_APPROVED, D_DRAFT, D_LINK, D_BOB, asUser };
```

Later tasks append `describe` blocks to this file, sharing its `beforeAll`. Do not export the mutable `db` across files. The export line above is only there to document the shared names; delete it if the linter flags it.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run tests/db/revisions.test.ts`
Expected: FAIL with `relation "deliverable_versions" does not exist`.

- [ ] **Step 4: Write the migration (part 1)**

```sql
-- supabase/migrations/0008_revisions.sql
-- Release 3a: deliverable versions, comment threads, attachments, client activity.

create table public.deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  number int not null check (number > 0),
  file_path text,
  link_url text,
  notes text,
  status public.deliverable_status not null default 'draft',
  published_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deliverable_id, number)
);
create index deliverable_versions_deliverable_id_idx on public.deliverable_versions(deliverable_id);
create trigger deliverable_versions_updated before update on public.deliverable_versions
  for each row execute function public.set_updated_at();

alter table public.deliverables
  add column current_version_id uuid references public.deliverable_versions(id) on delete set null,
  add column revision_limit int check (revision_limit is null or revision_limit > 0);

create table public.deliverable_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.deliverable_versions(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check (author_role in ('client', 'admin')),
  body text not null check (btrim(body) <> '' and length(body) <= 5000),
  kind text not null default 'comment' check (kind in ('comment', 'decision')),
  pin_x numeric check (pin_x between 0 and 100),
  pin_y numeric check (pin_y between 0 and 100),
  created_at timestamptz not null default now(),
  constraint pin_pair check ((pin_x is null) = (pin_y is null))
);
create index deliverable_comments_version_idx on public.deliverable_comments(version_id, created_at);

create table public.comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.deliverable_comments(id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  size_bytes bigint check (size_bytes between 0 and 26214400),
  mime_type text,
  created_at timestamptz not null default now()
);
create index comment_attachments_comment_idx on public.comment_attachments(comment_id);

create table public.client_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null,
  ref_table text not null,
  ref_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index client_activity_client_created_idx on public.client_activity(client_id, created_at desc);

-- Backfill: every deliverable becomes v1.
insert into public.deliverable_versions
  (deliverable_id, number, file_path, link_url, status, published_at, decided_at, decided_by, created_at)
select id, 1, file_path, link_url, status, published_at, decided_at, decided_by, created_at
from public.deliverables;

update public.deliverables d set current_version_id = v.id
from public.deliverable_versions v where v.deliverable_id = d.id and v.number = 1;

insert into public.deliverable_comments (version_id, author_id, author_role, body, kind, created_at)
select d.current_version_id, d.decided_by, 'client', btrim(d.client_feedback), 'decision', coalesce(d.decided_at, d.updated_at)
from public.deliverables d
where btrim(coalesce(d.client_feedback, '')) <> '';

insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary, created_at)
select p.client_id, 'version_published', 'deliverable_versions', v.id, null,
       d.title || ' v1 sent for approval', v.published_at
from public.deliverable_versions v
join public.deliverables d on d.id = v.deliverable_id
join public.projects p on p.id = d.project_id
where v.published_at is not null;

insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary, created_at)
select p.client_id,
       case v.status when 'approved' then 'version_approved' else 'changes_requested' end,
       'deliverable_versions', v.id, v.decided_by,
       d.title || case v.status when 'approved' then ' v1 approved' else ' v1: changes requested' end,
       v.decided_at
from public.deliverable_versions v
join public.deliverables d on d.id = v.deliverable_id
join public.projects p on p.id = d.project_id
where v.decided_at is not null and v.status in ('approved', 'changes_requested');

-- deliverables.status mirrors its current version.
create function public.mirror_version_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.deliverables
     set status = new.status
   where current_version_id = new.id and status is distinct from new.status;
  return new;
end $$;

create trigger deliverable_versions_mirror after insert or update of status on public.deliverable_versions
  for each row execute function public.mirror_version_status();
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run tests/db/revisions.test.ts`
Expected: PASS (4 tests). Also run `npx vitest run tests/db` and expect the existing `rls.test.ts` and `portal-hours.test.ts` to still pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0008_revisions.sql tests/db/harness.ts tests/db/revisions.test.ts
git commit -m "feat(db): deliverable versions, comments, activity tables with v1 backfill"
```

---

### Task 2: RLS for versions, comments, attachments, activity

**Files:**
- Modify: `supabase/migrations/0008_revisions.sql` (append)
- Test: `tests/db/revisions.test.ts` (append)

**Interfaces:**
- Produces: `public.version_client_id(p_version_id uuid) returns uuid`. It is a security-definer function that returns the owning client id when the version is not a draft and its project is not archived, and null otherwise.

- [ ] **Step 1: Write the failing RLS tests (append)**

```ts
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
    expect(await versionsOf(null, D_FEEDBACK)).toEqual([]);
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
    const anon = await asUser(db, null, (tx) => tx.query("select body from deliverable_comments"));
    expect(anon.rows).toEqual([]);
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/db/revisions.test.ts -t rls`
Expected: FAIL. With RLS off, Alice sees the draft and Bob's rows.

- [ ] **Step 3: Append the policies to `0008_revisions.sql`**

```sql
-- RLS
alter table public.deliverable_versions enable row level security;
alter table public.deliverable_comments enable row level security;
alter table public.comment_attachments enable row level security;
alter table public.client_activity enable row level security;

create function public.version_client_id(p_version_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.client_id
  from public.deliverable_versions v
  join public.deliverables d on d.id = v.deliverable_id
  join public.projects p on p.id = d.project_id
  where v.id = p_version_id and v.status <> 'draft' and not p.archived
$$;
revoke all on function public.version_client_id(uuid) from public, anon;
grant execute on function public.version_client_id(uuid) to authenticated;

create policy admin_all on public.deliverable_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.deliverable_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.comment_attachments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.client_activity for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy client_read on public.deliverable_versions for select to authenticated
  using (public.version_client_id(id) = public.auth_client_id());

create policy client_read on public.deliverable_comments for select to authenticated
  using (public.version_client_id(version_id) = public.auth_client_id());

create policy client_insert on public.deliverable_comments for insert to authenticated
  with check (
    public.version_client_id(version_id) = public.auth_client_id()
    and author_id = auth.uid()
    and author_role = 'client'
    and kind = 'comment'
  );

create policy client_read on public.comment_attachments for select to authenticated
  using (exists (
    select 1 from public.deliverable_comments c
    where c.id = comment_id and public.version_client_id(c.version_id) = public.auth_client_id()));

create policy client_insert on public.comment_attachments for insert to authenticated
  with check (exists (
    select 1 from public.deliverable_comments c
    join public.deliverable_versions v on v.id = c.version_id
    join public.deliverables d on d.id = v.deliverable_id
    where c.id = comment_id
      and c.author_id = auth.uid()
      and public.version_client_id(c.version_id) = public.auth_client_id()
      and storage_path like d.project_id::text || '/comments/' || c.id::text || '/%'));

grant select, insert, update, delete on public.deliverable_versions, public.deliverable_comments,
  public.comment_attachments, public.client_activity to authenticated;
revoke all on public.deliverable_versions, public.deliverable_comments,
  public.comment_attachments, public.client_activity from anon;
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/db`
Expected: PASS, including the existing suites.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_revisions.sql tests/db/revisions.test.ts
git commit -m "feat(db): RLS for versions, comments, attachments, activity"
```

---

### Task 3: RPCs — `decide_version`, `publish_version`, `decide_deliverable` wrapper

**Files:**
- Modify: `supabase/migrations/0008_revisions.sql` (append)
- Test: `tests/db/revisions.test.ts` (append)

**Interfaces:**
- Produces:
  - `decide_version(p_version_id uuid, p_decision deliverable_status, p_note text) returns deliverable_versions`
  - `publish_version(p_deliverable_id uuid, p_file_path text, p_link_url text, p_notes text) returns deliverable_versions`. If the current version is a draft, it is promoted in place, keeping its file when the arguments are null. Otherwise it inserts `max(number)+1`.
  - `decide_deliverable(p_id uuid, p_decision deliverable_status, p_feedback text) returns deliverables`, which now delegates.

- [ ] **Step 1: Write the failing tests (append)**

```ts
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

  it("legacy decide_deliverable delegates to the current version", async () => {
    await rpc(ALICE, "select * from decide_deliverable($1, 'approved', null)", [D_LINK]);
    const v = await db.query<{ status: string }>("select status from deliverable_versions where id = $1", [await currentVersion(D_LINK)]);
    expect(v.rows[0].status).toBe("approved");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/db/revisions.test.ts -t publish_version`
Expected: FAIL with `function publish_version(...) does not exist`.

- [ ] **Step 3: Append the RPCs**

```sql
-- RPCs
create function public.decide_version(
  p_version_id uuid, p_decision public.deliverable_status, p_note text
) returns public.deliverable_versions
language plpgsql security definer set search_path = public as $$
declare
  v public.deliverable_versions;
  cur uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v from public.deliverable_versions where id = p_version_id for update;
  if not found or public.version_client_id(v.id) is distinct from public.auth_client_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select current_version_id into cur from public.deliverables where id = v.deliverable_id;
  if cur is distinct from v.id then
    raise exception 'not_current_version' using errcode = 'P0001';
  end if;
  if v.status <> 'awaiting_approval' then
    raise exception 'not_awaiting_approval' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision = 'changes_requested' and note is null then
    raise exception 'feedback_required' using errcode = 'P0001';
  end if;
  if note is not null and length(note) > 5000 then
    raise exception 'feedback_too_long' using errcode = 'P0001';
  end if;

  update public.deliverable_versions
     set status = p_decision, decided_at = now(), decided_by = auth.uid()
   where id = v.id
  returning * into v;

  if note is not null then
    insert into public.deliverable_comments (version_id, author_id, author_role, body, kind)
    values (v.id, auth.uid(), 'client', note, 'decision');
  end if;
  return v;
end $$;

create function public.publish_version(
  p_deliverable_id uuid, p_file_path text, p_link_url text, p_notes text
) returns public.deliverable_versions
language plpgsql security definer set search_path = public as $$
declare
  d public.deliverables;
  cur public.deliverable_versions;
  v public.deliverable_versions;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into d from public.deliverables where id = p_deliverable_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into cur from public.deliverable_versions where id = d.current_version_id;

  if cur.id is not null and cur.status = 'draft' then
    update public.deliverable_versions
       set file_path = coalesce(p_file_path, file_path),
           link_url = coalesce(p_link_url, link_url),
           notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
           status = 'awaiting_approval', published_at = now()
     where id = cur.id
    returning * into v;
  else
    if p_file_path is null and p_link_url is null then
      raise exception 'file_required' using errcode = 'P0001';
    end if;
    insert into public.deliverable_versions
      (deliverable_id, number, file_path, link_url, notes, status, published_at, created_by)
    values (d.id,
            coalesce((select max(number) from public.deliverable_versions where deliverable_id = d.id), 0) + 1,
            p_file_path, p_link_url, nullif(btrim(coalesce(p_notes, '')), ''),
            'awaiting_approval', now(), auth.uid())
    returning * into v;
  end if;

  if v.file_path is null and v.link_url is null then
    raise exception 'file_required' using errcode = 'P0001';
  end if;

  update public.deliverables
     set current_version_id = v.id, status = v.status, published_at = coalesce(published_at, v.published_at)
   where id = d.id;
  return v;
end $$;

drop function public.decide_deliverable(uuid, public.deliverable_status, text);
create function public.decide_deliverable(
  p_id uuid, p_decision public.deliverable_status, p_feedback text
) returns public.deliverables
language plpgsql security definer set search_path = public as $$
declare
  d public.deliverables;
begin
  select * into d from public.deliverables where id = p_id;
  if not found or d.current_version_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.decide_version(d.current_version_id, p_decision, p_feedback);
  select * into d from public.deliverables where id = p_id;
  return d;
end $$;

revoke all on function public.decide_version(uuid, public.deliverable_status, text) from public, anon;
grant execute on function public.decide_version(uuid, public.deliverable_status, text) to authenticated;
revoke all on function public.publish_version(uuid, text, text, text) from public, anon;
grant execute on function public.publish_version(uuid, text, text, text) to authenticated;
revoke all on function public.decide_deliverable(uuid, public.deliverable_status, text) from public, anon;
grant execute on function public.decide_deliverable(uuid, public.deliverable_status, text) to authenticated;
```

Note: `deliverables` still has `changes_need_feedback` until 0009. The mirror trigger sets `deliverables.status = 'changes_requested'` while `client_feedback` is null, which would violate it. Drop that constraint here, at the top of this RPC block:

```sql
alter table public.deliverables drop constraint changes_need_feedback;
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_revisions.sql tests/db/revisions.test.ts
git commit -m "feat(db): publish_version and decide_version RPCs"
```

---

### Task 4: Activity triggers

**Files:**
- Modify: `supabase/migrations/0008_revisions.sql` (append; this must run after the backfill)
- Test: `tests/db/revisions.test.ts` (append)

**Interfaces:**
- Produces: `client_activity` rows with these types:
  - `version_published`, summary `"<title> v<n> sent for approval"`
  - `version_approved`, summary `"<title> v<n> approved"`
  - `changes_requested`, summary `"<title> v<n>: changes requested"`
  - `comment_added`, summary `"<Client|Carson> commented on <title> v<n>"`
  - `ref_table` is `deliverable_versions` or `deliverable_comments`.

- [ ] **Step 1: Write the failing test (append)**

```ts
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
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/db/revisions.test.ts -t activity`
Expected: FAIL (`after - before` is 0).

- [ ] **Step 3: Append the triggers**

```sql
-- Activity (created after backfill so backfill does not double-log)
create function public.log_version_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text; s text; cid uuid; title text;
begin
  select p.client_id, d.title into cid, title
  from public.deliverables d join public.projects p on p.id = d.project_id
  where d.id = new.deliverable_id;

  if new.status = 'awaiting_approval' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    t := 'version_published'; s := title || ' v' || new.number || ' sent for approval';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'approved' then
    t := 'version_approved'; s := title || ' v' || new.number || ' approved';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'changes_requested' then
    t := 'changes_requested'; s := title || ' v' || new.number || ': changes requested';
  else
    return new;
  end if;

  insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary)
  values (cid, t, 'deliverable_versions', new.id, auth.uid(), s);
  return new;
end $$;

create trigger deliverable_versions_activity after insert or update of status on public.deliverable_versions
  for each row execute function public.log_version_activity();

create function public.log_comment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid; title text; n int;
begin
  if new.kind <> 'comment' then return new; end if;
  select p.client_id, d.title, v.number into cid, title, n
  from public.deliverable_versions v
  join public.deliverables d on d.id = v.deliverable_id
  join public.projects p on p.id = d.project_id
  where v.id = new.version_id;
  insert into public.client_activity (client_id, type, ref_table, ref_id, actor_id, summary)
  values (cid, 'comment_added', 'deliverable_comments', new.id, new.author_id,
          case new.author_role when 'client' then 'Client' else 'Carson' end || ' commented on ' || title || ' v' || n);
  return new;
end $$;

create trigger deliverable_comments_activity after insert on public.deliverable_comments
  for each row execute function public.log_comment_activity();

revoke all on function public.log_version_activity() from public, anon, authenticated;
revoke all on function public.log_comment_activity() from public, anon, authenticated;
revoke all on function public.mirror_version_status() from public, anon, authenticated;
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_revisions.sql tests/db/revisions.test.ts
git commit -m "feat(db): activity triggers for versions and comments"
```

---

### Task 5: Pure helpers and storage path kind

**Files:**
- Create: `src/lib/revisions.ts`
- Modify: `src/lib/storage.ts`
- Test: `tests/unit/revisions.test.ts`, `tests/unit/storage.test.ts` (append)

**Interfaces:**
- Produces:
  - `revisionLabel(n: number, limit: number | null): { text: string; over: boolean }`
  - `pinFromClick(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number }`, clamped to 0–100 and rounded to 2 decimals
  - `ALLOWED_MIME: ReadonlySet<string>`, `MAX_ATTACHMENT_BYTES = 26214400`
  - `validateAttachment(f: { name: string; size: number; type: string }): string | null`, which returns an error message or null
  - `parseComment(form: FormData): { ok: true; body: string; pin: { x: number; y: number } | null } | { ok: false; error: string }`
  - `versionErrorMessage(message: string): string`
  - `isImagePath(path: string | null): boolean`
  - `buildStoragePath(projectId, fileName, kind: "files" | "deliverables" | "comments", id?, commentId?)`. For `"comments"`, `commentId` is required and the path becomes `${projectId}/comments/${commentId}/${id}-${slug}.${ext}`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/revisions.test.ts
import { describe, expect, it } from "vitest";
import { isImagePath, parseComment, pinFromClick, revisionLabel, validateAttachment, versionErrorMessage } from "@/lib/revisions";

describe("revisionLabel", () => {
  it.each([
    [1, null, "Revision 1", false],
    [2, 3, "Revision 2 of 3", false],
    [3, 3, "Revision 3 of 3", false],
    [4, 3, "Over limit (4 of 3)", true],
  ])("%i of %s", (n, limit, text, over) => expect(revisionLabel(n, limit)).toEqual({ text, over }));
});

describe("pinFromClick", () => {
  const rect = { left: 100, top: 50, width: 200, height: 400 };
  it("maps to percent", () => expect(pinFromClick(150, 150, rect)).toEqual({ x: 25, y: 25 }));
  it("clamps outside clicks", () => expect(pinFromClick(0, 1000, rect)).toEqual({ x: 0, y: 100 }));
  it("rounds to 2 decimals", () => expect(pinFromClick(101, 51, { ...rect, width: 3, height: 3 })).toEqual({ x: 33.33, y: 33.33 }));
});

describe("validateAttachment", () => {
  it("accepts a png", () => expect(validateAttachment({ name: "a.png", size: 1000, type: "image/png" })).toBeNull());
  it("rejects over 25 MB", () => expect(validateAttachment({ name: "a.png", size: 26214401, type: "image/png" })).toMatch(/25 MB/));
  it("rejects exe", () => expect(validateAttachment({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatch(/type/));
  it("rejects empty", () => expect(validateAttachment({ name: "a.png", size: 0, type: "image/png" })).toMatch(/empty/));
});

describe("parseComment", () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  it("trims body", () => expect(parseComment(fd({ body: "  hi  " }))).toEqual({ ok: true, body: "hi", pin: null }));
  it("requires body", () => expect(parseComment(fd({ body: "   " }))).toEqual({ ok: false, error: "Write a comment first." }));
  it("caps length", () => expect(parseComment(fd({ body: "x".repeat(5001) })).ok).toBe(false));
  it("reads pin pair", () => expect(parseComment(fd({ body: "a", pin_x: "10.5", pin_y: "20" }))).toEqual({ ok: true, body: "a", pin: { x: 10.5, y: 20 } }));
  it("rejects bad pin", () => expect(parseComment(fd({ body: "a", pin_x: "200", pin_y: "20" })).ok).toBe(false));
  it("rejects half pin", () => expect(parseComment(fd({ body: "a", pin_x: "10" })).ok).toBe(false));
});

describe("versionErrorMessage", () => {
  it.each([
    ["not_current_version", "A newer version was posted. Refresh to see it."],
    ["not_awaiting_approval", "This version has already been decided."],
    ["feedback_required", "Tell us what to change."],
    ["not_found", "We couldn't find that version."],
    ["boom", "Something went wrong. Please try again."],
  ])("%s", (code, msg) => expect(versionErrorMessage(`ERROR: ${code}`)).toBe(msg));
});

describe("isImagePath", () => {
  it.each([["a/b.PNG", true], ["a/b.jpg", true], ["a/b.pdf", false], [null, false]])("%s", (p, r) => expect(isImagePath(p)).toBe(r));
});
```

```ts
// tests/unit/storage.test.ts — append
it("builds comment paths under the comment id", () => {
  const p = buildStoragePath("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11", "Screen Shot.PNG", "comments", "abc", "0b9f4c1e-1111-4222-8333-444455556666");
  expect(p).toBe("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11/comments/0b9f4c1e-1111-4222-8333-444455556666/abc-screen-shot.png");
});
it("requires a uuid comment id for comment paths", () => {
  expect(() => buildStoragePath("8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11", "a.png", "comments", "abc", "../x")).toThrow();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/revisions.test.ts tests/unit/storage.test.ts`
Expected: FAIL with "Cannot find module '@/lib/revisions'".

- [ ] **Step 3: Implement**

```ts
// src/lib/revisions.ts
export const MAX_ATTACHMENT_BYTES = 26214400;
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "application/zip",
]);

export function revisionLabel(n: number, limit: number | null): { text: string; over: boolean } {
  if (!limit) return { text: `Revision ${n}`, over: false };
  if (n > limit) return { text: `Over limit (${n} of ${limit})`, over: true };
  return { text: `Revision ${n} of ${limit}`, over: false };
}

const clampPct = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;

export function pinFromClick(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  return { x: clampPct(((clientX - rect.left) / rect.width) * 100), y: clampPct(((clientY - rect.top) / rect.height) * 100) };
}

export function validateAttachment(f: { name: string; size: number; type: string }): string | null {
  if (f.size <= 0) return "That file is empty.";
  if (f.size > MAX_ATTACHMENT_BYTES) return "Files must be 25 MB or smaller.";
  if (!ALLOWED_MIME.has(f.type)) return "That file type isn't supported. Use an image, PDF, Office document, text, CSV or zip.";
  return null;
}

export function parseComment(form: FormData):
  { ok: true; body: string; pin: { x: number; y: number } | null } | { ok: false; error: string } {
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write a comment first." };
  if (body.length > 5000) return { ok: false, error: "Keep comments under 5,000 characters." };
  const rx = form.get("pin_x"), ry = form.get("pin_y");
  if (rx == null && ry == null) return { ok: true, body, pin: null };
  const x = Number(rx), y = Number(ry);
  if (rx == null || ry == null || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return { ok: false, error: "That pin is off the image." };
  }
  return { ok: true, body, pin: { x, y } };
}

export function versionErrorMessage(message: string): string {
  if (message.includes("not_current_version")) return "A newer version was posted. Refresh to see it.";
  if (message.includes("not_awaiting_approval")) return "This version has already been decided.";
  if (message.includes("feedback_required")) return "Tell us what to change.";
  if (message.includes("not_found")) return "We couldn't find that version.";
  return "Something went wrong. Please try again.";
}

export function isImagePath(path: string | null): boolean {
  return !!path && /\.(png|jpe?g|gif|webp)$/i.test(path);
}
```

```ts
// src/lib/storage.ts — replace buildStoragePath signature/body head
export type StorageKind = "files" | "deliverables" | "comments";

export function buildStoragePath(projectId: string, fileName: string, kind: StorageKind, id: string = randomUUID(), commentId?: string): string {
  if (!UUID_RE.test(projectId)) throw new Error("Invalid project id.");
  if (kind !== "files" && kind !== "deliverables" && kind !== "comments") throw new Error("Invalid storage kind.");
  if (kind === "comments" && (!commentId || !UUID_RE.test(commentId))) throw new Error("Invalid comment id.");
  if (!ID_RE.test(id)) throw new Error("Invalid object id.");
  // …existing slug/ext logic unchanged…
  const dir = kind === "comments" ? `${projectId}/comments/${commentId}` : `${projectId}/${kind}`;
  return `${dir}/${id}-${slug}${ext ? `.${ext}` : ""}`;
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/unit/revisions.test.ts tests/unit/storage.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/revisions.ts src/lib/storage.ts tests/unit/revisions.test.ts tests/unit/storage.test.ts
git commit -m "feat: revision label, pin math, attachment validation helpers"
```

---

### Task 6: Types and data loaders

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/portal-data.ts`
- Create: `src/lib/admin-data.ts`
- Test: `tests/unit/portal-data.test.ts` (append), `tests/unit/admin-data.test.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/types.ts
export interface VersionRow {
  id: string; deliverable_id: string; number: number; file_path: string | null; link_url: string | null;
  notes: string | null; status: DeliverableStatus; published_at: string | null; decided_at: string | null;
  decided_by: string | null; created_at: string;
}
export interface AttachmentRow { id: string; comment_id: string; storage_path: string; name: string; size_bytes: number | null; mime_type: string | null }
export interface CommentRow {
  id: string; version_id: string; author_id: string | null; author_role: "client" | "admin";
  body: string; kind: "comment" | "decision"; pin_x: number | null; pin_y: number | null; created_at: string;
  attachments: AttachmentRow[];
}
export interface ActivityRow { id: string; type: string; ref_table: string; ref_id: string; summary: string; created_at: string }
// DeliverableRow: keep file_path/link_url/client_feedback/decided_at as optional until Task 10 removes them;
// add: current_version_id: string | null; revision_limit: number | null;
```

```ts
// src/lib/portal-data.ts
export interface DeliverableThread {
  deliverable: DeliverableRow & { project: { id: string; name: string } };
  versions: VersionRow[];                     // ascending by number, drafts excluded for clients
  comments: Record<string, CommentRow[]>;     // keyed by version_id, ascending by created_at
  decidedByName: Record<string, string>;      // user id -> display name (profiles.name or email)
}
export async function loadDeliverableThread(db: PortalDb, id: string, opts: { includeDrafts: boolean }): Promise<DeliverableThread | null>;
// loadPortalDeliverable(db, clientId, id) now returns loadDeliverableThread(db, id, { includeDrafts: false })
// after confirming deliverable.project.client_id === clientId (returns null otherwise).
```

```ts
// src/lib/admin-data.ts
export async function loadClientActivity(db: PortalDb, clientId: string, before?: string): Promise<{ rows: ActivityRow[]; nextBefore: string | null }>;
// selects 51 rows ordered created_at desc where created_at < before (if given); returns 50 and nextBefore = rows[49].created_at when a 51st exists.
```

- [ ] **Step 1: Write the failing tests.** Follow the existing fake-db style in `tests/unit/portal-data.test.ts`, which uses a chainable stub that records `.neq`/`.eq` calls. Add:

```ts
describe("loadDeliverableThread", () => {
  it("excludes draft versions for clients and groups comments by version", async () => {
    const db = fakeDb({
      deliverables: [{ id: "d1", project_id: "p1", title: "Logo", status: "awaiting_approval", current_version_id: "v2", revision_limit: 3, project: { id: "p1", name: "Site", client_id: "c1" } }],
      deliverable_versions: [
        { id: "v1", deliverable_id: "d1", number: 1, status: "changes_requested" },
        { id: "v2", deliverable_id: "d1", number: 2, status: "awaiting_approval" },
        { id: "v3", deliverable_id: "d1", number: 3, status: "draft" },
      ],
      deliverable_comments: [
        { id: "c1", version_id: "v1", body: "bluer", kind: "decision", created_at: "2026-10-02", comment_attachments: [] },
        { id: "c2", version_id: "v2", body: "nice", kind: "comment", created_at: "2026-10-05", comment_attachments: [{ id: "a1", name: "x.png" }] },
      ],
      profiles: [],
    });
    const t = await loadPortalDeliverable(db, "c1", "d1");
    expect(t!.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(t!.comments.v1.map((c) => c.body)).toEqual(["bluer"]);
    expect(t!.comments.v2[0].attachments).toHaveLength(1);
  });

  it("returns null for another client's deliverable", async () => {
    const db = fakeDb({ deliverables: [{ id: "d1", project: { id: "p1", name: "Site", client_id: "c2" } }], deliverable_versions: [], deliverable_comments: [], profiles: [] });
    expect(await loadPortalDeliverable(db, "c1", "d1")).toBeNull();
  });
});
```

```ts
// tests/unit/admin-data.test.ts
import { describe, expect, it } from "vitest";
import { loadClientActivity } from "@/lib/admin-data";

function activityDb(rows: { id: string; created_at: string }[]) {
  const calls: unknown[][] = [];
  const q: any = {
    select: () => q, eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
    lt: (...a: unknown[]) => (calls.push(["lt", ...a]), q), order: () => q,
    limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
  };
  return { db: { from: () => q }, calls };
}

describe("loadClientActivity", () => {
  it("pages by 50 with a cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i), created_at: `2026-10-${String(51 - i).padStart(2, "0")}` }));
    const { db } = activityDb(rows);
    const r = await loadClientActivity(db, "c1");
    expect(r.rows).toHaveLength(50);
    expect(r.nextBefore).toBe(rows[49].created_at);
  });
  it("no cursor when fewer than 51", async () => {
    const { db, calls } = activityDb([{ id: "1", created_at: "2026-10-01" }]);
    const r = await loadClientActivity(db, "c1", "2026-10-09");
    expect(r.nextBefore).toBeNull();
    expect(calls).toContainEqual(["lt", "created_at", "2026-10-09"]);
  });
});
```

If `fakeDb` doesn't already exist in `portal-data.test.ts`, add it there: a table → rows map whose `from(table)` returns a chainable query that applies `eq`/`neq`/`in` filters in memory and resolves on `then`, `maybeSingle` or `single`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/portal-data.test.ts tests/unit/admin-data.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/portal-data.ts — replace PortalDeliverable / loadPortalDeliverable
export interface DeliverableThread {
  deliverable: DeliverableRow & { project: { id: string; name: string; client_id: string } };
  versions: VersionRow[];
  comments: Record<string, CommentRow[]>;
  names: Record<string, string>;
}

export async function loadDeliverableThread(db: PortalDb, id: string, opts: { includeDrafts: boolean }): Promise<DeliverableThread | null> {
  const { data: deliverable } = await db.from("deliverables")
    .select("*, project:projects(id, name, client_id)").eq("id", id).maybeSingle();
  if (!deliverable) return null;
  let vq = db.from("deliverable_versions").select("*").eq("deliverable_id", id);
  if (!opts.includeDrafts) vq = vq.neq("status", "draft");
  const { data: versions } = await vq.order("number", { ascending: true });
  const vids = (versions ?? []).map((v: VersionRow) => v.id);
  const { data: raw } = vids.length
    ? await db.from("deliverable_comments").select("*, comment_attachments(*)").in("version_id", vids).order("created_at", { ascending: true })
    : { data: [] };
  const comments: Record<string, CommentRow[]> = Object.fromEntries(vids.map((v: string) => [v, []]));
  for (const c of raw ?? []) comments[c.version_id]?.push({ ...c, attachments: c.comment_attachments ?? [] });
  const userIds = [...new Set([...(raw ?? []).map((c: CommentRow) => c.author_id), ...(versions ?? []).map((v: VersionRow) => v.decided_by)].filter(Boolean))];
  const { data: people } = userIds.length
    ? await db.from("profiles").select("user_id, name, email").in("user_id", userIds)
    : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p: { user_id: string; name: string | null; email: string }) => [p.user_id, p.name || p.email]));
  return { deliverable, versions: versions ?? [], comments, names };
}

export async function loadPortalDeliverable(db: PortalDb, clientId: string, id: string): Promise<DeliverableThread | null> {
  const t = await loadDeliverableThread(db, id, { includeDrafts: false });
  if (!t || t.deliverable.project.client_id !== clientId || t.deliverable.status === "draft" || !t.versions.length) return null;
  return t;
}
```

Check `profiles` for a `name` column. If there isn't one, select `email` only and map to the email. RLS already limits a client's `profiles` read to their own row, so admin names will be missing for clients. Render a missing name as "Carson" when `author_role === 'admin'` and "You" or "Client" otherwise; Task 8 handles this.

```ts
// src/lib/admin-data.ts
import type { PortalDb } from "@/lib/portal-data";
import type { ActivityRow } from "@/lib/types";

export const ACTIVITY_PAGE = 50;

export async function loadClientActivity(db: PortalDb, clientId: string, before?: string) {
  let q = db.from("client_activity").select("id, type, ref_table, ref_id, summary, created_at").eq("client_id", clientId);
  if (before) q = q.lt("created_at", before);
  const { data } = await q.order("created_at", { ascending: false }).limit(ACTIVITY_PAGE + 1);
  const rows = (data ?? []) as ActivityRow[];
  return { rows: rows.slice(0, ACTIVITY_PAGE), nextBefore: rows.length > ACTIVITY_PAGE ? rows[ACTIVITY_PAGE - 1].created_at : null };
}
```

Update every caller of `PortalDeliverable` (`src/components/portal/views.tsx`, the portal and preview deliverable pages) so typecheck passes. For now, adapt `PortalDeliverableView` to read `t.deliverable` and the last version's `file_path`/`link_url`. Task 9 replaces it.

- [ ] **Step 4: Run and confirm it passes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/unit src/components/portal src/app
git commit -m "feat: deliverable thread and client activity loaders"
```

---

### Task 7: Server actions (portal + admin)

**Files:**
- Modify: `src/app/portal/actions.ts`, `src/app/admin/project-actions.ts`, `src/lib/email/notify.ts`
- Test: `tests/unit/portal-decision.test.ts` (append), `tests/unit/admin-actions.test.ts` (append), `tests/unit/comment-actions.test.ts` (new)

**Interfaces:**
- Consumes: `decide_version` and `publish_version` (Task 3), and `parseComment`, `validateAttachment`, `versionErrorMessage`, `buildStoragePath(…, "comments", …)` (Task 5).
- Produces:

```ts
// src/app/portal/actions.ts
export async function decideVersion(versionId: string, deliverableId: string, _prev: PortalResult, form: FormData): Promise<PortalResult>;
export async function addComment(versionId: string, deliverableId: string, _prev: PortalResult & { commentId?: string }, form: FormData): Promise<PortalResult & { commentId?: string }>;
export async function createCommentUpload(commentId: string, file: { name: string; size: number; type: string }): Promise<{ error: string } | { path: string; token: string }>;
export async function attachToComment(commentId: string, file: { path: string; name: string; size: number; type: string }): Promise<{ error: string | null }>;
// src/app/admin/project-actions.ts
export async function publishVersion(deliverableId: string, _prev: ActionResult, form: FormData): Promise<ActionResult>;   // form: file_path? link_url? notes?
export async function setRevisionLimit(deliverableId: string, _prev: ActionResult, form: FormData): Promise<ActionResult>; // form: revision_limit ('' = none, 1..50)
export async function addAdminComment(versionId: string, deliverableId: string, _prev: ActionResult & { commentId?: string }, form: FormData): Promise<ActionResult & { commentId?: string }>;
// createDeliverable: also inserts v1 draft (copying file_path/link_url from the form) and sets current_version_id.
// attachDeliverableFile: writes file_path to the current *draft* version (rejects otherwise).
// publishDeliverable(id): becomes publishVersion(id, ...) with no new file (promotes the draft).
// deleteDeliverable: still draft-only; removes every version file_path from storage.
```

- [ ] **Step 1: Write the failing tests.** Mirror the mocking style in `tests/unit/admin-actions.test.ts`, which uses `vi.mock("@/lib/supabase/server")` and `vi.mock("@/lib/auth")`.

```ts
// tests/unit/comment-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const insert = vi.fn();
const single = vi.fn();
const maybeSingle = vi.fn();
const createSignedUpload = vi.fn();
const removeObject = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireClient: vi.fn(async () => ({ userId: "u1", clientId: "c1" })) }));
vi.mock("@/lib/email/notify", () => ({ notifyAdminDecision: vi.fn(), postDecisionToClickUp: vi.fn(), notifyAdminRequest: vi.fn(), notifyAdminComment: vi.fn() }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<typeof import("@/lib/storage")>()), createSignedUpload, removeObject }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: () => ({ insert: (row: unknown) => (insert(row), { select: () => ({ single }) }), select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const { decideVersion, addComment, createCommentUpload, attachToComment } = await import("@/app/portal/actions");
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeEach(() => vi.clearAllMocks());

describe("decideVersion", () => {
  it("maps not_current_version", async () => {
    rpc.mockResolvedValue({ error: { message: "not_current_version" } });
    const r = await decideVersion("v1", "d1", { error: null }, fd({ decision: "approved" }));
    expect(r.error).toBe("A newer version was posted. Refresh to see it.");
    expect(rpc).toHaveBeenCalledWith("decide_version", { p_version_id: "v1", p_decision: "approved", p_note: null });
  });
});

describe("addComment", () => {
  it("inserts as the signed-in client with pin", async () => {
    single.mockResolvedValue({ data: { id: "cm1" }, error: null });
    const r = await addComment("v1", "d1", { error: null }, fd({ body: "hi", pin_x: "5", pin_y: "6" }));
    expect(insert).toHaveBeenCalledWith({ version_id: "v1", author_id: "u1", author_role: "client", body: "hi", pin_x: 5, pin_y: 6 });
    expect(r).toEqual({ error: null, commentId: "cm1" });
  });
  it("rejects empty body without calling db", async () => {
    const r = await addComment("v1", "d1", { error: null }, fd({ body: " " }));
    expect(r.error).toBe("Write a comment first.");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("createCommentUpload", () => {
  it("rejects bad file before issuing a URL", async () => {
    const r = await createCommentUpload("0b9f4c1e-1111-4222-8333-444455556666", { name: "a.exe", size: 5, type: "application/x-msdownload" });
    expect(r).toEqual({ error: expect.stringMatching(/type/) });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });
  it("rejects a comment the user doesn't own", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const r = await createCommentUpload("0b9f4c1e-1111-4222-8333-444455556666", { name: "a.png", size: 5, type: "image/png" });
    expect(r).toEqual({ error: "Invalid upload." });
  });
});

describe("attachToComment", () => {
  it("removes the object when the row insert fails", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "cm1", author_id: "u1", project_id: "8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11" } });
    single.mockResolvedValue({ data: null, error: { message: "rls" } });
    const path = "8f0e2f5e-6b8a-4d3b-9b1a-2a7c1d9e0f11/comments/0b9f4c1e-1111-4222-8333-444455556666/x-a.png";
    const r = await attachToComment("0b9f4c1e-1111-4222-8333-444455556666", { path, name: "a.png", size: 5, type: "image/png" });
    expect(r.error).toBe("Couldn't attach that file.");
    expect(removeObject).toHaveBeenCalledWith(path);
  });
});
```

Add to `tests/unit/admin-actions.test.ts`:
- `publishVersion` calls `rpc("publish_version", { p_deliverable_id, p_file_path, p_link_url, p_notes })`, and maps `file_required` to "Attach a file or link first."
- `setRevisionLimit` rejects `"0"` and `"51"`, accepts `""` as null, and updates `deliverables.revision_limit`.
- `createDeliverable` inserts a deliverable, then a `deliverable_versions` row `{ number: 1, status: 'draft' }`, then sets `current_version_id`.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/comment-actions.test.ts tests/unit/admin-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the portal actions**

```ts
// src/app/portal/actions.ts — add
import { parseComment, validateAttachment, versionErrorMessage } from "@/lib/revisions";
import { buildStoragePath, createSignedUpload, removeObject } from "@/lib/storage";

export async function decideVersion(versionId: string, deliverableId: string, _prev: PortalResult, form: FormData): Promise<PortalResult> {
  await requireClient();
  const parsed = parseDecision(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_version", { p_version_id: versionId, p_decision: parsed.decision, p_note: parsed.feedback });
  if (error) return { error: versionErrorMessage(error.message) };
  await Promise.allSettled([postDecisionToClickUp(deliverableId), notifyAdminDecision(deliverableId)]);
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  revalidatePath("/portal");
  return { error: null, message: parsed.decision === "approved" ? "Approved. Thank you!" : "Got it. We'll make those changes." };
}

export async function addComment(versionId: string, deliverableId: string, _prev: PortalResult & { commentId?: string }, form: FormData) {
  const viewer = await requireClient();
  const parsed = parseComment(form);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverable_comments").insert({
    version_id: versionId, author_id: viewer.userId, author_role: "client", body: parsed.body,
    pin_x: parsed.pin?.x ?? null, pin_y: parsed.pin?.y ?? null,
  }).select("id").single();
  if (error || !data) return { error: "Couldn't post that. Please try again." };
  revalidatePath(`/portal/deliverables/${deliverableId}`);
  return { error: null, commentId: data.id as string };
}

async function ownedComment(commentId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("deliverable_comments")
    .select("id, author_id, version:deliverable_versions(deliverable:deliverables(project_id))").eq("id", commentId).maybeSingle();
  if (!data || data.author_id !== userId) return null;
  const projectId = (data as any).project_id ?? (data as any).version?.deliverable?.project_id;
  return projectId ? { projectId: projectId as string } : null;
}

export async function createCommentUpload(commentId: string, file: { name: string; size: number; type: string }) {
  const viewer = await requireClient();
  const bad = validateAttachment(file);
  if (bad) return { error: bad };
  const owned = await ownedComment(commentId, viewer.userId);
  if (!owned) return { error: "Invalid upload." };
  return createSignedUpload(buildStoragePath(owned.projectId, file.name, "comments", undefined, commentId));
}

export async function attachToComment(commentId: string, file: { path: string; name: string; size: number; type: string }) {
  const viewer = await requireClient();
  const bad = validateAttachment(file);
  const owned = await ownedComment(commentId, viewer.userId);
  if (bad || !owned || !file.path.startsWith(`${owned.projectId}/comments/${commentId}/`)) return { error: bad ?? "Invalid upload." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("comment_attachments")
    .insert({ comment_id: commentId, storage_path: file.path, name: file.name, size_bytes: file.size, mime_type: file.type }).select("id").single();
  if (error || !data) {
    await removeObject(file.path).catch(() => undefined);
    return { error: "Couldn't attach that file." };
  }
  return { error: null };
}
```

The test mock returns `project_id` flat, while the real query nests it. `ownedComment` reads both shapes.

- [ ] **Step 4: Implement the admin actions** in `src/app/admin/project-actions.ts`:
  - `createDeliverable`: after the insert, `.select("id").single()`. Then insert a `deliverable_versions` row `{ deliverable_id, number: 1, status: "draft", file_path, link_url, created_by }`, then update `deliverables.current_version_id`.
  - `attachDeliverableFile`: update `deliverable_versions` where `id = current_version_id` and `status = 'draft'`.
  - `publishVersion`: parse `file_path` (it must pass `pathBelongs(projectId, path, "deliverables")`), `link_url` (via `z.url()`) and `notes` (max 5000). Call the RPC. Map `file_required` to "Attach a file or link first." and anything else to "Couldn't send it." Then `notifyClientDeliverablePublished(id)` and `refresh(projectId)` plus `revalidatePath(`/admin/deliverables/${id}`)`.
  - `publishDeliverable(id)`: `return publishVersion(id, { error: null }, new FormData())`.
  - `setRevisionLimit`: `z.union([z.literal(""), z.coerce.number().int().min(1).max(50)])`.
  - `addAdminComment`: the same as `addComment`, but with `requireAdmin()` and `author_role: "admin"`. Admins also attach files through the existing `createAdminUpload` with kind `"comments"`, so extend `createAdminUpload` and `pathBelongs` to accept `"comments"` with a `commentId`.
  - `deleteDeliverable`: before the delete, select all version `file_path`s and `removeObject` each one after the delete succeeds.

  Update `src/lib/email/notify.ts` `loadDeliverable` to select `current_version:deliverable_versions!deliverables_current_version_id_fkey(number, file_path, link_url)` instead of the legacy columns, and include `v{number}` in the client email subject when the number is greater than 1.

- [ ] **Step 5: Run and confirm it passes**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app src/lib tests/unit
git commit -m "feat: version decisions, comments and attachment server actions"
```

---

### Task 8: Deliverable UI components

**Files:**
- Create: `src/components/deliverables/version-tabs.tsx`, `comment-thread.tsx`, `comment-composer.tsx`, `pin-layer.tsx`, `decision-bar.tsx`, `deliverable-workspace.tsx`
- Test: `tests/unit/deliverable-components.test.tsx`

**Interfaces:**
- Consumes: `DeliverableThread` (Task 6), the actions (Task 7), `revisionLabel`, `pinFromClick` and `isImagePath` (Task 5).
- Produces:

```tsx
export function DeliverableWorkspace(props: {
  thread: DeliverableThread;
  fileUrls: Record<string, string | null>;          // version_id -> signed URL
  attachmentUrls: Record<string, string | null>;    // attachment_id -> signed URL
  role: "client" | "admin";
  readOnly: boolean;
  selectedVersionId?: string;                        // from ?v= search param; defaults to current
  actions: {
    addComment: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; commentId?: string }>;
    createUpload: (commentId: string, file: { name: string; size: number; type: string }) => Promise<{ error: string } | { path: string; token: string }>;
    attach: (commentId: string, file: { path: string; name: string; size: number; type: string }) => Promise<{ error: string | null }>;
    decide?: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; message?: string }>;
  } | null;                                          // null when readOnly
}): JSX.Element;
```

- [ ] **Step 1: Write the failing render tests.** First check that `tests/unit` already has a React/DOM environment. If `@testing-library/react` isn't installed, use `react-dom/server`'s `renderToStaticMarkup`, which needs no new dependency.

```tsx
// tests/unit/deliverable-components.test.tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommentThread } from "@/components/deliverables/comment-thread";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";

const base = {
  deliverable: { id: "d1", project_id: "p1", title: "Logo", description: null, status: "awaiting_approval", current_version_id: "v2", revision_limit: 1,
    project: { id: "p1", name: "Site", client_id: "c1" } },
  versions: [
    { id: "v1", deliverable_id: "d1", number: 1, file_path: "p1/deliverables/a.png", link_url: null, notes: null, status: "changes_requested", published_at: "2026-10-01", decided_at: "2026-10-02", decided_by: "u1", created_at: "2026-10-01" },
    { id: "v2", deliverable_id: "d1", number: 2, file_path: "p1/deliverables/b.png", link_url: null, notes: "Bluer", status: "awaiting_approval", published_at: "2026-10-03", decided_at: null, decided_by: null, created_at: "2026-10-03" },
  ],
  comments: { v1: [{ id: "c1", version_id: "v1", author_id: "u1", author_role: "client", body: "<script>x</script>\nline2", kind: "decision", pin_x: null, pin_y: null, created_at: "2026-10-02", attachments: [] }], v2: [] },
  names: { u1: "Dana" },
} as any;

describe("CommentThread", () => {
  it("escapes HTML and keeps line breaks", () => {
    const html = renderToStaticMarkup(<CommentThread comments={base.comments.v1} names={base.names} attachmentUrls={{}} viewerRole="client" />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toMatch(/whitespace-pre-wrap/);
    expect(html).toContain("Requested changes");
  });
});

describe("DeliverableWorkspace", () => {
  it("readOnly hides composer and decision bar", () => {
    const html = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly actions={null} />);
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Post comment");
    expect(html).toContain("Over limit (2 of 1)");
  });
  it("client sees decision bar only on current awaiting version", () => {
    const cur = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly={false} actions={{} as any} />);
    expect(cur).toContain("Approve");
    const old = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="client" readOnly={false} actions={{} as any} selectedVersionId="v1" />);
    expect(old).not.toContain("Approve");
    expect(old).toContain("Post comment");
  });
  it("admin never sees the decision bar", () => {
    const html = renderToStaticMarkup(<DeliverableWorkspace thread={base} fileUrls={{}} attachmentUrls={{}} role="admin" readOnly={false} actions={{} as any} />);
    expect(html).not.toContain("Approve");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/deliverable-components.test.tsx`
Expected: FAIL (module not found). If vitest does not transform `.tsx`, add `esbuild: { jsx: "automatic" }` to `vitest.config.ts`.

- [ ] **Step 3: Implement the components.** Use the existing `src/components/ui.tsx` primitives (buttons, cards) and Tailwind classes that match `src/components/portal/views.tsx`.

```tsx
// src/components/deliverables/version-tabs.tsx
import Link from "next/link";
import type { VersionRow } from "@/lib/types";

const STATUS: Record<string, string> = { draft: "Draft", awaiting_approval: "Awaiting approval", approved: "Approved", changes_requested: "Changes requested" };

export function VersionTabs({ versions, selectedId, hrefFor }: { versions: VersionRow[]; selectedId: string; hrefFor: (id: string) => string }) {
  return (
    <nav aria-label="Versions" className="flex flex-wrap gap-2">
      {versions.map((v) => (
        <Link key={v.id} href={hrefFor(v.id)} aria-current={v.id === selectedId ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${v.id === selectedId ? "border-ink bg-ink text-white" : "border-line"}`}>
          v{v.number} · {STATUS[v.status]}
        </Link>
      ))}
    </nav>
  );
}
```

```tsx
// src/components/deliverables/comment-thread.tsx
import type { CommentRow } from "@/lib/types";

export function authorName(c: CommentRow, names: Record<string, string>, viewerRole: "client" | "admin") {
  if (c.author_role === "admin") return c.author_id && names[c.author_id] && viewerRole === "admin" ? names[c.author_id] : "Carson";
  return (c.author_id && names[c.author_id]) || "Client";
}

export function CommentThread({ comments, names, attachmentUrls, viewerRole }: {
  comments: CommentRow[]; names: Record<string, string>; attachmentUrls: Record<string, string | null>; viewerRole: "client" | "admin";
}) {
  if (!comments.length) return <p className="text-sm text-muted">No comments yet.</p>;
  let pin = 0;
  return (
    <ol className="space-y-4">
      {comments.map((c) => {
        const pinNo = c.pin_x != null ? ++pin : null;
        return (
          <li key={c.id} id={`comment-${c.id}`} className="rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 text-sm">
              {pinNo && <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-xs text-white">{pinNo}</span>}
              <strong>{authorName(c, names, viewerRole)}</strong>
              {c.kind === "decision" && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Requested changes</span>}
              <time className="text-muted" dateTime={c.created_at}>{new Date(c.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
            {c.attachments.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {c.attachments.map((a) => (
                  <li key={a.id}>{attachmentUrls[a.id] ? <a className="underline" href={attachmentUrls[a.id]!}>{a.name}</a> : a.name}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

```tsx
// src/components/deliverables/pin-layer.tsx
"use client";
import { pinFromClick } from "@/lib/revisions";
import type { CommentRow } from "@/lib/types";

export function PinLayer({ src, alt, comments, onPick, picked }: {
  src: string; alt: string; comments: CommentRow[]; onPick: ((p: { x: number; y: number }) => void) | null; picked: { x: number; y: number } | null;
}) {
  const pins = comments.filter((c) => c.pin_x != null);
  return (
    <div className="relative inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`max-h-[70vh] max-w-full ${onPick ? "cursor-crosshair" : ""}`}
        onClick={onPick ? (e) => onPick(pinFromClick(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())) : undefined} />
      {pins.map((c, i) => (
        <a key={c.id} href={`#comment-${c.id}`} aria-label={`Pin ${i + 1}`}
          className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-xs text-white ring-2 ring-white"
          style={{ left: `${c.pin_x}%`, top: `${c.pin_y}%` }}>{i + 1}</a>
      ))}
      {picked && <span aria-hidden className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white/70"
        style={{ left: `${picked.x}%`, top: `${picked.y}%` }} />}
    </div>
  );
}
```

```tsx
// src/components/deliverables/comment-composer.tsx
"use client";
import { useActionState, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { BUCKET_NAME } from "@/lib/storage-public";

type Actions = NonNullable<import("./deliverable-workspace").WorkspaceActions>;

export function CommentComposer({ versionId, deliverableId, actions, pin, clearPin }: {
  versionId: string; deliverableId: string; actions: Actions; pin: { x: number; y: number } | null; clearPin: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, submit, pending] = useActionState(async (prev: { error: string | null }, form: FormData) => {
    const r = await actions.addComment(versionId, deliverableId, prev, form);
    if (r.error || !r.commentId) return r;
    for (const file of Array.from(fileRef.current?.files ?? [])) {
      const meta = { name: file.name, size: file.size, type: file.type };
      const signed = await actions.createUpload(r.commentId, meta);
      if ("error" in signed) { setUploadError(signed.error); continue; }
      const { error } = await createClient().storage.from(BUCKET_NAME).uploadToSignedUrl(signed.path, signed.token, file);
      if (error) { setUploadError("Upload failed. Your comment was posted without the file."); continue; }
      const a = await actions.attach(r.commentId, { path: signed.path, ...meta });
      if (a.error) setUploadError(a.error);
    }
    clearPin();
    return { error: null };
  }, { error: null });

  return (
    <form action={submit} className="space-y-2">
      {pin && <><input type="hidden" name="pin_x" value={pin.x} /><input type="hidden" name="pin_y" value={pin.y} />
        <p className="text-sm">Commenting on a spot in the image. <button type="button" className="underline" onClick={clearPin}>Remove pin</button></p></>}
      <label className="sr-only" htmlFor={`body-${versionId}`}>Comment</label>
      <textarea id={`body-${versionId}`} name="body" required maxLength={5000} rows={3} className="w-full rounded border border-line p-2" />
      <input ref={fileRef} type="file" multiple aria-label="Attach files"
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
      {(state.error || uploadError) && <p role="alert" className="text-sm text-red-700">{state.error ?? uploadError}</p>}
      <button type="submit" disabled={pending} className="btn-primary">{pending ? "Posting…" : "Post comment"}</button>
    </form>
  );
}
```

Before writing the composer, check how `src/components/file-uploader.tsx` does browser uploads and reuse its client/bucket import. If it uses a different helper, match it and drop the `storage-public` import above.

```tsx
// src/components/deliverables/decision-bar.tsx
"use client";
import { useActionState, useState } from "react";

export function DecisionBar({ versionId, deliverableId, decide }: {
  versionId: string; deliverableId: string;
  decide: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; message?: string }>;
}) {
  const [changes, setChanges] = useState(false);
  const [state, submit, pending] = useActionState((prev: any, form: FormData) => decide(versionId, deliverableId, prev, form), { error: null });
  if (state.message) return <p role="status" className="rounded bg-green-50 p-3">{state.message}</p>;
  return (
    <form action={submit} className="space-y-2 rounded-lg border border-line p-3">
      {changes && <><label htmlFor="feedback" className="text-sm font-medium">What should change?</label>
        <textarea id="feedback" name="feedback" required maxLength={5000} rows={3} className="w-full rounded border border-line p-2" /></>}
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        {!changes && <button name="decision" value="approved" disabled={pending} className="btn-primary">Approve</button>}
        {changes
          ? <><button name="decision" value="changes_requested" disabled={pending} className="btn-primary">Send changes</button>
              <button type="button" onClick={() => setChanges(false)} className="btn-secondary">Cancel</button></>
          : <button type="button" onClick={() => setChanges(true)} className="btn-secondary">Request changes</button>}
      </div>
    </form>
  );
}
```

```tsx
// src/components/deliverables/deliverable-workspace.tsx
"use client";
import { useState } from "react";
import type { DeliverableThread } from "@/lib/portal-data";
import { isImagePath, revisionLabel } from "@/lib/revisions";
import { CommentComposer } from "./comment-composer";
import { CommentThread } from "./comment-thread";
import { DecisionBar } from "./decision-bar";
import { PinLayer } from "./pin-layer";
import { VersionTabs } from "./version-tabs";

export type WorkspaceActions = {
  addComment: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; commentId?: string }>;
  createUpload: (commentId: string, file: { name: string; size: number; type: string }) => Promise<{ error: string } | { path: string; token: string }>;
  attach: (commentId: string, file: { path: string; name: string; size: number; type: string }) => Promise<{ error: string | null }>;
  decide?: (versionId: string, deliverableId: string, prev: any, form: FormData) => Promise<{ error: string | null; message?: string }>;
} | null;

export function DeliverableWorkspace({ thread, fileUrls, attachmentUrls, role, readOnly, selectedVersionId, actions, hrefFor = (id) => `?v=${id}` }: {
  thread: DeliverableThread; fileUrls: Record<string, string | null>; attachmentUrls: Record<string, string | null>;
  role: "client" | "admin"; readOnly: boolean; selectedVersionId?: string; actions: WorkspaceActions; hrefFor?: (id: string) => string;
}) {
  const { deliverable: d, versions, comments, names } = thread;
  const current = versions.find((v) => v.id === d.current_version_id) ?? versions[versions.length - 1];
  const selected = versions.find((v) => v.id === selectedVersionId) ?? current;
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const label = revisionLabel(current.number, d.revision_limit);
  const url = fileUrls[selected.id] ?? null;
  const canWrite = !readOnly && !!actions;
  const decider = selected.decided_by ? names[selected.decided_by] ?? "the client" : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className={`text-sm font-medium ${label.over ? "text-amber-700" : "text-muted"}`}>{label.text}</p>
        {versions.length > 1 && <VersionTabs versions={versions} selectedId={selected.id} hrefFor={hrefFor} />}
      </header>

      <section aria-label={`Version ${selected.number}`} className="space-y-3">
        {selected.notes && <p className="whitespace-pre-wrap">{selected.notes}</p>}
        {url && isImagePath(selected.file_path)
          ? <PinLayer src={url} alt={`${d.title} v${selected.number}`} comments={comments[selected.id] ?? []}
              onPick={canWrite ? setPin : null} picked={pin} />
          : url ? <a className="underline" href={url}>Download v{selected.number}</a> : null}
        {selected.link_url && <a className="underline" href={selected.link_url} rel="noopener noreferrer" target="_blank">Open link</a>}
        {selected.status === "approved" && selected.decided_at &&
          <p className="text-sm text-green-800">Approved v{selected.number} on {new Date(selected.decided_at).toLocaleDateString("en-US", { dateStyle: "medium" })}{decider ? ` by ${decider}` : ""}</p>}
      </section>

      {canWrite && role === "client" && actions!.decide && selected.id === current.id && selected.status === "awaiting_approval" &&
        <DecisionBar versionId={selected.id} deliverableId={d.id} decide={actions!.decide} />}

      <section aria-label="Comments" className="space-y-4">
        <h2 className="text-lg font-semibold">Comments on v{selected.number}</h2>
        <CommentThread comments={comments[selected.id] ?? []} names={names} attachmentUrls={attachmentUrls} viewerRole={role} />
        {canWrite && <CommentComposer versionId={selected.id} deliverableId={d.id} actions={actions!} pin={pin} clearPin={() => setPin(null)} />}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/unit/deliverable-components.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/deliverables tests/unit/deliverable-components.test.tsx vitest.config.ts
git commit -m "feat: deliverable workspace, comment thread, pins, decision bar"
```

---

### Task 9: Pages — portal, preview, admin deliverable, activity card

**Files:**
- Modify: `src/app/portal/deliverables/[id]/page.tsx`, `src/app/admin/clients/[id]/preview/deliverables/[deliverableId]/page.tsx`, `src/app/admin/clients/[id]/page.tsx`, `src/app/admin/projects/[id]/page.tsx` (link each deliverable to `/admin/deliverables/[id]`)
- Create: `src/app/admin/deliverables/[id]/page.tsx`, `src/app/admin/deliverables/[id]/admin-controls.tsx`, `src/app/admin/clients/[id]/activity-card.tsx`, `src/app/admin/activity-actions.ts`, `src/lib/deliverable-urls.ts`
- Remove: `PortalDeliverableView` from `src/components/portal/views.tsx` and `src/components/portal/decision-form.tsx`, once no longer imported.
- Test: `tests/unit/deliverable-urls.test.ts`

**Interfaces:**
- Produces:
  - `signThreadUrls(thread: DeliverableThread): Promise<{ fileUrls: Record<string, string | null>; attachmentUrls: Record<string, string | null> }>` in `src/lib/deliverable-urls.ts`. It calls `signedDownloadUrl` for each version `file_path` and attachment `storage_path`.
  - `loadMoreActivity(clientId: string, before: string)`, a server action that does `requireAdmin` then `loadClientActivity`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/deliverable-urls.test.ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/storage", () => ({ signedDownloadUrl: vi.fn(async (p: string) => `signed:${p}`) }));
const { signThreadUrls } = await import("@/lib/deliverable-urls");

describe("signThreadUrls", () => {
  it("signs version files and attachments, null for links", async () => {
    const r = await signThreadUrls({
      versions: [{ id: "v1", file_path: "p/a.png" }, { id: "v2", file_path: null, link_url: "https://x" }],
      comments: { v1: [{ attachments: [{ id: "a1", storage_path: "p/comments/c/x.pdf" }] }], v2: [] },
    } as any);
    expect(r).toEqual({ fileUrls: { v1: "signed:p/a.png", v2: null }, attachmentUrls: { a1: "signed:p/comments/c/x.pdf" } });
  });
});
```

- [ ] **Step 2: Run and confirm failure**, then implement:

```ts
// src/lib/deliverable-urls.ts
import "server-only";
import type { DeliverableThread } from "@/lib/portal-data";
import { signedDownloadUrl } from "@/lib/storage";

export async function signThreadUrls(t: Pick<DeliverableThread, "versions" | "comments">) {
  const fileEntries = await Promise.all(t.versions.map(async (v) => [v.id, v.file_path ? await signedDownloadUrl(v.file_path) : null] as const));
  const atts = Object.values(t.comments).flat().flatMap((c) => c.attachments);
  const attEntries = await Promise.all(atts.map(async (a) => [a.id, await signedDownloadUrl(a.storage_path)] as const));
  return { fileUrls: Object.fromEntries(fileEntries), attachmentUrls: Object.fromEntries(attEntries) };
}
```

- [ ] **Step 3: Wire the pages**

```tsx
// src/app/portal/deliverables/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadPortalDeliverable } from "@/lib/portal-data";
import { signThreadUrls } from "@/lib/deliverable-urls";
import { DeliverableWorkspace } from "@/components/deliverables/deliverable-workspace";
import { addComment, attachToComment, createCommentUpload, decideVersion } from "../../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const viewer = await requireClient();
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const thread = await loadPortalDeliverable(await createClient(), viewer.clientId, id);
  if (!thread) notFound();
  const urls = await signThreadUrls(thread);
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">{thread.deliverable.title}</h1>
      <p className="text-muted">{thread.deliverable.project.name}</p>
      <DeliverableWorkspace thread={thread} {...urls} role="client" readOnly={false} selectedVersionId={v}
        actions={{ addComment, createUpload: createCommentUpload, attach: attachToComment, decide: decideVersion }} />
    </main>
  );
}
```

The preview page uses the same layout under the existing `PreviewBanner`. It loads with `createAdminClient()` through `loadPortalDeliverable(db, clientId, deliverableId)` (Preview already does this for other views; keep its loader/db choice) and renders `readOnly actions={null}` with `hrefFor={(vid) => `?v=${vid}`}`.

`src/app/admin/deliverables/[id]/page.tsx` does the following:
- `requireAdmin()`, then `loadDeliverableThread(await createClient(), id, { includeDrafts: true })` (`notFound` if null), then `signThreadUrls`.
- Header: title, project link, revision label, and `AdminControls`.
- `DeliverableWorkspace` with `role="admin"`, `readOnly={false}`, and actions `{ addComment: addAdminComment, createUpload: createAdminCommentUpload, attach: attachAdminComment }` with no `decide`. Add the two admin attachment actions in `project-actions.ts`, mirroring the portal ones but using `requireAdmin` and no ownership check beyond the comment existing.

`admin-controls.tsx` is a client component with three parts:
- A revision limit form that calls `setRevisionLimit`.
- An "Upload new version" form that reuses `src/components/file-uploader.tsx` with kind `"deliverables"`, plus a link field, a notes textarea, and a submit to `publishVersion`. It is shown expanded when `status === 'changes_requested'` or the current version is a draft, and inside a `<details>` "⋯ More" element otherwise.
- An amber "Over revision limit" badge when `revisionLabel(...).over` is true.

`activity-card.tsx` is a server component that receives `{ rows, nextBefore, clientId }` and renders a list with an icon per type. Icons: 📤 published, ✅ approved, ✏️ changes, 💬 comment, as `aria-hidden` spans with the type label in sr-only text. Each item shows its summary and a relative time. The link goes to `/admin/deliverables/<deliverable id>`: resolve it for `deliverable_versions` refs with a single batch query in the loader, `select id, deliverable_id from deliverable_versions where id in (...)`, and for comments through `deliverable_comments → version`. Add the resolution to `loadClientActivity` as `href: string | null` on each row. A "Load more" client button calls `loadMoreActivity(clientId, nextBefore)` and appends the results.

Mount it on `src/app/admin/clients/[id]/page.tsx` below the existing cards, using `loadClientActivity(await createClient(), id)`.

- [ ] **Step 4: Run all checks**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Manual smoke test** (local dev with the local Supabase, or the preview env if that's how the repo runs):
  - Admin: create a deliverable → attach an image → publish (v1). As the client, request changes with a note. As admin, upload v2. As the client, see v1 and v2 tabs, pin a comment on v2 with a PNG attachment, then approve v2.
  - Preview shows all of it with no composer or buttons.
  - The admin client page shows 5+ activity rows.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: deliverable workspace pages, admin deliverable page, activity card"
```

---

### Task 10: Digest sections and legacy column drop

**Files:**
- Modify: `src/lib/email/digest-loader.ts`, `src/lib/email/templates.ts`, `src/lib/types.ts`, plus any remaining reader of the legacy columns
- Create: `supabase/migrations/0009_drop_legacy_deliverable_columns.sql`
- Test: `tests/unit/digest.test.ts`, `tests/unit/email-templates.test.ts` (append), `tests/db/revisions.test.ts` (append)

**Interfaces:**
- Produces: `DigestContent.comments: { deliverableId: string; title: string; project: string; count: number }[]`. These are comments by admins in the last 7 days on visible versions. `awaiting` items gain `version: number`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/email-templates.test.ts — append
it("renders New comments and version numbers", () => {
  const { html, text } = digestEmail({
    clientName: "A", updates: [], statusChanges: [], dueSoon: [],
    awaiting: [{ id: "d1", title: "Logo", project: "Site", version: 2 }],
    comments: [{ deliverableId: "d1", title: "Logo", project: "Site", count: 3 }],
  }, "https://app");
  expect(html).toContain("Logo v2");
  expect(text).toContain("New comments");
  expect(text).toContain("Logo (Site): 3 new");
});
```

```ts
// tests/unit/digest.test.ts — append
it("is not empty when only comments exist", () => {
  expect(isDigestEmpty({ clientName: "A", updates: [], awaiting: [], statusChanges: [], dueSoon: [], comments: [{ deliverableId: "d", title: "t", project: "p", count: 1 }] })).toBe(false);
});
```

```ts
// tests/db/revisions.test.ts — append (runs after 0009 because createDb applies all)
describe("legacy columns", () => {
  it("are dropped", async () => {
    const r = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'deliverables' and column_name in ('client_feedback','file_path','link_url','decided_at','decided_by')");
    expect(r.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/unit/email-templates.test.ts tests/unit/digest.test.ts tests/db/revisions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**
  - `templates.ts`:
    - add `comments` to `DigestContent` and `version` to the `awaiting` items
    - render `${a.title} v${a.version}` in "Waiting on you"
    - add `section("New comments", c.comments, html → linked title · project · "N new", text → `${title} (${project}): ${count} new`)` after "Waiting on you"
  - `digest.ts`: add `c.comments.length` to `isDigestEmpty`.
  - `digest-loader.ts`:
    - "awaiting" now selects `id, title, project_id, current_version:deliverable_versions!deliverables_current_version_id_fkey(number)`
    - new query: `deliverable_comments` with `author_role = 'admin'`, `kind = 'comment'`, `created_at >= weekAgo`, joined `version:deliverable_versions!inner(status, deliverable:deliverables!inner(id, title, project_id))`, filtered to `project_id in ids` and `status != 'draft'`
    - group by deliverable into counts
    - add the query to the error-check loop with the label `"comments"`
  - Migration:

```sql
-- supabase/migrations/0009_drop_legacy_deliverable_columns.sql
-- Release 3a: file, link and decision now live on deliverable_versions.
alter table public.deliverables
  drop column file_path,
  drop column link_url,
  drop column client_feedback,
  drop column decided_at,
  drop column decided_by;
```

  - `types.ts`: remove those fields from `DeliverableRow`.
  - Then `grep -rn "client_feedback\|\.file_path\|link_url\|decided_at\|decided_by" src`. Every remaining hit must be on a version row, a file row or a time entry, never on a deliverable. Check `src/app/admin/page.tsx`, `src/app/admin/projects/[id]/forms.tsx`, `src/app/admin/deliverable-form.ts` (form fields now feed the v1 draft) and `src/lib/clickup` (decision post: read the decision note from the latest `decision` comment on the current version).

- [ ] **Step 4: Run all checks**

Run: `npm run typecheck && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_drop_legacy_deliverable_columns.sql src tests
git commit -m "feat: digest comments section; drop legacy deliverable columns"
```

---

### Task 11: Production rollout (gated on Carson)

- [ ] **Step 1:** Run `npm run typecheck && npm test && npm run build`, then run the final whole-branch review.
- [ ] **Step 2: Ask Carson** before touching production. Then:
  - Back up with Supabase `execute_sql`: `create table backup_deliverables_20261010 as table public.deliverables;`
  - Apply `0008_revisions` and then `0009_drop_legacy_deliverable_columns` with `apply_migration`.
  - Run `get_advisors` (security) and fix any new warnings.
- [ ] **Step 3:** Verify with SQL that `select count(*) from deliverables where current_version_id is null` returns 0, and that the comment count equals the old count of non-empty `client_feedback` values in the backup table.
- [ ] **Step 4: Ask Carson** before deploying. Deploy to Vercel, then confirm the production alias points at the new deployment. The last round's alias did not update; check it explicitly.
- [ ] **Step 5:** Smoke test in production:
  - An existing deliverable shows v1 with its migrated feedback.
  - Preview renders read-only.
  - The admin client page shows Activity.
- [ ] **Step 6:** Tell Carson when to drop `backup_deliverables_20261010`, after a week with no issues.
